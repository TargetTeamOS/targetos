// ═══════════════════════════════════════════════════════════════
// ListingWorkspace (Phase 1 — full-width, July 2026)
// Full-page agent listing hub (replaces the side drawer). Inline
// editing with Save; only existing data. Tabs: Overview · Buyer
// Interest & Showings · Seller Updates · Marketing & Ads · Price
// History · Seller Contacts · Documents (placeholder) · Activity Log.
// Add-showing / schedule-OH still use the parent's modals for now.
// No new tables/columns.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate } from '../lib/utils'
import { Avatar } from './UI'
import SellerContacts from './SellerContacts'

const ff = 'Inter,system-ui,sans-serif'
const ALL_TABS = [
  { id:'tasks',     label:'Tasks / Next Action' },
  { id:'feedback',  label:'Buyer Feedback' },
  { id:'report',    label:'Seller Report' },
  { id:'marketing', label:'Marketing' },
  { id:'price',     label:'Price & Activity' },
  { id:'notes',     label:'Notes' },
  { id:'admin',     label:'Admin Log', adminOnly:true },
]
const LISTING_STATUSES = ['Active','Coming Soon','Under Contract','Sold','Expired','Withdrawn']
const STATUS_COLORS = { 'Active':'#10B981','Coming Soon':'#8B5CF6','Under Contract':'#F97316','Sold':'#3B82F6','Expired':'#DC2626','Withdrawn':'#94A3B8' }

function dom(l) {
  const s = l.listed_date || l.list_date || l.created_at
  return s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : null
}
const interestColor = n => n >= 4 ? '#10B981' : n >= 3 ? '#F5A623' : '#DC2626'

export default function ListingWorkspace({
  listing, agent, showings = [], openHouses = [], onBack, onSaved,
  onLogShowing, onScheduleOH, canViewAdminLog = false,
}) {
  const [tab, setTab] = useState('tasks')
  const [adminLog, setAdminLog] = useState([]); const [logLoading, setLogLoading] = useState(false)
  const [mktTasks, setMktTasks] = useState(null)   // null=not loaded, []=none
  const [saving, setSaving] = useState('')

  // editable field buffers
  const [status, setStatus] = useState(listing.status || 'Active')
  const [price, setPrice] = useState(listing.list_price || '')
  const [sellerDate, setSellerDate] = useState(listing.seller_updated_at ? listing.seller_updated_at.slice(0,10) : '')
  const [mktStatus, setMktStatus] = useState(listing.marketing_status || '')
  const [notes, setNotes] = useState(listing.notes || '')

  useEffect(() => {
    setStatus(listing.status || 'Active'); setPrice(listing.list_price || '')
    setSellerDate(listing.seller_updated_at ? listing.seller_updated_at.slice(0,10) : '')
    setMktStatus(listing.marketing_status || ''); setNotes(listing.notes || ''); setTab('tasks')
  }, [listing.id])

  async function loadAdminLog() {
    setLogLoading(true)
    try {
      const { data } = await supabase.from('audit_log').select('*, agents(id,name,color)')
        .eq('record_id', listing.id).order('created_at', { ascending:false }).limit(100)
      setAdminLog(data || [])
    } catch { setAdminLog([]) }
    setLogLoading(false)
  }
  useEffect(() => {
    if (tab === 'admin' || tab === 'price') loadAdminLog()
  }, [tab, listing.id])

  // Marketing: read the linked tc_deal's marketing tasks (read-only)
  useEffect(() => {
    if (tab !== 'marketing') return
    let alive = true
    ;(async () => {
      try {
        const r = await supabase.from('tc_deals').select('id').eq('linked_listing_id', listing.id).maybeSingle()
        if (!r.data?.id) { if (alive) setMktTasks([]); return }
        const t = await supabase.from('tc_tasks').select('id,title,status,due_date,phase').eq('deal_id', r.data.id)
        const MKT = /photo|mls|brochure|social|ad\b|ads|marketing|drone|floor plan|flyer|sign|video|publication|email blast/i
        if (alive) setMktTasks((t.data || []).filter(x => MKT.test(x.title || '')))
      } catch { if (alive) setMktTasks([]) }
    })()
    return () => { alive = false }
  }, [tab, listing.id])

  async function saveField(key, value, label) {
    setSaving(key)
    try {
      const { error } = await supabase.from('listings').update({ [key]: value, updated_at: new Date().toISOString() }).eq('id', listing.id)
      if (error) throw error
      onSaved?.({ ...listing, [key]: value })
    } catch (e) { alert('Could not save ' + (label||key) + ': ' + (e.message||e)) }
    setSaving('')
  }
  async function savePrice() {
    const newPrice = parseFloat(String(price).replace(/[$,]/g,''))
    if (!newPrice) { alert('Enter a valid price'); return }
    setSaving('price')
    try {
      const oldPrice = listing.list_price
      // Append to price_history jsonb (existing column)
      const existingPH = Array.isArray(listing.price_history) ? listing.price_history : []
      const phEntry = { old_price: oldPrice ?? null, new_price: newPrice, date: new Date().toISOString().slice(0,10), by: agent?.name || null }
      const newPH = [...existingPH, phEntry]
      const { error } = await supabase.from('listings').update({ list_price:newPrice, price_history:newPH, updated_at:new Date().toISOString() }).eq('id', listing.id)
      if (error) throw error
      try {
        await supabase.from('audit_log').insert({ agent_id:agent?.id||listing.agent_id, table_name:'listings', record_id:listing.id,
          action:'updated', field_name:'list_price', old_value:String(oldPrice), new_value:String(newPrice),
          metadata:{ description:'Price changed from '+fmt$(oldPrice)+' to '+fmt$(newPrice) }, created_at:new Date().toISOString() })
      } catch {}
      try {
        const r = await supabase.from('tc_deals').select('id').eq('linked_listing_id', listing.id).maybeSingle()
        if (r.data?.id) await supabase.from('tc_deals').update({ list_price:newPrice, updated_at:new Date().toISOString() }).eq('id', r.data.id)
      } catch {}
      onSaved?.({ ...listing, list_price:newPrice, price_history:newPH })
      if (tab === 'price') loadAdminLog()   // refresh merged view
    } catch (e) { alert('Could not save price: ' + (e.message||e)) }
    setSaving('')
  }
  async function updateShowing(id, patch) {
    try {
      const { error } = await supabase.from('listing_showings').update(patch).eq('id', id)
      if (error) throw error
      onSaved?.(listing, { showingId:id, patch })
    } catch (e) { alert('Could not update showing: ' + (e.message||e)) }
  }

  const d = dom(listing)
  const sc = STATUS_COLORS[status] || '#94A3B8'
  const avgInterest = showings.length ? (showings.reduce((s,x)=>s+(x.interest_level||3),0)/showings.length).toFixed(1) : null
  const ph = Array.isArray(listing.price_history) ? listing.price_history : []
  const sellerOverdue = !listing.seller_updated_at || (Date.now() - new Date(listing.seller_updated_at).getTime() > 7*86400000)

  // Derive common objections/themes from existing feedback text (keyword frequency)
  const objections = (() => {
    const THEMES = [
      ['price','too expensive|overpriced|price|expensive|high'],
      ['size','too small|small|tight|cramped|space'],
      ['condition','needs work|dated|old|repair|fix|condition|renovat'],
      ['layout','layout|flow|floor plan|awkward'],
      ['location','location|street|busy|noise|neighborhood'],
      ['kitchen','kitchen'],
      ['parking','parking|garage|driveway'],
    ]
    const counts = {}
    showings.forEach(s => {
      const txt = (s.feedback || '').toLowerCase()
      if (!txt) return
      THEMES.forEach(([label, re]) => { if (new RegExp(re).test(txt)) counts[label] = (counts[label]||0)+1 })
    })
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5)
  })()

  // Recommended next action (from existing data)
  const recommendation = (() => {
    if (sellerOverdue && (status==='Active'||status==='Coming Soon')) return 'Seller update is overdue — send a status update to the seller.'
    if (showings.length===0 && status==='Active') return 'No showings yet — review pricing and marketing exposure.'
    if (avgInterest && +avgInterest < 2.5 && showings.length>=3) return 'Interest is low across several showings — consider a price adjustment or addressing common objections.'
    if (objections.some(([w])=>w==='price') && showings.length>=3) return 'Price is a recurring objection — discuss a price adjustment with the seller.'
    if (d!=null && d>60 && status==='Active') return 'On market 60+ days — refresh marketing and reassess price with the seller.'
    return 'On track — keep the seller informed with the latest showing feedback.'
  })()

  // group showings by agent who showed
  const agentName = () => agent?.name
  const groups = {}
  showings.forEach(s => { const k = s.agent_name || agentName() || 'Unknown agent'; (groups[k]=groups[k]||[]).push(s) })

  const card = { background:'var(--dim)', borderRadius:8, padding:'10px 12px' }
  const cLabel = { fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }
  const inp = { padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const saveBtn = k => ({ padding:'7px 12px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity: saving===k?0.6:1 })
  const sectionTitle = { fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }

  const statTile = (label, value, sub, color, goTab) => (
    <button onClick={goTab ? ()=>setTab(goTab) : undefined}
      onMouseEnter={goTab ? e=>{ e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,.1)'; e.currentTarget.style.transform='translateY(-1px)' } : undefined}
      onMouseLeave={goTab ? e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none' } : undefined}
      style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', minWidth:0,
        cursor: goTab?'pointer':'default', textAlign:'left', fontFamily:ff, transition:'box-shadow .15s, transform .15s' }}>
      <div style={{ fontSize:22, fontWeight:900, color: color||'var(--text)', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10.5, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginTop:5 }}>{label}{goTab && <span style={{ opacity:.5 }}> ›</span>}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
    </button>
  )

  return (
    // Full-screen breakout: escape Layout's 1400px padded container
    <div style={{ fontFamily:ff, position:'relative', left:'50%', right:'50%', marginLeft:'-50vw', marginRight:'-50vw', width:'100vw', minHeight:'100vh', marginTop:-28, background:'var(--bg)' }}>

      {/* ══ FULL PROPERTY HEADER ══ */}
      <div style={{ background:'linear-gradient(180deg, var(--panel), var(--bg))', borderBottom:'1px solid var(--border)', borderTop:'4px solid '+sc }}>
        <div style={{ maxWidth:1440, margin:'0 auto', padding:'16px 28px 20px' }}>
          <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:14, padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>← Back to My Listings</button>

          <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
            {/* Property photo / placeholder */}
            <div style={{ width:140, height:104, borderRadius:12, overflow:'hidden', flexShrink:0, background:'var(--dim)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {listing.photo_url
                ? <img src={listing.photo_url} alt="listing" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none'; e.target.parentNode.innerHTML='<span style=font-size:32px>🏡</span>'}} />
                : <span style={{ fontSize:32 }}>🏡</span>}
            </div>

            {/* Address + meta */}
            <div style={{ flex:1, minWidth:240 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span style={{ fontSize:26, fontWeight:900, color:'var(--text)', letterSpacing:'-.01em' }}>{listing.addr || '—'}</span>
                <span style={{ fontSize:12, fontWeight:800, color:'#fff', background:sc, padding:'3px 12px', borderRadius:99 }}>{status}</span>
              </div>
              <div style={{ fontSize:13.5, color:'var(--muted)', marginTop:5 }}>
                {[listing.city, listing.state, listing.zip].filter(Boolean).join(', ') || listing.city || ''}
              </div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginTop:8, fontSize:12.5, color:'var(--muted)' }}>
                {d!=null && <span>DOM <strong style={{ color:'var(--text)' }}>{d}</strong></span>}
                {listing.mls_number && <span>MLS <strong style={{ color:'var(--text)' }}>{listing.mls_number}</strong></span>}
                {listing.source && <span>Source <strong style={{ color:'var(--text)' }}>{listing.source}</strong></span>}
                {listing.mls_link && <a href={listing.mls_link} target="_blank" rel="noreferrer" style={{ color:'#3B82F6', fontWeight:700, textDecoration:'none' }}>MLS link ↗</a>}
              </div>
            </div>

            {/* Price + agent */}
            <div style={{ textAlign:'right', minWidth:180 }}>
              <div style={{ fontSize:24, fontWeight:900, color:'var(--text)' }}>{listing.list_price?fmt$(listing.list_price):'—'}</div>
              {listing.original_price && listing.original_price!==listing.list_price && <div style={{ fontSize:12, color:'var(--muted)', textDecoration:'line-through' }}>{fmt$(listing.original_price)}</div>}
              <div style={{ display:'flex', gap:8, alignItems:'center', justifyContent:'flex-end', marginTop:10 }}>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{agent?.name || '—'}</div>
                  <div style={{ fontSize:10.5, color:'var(--muted)' }}>Primary agent</div>
                </div>
                {agent && <Avatar agent={agent} size={38} />}
              </div>
            </div>
          </div>

          {/* Quick actions + clickable stat cards */}
          <div style={{ display:'flex', gap:8, marginTop:16, flexWrap:'wrap' }}>
            <button onClick={()=>onLogShowing?.(listing)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid var(--brand)', background:'rgba(204,34,0,.06)', color:'var(--brand)', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff }}>👀 Add showing</button>
            <button onClick={()=>onScheduleOH?.(listing)} style={{ padding:'8px 14px', borderRadius:9, border:'1px solid #3B82F6', background:'rgba(59,130,246,.06)', color:'#3B82F6', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff }}>📅 Open house</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginTop:14 }}>
            {statTile('Showings', showings.length, avgInterest?'avg '+avgInterest+'/5':null, '#8B5CF6', 'feedback')}
            {statTile('Open houses', openHouses.length, null, '#3B82F6', 'feedback')}
            {statTile('Price', listing.list_price?fmt$(listing.list_price):'—', null, null, 'price')}
            {statTile('Price changes', ph.length, null, null, 'price')}
            {statTile('Marketing', mktStatus||'not set', null, null, 'marketing')}
            {statTile('Last seller update', listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never', sellerOverdue?'overdue':null, listing.seller_updated_at&&!sellerOverdue?'var(--text)':'#DC2626', 'report')}
          </div>
        </div>
      </div>

      {/* ══ 3-COLUMN WORKSPACE ══ */}
      <div style={{ maxWidth:1440, margin:'0 auto', padding:'20px 28px 48px', display:'grid', gridTemplateColumns:'260px 1fr 260px', gap:20, alignItems:'start' }}>

        {/* LEFT: People / Seller Contacts / Documents */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <SellerContacts listingId={listing.id} listingAgentId={listing.agent_id} />
          </div>
          {listing.photo_url && (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
              <div style={sectionTitle}>Photo</div>
              <a href={listing.photo_url} target="_blank" rel="noreferrer" style={{ color:'#3B82F6', fontWeight:700, fontSize:12.5, textDecoration:'none' }}>Open primary photo ↗</a>
            </div>
          )}
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Documents</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>Document storage (agreement, disclosures, brochure, floor plans) is a later phase — no documents table yet.</div>
          </div>
        </div>

        {/* CENTER: tabs + working area */}
        <div style={{ minWidth:0 }}>
          <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:18, overflowX:'auto' }}>
            {ALL_TABS.filter(t => !t.adminOnly || canViewAdminLog).map(t => (
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ padding:'10px 15px', border:'none', borderBottom: tab===t.id?'2px solid var(--brand)':'2px solid transparent',
                  background:'transparent', color: tab===t.id?'var(--brand)':'var(--muted)', fontSize:13, fontWeight: tab===t.id?800:600,
                  cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap', marginBottom:-1 }}>{t.label}</button>
            ))}
          </div>

          {/* TASKS / NEXT ACTION (default) */}
          {tab==='tasks' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderRadius:12, marginBottom:16,
                background: sellerOverdue ? 'rgba(220,38,38,.06)' : 'rgba(11,122,69,.05)',
                border:'1px solid '+(sellerOverdue?'rgba(220,38,38,.25)':'rgba(11,122,69,.2)') }}>
                <span style={{ fontSize:22 }}>{sellerOverdue?'⚠️':'✅'}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10.5, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em' }}>Next action</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{recommendation}</div>
                </div>
                <button onClick={()=>setTab('report')} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid var(--brand)', background:'var(--panel)', color:'var(--brand)', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap' }}>Seller Report →</button>
              </div>

              <div style={sectionTitle}>Needs attention</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(() => {
                  const items = []
                  if (sellerOverdue && (status==='Active'||status==='Coming Soon')) items.push(['⚠️','Seller update overdue','#DC2626'])
                  if (showings.length===0 && status==='Active') items.push(['👀','No showings logged yet','#B45309'])
                  if (d!=null && d>60 && status==='Active') items.push(['📅','On market 60+ days ('+d+')','#B45309'])
                  if (!listing.seller_contact_id) items.push(['🧑','Missing primary seller contact','#B45309'])
                  if (objections.some(([w])=>w==='price') && showings.length>=3) items.push(['💰','Price is a recurring objection','#2563EB'])
                  if (mktTasks && mktTasks.some(t=>t.status!=='done')) items.push(['📣','Marketing tasks still open on TC file','#B45309'])
                  if (items.length===0) return <div style={{ padding:16, textAlign:'center', color:'var(--muted)', fontSize:13, background:'var(--dim)', borderRadius:10 }}>✅ Nothing needs attention right now.</div>
                  return items.map((it,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--panel)', border:'1px solid var(--border)', borderLeft:'3px solid '+it[2], borderRadius:10 }}>
                      <span style={{ fontSize:16 }}>{it[0]}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{it[1]}</span>
                    </div>
                  ))
                })()}
              </div>

              {/* Open TC/listing tasks (read-only marketing-ish already loaded on marketing tab) */}
              <div style={{ marginTop:18 }}>
                <div style={sectionTitle}>Snapshot</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
                  <div style={card}><div style={cLabel}>Showings</div><div style={{ fontSize:15, fontWeight:800 }}>{showings.length}{avgInterest?' · '+avgInterest:''}</div></div>
                  <div style={card}><div style={cLabel}>Open houses</div><div style={{ fontSize:15, fontWeight:800 }}>{openHouses.length}</div></div>
                  <div style={card}><div style={cLabel}>DOM</div><div style={{ fontSize:15, fontWeight:800 }}>{d!=null?d:'—'}</div></div>
                  <div style={card}><div style={cLabel}>Price changes</div><div style={{ fontSize:15, fontWeight:800 }}>{ph.length}</div></div>
                </div>
              </div>

              {/* Inline status/price quick edit */}
              <div style={{ marginTop:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
                <div style={card}>
                  <div style={cLabel}>Status</div>
                  <select value={status} onChange={e=>{ setStatus(e.target.value); saveField('status', e.target.value, 'status') }} style={{ ...inp, width:'100%' }}>
                    {LISTING_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={card}>
                  <div style={cLabel}>Price</div>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="$0" style={{ ...inp, flex:1 }} />
                    <button onClick={savePrice} style={saveBtn('price')}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}

      {tab==='feedback' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:14 }}><strong>{showings.length}</strong> showings{avgInterest?<> · avg interest <strong style={{ color:interestColor(+avgInterest) }}>{avgInterest}</strong></>:''}</div>
            <button onClick={()=>onLogShowing?.(listing)} style={{ ...inp, cursor:'pointer', color:'var(--brand)', fontWeight:700 }}>+ Add showing</button>
          </div>
          {showings.length===0 ? <div style={{ padding:30, textAlign:'center', color:'var(--muted)' }}>No showings logged yet.</div> :
            Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([name,list])=>(
              <div key={name} style={{ marginBottom:14, border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <div style={{ padding:'8px 12px', background:'var(--dim)', fontSize:13, fontWeight:800, display:'flex', justifyContent:'space-between' }}>
                  <span>👤 {name}</span><span style={{ color:'var(--muted)' }}>{list.length} showing{list.length!==1?'s':''}</span>
                </div>
                {list.map(s=>(
                  <div key={s.id} style={{ padding:'10px 12px', borderTop:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:13, fontWeight:700 }}>{s.buyer_name||'Buyer'}</span>
                      <span style={{ fontSize:11.5, color:'var(--muted)' }}>{s.showing_date?fmtDate(s.showing_date):''}</span>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <label style={{ fontSize:11, color:'var(--muted)' }}>Interest
                        <select defaultValue={s.interest_level||3} onChange={e=>updateShowing(s.id, { interest_level:parseInt(e.target.value) })} style={{ ...inp, marginLeft:6, padding:'3px 6px' }}>
                          {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    </div>
                    <input defaultValue={s.feedback||''} placeholder="Feedback…" onBlur={e=>{ if(e.target.value!==(s.feedback||'')) updateShowing(s.id,{ feedback:e.target.value }) }} style={{ ...inp, width:'100%', marginTop:6, boxSizing:'border-box' }} />
                    <input defaultValue={s.notes||''} placeholder="Notes…" onBlur={e=>{ if(e.target.value!==(s.notes||'')) updateShowing(s.id,{ notes:e.target.value }) }} style={{ ...inp, width:'100%', marginTop:6, fontSize:12, boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>
            ))}
          {/* Open houses */}
          <div style={{ marginTop:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={sectionTitle}>Open houses ({openHouses.length})</div>
              <button onClick={()=>onScheduleOH?.(listing)} style={{ ...inp, cursor:'pointer', color:'var(--brand)', fontWeight:700 }}>+ Schedule</button>
            </div>
            {openHouses.length===0 ? <div style={{ fontSize:12.5, color:'var(--muted)' }}>No open houses scheduled.</div> :
              openHouses.map(oh=>(
                <div key={oh.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', background:'var(--dim)', borderRadius:8, marginBottom:6, fontSize:12.5 }}>
                  <span>{oh.date?fmtDate(oh.date):''}{oh.start_time?' · '+oh.start_time:''}{oh.end_time?'–'+oh.end_time:''}</span>
                  {oh.visitors_count>0 && <span style={{ color:'var(--muted)' }}>{oh.visitors_count} visitors</span>}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── SELLER REPORT (seller-ready summary from existing data) ── */}
      {tab==='report' && (
        <div>
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ ...card, flex:1, minWidth:240 }}>
              <div style={cLabel}>Last seller update</div>
              <div style={{ fontSize:15, fontWeight:800, color:listing.seller_updated_at?'var(--text)':'#DC2626' }}>{listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never'}{sellerOverdue?' · overdue':''}</div>
            </div>
            <button onClick={()=>{ const today=new Date().toISOString().slice(0,10); setSellerDate(today); saveField('seller_updated_at', today, 'seller update date') }}
              style={{ padding:'11px 16px', borderRadius:9, border:'none', background:'#0B7A45', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:ff }}>✓ Mark seller updated (today)</button>
          </div>

          <div style={sectionTitle}>Seller-ready summary</div>
          <div style={{ fontSize:13, lineHeight:1.9 }}>
            <div>• <strong>{showings.length}</strong> showings{avgInterest?' · average interest '+avgInterest+'/5':''}</div>
            <div>• <strong>{openHouses.length}</strong> open houses</div>
            <div>• Feedback captured on <strong>{showings.filter(s=>s.feedback).length}</strong> of {showings.length} showings</div>
            {listing.original_price&&listing.list_price&&listing.original_price!==listing.list_price && <div>• Price moved {fmt$(listing.original_price)} → {fmt$(listing.list_price)} ({ph.length} change{ph.length!==1?'s':''})</div>}
            <div>• Marketing: {mktStatus || 'not set'}</div>
          </div>

          {objections.length>0 && (
            <div style={{ marginTop:14 }}>
              <div style={cLabel}>Common feedback / objections</div>
              {objections.map(([word,count],i)=>(
                <span key={i} style={{ display:'inline-block', fontSize:12, fontWeight:700, color:'#B45309', background:'rgba(245,166,35,.14)', padding:'3px 10px', borderRadius:99, marginRight:6, marginTop:6 }}>{word} ({count})</span>
              ))}
            </div>
          )}

          {showings.filter(s=>s.feedback).length>0 && (
            <div style={{ marginTop:14 }}>
              <div style={cLabel}>Recent buyer feedback</div>
              {showings.filter(s=>s.feedback).slice(0,6).map(s=>(
                <div key={s.id} style={{ fontSize:12.5, color:'var(--muted)', marginTop:4 }}>"{s.feedback}" — {s.buyer_name||'buyer'}{s.interest_level?' ('+s.interest_level+'/5)':''}</div>
              ))}
            </div>
          )}

          <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(11,122,69,.06)', border:'1px solid rgba(11,122,69,.25)', borderRadius:10 }}>
            <div style={cLabel}>Recommended next action</div>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{recommendation}</div>
          </div>
        </div>
      )}

      {/* ── MARKETING (real listing data + linked TC tasks, read-only) ── */}
      {tab==='marketing' && (
        <div>
          <div style={{ ...card, maxWidth:420 }}>
            <div style={cLabel}>Marketing status</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={mktStatus} onChange={e=>setMktStatus(e.target.value)} placeholder="e.g. Photos done, MLS live" style={{ ...inp, flex:1 }} />
              <button onClick={()=>saveField('marketing_status', mktStatus||null, 'marketing status')} style={saveBtn('marketing_status')}>Save</button>
            </div>
          </div>
          {listing.photo_url && <div style={{ marginTop:14 }}><div style={sectionTitle}>Primary photo</div><img src={listing.photo_url} alt="listing" style={{ maxWidth:'100%', borderRadius:10, border:'1px solid var(--border)' }} onError={e=>{e.target.style.display='none'}} /></div>}

          {/* Marketing progress from linked TC deal (read-only) */}
          <div style={{ marginTop:16 }}>
            <div style={sectionTitle}>Marketing progress (from TC file)</div>
            {mktTasks === null ? (
              <div style={{ fontSize:12.5, color:'var(--muted)' }}>Loading…</div>
            ) : mktTasks.length === 0 ? (
              <div style={{ fontSize:12.5, color:'var(--muted)' }}>No linked TC file with marketing tasks. Marketing tasks are managed by the office on the TC Board.</div>
            ) : (
              <div>
                {mktTasks.map(t => (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'var(--dim)', borderRadius:8, marginBottom:6 }}>
                    <span style={{ fontSize:14 }}>{t.status==='done' ? '✅' : '⬜'}</span>
                    <span style={{ flex:1, fontSize:12.5, color:'var(--text)', textDecoration: t.status==='done'?'line-through':'none' }}>{t.title}</span>
                    {t.due_date && <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtDate(t.due_date)}</span>}
                  </div>
                ))}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Read-only — managed by the office on the TC Board.</div>
              </div>
            )}
          </div>

          <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.25)', borderRadius:10, fontSize:12.5 }}>
            📣 A structured marketing checklist with files (drone, floor plans, brochure proofs, publication dates) will be added in a later phase.
          </div>
        </div>
      )}

      {/* ── PRICE HISTORY ── */}
      {/* ── PRICE & ACTIVITY ── */}
      {tab==='price' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
            <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Original</div><div style={{ fontSize:16, fontWeight:800 }}>{listing.original_price?fmt$(listing.original_price):'—'}</div></div>
            <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Current</div><div style={{ fontSize:16, fontWeight:800 }}>{listing.list_price?fmt$(listing.list_price):'—'}</div></div>
            <div style={{ ...card, flex:1, minWidth:120 }}><div style={cLabel}>Changes</div><div style={{ fontSize:16, fontWeight:800 }}>{ph.length}</div></div>
          </div>
          {/* Inline price change */}
          <div style={{ ...card, maxWidth:360, marginBottom:16 }}>
            <div style={cLabel}>Change price</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={price} onChange={e=>setPrice(e.target.value)} placeholder="$0" style={{ ...inp, flex:1 }} />
              <button onClick={savePrice} style={saveBtn('price')}>Save</button>
            </div>
          </div>
          <div style={sectionTitle}>Price history</div>
          {ph.length===0 ? <div style={{ padding:14, color:'var(--muted)', fontSize:12.5 }}>No recorded price changes yet.</div> :
            ph.slice().reverse().map((p,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                <span>{(p.old_price!=null?fmt$(p.old_price):'—')+' → '+(p.new_price!=null?fmt$(p.new_price):(p.price!=null?fmt$(p.price):'—'))}{p.reason?' · '+p.reason:''}{p.by?' · '+p.by:''}</span>
                <span style={{ color:'var(--muted)' }}>{p.date?fmtDate(p.date):(p.changed_at?fmtDate(p.changed_at):'')}</span>
              </div>
            ))}
          {/* Historical price changes from audit_log (merged, so nothing is lost) */}
          {(() => {
            const auditPrices = adminLog.filter(a => (a.field_name||'').toLowerCase().includes('price'))
            if (auditPrices.length === 0) return null
            return (
              <div style={{ marginTop:16 }}>
                <div style={cLabel}>From audit log</div>
                {auditPrices.map((a,i)=>(
                  <div key={a.id||i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted)' }}>
                    <span>{a.old_value?fmt$(a.old_value):'—'} → {a.new_value?fmt$(a.new_value):'—'}</span>
                    <span>{a.created_at?fmtDate(a.created_at):''}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── NOTES ── */}
      {tab==='notes' && (
        <div>
          <div style={sectionTitle}>Listing notes</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={10} placeholder="Add listing notes — anything the team should know about this property…"
            style={{ ...inp, width:'100%', resize:'vertical', boxSizing:'border-box', lineHeight:1.6 }} />
          <button onClick={()=>saveField('notes', notes||null, 'notes')} style={{ ...saveBtn('notes'), marginTop:10 }}>Save notes</button>
        </div>
      )}

      {/* ── ADMIN LOG (gated; reads audit_log) ── */}
      {tab==='admin' && canViewAdminLog && (
        <div>
          <div style={sectionTitle}>Internal change log</div>
          {logLoading ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>Loading…</div> :
            adminLog.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>No changes recorded yet.</div> :
            adminLog.map((a,i)=>(
              <div key={a.id||i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:6, height:6, borderRadius:99, background:'var(--brand)', marginTop:6, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12.5 }}>{a.metadata?.description || ((a.field_name||'Updated')+(a.old_value!=null?': '+a.old_value+' → '+a.new_value:''))}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{(a.agents?.name||'')}{a.agents?.name?' · ':''}{a.created_at?new Date(a.created_at).toLocaleString():''}</div>
                </div>
              </div>
            ))}
        </div>
      )}
        </div>

        {/* RIGHT: important dates + counts */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Important dates</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div><div style={cLabel}>Date listed</div><div style={{ fontSize:13, fontWeight:700 }}>{(listing.listed_date||listing.list_date)?fmtDate(listing.listed_date||listing.list_date):'—'}</div></div>
              {listing.expiration_date && <div><div style={cLabel}>Expiration</div><div style={{ fontSize:13, fontWeight:700 }}>{fmtDate(listing.expiration_date)}</div></div>}
              {listing.contract_date && <div><div style={cLabel}>Contract date</div><div style={{ fontSize:13, fontWeight:700 }}>{fmtDate(listing.contract_date)}</div></div>}
              {listing.close_date && <div><div style={cLabel}>Expected closing</div><div style={{ fontSize:13, fontWeight:700 }}>{fmtDate(listing.close_date)}</div></div>}
              <div>
                <div style={cLabel}>Last seller update</div>
                <div style={{ fontSize:13, fontWeight:700, color: listing.seller_updated_at&&!sellerOverdue?'var(--text)':'#DC2626' }}>
                  {listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never'}{sellerOverdue?' · overdue':''}
                </div>
              </div>
            </div>
          </div>
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={sectionTitle}>Listing activity</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[['Showings',showings.length,'feedback'],['Open houses',openHouses.length,'feedback'],['Price changes',ph.length,'price']].map(([lab,val,go],i)=>(
                <button key={i} onClick={()=>setTab(go)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--dim)', border:'none', borderRadius:8, padding:'8px 10px', cursor:'pointer', fontFamily:ff }}>
                  <span style={{ fontSize:12, color:'var(--muted)', fontWeight:700 }}>{lab}</span>
                  <span style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{val} ›</span>
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
