// TargetOS V2 — Offer For Sale of Real Estate
// Matches the Target Team / KW Valley Realty offer form exactly.
// Features:
// - Digital version of the official offer sheet
// - MLS lookup auto-fills address, MLS#, seller name, agent, company
// - Date auto-populated
// - Buyer auto-complete from contacts, saves new buyers to contacts
// - Attorney lookup from contacts (purchaser's + seller's)
// - Buyers agent: if secretary → dropdown of our agents; if agent → auto-fills
// - Purchase price breakdown with auto-calculation
// - Subject-to checkboxes
// - Commission field
// - In-house listing detection → saves to agent's My Listings
// - Per-agent offer history (agents see only their own)
// - Stats: total offers, accepted, per-client, conversion rate

import { BoardLinks } from '../components/BoardLinks'
import { authFetch } from '../lib/apiAuth'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFeature } from '../lib/features'
import { BulkEditBar } from '../components/BulkEditBar'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useOffers, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { OFFER_STATUSES } from '../lib/constants'
import { dedupeCanonicalAgents } from '../lib/utils'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import { computeOfferFinancials } from '../lib/offerCalc'
import { getConnectedEmailAccount } from '../lib/emailService'
import { identifierCodeFor, prepareRecordIdentifierDatabaseWrite } from '../lib/recordIdentifiers'
import AdminOfferReports from '../components/AdminOfferReports'
import { PolishWordingButton } from '../components/PolishWordingButton'
import { ContactSearch } from '../components/ContactSearch'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const offerStatusCode = value => identifierCodeFor('offers', 'status', value)
const dealStageCode = value => identifierCodeFor('deals', 'stage', value)
const S  = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }
const SL = { fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4, marginTop:10, display:'block' }

const BLANK = {
  // Property
  listing_addr:'', mls_number:'', off_market:false,
  // Buyer
  buyer_name:'', co_buyer_name:'', buyer_contact_id:'',
  buyer_phone:'', buyer_email:'', buyer_address:'',
  // Seller
  seller_name:'', co_seller_name:'', seller_contact_id:'', seller_email:'',
  seller_agent_name:'', seller_agent_company:'', sellers_agent_email:'',
  // Financials
  purchase_price:'', deposit:'', sellers_concession:'',
  net_to_seller:'', mortgage_amount:'', mortgage_pct:'',
  balance_at_closing:'', closing_days:'30',
  closing_mode:'days', closing_target_date:'', closing_custom_text:'', closing_qualifier:'on_or_about',
  // Subject to
  subject_attorney:true, subject_clear_title:true,
  subject_mortgage:false, subject_cash:false,
  subject_standard_inspection:true, subject_structural:false,
  // Parties
  buyers_agent_id:'', sellers_agent_name:'', commission_pct:'',
  // Attorneys
  purchaser_attorney_name:'', purchaser_attorney_address:'',
  purchaser_attorney_tel:'', purchaser_attorney_email:'', purchaser_attorney_contact_id:'',
  seller_attorney_name:'', seller_attorney_address:'',
  seller_attorney_tel:'', seller_attorney_email:'', seller_attorney_contact_id:'',
  // Meta
  additional_terms:'', notes:'', status:'Draft',
  offer_date: new Date().toISOString().slice(0,10),
  offer_url:'', pof_url:'',
  // Legacy
  side:'Buyer', production:'', gci:'',
}

// ── CONTACT SEARCH DROPDOWN ───────────────────────────────────────

// ── FILE UPLOADER ─────────────────────────────────────────────────
function FileUploader({ label, fileUrl, onUploaded, folder }) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef(null)
  const { toast } = useApp()

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = folder + '/' + Date.now() + '.' + ext
      const { error } = await supabase.storage.from('offer-docs').upload(path, file, { upsert:true })
      if (error) throw error
      const { data } = supabase.storage.from('offer-docs').getPublicUrl(path)
      onUploaded(data.publicUrl)
    } catch(e) { toast('Upload failed: ' + e.message, '#DC2626') }
    finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <label style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 12px', borderRadius:8, border:'1.5px dashed '+(fileUrl?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)', flex:1 }}>
          <input ref={ref} type="file" accept="application/pdf,image/*" onChange={handleFile} style={{ display:'none' }} />
          <span style={{ fontSize:16 }}>{fileUrl ? '✅' : '📎'}</span>
          <span style={{ fontSize:12, color:'var(--muted)' }}>{uploading ? 'Uploading...' : fileUrl ? 'Uploaded ✓' : 'Click to upload'}</span>
        </label>
        {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', color:'#3B82F6', fontSize:12, fontWeight:700, textDecoration:'none' }}>View 📄</a>}
      </div>
    </div>
  )
}

// ── AGENT STATS CARD ──────────────────────────────────────────────
function AgentStatsCard({ ag, agentOffers, onFilter, isActive }) {
  const total    = agentOffers.length
  const accepted = agentOffers.filter(o => offerStatusCode(o) === 'accepted').length
  const pending  = agentOffers.filter(o => ['sent', 'negotiating'].includes(offerStatusCode(o))).length
  const convRate = total > 0 ? Math.round(accepted / total * 100) : 0
  // Unique buyers per agent
  // uniqueBuyers intentionally removed from the header display per
  // owner feedback ("remove the secondary buyers count ... unless it
  // represents a clearly required offer metric" — it doesn't; total/
  // accepted/pending/conversion are the required set). Left the
  // computation itself out entirely rather than computing an unused
  // value.

  return (
    <div onClick={() => onFilter(ag.id)}
      style={{ background:'var(--panel)', borderRadius:12, border:'2px solid '+(isActive?'#CC2200':'var(--border)'), padding:'14px 16px', cursor:'pointer', transition:'all .15s' }}
      onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.borderColor='rgba(204,34,0,.4)' }}
      onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.borderColor='var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <div style={{ width:38, height:38, borderRadius:'50%', background:ag.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
          {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ag.name}</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{total} offers</div>
        </div>
        {isActive && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'rgba(204,34,0,.1)', color:'#CC2200', fontWeight:700 }}>Filtered</span>}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          { label:'Total',    value:total,    color:'var(--text)',  bg:'var(--dim)' },
          { label:'Accepted', value:accepted, color:'#10B981',     bg:'rgba(16,185,129,.08)' },
          { label:'Pending',  value:pending,  color:'#F5A623',     bg:'rgba(245,166,35,.08)' },
          { label:'Conv %',   value:convRate+'%', color:convRate>=50?'#10B981':'#CC2200', bg: convRate>=50?'rgba(16,185,129,.06)':'rgba(204,34,0,.06)' },
        ].map(s => (
          <div key={s.label} style={{ textAlign:'center', padding:'8px', background:s.bg, borderRadius:8 }}>
            <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────────
export function OffersV2() {
  const navigate  = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const [bulkIds, setBulkIds] = useState([])
  const toggleBulk = id => setBulkIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const canBulkEdit = useFeature('bulk_edit', agent)
  usePageView('offers')
  const { toast } = useApp()

  // Agents only see their own offers
  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { offers, loading, add, update, remove, refetch } = useOffers(filters)
  const { agents } = useAgents()
  // Bucket/selector display uses the deduplicated canonical list (e.g.
  // collapses a stale "Yanky" row into the real, Auth-linked "Yanky
  // Lichtenstein" row) — nothing is deleted or deactivated in the
  // database; `agents` itself stays the full list for resolving
  // historical agent_id references correctly even if a record is a
  // known duplicate.
  const canonicalAgents = useMemo(() => dedupeCanonicalAgents(agents), [agents])

  const [search,     setSearch]     = useState('')
  const [statusF,    setStatusF]    = useState('')
  const [agentF,     setAgentF]     = useState('')
  const [view,       setView]       = useState('agents')
  const [selected,   setSelected]   = useState(null)
  const [form,       setForm]       = useState({ ...BLANK })
  const [saving,     setSaving]     = useState(false)
  const [downloading,setDownloading] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [tab,        setTab]        = useState('offer')
  const [listings,   setListings]   = useState([])
  const [mlsSearchQ, setMlsSearchQ] = useState('')
  const [mlsResults, setMlsResults] = useState([])
  const [mlsLoading, setMlsLoading] = useState(false)
  const [showMlsDrop,setShowMlsDrop]= useState(false)
  const mlsRef = useRef(null)

  useEffect(() => {
    supabase.from('listings').select('id,addr,mls_number,agent_id,status,list_price,agents(name)')
      .then(r => setListings(r.data || [])).catch(() => {})
  }, [])

  // Close MLS dropdown on outside click
  useEffect(() => {
    function close(e) { if (!mlsRef.current?.contains(e.target)) setShowMlsDrop(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Search SimplyRETS MLS by address or MLS#
  // ── MLS / LISTING LOOKUP (SimplyRETS) ───────────────────────────
  // NOT currently wired to any input — verified: searchMLS() has no
  // caller anywhere in this file, and its result state (mlsResults/
  // showMlsDrop) is never rendered. Left in place as a documented,
  // clearly-inert starting point for a real OneKey MLS/SimplyRETS
  // integration, NOT deleted, since removing it would erase groundwork
  // that may be intentional. Fixed here: the previous version silently
  // fell back to SimplyRETS's public demo/sandbox credentials
  // ('simplyrets'/'simplyrets') when the real env vars were unset —
  // meaning if this ever got wired up without real credentials
  // configured, an agent could be shown fabricated demo listings under
  // a live-looking UI. Now it fails safely: no configured credentials
  // means no external call, full stop. Real per-office search order
  // (TargetOS listings -> MLS -> Google fallback) is live today via
  // handleAddressSelect() on the Property Address field below, which
  // checks the already-loaded `listings` table before anything else.
  const searchMLS = useCallback(async (q) => {
    if (!q || q.length < 3) { setMlsResults([]); return }
    const MLS_USER = import.meta.env.VITE_SIMPLYRETS_USER
    const MLS_PASS = import.meta.env.VITE_SIMPLYRETS_PASS
    if (!MLS_USER || !MLS_PASS) {
      // Fail safely: no real credentials configured, so do not call out
      // to SimplyRETS's public demo account and present its sandbox
      // data as if it were live OneKey MLS results.
      setMlsResults([])
      return
    }
    setMlsLoading(true)
    try {
      const auth = btoa(MLS_USER + ':' + MLS_PASS)

      // Try by MLS# first, then by address keyword
      const isMLSNum = /^\d{5,}$/.test(q.trim())
      const url = isMLSNum
        ? 'https://api.simplyrets.com/listings?mlsId=' + encodeURIComponent(q.trim()) + '&limit=5'
        : 'https://api.simplyrets.com/listings?q=' + encodeURIComponent(q.trim()) + '&limit=8&status=Active,Pending'

      const res = await fetch(url, { headers: { Authorization: 'Basic ' + auth } })
      if (!res.ok) throw new Error('MLS search failed')
      const data = await res.json()
      setMlsResults(Array.isArray(data) ? data : [])
      setShowMlsDrop(true)
    } catch(e) {
      console.warn('MLS search:', e.message)
      setMlsResults([])
    } finally { setMlsLoading(false) }
  }, [])

  // Auto-fill form from MLS listing
  function applyMLSListing(mls) {
    const addr   = mls.address || {}
    const street = [addr.streetNumber, addr.streetName, addr.unit ? '#'+addr.unit : null].filter(Boolean).join(' ')
    const full   = [street, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ')
    const agentFirst = mls.agent?.firstName || ''
    const agentLast  = mls.agent?.lastName  || ''
    const agentName  = [agentFirst, agentLast].filter(Boolean).join(' ')
    const office     = mls.office?.name || mls.office?.officeName || ''

    // Check if in-house
    const inhouse = listings.find(l => l.mls_number === mls.mlsId || l.mls_number === String(mls.mlsId))

    setForm(f => ({
      ...f,
      listing_addr:         full,
      mls_number:           String(mls.mlsId || ''),
      seller_name:          mls.sellers?.map(s=>(s.firstName||'')+' '+(s.lastName||'')).join(', ') || f.seller_name,
      sellers_agent_name:   agentName || f.sellers_agent_name,
      seller_agent_company: office    || f.seller_agent_company,
      is_inhouse:           !!inhouse,
      inhouse_listing_id:   inhouse?.id || null,
    }))
    setMlsSearchQ(full)
    setShowMlsDrop(false)
    setMlsResults([])

    if (inhouse) toast('🏡 In-house listing — seller agent auto-filled')
    else toast('✅ MLS data imported: ' + full)
  }

  useEffect(() => {
    if (!urlId || urlId === 'new') return
    if (loading) return // wait for the board's own authorized list first
    const o = offers.find(x => x.id === urlId)
    if (o) { openOffer(o); return }

    // Direct-route protection: the id wasn't in this agent's own
    // authorized list. Rather than silently doing nothing (ambiguous —
    // is it missing, or not mine?), attempt one direct, RLS-scoped
    // fetch by id. If THAT also comes back empty (RLS denies it or it
    // truly doesn't exist), show an explicit not-authorized state and
    // return to the board, instead of leaving a dead URL with no
    // feedback. Server/database RLS is still the real enforcement —
    // this is the client-side experience layered on top of it, not a
    // substitute for it.
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.from('offers').select('*, agents(id,name,color)').eq('id', urlId).maybeSingle()
        if (cancelled) return
        if (error || !data) {
          toast('This offer does not exist, or you are not authorized to view it.', '#DC2626')
          navigate('/offers', { replace: true })
          return
        }
        openOffer(data)
      } catch {
        if (!cancelled) { toast('This offer does not exist, or you are not authorized to view it.', '#DC2626'); navigate('/offers', { replace: true }) }
      }
    })()
    return () => { cancelled = true }
  }, [urlId, offers.length, loading])

  function openOffer(o) {
    navigate('/offers/' + o.id, { replace:true })
    setSelected(o)
    setForm({ ...BLANK, ...o })
    setTab('offer')
  }
  function openAdd() {
    setSelected(null)
    const defaultAgentId = agentF && agentF !== 'none' ? agentF : (agent?.id || '')
    setForm({
      ...BLANK,
      agent_id: defaultAgentId,
      buyers_agent_id: defaultAgentId,
      offer_date: new Date().toISOString().slice(0,10),
    })
    navigate('/offers/new', { replace:true })
  }
  function closePanel() { setSelected(null); navigate('/offers', { replace:true }) }
  function set(k, v) { setForm(f => ({ ...f, [k]:v })) }

  // ── AUTO-CALCULATE financials ──────────────────────────────────
  // Decimal-safe (integer-cents) shared engine — see src/lib/offerCalc.js.
  // Same function is mirrored server-side in api/_lib/offerCalc.js and
  // must be re-run there before PDF generation/send, not trusted from
  // whatever the browser last computed.
  const [calcWarnings, setCalcWarnings] = useState([])
  const [calcBlocking, setCalcBlocking] = useState([])

  function recalc(updates) {
    setForm(prev => {
      const next = { ...prev, ...updates }
      const { values, warnings, blocking } = computeOfferFinancials(next)
      setCalcWarnings(warnings)
      setCalcBlocking(blocking)
      return {
        ...next,
        mortgage_amount:    values.mortgage_amount,
        mortgage_pct:       values.mortgage_pct,
        net_to_seller:      values.net_to_seller,
        balance_at_closing: values.balance_at_closing,
        production: next.purchase_price,
      }
    })
  }

  // ── MLS / LISTING LOOKUP ───────────────────────────────────────
  function handleAddressSelect(addr) {
    set('listing_addr', addr)
    // Check if it's an in-house listing
    const match = listings.find(l =>
      l.addr?.toLowerCase().includes(addr?.toLowerCase().slice(0,15)) ||
      addr?.toLowerCase().includes(l.addr?.toLowerCase().slice(0,15))
    )
    if (match) {
      setForm(f => ({
        ...f,
        listing_addr:         addr,
        mls_number:           match.mls_number || f.mls_number,
        sellers_agent_name:   match.agents?.name || f.sellers_agent_name,
        is_inhouse:           true,
        inhouse_listing_id:   match.id,
      }))
      toast('🏡 In-house listing detected — seller agent auto-filled')
    }
  }

  // ── BUYER CONTACT SELECT ───────────────────────────────────────
  async function selectBuyer(contact) {
    if (!contact) {
      // Save as new contact
      if (!form.buyer_name?.trim()) return
      try {
        const [first, ...rest] = form.buyer_name.trim().split(' ')
        const data = await db.contacts.create({
          first_name: first, last_name: rest.join(' '),
          phone: form.buyer_phone || null,
          email: form.buyer_email || null,
          address: form.buyer_address || null,
          status: 'Active', source: 'Offer', type: 'Buyer',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
        if (data) {
          set('buyer_contact_id', data.id)
          toast('✅ Buyer saved to Contacts')
        }
      } catch(e) {
        if (e.existingContact) {
          toast('Already exists as ' + (e.existingContact.first_name||'') + ' ' + (e.existingContact.last_name||'') + ' — linking to that contact', '#F5A623')
          set('buyer_contact_id', e.existingContact.id)
        } else {
          toast('Failed to save buyer contact: ' + e.message, '#DC2626')
        }
      }
    } else {
      setForm(f => ({
        ...f,
        buyer_name:        [contact.first_name, contact.last_name].filter(Boolean).join(' '),
        buyer_contact_id:  contact.id,
        buyer_phone:       contact.phone || f.buyer_phone,
        buyer_email:       contact.email || f.buyer_email,
        buyer_address:     contact.address || f.buyer_address,
      }))
    }
  }

  // ── OUTSIDE SELLER'S AGENT SELECT (create-or-link, mirrors selectBuyer) ──
  async function selectSellersAgent(contact) {
    if (!contact) {
      if (!form.sellers_agent_name?.trim()) return
      try {
        const [first, ...rest] = form.sellers_agent_name.trim().split(' ')
        const data = await db.contacts.create({
          first_name: first, last_name: rest.join(' '),
          company: form.seller_agent_company || null,
          status: 'Active', source: 'Offer Form', type: 'Agent',
          agent_id: agent?.id || null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
        if (data) {
          set('sellers_agent_contact_id', data.id)
          toast('✅ Outside agent saved to Contacts')
        }
      } catch(e) {
        if (e.existingContact) {
          // Existing contact may already carry another valid role (e.g. was
          // previously entered as a Buyer) — link to it without overwriting
          // that classification, per spec.
          toast('Already exists as ' + (e.existingContact.first_name||'') + ' ' + (e.existingContact.last_name||'') + ' — linking to that contact', '#F5A623')
          set('sellers_agent_contact_id', e.existingContact.id)
        } else {
          toast('Failed to save outside agent contact: ' + e.message, '#DC2626')
        }
      }
    } else {
      setForm(f => ({
        ...f,
        sellers_agent_name:       [contact.first_name, contact.last_name].filter(Boolean).join(' '),
        sellers_agent_contact_id: contact.id,
        seller_agent_company:     contact.company || f.seller_agent_company,
        sellers_agent_email:      contact.email || f.sellers_agent_email,
      }))
    }
  }

  // ── PURCHASER ATTORNEY SELECT ──────────────────────────────────
  // ── PURCHASER ATTORNEY SELECT (create-or-link, same pattern as Buyer) ──
  async function selectPurchaserAttorney(contact) {
    if (!contact) {
      if (!form.purchaser_attorney_name?.trim()) return
      try {
        const [first, ...rest] = form.purchaser_attorney_name.trim().split(' ')
        const data = await db.contacts.create({
          first_name: first, last_name: rest.join(' '),
          phone: form.purchaser_attorney_tel || null,
          email: form.purchaser_attorney_email || null,
          address: form.purchaser_attorney_address || null,
          status: 'Active', source: 'Offer Form', type: 'Attorney',
          agent_id: (form.buyers_agent_id || form.agent_id || agent?.id) || null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
        if (data) {
          set('purchaser_attorney_contact_id', data.id)
          toast('✅ Purchaser\u2019s Attorney saved to Contacts')
        }
      } catch(e) {
        if (e.existingContact) {
          toast('Already exists as ' + (e.existingContact.first_name||'') + ' ' + (e.existingContact.last_name||'') + ' — linking to that contact', '#F5A623')
          set('purchaser_attorney_contact_id', e.existingContact.id)
        } else {
          toast('Failed to save attorney contact: ' + e.message, '#DC2626')
        }
      }
    } else {
      setForm(f => ({
        ...f,
        purchaser_attorney_contact_id: contact.id,
        purchaser_attorney_name:       [contact.first_name, contact.last_name].filter(Boolean).join(' '),
        purchaser_attorney_tel:        contact.phone || f.purchaser_attorney_tel,
        purchaser_attorney_email:      contact.email || f.purchaser_attorney_email,
        purchaser_attorney_address:    contact.address || f.purchaser_attorney_address,
      }))
    }
  }

  // ── SELLER ATTORNEY SELECT (create-or-link, same pattern as Buyer) ──
  async function selectSellerAttorney(contact) {
    if (!contact) {
      if (!form.seller_attorney_name?.trim()) return
      try {
        const [first, ...rest] = form.seller_attorney_name.trim().split(' ')
        const data = await db.contacts.create({
          first_name: first, last_name: rest.join(' '),
          phone: form.seller_attorney_tel || null,
          email: form.seller_attorney_email || null,
          address: form.seller_attorney_address || null,
          status: 'Active', source: 'Offer Form', type: 'Attorney',
          agent_id: (form.agent_id || form.buyers_agent_id || agent?.id) || null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
        if (data) {
          set('seller_attorney_contact_id', data.id)
          toast('✅ Seller\u2019s Attorney saved to Contacts')
        }
      } catch(e) {
        if (e.existingContact) {
          toast('Already exists as ' + (e.existingContact.first_name||'') + ' ' + (e.existingContact.last_name||'') + ' — linking to that contact', '#F5A623')
          set('seller_attorney_contact_id', e.existingContact.id)
        } else {
          toast('Failed to save attorney contact: ' + e.message, '#DC2626')
        }
      }
    } else {
      setForm(f => ({
        ...f,
        seller_attorney_contact_id: contact.id,
        seller_attorney_name:       [contact.first_name, contact.last_name].filter(Boolean).join(' '),
        seller_attorney_tel:        contact.phone || f.seller_attorney_tel,
        seller_attorney_email:      contact.email || f.seller_attorney_email,
        seller_attorney_address:    contact.address || f.seller_attorney_address,
      }))
    }
  }

  // ── DOWNLOAD PDF ──────────────────────────────────────────────
  async function downloadPDF() {
    setDownloading(true)
    try {
      // Build the full offer data including agent name
      const buyersAgent = agents.find(a => a.id === (form.buyers_agent_id || form.agent_id))
      const payload = {
        ...form,
        // Outside buyer's agent (representing_side === 'Seller' case) takes
        // priority over an in-house agent lookup that would otherwise be
        // empty/wrong when the buyer's agent isn't one of ours.
        buyers_agent_name:       form.buyers_agent_outside_name || buyersAgent?.name || agent?.name || '',
        offer_date:              form.offer_date || new Date().toISOString().slice(0, 10),
        deposit_type:            form.deposit_type || 'dollar',
        mortgage_type:           form.mortgage_type || 'dollar',
        sellers_agent_commission:form.sellers_agent_commission || '',
        seller_agent_company:    form.seller_agent_company || '',
      }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch('/api/generate-offer-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'PDF generation failed')
      }

      // Trigger download
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const addr = (form.listing_addr || 'offer').replace(/[^a-z0-9]/gi, '_').slice(0, 40)
      a.download = 'Offer_' + addr + '.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast('✅ PDF downloaded')
    } catch(e) {
      toast('❌ PDF failed: ' + e.message, '#DC2626')
    } finally { setDownloading(false) }
  }

  // ── SEND OFFER ───────────────────────────────────────────────────
  // Sends through the authenticated agent's own connected mailbox
  // (api/send-offer.js -> api/_lib/connectors.js), never the shared
  // system mailbox. Requires the offer to already be saved (need an
  // offer_id) and to have a generated PDF revision to attach.
  const [showSend, setShowSend]   = useState(false)
  const [sendTo,   setSendTo]     = useState({ buyer:false, seller:false, purchaser_attorney:false, seller_attorney:false, sellers_agent:false })
  const [sendExtra,setSendExtra]  = useState('')
  const [sendCc,   setSendCc]     = useState('')
  const [sendingMailbox, setSendingMailbox] = useState(null) // null=loading, false=none, otherwise {provider,from}
  const [sendAttachDocs, setSendAttachDocs] = useState({ offer:false, pof:false })
  const [sendMsg,  setSendMsg]    = useState('Please see the attached offer for your review.')
  const [sending,  setSending]    = useState(false)

  function buildRecipients() {
    const list = []
    if (sendTo.buyer && form.buyer_email) list.push({ role:'buyer', name:form.buyer_name, email:form.buyer_email, contact_id:form.buyer_contact_id })
    if (sendTo.seller && form.seller_email) list.push({ role:'seller', name:form.seller_name, email:form.seller_email, contact_id:form.seller_contact_id })
    if (sendTo.purchaser_attorney && form.purchaser_attorney_email) list.push({ role:'purchaser_attorney', name:form.purchaser_attorney_name, email:form.purchaser_attorney_email, contact_id:form.purchaser_attorney_contact_id })
    if (sendTo.seller_attorney && form.seller_attorney_email) list.push({ role:'seller_attorney', name:form.seller_attorney_name, email:form.seller_attorney_email, contact_id:form.seller_attorney_contact_id })
    if (sendTo.sellers_agent && form.sellers_agent_email) list.push({ role:'sellers_agent', name:form.sellers_agent_name, email:form.sellers_agent_email, contact_id:form.sellers_agent_contact_id })
    for (const email of sendExtra.split(',').map(s=>s.trim()).filter(Boolean)) list.push({ role:'manual', email })
    return list
  }

  async function sendOffer() {
    if (!selected?.id) { toast('Save the offer before sending', '#F5A623'); return }
    if (!selected?.current_revision_id) { toast('Generate the PDF at least once before sending', '#F5A623'); return }
    if (!sendingMailbox) { toast('Connect Google or Outlook in Settings before sending', '#DC2626'); return }
    const recipients = buildRecipients()
    if (recipients.length === 0) { toast('Choose at least one recipient with a known email', '#DC2626'); return }

    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch('/api/send-offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({
          offer_id: selected.id,
          revision_id: selected.current_revision_id,
          provider: sendingMailbox?.provider || 'outlook',
          recipients,
          cc: sendCc.split(',').map(s=>s.trim()).filter(Boolean),
          subject: 'Offer for the Sale of Real Estate — ' + (form.listing_addr || ''),
          message: sendMsg,
          // Additional documents already on file for this offer
          // (Documents tab) — attached alongside the generated PDF,
          // not instead of it. Sent as URLs; the server fetches and
          // encodes them, same private-storage rule as the PDF.
          additional_attachments: [
            sendAttachDocs.offer && form.offer_url ? { name: 'Signed Offer Document.pdf', url: form.offer_url } : null,
            sendAttachDocs.pof   && form.pof_url   ? { name: 'Proof of Funds.pdf',         url: form.pof_url   } : null,
          ].filter(Boolean),
          // Stable per attempt, not per click — a second click before
          // this resolves reuses the same key rather than minting a
          // fresh one, so a double-click can't become a double-send.
          idempotency_key: (window.__offerSendKey ||= (form.id + ':' + Date.now())),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Send failed')
      if (body.preview) {
        toast('✅ Send validated end-to-end (preview mode — external effects disabled, no real email sent)', '#10B981')
      } else if (body.alreadySent) {
        toast('Already sent — no duplicate email created')
      } else {
        toast('✅ Offer sent from ' + (body.from || 'your mailbox'))
      }
      window.__offerSendKey = null
      setShowSend(false)
      refetch?.()
    } catch(e) {
      toast('❌ Send failed: ' + e.message, '#DC2626')
    } finally { setSending(false) }
  }

  // ── SAVE OFFER ─────────────────────────────────────────────────
  // ── OUTCOME ACTIONS ──────────────────────────────────────────────
  // Direct, single-field updates rather than set()+saveOffer() — set()
  // goes through React state, which doesn't commit synchronously, so
  // calling saveOffer() immediately after would still read the OLD
  // status from the current render's closure. This updates the DB and
  // local state together, explicitly, avoiding that stale-read bug.
  async function markOutcome(newStatus) {
    if (!selected?.id) return
    try {
      const updated = await update(selected.id, { status: newStatus }, agent?.id)
      setSelected(updated)
      setForm(f => ({ ...f, status: newStatus }))
      toast('✅ Marked ' + newStatus)
      refetch?.()
    } catch(e) { toast('Failed to update status: ' + e.message, '#DC2626') }
  }

  async function saveOffer(andDownloadPdf = false, statusOverride = null) {
    if (!form.listing_addr?.trim()) { toast('Listing address is required', '#DC2626'); return }
    if (!form.buyer_name?.trim())   { toast('Buyer name is required', '#DC2626'); return }
    if (!form.purchase_price)       { toast('Purchase price is required', '#DC2626'); return }

    const buyersAgent = agents.find(a => a.id === (form.buyers_agent_id || form.agent_id))

    setSaving(true)
    try {
      // Build explicit payload — only include columns that exist in the DB
      const payload = {
        listing_addr:        form.listing_addr        || null,
        mls_number:          form.mls_number          || null,
        off_market:          !!form.off_market,
        buyer_name:          form.buyer_name          || null,
        co_buyer_name:       form.co_buyer_name       || null,
        buyer_contact_id:    form.buyer_contact_id    || null,
        buyer_phone:         form.buyer_phone         || null,
        buyer_email:         form.buyer_email         || null,
        buyer_address:       form.buyer_address       || null,
        seller_name:         form.seller_name         || null,
        seller_contact_id:   form.seller_contact_id   || null,
        co_buyer_contact_id: form.co_buyer_contact_id || null,
        co_seller_contact_id: form.co_seller_contact_id || null,
        co_seller_name:      form.co_seller_name      || null,
        sellers_agent_name:  form.sellers_agent_name  || null,
        seller_agent_company:form.seller_agent_company|| null,
        purchase_price:      form.purchase_price ? parseFloat(String(form.purchase_price).replace(/[$,]/g,'')) : null,
        deposit:             form.deposit             || null,
        deposit_type:        form.deposit_type        || 'dollar',
        sellers_concession:  form.sellers_concession  || null,
        net_to_seller:       form.net_to_seller       || null,
        mortgage_amount:     form.mortgage_amount     || null,
        mortgage_pct:        form.mortgage_pct        || null,
        balance_at_closing:  form.balance_at_closing  || null,
        balance_type:        form.balance_type        || 'dollar',
        closing_days:        form.closing_days        || null,
        closing_mode:        form.closing_mode         || 'days',
        closing_target_date: form.closing_target_date  || null,
        closing_custom_text: form.closing_custom_text  || null,
        closing_qualifier:   form.closing_qualifier     || 'on_or_about',
        subject_attorney:    !!form.subject_attorney,
        subject_clear_title: !!form.subject_clear_title,
        subject_mortgage:    !!form.subject_mortgage,
        subject_cash:        !!form.subject_cash,
        subject_standard_inspection: !!form.subject_standard_inspection,
        subject_structural:  !!form.subject_structural,
        buyers_agent_id:     form.buyers_agent_id || form.agent_id || agent?.id,
        commission_pct:      form.commission_pct      || null,
        additional_terms:    form.additional_terms    || null,
        offer_date:          form.offer_date          || null,
        purchaser_attorney_name:    form.purchaser_attorney_name    || null,
        purchaser_attorney_address: form.purchaser_attorney_address || null,
        purchaser_attorney_tel:     form.purchaser_attorney_tel     || null,
        purchaser_attorney_email:   form.purchaser_attorney_email   || null,
        purchaser_attorney_contact_id: form.purchaser_attorney_contact_id || null,
        seller_attorney_name:    form.seller_attorney_name    || null,
        seller_attorney_address: form.seller_attorney_address || null,
        seller_attorney_tel:     form.seller_attorney_tel     || null,
        seller_attorney_email:   form.seller_attorney_email   || null,
        seller_attorney_contact_id: form.seller_attorney_contact_id || null,
        is_inhouse:          !!form.is_inhouse,
        inhouse_listing_id:  form.inhouse_listing_id  || null,
        notes:               form.notes               || null,
        status:              statusOverride           || form.status || 'Draft',
        // Assigned TargetOS agent follows representing_side: seller-side
        // offers default to the seller's-side agent slot, buyer-side (and
        // legacy default) to the buyer's-side slot. `side` (legacy,
        // Production-conversion still reads inhouse_listing_id, not this)
        // is left as a fixed 'Buyer' string for backward compatibility;
        // representing_side is the real field going forward.
        agent_id:            form.representing_side === 'Seller'
                                ? (form.agent_id || agent?.id)
                                : (form.buyers_agent_id || form.agent_id || agent?.id),
        production:          form.purchase_price      || null,
        side:                'Buyer',
        representing_side:       form.representing_side       || 'Buyer',
        sellers_agent_contact_id: form.sellers_agent_contact_id || null,
        buyers_agent_contact_id:  form.buyers_agent_contact_id  || null,
        mortgage_type:            form.mortgage_type            || 'dollar',
        is_cash_deal:             !!form.is_cash_deal,
        submitted_at:        form.offer_date          || null,
      }

      if (selected) {
        const updated = await update(selected.id, payload, agent?.id)
        setSelected(updated)
        setForm(f => ({ ...f, id: updated.id, current_revision_id: updated.current_revision_id }))
        toast('✅ Offer saved')
        if (andDownloadPdf) { await downloadPDF(); toast('✅ Saved and PDF downloaded') }
      } else {
        const newOffer = await add(payload)
        setSelected(newOffer)
        setForm(f => ({ ...f, id: newOffer.id, current_revision_id: newOffer.current_revision_id }))

        // Save buyer to contacts if not already saved
        if (!form.buyer_contact_id && form.buyer_name?.trim()) {
          await selectBuyer(null)
        }

        // If in-house listing → save to that listing's showings/offers
        if (form.inhouse_listing_id) {
          try {
            const { error: showingErr } = await supabase.from('listing_showings').insert({
              listing_id:   form.inhouse_listing_id,
              listing_addr: form.listing_addr,
              agent_id:     form.buyers_agent_id || agent?.id,
              buyer_name:   form.buyer_name,
              showing_date: form.offer_date,
              interest_level: 5,
              feedback:    'Offer submitted: $' + Number(form.purchase_price).toLocaleString(),
              notes:       'Offer for $' + Number(form.purchase_price).toLocaleString(),
              created_at:  new Date().toISOString(),
            })
            if (showingErr) throw showingErr
          } catch(e) { console.warn('listing_showings insert failed:', e.message) }
          toast('✅ Offer saved · Linked to listing · Buyer saved to contacts')
        } else {
          toast('✅ Offer saved')
        }
        if (andDownloadPdf) {
          await downloadPDF()
          toast('✅ Saved and PDF downloaded')
          // Deliberately does not close the panel here — same as the
          // standalone Download PDF action always did, so the agent
          // can see the download happened and keep working (e.g. send
          // it) rather than being bounced back to the board.
        } else {
          closePanel()
        }
      }

      // ── ACCEPTED OFFER → PRODUCTION DEAL ─────────────────────────
      // The moment an offer reaches AO/Accepted, a linked deal appears
      // on the Production board automatically — no re-typing.
      //
      // IDEMPOTENCY (hardened): a real DB transaction/RPC isn't
      // available here (none exists yet for this — see
      // docs/offers-v2-audit.md), so atomicity comes from a claim
      // pattern instead: atomically UPDATE offers.conversion_idempotency_key
      // WHERE it IS NULL, using a deterministic key ('offer_accept:'+id).
      // Postgres guarantees only one concurrent request can win that
      // single-row UPDATE — a genuine atomicity guarantee, just backed
      // by a conditional update + unique index (sql/offers_v2/A_foundation.sql)
      // rather than a multi-statement transaction. Losing the claim
      // (0 rows updated) means either a concurrent request or an
      // earlier successful run already handled conversion — never
      // create a second deal in that case. The existing address-based
      // dupe check is kept as defense in depth, not the primary guard.
      const nowAccepted = offerStatusCode(statusOverride || form.status) === 'accepted'
      const wasAccepted = selected && offerStatusCode(selected) === 'accepted'
      if (nowAccepted && !wasAccepted && !selected?.deal_id) {
        try {
          const claimKey = 'offer_accept:' + selected.id
          const { data: claimed, error: claimErr } = await supabase.from('offers')
            .update({
              conversion_idempotency_key: claimKey,
              accepted_at: new Date().toISOString(),
              accepted_by: agent?.id || null,
            })
            .eq('id', selected.id)
            .is('conversion_idempotency_key', null)
            .select('id')
          if (claimErr) throw claimErr

          if (claimed && claimed.length > 0) {
            // We won the claim — safe to create the deal exactly once.
            const { data: possibleDupes } = await supabase.from('deals').select('id,stage')
              .eq('addr', form.listing_addr)
            const dupe = (possibleDupes || []).find(deal => !['closed', 'fell_through'].includes(dealStageCode(deal)))
            if (!dupe) {
              const dealInsert = prepareRecordIdentifierDatabaseWrite('deals', {
                addr:        form.listing_addr,
                side:        form.inhouse_listing_id ? 'Listing' : 'Buyer',
                stage_code:  'offer_accepted',
                production:  form.purchase_price || null,
                client_name: form.inhouse_listing_id ? (form.seller_name || form.buyer_name) : form.buyer_name,
                agent_id:    form.buyers_agent_id || agent?.id || null,
                ao_date:     form.offer_date || new Date().toISOString().slice(0, 10),
                listing_id:  form.inhouse_listing_id || null,
                created_at:  new Date().toISOString(),
              })
              const { data: newDeal, error: dealErr } = await supabase.from('deals').insert(dealInsert).select().single()
              if (dealErr) throw dealErr
              const offerId = selected?.id
              if (offerId && newDeal) await supabase.from('offers').update({ deal_id: newDeal.id }).eq('id', offerId).then(() => {}).catch(() => {})
              if (form.inhouse_listing_id) {
                const listingUpdate = prepareRecordIdentifierDatabaseWrite('listings', {
                  status_code: 'offer_accepted',
                  updated_at: new Date().toISOString(),
                })
                await supabase.from('listings').update(listingUpdate).eq('id', form.inhouse_listing_id)
              }
              // Audit: links the accepted offer, its current revision,
              // and the resulting Production record together, since
              // deals has no offer_id/revision_id columns of its own
              // (not adding any — that's the Production board's schema,
              // out of scope for this project) and offers.deal_id only
              // captures half the link.
              try {
                await supabase.from('audit_log').insert({
                  agent_id: agent?.id || null, table_name: 'offers', record_id: String(offerId),
                  action: 'production_record_created',
                  metadata: { deal_id: newDeal.id, revision_id: form.current_revision_id || null, claim_key: claimKey },
                  created_at: new Date().toISOString(),
                })
              } catch {}
              toast('🎉 Accepted! Deal created on the Production board' + (form.inhouse_listing_id ? ' · listing marked Accepted Offer' : ''), '#10B981')
            }
          }
          // claimed.length === 0: conversion already handled by a prior
          // request — nothing to do, and importantly nothing to report
          // as an error; this is the expected idempotent-replay path.
        } catch(e) { toast('Offer saved, but auto-creating the Production deal failed: ' + e.message, '#F5A623') }
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteOffer() {
    try { await remove(selected.id); toast('Offer deleted'); closePanel() }
    catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setConfirmDel(false) }
  }

  // Leaderboards for the Reports section — counts by name across all
  // offers. Simple frequency count, not a fuzzy match to deals: the
  // per-agent conversion rate (offers that reached AO status) already
  // exists in AgentStatsCard, which is a much more reliable signal
  // than trying to match an offer to a deal by address.
  const topAttorneys = useMemo(() => {
    const counts = {}
    offers.forEach(o => {
      ;[o.purchaser_attorney_name, o.seller_attorney_name].forEach(name => {
        if (!name?.trim()) return
        counts[name] = (counts[name] || 0) + 1
      })
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [offers])

  const topSellerAgents = useMemo(() => {
    const counts = {}
    offers.forEach(o => {
      const name = o.sellers_agent_name?.trim()
      if (!name) return
      counts[name] = (counts[name] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [offers])

  const filtered = offers.filter(o => {
    if (statusF && offerStatusCode(o) !== offerStatusCode(statusF)) return false
    if (agentF === 'none' && o.agent_id) return false
    if (agentF && agentF !== 'none') {
      // Clicking a canonical (deduplicated) bucket must still match
      // offers historically assigned to a merged duplicate agent_id,
      // not just the exact canonical id.
      const bucket = canonicalAgents.find(a => a.id === agentF)
      const matchIds = bucket?.mergedIds || [agentF]
      if (!matchIds.includes(o.agent_id)) return false
    }
    if (search && !matchSearch(o, search, ['listing_addr','buyer_name','mls_number','seller_name'])) return false
    return true
  })

  const statusColor = s => OFFER_STATUSES.find(x=>x.value===s)?.hex || '#c4c4c4'
  const totalOffers = offers.length
  const totalAO     = offers.filter(o=>offerStatusCode(o) === 'accepted').length
  const totalVol    = offers.reduce((s,o)=>s+(parseFloat(o.purchase_price||o.production)||0),0)

  // ── RENDER ────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:ff }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>📝 Offers</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>
            {totalOffers} total · {totalAO} accepted · {fmt$(totalVol)} volume
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <LastVisited page="offers" />
          <div style={{ display:'flex', background:'var(--dim)', borderRadius:8, padding:2, gap:2 }}>
            {[['agents','👥 By Agent'],['table','📋 Table'],...((isAdmin||canManage)?[['reports','📊 Reports']]:[])].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 12px', borderRadius:6, border:'none', background:view===v?'var(--panel)':'transparent', color:view===v?'var(--text)':'var(--muted)', fontSize:12, fontWeight:view===v?700:400, cursor:'pointer', fontFamily:ff }}>
                {l}
              </button>
            ))}
          </div>
          <Btn onClick={openAdd}>+ New Offer</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address, buyer, MLS#..." style={{ flex:1, minWidth:200 }} />
        <select value={statusF} onChange={e=>setStatusF(e.target.value)}
          style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
          <option value="">All Statuses</option>
          {OFFER_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(isAdmin||canManage) && (
          <select value={agentF} onChange={e=>setAgentF(e.target.value)}
            style={{ padding:'9px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
            <option value="">All Agents</option>
            {canonicalAgents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {loading && <Loading />}

      {!loading && (
        <>
          {view === 'reports' && (isAdmin||canManage) && (
            <div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10 }}>
                Reports fetch full offer history directly (paginated, server-authorized by the same RLS rules as the board) — not limited to this board's own 200-row default page.
              </div>
              <AdminOfferReports offers={offers} agents={agents} />
            </div>
          )}

          {/* Agent stats */}
          {view === 'agents' && (isAdmin||canManage) && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12, marginBottom:24 }}>
                {canonicalAgents.map(ag=>(
                  <AgentStatsCard key={ag.id} ag={ag}
                    agentOffers={offers.filter(o=>(ag.mergedIds||[ag.id]).includes(o.agent_id))}
                    onFilter={id=>setAgentF(agentF===id?'':id)}
                    isActive={agentF===ag.id} />
                ))}
              </div>

              {/* Leaderboards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:16, marginBottom:24 }}>
                {[
                  { title: '⚖️ Most Active Attorneys', data: topAttorneys },
                  { title: '🏠 Most Frequent Seller\'s Agents', data: topSellerAgents },
                ].map(board => (
                  <div key={board.title} style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:10 }}>{board.title}</div>
                    {board.data.length === 0 && <div style={{ fontSize:12, color:'var(--muted)' }}>No data yet.</div>}
                    {board.data.map(([name, count], i) => (
                      <div key={name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom: i < board.data.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontSize:12, color:'var(--text)', fontWeight:600 }}>{i+1}. {name}</span>
                        <span style={{ fontSize:11, color:'var(--muted)', fontWeight:700, background:'var(--dim)', padding:'2px 8px', borderRadius:10 }}>{count} offer{count!==1?'s':''}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {filtered.length > 0 && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:10 }}>
                    {agentF ? agents.find(a=>a.id===agentF)?.name+"'s Offers" : 'All Offers'} ({filtered.length})
                  </div>
                  <OfferTable offers={filtered} agents={agents} onOpen={openOffer} statusColor={statusColor} canBulkEdit={canBulkEdit} bulkIds={bulkIds} onToggleBulk={toggleBulk} />
                </div>
              )}
            </div>
          )}

          {(view === 'table' || !(isAdmin||canManage)) && (
            filtered.length === 0
              ? <Empty icon="📝" title="No offers" sub="Track submitted offers here." action={<Btn onClick={openAdd}>+ New Offer</Btn>} />
              : <OfferTable offers={filtered} agents={agents} onOpen={openOffer} statusColor={statusColor} canBulkEdit={canBulkEdit} bulkIds={bulkIds} onToggleBulk={toggleBulk} />
          )}
        </>
      )}

      {/* ── OFFER MODAL ── */}
      <Modal open={!!(selected || urlId==='new')} onClose={closePanel}
        title={
          <span>
            {selected ? 'Offer — ' + selected.listing_addr : 'New Offer for Sale of Real Estate'}
            {selected && (() => {
              const s = OFFER_STATUSES.find(x=>x.value===form.status)
              return <span style={{ marginLeft:10, fontSize:11, fontWeight:700, color: s?.hex || 'var(--muted)' }}>● {s?.label || form.status || 'Draft'}</span>
            })()}
          </span>
        } width={680}>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:16, gap:0 }}>
          {(selected ? [['offer','📋 Offer Form'],['activity','📋 Activity']] : [['offer','📋 Offer Form']]).map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{ padding:'7px 14px', border:'none', background:'none', cursor:'pointer', borderBottom:tab===id?'2px solid #CC2200':'2px solid transparent', marginBottom:'-1px', fontSize:12, fontWeight:tab===id?700:400, color:tab===id?'#CC2200':'var(--muted)', fontFamily:ff }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── OFFER FORM TAB ── */}
        {tab === 'offer' && (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

            {/* Header: Date + Commission + Representing. Status is no
                longer here at all, editable or otherwise, per owner
                feedback ("remove the status dropdown from the top" —
                and per the spec, the header "should no longer waste
                space on a status dropdown"). It's now a small badge
                next to the modal title instead, and changes only
                through explicit lifecycle actions (Send Offer / Mark
                Accepted / Mark Rejected / Withdraw / Mark Expired, in
                the footer) — never hand-picked from a dropdown. */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:8 }}>
              <div>
                <span style={SL}>Date</span>
                <input type="date" value={form.offer_date} onChange={e=>set('offer_date',e.target.value)} style={S} />
              </div>
              <div>
                <span style={SL}>Commission %</span>
                <input value={form.commission_pct} onChange={e=>set('commission_pct',e.target.value)} placeholder="e.g. 2.5" style={S} />
              </div>
              <div>
                <span style={SL}>Representing</span>
                <select value={form.representing_side || 'Buyer'} onChange={e=>{
                  const nextSide = e.target.value
                  // Defaulting rule: switching representation side re-defaults
                  // the matching agent slot to the signed-in agent, but never
                  // overwrites an already-chosen agent on the OTHER side, and
                  // never touches anything if the signed-in user is not the
                  // one driving this offer (admin/secretary picking for
                  // someone else via the dropdown below stays untouched).
                  setForm(f => {
                    const next = { ...f, representing_side: nextSide }
                    if (!canManage && !isAdmin) {
                      if (nextSide === 'Buyer' || nextSide === 'Both') next.buyers_agent_id = f.buyers_agent_id || agent?.id
                      if (nextSide === 'Seller' || nextSide === 'Both') next.agent_id = f.agent_id || agent?.id
                    }
                    return next
                  })
                }} style={S}>
                  <option value="Buyer">Buyer</option>
                  <option value="Seller">Seller</option>
                  <option value="Both">Both (dual, if permitted)</option>
                </select>
              </div>
            </div>

            {/* PROPERTY INFORMATION — MLS Search auto-fills everything */}
            <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12, marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em' }}>
                  🏠 Property Information
                  {form.is_inhouse && <span style={{ color:'#10B981', background:'rgba(16,185,129,.12)', padding:'1px 7px', borderRadius:99, marginLeft:6, fontSize:10 }}>🏡 In-House</span>}
                  {form.inhouse_listing_id ? <div style={{ marginTop:6 }}><BoardLinks listingId={form.inhouse_listing_id} /></div> : null}
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={!!form.off_market} onChange={e=>set('off_market',e.target.checked)} style={{ accentColor:'var(--brand)' }} />
                  Off Market
                </label>
              </div>

              <span style={SL}>Address {form.off_market ? '' : '— start typing for real address suggestions'}</span>
              <div ref={mlsRef} style={{ position:'relative' }}>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <div style={{ flex:1, position:'relative' }}>
                    <AddressAutocomplete
                      value={form.listing_addr || ''}
                      onChange={v => set('listing_addr', v)}
                      onSelect={s => handleAddressSelect(s.full || s.street || '')}
                      placeholder={form.off_market ? 'Enter address manually...' : 'Start typing an address...'}
                      style={S}
                    />
                  </div>
                  <input value={form.mls_number||''} onChange={e=>set('mls_number',e.target.value)}
                    placeholder="MLS # (if known)" style={{ ...S, width:130, flexShrink:0 }} />
                </div>
              </div>
            </div>

            {/* BUYER | SELLER — collapses to one column below ~560px combined width */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, marginBottom:10 }}>
              {/* BUYER */}
              <div style={{ background:'rgba(59,130,246,.05)', borderRadius:10, border:'1px solid rgba(59,130,246,.2)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#3B82F6', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>BUYER</div>
                <span style={SL}>Buyer Name</span>
                <ContactSearch
                  value={form.buyer_name||''}
                  onChange={v=>set('buyer_name',v)}
                  onSelect={selectBuyer}
                  placeholder="Search contacts or enter name..."
                />
                {form.buyer_contact_id && <div style={{ fontSize:10, color:'#10B981', fontWeight:700, marginTop:3 }}>✓ Linked to contact record</div>}
                <span style={SL}>Co-Buyer (optional)</span>
                <ContactSearch value={form.co_buyer_name||''} onChange={v=>set('co_buyer_name',v)}
                  onSelect={c=>{ if(c) setForm(f=>({...f,co_buyer_name:[c.first_name,c.last_name].filter(Boolean).join(' '),co_buyer_contact_id:c.id})) }}
                  placeholder="Search contacts or enter co-buyer name..." />
                <span style={SL}>Buyer Phone</span>
                <input value={form.buyer_phone||''} onChange={e=>set('buyer_phone',e.target.value)} placeholder="(845) 555-1234" style={S} />
                <span style={SL}>Buyer Email</span>
                <input value={form.buyer_email||''} onChange={e=>set('buyer_email',e.target.value)} placeholder="buyer@email.com" style={S} />
                <span style={SL}>Buyer Address</span>
                <AddressAutocomplete value={form.buyer_address||''} onChange={v=>set('buyer_address',v)} onSelect={sel=>set('buyer_address', sel.full || sel.street)} placeholder="Home address" />
              </div>

              {/* SELLER */}
              <div style={{ background:'rgba(16,185,129,.05)', borderRadius:10, border:'1px solid rgba(16,185,129,.2)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#10B981', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>SELLER</div>
                <span style={SL}>Seller Name</span>
                <ContactSearch value={form.seller_name||''} onChange={v=>set('seller_name',v)}
                  onSelect={c=>{ if(c) setForm(f=>({...f,seller_name:[c.first_name,c.last_name].filter(Boolean).join(' '),seller_contact_id:c.id,seller_email:c.email||f.seller_email})) }}
                  placeholder="Search contacts or enter name..." />
                <span style={SL}>Seller Email (for sending)</span>
                <input value={form.seller_email||''} onChange={e=>set('seller_email',e.target.value)} placeholder="seller@email.com" style={S} />
                <span style={SL}>Co-Seller (optional)</span>
                <ContactSearch value={form.co_seller_name||''} onChange={v=>set('co_seller_name',v)}
                  onSelect={c=>{ if(c) setForm(f=>({...f,co_seller_name:[c.first_name,c.last_name].filter(Boolean).join(' '),co_seller_contact_id:c.id})) }}
                  placeholder="Co-seller name" />
              </div>
            </div>

            {/* FINANCIALS + SUBJECT TO — collapses to one column on narrow screens */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, marginBottom:10 }}>
              {/* Purchase Price & Breakdown */}
              <div style={{ background:'rgba(245,166,35,.05)', borderRadius:10, border:'1px solid rgba(245,166,35,.2)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#B45309', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>💰 Purchase Price & Breakdown</div>
                {[
                  { label:'Purchase Price', key:'purchase_price', bold:true, prefix:'$' },
                  { label:'Deposit upon contract', key:'deposit', isDeposit:true },
                  { label:"Seller's Concession", key:'sellers_concession', prefix:'$' },
                  { label:'Net to Seller', key:'net_to_seller', calc:true, prefix:'$' },
                  { label:'Mortgage Amount', key:'mortgage_amount', prefix:'$', isMortgageDollar:true },
                  { label:'Mortgage Amount', key:'mortgage_pct', prefix:'%', isMortgagePct:true },
                  { label:'Balance at Closing', key:'balance_at_closing', isBalance:true },
                ].map(row => (
                  <div key={row.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label style={{ fontSize:11, color:row.bold?'var(--text)':'var(--muted)', fontWeight:row.bold?700:400, flex:1 }}>{row.label}</label>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      {row.calc && <span style={{ fontSize:9, color:'#10B981', fontWeight:700 }}>auto</span>}
                      {row.isDeposit ? (
                        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                          {/* $ / % toggle for deposit */}
                          <div style={{ display:'flex', borderRadius:6, border:'1px solid var(--border)', overflow:'hidden' }}>
                            {['dollar','percent'].map(t=>(
                              <button key={t} onClick={()=>recalc({deposit_type:t})}
                                style={{ padding:'2px 7px', fontSize:10, fontWeight:700, border:'none', cursor:'pointer', fontFamily:ff, background:form.deposit_type===t?'var(--brand)':'transparent', color:form.deposit_type===t?'#fff':'var(--muted)' }}>
                                {t==='dollar'?'$':'%'}
                              </button>
                            ))}
                          </div>
                          <input value={form.deposit||''} onChange={e=>recalc({deposit:e.target.value})}
                            placeholder={form.deposit_type==='percent'?'%':'$0'}
                            style={{ ...S, width:90, textAlign:'right', fontSize:11 }} />
                        </div>
                      ) : row.isBalance ? (
                        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                          <div style={{ display:'flex', borderRadius:6, border:'1px solid var(--border)', overflow:'hidden' }}>
                            {['dollar','percent'].map(t=>(
                              <button key={t} onClick={()=>set('balance_type',t)}
                                style={{ padding:'2px 7px', fontSize:10, fontWeight:700, border:'none', cursor:'pointer', fontFamily:ff, background:form.balance_type===t?'var(--brand)':'transparent', color:form.balance_type===t?'#fff':'var(--muted)' }}>
                                {t==='dollar'?'$':'%'}
                              </button>
                            ))}
                          </div>
                          <input value={form.balance_at_closing||''} onChange={e=>recalc({balance_at_closing:e.target.value})}
                            placeholder={form.balance_type==='percent'?'%':'$0'}
                            style={{ ...S, width:90, textAlign:'right', fontSize:11 }} />
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize:11, color:'var(--muted)', minWidth:10 }}>{row.prefix}</span>
                          <input value={form[row.key]||''} disabled={form.is_cash_deal && (row.isMortgageDollar||row.isMortgagePct)}
                            onChange={e=>{
                              // Editing either mortgage line marks it as the source of
                              // truth for this edit, so the OTHER line derives from it —
                              // same bidirectional pattern as deposit's $/% toggle, just
                              // without a separate toggle control since the PDF prints
                              // both lines regardless of which one was typed.
                              if (row.isMortgageDollar) recalc({ mortgage_type:'dollar', mortgage_amount:e.target.value })
                              else if (row.isMortgagePct) recalc({ mortgage_type:'percent', mortgage_pct:e.target.value })
                              else recalc({[row.key]:e.target.value})
                            }}
                            placeholder={row.prefix==='%'?'0':'0'}
                            style={{ ...S, width:100, textAlign:'right', fontWeight:row.bold?800:400, fontSize:row.bold?13:11, borderColor:row.bold?'#F5A623':'var(--border)', opacity:(form.is_cash_deal && (row.isMortgageDollar||row.isMortgagePct))?0.5:1 }} />
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <label style={{ fontSize:11, color:'var(--muted)' }}>Closing time frame</label>
                    <div style={{ display:'flex', gap:2 }}>
                      {[['on_or_about','On or About'],['on_or_before','On or Before']].map(([v,l])=>(
                        <button key={v} onClick={()=>set('closing_qualifier',v)}
                          style={{ padding:'2px 6px', fontSize:9, fontWeight:700, border:'none', borderRadius:4, cursor:'pointer', fontFamily:ff,
                            background:(form.closing_qualifier||'on_or_about')===v?'var(--brand)':'transparent', color:(form.closing_qualifier||'on_or_about')===v?'#fff':'var(--muted)' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:2, marginBottom:6 }}>
                    {[['days','Number of days'],['date','Specific date']].map(([v,l])=>(
                      <button key={v} onClick={()=>set('closing_mode',v)}
                        style={{ padding:'2px 6px', fontSize:9, fontWeight:700, border:'1px solid var(--border)', borderRadius:4, cursor:'pointer', fontFamily:ff,
                          background:(form.closing_mode||'days')===v?'var(--dim)':'transparent', color:(form.closing_mode||'days')===v?'var(--text)':'var(--muted)' }}>
                        {l}
                      </button>
                    ))}
                  </div>

                  {(form.closing_mode||'days') === 'days' ? (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                      <input value={form.closing_days||'30'} onChange={e=>set('closing_days',e.target.value)} style={{ ...S, width:60, textAlign:'right' }} />
                      <span style={{ fontSize:11, color:'var(--muted)' }}>days</span>
                    </div>
                  ) : (
                    <input type="date" value={form.closing_target_date||''} onChange={e=>set('closing_target_date',e.target.value)} style={S} />
                  )}

                  {/* Live preview of the exact sentence that will print — real
                      wording DOES fit the template's 67.68pt field before its
                      static "DAYS" suffix (measured directly against the real
                      font: "on or about 60" fits at 7.5pt), confirmed by
                      rendering an actual sample. A specific date is shown here
                      for the agent but always prints as its equivalent
                      day-count, since a raw date can't sit gracefully before
                      the page's fixed "DAYS" text. */}
                  {(() => {
                    const qualifier = form.closing_qualifier === 'on_or_before' ? 'on or before' : 'on or about'
                    let days = null
                    if ((form.closing_mode||'days') === 'days') {
                      days = form.closing_days || null
                    } else if (form.closing_target_date && form.offer_date) {
                      days = Math.max(0, Math.round((new Date(form.closing_target_date) - new Date(form.offer_date)) / 86400000))
                    }
                    if (days === null) return null
                    return (
                      <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:4 }}>
                        Prints as: <b>Closing time frame: {qualifier} {days} DAYS</b>
                        {form.closing_mode === 'date' && form.closing_target_date && (
                          <> ({qualifier} {new Date(form.closing_target_date + 'T00:00:00').toLocaleDateString()} — the exact date stays here in the CRM)</>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Subject to + Agents */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Subject to:</div>
                  {[
                    { key:'subject_attorney',           label:'Attorney Approval',      bold:true },
                    { key:'subject_clear_title',        label:'Clear Title',             bold:true },
                    { key:'subject_mortgage',           label:'Mortgage' },
                    { key:'subject_cash',               label:'Cash Deal' },
                    { key:'subject_standard_inspection',label:'Standard home inspections' },
                    { key:'subject_structural',         label:'Structural issues only' },
                  ].map(cb => (
                    <label key={cb.key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:5, fontSize:12, fontWeight:cb.bold?700:400, color:'var(--text)' }}>
                      <input type="checkbox" checked={!!form[cb.key]}
                        onChange={e=>{
                          // Cash Deal drives is_cash_deal, which the shared calc
                          // engine treats as authoritative (zeroes mortgage even
                          // if a mortgage % was previously entered).
                          if (cb.key === 'subject_cash') recalc({ subject_cash:e.target.checked, is_cash_deal:e.target.checked })
                          // Every Subject To checkbox recalculates now,
                          // not just Cash Deal — confirmed real bug:
                          // the "Mortgage amount is set but 'Mortgage'
                          // is not checked" warning never refreshed
                          // when the Mortgage box itself was toggled,
                          // because only subject_cash called recalc()
                          // before. This is the fix for "notice/warning
                          // not updating."
                          else recalc({ [cb.key]: e.target.checked })
                        }}
                        style={{ accentColor:'var(--brand)', width:14, height:14 }} />
                      {cb.label}
                    </label>
                  ))}
                  {calcBlocking.length > 0 && (
                    <div style={{ marginTop:8, padding:'6px 8px', borderRadius:6, background:'rgba(220,38,38,.08)', color:'#DC2626', fontSize:10, fontWeight:600 }}>
                      {calcBlocking.map((m,i)=><div key={i}>⛔ {m}</div>)}
                    </div>
                  )}
                  {calcWarnings.length > 0 && (
                    <div style={{ marginTop:6, padding:'6px 8px', borderRadius:6, background:'rgba(245,166,35,.1)', color:'#B45309', fontSize:10, fontWeight:600 }}>
                      {calcWarnings.map((m,i)=><div key={i}>⚠ {m}</div>)}
                    </div>
                  )}
                </div>

                {/* Agents — single authoritative section. Which fields
                    are internal-agent selectors vs. outside-Contact
                    pickers depends on representing_side, per the
                    required representation behavior: whichever side
                    Target Team represents gets an internal selector
                    defaulting to the signed-in agent; the other side is
                    always an outside Contact picker. "Both" means both
                    sides are internal (an in-house deal on both ends),
                    so neither needs an outside picker. */}
                <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Agents</div>

                  {/* SELLER'S AGENT */}
                  {form.representing_side === 'Seller' || form.representing_side === 'Both' ? (
                    <>
                      <span style={SL}>Seller's Agent (Target Team)</span>
                      {canManage || isAdmin ? (
                        <select value={form.agent_id||''} onChange={e=>setForm(f=>({ ...f, agent_id:e.target.value }))} style={S}>
                          <option value="">— Select our agent —</option>
                          {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      ) : (
                        <input value={agent?.name||''} readOnly style={{ ...S, background:'var(--dim)', color:'var(--muted)' }} />
                      )}
                    </>
                  ) : (
                    <>
                      <span style={SL}>Seller's Agent</span>
                      <ContactSearch value={form.sellers_agent_name||''} onChange={v=>set('sellers_agent_name',v)}
                        filter="Agent" onSelect={selectSellersAgent}
                        placeholder="Search outside agents or enter name..." />
                      {form.sellers_agent_contact_id && <div style={{ fontSize:10, color:'#10B981', fontWeight:700, marginTop:2, marginBottom:6 }}>✓ Linked to contact</div>}
                      <span style={SL}>Seller Agent Commission %</span>
                      <input value={form.sellers_agent_commission||''} onChange={e=>set('sellers_agent_commission',e.target.value)} placeholder="e.g. 2.5" style={S} />
                      <span style={SL}>Seller Agent's Broker Company</span>
                      <input value={form.seller_agent_company||''} onChange={e=>set('seller_agent_company',e.target.value)} placeholder="Auto-filled from MLS or enter" style={S} />
                    </>
                  )}

                  {/* BUYER'S AGENT */}
                  <div style={{ marginTop:10 }}>
                    {form.representing_side === 'Buyer' || form.representing_side === 'Both' || !form.representing_side ? (
                      <>
                        <span style={SL}>Buyer's Agent (Target Team)</span>
                        <span style={SL}>Buyers Agent Commission %</span>
                        <input value={form.buyers_agent_commission||''} onChange={e=>set('buyers_agent_commission',e.target.value)} placeholder="e.g. 1.5" style={S} />
                        {canManage || isAdmin ? (
                          <select value={form.buyers_agent_id||''} onChange={e=>{
                            setForm(f=>({ ...f, buyers_agent_id:e.target.value, agent_id: f.representing_side==='Buyer' || !f.representing_side ? e.target.value : f.agent_id }))
                          }} style={S}>
                            <option value="">— Select our agent —</option>
                            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        ) : (
                          <input value={agent?.name||''} readOnly style={{ ...S, background:'var(--dim)', color:'var(--muted)' }} />
                        )}
                      </>
                    ) : (
                      <>
                        <span style={SL}>Buyer's Agent</span>
                        <ContactSearch value={form.buyers_agent_outside_name||''} onChange={v=>set('buyers_agent_outside_name',v)}
                          filter="Agent"
                          onSelect={c=>{ if (c) setForm(f=>({ ...f, buyers_agent_contact_id:c.id, buyers_agent_outside_name:[c.first_name,c.last_name].filter(Boolean).join(' ') })) }}
                          placeholder="Search outside agents or enter name..." />
                        {form.buyers_agent_contact_id && <div style={{ fontSize:10, color:'#10B981', fontWeight:700, marginTop:2 }}>✓ Linked to contact</div>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Terms */}
            <div style={{ marginBottom:10 }}>
              <span style={SL}>Additional Terms</span>
              <PolishWordingButton text={form.additional_terms} fieldLabel="Additional Terms"
                onAccept={improved => set('additional_terms', improved)} />
              <textarea value={form.additional_terms||''} onChange={e=>set('additional_terms',e.target.value)}
                placeholder="Additional terms and conditions..." rows={2}
                style={{ ...S, resize:'vertical' }} />
            </div>

            {/* ATTORNEYS — collapses to one column on narrow screens */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12, marginBottom:10 }}>
              {/* Purchaser's Attorney */}
              <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>PURCHASER'S ATTORNEY</div>
                <span style={SL}>Name</span>
                <ContactSearch
                  value={form.purchaser_attorney_name||''}
                  onChange={v=>set('purchaser_attorney_name',v)}
                  onSelect={selectPurchaserAttorney}
                  placeholder="Search attorneys in contacts..."
                  filter="Attorney"
                />
                {form.purchaser_attorney_contact_id && <div style={{ fontSize:10, color:'#10B981', fontWeight:700, marginTop:2 }}>✓ Linked to contact</div>}
                <span style={SL}>Address</span>
                <AddressAutocomplete value={form.purchaser_attorney_address||''} onChange={v=>set('purchaser_attorney_address',v)} onSelect={sel=>set('purchaser_attorney_address', sel.full || sel.street)} placeholder="Attorney address" />
                <span style={SL}>Tel</span>
                <input value={form.purchaser_attorney_tel||''} onChange={e=>set('purchaser_attorney_tel',e.target.value)} placeholder="(845) 555-1234" style={S} />
                <span style={SL}>Email</span>
                <input value={form.purchaser_attorney_email||''} onChange={e=>set('purchaser_attorney_email',e.target.value)} placeholder="attorney@firm.com" style={S} />
              </div>

              {/* Seller's Attorney */}
              <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>SELLER'S ATTORNEY</div>
                <span style={SL}>Name</span>
                <ContactSearch
                  value={form.seller_attorney_name||''}
                  onChange={v=>set('seller_attorney_name',v)}
                  onSelect={selectSellerAttorney}
                  placeholder="Search attorneys in contacts..."
                  filter="Attorney"
                />
                {form.seller_attorney_contact_id && <div style={{ fontSize:10, color:'#10B981', fontWeight:700, marginTop:2 }}>✓ Linked to contact</div>}
                <span style={SL}>Address</span>
                <AddressAutocomplete value={form.seller_attorney_address||''} onChange={v=>set('seller_attorney_address',v)} onSelect={sel=>set('seller_attorney_address', sel.full || sel.street)} placeholder="Attorney address" />
                <span style={SL}>Tel</span>
                <input value={form.seller_attorney_tel||''} onChange={e=>set('seller_attorney_tel',e.target.value)} placeholder="(845) 555-1234" style={S} />
                <span style={SL}>Email</span>
                <input value={form.seller_attorney_email||''} onChange={e=>set('seller_attorney_email',e.target.value)} placeholder="attorney@firm.com" style={S} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <span style={SL}>Internal Notes (not on the form)</span>
              <PolishWordingButton text={form.notes} fieldLabel="Internal Notes" isNotes
                onAccept={improved => set('notes', improved)} />
              <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} rows={2}
                placeholder="Internal notes only — not visible on the printed offer..." style={{ ...S, resize:'vertical' }} />
            </div>

            {/* Documents — inline in the main form, not a separate tab.
                Uses the same offer-docs storage model as before (no
                new/duplicate document source); the generated legal PDF
                stays a distinct, separately-tracked object per revision
                (see api/_lib/offersDb.js storeGeneratedPdf) and is never
                shown or manageable here. */}
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
              <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Documents</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:12 }}>
                <FileUploader label="📄 Signed Offer Document (PDF)" fileUrl={form.offer_url} onUploaded={url=>set('offer_url',url)} folder="offers" />
                <FileUploader label="💰 Proof of Funds (PDF / Image)" fileUrl={form.pof_url}  onUploaded={url=>set('pof_url',url)}  folder="pof" />
              </div>
              <div style={{ fontSize:10.5, color:'var(--muted)', marginTop:6 }}>
                The generated legal Offer PDF is separate from these supporting documents and is created via Save + Download PDF below — it is never overwritten by a later revision.
              </div>
            </div>
          </div>
        )}

        {/* ACTIVITY TAB */}
        {tab === 'activity' && selected?.id && (
          <RecordActivityFeed table="offers" recordId={selected.id} />
        )}

        {/* QUICK SAVE TAB — minimal fields, no PDF */}
        {showSend && (
          <div style={{ background:'var(--dim)', border:'1px solid var(--border)', borderRadius:10, padding:12, marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
              Send Offer
            </div>
            <div style={{ fontSize:11, marginBottom:10, padding:'6px 8px', borderRadius:6, background: sendingMailbox ? 'rgba(16,185,129,.08)' : 'rgba(220,38,38,.08)', color: sendingMailbox ? '#10B981' : '#DC2626' }}>
              {sendingMailbox === null ? 'Checking your connected mailbox...'
                : sendingMailbox ? 'Sending from your connected ' + (sendingMailbox.provider === 'gmail' ? 'Google' : 'Outlook') + ' mailbox: ' + (sendingMailbox.from || 'connected')
                : '⚠ No connected Google or Outlook mailbox found — connect one in Settings before sending.'}
            </div>
            <span style={SL}>To</span>
            {[
              { key:'sellers_agent', label:"Seller's Agent", email:form.sellers_agent_email },
              { key:'buyer', label:'Buyer', email:form.buyer_email },
              { key:'seller', label:'Seller', email:form.seller_email },
              { key:'purchaser_attorney', label:"Purchaser's Attorney", email:form.purchaser_attorney_email },
              { key:'seller_attorney', label:"Seller's Attorney", email:form.seller_attorney_email },
            ].map(r => (
              <label key={r.key} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, fontSize:12, opacity:r.email?1:0.4 }}>
                <input type="checkbox" disabled={!r.email} checked={!!sendTo[r.key]}
                  onChange={e=>setSendTo(t=>({ ...t, [r.key]:e.target.checked }))} />
                {r.label} {r.email ? '(' + r.email + ')' : '(no email on file)'}
              </label>
            ))}
            <span style={SL}>CC (comma-separated emails)</span>
            <input value={sendCc} onChange={e=>setSendCc(e.target.value)} placeholder="cc@email.com" style={S} />
            <span style={SL}>Additional recipients (comma-separated emails)</span>
            <input value={sendExtra} onChange={e=>setSendExtra(e.target.value)} placeholder="someone@email.com, other@email.com" style={S} />
            {(form.offer_url || form.pof_url) && (
              <>
                <span style={SL}>Also attach from Documents</span>
                {form.offer_url && (
                  <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, fontSize:12 }}>
                    <input type="checkbox" checked={!!sendAttachDocs.offer} onChange={e=>setSendAttachDocs(d=>({...d,offer:e.target.checked}))} />
                    📄 Signed Offer Document
                  </label>
                )}
                {form.pof_url && (
                  <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, fontSize:12 }}>

                    <input type="checkbox" checked={!!sendAttachDocs.pof} onChange={e=>setSendAttachDocs(d=>({...d,pof:e.target.checked}))} />
                    💰 Proof of Funds
                  </label>
                )}
              </>
            )}
            <span style={SL}>Message</span>
            <textarea value={sendMsg} onChange={e=>setSendMsg(e.target.value)} rows={2} style={{ ...S, resize:'vertical' }} />
            <div style={{ display:'flex', gap:8, marginTop:8, justifyContent:'flex-end' }}>
              <Btn variant="secondary" onClick={()=>setShowSend(false)}>Cancel</Btn>
              <Btn onClick={sendOffer} loading={sending} disabled={!sendingMailbox}>{sending ? 'Sending...' : '📧 Confirm & Send'}</Btn>
            </div>
          </div>
        )}

        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight:4, color:'#DC2626' }} onClick={()=>setConfirmDel(true)}>Delete</Btn>}
          {selected && ['sent', 'negotiating'].includes(offerStatusCode(form.status)) && (
            <div style={{ display:'flex', gap:4, marginRight:'auto' }}>
              <Btn variant="ghost" style={{ color:'#10B981', fontSize:11 }} onClick={()=>markOutcome('Accepted')}>✓ Mark Accepted</Btn>
              <Btn variant="ghost" style={{ color:'#DC2626', fontSize:11 }} onClick={()=>markOutcome('Rejected')}>Mark Rejected</Btn>
              <Btn variant="ghost" style={{ color:'#6B7280', fontSize:11 }} onClick={()=>markOutcome('Withdrawn')}>Withdraw</Btn>
              <Btn variant="ghost" style={{ color:'#78716C', fontSize:11 }} onClick={()=>markOutcome('Expired')}>Mark Expired</Btn>
            </div>
          )}
          {!showSend && (
            <Btn variant="secondary" disabled={!form.current_revision_id}
              title={!selected ? 'Save the offer first, then generate the PDF, to enable Send Offer'
                : !form.current_revision_id ? 'Generate the PDF first (Save + Download PDF), then Send Offer becomes available'
                : undefined}
              onClick={()=>{
              // Default recipient per spec: the linked Seller's Agent,
              // pre-checked whenever they have a usable email on file.
              setSendTo(t => ({ ...t, sellers_agent: !!form.sellers_agent_email }))
              setShowSend(true)
              // Show which mailbox will actually send, before the agent
              // commits to sending — reuses the existing connectors
              // endpoint rather than a new one.
              ;(async () => {
                try {
                  const account = await getConnectedEmailAccount()
                  setSendingMailbox(account?.connected ? account : false)
                } catch { setSendingMailbox(false) }
              })()
            }}>📧 Send Offer{!form.current_revision_id ? ' (generate PDF first)' : ''}</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn variant="secondary" onClick={()=>saveOffer(false)} loading={saving && !downloading}>
            {saving && !downloading ? 'Saving...' : 'Save'}
          </Btn>
          <Btn onClick={()=>saveOffer(true)} loading={saving && downloading}>
            {downloading ? 'Generating PDF...' : saving ? 'Saving...' : '📄 Save + Download PDF'}
          </Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDel} message="Delete this offer?" onConfirm={deleteOffer} onCancel={()=>setConfirmDel(false)} />
    </div>
  )
}

// ── OFFER TABLE ───────────────────────────────────────────────────
function OfferTable({ offers, agents, onOpen, statusColor, canBulkEdit, bulkIds = [], onToggleBulk }) {
  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:'var(--dim)' }}>
            {(canBulkEdit ? [' '] : []).concat(['Address','MLS#','Buyer','Agent','Status','Purchase Price','Date','In-House','Files']).map(h=>(
              <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {offers.map(o=>{
            const ag = agents.find(a=>a.id===(o.buyers_agent_id||o.agent_id))
            return (
              <tr key={o.id} onClick={()=>onOpen(o)}
                style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
                onMouseLeave={e=>e.currentTarget.style.background=''}>
                {canBulkEdit && (
                  <td style={{ padding:'10px 8px', width:30 }} onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" checked={bulkIds.includes(o.id)} onChange={()=>onToggleBulk(o.id)}
                      style={{ width:15, height:15, cursor:'pointer', accentColor:'#CC2200' }} />
                  </td>
                )}
                <td style={{ padding:'10px 12px', fontWeight:600, color:'var(--text)' }}>{o.listing_addr}</td>
                <td style={{ padding:'10px 12px', color:'var(--muted)', fontSize:11 }}>{o.mls_number||'—'}</td>
                <td style={{ padding:'10px 12px', color:'var(--muted)' }}>{o.buyer_name||'—'}</td>
                <td style={{ padding:'10px 12px' }}>
                  {ag ? (
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', background:ag.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#fff' }}>
                        {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
                      </div>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>{ag.name?.split(' ')[0]}</span>
                    </div>
                  ) : '—'}
                </td>
                <td style={{ padding:'10px 12px' }}><Pill label={o.status} color={statusColor(o.status)} /></td>
                <td style={{ padding:'10px 12px', fontWeight:700 }}>{fmt$(o.purchase_price||o.production)}</td>
                <td style={{ padding:'10px 12px', color:'var(--muted)', fontSize:11 }}>{fmtDate(o.offer_date||o.submitted_at)}</td>
                <td style={{ padding:'10px 12px' }}>
                  {o.is_inhouse ? <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(16,185,129,.1)', color:'#10B981', fontWeight:700 }}>🏡 In-House</span> : '—'}
                </td>
                <td style={{ padding:'10px 12px' }}>
                  <div style={{ display:'flex', gap:4 }}>
                    {o.offer_url && <a href={o.offer_url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ textDecoration:'none' }} title="Offer">📄</a>}
                    {o.pof_url   && <a href={o.pof_url}   target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ textDecoration:'none' }} title="POF">💰</a>}
                  </div>
                </td>
              </tr>
            )
          })}</tbody>
      </table>
      {canBulkEdit && (
        <BulkEditBar selectedIds={bulkIds} table="offers" agents={agents}
          allIds={filtered.map(o => o.id)} onSelectAll={ids => setBulkIds(ids)}
          fields={[
            { key:'status',          label:'Status', type:'select', options:(OFFER_STATUSES||[]).map(x=>({value:x.value||x,label:x.label||x})) },
            { key:'buyers_agent_id', label:'Buyer\'s Agent', type:'agent' },
          ]}
          onDone={() => { setBulkIds([]); refetch && refetch() }} onClear={() => setBulkIds([])} />
      )}
    </div>
  )
}
