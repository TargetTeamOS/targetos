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
import { getRecordActivity } from '../lib/activityLog'
import SellerContacts from './SellerContacts'

const ff = 'Inter,system-ui,sans-serif'
const TABS = [
  { id:'overview',  label:'Overview' },
  { id:'showings',  label:'Buyer Interest & Showings' },
  { id:'updates',   label:'Seller Updates' },
  { id:'marketing', label:'Marketing & Ads' },
  { id:'price',     label:'Price History' },
  { id:'sellers',   label:'Seller Contacts' },
  { id:'documents', label:'Documents' },
  { id:'activity',  label:'Activity Log' },
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
  onLogShowing, onScheduleOH,
}) {
  const [tab, setTab] = useState('overview')
  const [activity, setActivity] = useState([]); const [actLoading, setActLoading] = useState(false)
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
    setMktStatus(listing.marketing_status || ''); setNotes(listing.notes || ''); setTab('overview')
  }, [listing.id])

  useEffect(() => {
    if (tab !== 'activity') return
    setActLoading(true)
    getRecordActivity('listings', listing.id).then(r => setActivity(r || [])).catch(()=>setActivity([])).finally(()=>setActLoading(false))
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
      const { error } = await supabase.from('listings').update({ list_price:newPrice, updated_at:new Date().toISOString() }).eq('id', listing.id)
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
      onSaved?.({ ...listing, list_price:newPrice })
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

  // group showings by agent who showed
  const agentName = () => agent?.name
  const groups = {}
  showings.forEach(s => { const k = s.agent_name || agentName() || 'Unknown agent'; (groups[k]=groups[k]||[]).push(s) })

  const card = { background:'var(--dim)', borderRadius:8, padding:'10px 12px' }
  const cLabel = { fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }
  const inp = { padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const saveBtn = k => ({ padding:'7px 12px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity: saving===k?0.6:1 })
  const sectionTitle = { fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }

  const statTile = (label, value, sub, color) => (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', minWidth:0 }}>
      <div style={{ fontSize:22, fontWeight:900, color: color||'var(--text)', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:10.5, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginTop:5 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
    </div>
  )

  return (
    // Full-screen breakout: escape Layout's 1400px padded container
    <div style={{ fontFamily:ff, position:'relative', left:'50%', right:'50%', marginLeft:'-50vw', marginRight:'-50vw', width:'100vw', minHeight:'100vh', marginTop:-28, background:'var(--bg)' }}>

      {/* Distinct header band */}
      <div style={{ background:'linear-gradient(180deg, var(--panel), var(--bg))', borderBottom:'1px solid var(--border)', borderTop:'4px solid '+sc }}>
        <div style={{ maxWidth:1280, margin:'0 auto', padding:'18px 32px' }}>
          <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:16, padding:'7px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>← Back to My Listings</button>

          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
            {agent && <Avatar agent={agent} size={56} />}
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span style={{ fontSize:28, fontWeight:900, color:'var(--text)', letterSpacing:'-.01em' }}>{listing.addr || '—'}</span>
                <span style={{ fontSize:12, fontWeight:800, color:'#fff', background:sc, padding:'3px 12px', borderRadius:99 }}>{status}</span>
              </div>
              <div style={{ fontSize:14, color:'var(--muted)', marginTop:4 }}>
                {listing.city ? listing.city + ' · ' : ''}{agent?.name || ''}
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>onLogShowing?.(listing)} style={{ padding:'9px 16px', borderRadius:9, border:'1px solid var(--brand)', background:'rgba(204,34,0,.06)', color:'var(--brand)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>👀 Add showing</button>
              <button onClick={()=>onScheduleOH?.(listing)} style={{ padding:'9px 16px', borderRadius:9, border:'1px solid #3B82F6', background:'rgba(59,130,246,.06)', color:'#3B82F6', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>📅 Open house</button>
            </div>
          </div>

          {/* Summary stat cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginTop:18 }}>
            {statTile('Price', listing.list_price?fmt$(listing.list_price):'—', listing.original_price&&listing.original_price!==listing.list_price?'orig '+fmt$(listing.original_price):null)}
            {statTile('Days on market', d!=null?d:'—', d!=null?'days':null)}
            {statTile('Showings', showings.length, avgInterest?'avg '+avgInterest+'/5':null, '#8B5CF6')}
            {statTile('Open houses', openHouses.length, null, '#3B82F6')}
            {statTile('Price changes', ph.length, null)}
            {statTile('Last seller update', listing.seller_updated_at?fmtDate(listing.seller_updated_at):'never', null, listing.seller_updated_at?'var(--text)':'#DC2626')}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth:1280, margin:'0 auto', padding:'0 32px 40px' }}>
        {/* Tabs */}
        <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', margin:'0 -4px 20px', overflowX:'auto', position:'sticky', top:0, background:'var(--bg)', zIndex:5, paddingTop:14 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ padding:'11px 16px', border:'none', borderBottom: tab===t.id?'2px solid var(--brand)':'2px solid transparent',
                background:'transparent', color: tab===t.id?'var(--brand)':'var(--muted)', fontSize:13.5, fontWeight: tab===t.id?800:600,
                cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap', marginBottom:-1 }}>{t.label}</button>
          ))}
        </div>

      {/* ── OVERVIEW (inline edit) ── */}
      {tab==='overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
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
          <div style={card}>
            <div style={cLabel}>Last seller update</div>
            <div style={{ display:'flex', gap:6 }}>
              <input type="date" value={sellerDate} onChange={e=>setSellerDate(e.target.value)} style={{ ...inp, flex:1 }} />
              <button onClick={()=>saveField('seller_updated_at', sellerDate||null, 'seller update date')} style={saveBtn('seller_updated_at')}>Save</button>
            </div>
          </div>
          <div style={card}>
            <div style={cLabel}>Marketing status</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={mktStatus} onChange={e=>setMktStatus(e.target.value)} placeholder="e.g. Photos done, MLS live" style={{ ...inp, flex:1 }} />
              <button onClick={()=>saveField('marketing_status', mktStatus||null, 'marketing status')} style={saveBtn('marketing_status')}>Save</button>
            </div>
          </div>
          <div style={{ ...card, gridColumn:'1 / -1' }}>
            <div style={cLabel}>Notes</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Listing notes…" style={{ ...inp, width:'100%', resize:'vertical', boxSizing:'border-box' }} />
            <button onClick={()=>saveField('notes', notes||null, 'notes')} style={{ ...saveBtn('notes'), marginTop:8 }}>Save notes</button>
          </div>
          <div style={card}><div style={cLabel}>Showings</div><div style={{ fontSize:15, fontWeight:800 }}>{showings.length}{avgInterest?' · avg '+avgInterest:''}</div></div>
          <div style={card}><div style={cLabel}>Open houses</div><div style={{ fontSize:15, fontWeight:800 }}>{openHouses.length}</div></div>
          <div style={card}><div style={cLabel}>Price changes</div><div style={{ fontSize:15, fontWeight:800 }}>{ph.length}</div></div>
        </div>
      )}

      {/* ── BUYER INTEREST & SHOWINGS (inline edit) ── */}
      {tab==='showings' && (
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
        </div>
      )}

      {/* ── SELLER UPDATES (summary from existing data) ── */}
      {tab==='updates' && (
        <div>
          <div style={{ ...card, marginBottom:14 }}>
            <div style={cLabel}>Last seller update</div>
            <div style={{ display:'flex', gap:6, maxWidth:340 }}>
              <input type="date" value={sellerDate} onChange={e=>setSellerDate(e.target.value)} style={{ ...inp, flex:1 }} />
              <button onClick={()=>saveField('seller_updated_at', sellerDate||null, 'seller update date')} style={saveBtn('seller_updated_at')}>Save</button>
            </div>
          </div>
          <div style={sectionTitle}>Summary from current data</div>
          <div style={{ fontSize:13, lineHeight:1.8 }}>
            <div>• <strong>{showings.length}</strong> showings{avgInterest?' · avg interest '+avgInterest+'/5':''}</div>
            <div>• <strong>{openHouses.length}</strong> open houses</div>
            <div>• Feedback on <strong>{showings.filter(s=>s.feedback).length}</strong> of {showings.length} showings</div>
            {showings.filter(s=>s.feedback).length>0 && (
              <div style={{ marginTop:8 }}>
                <div style={cLabel}>Recent feedback</div>
                {showings.filter(s=>s.feedback).slice(0,5).map(s=>(
                  <div key={s.id} style={{ fontSize:12.5, color:'var(--muted)', marginTop:3 }}>"{s.feedback}" — {s.buyer_name||'buyer'}</div>
                ))}
              </div>
            )}
            {listing.original_price&&listing.list_price&&listing.original_price!==listing.list_price && <div style={{ marginTop:8 }}>• Price moved {fmt$(listing.original_price)} → {fmt$(listing.list_price)}</div>}
            {mktStatus && <div>• Marketing: {mktStatus}</div>}
          </div>
          <button disabled style={{ marginTop:16, padding:'9px 14px', borderRadius:9, border:'1px dashed var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12.5, fontWeight:700, cursor:'not-allowed', fontFamily:ff }}>✨ Generate Seller Update — coming soon</button>
        </div>
      )}

      {/* ── MARKETING & ADS (real + note) ── */}
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
          <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.25)', borderRadius:10, fontSize:12.5 }}>
            📣 Detailed marketing checklist &amp; files (photography, drone, floor plans, brochure, social, ads, publications with dates/files) will be added in a later phase.
          </div>
        </div>
      )}

      {/* ── PRICE HISTORY ── */}
      {tab==='price' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
            <div style={{ ...card, flex:1 }}><div style={cLabel}>Original</div><div style={{ fontSize:16, fontWeight:800 }}>{listing.original_price?fmt$(listing.original_price):'—'}</div></div>
            <div style={{ ...card, flex:1 }}><div style={cLabel}>Current</div><div style={{ fontSize:16, fontWeight:800 }}>{listing.list_price?fmt$(listing.list_price):'—'}</div></div>
            <div style={{ ...card, flex:1 }}><div style={cLabel}>Changes</div><div style={{ fontSize:16, fontWeight:800 }}>{ph.length}</div></div>
          </div>
          {ph.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>No recorded price changes.</div> :
            ph.slice().reverse().map((p,i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                <span>{(p.old_price!=null?fmt$(p.old_price):'—')+' → '+(p.new_price!=null?fmt$(p.new_price):(p.price!=null?fmt$(p.price):'—'))}{p.reason?' · '+p.reason:''}</span>
                <span style={{ color:'var(--muted)' }}>{p.date?fmtDate(p.date):(p.changed_at?fmtDate(p.changed_at):'')}</span>
              </div>
            ))}
          <button onClick={()=>onPriceHint?.()} style={{ display:'none' }} />
        </div>
      )}

      {/* ── SELLER CONTACTS ── */}
      {tab==='sellers' && <SellerContacts listingId={listing.id} listingAgentId={listing.agent_id} />}

      {/* ── DOCUMENTS (placeholder) ── */}
      {tab==='documents' && (
        <div style={{ padding:'12px 14px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.25)', borderRadius:10, fontSize:12.5 }}>
          📁 Document storage (listing agreement, disclosures, brochure, floor plans, ad proofs, photo links) will be added in a later phase — no documents table exists yet.
        </div>
      )}

      {/* ── ACTIVITY LOG ── */}
      {tab==='activity' && (
        <div>
          {actLoading ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>Loading…</div> :
            activity.length===0 ? <div style={{ padding:20, textAlign:'center', color:'var(--muted)' }}>No activity recorded yet.</div> :
            activity.map((a,i)=>(
              <div key={a.id||i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ width:6, height:6, borderRadius:99, background:'var(--brand)', marginTop:6, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12.5 }}>{a.description||a.metadata?.description||((a.action||'Updated')+(a.field_name||a.field?' · '+(a.field_name||a.field):''))}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{(a.agent_name||a.agents?.name||'')}{(a.agent_name||a.agents?.name)?' · ':''}{a.created_at?new Date(a.created_at).toLocaleString():''}</div>
                </div>
              </div>
            ))}
        </div>
      )}
      </div>
    </div>
  )
}
