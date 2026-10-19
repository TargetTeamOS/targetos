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
import { ContactPeek } from '../components/ContactPeek'
import { useFeature } from '../lib/features'
import { BulkEditBar } from '../components/BulkEditBar'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useOffers, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { OFFER_STATUSES, CONTACT_TYPE_COLORS, OFFER_ACCEPTED_VALUES } from '../lib/constants'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const S  = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }
const SL = { fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4, marginTop:10, display:'block' }

const BLANK = {
  // Property
  listing_addr:'', mls_number:'', off_market:false,
  // Buyer
  buyer_name:'', co_buyer_name:'', buyer_contact_id:'',
  buyer_phone:'', buyer_email:'', buyer_address:'',
  // Seller
  seller_name:'', co_seller_name:'', seller_contact_id:'',
  seller_agent_name:'', seller_agent_company:'',
  // Financials
  purchase_price:'', deposit:'', sellers_concession:'',
  net_to_seller:'', mortgage_amount:'', mortgage_pct:'',
  balance_at_closing:'', closing_days:'30',
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
  additional_terms:'', notes:'', status:'Sent',
  offer_date: new Date().toISOString().slice(0,10),
  offer_url:'', pof_url:'',
  // Legacy
  side:'Buyer', production:'', gci:'',
}

// ── CONTACT SEARCH DROPDOWN ────────────────────────────────────────────────────────
function ContactSearch({ value, onChange, onSelect, placeholder, filter }) {
  const [q,       setQ]       = useState(value || '')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const ref = useRef(null)
  const { agent: me, isAdmin } = useAuth()
  const [peekId, setPeekId] = useState(null)

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      let query = supabase.from('contacts')
        .select('id,first_name,last_name,phone,email,company,address,type,is_private,agent_id')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
        .limit(12)
      if (filter) query = query.eq('type', filter)
      let { data, error } = await query
      if (error && /is_private|column/i.test(error.message || '')) {
        // sql/private_contacts.sql not run yet — search without the flag
        let q2 = supabase.from('contacts')
          .select('id,first_name,last_name,phone,email,company,address,type,agent_id')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
          .limit(12)
        if (filter) q2 = q2.eq('type', filter)
        data = (await q2).data
      }
      // PRIVACY: other agents' private contacts never appear in search
      const visible = (data || []).filter(c => isAdmin || !c.is_private || (me?.id && c.agent_id === me.id))
      setResults(visible.slice(0, 6))
      setOpen(true)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function close(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <input value={q} onChange={e => { setQ(e.target.value); onChange(e.target.value) }}
        placeholder={placeholder} style={S} onFocus={() => q.length >= 2 && setOpen(true)} />
      {open && results.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:8, zIndex:100, boxShadow:'0 4px 20px rgba(0,0,0,.15)', overflow:'hidden' }}>
          {results.map(c => (
            <div key={c.id}
              onMouseDown={() => { onSelect(c); setQ([c.first_name,c.last_name].filter(Boolean).join(' ')); setOpen(false) }}
              style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>{c.first_name} {c.last_name}{c.company?' — '+c.company:''}
                  {c.type && <span style={{ fontSize:9.5, fontWeight:800, padding:'1px 7px', borderRadius:99, background:(CONTACT_TYPE_COLORS[c.type]||'#94A3B8')+'22', color:CONTACT_TYPE_COLORS[c.type]||'#94A3B8', textTransform:'uppercase', letterSpacing:'.03em' }}>{c.type}</span>}
                </div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{[c.phone,c.email].filter(Boolean).join(' · ')}</div>
              </div>
              <button onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setPeekId(c.id) }} title="Verify — phone, email, address, past deals"
                style={{ border:'none', background:'none', fontSize:13, cursor:'pointer', padding:4, flexShrink:0, opacity:.7 }}>👁</button>
            </div>
          ))}
          <div onMouseDown={() => { onSelect(null); setOpen(false) }}
            style={{ padding:'8px 12px', cursor:'pointer', fontSize:11, color:'var(--brand)', fontWeight:700, background:'var(--dim)' }}>
            + Save "{q}" as new contact
          </div>
        </div>
      )}
      {peekId && <ContactPeek contactId={peekId} onClose={() => setPeekId(null)} onSelect={c => { onSelect(c); setQ([c.first_name,c.last_name].filter(Boolean).join(' ')); setOpen(false) }} />}
    </div>
  )
}

// ── FILE UPLOADER ──────────────────────────────────────────────────────────────────────
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

// ── AGENT STATS CARD ────────────────────────────────────────────────────────────────────────────
function AgentStatsCard({ ag, agentOffers, onFilter, isActive }) {
  const total    = agentOffers.length
  const accepted = agentOffers.filter(o => OFFER_ACCEPTED_VALUES.includes(o.status)).length
  const pending  = agentOffers.filter(o => o.status === 'Sent').length
  const convRate = total > 0 ? Math.round(accepted / total * 100) : 0
  // Unique buyers per agent
  const uniqueBuyers = new Set(agentOffers.map(o => o.buyer_contact_id || o.buyer_name).filter(Boolean)).size

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
          <div style={{ fontSize:11, color:'var(--muted)' }}>{total} offers · {uniqueBuyers} buyers</div>
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

// ── MAIN ───────────────────────────────────────────────────────────────────────────────
export function OffersLegacy() {
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
  const searchMLS = useCallback(async (q) => {
    if (!q || q.length < 3) { setMlsResults([]); return }
    setMlsLoading(true)
    try {
      const MLS_USER = import.meta.env.VITE_SIMPLYRETS_USER || 'simplyrets'
      const MLS_PASS = import.meta.env.VITE_SIMPLYRETS_PASS || 'simplyrets'
      const auth     = btoa(MLS_USER + ':' + MLS_PASS)

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
    if (urlId && offers.length > 0 && urlId !== 'new') {
      const o = offers.find(x => x.id === urlId)
      if (o) openOffer(o)
    }
  }, [urlId, offers.length])

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

  // ── AUTO-CALCULATE financials ────────────────────────────────────
  function recalc(updates) {
    setForm(prev => {
      const next = { ...prev, ...updates }
      const price   = parseFloat(String(next.purchase_price ||'').replace(/[$,]/g,'')) || 0
      const deposit = parseFloat(String(next.deposit        ||'').replace(/[$,]/g,'')) || 0
      const concession = parseFloat(String(next.sellers_concession||'').replace(/[$,]/g,'')) || 0
      const mortgage   = parseFloat(String(next.mortgage_amount   ||'').replace(/[$,]/g,'')) || 0
      const mortgagePct= parseFloat(String(next.mortgage_pct      ||'').replace(/%/g,''))  || 0

      // Auto-calc mortgage amount from % if % is entered
      const mortgageCalc = mortgagePct > 0 && price > 0 ? price * mortgagePct / 100 : mortgage

      // Net to seller = price - concession
      const netToSeller = price > 0 ? price - concession : 0

      // Balance at closing = price - deposit - mortgage
      const balance = price > 0 ? price - deposit - (mortgageCalc || mortgage) : 0

      return {
        ...next,
        mortgage_amount:  mortgagePct > 0 ? Math.round(mortgageCalc).toString() : next.mortgage_amount,
        net_to_seller:    price > 0 ? Math.round(netToSeller).toString() : next.net_to_seller,
        balance_at_closing: price > 0 ? Math.round(balance).toString() : next.balance_at_closing,
        production: next.purchase_price,
      }
    })
  }

  // ── MLS / LISTING LOOKUP ─────────────────────────────────────
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

  // ── BUYER CONTACT SELECT ───────────────────────────────────
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

  // ── PURCHASER ATTORNEY SELECT ──────────────────────────────────
  function selectPurchaserAttorney(contact) {
    if (!contact) return
    setForm(f => ({
      ...f,
      purchaser_attorney_contact_id: contact.id,
      purchaser_attorney_name:       [contact.first_name, contact.last_name].filter(Boolean).join(' '),
      purchaser_attorney_tel:        contact.phone || f.purchaser_attorney_tel,
      purchaser_attorney_email:      contact.email || f.purchaser_attorney_email,
      purchaser_attorney_address:    contact.address || f.purchaser_attorney_address,
    }))
  }

  // ── SELLER ATTORNEY SELECT ───────────────────────────────────
function selectSellerAttorney2_unused() {} // placeholder guard (not part of original); removed below
