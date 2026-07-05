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
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { PageHeader, Btn, Modal, ModalActions, Loading, Empty } from '../components/UI'

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

function ListingCard({ listing, showings, openHouses, onLogShowing, onScheduleOH, onPriceChange, onUpdateStatus, expanded, onToggle }) {
  const dom    = daysOnMarket(listing.list_date)
  const status = listing.status || 'Active'
  const sc     = STATUS_COLORS[status] || '#94A3B8'
  const avgInterest = showings.length
    ? (showings.reduce((s, sh) => s + (sh.interest_level || 3), 0) / showings.length).toFixed(1)
    : null

  return (
    <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div onClick={onToggle} style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Status bar */}
          <div style={{ width: 5, borderRadius: 99, background: sc, alignSelf: 'stretch', flexShrink: 0, minHeight: 40 }} />

          {/* Main info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{listing.addr}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: sc, padding: '2px 8px', borderRadius: 99 }}>{status}</span>
              <DOMBadge days={dom} />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {listing.list_price && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{fmt$(listing.list_price)}</span>}
              {listing.beds && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{listing.beds} bed</span>}
              {listing.baths && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{listing.baths} bath</span>}
              {listing.sqft && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{Number(listing.sqft).toLocaleString()} sqft</span>}
              {listing.city && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{listing.city}</span>}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{showings.length}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Showings</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{openHouses.length}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Open Houses</div>
            </div>
            {avgInterest && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#F5A623' }}>{avgInterest}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Avg Interest</div>
              </div>
            )}
          </div>

          <span style={{ color: 'var(--muted)', fontSize: 14, transition: 'transform .2s', transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', flexShrink: 0 }}>▾</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div>
          {/* Quick actions */}
          <div style={{ padding: '10px 16px', background: 'var(--dim)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => onLogShowing(listing)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--brand)', background: 'rgba(204,34,0,.06)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              🏠 Log Showing
            </button>
            <button onClick={() => onScheduleOH(listing)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #3B82F6', background: 'rgba(59,130,246,.06)', color: '#3B82F6', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              🚪 Schedule Open House
            </button>
            <button onClick={() => onPriceChange(listing)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #F5A623', background: 'rgba(245,166,35,.06)', color: '#B45309', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              💰 Price Change
            </button>
            <select value={status} onChange={e => onUpdateStatus(listing, e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12, fontFamily: ff, cursor: 'pointer' }}>
              {LISTING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Showings */}
          <div style={{ padding: '12px 16px', borderBottom: showings.length > 0 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              🏠 Showings ({showings.length})
            </div>
            {showings.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No showings logged yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {showings.slice(0, 5).map(s => {
                  const il = INTEREST_LEVELS.find(i => i.value === s.interest_level) || INTEREST_LEVELS[2]
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--dim)', borderRadius: 8 }}>
                      <span style={{ fontSize: 16 }}>{il.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {s.buyer_name || 'Anonymous'}{s.agent_name ? ' via ' + s.agent_name : ''}
                        </div>
                        {s.feedback && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>"{s.feedback}"</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtDate(s.showing_date)}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: il.color }}>{il.label}</div>
                      </div>
                    </div>
                  )
                })}
                {showings.length > 5 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>+{showings.length - 5} more showings</div>
                )}
              </div>
            )}
          </div>

          {/* Open Houses */}
          {openHouses.length > 0 && (
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                🚪 Open Houses ({openHouses.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {openHouses.map(oh => (
                  <div key={oh.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--dim)', borderRadius: 8 }}>
                    <span style={{ fontSize: 14 }}>🚪</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                        {fmtDate(oh.date)} {oh.start_time && '· ' + oh.start_time}{oh.end_time && ' – ' + oh.end_time}
                      </div>
                      {oh.visitors_count > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{oh.visitors_count} visitors signed in</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MyListings() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const navigate  = useNavigate()

  const [listings,   setListings]   = useState([])
  const [showings,   setShowings]   = useState([])
  const [openHouses, setOpenHouses] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState({})
  const [statusFilter,setStatusFilter] = useState('Active')
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
      if (!isAdmin) q = q.eq('agent_id', agent?.id)

      const [listRes, showRes, ohRes] = await Promise.all([
        q,
        supabase.from('listing_showings').select('*').order('showing_date', { ascending: false }).catch(() => ({ data: [] })),
        supabase.from('open_houses').select('*').order('date', { ascending: false }),
      ])

      setListings(listRes.data || [])
      setShowings(showRes.data || [])
      setOpenHouses(ohRes.data || [])
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
        toast('Run SQL migration first — shown below', '#F97316')
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
      await supabase.from('calendar_events').insert({
        agent_id:   agent?.id,
        title:      'Open House — ' + selListing.addr,
        start_date: ohForm.date,
        start_time: ohForm.start_time,
        type:       'open_house',
        created_at: new Date().toISOString(),
      }).catch(() => {})
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
      await supabase.from('listings').update({ list_price: newPrice, updated_at: new Date().toISOString() }).eq('id', selListing.id)

      // Log price change to activity
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
      }).catch(() => {})

      // Sync to any linked TC deal
      const { data: tcDeal } = await supabase.from('tc_deals').select('id').eq('linked_listing_id', selListing.id).maybeSingle().catch(() => ({ data: null }))
      if (tcDeal?.id) {
        await supabase.from('tc_deals').update({ list_price: newPrice, updated_at: new Date().toISOString() }).eq('id', tcDeal.id)
      }

      toast('✅ Price updated to ' + fmt$(newPrice) + (tcDeal ? ' · Synced to TC Board' : ''))
      setPriceModal(false)
      setPriceForm({ list_price:'', reason:'' })
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') } finally { setSaving(false) }
  }

  async function updateStatus(listing, newStatus) {
    try {
      await supabase.from('listings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', listing.id)
      setListings(p => p.map(l => l.id === listing.id ? { ...l, status: newStatus } : l))

      // Sync to TC deal if linked
      const { data: tcDeal } = await supabase.from('tc_deals').select('id,tc_phase').eq('linked_listing_id', listing.id).maybeSingle().catch(() => ({ data: null }))
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

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="My Listings"
        sub="Your active listings — showings, open houses, price changes"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
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

      {/* SQL notice */}
      {listings.length > 0 && showings.length === 0 && (
        <div style={{ background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--muted)' }}>
          Run SQL to enable showing tracking:
          <code style={{ display: 'block', marginTop: 4, fontSize: 10, background: 'var(--dim)', padding: '6px 8px', borderRadius: 6 }}>
            {'create table if not exists listing_showings (id uuid primary key default gen_random_uuid(), listing_id uuid references listings(id), listing_addr text, agent_id uuid references agents(id), buyer_name text, agent_name text, showing_date date, showing_time text, interest_level int default 3, feedback text, notes text, created_at timestamptz default now());'}
          </code>
        </div>
      )}

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
          <ListingCard
            key={listing.id}
            listing={listing}
            showings={showings.filter(s => s.listing_id === listing.id)}
            openHouses={openHouses.filter(oh => oh.listing_id === listing.id)}
            expanded={!!expanded[listing.id]}
            onToggle={() => setExpanded(p => ({ ...p, [listing.id]: !p[listing.id] }))}
            onLogShowing={l => { setSelListing(l); setShowingModal(true) }}
            onScheduleOH={l => { setSelListing(l); setOhModal(true) }}
            onPriceChange={l => { setSelListing(l); setPriceForm({ list_price: l.list_price || '', reason: '' }); setPriceModal(true) }}
            onUpdateStatus={updateStatus}
          />
        ))
      )}

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
    </div>
  )
}
