// FrontRunnerWidget — "Front Runner of the Month". The winner is ALWAYS computed
// from real accepted-offer records (app_agent_performance, same authoritative
// source as the leaderboard) for the selected month; the admin can style the
// card (image, message, visibility, range) but can never change the calculated
// winner or count. Compact by design. When A7 isn't deployed it shows a compact
// "Setup required" card with muted zeros — never a fabricated winner.

import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { rangeDates } from '../../lib/perfModel'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i

function initials(name) { return (name || '?').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() }

export function FrontRunnerWidget({ settings, onSettings }) {
  const navigate = useNavigate()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const [rangeKey] = useState('mtd')
  const [drill, setDrill] = useState({ open: false, loading: false, error: null, rows: null, title: '' })
  const [editing, setEditing] = useState(false)

  const cfg = settings || {}
  const fetcher = useCallback(async () => {
    const { from, to } = rangeDates(rangeKey)
    const { data, error } = await supabase.rpc('app_agent_performance', { p_from: from, p_to: to })
    if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
    if (data && data.error) return { deployed: true, forbidden: data.error === 'forbidden', rows: [] }
    return { deployed: true, rows: Array.isArray(data) ? data : [], from, to }
  }, [rangeKey])

  const { data, loading, error, refresh } = useMetric('frontrunner', fetcher, { params: { range: rangeKey }, ttlMs: 3 * 60 * 1000 })
  const deployed = !!data?.deployed && !data?.forbidden
  const rows = data?.rows || []
  const { from, to, label } = rangeDates(rangeKey)

  // winner(s): highest accepted_offers this month, ties preserved
  const { winners, top } = useMemo(() => {
    const t = rows.reduce((m, r) => Math.max(m, Number(r.accepted_offers) || 0), 0)
    return { winners: t > 0 ? rows.filter((r) => (Number(r.accepted_offers) || 0) === t) : [], top: t }
  }, [rows])

  const openOffers = useCallback(async (w) => {
    const title = w.name + ' — accepted offers'
    setDrill({ open: true, loading: true, error: null, rows: null, title })
    try {
      const { data: res, error: e } = await supabase.rpc('app_agent_records', { p_agent_id: w.agent_id, p_basis: 'accepted_offers', p_from: from, p_to: to })
      if (e) { setDrill({ open: true, loading: false, rows: null, title, error: NOT_DEPLOYED.test(e.message || '') ? 'Accepted-offer records aren’t deployed yet (A7).' : 'Couldn’t load these records.' }); return }
      if (res && res.error) { setDrill({ open: true, loading: false, rows: null, title, error: 'You don’t have access to these records.' }); return }
      setDrill({ open: true, loading: false, error: null, title, rows: Array.isArray(res) ? res : [] })
    } catch { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }) }
  }, [from, to])

  if (cfg.visible === false && !isAdmin) return null

  const gear = isAdmin ? (
    <button onClick={() => setEditing((v) => !v)} aria-label="Front Runner settings" title="Front Runner settings"
      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#94a3b8' }}>⚙</button>
  ) : null

  const avatar = (w, size = 44) => (
    w && cfg.image_url && winners.length === 1
      ? <img src={cfg.image_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      : <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: (w?.color || '#cbd5e1'), color: '#fff', fontWeight: 800, fontSize: size * 0.34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{w ? initials(w.name) : '—'}</span>
  )

  return (
    <>
      <WidgetCard title="Front Runner of the Month" accent="#FDAB3D" sourceLabel="Accepted offers" dateRangeLabel={label}
        loading={loading} error={error} onRetry={refresh} headerRight={gear}>
        {isAdmin && editing && (
          <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: 10, marginBottom: 10, display: 'grid', gap: 8 }}>
            <input placeholder="Congratulatory message (optional)" value={cfg.message || ''} onChange={(e) => onSettings?.({ ...cfg, message: e.target.value })} style={inp} />
            <input placeholder="Image URL (blank = agent initials)" value={cfg.image_url || ''} onChange={(e) => onSettings?.({ ...cfg, image_url: e.target.value })} style={inp} />
            <label style={{ fontSize: 12.5, color: '#475569', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={cfg.visible !== false} onChange={(e) => onSettings?.({ ...cfg, visible: e.target.checked })} /> Show this widget
            </label>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Presentation only — the winner and count are always calculated from accepted offers.</span>
          </div>
        )}

        {!deployed ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {avatar(null)}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>Setup required — apply A7</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Winner appears here once accepted-offer data is available.</div>
            </div>
          </div>
        ) : winners.length === 0 ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {avatar(null)}
            <div style={{ fontSize: 13, color: '#64748b' }}>No accepted offers recorded this month yet.</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {avatar(winners[0])}
              <div style={{ minWidth: 0 }}>
                <button onClick={() => navigate('/dashboard/command-center')} style={{ ...linkName }}>
                  {winners.length === 1 ? winners[0].name : 'Tie: ' + winners.map((w) => w.name).join(' & ')}
                </button>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>🏆 Front runner{winners.length > 1 ? 's' : ''} · {label}</div>
              </div>
              <button onClick={() => openOffers(winners[0])} style={{ marginLeft: 'auto', ...bigNum }}>
                {top}<span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginLeft: 4 }}>offers</span>
              </button>
            </div>
            {cfg.message && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#475569', fontStyle: 'italic' }}>{cfg.message}</p>}
            {winners.length > 1 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {winners.map((w) => <button key={w.agent_id} onClick={() => openOffers(w)} style={tiePill}>{w.name}: {w.accepted_offers}</button>)}
              </div>
            )}
          </div>
        )}
      </WidgetCard>

      <DrillDown open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))}
        title={drill.title || 'Accepted offers'} explanation="Accepted offers counted for this front runner, within the month."
        sourceLabel="TargetOS deals" dateRangeLabel={label}
        recordCount={drill.rows ? drill.rows.length : undefined}
        loading={drill.loading} error={drill.error} rows={drill.rows} onNavigate={navigate} />
    </>
  )
}

const inp = { width: '100%', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 7, fontFamily: FF, fontSize: 12.5, boxSizing: 'border-box' }
const linkName = { background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FF, fontSize: 16, fontWeight: 800, color: '#0f172a', textAlign: 'left' }
const bigNum = { background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, fontSize: 30, fontWeight: 800, color: '#FDAB3D', padding: 0 }
const tiePill = { fontSize: 12, padding: '3px 8px', borderRadius: 999, border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', cursor: 'pointer', fontFamily: FF }

export default FrontRunnerWidget
