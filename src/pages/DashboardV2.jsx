import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { authFetch } from '../lib/apiAuth'
import { MarketWidget } from '../components/MarketWidget'
import { PageHeader } from '../components/UI'

// TargetOS Dashboard (redesigned July 2026)
// App-style metric tiles: each says what it is, shows the number, and
// clicks through to the data behind it. Two new listing tiles (MLS in
// watch areas + team listings, custom timeframe). Rate bar + news kept
// compact up top. Filters minimized. Reuses the exact data queries from
// the prior dashboard so nothing about the underlying data changes.

const ff = 'Inter, system-ui, sans-serif'
const parseNum = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return isNaN(n) ? 0 : n }
const isOverdue = d => d && d < new Date().toISOString().slice(0,10)
const isDueToday = d => d && d === new Date().toISOString().slice(0,10)
const getDaysUntil = d => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null
const money = n => { const v = parseNum(n); if (v>=1e6) return '$'+(v/1e6).toFixed(1)+'M'; if (v>=1e3) return '$'+Math.round(v/1e3)+'K'; return '$'+Math.round(v) }

// ── App-style metric tile ────────────────────────────────────────
function Tile({ icon, label, value, sub, color, onClick, big }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
        background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16,
        padding: big ? '20px' : '16px', cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .12s, box-shadow .12s', minHeight: big ? 130 : 108, fontFamily: ff,
        position: 'relative', overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.08)' } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: big ? 22 : 18, width: 36, height: 36, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</span>
      </div>
      <div style={{ fontSize: big ? 40 : 30, fontWeight: 800, color: color, lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>}
      {onClick && <span style={{ position: 'absolute', right: 14, bottom: 12, fontSize: 15, color: 'var(--muted)', opacity: .5 }}>→</span>}
    </button>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listingDays, setListingDays] = useState(7)
  const [tiles, setTiles] = useState(null)     // {team, mls}
  const [areasOpen, setAreasOpen] = useState(false)
  const [areas, setAreas] = useState({ cities: [], maxprice: '', minbeds: '' })
  const [cityInput, setCityInput] = useState('')

  // ── core stats (reuses prior dashboard queries verbatim) ──
  const loadData = useCallback(async () => {
    if (!agent) return
    setLoading(true)
    try {
      const viewId = (isAdmin || canManage) ? null : agent.id
      const filter = arr => viewId ? arr.filter(x => x.agent_id === viewId) : arr
      const [rawDeals, rawContacts, rawTasks, rawListings, rawOH, rawAnn, rawGifts] = await Promise.all([
        supabase.from('deals').select('id,stage,gci,ao_date,close_date,expected_close_date,addr,client_name,agent_id,side').then(r => r.data || []),
        supabase.from('contacts').select('id,first_name,last_name,status,agent_id,created_at').then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date,agent_id').then(r => r.data || []),
        supabase.from('listings').select('id,addr,city,status,list_price,agent_id').then(r => r.data || []),
        supabase.from('open_houses').select('id,listing_addr,date,agent_id').then(r => r.data || []),
        supabase.from('announcements').select('*,agents(name,color)').order('pinned',{ascending:false}).limit(5).then(r => r.data || []),
        supabase.from('gifts').select('id,status,agent_id').then(r => r.data || []),
      ])
      const myDeals = filter(rawDeals), myContacts = filter(rawContacts), myTasks = filter(rawTasks)
      const myListings = filter(rawListings), myOH = filter(rawOH)
      const yr = String(new Date().getFullYear())
      const todayStr = new Date().toISOString().slice(0,10)
      const weekStr = new Date(Date.now()+7*864e5).toISOString().slice(0,10)

      const activeDeals = myDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
      const closedDeals = myDeals.filter(d => d.stage === 'Closed' && d.ao_date?.startsWith(yr))
      const todayTasks = myTasks.filter(t => t.status !== 'done' && (isDueToday(t.due_date) || isOverdue(t.due_date)))
      const hotLeads = myContacts.filter(c => c.status === 'Hot' || c.status === 'Warm')
      const upcoming = myDeals.filter(d => { const dt = d.expected_close_date||d.close_date; const dd = getDaysUntil(dt); return dd!==null && dd>=0 && dd<=30 && d.stage!=='Closed' })
      const activeListings = myListings.filter(l => l.status === 'Active')
      const upcomingOH = myOH.filter(oh => oh.date >= todayStr && oh.date <= weekStr)
      const acceptedOffers = myDeals.filter(d => d.stage === 'Offer Accapted')

      setData({
        closedGCI: closedDeals.reduce((s,d)=>s+parseNum(d.gci),0),
        pipelineGCI: activeDeals.reduce((s,d)=>s+parseNum(d.gci),0),
        activeDeals, closedDeals, todayTasks, hotLeads, upcoming,
        activeListings, upcomingOH, acceptedOffers,
        contactCount: myContacts.length, announcements: rawAnn,
      })
    } catch (e) { console.warn('dashboard load', e.message) }
    setLoading(false)
  }, [agent, isAdmin, canManage])
  useEffect(() => { loadData() }, [loadData])

  // ── listing tiles (MLS + team) ──
  const loadTiles = useCallback(async () => {
    try {
      const r = await authFetch('/api/dashboard-data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'counts', days: listingDays }) })
      const j = await r.json(); if (r.ok) setTiles(j)
    } catch (e) { /* non-fatal */ }
  }, [listingDays])
  useEffect(() => { loadTiles() }, [loadTiles])

  useEffect(() => {
    if (!areasOpen) return
    authFetch('/api/dashboard-data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_areas' }) })
      .then(r => r.json()).then(j => { if (j.areas) setAreas({ cities: j.areas.cities||[], maxprice: j.areas.maxprice||'', minbeds: j.areas.minbeds||'' }) }).catch(()=>{})
  }, [areasOpen])

  async function saveAreas() {
    try {
      await authFetch('/api/dashboard-data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'save_areas', areas }) })
      toast?.('✅ Watch areas saved'); setAreasOpen(false); loadTiles()
    } catch (e) { toast?.('Save failed: ' + e.message, '#DC2626') }
  }

  if (loading || !data) return <div style={{ padding: 40, textAlign:'center', color:'var(--muted)', fontFamily: ff }}>Loading dashboard…</div>

  const first = agent?.name?.split(' ')[0] || 'there'
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ fontFamily: ff }}>
      {/* header + compact controls */}
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>{greet}, {first} 👋</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</div>
        </div>
      </div>

      {/* ── RATE BAR (full-width, utilized) ── */}
      <div style={{ marginBottom: 18 }}>
        <MarketWidget />
      </div>

      {/* ── PRIMARY METRICS (app-style, clickable) ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))', gap:12, marginBottom:14 }}>
        <Tile big icon="💰" label={'Closed GCI ' + new Date().getFullYear()} value={money(data.closedGCI)} sub={data.closedDeals.length + ' deals closed'} color="#00A651" onClick={() => navigate('/production')} />
        <Tile big icon="📊" label="Pipeline GCI" value={money(data.pipelineGCI)} sub={data.activeDeals.length + ' active deals'} color="#2563EB" onClick={() => navigate('/production')} />
        <Tile big icon="🔥" label="Hot & Warm Leads" value={data.hotLeads.length} sub="tap to view" color="#F59E0B" onClick={() => navigate('/contacts?status=Hot')} />
        <Tile big icon="✅" label="Tasks Due" value={data.todayTasks.length} sub="today + overdue" color="#EF4444" onClick={() => navigate('/tasks')} />
      </div>

      {/* ── LISTING TILES (new) ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'20px 0 10px' }}>
        <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>New Listings</div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {[7,14,30].map(d => (
            <button key={d} onClick={() => setListingDays(d)}
              style={{ padding:'4px 10px', borderRadius:7, border:'1px solid '+(listingDays===d?'var(--brand)':'var(--border)'), background:listingDays===d?'var(--brand)':'var(--dim)', color:listingDays===d?'#fff':'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}>{d}d</button>
          ))}
          {(isAdmin||canManage) && <button onClick={() => setAreasOpen(o=>!o)} style={{ padding:'4px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>⚙️ Areas</button>}
        </div>
      </div>

      {areasOpen && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:8 }}>MLS WATCH AREAS (cities to track new listings in)</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
            {areas.cities.map(c => (
              <span key={c} style={{ background:'var(--dim)', borderRadius:999, padding:'3px 10px', fontSize:12, display:'flex', gap:6, alignItems:'center' }}>
                {c} <span onClick={() => setAreas(a=>({...a, cities:a.cities.filter(x=>x!==c)}))} style={{ cursor:'pointer', color:'var(--muted)' }}>✕</span>
              </span>
            ))}
            {!areas.cities.length && <span style={{ fontSize:12, color:'var(--muted)' }}>No areas yet — add a city below.</span>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <input value={cityInput} onChange={e=>setCityInput(e.target.value)} placeholder="Add city (e.g. Monroe)"
              onKeyDown={e=>{ if(e.key==='Enter'&&cityInput.trim()){ setAreas(a=>({...a,cities:[...new Set([...a.cities,cityInput.trim()])]})); setCityInput('') } }}
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, fontFamily:ff }} />
            <input value={areas.maxprice} onChange={e=>setAreas(a=>({...a,maxprice:e.target.value}))} placeholder="Max price" type="number"
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, width:110, fontFamily:ff }} />
            <input value={areas.minbeds} onChange={e=>setAreas(a=>({...a,minbeds:e.target.value}))} placeholder="Min beds" type="number"
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, width:100, fontFamily:ff }} />
            <button onClick={saveAreas} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:ff }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))', gap:12, marginBottom:14 }}>
        <Tile icon="🏘️" label={'New MLS Listings (' + listingDays + 'd)'}
          value={tiles?.mls?.configured ? tiles.mls.count : '—'}
          sub={tiles?.mls?.configured ? (tiles.mls.cities?.join(', ') || 'watch areas') : 'set watch areas + MLS access'}
          color="#7C3AED" onClick={() => navigate('/mls-search')} />
        <Tile icon="🏡" label={'New Team Listings (' + listingDays + 'd)'}
          value={tiles?.team?.count ?? '—'}
          sub="added by the team" color="#0EA5E9" onClick={() => navigate('/my-listings')} />
      </div>

      {/* ── SECONDARY METRICS (clickable) ── */}
      <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'20px 0 10px' }}>Your Numbers</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:12, marginBottom:14 }}>
        <Tile icon="🤝" label="Offers Accepted" value={data.acceptedOffers.length} color="#00c875" onClick={() => navigate('/production')} />
        <Tile icon="📅" label="Closing Soon" value={data.upcoming.length} sub="next 30 days" color="#F59E0B" onClick={() => navigate('/transactions')} />
        <Tile icon="🏷️" label="Active Listings" value={data.activeListings.length} color="#2563EB" onClick={() => navigate('/my-listings')} />
        <Tile icon="👥" label="Total Contacts" value={data.contactCount} color="#8B5CF6" onClick={() => navigate('/contacts')} />
        <Tile icon="🚪" label="Open Houses" value={data.upcomingOH.length} sub="this week" color="#EC4899" onClick={() => navigate('/open-house')} />
        <Tile icon="📣" label="Announcements" value={data.announcements.length} color="#64748B" onClick={() => navigate('/announcements')} />
      </div>

      {/* announcements strip */}
      {data.announcements.length > 0 && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:14, padding:16, marginTop:8 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:10 }}>📣 Latest Announcements</div>
          {data.announcements.slice(0,3).map(a => (
            <div key={a.id} onClick={() => navigate('/announcements')} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{a.pinned && '📌 '}{a.title}</div>
              {a.body && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.body}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
