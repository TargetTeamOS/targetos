import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// TV dashboard controls + live preview. Admin decides exactly which
// panels the stats board shows, its title, and sees the real TV
// output embedded before it hits the office screen.

const ff = "'Inter', -apple-system, sans-serif"
const btn = { padding: '7px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }
const inputStyle = { padding: '7px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none' }

const PANELS = [
  { key: 'accepted_mtd',  label: '✅ Offers Accepted — This Month (stat card)' },
  { key: 'pipeline',      label: '📈 Active Pipeline (stat card)' },
  { key: 'closed_ytd',    label: '🏁 Closed — Year to Date (stat card)' },
  { key: 'recent',        label: '🎉 Recently Accepted (list)' },
  { key: 'closing_soon',  label: '📅 Closing Soon — 30 days (list)' },
  { key: 'leaderboard',   label: '🏆 Agent Leaderboard — YTD (list)' },
]

async function authHeaders() {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data && data.session ? data.session.access_token : ''
    return token ? { Authorization: 'Bearer ' + token } : {}
  } catch (e) { return {} }
}

export function TVDashboardControls() {
  const [cfg, setCfg] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    try {
      const h = await authHeaders()
      const r = await fetch('/api/connectors', { headers: h })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'load failed')
      const row = (j.integrations || []).find(x => x.id === 'display')
      if (!row) throw new Error('Display connector missing — run sql/connectors.sql first')
      setCfg(Object.assign({ board_title: '', panels: {} }, row.config || {}))
    } catch (e) { setErr(e.message); setCfg({ board_title: '', panels: {} }) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    setBusy(true)
    try {
      const h = await authHeaders()
      const r = await fetch('/api/connectors', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ action: 'save_display_config', board_title: cfg.board_title || '', panels: cfg.panels || {} }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'save failed')
      setErr(''); setSaved(true); setTimeout(() => setSaved(false), 1800)
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (!cfg) return <div style={{ padding: '16px', color: '#64748B', fontFamily: ff, fontSize: '13px' }}>Loading…</div>

  const panels = cfg.panels || {}
  const on = k => panels[k] !== false // default: everything on

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '620px' }}>
      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontFamily: ff }}>{err}</div>}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: '#475569', fontFamily: ff, whiteSpace: 'nowrap' }}>Board title</span>
        <input value={cfg.board_title || ''} onChange={e => setCfg(Object.assign({}, cfg, { board_title: e.target.value }))}
          placeholder="TARGET TEAM LIVE BOARD (default)" style={Object.assign({}, inputStyle, { flex: 1 })} />
      </div>

      <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A', fontFamily: ff }}>Panels on the stats dashboard</div>
        {PANELS.map(p => (
          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontFamily: ff, color: '#334155', cursor: 'pointer' }}>
            <input type="checkbox" checked={on(p.key)}
              onChange={e => setCfg(Object.assign({}, cfg, { panels: Object.assign({}, panels, { [p.key]: e.target.checked }) }))} />
            {p.label}
          </label>
        ))}
      </div>

      <button onClick={save} disabled={busy}
        style={Object.assign({}, btn, { background: saved ? '#00c875' : '#0F172A', color: '#fff', alignSelf: 'flex-start' })}>
        {busy ? 'Saving…' : saved ? 'Saved ✓ — TV updates within a minute' : 'Save dashboard settings'}
      </button>
    </div>
  )
}

export function TVPreview() {
  const [tvUrl, setTvUrl] = useState('')
  const [err, setErr] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    (async () => {
      try {
        const h = await authHeaders()
        const r = await fetch('/api/connectors', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, h),
          body: JSON.stringify({ action: 'reveal_webhook_secret', id: 'display' }),
        })
        const j = await r.json()
        if (!r.ok || !j.webhook_secret) throw new Error(j.error || 'Display token missing — run sql/connectors.sql')
        setTvUrl(window.location.origin + '/tv?token=' + j.webhook_secret)
      } catch (e) { setErr(e.message) }
    })()
  }, [])

  if (err) return <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontFamily: ff }}>{err}</div>
  if (!tvUrl) return <div style={{ padding: '16px', color: '#64748B', fontFamily: ff, fontSize: '13px' }}>Loading preview…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => setNonce(n => n + 1)} style={Object.assign({}, btn, { background: '#F1F5F9', color: '#334155' })}>↻ Refresh preview</button>
        <a href={tvUrl} target="_blank" rel="noreferrer" style={Object.assign({}, btn, { background: '#2563EB', color: '#fff', textDecoration: 'none' })}>Open full screen ↗</a>
      </div>
      <div style={{ border: '2px solid #0F172A', borderRadius: '14px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
        <iframe key={nonce} title="TV Preview" src={tvUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
      </div>
      <div style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>
        This is exactly what the office screen shows — same playlist, same schedule, same pop-ups (scaled down).
      </div>
    </div>
  )
}
