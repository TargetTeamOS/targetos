// ═══════════════════════════════════════════════════════════════
// ListingWorkspaceDrawer (Phase 1 — July 2026)
// Right-side full-listing workspace opened from a My Listings row.
// Tabs: Overview · Showings & Feedback · Seller Contacts · Price
// History · Marketing · Seller Updates · Activity Log.
// Uses ONLY existing data (listings, listing_showings, open_houses,
// listing_contacts, price_history jsonb, audit_log/record_activity).
// No new tables/columns. Marketing + Seller Updates show honest
// future-phase placeholders where structured data doesn't exist yet.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { fmt$, fmtDate } from '../lib/utils'
import { getRecordActivity } from '../lib/activityLog'
import SellerContacts from './SellerContacts'

const ff = 'Inter,system-ui,sans-serif'
const TABS = [
  { id:'overview',  label:'Overview' },
  { id:'showings',  label:'Showings & Feedback' },
  { id:'sellers',   label:'Seller Contacts' },
  { id:'price',     label:'Price History' },
  { id:'marketing', label:'Marketing' },
  { id:'updates',   label:'Seller Updates' },
  { id:'activity',  label:'Activity Log' },
]

function daysOnMarket(listing) {
  const start = listing.listed_date || listing.list_date || listing.created_at
  if (!start) return null
  return Math.floor((Date.now() - new Date(start).getTime()) / 86400000)
}
function interestColor(n) { return n >= 4 ? '#10B981' : n >= 3 ? '#F5A623' : '#DC2626' }

export default function ListingWorkspaceDrawer({
  open, onClose, listing, showings = [], openHouses = [], agents = [],
  onLogShowing, onScheduleOH, onPriceChange, onUpdateStatus, onToggleIvr, statuses = [],
}) {
  const [tab, setTab] = useState('overview')
  const [activity, setActivity] = useState([])
  const [actLoading, setActLoading] = useState(false)

  useEffect(() => { if (open) setTab('overview') }, [listing?.id, open])

  useEffect(() => {
    if (!open || !listing?.id || tab !== 'activity') return
    setActLoading(true)
    getRecordActivity('listings', listing.id)
      .then(rows => setActivity(rows || []))
      .catch(() => setActivity([]))
      .finally(() => setActLoading(false))
  }, [open, listing?.id, tab])

  if (!listing) return null

  const dom = daysOnMarket(listing)
  const avgInterest = showings.length
    ? (showings.reduce((s, x) => s + (x.interest_level || 3), 0) / showings.length).toFixed(1)
    : null

  // Group showings by the agent who showed it (agent_name, else agent lookup, else Unknown)
  const agentName = id => (agents.find(a => a.id === id)?.name)
  const groups = {}
  showings.forEach(s => {
    const key = s.agent_name || agentName(s.agent_id) || 'Unknown agent'
    ;(groups[key] = groups[key] || []).push(s)
  })

  // Price history from jsonb (best-effort shape) + original/current
  const ph = Array.isArray(listing.price_history) ? listing.price_history : []

  const sectionTitle = { fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }
  const cell = { background:'var(--dim)', borderRadius:8, padding:'10px 12px' }
  const cellLabel = { fontSize:10.5, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }
  const actionBtn = { padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--brand)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:5000,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition:'opacity .2s' }} />
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(860px, 96vw)', background:'var(--panel)',
        zIndex:5001, boxShadow:'-8px 0 30px rgba(0,0,0,.2)', transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform .25s ease', display:'flex', flexDirection:'column', fontFamily:ff }}>

        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>{listing.addr || '—'}</div>
            <div style={{ fontSize:12.5, color:'var(--muted)', marginTop:2 }}>
              {listing.city ? listing.city + ' · ' : ''}{listing.list_price ? fmt$(listing.list_price) : '—'}{listing.status ? ' · ' + listing.status : ''}{dom != null ? ' · ' + dom + ' DOM' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ border:'none', background:'var(--dim)', color:'var(--text)', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        {/* Quick actions */}
        <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap' }}>
          <button style={actionBtn} onClick={()=>onLogShowing?.(listing)}>👀 Log showing</button>
          <button style={actionBtn} onClick={()=>onScheduleOH?.(listing)}>📅 Open house</button>
          <button style={actionBtn} onClick={()=>onPriceChange?.(listing)}>💰 Price change</button>
          <button style={actionBtn} onClick={()=>onToggleIvr?.(listing)}>{listing.ivr_enabled ? '📞 On phone ✓' : '📞 Feature on phone'}</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, padding:'8px 12px 0', borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ padding:'7px 12px', border:'none', borderBottom: tab===t.id ? '2px solid var(--brand)' : '2px solid transparent',
                background:'transparent', color: tab===t.id ? 'var(--brand)' : 'var(--muted)', fontSize:12.5, fontWeight: tab===t.id?800:600,
                cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap', marginBottom:-1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:'16px 18px' }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
              <div style={cell}><div style={cellLabel}>Status</div><div style={{ fontSize:14, fontWeight:700 }}>{listing.status || '—'}</div></div>
              <div style={cell}><div style={cellLabel}>Price</div><div style={{ fontSize:14, fontWeight:700 }}>{listing.list_price ? fmt$(listing.list_price) : '—'}</div>{listing.original_price && listing.original_price !== listing.list_price && <div style={{ fontSize:11, color:'var(--muted)' }}>orig {fmt$(listing.original_price)}</div>}</div>
              <div style={cell}><div style={cellLabel}>Days on market</div><div style={{ fontSize:14, fontWeight:700 }}>{dom != null ? dom + ' days' : '—'}</div></div>
              <div style={cell}><div style={cellLabel}>Showings</div><div style={{ fontSize:14, fontWeight:700 }}>{showings.length}{avgInterest ? ' · avg ' + avgInterest : ''}</div></div>
              <div style={cell}><div style={cellLabel}>Open houses</div><div style={{ fontSize:14, fontWeight:700 }}>{openHouses.length}</div></div>
              <div style={cell}><div style={cellLabel}>Last seller update</div><div style={{ fontSize:14, fontWeight:700, color: listing.seller_updated_at ? 'var(--text)' : '#DC2626' }}>{listing.seller_updated_at ? fmtDate(listing.seller_updated_at) : 'never'}</div></div>
              {statuses.length > 0 && (
                <div style={{ ...cell, gridColumn:'1 / -1' }}>
                  <div style={cellLabel}>Change status</div>
                  <select value={listing.status || ''} onChange={e=>onUpdateStatus?.(listing, e.target.value)}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* SHOWINGS & FEEDBACK — grouped by agent */}
          {tab === 'showings' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:13, color:'var(--text)' }}>
                  <strong>{showings.length}</strong> total showings{avgInterest ? <> · avg interest <strong style={{ color:interestColor(+avgInterest) }}>{avgInterest}</strong></> : ''}
                </div>
                <button style={actionBtn} onClick={()=>onLogShowing?.(listing)}>+ Log showing</button>
              </div>
              {showings.length === 0 ? (
                <div style={{ padding:30, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No showings logged yet.</div>
              ) : (
                Object.entries(groups).sort((a,b)=>b[1].length-a[1].length).map(([name, list]) => (
                  <div key={name} style={{ marginBottom:14, border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    <div style={{ padding:'8px 12px', background:'var(--dim)', fontSize:13, fontWeight:800, color:'var(--text)', display:'flex', justifyContent:'space-between' }}>
                      <span>👤 {name}</span>
                      <span style={{ color:'var(--muted)', fontWeight:700 }}>{list.length} showing{list.length!==1?'s':''}</span>
                    </div>
                    {list.map(s => (
                      <div key={s.id} style={{ padding:'9px 12px', borderTop:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{s.buyer_name || 'Buyer'}</span>
                          <span style={{ fontSize:11.5, color:'var(--muted)' }}>{s.showing_date ? fmtDate(s.showing_date) : ''}{s.showing_time ? ' · ' + s.showing_time : ''}</span>
                        </div>
                        <div style={{ fontSize:11.5, marginTop:2 }}>
                          <span style={{ fontWeight:700, color:interestColor(s.interest_level||3) }}>Interest {s.interest_level || 3}/5</span>
                        </div>
                        {s.feedback && <div style={{ fontSize:12.5, color:'var(--text)', marginTop:4 }}>{s.feedback}</div>}
                        {s.notes && <div style={{ fontSize:11.5, color:'var(--muted)', marginTop:2 }}>Note: {s.notes}</div>}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {/* SELLER CONTACTS */}
          {tab === 'sellers' && (
            <SellerContacts listingId={listing.id} listingAgentId={listing.agent_id} />
          )}

          {/* PRICE HISTORY */}
          {tab === 'price' && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                <div style={{ ...cell, flex:1 }}><div style={cellLabel}>Original</div><div style={{ fontSize:15, fontWeight:800 }}>{listing.original_price ? fmt$(listing.original_price) : '—'}</div></div>
                <div style={{ ...cell, flex:1 }}><div style={cellLabel}>Current</div><div style={{ fontSize:15, fontWeight:800 }}>{listing.list_price ? fmt$(listing.list_price) : '—'}</div></div>
              </div>
              <div style={sectionTitle}>Changes</div>
              {ph.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No recorded price changes.{listing.original_price && listing.list_price && listing.original_price !== listing.list_price ? ' (Original differs from current — detailed history begins from the next change.)' : ''}</div>
              ) : (
                ph.slice().reverse().map((p, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 10px', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                    <span style={{ color:'var(--text)' }}>
                      {(p.old_price!=null?fmt$(p.old_price):'—') + ' → ' + (p.new_price!=null?fmt$(p.new_price):(p.price!=null?fmt$(p.price):'—'))}
                      {p.reason ? ' · ' + p.reason : ''}
                    </span>
                    <span style={{ color:'var(--muted)' }}>{p.date ? fmtDate(p.date) : (p.changed_at ? fmtDate(p.changed_at) : '')}{p.by ? ' · ' + p.by : ''}</span>
                  </div>
                ))
              )}
              <button style={{ ...actionBtn, marginTop:12 }} onClick={()=>onPriceChange?.(listing)}>💰 Record price change</button>
            </div>
          )}

          {/* MARKETING — real status only + honest note */}
          {tab === 'marketing' && (
            <div>
              <div style={cell}><div style={cellLabel}>Marketing status</div><div style={{ fontSize:14, fontWeight:700 }}>{listing.marketing_status || 'Not set'}</div></div>
              {listing.photo_url && (
                <div style={{ marginTop:12 }}>
                  <div style={sectionTitle}>Primary photo</div>
                  <img src={listing.photo_url} alt="listing" style={{ maxWidth:'100%', borderRadius:10, border:'1px solid var(--border)' }} onError={e=>{e.target.style.display='none'}} />
                </div>
              )}
              <div style={{ marginTop:14, padding:'12px 14px', background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.25)', borderRadius:10, fontSize:12.5, color:'var(--text)' }}>
                📣 Detailed marketing checklist &amp; files (photography, drone, floor plans, brochure, social, ads, publications with dates/files) will be added in a later phase.
              </div>
            </div>
          )}

          {/* SELLER UPDATES — summary from existing data + disabled generate */}
          {tab === 'updates' && (
            <div>
              <div style={cell}><div style={cellLabel}>Last seller update</div><div style={{ fontSize:14, fontWeight:700, color: listing.seller_updated_at ? 'var(--text)' : '#DC2626' }}>{listing.seller_updated_at ? fmtDate(listing.seller_updated_at) : 'never'}</div></div>
              <div style={{ marginTop:14 }}>
                <div style={sectionTitle}>Summary from current data</div>
                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7 }}>
                  <div>• <strong>{showings.length}</strong> showings{avgInterest ? ' · avg interest ' + avgInterest + '/5' : ''}</div>
                  <div>• <strong>{openHouses.length}</strong> open houses</div>
                  <div>• Feedback logged on <strong>{showings.filter(s=>s.feedback).length}</strong> of {showings.length} showings</div>
                  {listing.original_price && listing.list_price && listing.original_price !== listing.list_price && (
                    <div>• Price moved from {fmt$(listing.original_price)} to {fmt$(listing.list_price)}</div>
                  )}
                </div>
              </div>
              <button disabled style={{ marginTop:16, padding:'9px 14px', borderRadius:9, border:'1px dashed var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12.5, fontWeight:700, cursor:'not-allowed', fontFamily:ff }}>
                ✨ Generate Seller Update — coming soon
              </button>
            </div>
          )}

          {/* ACTIVITY LOG */}
          {tab === 'activity' && (
            <div>
              {actLoading ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Loading activity…</div>
              ) : activity.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No activity recorded yet.</div>
              ) : (
                activity.map((a, i) => (
                  <div key={a.id || i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:6, height:6, borderRadius:99, background:'var(--brand)', marginTop:6, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12.5, color:'var(--text)' }}>{a.description || a.metadata?.description || ((a.action||'Updated') + (a.field_name||a.field ? ' · ' + (a.field_name||a.field) : ''))}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>
                        {(a.agent_name || a.agents?.name || '') }{(a.agent_name||a.agents?.name) ? ' · ' : ''}{a.created_at ? new Date(a.created_at).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
