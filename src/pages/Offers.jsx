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

import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useOffers, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { OFFER_STATUSES } from '../lib/constants'
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
  seller_name:'', co_seller_name:'',
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

// ── CONTACT SEARCH DROPDOWN ───────────────────────────────────────
function ContactSearch({ value, onChange, onSelect, placeholder, filter }) {
  const [q,       setQ]       = useState(value || '')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const ref = useRef(null)

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      let query = supabase.from('contacts')
        .select('id,first_name,last_name,phone,email,company,address,type')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
        .limit(6)
      if (filter) query = query.eq('type', filter)
      const { data } = await query
      setResults(data || [])
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
              style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, borderBottom:'1px solid var(--border)' }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ fontWeight:700, color:'var(--text)' }}>{c.first_name} {c.last_name}{c.company?' — '+c.company:''}</div>
              <div style={{ color:'var(--muted)', fontSize:11 }}>{[c.phone,c.email].filter(Boolean).join(' · ')}</div>
            </div>
          ))}
          <div onMouseDown={() => { onSelect(null); setOpen(false) }}
            style={{ padding:'8px 12px', cursor:'pointer', fontSize:11, color:'var(--brand)', fontWeight:700, background:'var(--dim)' }}>
            + Save "{q}" as new contact
          </div>
        </div>
      )}
    </div>
  )
}

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
  const accepted = agentOffers.filter(o => ['AO','Accepted','Closed'].includes(o.status)).length
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

// ── MAIN ─────────────────────────────────────────────────────────
export function Offers() {
  const navigate  = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  usePageView('offers')
  const { toast } = useApp()

  // Agents only see their own offers
  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { offers, loading, add, update, remove } = useOffers(filters)
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

  // ── AUTO-CALCULATE financials ──────────────────────────────────
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

  // ── SELLER ATTORNEY SELECT ─────────────────────────────────────
  function selectSellerAttorney(contact) {
    if (!contact) return
    setForm(f => ({
      ...f,
      seller_attorney_contact_id: contact.id,
      seller_attorney_name:       [contact.first_name, contact.last_name].filter(Boolean).join(' '),
      seller_attorney_tel:        contact.phone || f.seller_attorney_tel,
      seller_attorney_email:      contact.email || f.seller_attorney_email,
      seller_attorney_address:    contact.address || f.seller_attorney_address,
    }))
  }

  // ── DOWNLOAD PDF ──────────────────────────────────────────────
  async function downloadPDF() {
    setDownloading(true)
    try {
      // Build the full offer data including agent name
      const buyersAgent = agents.find(a => a.id === (form.buyers_agent_id || form.agent_id))
      const payload = {
        ...form,
        buyers_agent_name:       buyersAgent?.name || agent?.name || '',
        offer_date:              form.offer_date || new Date().toISOString().slice(0, 10),
        deposit_type:            form.deposit_type || 'dollar',
        sellers_agent_commission:form.sellers_agent_commission || '',
        seller_agent_company:    form.seller_agent_company || '',
      }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-offer-pdf', {
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

  // ── SAVE OFFER ─────────────────────────────────────────────────
  async function saveOffer() {
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
        status:              form.status              || 'Sent',
        agent_id:            form.buyers_agent_id || form.agent_id || agent?.id,
        production:          form.purchase_price      || null,
        side:                'Buyer',
        submitted_at:        form.offer_date          || null,
      }

      if (selected) {
        const updated = await update(selected.id, payload, agent?.id)
        setSelected(updated)
        toast('✅ Offer saved')
      } else {
        const newOffer = await add(payload)

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
        closePanel()
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
    if (statusF && o.status !== statusF) return false
    if (agentF === 'none' && o.agent_id) return false
    if (agentF && agentF !== 'none' && o.agent_id !== agentF) return false
    if (search && !matchSearch(o, search, ['listing_addr','buyer_name','mls_number','seller_name'])) return false
    return true
  })

  const statusColor = s => OFFER_STATUSES.find(x=>x.value===s)?.hex || '#c4c4c4'
  const totalOffers = offers.length
  const totalAO     = offers.filter(o=>['AO','Accepted','Closed'].includes(o.status)).length
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
            {[['agents','👥 By Agent'],['table','📋 Table']].map(([v,l])=>(
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
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {loading && <Loading />}

      {!loading && (
        <>
          {/* Agent stats */}
          {view === 'agents' && (isAdmin||canManage) && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12, marginBottom:24 }}>
                {agents.map(ag=>(
                  <AgentStatsCard key={ag.id} ag={ag}
                    agentOffers={offers.filter(o=>o.agent_id===ag.id)}
                    onFilter={id=>setAgentF(agentF===id?'':id)}
                    isActive={agentF===ag.id} />
                ))}
              </div>

              {/* Leaderboards */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
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
                  <OfferTable offers={filtered} agents={agents} onOpen={openOffer} statusColor={statusColor} />
                </div>
              )}
            </div>
          )}

          {(view === 'table' || !(isAdmin||canManage)) && (
            filtered.length === 0
              ? <Empty icon="📝" title="No offers" sub="Track submitted offers here." action={<Btn onClick={openAdd}>+ New Offer</Btn>} />
              : <OfferTable offers={filtered} agents={agents} onOpen={openOffer} statusColor={statusColor} />
          )}
        </>
      )}

      {/* ── OFFER MODAL ── */}
      <Modal open={!!(selected || urlId==='new')} onClose={closePanel}
        title={selected ? 'Offer — ' + selected.listing_addr : 'New Offer for Sale of Real Estate'} width={680}>

        {/* Mode selector — two ways to create an offer */}
        {!selected && (
          <div style={{ display:'flex', gap:10, padding:'12px 0', marginBottom:12 }}>
            <div style={{ flex:1, padding:'12px 14px', borderRadius:10, border:'2px solid '+(tab==='offer'?'#CC2200':'var(--border)'), cursor:'pointer', background:tab==='offer'?'rgba(204,34,0,.04)':'var(--dim)' }}
              onClick={()=>setTab('offer')}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>📋 Fill Out Form</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Fill out fields → saves to CRM + option to download PDF</div>
            </div>
            <div style={{ flex:1, padding:'12px 14px', borderRadius:10, border:'2px solid '+(tab==='pdf_only'?'#3B82F6':'var(--border)'), cursor:'pointer', background:tab==='pdf_only'?'rgba(59,130,246,.04)':'var(--dim)' }}
              onClick={()=>setTab('pdf_only')}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>💾 Quick Save to CRM</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>Enter key info only → saves deal to CRM without PDF</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:16, gap:0 }}>
          {(selected ? [['offer','📋 Offer Form'],['docs','📎 Documents'],['activity','📋 Activity']] : [['offer','📋 Offer Form'],['docs','📎 Documents']]).map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)}
              style={{ padding:'7px 14px', border:'none', background:'none', cursor:'pointer', borderBottom:tab===id?'2px solid #CC2200':'2px solid transparent', marginBottom:'-1px', fontSize:12, fontWeight:tab===id?700:400, color:tab===id?'#CC2200':'var(--muted)', fontFamily:ff }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── OFFER FORM TAB ── */}
        {tab === 'offer' && (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

            {/* Header: Date + Status */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:8 }}>
              <div>
                <span style={SL}>Date</span>
                <input type="date" value={form.offer_date} onChange={e=>set('offer_date',e.target.value)} style={S} />
              </div>
              <div>
                <span style={SL}>Status</span>
                <select value={form.status} onChange={e=>set('status',e.target.value)} style={S}>
                  {OFFER_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <span style={SL}>Commission %</span>
                <input value={form.commission_pct} onChange={e=>set('commission_pct',e.target.value)} placeholder="e.g. 2.5" style={S} />
              </div>
            </div>

            {/* PROPERTY INFORMATION — MLS Search auto-fills everything */}
            <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12, marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em' }}>
                  🏠 Property Information
                  {form.is_inhouse && <span style={{ color:'#10B981', background:'rgba(16,185,129,.12)', padding:'1px 7px', borderRadius:99, marginLeft:6, fontSize:10 }}>🏡 In-House</span>}
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
                      onSelect={full => set('listing_addr', full)}
                      placeholder={form.off_market ? 'Enter address manually...' : 'Start typing an address...'}
                      style={S}
                    />
                  </div>
                  <input value={form.mls_number||''} onChange={e=>set('mls_number',e.target.value)}
                    placeholder="MLS # (if known)" style={{ ...S, width:130, flexShrink:0 }} />
                </div>
              </div>
            </div>

            {/* BUYER | SELLER */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
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
                <input value={form.co_buyer_name||''} onChange={e=>set('co_buyer_name',e.target.value)} placeholder="Co-buyer name" style={S} />
                <span style={SL}>Buyer Phone</span>
                <input value={form.buyer_phone||''} onChange={e=>set('buyer_phone',e.target.value)} placeholder="(845) 555-1234" style={S} />
                <span style={SL}>Buyer Email</span>
                <input value={form.buyer_email||''} onChange={e=>set('buyer_email',e.target.value)} placeholder="buyer@email.com" style={S} />
                <span style={SL}>Buyer Address</span>
                <input value={form.buyer_address||''} onChange={e=>set('buyer_address',e.target.value)} placeholder="Home address" style={S} />
              </div>

              {/* SELLER */}
              <div style={{ background:'rgba(16,185,129,.05)', borderRadius:10, border:'1px solid rgba(16,185,129,.2)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#10B981', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>SELLER</div>
                <span style={SL}>Seller Name</span>
                <ContactSearch value={form.seller_name||''} onChange={v=>set('seller_name',v)}
                  onSelect={c=>{ if(c) setForm(f=>({...f,seller_name:[c.first_name,c.last_name].filter(Boolean).join(' ')})) }}
                  placeholder="Search contacts or enter name..." />
                <span style={SL}>Co-Seller (optional)</span>
                <ContactSearch value={form.co_seller_name||''} onChange={v=>set('co_seller_name',v)}
                  onSelect={c=>{ if(c) setForm(f=>({...f,co_seller_name:[c.first_name,c.last_name].filter(Boolean).join(' ')})) }}
                  placeholder="Co-seller name" />
                <span style={SL}>Seller's Agent Name</span>
                <input value={form.sellers_agent_name||''} onChange={e=>set('sellers_agent_name',e.target.value)} placeholder="Auto-filled from MLS or enter" style={S} />
                <span style={SL}>Seller Agent Commission %</span>
                <input value={form.sellers_agent_commission||''} onChange={e=>set('sellers_agent_commission',e.target.value)} placeholder="e.g. 2.5" style={S} />
                <span style={SL}>Seller Agent's Broker Company</span>
                <input value={form.seller_agent_company||''} onChange={e=>set('seller_agent_company',e.target.value)} placeholder="Auto-filled from MLS or enter" style={S} />
              </div>
            </div>

            {/* FINANCIALS + SUBJECT TO */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
              {/* Purchase Price & Breakdown */}
              <div style={{ background:'rgba(245,166,35,.05)', borderRadius:10, border:'1px solid rgba(245,166,35,.2)', padding:12 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#B45309', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>💰 Purchase Price & Breakdown</div>
                {[
                  { label:'Purchase Price', key:'purchase_price', bold:true, prefix:'$' },
                  { label:'Deposit upon contract', key:'deposit', isDeposit:true },
                  { label:"Seller's Concession", key:'sellers_concession', prefix:'$' },
                  { label:'Net to Seller', key:'net_to_seller', calc:true, prefix:'$' },
                  { label:'Mortgage Amount', key:'mortgage_amount', prefix:'$' },
                  { label:'Mortgage Amount', key:'mortgage_pct', prefix:'%' },
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
                              <button key={t} onClick={()=>set('deposit_type',t)}
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
                          <input value={form[row.key]||''} onChange={e=>recalc({[row.key]:e.target.value})}
                            placeholder={row.prefix==='%'?'0':'0'}
                            style={{ ...S, width:100, textAlign:'right', fontWeight:row.bold?800:400, fontSize:row.bold?13:11, borderColor:row.bold?'#F5A623':'var(--border)' }} />
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
                  <label style={{ fontSize:11, color:'var(--muted)' }}>Closing time frame</label>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input value={form.closing_days||'30'} onChange={e=>set('closing_days',e.target.value)} style={{ ...S, width:60, textAlign:'right' }} />
                    <span style={{ fontSize:11, color:'var(--muted)' }}>days</span>
                  </div>
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
                      <input type="checkbox" checked={!!form[cb.key]} onChange={e=>set(cb.key,e.target.checked)} style={{ accentColor:'var(--brand)', width:14, height:14 }} />
                      {cb.label}
                    </label>
                  ))}
                </div>

                {/* Agents */}
                <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:12 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Agents</div>
                  <span style={SL}>Sellers Agent</span>
                  <input value={form.sellers_agent_name||''} onChange={e=>set('sellers_agent_name',e.target.value)} placeholder="Seller's agent name" style={S} />
                  <span style={SL}>Buyers Agent Commission %</span>
                  <input value={form.buyers_agent_commission||''} onChange={e=>set('buyers_agent_commission',e.target.value)} placeholder="e.g. 1.5" style={S} />
                  <span style={SL}>Buyers Agent</span>
                  {canManage || isAdmin ? (
                    // Secretary/Admin: dropdown of our agents
                    <select value={form.buyers_agent_id||''} onChange={e=>{
                      const ag = agents.find(a=>a.id===e.target.value)
                      setForm(f=>({ ...f, buyers_agent_id:e.target.value, agent_id:e.target.value }))
                    }} style={S}>
                      <option value="">— Select our agent —</option>
                      {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    // Agent: auto-filled with their name (read-only)
                    <input value={agent?.name||''} readOnly style={{ ...S, background:'var(--dim)', color:'var(--muted)' }} />
                  )}
                </div>
              </div>
            </div>

            {/* Additional Terms */}
            <div style={{ marginBottom:10 }}>
              <span style={SL}>Additional Terms</span>
              <textarea value={form.additional_terms||''} onChange={e=>set('additional_terms',e.target.value)}
                placeholder="Additional terms and conditions..." rows={2}
                style={{ ...S, resize:'vertical' }} />
            </div>

            {/* ATTORNEYS */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
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
                <input value={form.purchaser_attorney_address||''} onChange={e=>set('purchaser_attorney_address',e.target.value)} placeholder="Attorney address" style={S} />
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
                <input value={form.seller_attorney_address||''} onChange={e=>set('seller_attorney_address',e.target.value)} placeholder="Attorney address" style={S} />
                <span style={SL}>Tel</span>
                <input value={form.seller_attorney_tel||''} onChange={e=>set('seller_attorney_tel',e.target.value)} placeholder="(845) 555-1234" style={S} />
                <span style={SL}>Email</span>
                <input value={form.seller_attorney_email||''} onChange={e=>set('seller_attorney_email',e.target.value)} placeholder="attorney@firm.com" style={S} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <span style={SL}>Internal Notes (not on the form)</span>
              <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} rows={2}
                placeholder="Internal notes only — not visible on the printed offer..." style={{ ...S, resize:'vertical' }} />
            </div>
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {tab === 'docs' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ padding:'12px 14px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)' }}>
              Upload the signed offer and proof of funds. Create a bucket named <code style={{ color:'#CC2200' }}>offer-docs</code> in Supabase Storage (set to Public).
            </div>
            <FileUploader label="📄 Signed Offer Document (PDF)" fileUrl={form.offer_url} onUploaded={url=>set('offer_url',url)} folder="offers" />
            <FileUploader label="💰 Proof of Funds (PDF / Image)" fileUrl={form.pof_url}  onUploaded={url=>set('pof_url',url)}  folder="pof" />
          </div>
        )}

        {/* ACTIVITY TAB */}
        {tab === 'activity' && selected?.id && (
          <RecordActivityFeed table="offers" recordId={selected.id} />
        )}

        {/* QUICK SAVE TAB — minimal fields, no PDF */}
        {tab === 'pdf_only' && !selected && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ padding:'10px 12px', background:'rgba(59,130,246,.06)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
              Enter key deal information to track in CRM. No PDF generated.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ gridColumn:'span 2' }}>
                <span style={SL}>Property Address *</span>
                <AddressAutocomplete
                  value={form.listing_addr || ''}
                  onChange={v => set('listing_addr', v)}
                  onSelect={full => set('listing_addr', full)}
                  placeholder="Start typing an address..."
                  style={S}
                />
              </div>
              <div>
                <span style={SL}>Buyer Name *</span>
                <ContactSearch value={form.buyer_name||''} onChange={v=>set('buyer_name',v)} onSelect={selectBuyer} placeholder="Search or enter buyer..." />
              </div>
              <div>
                <span style={SL}>Seller Name</span>
                <ContactSearch value={form.seller_name||''} onChange={v=>set('seller_name',v)}
                  onSelect={c=>{ if(c) setForm(f=>({...f,seller_name:[c.first_name,c.last_name].filter(Boolean).join(' ')})) }}
                  placeholder="Search or enter seller..." />
              </div>
              <div>
                <span style={SL}>Purchase Price</span>
                <input value={form.purchase_price||''} onChange={e=>recalc({purchase_price:e.target.value})} placeholder="$0" style={S} />
              </div>
              <div>
                <span style={SL}>Status</span>
                <select value={form.status} onChange={e=>set('status',e.target.value)} style={S}>
                  {OFFER_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <span style={SL}>Date</span>
                <input type="date" value={form.offer_date} onChange={e=>set('offer_date',e.target.value)} style={S} />
              </div>
              <div>
                <span style={SL}>Buyers Agent</span>
                {canManage||isAdmin ? (
                  <select value={form.buyers_agent_id||''} onChange={e=>setForm(f=>({...f,buyers_agent_id:e.target.value,agent_id:e.target.value}))} style={S}>
                    <option value="">— Select agent —</option>
                    {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <input value={agent?.name||''} readOnly style={{...S,background:'var(--dim)',color:'var(--muted)'}} />
                )}
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <span style={SL}>Notes</span>
                <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} rows={2} style={{...S,resize:'vertical'}} />
              </div>
            </div>
          </div>
        )}

        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight:'auto', color:'#DC2626' }} onClick={()=>setConfirmDel(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          {tab !== 'pdf_only' && (
            <Btn variant="secondary" onClick={downloadPDF} loading={downloading}>
              📄 {downloading ? 'Generating...' : 'Download PDF'}
            </Btn>
          )}
          <Btn onClick={saveOffer} loading={saving}>
            {selected ? 'Save Changes' : tab === 'pdf_only' ? 'Save to CRM' : 'Save + Download PDF'}
          </Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDel} message="Delete this offer?" onConfirm={deleteOffer} onCancel={()=>setConfirmDel(false)} />
    </div>
  )
}

// ── OFFER TABLE ───────────────────────────────────────────────────
function OfferTable({ offers, agents, onOpen, statusColor }) {
  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ background:'var(--dim)' }}>
            {['Address','MLS#','Buyer','Agent','Status','Purchase Price','Date','In-House','Files'].map(h=>(
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
    </div>
  )
}
