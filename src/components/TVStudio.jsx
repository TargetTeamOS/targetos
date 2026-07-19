import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Admin → TV Board: full ownership of the office display.
// Playlist (dashboard / Google Slides / images with per-item duration
// and day/time scheduling), image uploads, popup timing, TV link,
// and step-by-step instructions. Admin-only by placement.

const ff = "'Inter', -apple-system, sans-serif"
const inputStyle = { padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none' }
const btn = { padding: '7px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const TYPE_META = { dashboard: '📊 Stats Dashboard', slides: '🖥️ Google Slides', image: '🖼️ Image' }

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data && data.session ? data.session.access_token : ''
    return token ? { Authorization: 'Bearer ' + token } : {}
  } catch (e) { return {} }
}

export function TVStudio() {
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [tvUrl, setTvUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newItem, setNewItem] = useState({ type: 'image', title: '', src: '', duration_seconds: 30 })

  async function load() {
    try {
      const { data, error } = await supabase.from('tv_playlist').select('*').order('position')
      if (error) throw error
      setItems(data || [])
      setErr('')
    } catch (e) {
      setErr(e.message + ' — if the table is missing, run sql/connectors.sql (v6) in Supabase.')
      setItems([])
    }
  }

  async function loadTvUrl() {
    try {
      const h = await authHeaders()
      const r = await fetch('/api/connectors', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ action: 'reveal_webhook_secret', id: 'display' }),
      })
      const j = await r.json()
      if (r.ok && j.webhook_secret) setTvUrl(window.location.origin + '/tv?token=' + j.webhook_secret)
    } catch (e) { /* card still works without it */ }
  }

  useEffect(() => { load(); loadTvUrl() }, [])

  async function patch(id, changes) {
    try {
      changes.updated_at = new Date().toISOString()
      const { error } = await supabase.from('tv_playlist').update(changes).eq('id', id)
      if (error) throw error
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function move(idx, dir) {
    const a = items[idx], b = items[idx + dir]
    if (!a || !b) return
    await supabase.from('tv_playlist').update({ position: b.position }).eq('id', a.id)
    await supabase.from('tv_playlist').update({ position: a.position }).eq('id', b.id)
    await load()
  }

  async function remove(id) {
    if (!window.confirm('Remove this playlist item?')) return
    try {
      const { error } = await supabase.from('tv_playlist').delete().eq('id', id)
      if (error) throw error
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function addItem(src) {
    setBusy(true)
    try {
      const maxPos = (items || []).reduce((m, i) => Math.max(m, i.position), 0)
      const { error } = await supabase.from('tv_playlist').insert([{
        position: maxPos + 1,
        type: newItem.type,
        title: newItem.title || (TYPE_META[newItem.type] || newItem.type),
        src: src !== undefined ? src : (newItem.type === 'dashboard' ? null : newItem.src),
        duration_seconds: Math.max(5, Number(newItem.duration_seconds) || 30),
        enabled: true,
      }])
      if (error) throw error
      setNewItem({ type: 'image', title: '', src: '', duration_seconds: 30 })
      await load()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  async function uploadFile(file) {
    if (!file) return
    setUploading(true)
    try {
      const path = Date.now() + '-' + file.name.replace(/[^\w.\-]/g, '_')
      const { error } = await supabase.storage.from('tv-media').upload(path, file, { upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('tv-media').getPublicUrl(path)
      await addItem(data.publicUrl)
    } catch (e) { setErr('Upload failed: ' + e.message + ' — if the bucket is missing, run sql/connectors.sql (v6).') }
    setUploading(false)
  }

  function toggleDay(item, day) {
    const days = Array.isArray(item.days) ? [...item.days] : []
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day]
    patch(item.id, { days: next.length ? next : null })
  }

  if (items === null) return <div style={{ padding: '20px', color: '#64748B', fontFamily: ff, fontSize: '13px' }}>Loading TV Board…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '860px' }}>
      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontFamily: ff }}>{err}</div>}

      {/* TV link */}
      {tvUrl && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input readOnly value={tvUrl} style={Object.assign({}, inputStyle, { flex: 1, color: '#475569' })} />
          <button onClick={() => { try { navigator.clipboard.writeText(tvUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch (e) {} }}
            style={Object.assign({}, btn, { background: '#0F172A', color: '#fff', whiteSpace: 'nowrap' })}>{copied ? 'Copied ✓' : 'Copy TV link'}</button>
          <a href={tvUrl} target="_blank" rel="noreferrer"
            style={Object.assign({}, btn, { background: '#2563EB', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' })}>Preview</a>
        </div>
      )}

      {/* ── PLAYLIST ── */}
      <div>
        <div style={{ fontWeight: 700, fontSize: '15px', color: '#0F172A', fontFamily: ff, marginBottom: '8px' }}>📺 Playlist — plays top to bottom, loops forever</div>
        {!items.length && (
          <div style={{ color: '#64748B', fontSize: '13px', fontFamily: ff, padding: '14px', background: '#F8FAFC', borderRadius: '10px' }}>
            No playlist yet — the TV shows the stats dashboard. Add items below to take control.
          </div>
        )}
        {items.map((item, idx) => (
          <div key={item.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '10px 14px', background: item.enabled ? '#FFFFFF' : '#F8FAFC', marginBottom: '8px', opacity: item.enabled ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#64748B', padding: '0' }}>▲</button>
                <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: '#64748B', padding: '0' }}>▼</button>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: ff, minWidth: '150px' }}>{TYPE_META[item.type] || item.type}</span>
              <input value={item.title || ''} onChange={e => {}} onBlur={e => patch(item.id, { title: e.target.value })}
                defaultValue={item.title || ''} placeholder="Label"
                style={Object.assign({}, inputStyle, { width: '140px' })} />
              <input type="number" min="5" max="600" defaultValue={item.duration_seconds}
                onBlur={e => patch(item.id, { duration_seconds: Math.max(5, Number(e.target.value) || 30) })}
                style={Object.assign({}, inputStyle, { width: '70px' })} />
              <span style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>sec</span>
              <label style={{ fontSize: '12px', color: '#64748B', fontFamily: ff, display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                <input type="checkbox" checked={item.enabled} onChange={e => patch(item.id, { enabled: e.target.checked })} /> on
              </label>
              <button onClick={() => remove(item.id)} style={Object.assign({}, btn, { background: '#FEE2E2', color: '#991B1B', padding: '5px 10px' })}>✕</button>
            </div>
            {item.type !== 'dashboard' && (
              <div style={{ fontSize: '12px', color: '#94A3B8', fontFamily: ff, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.src}</div>
            )}
            {/* schedule */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>Runs:</span>
              {DAYS.map(d => {
                const active = !Array.isArray(item.days) || !item.days.length || item.days.includes(d)
                const explicit = Array.isArray(item.days) && item.days.length
                return (
                  <button key={d} onClick={() => toggleDay(item, d)}
                    style={{ border: '1px solid ' + (explicit && active ? '#2563EB' : '#E2E8F0'), background: explicit && active ? '#DBEAFE' : (!explicit ? '#F8FAFC' : '#fff'), color: explicit && active ? '#1D4ED8' : '#64748B', borderRadius: '6px', padding: '3px 7px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: ff, textTransform: 'uppercase' }}>
                    {d}
                  </button>
                )
              })}
              <span style={{ fontSize: '12px', color: '#64748B', fontFamily: ff, marginLeft: '6px' }}>from</span>
              <input type="time" defaultValue={item.start_time ? String(item.start_time).slice(0, 5) : ''}
                onBlur={e => patch(item.id, { start_time: e.target.value || null })}
                style={Object.assign({}, inputStyle, { width: '110px' })} />
              <span style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>to</span>
              <input type="time" defaultValue={item.end_time ? String(item.end_time).slice(0, 5) : ''}
                onBlur={e => patch(item.id, { end_time: e.target.value || null })}
                style={Object.assign({}, inputStyle, { width: '110px' })} />
              <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: ff }}>(no days/times selected = always)</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── ADD ITEM ── */}
      <div style={{ border: '1px dashed #CBD5E1', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A', fontFamily: ff, marginBottom: '8px' }}>➕ Add to playlist</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={newItem.type} onChange={e => setNewItem(Object.assign({}, newItem, { type: e.target.value }))}
            style={Object.assign({}, inputStyle, { width: 'auto' })}>
            <option value="image">🖼️ Image (upload or URL)</option>
            <option value="slides">🖥️ Google Slides</option>
            <option value="dashboard">📊 Stats Dashboard</option>
          </select>
          <input value={newItem.title} onChange={e => setNewItem(Object.assign({}, newItem, { title: e.target.value }))}
            placeholder="Label (optional)" style={Object.assign({}, inputStyle, { width: '150px' })} />
          <input type="number" min="5" max="600" value={newItem.duration_seconds}
            onChange={e => setNewItem(Object.assign({}, newItem, { duration_seconds: e.target.value }))}
            style={Object.assign({}, inputStyle, { width: '70px' })} />
          <span style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>sec</span>
        </div>
        {newItem.type !== 'dashboard' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newItem.src} onChange={e => setNewItem(Object.assign({}, newItem, { src: e.target.value }))}
              placeholder={newItem.type === 'slides' ? "Google Slides 'Publish to web' link" : 'Image URL (or upload →)'}
              style={Object.assign({}, inputStyle, { flex: 1, minWidth: '260px' })} />
            {newItem.type === 'image' && (
              <label style={Object.assign({}, btn, { background: '#F1F5F9', color: '#334155', display: 'inline-block' })}>
                {uploading ? 'Uploading…' : '⬆️ Upload image'}
                <input type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => uploadFile(e.target.files && e.target.files[0])} disabled={uploading} />
              </label>
            )}
          </div>
        )}
        <button onClick={() => addItem()} disabled={busy || (newItem.type !== 'dashboard' && !newItem.src)}
          style={Object.assign({}, btn, { background: '#0F172A', color: '#fff', marginTop: '10px' })}>
          {busy ? 'Adding…' : 'Add to playlist'}
        </button>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div style={{ fontSize: '12px', color: '#475569', fontFamily: ff, background: '#F8FAFC', borderRadius: '10px', padding: '12px 16px', lineHeight: 1.8 }}>
        <b>How it works:</b><br />
        1. <b>TV:</b> Copy the link above → open in the TV/Fire Stick browser → full-screen once. Every change here reaches the TV within ~1 minute.<br />
        2. <b>Playlist:</b> items play top-to-bottom in a loop, each for its own seconds. Use ▲▼ to reorder, the checkbox to pause an item without deleting it.<br />
        3. <b>Scheduling:</b> click day pills and set from/to times per item — e.g. open-house flyer only Sun 11:00–14:00. Nothing selected = plays always. Times are office time (New York).<br />
        4. <b>Google Slides:</b> in Slides: File → Share → Publish to web → set auto-advance + "start slideshow when player loads" → Publish → paste that link.<br />
        5. <b>Announcement pop-ups:</b> post in Announcements with "📺 Show on office TV" — set how many seconds it stays on screen and until what date it keeps popping (once per minute). "🎉 Celebrate" adds full-screen confetti. Pop-ups appear over whatever is playing.<br />
        6. Empty playlist = the stats dashboard runs full-time.
      </div>
    </div>
  )
}
