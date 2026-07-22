// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — My Listings Board
// BOARD 3: Agent's personal listing management board.
// From the moment a listing goes live through sold.
//
// FEATURES:
// - All agent's active listings in one view
// - Showings log with buyer feedback per listing
// - Open house management
// - Price reduction tracking
// - Days on market counter
// - Offers received tracker
// - Buyer interest scoring per showing
// - Task checklist per listing (photography done, ads running, etc.)
// - Quick actions: log showing, schedule open house, reduce price
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ListingWorkspace from '../components/ListingWorkspace'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { PageHeader, Btn, Modal, ModalActions, Loading, Empty, Avatar } from '../components/UI'
import { logRecordChange } from '../lib/recordActivity'
import { usePageView, LastVisited } from '../components/PageViewTracking'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const LISTING_STATUSES = ['Active','Coming Soon','Under Contract','Sold','Expired','Withdrawn']
const STATUS_COLORS = {
  'Active':           '#10B981',
  'Coming Soon':      '#8B5CF6',
  'Under Contract':   '#F97316',
  'Sold':             '#3B82F6',
  'Expired':          '#DC2626',
  'Withdrawn':        '#94A3B8',
}

const INTEREST_LEVELS = [
  { value: 5, emoji: '🔥', label: 'Must Have',   color: '#DC2626' },
  { value: 4, emoji: '❤️',  label: 'Really Like', color: '#F97316' },
  { value: 3, emoji: '👍', label: 'Interested',  color: '#F5A623' },
  { value: 2, emoji: '🤔', label: 'Maybe',       color: '#94A3B8' },
  { value: 1, emoji: '👎', label: 'Not for me',  color: '#6B7280' },
]

const FEEDBACK_OPTS = ['Loved it','Price is right','Too expensive','Too small','Too large','Needs work','Wrong location','Great layout','Liked the area','Would offer']

function daysOnMarket(listDate) {
  if (!listDate) return null
  return Math.floor((Date.now() - new Date(listDate)) / 86400000)
}

function DOMBadge({ days }) {
  if (days === null) return null
  const color = days > 60 ? '#DC2626' : days > 30 ? '#F97316' : '#10B981'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: color + '18', padding: '2px 7px', borderRadius: 99 }}>
      {days}d on market
    </span>
  )
}

// Compact one-line listing row → opens the full workspace
function ListingRow({ listing, agent, showings, openHouses, onOpen }) {
  const dom    = daysOnMarket(listing.listed_date || listing.list_date || listing.created_at)
  const status = listing.status || 'Active'
  const sc     = STATUS_COLORS[status] || '#94A3B8'
  const avgInterest = showings.length
    ? (showings.reduce((s, sh) => s + (sh.interest_level || 3), 0) / showings.length).toFixed(1)
    : null
  const buyerInterest = showings.filter(s => (s.interest_level || 0) >= 4).length
  const priceChanges = Array.isArray(listing.price_history) ? listing.price_history.length : 0
  const sellerStale = !listing.seller_updated_at || (Date.now() - new Date(listing.seller_updated_at).getTime() > 7 * 86400000)
  const priceChanged = (listing.original_price && listing.list_price && listing.original_price !== listing.list_price) || priceChanges > 0
  const closingSoon = status === 'Under Contract'

  // Alert chips
  const chips = []
  if (showings.length === 0 && status === 'Active') chips.push({ t:'No showings', c:'#B45309' })
  if (sellerStale && (status === 'Active' || status === 'Coming Soon')) chips.push({ t:'Seller update overdue', c:'#DC2626' })
  if (dom != null && dom > 60 && status === 'Active') chips.push({ t:'60+ DOM', c:'#B45309' })
  if (priceChanged) chips.push({ t:'Price changed', c:'#2563EB' })
  if (!listing.seller_contact_id) chips.push({ t:'Missing seller contact', c:'#B45309' })
  if (closingSoon) chips.push({ t:'Under contract', c:'#F97316' })

  return (
    <div onClick={() => onOpen(listing)}
      style={{ background:'var(--panel)', border:'0.5px solid var(--border)', borderLeft:'3px solid '+sc,
        borderRadius:8, marginBottom:6, padding:'9px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
      {/* Agent avatar */}
      {agent ? <Avatar agent={agent} size={34} showHover={false} /> : <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--dim)', flexShrink:0 }} />}
      {/* Address + agent/city/status */}
      <div style={{ minWidth:150, maxWidth:200, flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{listing.addr || '—'}</div>
        <div style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {agent?.name ? agent.name.split(' ')[0] + ' · ' : ''}{listing.city ? listing.city + ' · ' : ''}<span style={{ color:sc, fontWeight:700 }}>{status}</span>
        </div>
      </div>
      {/* Price */}
      <div style={{ minWidth:82, flexShrink:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{listing.list_price ? fmt$(listing.list_price) : '—'}</div>
        {listing.original_price && listing.original_price !== listing.list_price
          ? <div style={{ fontSize:10, color:'var(--muted)', textDecoration:'line-through' }}>{fmt$(listing.original_price)}</div>
          : (dom != null && <div style={{ fontSize:10.5, color:'var(--muted)' }}>{dom}d</div>)}
      </div>
      {/* Counts */}
      <div style={{ display:'flex', gap:12, flexShrink:0 }}>
        {[['Show',showings.length],['Int❤',buyerInterest],['OH',openHouses.length],['Avg',avgInterest||'—'],['Δ$',priceChanges]].map(([lab,val],i)=>(
          <div key={i} style={{ textAlign:'center', minWidth:26 }}>
            <div style={{ fontSize:13, fontWeight:800, color: lab==='Avg'&&avgInterest?'#F5A623':'var(--text)' }}>{val}</div>
            <div style={{ fontSize:8.5, color:'var(--muted)', fontWeight:700, textTransform:'uppercase' }}>{lab}</div>
          </div>
        ))}
      </div>
      {/* Chips + marketing/seller-update */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {chips.slice(0,4).map((c,i)=>(
            <span key={i} style={{ fontSize:10, fontWeight:700, color:c.c, background:c.c+'18', padding:'1px 7px', borderRadius:99, whiteSpace:'nowrap' }}>{c.t}</span>
          ))}
        </div>
        <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
          {listing.marketing_status ? listing.marketing_status + ' · ' : ''}Seller upd: {listing.seller_updated_at ? fmtDate(listing.seller_updated_at) : 'never'}
        </div>
      </div>
      {/* Open */}
      <button onClick={(e)=>{ e.stopPropagation(); onOpen(listing) }}
        style={{ flexShrink:0, border:'1px solid var(--border)', background:'transparent', color:'var(--brand)', borderRadius:6, padding:'4px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Open →</button>
    </div>
  )
}

export function MyListings() {
  const { agent, isAdmin, can } = useAuth()
  usePageView('listings')
  const { toast } = useApp()
  const navigate  = useNavigate()

  const [listings,   setListings]   = useState([])
  const [showings,   setShowings]   = useState([])
  const [openHouses, setOpenHouses] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState({})
  const [agentsMap,  setAgentsMap]  = useState({})
  const [workspaceListing, setWorkspaceListing] = useState(null)  // when set, show full workspace
  const [statusFilter,setStatusFilter] = useState('All')
  const [search,     setSearch]     = useState('')

  // Modals
  const [showingModal, setShowingModal] = useState(false)
  const [ohModal,      setOhModal]      = useState(false)
  const [priceModal,   setPriceModal]   = useState(false)
  const [selListing,   setSelListing]   = useState(null)
  const [saving,       setSaving]       = useState(false)

  const [showingForm, setShowingForm] = useState({
    buyer_name: '', agent_name: '', showing_date: new Date().toISOString().slice(0,10),
    showing_time: '', interest_level: 3, feedback: '', notes: ''
  })
  const [ohForm, setOhForm] = useState({
    date: '', start_time: '11:00', end_time: '13:00', notes: ''
  })
  const [priceForm, setPriceForm] = useState({ list_price: '', reason: '' })

  useEffect(() => { loadAll() }, [agent?.id])

  async function loadAll() {
    setLoading(true)
    try {
      let q = supabase.from('listings').select('*').order('list_date', { ascending: false })
      if (!can('listings.view_all')) q = q.eq('agent_id', agent?.id)
      q = q.range(0, 199) // 200 max per agent — more than enough

      const listRes = await q
      const listingIds = (listRes.data || []).map(l => l.id)

      // Scope showings + open houses to only loaded listings
      const [showRes, ohRes] = await Promise.all([
        listingIds.length
          ? supabase.from('listing_showings').select('*').in('listing_id', listingIds).order('showing_date', { ascending: false })
          : Promise.resolve({ data: [] }),
        listingIds.length
          ? supabase.from('open_houses').select('*').in('listing_id', listingIds).order('date', { ascending: false })
          : Promise.resolve({ data: [] }),
      ]).catch(() => [{ data: [] }, { data: [] }])

      setListings(listRes.data || [])
      setShowings(showRes.data || [])
      setOpenHouses(ohRes.data || [])
      // agents for avatars (id → agent)
      try {
        const { data: ags } = await supabase.from('agents').select('id,name,color,photo_url,email').eq('active', true)
        setAgentsMap(Object.fromEntries((ags || []).map(a => [a.id, a])))
      } catch { setAgentsMap({}) }
    } catch(e) { toast('Load failed: ' + e.message, '#DC2626') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    return listings.filter(l => {
      if (statusFilter !== 'All' && l.status !== statusFilter) return false
      if (search && !matchSearch(l, search, ['addr', 'city', 'mls_number'])) return false
      return true
    })
  }, [listings, statusFilter, search])

  async function logShowing() {
    if (!showingForm.showing_date) { toast('Date required', '#DC2626'); return }
    setSaving(true)
    try {
      // Save to listing_showings table
      await supabase.from('listing_showings').insert({
        listing_id:    selListing.id,
        listing_addr:  selListing.addr,
        agent_id:      agent?.id,
        buyer_name:    showingForm.buyer_name || null,
        agent_name:    showingForm.agent_name || null,
        showing_date:  showingForm.showing_date,
        showing_time:  showingForm.showing_time || null,
        interest_level:showingForm.interest_level,
        feedback:      showingForm.feedback || null,
        notes:         showingForm.notes || null,
        created_at:    new Date().toISOString(),
      })
      toast('✅ Showing logged')
      setShowingModal(false)
      setShowingForm({ buyer_name:'', agent_name:'', showing_date:new Date().toISOString().slice(0,10), showing_time:'', interest_level:3, feedback:'', notes:'' })
      loadAll()
    } catch(e) {
      if (e.message?.includes('listing_showings')) {
        toast('Couldn\'t save showing — please try again', '#DC2626')
      } else {
        toast('Failed: ' + e.message, '#DC2626')
      }
    } finally { setSaving(false) }
  }

  async function scheduleOpenHouse() {
    if (!ohForm.date) { toast('Date required', '#DC2626'); return }
    setSaving(true)
    try {
      await supabase.from('open_houses').insert({
        listing_id:   selListing.id,
        listing_addr: selListing.addr,
        agent_id:     agent?.id,
        date:         ohForm.date,
        start_time:   ohForm.start_time,
        end_time:     ohForm.end_time,
        notes:        ohForm.notes || null,
        created_at:   new Date().toISOString(),
      })
      // Calendar event
      try {
        await supabase.from('calendar_events').insert({
          agent_id:   agent?.id,
          title:      'Open House — ' + selListing.addr,
          start_date: ohForm.date,
          start_time: ohForm.start_time,
          type:       'open_house',
          created_at: new Date().toISOString(),
        })
      } catch(e) { console.warn('calendar_events insert failed:', e.message) }
      toast('✅ Open house scheduled + calendar event created')
      setOhModal(false)
      setOhForm({ date:'', start_time:'11:00', end_time:'13:00', notes:'' })
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') } finally { setSaving(false) }
  }

  async function updatePrice() {
    if (!priceForm.list_price) { toast('Enter new price', '#DC2626'); return }
    setSaving(true)
    try {
      const newPrice = parseFloat(String(priceForm.list_price).replace(/[$,]/g,''))
      const oldPrice = selListing.list_price

      // Update listing
      const { error: priceErr } = await supabase.from('listings').update({ list_price: newPrice, updated_at: new Date().toISOString() }).eq('id', selListing.id)
      if (priceErr) throw priceErr

      // Log price change to activity
      try {
        await supabase.from('audit_log').insert({
          agent_id:   agent?.id,
          table_name: 'listings',
          record_id:  selListing.id,
          action:     'updated',
          field_name: 'list_price',
          old_value:  String(oldPrice),
          new_value:  String(newPrice),
          metadata:   { description: 'Price changed from ' + fmt$(oldPrice) + ' to ' + fmt$(newPrice), reason: priceForm.reason },
          created_at: new Date().toISOString(),
        })
      } catch(e) { console.warn('audit_log insert failed:', e.message) }

      // Sync to any linked TC deal
      let tcDeal = null
      try {
        const r = await supabase.from('tc_deals').select('id').eq('linked_listing_id', selListing.id).maybeSingle()
        tcDeal = r.data
      } catch(e) { console.warn('tc_deals lookup failed:', e.message) }
      if (tcDeal?.id) {
        await supabase.from('tc_deals').update({ list_price: newPrice, updated_at: new Date().toISOString() }).eq('id', tcDeal.id)
      }

      toast('✅ Price updated to ' + fmt$(newPrice) + (tcDeal ? ' · Synced to TC Board' : ''))
      setPriceModal(false)
      setPriceForm({ list_price:'', reason:'' })
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') } finally { setSaving(false) }
  }

  async function toggleIvr(listing) {
    const next = !listing.ivr_enabled
    try {
      const { error } = await supabase.from('listings').update({ ivr_enabled: next, updated_at: new Date().toISOString() }).eq('id', listing.id)
      if (error) throw error
      setListings(p => p.map(l => l.id === listing.id ? { ...l, ivr_enabled: next } : l))
      logRecordChange({ tableName:'listings', recordId:listing.id, agentId:agent?.id, field:'ivr_enabled', oldValue:listing.ivr_enabled, newValue:next, recordName:listing.addr })
      toast(next ? '📞 Featured on phone system' : 'Removed from phone system')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function updateStatus(listing, newStatus) {
    try {
      const { error } = await supabase.from('listings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', listing.id)
      if (error) throw error
      setListings(p => p.map(l => l.id === listing.id ? { ...l, status: newStatus } : l))
      logRecordChange({ tableName:'listings', recordId:listing.id, agentId:agent?.id, field:'status', oldValue:listing.status, newValue:newStatus, recordName:listing.addr })

      // Sync to TC deal if linked
      let tcDeal = null
      try {
        const r = await supabase.from('tc_deals').select('id,tc_phase').eq('linked_listing_id', listing.id).maybeSingle()
        tcDeal = r.data
      } catch(e) { console.warn('tc_deals sync lookup failed:', e.message) }
      if (tcDeal?.id) {
        const statusToPhase = { 'Active': 'active', 'Under Contract': 'under_contract', 'Sold': 'closed', 'Coming Soon': 'pre_listing' }
        const phase = statusToPhase[newStatus]
        if (phase) await supabase.from('tc_deals').update({ tc_phase: phase, updated_at: new Date().toISOString() }).eq('id', tcDeal.id)
      }

      toast('✅ Status updated to ' + newStatus + (tcDeal ? ' · TC Board synced' : ''))
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  const S  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const SL = { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5, marginTop:12, display:'block' }

  const stats = {
    active:  listings.filter(l => l.status === 'Active').length,
    uc:      listings.filter(l => l.status === 'Under Contract').length,
    sold:    listings.filter(l => l.status === 'Sold').length,
    totalShowings: showings.length,
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loading /></div>

  // Full-page workspace view (replaces the list when a listing is opened)
  function renderModals() {
    return (
      <>
      {/* LOG SHOWING MODAL */}
      <Modal open={showingModal} onClose={() => setShowingModal(false)} title={'Log Showing — ' + (selListing?.addr || '')} width={500}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <span style={SL}>Buyer Name (optional)</span>
            <input value={showingForm.buyer_name} onChange={e => setShowingForm(p => ({ ...p, buyer_name: e.target.value }))} placeholder="e.g. John Smith" style={S} />
          </div>
          <div>
            <span style={SL}>Showing Agent (optional)</span>
            <input value={showingForm.agent_name} onChange={e => setShowingForm(p => ({ ...p, agent_name: e.target.value }))} placeholder="Buyer's agent name" style={S} />
          </div>
          <div>
            <span style={SL}>Date</span>
            <input type="date" value={showingForm.showing_date} onChange={e => setShowingForm(p => ({ ...p, showing_date: e.target.value }))} style={S} />
          </div>
          <div>
            <span style={SL}>Time (optional)</span>
            <input type="time" value={showingForm.showing_time} onChange={e => setShowingForm(p => ({ ...p, showing_time: e.target.value }))} style={S} />
          </div>
        </div>

        <span style={SL}>Buyer Interest Level</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {INTEREST_LEVELS.map(il => (
            <button key={il.value} onClick={() => setShowingForm(p => ({ ...p, interest_level: il.value }))}
              style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid ' + (showingForm.interest_level === il.value ? il.color : 'var(--border)'), background: showingForm.interest_level === il.value ? il.color + '18' : 'transparent', color: showingForm.interest_level === il.value ? il.color : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              {il.emoji} {il.label}
            </button>
          ))}
        </div>

        <span style={SL}>Buyer Feedback</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {FEEDBACK_OPTS.map(f => (
            <button key={f} onClick={() => setShowingForm(p => ({ ...p, feedback: f }))}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (showingForm.feedback === f ? 'var(--brand)' : 'var(--border)'), background: showingForm.feedback === f ? 'rgba(204,34,0,.08)' : 'transparent', color: showingForm.feedback === f ? 'var(--brand)' : 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: ff }}>
              {f}
            </button>
          ))}
        </div>

        <span style={SL}>Notes</span>
        <textarea value={showingForm.notes} onChange={e => setShowingForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Additional notes..." style={{ ...S, resize: 'vertical' }} />

        <ModalActions>
          <Btn variant="secondary" onClick={() => setShowingModal(false)}>Cancel</Btn>
          <Btn onClick={logShowing} loading={saving}>Log Showing</Btn>
        </ModalActions>
      </Modal>

      {/* SCHEDULE OPEN HOUSE MODAL */}
      <Modal open={ohModal} onClose={() => setOhModal(false)} title={'Schedule Open House — ' + (selListing?.addr || '')} width={420}>
        <span style={SL}>Date</span>
        <input type="date" value={ohForm.date} onChange={e => setOhForm(p => ({ ...p, date: e.target.value }))} style={S} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <span style={SL}>Start Time</span>
            <input type="time" value={ohForm.start_time} onChange={e => setOhForm(p => ({ ...p, start_time: e.target.value }))} style={S} />
          </div>
          <div>
            <span style={SL}>End Time</span>
            <input type="time" value={ohForm.end_time} onChange={e => setOhForm(p => ({ ...p, end_time: e.target.value }))} style={S} />
          </div>
        </div>
        <span style={SL}>Notes</span>
        <textarea value={ohForm.notes} onChange={e => setOhForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...S, resize: 'vertical' }} />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>📅 A calendar event will be created automatically</div>
        <ModalActions>
          <Btn variant="secondary" onClick={() => setOhModal(false)}>Cancel</Btn>
          <Btn onClick={scheduleOpenHouse} loading={saving}>Schedule Open House</Btn>
        </ModalActions>
      </Modal>

      {/* PRICE CHANGE MODAL */}
      <Modal open={priceModal} onClose={() => setPriceModal(false)} title={'Price Change — ' + (selListing?.addr || '')} width={400}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Current price: <strong>{fmt$(selListing?.list_price)}</strong>
        </div>
        <span style={SL}>New List Price</span>
        <input value={priceForm.list_price} onChange={e => setPriceForm(p => ({ ...p, list_price: e.target.value }))} placeholder="$0" style={S} />
        <span style={SL}>Reason for price change (optional)</span>
        <input value={priceForm.reason} onChange={e => setPriceForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Market adjustment, Seller motivated" style={{ ...S, marginBottom: 8 }} />
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>⚡ Price change will sync to TC Board automatically</div>
        <ModalActions>
          <Btn variant="secondary" onClick={() => setPriceModal(false)}>Cancel</Btn>
          <Btn onClick={updatePrice} loading={saving}>Update Price</Btn>
        </ModalActions>
      </Modal>

      </>
    )
  }

  if (workspaceListing) {
    const wl = listings.find(l => l.id === workspaceListing.id) || workspaceListing
    return (
      <div style={{ fontFamily: ff }}>
        <ListingWorkspace
          listing={wl}
          agent={agentsMap[wl.agent_id]}
          showings={showings.filter(s => s.listing_id === wl.id)}
          openHouses={openHouses.filter(oh => oh.listing_id === wl.id)}
          onBack={() => setWorkspaceListing(null)}
          onSaved={(updated, showingEdit) => {
            if (updated && updated.id) setListings(p => p.map(l => l.id === updated.id ? { ...l, ...updated } : l))
            // refresh showings if a showing was edited
            if (showingEdit) loadAll()
          }}
          onLogShowing={l => { setSelListing(l); setShowingModal(true) }}
          onScheduleOH={l => { setSelListing(l); setOhModal(true) }}
        />
        {/* Modals still available from the workspace (add showing / open house) */}
        {renderModals()}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="My Listings"
        sub="Your active listings — showings, open houses, price changes"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <LastVisited page="listings" />
            <Btn variant="secondary" onClick={() => navigate('/listings')}>All Listings</Btn>
            <Btn onClick={() => navigate('/listings/new')}>+ New Listing</Btn>
          </div>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Active',          value: stats.active,        color: '#10B981', icon: '🏡' },
          { label: 'Under Contract',  value: stats.uc,            color: '#F97316', icon: '📝' },
          { label: 'Sold This Year',  value: stats.sold,          color: '#3B82F6', icon: '🎉' },
          { label: 'Total Showings',  value: stats.totalShowings, color: '#8B5CF6', icon: '👀' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--border)', padding: '12px 14px', borderLeftWidth: 3, borderLeftColor: s.color }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>


      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by address, MLS#..."
          style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {['All', ...LISTING_STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: '5px 12px', borderRadius: 99, border: '1px solid ' + (statusFilter === s ? (STATUS_COLORS[s] || 'var(--brand)') : 'var(--border)'), background: statusFilter === s ? (STATUS_COLORS[s] || 'var(--brand)') + '18' : 'transparent', color: statusFilter === s ? (STATUS_COLORS[s] || 'var(--brand)') : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Listing cards */}
      {filtered.length === 0 ? (
        <Empty text={listings.length === 0 ? 'No listings yet — click + New Listing' : 'No listings match your filter'} />
      ) : (
        filtered.map(listing => (
          <ListingRow
            key={listing.id}
            listing={listing}
            agent={agentsMap[listing.agent_id]}
            showings={showings.filter(s => s.listing_id === listing.id)}
            openHouses={openHouses.filter(oh => oh.listing_id === listing.id)}
            onOpen={l => setWorkspaceListing(l)}
          />
        ))
      )}

      {renderModals()}
    </div>
  )
}
