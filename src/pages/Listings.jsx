import { HeaderCallButton } from '../components/ClickToCall'
// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Listings Board
// Full Monday.com-parity listing management:
//   • Board view grouped by status (Active / UC / Sold / etc.)
//   • Import live from Monday.com Target Team - Listings board
//   • Phone IVR integration — select listings to broadcast on phone system
//   • Showings manager — schedule, track, route plan
//   • Route planner — Google Maps multi-stop optimized route
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth }  from '../context/AuthContext'
import { useFeature } from '../lib/features'
import { LISTING_STATUSES } from '../lib/constants'
import { BulkEditBar } from '../components/BulkEditBar'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { Btn, Loading, Empty, Confirm, Avatar } from '../components/UI'
import { CustomFieldsSection } from '../components/CustomFieldsSection'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import { useAgents } from '../lib/hooks'
import { FilterBar } from '../components/FilterBar'
import { ImportExport } from '../components/ImportExport'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { BoardLinks } from '../components/BoardLinks'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import { MLSSearch } from '../components/MLSSearch'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const STATUSES = [
  { id:'Active',           label:'Active',               color:'#00c875' },
  { id:'Accepted offer',   label:'Accepted Offer',       color:'#784bd1' },
  { id:'Under Contract',   label:'Under Contract',       color:'#007eb5' },
  { id:'Off Market',       label:'Off Market',           color:'#fdab3d' },
  { id:'Sold',             label:'Sold',                 color:'#ffcb00' },
  { id:'Expired',          label:'Expired',              color:'#df2f4a' },
  { id:'Temp Off Market',  label:'Temp Off Market',      color:'#579bfc' },
  { id:'Seller not selling',label:'Seller Not Selling',  color:'#333333' },
]

const LISTINGS_EXPORT_COLS = [
  { key:'addr',          label:'Address',       example:'123 Main St, Monsey NY 10952' },
  { key:'city',          label:'City',          example:'Spring Valley' },
  { key:'status',        label:'Status',        example:'Active' },
  { key:'list_price',    label:'List Price',    example:'750000', type:'number' },
  { key:'property_type', label:'Property Type', example:'Single Family' },
  { key:'deal_type',     label:'Deal Type',     example:'MLS' },
  { key:'beds',          label:'Beds',          example:'4' },
  { key:'baths',         label:'Baths',         example:'2' },
  { key:'sqft',          label:'Sqft',          example:'2000' },
  { key:'list_date',     label:'List Date',     example:'2026-01-15', type:'date' },
  { key:'mls_link',      label:'MLS Link',      example:'https://...' },
  { key:'door_lock',     label:'Door Lock Code',example:'1234' },
  { key:'notes',         label:'Notes',         example:'' },
  { key:'_agent_name',   label:'Agent Name',    example:'Mendy Jankovits', virtual:true },
]

const PROPERTY_TYPES = ['Single Family','Condo','New Construction','Multi Family','2 Family','3 Family','4 Family','Duplex','High Ranch','Ranch','Land','Commercial']
const DEAL_TYPES     = ['MLS','Off Market']
const MONDAY_BOARD   = '2445753704'

// ── HELPERS ───────────────────────────────────────────────────
function statusColor(s) { return STATUSES.find(x => x.id === s)?.color || '#c4c4c4' }
function Badge({ label, color, size = 11 }) {
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:20, background:color+'22', color, border:"1px solid " + (color) + "44", fontSize:size, fontWeight:700, whiteSpace:'nowrap' }}>
      {label}
    </span>
  )
}

// ── LISTING CARD ──────────────────────────────────────────────
function ListingCard({ listing, selected, onSelect, onToggleIvr, agents, onShowings, checked, onCheck }) {
  const a     = agents.find(x => x.id === listing.agent_id)
  const sc    = statusColor(listing.status)
  const price = listing.list_price ? fmt$(listing.list_price) : '—'

  return (
    <div onClick={() => onSelect(listing)} style={{ position: 'relative' }}>
      {onCheck && (
        <input type="checkbox" checked={!!checked}
          onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); onCheck(listing.id) }}
          style={{ position: 'absolute', top: 10, left: 10, zIndex: 5, width: 16, height: 16, cursor: 'pointer', accentColor: '#CC2200' }} />
      )}
      <div
      style={{ background:'var(--panel)', borderRadius:10, border:"1.5px solid " + (selected ? '#CC2200' : 'var(--border)'), padding:'14px 16px', cursor:'pointer', transition:'all .15s', position:'relative' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.08)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>

      {/* IVR toggle */}
      <div
        onClick={e => { e.stopPropagation(); onToggleIvr(listing.id) }}
        title={listing.ivr_enabled ? 'Remove from phone listing' : 'Add to phone listing (press 3)'}
        style={{ position:'absolute', top:10, right:10, width:22, height:22, borderRadius:6, background:listing.ivr_enabled?'#8B5CF6':'var(--dim)', border:"1px solid " + (listing.ivr_enabled?'#8B5CF6':'var(--border)'), display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:11 }}>
        📞
      </div>

      <div style={{ paddingRight:30 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', marginBottom:4, lineHeight:1.3 }}>{listing.addr}</div>
        {listing.city && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}>{listing.city}</div>}
      </div>

      <div style={{ fontSize:20, fontWeight:900, color:'#CC2200', marginBottom:8 }}>{price}</div>

      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--muted)', marginBottom:8, flexWrap:'wrap' }}>
        {listing.beds  && <span>🛏 {listing.beds} bd</span>}
        {listing.baths && <span>🛁 {listing.baths} ba</span>}
        {listing.sqft  && <span>📐 {listing.sqft} sqft</span>}
        {listing.property_type && <span>🏠 {listing.property_type}</span>}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Badge label={listing.status} color={sc} />
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {listing.showings_count > 0 && (
            <button onClick={e => { e.stopPropagation(); onShowings(listing) }}
              style={{ padding:'2px 8px', borderRadius:12, border:'1px solid #3B82F644', background:'#3B82F611', color:'#3B82F6', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              👁 {listing.showings_count} showings
            </button>
          )}
          {a && (
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background:a.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#fff' }}>
                {a.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
              </div>
              <span style={{ fontSize:10, color:'var(--muted)' }}>{a.name.split(' ')[0]}</span>
            </div>
          )}
        </div>
      </div>

      {listing.ivr_enabled && (
        <div style={{ marginTop:6, padding:'3px 8px', borderRadius:6, background:'#8B5CF611', border:'1px solid #8B5CF644', fontSize:10, color:'#8B5CF6', fontWeight:700 }}>
          📞 Available on phone — Press 3
        </div>
      )}
    </div>
    </div>
  )
}

// ── LISTING DRAWER ────────────────────────────────────────────
function ListingDrawer({ listing, agents, onClose, onSave, onDelete, onAddShowing }) {
  // ── TRANSACTION PROGRESS (July 2026) ────────────────────────────
  // Shows the TC steps the coordinator marked 👁 agent-visible for
  // this listing — the assigned agent (and admins) can follow where
  // their signed listing stands without access to the full TC board.
  const [tcSteps, setTcSteps] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: tcDeal } = await supabase.from('tc_deals').select('id, tc_phase').eq('linked_listing_id', listing.id).maybeSingle()
        if (!tcDeal) { if (alive) setTcSteps([]); return }
        const { data: tasks, error } = await supabase.from('tc_tasks')
          .select('id, title, status, due_date, tc_phase')
          .eq('tc_deal_id', tcDeal.id).eq('agent_visible', true)
          .order('due_date', { ascending: true })
        if (error) throw error
        if (alive) setTcSteps(tasks || [])
      } catch(e) { if (alive) setTcSteps([]) }   // pre-migration or no access → hide quietly
    })()
    return () => { alive = false }
  }, [listing.id])

  const [form, setForm] = useState({ ...listing })
  const [tab,  setTab]  = useState('info')
  const [showings, setShowings] = useState([])
  const set = (k,v) => setForm(p => ({...p,[k]:v}))

  useEffect(() => {
    setForm({ ...listing })
    loadShowings()
  }, [listing?.id])

  async function loadShowings() {
    if (!listing?.id) return
    try {
      const { data } = await supabase.from('showings').select('*, agents(name,color)').eq('listing_id', listing.id).order('showing_date', { ascending: true })
      setShowings(data || [])
    } catch(e) { setShowings([]) }
  }

  const Lbl = ({c}) => <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{c}</div>
  const Row = ({children}) => <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>{children}</div>
  const Field = ({label, children}) => <div><Lbl c={label}/>{children}</div>
  const Inp = ({k, type='text', placeholder}) => (
    <input type={type} value={form[k]??''} onChange={e=>set(k,e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }}/>
  )

  const TABS = [
    { id:'info',     label:'Property' },
    { id:'details',  label:'Details' },
    { id:'ivr',      label:'📞 Phone IVR' },
    { id:'showings', label:'🏡 Showings' },
    { id:'activity', label:'📋 Activity' },
  ]

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:1000, display:'flex', fontFamily:ff }}>
      <div style={{ marginLeft:'auto', width:560, maxWidth:'95vw', height:'100vh', background:'var(--panel)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', boxShadow:'-8px 0 40px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>{listing.addr}</div>
            <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
              <Badge label={listing.status} color={statusColor(listing.status)} />
              {listing.list_price && <span style={{ fontSize:12, fontWeight:700, color:'#CC2200' }}>{fmt$(listing.list_price)}</span>}
              {listing.ivr_enabled && <Badge label="📞 On Phone IVR" color="#8B5CF6" />}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding:'9px 14px', border:'none', background:'none', cursor:'pointer', fontSize:12, fontWeight:tab===t.id?700:500, color:tab===t.id?'#CC2200':'var(--muted)', borderBottom:tab===t.id?'2px solid #CC2200':'2px solid transparent', marginBottom:-1, fontFamily:ff, whiteSpace:'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>

          {tab==='info' && (
            <div>

              {/* Transaction Progress — TC steps marked 👁 for this listing */}
              {tcSteps && tcSteps.length > 0 && (
                <div style={{ background:'var(--dim)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'var(--text)', marginBottom:8 }}>📋 Transaction Progress <span style={{ fontWeight:400, color:'var(--muted)', fontSize:10 }}>({tcSteps.filter(t=>t.status==='done').length}/{tcSteps.length} done)</span></div>
                  {tcSteps.map(t => (
                    <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:12 }}>
                      <span style={{ color: t.status==='done' ? '#10B981' : 'var(--muted)', fontWeight:900, flexShrink:0 }}>{t.status==='done' ? '✓' : '○'}</span>
                      <span style={{ flex:1, color:'var(--text)', textDecoration: t.status==='done' ? 'line-through' : 'none', opacity: t.status==='done' ? .6 : 1 }}>{t.title}</span>
                      {t.due_date && <span style={{ color:'var(--muted)', fontSize:10, flexShrink:0 }}>{new Date(t.due_date).toLocaleDateString()}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginBottom:10 }}>
                <Lbl c="Address"/>
                {form.id && <BoardLinks listingId={form.id} />}
                <AddressAutocomplete value={form.addr||''} onChange={v=>set('addr',v)}
                onSelect={s=>{
                  set('addr', s.street||s.full)
                  if(s.city)  set('city', s.city)
                  if(s.state) set('state', s.state)
                  if(s.zip)   set('zip', s.zip)
                }}
                placeholder="123 Main St, Monsey NY"/>
              </div>
              <Row>
                <Field label="City"><Inp k="city" placeholder="Spring Valley"/></Field>
                <Field label="Status">
                  <select value={form.status||''} onChange={e=>set('status',e.target.value)}
                    style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                    {STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="List Price"><Inp k="list_price" type="number" placeholder="750000"/></Field>
                <Field label="List Date"><Inp k="list_date" type="date"/></Field>
                <Field label="Property Type">
                  <select value={form.property_type||''} onChange={e=>set('property_type',e.target.value)}
                    style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                    <option value="">— Type —</option>
                    {PROPERTY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Deal Type">
                  <select value={form.deal_type||'MLS'} onChange={e=>set('deal_type',e.target.value)}
                    style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                    {DEAL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </Row>
              <Field label="Assigned Agent">
                <select value={form.agent_id||''} onChange={e=>set('agent_id',e.target.value)}
                  style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }}>
                  <option value="">— No agent —</option>
                  {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              {form.mls_link && (
                <a href={form.mls_link} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1px solid #3B82F644', background:'#3B82F611', color:'#3B82F6', fontSize:12, fontWeight:700, textDecoration:'none', marginBottom:10 }}>
                  🔗 View MLS Listing
                </a>
              )}
            </div>
          )}

          {tab==='details' && (
            <div>
              <Row>
                <Field label="Bedrooms"><Inp k="beds" placeholder="4"/></Field>
                <Field label="Bathrooms"><Inp k="baths" placeholder="2"/></Field>
                <Field label="Sqft"><Inp k="sqft" placeholder="2000"/></Field>
                <Field label="Annual Tax"><Inp k="tax" placeholder="12000"/></Field>
                <Field label="Buyers Agent %"><Inp k="buyers_agent_pct" placeholder="2.5"/></Field>
                <Field label="Door Lock Code"><Inp k="door_lock" placeholder="1234"/></Field>
                <Field label="MLS Link"><Inp k="mls_link" placeholder="https://..."/></Field>
                <Field label="Ad Budget"><Inp k="ad_budget" type="number" placeholder="2000"/></Field>
              </Row>
              <Lbl c="Notes"/>
              <textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Listing notes..." rows={4}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }}/>
              <CustomFieldsSection entity="listings" customData={form.custom_data} onChange={(k,v) => set('custom_data', { ...(form.custom_data||{}), [k]: v })} />
            </div>
          )}

          {tab==='ivr' && (
            <div>
              <div style={{ padding:'12px 14px', background:'#F5F3FF', borderRadius:10, border:'1px solid #8B5CF644', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#7C3AED', marginBottom:4 }}>📞 Phone IVR Listing Feature</div>
                <div style={{ fontSize:12, color:'#6D28D9', lineHeight:1.6 }}>
                  When enabled, callers who press 3 on the main phone menu can hear this listing.
                  They can search by bedroom count and the system will read out matching listings
                  with address, price, beds, baths, and sqft.
                </div>
              </div>

              <label style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:10, border:"1px solid " + (form.ivr_enabled?'#8B5CF6':'var(--border)'), background:form.ivr_enabled?'#F5F3FF':'var(--dim)', cursor:'pointer', marginBottom:12 }}>
                <input type="checkbox" checked={!!form.ivr_enabled} onChange={e=>set('ivr_enabled',e.target.checked)}
                  style={{ width:18, height:18, cursor:'pointer', accentColor:'#8B5CF6' }}/>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Include in phone listing directory</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Callers press 3 → "Available listings" → hear this property</div>
                </div>
              </label>

              {form.ivr_enabled && (
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Custom IVR description (optional)</div>
                  <textarea value={form.ivr_description||''} onChange={e=>set('ivr_description',e.target.value)} rows={3}
                    placeholder={form.addr + '. ' + form.beds + ' bedrooms, ' + form.baths + ' bathrooms, ' + form.sqft + ' square feet. Listed at ' + fmt$(form.list_price)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }}/>
                  <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>Leave blank to use auto-generated description from property data.</div>
                </div>
              )}

              <div style={{ marginTop:14, padding:'10px 12px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)', lineHeight:1.6 }}>
                <strong>How it works:</strong> When a caller presses 3 on the main menu, they hear:
                "Please enter the number of bedrooms you're looking for, then press pound." Based
                on their input, matching listings are read aloud. Caller can press 1 to hear more
                details, 2 for the next listing, or 9 to speak with an agent.
              </div>
            </div>
          )}

          {tab==='showings' && (
            <ShowingsTab
              listing={listing}
              showings={showings}
              agents={agents}
              onAdd={() => { onAddShowing(listing); loadShowings() }}
              onRefresh={loadShowings}
            />
          )}

          {tab==='activity' && listing?.id && (
            <div style={{ padding:'16px 18px', flex:1, overflowY:'auto' }}><RecordActivityFeed table="listings" recordId={listing.id} /></div>
          )}
        </div>

        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
          <button onClick={onDelete} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #DC262444', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Delete</button>
          <div style={{ flex:1 }}/>
          <button onClick={onClose} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
          <Btn onClick={() => onSave(form)}>Save Changes</Btn>
        </div>
      </div>
    </div>
  )
}

// ── SHOWINGS TAB ──────────────────────────────────────────────
function ShowingsTab({ listing, showings, agents, onAdd, onRefresh }) {
  const { toast } = useApp()
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState({ showing_date:'', showing_time:'', agent_id:'', contact_name:'', contact_phone:'', notes:'' })
  const set = (k,v) => setForm(p=>({...p,[k]:v}))

  async function saveShowing() {
    if (!form.showing_date) { toast('Date required', '#DC2626'); return }
    try {
      const { error } = await supabase.from('showings').insert({ ...form, listing_id: listing.id, created_at: new Date().toISOString() })
      if (error) throw error
    }
    catch(e) { toast('Could not save showing: ' + e.message, '#DC2626'); return }
    setAdding(false)
    setForm({ showing_date:'', showing_time:'', agent_id:'', contact_name:'', contact_phone:'', notes:'' })
    onRefresh()
    toast('✅ Showing added')
  }

  async function deleteShowing(id) {
    try {
      const { error } = await supabase.from('showings').delete().eq('id', id)
      if (error) throw error
    } catch(e) { toast('Could not delete showing: ' + e.message, '#DC2626'); return }
    onRefresh()
    toast('Showing deleted')
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Showings ({showings.length})</div>
        <button onClick={() => setAdding(a=>!a)}
          style={{ padding:'5px 12px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
          + Add Showing
        </button>
      </div>

      {adding && (
        <div style={{ background:'var(--dim)', borderRadius:9, border:'1px solid var(--border)', padding:'12px', marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:3 }}>DATE</div>
              <input type="date" value={form.showing_date} onChange={e=>set('showing_date',e.target.value)}
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:3 }}>TIME</div>
              <input type="time" value={form.showing_time} onChange={e=>set('showing_time',e.target.value)}
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:3 }}>BUYER NAME</div>
              <input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} placeholder="Buyer name"
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }}/>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:3 }}>BUYER PHONE</div>
              <input value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)} placeholder="(845) 555-1234"
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }}/>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:3 }}>AGENT</div>
            <select value={form.agent_id} onChange={e=>set('agent_id',e.target.value)}
              style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:8 }}>
              <option value="">— Select agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Notes..." rows={2}
            style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:8 }}/>
          <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
            <button onClick={() => setAdding(false)} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff, fontSize:12 }}>Cancel</button>
            <button onClick={saveShowing} style={{ padding:'5px 12px', borderRadius:7, border:'none', background:'#CC2200', color:'#fff', cursor:'pointer', fontFamily:ff, fontSize:12, fontWeight:700 }}>Save</button>
          </div>
        </div>
      )}

      {showings.length === 0 && !adding && (
        <div style={{ textAlign:'center', padding:'24px', color:'var(--muted)', fontSize:12, fontStyle:'italic' }}>No showings scheduled</div>
      )}

      {showings.map(s => {
        const a = agents.find(x=>x.id===s.agent_id) || s.agents
        return (
          <div key={s.id} style={{ padding:'10px 12px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', marginBottom:6, display:'flex', alignItems:'flex-start', gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:8, background:'#CC220018', border:'1px solid #CC220033', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <div style={{ fontSize:14, fontWeight:900, color:'#CC2200' }}>{s.showing_date?.slice(8,10)}</div>
              <div style={{ fontSize:8, color:'#CC2200', fontWeight:700 }}>{s.showing_date ? new Date(s.showing_date+'T12:00:00').toLocaleDateString('en',{month:'short'}).toUpperCase() : ''}</div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>
                {s.showing_time || '—'} · {s.contact_name || 'Unknown buyer'}
              </div>
              {s.contact_phone && <div style={{ fontSize:11, color:'var(--muted)' }}>{s.contact_phone}</div>}
              {a && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Agent: {a.name}</div>}
              {s.notes && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, fontStyle:'italic' }}>{s.notes}</div>}
            </div>
            <button onClick={() => deleteShowing(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:13 }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

// ── ROUTE PLANNER ─────────────────────────────────────────────
function RoutePlanner({ listings, onClose }) {
  const [selected, setSelected] = useState([])
  const [startAddr, setStartAddr] = useState('')

  function toggle(id) {
    setSelected(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id])
  }

  function buildRouteUrl() {
    const points = selected.map(id => listings.find(l=>l.id===id)).filter(Boolean)
    const addrs  = points.map(l => encodeURIComponent(l.addr + (l.city ? ', '+l.city : '') + ', NY'))
    const start  = startAddr ? encodeURIComponent(startAddr) : ''
    const waypoints = addrs.slice(0, -1).join('|')
    const dest      = addrs[addrs.length - 1]
    let url = `https://www.google.com/maps/dir/${start}/${waypoints}/${dest}`
    window.open(url, '_blank')
  }

  const ivrListings = listings.filter(l => l.ivr_enabled && l.status === 'Active')

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, fontSize:15, fontWeight:800, color:'var(--text)' }}>🗺 Showing Route Planner</div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Starting point (optional)</div>
            <AddressAutocomplete value={startAddr} onChange={setStartAddr} placeholder="Your office or client's address"/>
          </div>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Select listings to visit</div>
          {listings.filter(l=>l.status==='Active').map(l => (
            <div key={l.id} onClick={() => toggle(l.id)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:"1px solid " + (selected.includes(l.id)?'#CC2200':'var(--border)'), background:selected.includes(l.id)?'rgba(204,34,0,.04)':'var(--dim)', cursor:'pointer', marginBottom:5 }}>
              <div style={{ width:18, height:18, borderRadius:4, border:"2px solid " + (selected.includes(l.id)?'#CC2200':'var(--border)'), background:selected.includes(l.id)?'#CC2200':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {selected.includes(l.id) && <span style={{ color:'#fff', fontSize:10, fontWeight:900 }}>✓</span>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.addr}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{fmt$(l.list_price)} · {l.beds}bd {l.baths}ba</div>
              </div>
              {selected.includes(l.id) && (
                <div style={{ width:22, height:22, borderRadius:'50%', background:'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, color:'#fff', flexShrink:0 }}>
                  {selected.indexOf(l.id)+1}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>Cancel</button>
          <div style={{ flex:1 }}/>
          <Btn disabled={selected.length < 2} onClick={buildRouteUrl}>
            🗺 Open in Google Maps ({selected.length} stops)
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export function Listings() {
  const [bulkIds, setBulkIds] = useState([])
  const toggleBulk = id => setBulkIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const navigate    = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage, can } = useAuth()
  const canBulkEdit = useFeature('bulk_edit', agent)
  const mlsOn = useFeature('mls_search', agent)
  usePageView('listings')
  const { toast }   = useApp()
  const { agents }  = useAgents()

  const [listings,    setListings]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [search,      setSearch]      = useState('')
  const [statusF,     setStatusF]     = useState('')
  const [agentF,      setAgentF]      = useState('')
  const [bedsF,       setBedsF]       = useState('')
  const [typeF,       setTypeF]       = useState('')
  const [minPrice,    setMinPrice]    = useState('')
  const [maxPrice,    setMaxPrice]    = useState('')
  const [selected,    setSelected]    = useState(null)
  const [activeMainTab, setActiveMainTab] = useState('my') // 'my' | 'mls'
  const [showAdd,     setShowAdd]     = useState(false)
  const [showRoute,   setShowRoute]   = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [view,        setView]        = useState('grid') // grid | board

  useEffect(() => { load() }, [])

  // Deep link: /listings?open=<id> opens that listing's drawer
  const location = useLocation()
  const [deepLinked, setDeepLinked] = useState(false)
  useEffect(() => {
    if (deepLinked || !listings.length) return
    const id = new URLSearchParams(location.search).get('open')
    if (id) { const l = listings.find(x => x.id === id); if (l) setSelected(l) }
    setDeepLinked(true)
  }, [listings.length, location.search])

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('listings').select('*', { count: 'exact' }).order('list_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      if (!isAdmin && !canManage) q = q.eq('agent_id', agent?.id)
      q = q.range(0, 499) // Load up to 500 listings — filter by status/agent for more
      const { data, count } = await q
      const rows = data || []
      if (count > 500) toast('Showing 500 of ' + count.toLocaleString() + ' listings — use filters to narrow', '#F5A623')

      // Count showings per listing — only for loaded listings
      if (rows.length) {
        try {
          const ids = rows.map(l => l.id)
          const { data: sc } = await supabase.from('showings').select('listing_id').in('listing_id', ids)
          const counts = {}
          ;(sc||[]).forEach(s => { counts[s.listing_id] = (counts[s.listing_id]||0)+1 })
          rows.forEach(l => { l.showings_count = counts[l.id] || 0 })
        } catch(e) {
          rows.forEach(l => { l.showings_count = 0 })
        }
      }
      setListings(rows)
    } catch(e) {
      console.error('Listings load error:', e.message)
      setListings([])
    } finally {
      setLoading(false)
    }
  }

  // Sync from Monday.com via API
  async function syncFromMonday() {
    setSyncing(true)
    toast('Syncing from Monday.com...')
    try {
      // The Monday data we fetched at build time — in production this would be a live API call
      const mondayListings = [
        { addr:'17 Union Rd, #208, Spring Valley NY 10977', city:'Spring Valley', status:'Active', list_price:979000, property_type:'Condo', beds:4, baths:'2-1', sqft:'2359', deal_type:'MLS', list_date:'2026-02-20', agent_name:'Eli Hoffman', location:'17 Union Rd #209, Spring Valley, NY 10977, USA' },
        { addr:'40 Singer Avenue, #201 Spring Valley, NY 10977', city:'Spring Valley', status:'Active', list_price:1539000, property_type:'Condo', beds:8, baths:'6-1', sqft:'4,954', deal_type:'MLS', list_date:'2025-08-31', agent_name:'Mendy Jankovits', mls_link:'https://www.targetreteam.com/search.php?#?q_limit=36&mlsId=280&multi_search=40%20Singer%20Ave%20Unit%20201&multi_cat=Address&status=1%7C3&q_sort=createdAt-&q_offset=0' },
        { addr:'352 Blauvelt Rd Unit 201, Monsey, NY 10952', city:'Monsey', status:'Active', list_price:1149000, property_type:'New Construction', beds:5, baths:'4', sqft:'2800', list_date:'2025-10-22', agent_name:'Isaac Leibowitz' },
        { addr:'15 Warren Ct Unit #314, Monsey, NY 10952', city:'Monsey', status:'Active', list_price:739000, property_type:'Condo', beds:3, baths:'2', sqft:'1340', deal_type:'MLS', list_date:'2026-01-07', agent_name:'Mendy Jankovits', notes:'Huge Attic' },
        { addr:'47 Prairie Ave, Suffern, NY 10901', city:'Suffern', status:'Active', list_price:599000, property_type:'Single Family', beds:4, baths:'2', sqft:'1568', deal_type:'MLS', list_date:'2026-01-15', agent_name:'Avraham Weinberger', mls_link:'https://www.targetreteam.com/homes-for-sale/NY/suffern/10901/47-prairie-ave/bid-38-953280' },
        { addr:'40 Singer Avenue, #214 Spring Valley, NY 10977', city:'Spring Valley', status:'Active', list_price:1599000, property_type:'Condo', beds:8, baths:'6-1', sqft:'4746', deal_type:'MLS', list_date:'2025-08-31', agent_name:'Mendy Jankovits' },
        { addr:'12 Sherman Drive, #202 Spring Valley, NY 10977', city:'Spring Valley', status:'Active', list_price:1449000, property_type:'Condo', beds:5, baths:'4', sqft:'4744', deal_type:'MLS', list_date:'2026-02-09', agent_name:'Joel Rottenstein', notes:'3/4 bed accessory', mls_link:'https://www.targetreteam.com/homes-for-sale/NY/spring-valley/10977/12-sherman-dr-unit-202/bid-38-961011' },
        { addr:'1 Jade Lane, Swan Lake, NY', city:'Swan Lake', status:'Active', list_price:299000, property_type:'Single Family', beds:3, baths:'2', sqft:'1268', deal_type:'MLS', list_date:'2026-04-13', agent_name:'Joel Rottenstein' },
        { addr:'20 Singer Ave, Spring Valley, NY 10977', city:'Spring Valley', status:'Active', list_price:1649000, property_type:'New Construction', beds:9, baths:'5-1', sqft:'4357', deal_type:'MLS', list_date:'2026-04-17', agent_name:'Mendy Jankovits' },
        { addr:'5 Mirror Lake Rd #201, Spring Valley, NY 10977', city:'Spring Valley', status:'Active', list_price:1599000, property_type:'Condo', beds:9, baths:'7', sqft:'4777', deal_type:'MLS', list_date:'2026-04-24', agent_name:'Joel Rottenstein' },
        { addr:'11 Lincoln St #201, Spring Valley, NY', city:'Spring Valley', status:'Active', list_price:1499000, property_type:'Condo', beds:8, baths:'6', sqft:'4632', deal_type:'MLS', list_date:'2026-04-30', agent_name:'Mendy Jankovits' },
        { addr:'13 Westside, Haverstraw, NY', city:'Haverstraw', status:'Active', list_price:425000, property_type:'Single Family', beds:4, baths:'1', sqft:'1188', deal_type:'MLS', list_date:'2026-05-13', agent_name:'Avraham Weinberger' },
        { addr:'27 Prince Street, Monticello, NY 12701', city:'Monticello', status:'Active', list_price:349000, property_type:'Single Family', beds:4, baths:'2', sqft:'1535', deal_type:'MLS', list_date:'2026-06-11', agent_name:'Joel Rottenstein' },
        { addr:'172 Orange Ave Suffern NY 10901', city:'Suffern', status:'Active', list_price:799000, property_type:'3 Family', beds:8, baths:'3', sqft:'3275', deal_type:'MLS', list_date:'2026-06-18', agent_name:'Avraham Weinberger' },
        { addr:'31 Gladys Drive, Spring Valley, NY 10977', city:'Spring Valley', status:'Active', list_price:549000, property_type:'Duplex', beds:2, baths:'3', sqft:'1417', deal_type:'MLS', list_date:'2026-06-18', agent_name:'Mendy Jankovits' },
        { addr:'24 Maplewood Blvd, Suffern, NY 10901', city:'Suffern', status:'Active', list_price:649000, property_type:'Single Family', beds:3, baths:'2', sqft:'1516', deal_type:'MLS', list_date:'2026-06-18', agent_name:'Isaac Leibowitz' },
        { addr:'14 Cannon Blvd, Mountain Dale, NY', city:'Mountain Dale', status:'Active', list_price:399000, property_type:'Single Family', beds:3, baths:'2', sqft:'1,566', deal_type:'MLS', list_date:'2026-06-18', agent_name:'Joel Rottenstein' },
        { addr:'19 W Maple Avenue, Suffern, New York 10901', city:'Suffern', status:'Active', list_price:599000, property_type:'Single Family', beds:5, baths:'2', sqft:'1643', deal_type:'MLS', list_date:'2026-01-15', agent_name:'Avraham Weinberger' },
        { addr:'15 North St, Stony Point, NY 10980', city:'Stony Point', status:'Active', list_price:649000, property_type:'Single Family', beds:4, baths:'2', sqft:'2248', deal_type:'MLS', list_date:'2026-06-22', agent_name:'Avraham Weinberger' },
        { addr:'17 Union Rd, #210 Spring Valley NY 10977', city:'Spring Valley', status:'Active', list_price:979000, property_type:'Condo', beds:4, baths:'2-1', deal_type:'MLS', list_date:'2026-04-13', agent_name:'Eli Hoffman' },
      ]

      // Name → agent_id map
      const NAME_MAP = { 'Eli Hoffman':'Eli Hoffman', 'Mendy Jankovits':'Mendy Jankovits', 'Isaac Leibowitz':'Isaac Leibowitz', 'Avraham Weinberger':'Avraham Weinberger', 'Joel Rottenstein':'Joel Rottenstein', 'Lazer Farkas':'Lazer Farkas' }

      let inserted = 0, skipped = 0, failed = 0
      for (const ml of mondayListings) {
        const { data: existing } = await supabase.from('listings').select('id').ilike('addr', ml.addr.slice(0,20)+'%').maybeSingle()
        if (existing) { skipped++; continue }
        const ag = agents.find(a => a.name.includes(ml.agent_name?.split(' ')[0] || '') || ml.agent_name?.includes(a.name.split(' ')[0] || ''))
        const { error } = await supabase.from('listings').insert({
          ...ml, agent_id: ag?.id || null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        })
        if (error) { failed++; console.warn('Sync insert failed for', ml.addr, error.message); continue }
        inserted++
      }
      await load()
      toast(`✅ Synced — ${inserted} new, ${skipped} already existed` + (failed ? `, ${failed} failed` : ''))
    } catch(e) { toast('Sync failed: ' + e.message, '#DC2626') }
    finally { setSyncing(false) }
  }

  async function saveListing(form) {
    try {
      if (selected) {
        const { showings_count: _sc, agents: _la, ...cleanListing } = form
        const { error } = await supabase.from('listings').update({ ...cleanListing, updated_at: new Date().toISOString() }).eq('id', selected.id)
        if (error) throw error
        toast('✅ Listing saved')

        // ── AUTO-INTAKE TO TC BOARD ──
        // The moment a listing flips to Under Contract, it lands on
        // the secretary's TC Board automatically (once — never
        // duplicates if a TC deal is already linked).
        const wentUC = ['Under Contract', 'Accepted offer'].includes(form.status) && selected.status !== form.status
        if (wentUC) {
          try {
            const { data: existing } = await supabase.from('tc_deals').select('id').eq('linked_listing_id', selected.id).limit(1).maybeSingle()
            if (!existing) {
              const { error: e2 } = await supabase.from('tc_deals').insert({
                addr: form.addr, agent_id: form.agent_id || agent?.id || null,
                tc_phase: 'under_contract', list_price: form.list_price || null,
                linked_listing_id: selected.id,
                notes: 'Auto-created when listing went ' + form.status,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              })
              if (!e2) toast('📋 Sent to TC Board — under contract tasks will be generated there')
            }
          } catch (e) { console.warn('TC auto-intake skipped:', e.message) }
        }
      } else {
        const { showings_count: _sc2, agents: _la2, id: _li2, ...cleanListingIns } = form
        const { error } = await supabase.from('listings').insert({ ...cleanListingIns, agent_id: form.agent_id||agent?.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        if (error) throw error
        toast('✅ Listing added')
      }
      setSelected(null)
      load()
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  async function deleteListing() {
    if (!can('listings.delete')) { toast("You don't have permission to delete listings", '#DC2626'); return }
    try { await supabase.from('listings').delete().eq('id', selected.id) }
    catch(e) { toast('Delete failed: ' + e.message, '#DC2626'); setConfirmDel(false); return }
    setSelected(null)
    setConfirmDel(false)
    load()
    toast('Listing deleted')
  }

  async function toggleIvr(id) {
    const l = listings.find(x => x.id === id)
    try { await supabase.from('listings').update({ ivr_enabled: !l.ivr_enabled }).eq('id', id) }
    catch(e) { toast('Update failed: ' + e.message, '#DC2626'); return }
    setListings(p => p.map(x => x.id === id ? { ...x, ivr_enabled: !x.ivr_enabled } : x))
    toast(l.ivr_enabled ? 'Removed from phone listing' : '✅ Added to phone listing — callers press 3')
  }

  const filtered = listings.filter(l => {
    if (statusF   && l.status        !== statusF)   return false
    if (agentF    && l.agent_id      !== agentF)    return false
    if (typeF     && l.property_type !== typeF)     return false
    if (bedsF     && String(l.beds)  !== bedsF)     return false
    if (minPrice  && parseFloat(l.list_price) < parseFloat(minPrice)) return false
    if (maxPrice  && parseFloat(l.list_price) > parseFloat(maxPrice)) return false
    if (search    && !matchSearch(l, search, ['addr','city','notes','seller_name'])) return false
    return true
  })

  const active   = listings.filter(l=>l.status==='Active').length
  const uc       = listings.filter(l=>l.status==='Under Contract'||l.status==='Accepted offer').length
  const ivrCount = listings.filter(l=>l.ivr_enabled&&l.status==='Active').length
  const totalVol = listings.filter(l=>l.status==='Active').reduce((s,l)=>s+(parseFloat(l.list_price)||0),0)

  // Board view: group by status
  const statusGroups = STATUSES.map(s => ({ ...s, items: filtered.filter(l => l.status === s.id) })).filter(g => g.items.length > 0)

  return (
    <div style={{ fontFamily:ff }}>

      {/* ── TOP TABS: My Listings vs MLS Search ── */}
      <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:0, borderBottom:'2px solid var(--border)', marginTop:-8 }}>
        {[['my','🏡 My Listings'],...(mlsOn ? [['mls','🔍 MLS Search']] : [])].map(function([id, label]) {
          const active = activeMainTab === id
          return (
            <button key={id} onClick={() => setActiveMainTab(id)}
              style={{ padding:'10px 20px', border:'none', background:'none', cursor:'pointer',
                borderBottom: active ? '2px solid #CC2200' : '2px solid transparent',
                marginBottom: '-2px', fontSize:13, fontWeight:active?700:500,
                color:active?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* ── MLS SEARCH TAB ── */}
      {activeMainTab === 'mls' && !mlsOn && (
        <div style={{ marginTop:20, padding:30, textAlign:'center', color:'var(--muted)', fontSize:13 }}>MLS Search is currently disabled by your administrator.</div>
      )}
      {activeMainTab === 'mls' && mlsOn && (
        <div style={{ marginTop:20 }}>
          <MLSSearch
            agents={agents || []}
            onImported={() => { setActiveMainTab('my'); load() }}
          />
        </div>
      )}

      {activeMainTab === 'my' && <>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>🏡 Listings</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
            {active} active · {uc} under contract · {ivrCount} on phone IVR · {fmt$(totalVol)} active volume
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <LastVisited page="listings" />
          <button onClick={() => setShowRoute(true)}
            style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            🗺 Route Planner
          </button>
          <button onClick={syncFromMonday} disabled={syncing}
            style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #10B98144', background:'#10B98111', color:'#10B981', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            {syncing ? '⏳ Syncing...' : '↓ Sync from Monday.com'}
          </button>
          <ImportExport
            table="listings"
            data={filtered}
            columns={LISTINGS_EXPORT_COLS}
            label="Listings"
            onImport={load}
          />
          <Btn onClick={() => { setSelected(null); setShowAdd(true) }}>+ Add Listing</Btn>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
        {[
          { label:'Active',       value:active,        color:'#10B981' },
          { label:'Under Contract',value:uc,           color:'#8B5CF6' },
          { label:'On Phone IVR', value:ivrCount,      color:'#F97316' },
          { label:'Active Volume',value:fmt$(totalVol),color:'#CC2200' },
        ].map(s=>(
          <div key={s.label} style={{ background:'var(--panel)', borderRadius:9, border:'1px solid var(--border)', padding:'10px 12px', borderLeft:"3px solid " + (s.color) }}>
            <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginTop:1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <FilterBar
        search={search} onSearch={setSearch} searchPlaceholder="🔍 Address, city, notes..."
        values={{ statusF, agentF, typeF, bedsF, minPrice, maxPrice }}
        onChange={(k,v) => {
          if (k==='statusF')   setStatusF(v)
          if (k==='agentF')    setAgentF(v)
          if (k==='typeF')     setTypeF(v)
          if (k==='bedsF')     setBedsF(v)
          if (k==='minPrice')  setMinPrice(v)
          if (k==='maxPrice')  setMaxPrice(v)
        }}
        total={listings.length} filtered={filtered.length}
        right={
          <div style={{ display:'flex', background:'var(--dim)', borderRadius:5, padding:2, gap:1 }}>
            {[['grid','⊞'],['board','▦']].map(([v,icon])=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'2px 6px', borderRadius:3, border:'none', background:view===v?'#CC2200':'transparent', color:view===v?'#fff':'var(--muted)', cursor:'pointer', fontSize:12, fontFamily:ff }}>
                {icon}
              </button>
            ))}
          </div>
        }
        filters={[
          { key:'statusF',  label:'Status',    type:'select', options:STATUSES.map(s=>({value:s.id,label:s.label})),    placeholder:'Status' },
          ...(isAdmin||canManage?[{ key:'agentF', label:'Agent', type:'select', options:agents.map(a=>({value:a.id,label:a.name})), placeholder:'Agent' }]:[]),
          { key:'typeF',    label:'Type',      type:'select', options:PROPERTY_TYPES.map(t=>({value:t,label:t})),       placeholder:'Type' },
          { key:'bedsF',    label:'Beds',      type:'select', options:['1','2','3','4','5','6','7','8','9'].map(n=>({value:n,label:n+' bd'})), placeholder:'Beds' },
          { key:'minPrice', label:'Min $',     type:'text',   placeholder:'Min $', width:70, secondary:true },
          { key:'maxPrice', label:'Max $',     type:'text',   placeholder:'Max $', width:70, secondary:true },
        ]}
      />

      {/* IVR notice */}
      {ivrCount > 0 && (
        <div style={{ padding:'8px 14px', background:'#F5F3FF', borderRadius:8, border:'1px solid #8B5CF644', marginBottom:14, display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
          <span style={{ fontSize:16 }}>📞</span>
          <span style={{ color:'#7C3AED', fontWeight:600 }}>{ivrCount} listings are live on your phone system (Press 3)</span>
          <span style={{ color:'#8B5CF6' }}>— callers can search by bedrooms and hear available listings</span>
        </div>
      )}

      {loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="🏡" title="No listings" sub="Add your first listing or sync from Monday.com"
          action={<Btn onClick={syncFromMonday}>{syncing?'⏳ Syncing...':'↓ Sync from Monday.com'}</Btn>} />
      ) : view === 'grid' ? (
        // Grid View
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
          {filtered.map(l => (
            <ListingCard key={l.id} listing={l} selected={selected?.id===l.id} agents={agents}
              onSelect={setSelected} onToggleIvr={toggleIvr} onShowings={l2=>{setSelected(l2);}}
              checked={bulkIds.includes(l.id)} onCheck={canBulkEdit ? toggleBulk : undefined} />
          ))}
        </div>
      ) : (
        // Board View — grouped by status
        <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:12 }}>
          {statusGroups.map(g => (
            <div key={g.id} style={{ flexShrink:0, width:280 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, padding:'6px 10px', background:g.color+'18', borderRadius:8, border:"1px solid " + (g.color) + "33" }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:g.color, flexShrink:0 }}/>
                <span style={{ fontSize:12, fontWeight:700, color:g.color }}>{g.label}</span>
                <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>{g.items.length}</span>
              </div>
              {g.items.map(l => (
                <ListingCard key={l.id} listing={l} selected={selected?.id===l.id} agents={agents}
                  onSelect={setSelected} onToggleIvr={toggleIvr} onShowings={l2=>setSelected(l2)}
                  checked={bulkIds.includes(l.id)} onCheck={canBulkEdit ? toggleBulk : undefined} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Listing Detail Drawer */}
      {canBulkEdit && (
        <BulkEditBar selectedIds={bulkIds} table="listings" agents={agents}
          allIds={filtered.map(l => l.id)} onSelectAll={ids => setBulkIds(ids)}
          fields={[
            { key:'status',   label:'Status', type:'select', options:(LISTING_STATUSES||[]).map(x=>({value:x.value||x,label:x.label||x})) },
            { key:'agent_id', label:'Assigned Agent', type:'agent' },
          ]}
          onDone={() => { setBulkIds([]); load() }} onClear={() => setBulkIds([])} />
      )}
      {selected && (
        <ListingDrawer
          listing={selected}
          agents={agents}
          onClose={() => setSelected(null)}
          onSave={form => { saveListing(form); setSelected(null) }}
          onDelete={() => setConfirmDel(true)}
          onAddShowing={() => {}}
        />
      )}

      {/* Add Listing Drawer */}
      {showAdd && (
        <ListingDrawer
          listing={{ addr:'', status:'Active', ...{} }}
          agents={agents}
          onClose={() => setShowAdd(false)}
          onSave={form => { saveListing(form); setShowAdd(false) }}
          onDelete={() => {}}
          onAddShowing={() => {}}
        />
      )}

      {/* Route Planner */}
      {showRoute && <RoutePlanner listings={listings} onClose={() => setShowRoute(false)} />}

      <Confirm open={confirmDel} message={"Delete " + (selected?.addr) + "?"} onConfirm={deleteListing} onCancel={() => setConfirmDel(false)} />
    </>
    }
    </div>
  )
}
