import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { authFetch } from '../lib/apiAuth'

// Renders the user's pinned custom filters as live tiles on the
// dashboard. Counts refresh on load and every 60s, so they stay
// current. Clicking opens the board with that filter applied.
const ff = 'Inter, system-ui, sans-serif'
const BOARD_ROUTE = { contacts:'/contacts', deals:'/production', listings:'/my-listings', tasks:'/tasks', offers:'/production' }

export function DashboardPins() {
  const navigate = useNavigate()
  const [pins, setPins] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/dashboard-pins', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'list' }) })
      const j = await r.json(); if (r.ok) setPins(j.pins || [])
    } catch (e) { setPins([]) }
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)   // auto-update
    return () => clearInterval(t)
  }, [load])

  async function remove(id) {
    if (!window.confirm('Remove this pinned filter?')) return
    try { await authFetch('/api/dashboard-pins', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'delete', id }) }); load() } catch (e) {}
  }

  function openPin(p) {
    const base = BOARD_ROUTE[p.board] || '/'
    const qs = new URLSearchParams()
    const f = p.filters || {}
    if (f.status) qs.set('status', f.status)
    if (f.stage) qs.set('stage', f.stage)
    if (f.source) qs.set('source', f.source)
    navigate(base + (qs.toString() ? '?' + qs.toString() : ''))
  }

  if (!pins || pins.length === 0) return null

  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:15, fontWeight:800, color:'var(--text)', marginBottom:10, fontFamily:ff }}>📌 My Pinned Filters</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 }}>
        {pins.map(p => (
          <div key={p.id} onClick={() => openPin(p)}
            style={{ position:'relative', background:'var(--panel)', border:'1px solid var(--border)', borderLeft:'4px solid '+p.color, borderRadius:14, padding:16, cursor:'pointer', fontFamily:ff, transition:'transform .12s' }}
            onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.03em', paddingRight:18 }}>{p.title}</div>
            <div style={{ fontSize:32, fontWeight:800, color:p.color, marginTop:4, lineHeight:1 }}>{p.count ?? '—'}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4, display:'flex', gap:6, alignItems:'center' }}>
              {p.board}{p.shared_all ? ' · 👥 team' : (p.shared_with?.length ? ' · 👥 shared' : '')}{!p.mine ? ' · shared with you' : ''}
            </div>
            {p.mine && (
              <span onClick={e=>{ e.stopPropagation(); remove(p.id) }}
                title="Remove" style={{ position:'absolute', top:10, right:12, fontSize:13, color:'var(--muted)', opacity:.5 }}>✕</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
