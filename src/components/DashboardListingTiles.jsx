import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../lib/apiAuth'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

// New-listing tiles for the dashboard: new MLS listings in admin-set
// watch areas + new team listings, with a custom timeframe (presets or
// exact dates). Clicking a tile opens the records behind it inline.
const ff = 'Inter, system-ui, sans-serif'
const money = n => { const v = Number(n)||0; if (v>=1e6) return '$'+(v/1e6).toFixed(1)+'M'; if (v>=1e3) return '$'+Math.round(v/1e3)+'K'; return '$'+Math.round(v) }

export function DashboardListingTiles() {
  const navigate = useNavigate()
  const { isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const [days, setDays] = useState(7)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [tiles, setTiles] = useState(null)
  const [expanded, setExpanded] = useState(null)  // 'mls' | 'team' | null
  const [areasOpen, setAreasOpen] = useState(false)
  const [areas, setAreas] = useState({ cities: [], maxprice: '', minbeds: '' })
  const [cityInput, setCityInput] = useState('')

  const effectiveDays = useCustom && customFrom && customTo
    ? Math.max(1, Math.round((new Date(customTo) - new Date(customFrom)) / 86400000))
    : days

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/dashboard-data', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'counts', days: effectiveDays }) })
      const j = await r.json(); if (r.ok) setTiles(j)
    } catch (e) { /* non-fatal */ }
  }, [effectiveDays])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!areasOpen) return
    authFetch('/api/dashboard-data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'get_areas' }) })
      .then(r=>r.json()).then(j=>{ if(j.areas) setAreas({ cities:j.areas.cities||[], maxprice:j.areas.maxprice||'', minbeds:j.areas.minbeds||'' }) }).catch(()=>{})
  }, [areasOpen])

  async function saveAreas() {
    try {
      await authFetch('/api/dashboard-data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'save_areas', areas }) })
      toast?.('✅ Watch areas saved'); setAreasOpen(false); load()
    } catch (e) { toast?.('Save failed: ' + e.message, '#DC2626') }
  }

  const tile = (key, icon, label, value, sub, color, onOpen) => (
    <div onClick={onOpen}
      style={{ background:'var(--panel)', border:'1px solid '+(expanded===key?color:'var(--border)'), borderRadius:14, padding:16, cursor:'pointer', flex:1, minWidth:220, transition:'border-color .15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span style={{ fontSize:18, width:34, height:34, borderRadius:9, background:color+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>{icon}</span>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.03em', fontFamily:ff }}>{label}</span>
      </div>
      <div style={{ fontSize:32, fontWeight:800, color, fontFamily:ff, lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:12, color:'var(--muted)', marginTop:4, fontFamily:ff }}>{sub} · <span style={{ color }}>{expanded===key?'hide':'view'} ▾</span></div>
    </div>
  )

  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', fontFamily:ff }}>New Listings</div>
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          {[7,14,30].map(d => (
            <button key={d} onClick={()=>{ setUseCustom(false); setDays(d) }}
              style={{ padding:'4px 10px', borderRadius:7, border:'1px solid '+(!useCustom&&days===d?'var(--brand)':'var(--border)'), background:!useCustom&&days===d?'var(--brand)':'var(--dim)', color:!useCustom&&days===d?'#fff':'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}>{d}d</button>
          ))}
          <button onClick={()=>setUseCustom(u=>!u)}
            style={{ padding:'4px 10px', borderRadius:7, border:'1px solid '+(useCustom?'var(--brand)':'var(--border)'), background:useCustom?'var(--brand)':'var(--dim)', color:useCustom?'#fff':'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}>Custom</button>
          {(isAdmin||canManage) && <button onClick={()=>setAreasOpen(o=>!o)} style={{ padding:'4px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>⚙️ Areas</button>}
        </div>
      </div>

      {useCustom && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
          <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:12, background:'var(--panel)', color:'var(--text)', fontFamily:ff }} />
          <span style={{ fontSize:12, color:'var(--muted)' }}>to</span>
          <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:12, background:'var(--panel)', color:'var(--text)', fontFamily:ff }} />
        </div>
      )}

      {areasOpen && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:8, fontFamily:ff }}>MLS WATCH AREAS</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
            {areas.cities.map(c => (
              <span key={c} style={{ background:'var(--dim)', borderRadius:999, padding:'3px 10px', fontSize:12, display:'flex', gap:6, alignItems:'center', fontFamily:ff }}>
                {c} <span onClick={()=>setAreas(a=>({...a, cities:a.cities.filter(x=>x!==c)}))} style={{ cursor:'pointer', color:'var(--muted)' }}>✕</span>
              </span>
            ))}
            {!areas.cities.length && <span style={{ fontSize:12, color:'var(--muted)', fontFamily:ff }}>No areas yet — add a city.</span>}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <input value={cityInput} onChange={e=>setCityInput(e.target.value)} placeholder="Add city + Enter"
              onKeyDown={e=>{ if(e.key==='Enter'&&cityInput.trim()){ setAreas(a=>({...a,cities:[...new Set([...a.cities,cityInput.trim()])]})); setCityInput('') } }}
              style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, fontFamily:ff }} />
            <input value={areas.maxprice} onChange={e=>setAreas(a=>({...a,maxprice:e.target.value}))} placeholder="Max $" type="number" style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, width:100, fontFamily:ff }} />
            <input value={areas.minbeds} onChange={e=>setAreas(a=>({...a,minbeds:e.target.value}))} placeholder="Min beds" type="number" style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, width:100, fontFamily:ff }} />
            <button onClick={saveAreas} style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:ff }}>Save</button>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
        {tile('mls', '🏘️', 'New MLS Listings', tiles?.mls?.configured ? tiles.mls.count : '—',
          tiles?.mls?.configured ? (tiles.mls.cities?.join(', ')||'watch areas') : 'set areas + MLS access',
          '#7C3AED', () => setExpanded(e => e==='mls'?null:'mls'))}
        {tile('team', '🏡', 'New Team Listings', tiles?.team?.count ?? '—', 'added by the team',
          '#0EA5E9', () => setExpanded(e => e==='team'?null:'team'))}
      </div>

      {/* inline drill-down: the actual records behind the number */}
      {expanded === 'mls' && tiles?.mls?.sample?.length > 0 && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:12, marginTop:10 }}>
          {tiles.mls.sample.map((l,i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13, fontFamily:ff }}>
              <span style={{ color:'var(--text)' }}>{l.addr}</span>
              <span style={{ color:'var(--muted)' }}>{l.beds?l.beds+'bd · ':''}{l.price?money(l.price):''}</span>
            </div>
          ))}
          <div onClick={()=>navigate('/mls-search')} style={{ fontSize:12, color:'#7C3AED', cursor:'pointer', marginTop:8, fontFamily:ff }}>Open full MLS search →</div>
        </div>
      )}
      {expanded === 'mls' && (!tiles?.mls?.configured || !tiles?.mls?.sample?.length) && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginTop:10, fontSize:13, color:'var(--muted)', fontFamily:ff }}>
          {tiles?.mls?.configured ? 'No new MLS listings in your watch areas for this timeframe.' : 'Add watch areas (⚙️) and connect MLS Grid to see live new listings here.'}
        </div>
      )}
      {expanded === 'team' && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:12, marginTop:10 }}>
          {(tiles?.team?.listings||[]).map(l => (
            <div key={l.id} onClick={()=>navigate('/my-listings')} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:13, cursor:'pointer', fontFamily:ff }}>
              <span style={{ color:'var(--text)' }}>{l.addr}{l.city?', '+l.city:''}</span>
              <span style={{ color:'var(--muted)' }}>{l.status} · {l.list_price?money(l.list_price):''}</span>
            </div>
          ))}
          {!(tiles?.team?.listings||[]).length && <div style={{ fontSize:13, color:'var(--muted)', fontFamily:ff }}>No new team listings in this timeframe.</div>}
          <div onClick={()=>navigate('/my-listings')} style={{ fontSize:12, color:'#0EA5E9', cursor:'pointer', marginTop:8, fontFamily:ff }}>Open all listings →</div>
        </div>
      )}
    </div>
  )
}
