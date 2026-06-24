// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Signs Board
// • Google Maps view showing every sign by address
// • Status badges: On Property, Order Sent, Missing, Removed
// • Rider info: For Sale, Under Contract, Sold, Coming Soon
// • Agent assignment, date installed/removed
// • Route planner: select signs → get optimized Google Maps route
// • Synced from Sign Inventory board (211 signs)
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmtDate, matchSearch } from '../lib/utils'
import { Btn, Loading, Empty, Confirm, Pill, Avatar } from '../components/UI'
import { ImportExport } from '../components/ImportExport'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const SIGNS_EXPORT_COLS = [
  { key: 'addr',           label: 'Address',         example: '123 Main St, Monsey NY 10952' },
  { key: 'order_status',   label: 'Order Status',    example: 'On Property' },
  { key: 'upper_rider',    label: 'Upper Rider',     example: 'For Sale' },
  { key: 'lower_rider',    label: 'Lower Rider',     example: 'Under Contract' },
  { key: 'date_installed', label: 'Date Installed',  example: '2026-01-15', type: 'date' },
  { key: 'date_removed',   label: 'Date Removed',    example: '2026-06-01', type: 'date' },
  { key: 'comments',       label: 'Comments',        example: '' },
]

// ── CONSTANTS ─────────────────────────────────────────────────────
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

const ORDER_STATUS = [
  { id: 'On Property',           color: '#10B981', bg: '#F0FDF4', icon: '✅' },
  { id: 'Order Sent In',         color: '#F5A623', bg: '#FFF7ED', icon: '📤' },
  { id: 'Missing - broken',      color: '#DC2626', bg: '#FEF2F2', icon: '⚠️' },
  { id: 'Took Away',             color: '#6366F1', bg: '#EEF2FF', icon: '🏁' },
  { id: 'Removal Order Sent',    color: '#8B5CF6', bg: '#F5F3FF', icon: '📋' },
  { id: 'Auto Remove Order',     color: '#14B8A6', bg: '#F0FDFA', icon: '🔄' },
]

const RIDER_STATUS = [
  { id: 'For Sale',       color: '#10B981', icon: '🏡' },
  { id: 'Under Contract', color: '#F5A623', icon: '📝' },
  { id: 'Coming Soon',    color: '#3B82F6', icon: '🔜' },
  { id: 'Sold 2025',      color: '#8B5CF6', icon: '🎉' },
  { id: 'Sold 2024',      color: '#EC4899', icon: '🎉' },
  { id: 'For Rent',       color: '#14B8A6', icon: '🔑' },
  { id: 'missing',        color: '#DC2626', icon: '⚠️' },
]

const GROUPS = [
  { id: 'all',         label: 'All Signs' },
  { id: 'on_property', label: 'On Property' },
  { id: 'order_sent',  label: 'Order Sent' },
  { id: 'missing',     label: 'Missing' },
  { id: 'removed',     label: 'Removed' },
]

const BLANK = {
  addr: '', agent_id: '', upper_rider: '', lower_rider: '',
  order_status: 'Order Sent In', date_installed: '', date_removed: '', comments: '',
}

// ── STATUS BADGE ──────────────────────────────────────────────────
function StatusBadge({ status, size = 'sm' }) {
  const def = ORDER_STATUS.find(s => s.id === status) || ORDER_STATUS[1]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: size === 'lg' ? '4px 10px' : '2px 7px',
      borderRadius: '20px', background: def.bg,
      color: def.color, fontSize: size === 'lg' ? '12px' : '10px', fontWeight: 700,
      border: `1px solid ${def.color}33`,
    }}>
      {def.icon} {status}
    </span>
  )
}

function RiderBadge({ rider }) {
  if (!rider) return null
  const def = RIDER_STATUS.find(r => r.id === rider) || { color: '#94A3B8', icon: '🏷' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 6px', borderRadius: '12px',
      background: def.color + '18', color: def.color,
      fontSize: '10px', fontWeight: 700,
    }}>
      {def.icon} {rider}
    </span>
  )
}

// ── GOOGLE MAP COMPONENT ──────────────────────────────────────────
function SignsMap({ signs, selectedIds, onToggleSelect, onSignClick }) {
  const mapRef   = useRef(null)
  const mapObj   = useRef(null)
  const markers  = useRef([])
  const infoWin  = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [geocoded, setGeocoded]   = useState(0)

  // Load Google Maps script
  useEffect(() => {
    if (window.google?.maps) { setMapReady(true); return }
    if (!GOOGLE_MAPS_KEY) { console.warn('VITE_GOOGLE_MAPS_KEY not set'); setMapReady(true); return }

    const existing = document.getElementById('gmap-script')
    if (existing) { existing.onload = () => setMapReady(true); return }

    const script = document.createElement('script')
    script.id  = 'gmap-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`
    script.async = true
    script.onload = () => setMapReady(true)
    document.head.appendChild(script)
  }, [])

  // Init map
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapObj.current) return
    if (!window.google?.maps) return

    mapObj.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.12, lng: -74.04 }, // Monsey / Rockland area
      zoom: 11,
      mapTypeId: 'roadmap',
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      fullscreenControl: false,
    })
    infoWin.current = new window.google.maps.InfoWindow()
  }, [mapReady])

  // Geocode signs and place markers
  useEffect(() => {
    if (!mapObj.current || !window.google?.maps) return

    // Clear existing markers
    markers.current.forEach(m => m.setMap(null))
    markers.current = []

    const geocoder = new window.google.maps.Geocoder()
    const signsWithAddr = signs.filter(s => s.addr?.length > 5)

    if (!signsWithAddr.length) return
    setGeocoding(true)
    setGeocoded(0)

    let done = 0
    const bounds = new window.google.maps.LatLngBounds()

    signsWithAddr.forEach((sign, i) => {
      // Throttle geocode calls (5/sec limit on free tier)
      setTimeout(() => {
        geocoder.geocode({ address: sign.addr }, (results, status) => {
          done++
          setGeocoded(done)
          if (done === signsWithAddr.length) setGeocoding(false)

          if (status !== 'OK' || !results?.[0]) return

          const pos    = results[0].geometry.location
          const isSelected = selectedIds.includes(sign.id)
          const statusDef  = ORDER_STATUS.find(s => s.id === sign.order_status) || ORDER_STATUS[1]

          const marker = new window.google.maps.Marker({
            position: pos,
            map: mapObj.current,
            title: sign.addr,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: isSelected ? 14 : 10,
              fillColor: isSelected ? '#CC2200' : statusDef.color,
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            },
            animation: isSelected ? window.google.maps.Animation.BOUNCE : null,
          })

          marker.signId = sign.id

          marker.addListener('click', () => {
            const content = `
              <div style="font-family:Inter,sans-serif;padding:4px;max-width:240px">
                <div style="font-weight:700;font-size:13px;color:#1E293B;margin-bottom:6px">${sign.addr}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                  <span style="font-size:11px;padding:2px 7px;border-radius:12px;background:${statusDef.bg};color:${statusDef.color};font-weight:700">${statusDef.icon} ${sign.order_status || 'Unknown'}</span>
                  ${sign.lower_rider ? `<span style="font-size:11px;padding:2px 7px;border-radius:12px;background:#F0F9FF;color:#0369A1;font-weight:700">${sign.lower_rider}</span>` : ''}
                </div>
                ${sign.upper_rider ? `<div style="font-size:11px;color:#64748B">Upper rider: ${sign.upper_rider}</div>` : ''}
                ${sign.date_installed ? `<div style="font-size:11px;color:#64748B">Installed: ${sign.date_installed}</div>` : ''}
                <button onclick="window.__signClick && window.__signClick('${sign.id}')" 
                  style="margin-top:8px;padding:5px 12px;background:#CC2200;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;font-family:Inter,sans-serif">
                  Edit Sign →
                </button>
              </div>`
            infoWin.current.setContent(content)
            infoWin.current.open(mapObj.current, marker)
          })

          markers.current.push(marker)
          bounds.extend(pos)

          if (done === signsWithAddr.length && markers.current.length > 0) {
            mapObj.current.fitBounds(bounds)
            if (signsWithAddr.length === 1) mapObj.current.setZoom(14)
          }
        })
      }, i * 200) // 200ms between calls = 5/sec
    })
  }, [signs, selectedIds])

  // Expose click handler globally for InfoWindow button
  useEffect(() => {
    window.__signClick = onSignClick
    return () => { delete window.__signClick }
  }, [onSignClick])

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', background: 'var(--dim)', borderRadius: '12px' }}>
        <div style={{ fontSize: '32px' }}>🗺️</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Google Maps not configured</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', maxWidth: '260px' }}>
          Add <code>VITE_GOOGLE_MAPS_KEY=your_key</code> to Vercel environment variables, then redeploy.
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {geocoding && (
        <div style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,.7)', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
          📍 Mapping signs... {geocoded}/{signs.filter(s => s.addr?.length > 5).length}
        </div>
      )}
    </div>
  )
}

// ── SIGN EDIT MODAL ───────────────────────────────────────────────
function SignModal({ sign, agents, onSave, onClose, saving }) {
  const [f, setF] = useState(() => sign || { ...BLANK })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const Lbl = ({ children }) => (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{children}</div>
  )
  const Inp = ({ k, type = 'text', placeholder }) => (
    <input type={type} value={f[k] || ''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, boxSizing: 'border-box' }} />
  )
  const Sel = ({ k, options }) => (
    <select value={f[k] || ''} onChange={e => set(k, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🪧</span>
          <div style={{ flex: 1, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{sign ? 'Edit Sign' : 'Add Sign'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div><Lbl>Property Address *</Lbl><Inp k="addr" placeholder="123 Main St, Monsey, NY 10952" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <Lbl>Order Status</Lbl>
              <select value={f.order_status || ''} onChange={e => set('order_status', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
                {ORDER_STATUS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.id}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Deal Agent</Lbl>
              <select value={f.agent_id || ''} onChange={e => set('agent_id', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
                <option value="">— Unassigned —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <Lbl>Upper Rider</Lbl>
              <Sel k="upper_rider" options={['For Sale','Under Contract','Coming Soon','Sold','For Rent','1 Unit Left']} />
            </div>
            <div>
              <Lbl>Lower Rider</Lbl>
              <Sel k="lower_rider" options={['For Sale','Under Contract','Coming Soon','Sold 2025','Sold 2024','For Rent','missing']} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><Lbl>Date Installed</Lbl><Inp k="date_installed" type="date" /></div>
            <div><Lbl>Date Removed</Lbl><Inp k="date_removed" type="date" /></div>
          </div>
          <div>
            <Lbl>Comments</Lbl>
            <textarea value={f.comments || ''} onChange={e => set('comments', e.target.value)}
              placeholder="Notes about this sign..." rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => onSave(f)} loading={saving}>Save Sign</Btn>
        </div>
      </div>
    </div>
  )
}

// ── ROUTE PLANNER ─────────────────────────────────────────────────
function RoutePlanner({ signs, selectedIds, onClear }) {
  const selected = signs.filter(s => selectedIds.includes(s.id))

  function buildRouteUrl() {
    if (selected.length < 2) return null
    const [origin, ...rest] = selected
    const dest = rest[rest.length - 1]
    const waypoints = rest.slice(0, -1)
    const waypointStr = waypoints.map(s => encodeURIComponent(s.addr)).join('|')
    let url = `https://www.google.com/maps/dir/?api=1`
    url += `&origin=${encodeURIComponent(origin.addr)}`
    url += `&destination=${encodeURIComponent(dest.addr)}`
    if (waypointStr) url += `&waypoints=${waypointStr}`
    url += `&travelmode=driving&optimize=true`
    return url
  }

  if (!selected.length) return null

  const routeUrl = buildRouteUrl()

  return (
    <div style={{ background: '#1B2B4B', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
            🗺️ Route Planner — {selected.length} sign{selected.length !== 1 ? 's' : ''} selected
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.5)' }}>
            {selected.map(s => s.addr?.split(',')[0]).join(' → ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={onClear}
            style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: 'rgba(255,255,255,.7)', fontSize: '12px', cursor: 'pointer', fontFamily: ff, fontWeight: 600 }}>
            Clear
          </button>
          {routeUrl && (
            <a href={routeUrl} target="_blank" rel="noopener noreferrer"
              style={{ padding: '6px 14px', borderRadius: '7px', background: '#CC2200', color: '#fff', fontSize: '12px', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
              🚗 Open Route in Google Maps
            </a>
          )}
          {selected.length < 2 && (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,.5)', alignSelf: 'center' }}>Select at least 2 signs for a route</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SIGN ROW ──────────────────────────────────────────────────────
function SignRow({ sign, agents, isSelected, onToggleSelect, onEdit }) {
  const agent = agents.find(a => a.id === sign.agent_id)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto auto auto auto',
      alignItems: 'center', gap: '10px',
      padding: '10px 14px', background: isSelected ? 'rgba(204,34,0,.04)' : 'var(--panel)',
      borderRadius: '10px', border: `1px solid ${isSelected ? '#CC220033' : 'var(--border)'}`,
      transition: 'all .12s', cursor: 'pointer',
    }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--hov)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'var(--panel)' }}
    >
      {/* Checkbox */}
      <div onClick={() => onToggleSelect(sign.id)}
        style={{ width: 18, height: 18, borderRadius: '5px', border: `2px solid ${isSelected ? '#CC2200' : 'var(--border)'}`, background: isSelected ? '#CC2200' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .12s' }}>
        {isSelected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 900 }}>✓</span>}
      </div>

      {/* Address + riders */}
      <div onClick={() => onEdit(sign)} style={{ minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
          {sign.addr}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {sign.upper_rider && <RiderBadge rider={sign.upper_rider} />}
          {sign.lower_rider && sign.lower_rider !== sign.upper_rider && <RiderBadge rider={sign.lower_rider} />}
          {sign.comments && <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>{sign.comments.slice(0, 40)}{sign.comments.length > 40 ? '…' : ''}</span>}
        </div>
      </div>

      {/* Agent */}
      <div onClick={() => onEdit(sign)} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {agent && <Avatar agent={agent} size={22} />}
        <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{agent?.name || '—'}</span>
      </div>

      {/* Date */}
      <div onClick={() => onEdit(sign)} style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>
        {sign.date_installed ? fmtDate(sign.date_installed) : '—'}
      </div>

      {/* Status */}
      <div onClick={() => onEdit(sign)}><StatusBadge status={sign.order_status} /></div>

      {/* Edit */}
      <button onClick={() => onEdit(sign)}
        style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', fontFamily: ff, flexShrink: 0, whiteSpace: 'nowrap' }}>
        ✏️ Edit
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════
export function Signs() {
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()

  const [signs,       setSigns]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('')
  const [viewMode,    setViewMode]    = useState('split') // 'split' | 'map' | 'list'
  const [selectedIds, setSelectedIds] = useState([])
  const [editSign,    setEditSign]    = useState(null)  // null = closed, {} = new, {...} = existing
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)

  // Load from Supabase signs table
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('signs')
        .select('*, agents(id,name,color)')
        .order('created_at', { ascending: false })
      setSigns(data || [])
    } catch(e) { toast('Could not load signs: ' + e.message, '#DC2626') }
    finally { setLoading(false) }
  }

  // ── FILTERS ──────────────────────────────────────────────────────
  const filtered = signs.filter(s => {
    if (search && !matchSearch(s.addr, search) && !matchSearch(s.lower_rider, search) && !matchSearch(s.upper_rider, search)) return false
    if (agentFilter && s.agent_id !== agentFilter) return false
    if (groupFilter === 'on_property') return s.order_status === 'On Property'
    if (groupFilter === 'order_sent')  return s.order_status === 'Order Sent In'
    if (groupFilter === 'missing')     return s.order_status === 'Missing - broken'
    if (groupFilter === 'removed')     return ['Took Away','Removal Order Sent','Auto Remove Order'].includes(s.order_status)
    return true
  })

  // ── SELECT / ROUTE ────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function clearSelection() { setSelectedIds([]) }

  // ── SAVE ──────────────────────────────────────────────────────────
  async function save(data) {
    if (!data.addr?.trim()) { toast('Address is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (data.id) {
        await db.signs.update(data.id, data)
        setSigns(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s))
        toast('✅ Sign updated')
      } else {
        const created = await db.signs.create({ ...data, agent_id: data.agent_id || agent?.id })
        setSigns(prev => [{ ...created, agents: agents.find(a => a.id === created.agent_id) }, ...prev])
        toast('✅ Sign added')
      }
      setEditSign(null)
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function deleteSig() {
    if (!confirmDel) return
    try {
      await db.signs.remove(confirmDel.id, agent.id)
      setSigns(prev => prev.filter(s => s.id !== confirmDel.id))
      toast('Sign deleted')
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setConfirmDel(null) }
  }

  // Stats
  const onProperty = signs.filter(s => s.order_status === 'On Property').length
  const orderSent  = signs.filter(s => s.order_status === 'Order Sent In').length
  const missing    = signs.filter(s => s.order_status === 'Missing - broken').length

  return (
    <div style={{ fontFamily: ff, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>🪧 Signs Board</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              {signs.length} total · {onProperty} on property · {orderSent} ordered · {missing} missing
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* View mode toggle */}
            <div style={{ display: 'flex', background: 'var(--dim)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
              {[['split','⚡ Split'],['map','🗺 Map'],['list','📋 List']].map(([m, lbl]) => (
                <button key={m} onClick={() => setViewMode(m)}
                  style={{ padding: '5px 10px', borderRadius: '6px', border: 'none', background: viewMode === m ? 'var(--panel)' : 'transparent', color: viewMode === m ? 'var(--text)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff, boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                  {lbl}
                </button>
              ))}
            </div>
            {(isAdmin || canManage) && (
              <ImportExport
                table="signs"
                data={filtered}
                columns={SIGNS_EXPORT_COLS}
                label="Signs"
                onImport={load}
              />
            )}
            {(isAdmin || canManage) && <Btn onClick={() => setEditSign({})}>+ Add Sign</Btn>}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
          {[
            { label: 'On Property',   value: onProperty,                       color: '#10B981' },
            { label: 'Order Sent',    value: orderSent,                        color: '#F5A623' },
            { label: 'Missing',       value: missing,                          color: '#DC2626' },
            { label: 'Removed',       value: signs.filter(s => ['Took Away','Removal Order Sent'].includes(s.order_status)).length, color: '#8B5CF6' },
          ].map(s => (
            <div key={s.label} onClick={() => setGroupFilter(s.label.toLowerCase().replace(' ','_').replace('order_sent', 'order_sent'))}
              style={{ background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--border)', padding: '10px 12px', borderLeft: `3px solid ${s.color}`, cursor: 'pointer' }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '1px', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search address or rider..."
            style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }} />
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            {GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          {(isAdmin || canManage) && (
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {groupFilter !== 'all' && (
            <button onClick={() => setGroupFilter('all')}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: ff }}>
              ✕ Clear filter
            </button>
          )}
        </div>
      </div>

      {/* ── ROUTE PLANNER BANNER ── */}
      {selectedIds.length > 0 && (
        <RoutePlanner signs={signs} selectedIds={selectedIds} onClear={clearSelection} />
      )}

      {/* ── MAIN CONTENT ── */}
      {loading ? <Loading /> : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gap: '12px',
          gridTemplateColumns: viewMode === 'split' ? '1fr 1fr' : '1fr',
          gridTemplateRows: viewMode === 'map' ? '1fr' : viewMode === 'list' ? '1fr' : '1fr',
        }}>

          {/* MAP PANEL */}
          {(viewMode === 'split' || viewMode === 'map') && (
            <div style={{ borderRadius: '12px', overflow: 'hidden', minHeight: '400px' }}>
              <SignsMap
                signs={filtered}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onSignClick={id => { const s = signs.find(x => x.id === id); if (s) setEditSign(s) }}
              />
            </div>
          )}

          {/* LIST PANEL */}
          {(viewMode === 'split' || viewMode === 'list') && (
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '2px' }}>
              {filtered.length === 0 && (
                <Empty icon="🪧" title="No signs found" sub="Try adjusting your search or filter." />
              )}
              {selectedIds.length === 0 && filtered.length > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '4px 6px', fontStyle: 'italic' }}>
                  ☑ Click the checkbox on any sign to add it to your route
                </div>
              )}
              {filtered.map(s => (
                <SignRow
                  key={s.id}
                  sign={s}
                  agents={agents}
                  isSelected={selectedIds.includes(s.id)}
                  onToggleSelect={toggleSelect}
                  onEdit={setEditSign}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editSign !== null && (
        <SignModal
          sign={editSign.id ? editSign : null}
          agents={agents}
          saving={saving}
          onSave={save}
          onClose={() => setEditSign(null)}
        />
      )}

      <Confirm
        open={!!confirmDel}
        message={`Delete sign at "${confirmDel?.addr}"?`}
        onConfirm={deleteSig}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
