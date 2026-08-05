// FrontRunnerWidget — presentation-only "Front Runner of the Month". The winner is
// ALWAYS computed from real accepted-offer records (app_agent_performance) for the
// month, ties preserved; % is against the winner's individual accepted-offer goal.
// Presentation (image / message / visibility) comes from the settings store and is
// edited ONLY in the Settings drawer — never inside this card. The count drills to
// the exact accepted offers.

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { signedUrl } from '../../lib/storage'
import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { rangeDates } from '../../lib/perfModel'
import { FONT, INK, colorForKey } from '../../lib/dashboardTheme'

const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i
function initials(name) { return (name || '?').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() }

export function FrontRunnerWidget({ settings }) {
  const navigate = useNavigate()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const cfg = settings || {}
  const [imgUrl, setImgUrl] = useState(null)
  useEffect(() => {
    let alive = true
    if (cfg.image_url) { signedUrl(cfg.image_url).then((u) => { if (alive) setImgUrl(u) }).catch(() => { if (alive) setImgUrl(null) }) }
    else setImgUrl(null)
    return () => { alive = false }
  }, [cfg.image_url])
  const [drill, setDrill] = useState({ open: false, loading: false, error: null, rows: null, title: '' })
  const { from, to, label } = rangeDates('mtd')

  const fetcher = useCallback(async () => {
    const r = rangeDates('mtd')
    const { data, error } = await supabase.rpc('app_agent_performance', { p_from: r.from, p_to: r.to })
    if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
    if (data && data.error) return { deployed: true, forbidden: true, rows: [] }
    let goals = {}
    try {
      const g = await supabase.rpc(isAdmin ? 'app_goals_list' : 'app_goals_dashboard')
      if (!g.error && Array.isArray(g.data)) for (const x of g.data) if (x.scope === 'individual' && x.agent_id && x.goal_basis === 'accepted_offers' && Number(x.target) > 0) goals[x.agent_id] = Number(x.target)
    } catch { /* goal optional */ }
    return { deployed: true, rows: Array.isArray(data) ? data : [], goals }
  }, [isAdmin])

  const { data, loading, error, refresh } = useMetric('frontrunner', fetcher, { ttlMs: 3 * 60 * 1000 })
  const deployed = !!data?.deployed && !data?.forbidden
  const rows = data?.rows || []
  const { winners, top } = useMemo(() => {
    const t = rows.reduce((m, r) => Math.max(m, Number(r.accepted_offers) || 0), 0)
    return { winners: t > 0 ? rows.filter((r) => (Number(r.accepted_offers) || 0) === t) : [], top: t }
  }, [rows])
  const w = winners[0]
  const goal = w && data?.goals ? data.goals[w.agent_id] : null
  const pct = goal ? Math.round((top / goal) * 100) : null

  const openOffers = useCallback(async () => {
    if (!w) return
    const title = w.name + ' — accepted offers'
    setDrill({ open: true, loading: true, error: null, rows: null, title })
    try {
      const { data: res, error: e } = await supabase.rpc('app_agent_records', { p_agent_id: w.agent_id, p_basis: 'accepted_offers', p_from: from, p_to: to })
      if (e || (res && res.error)) { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }); return }
      setDrill({ open: true, loading: false, error: null, title, rows: Array.isArray(res) ? res : [] })
    } catch { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }) }
  }, [w, from, to])

  if (cfg.visible === false && !isAdmin) return null

  const avatar = (size) => (
    imgUrl && winners.length === 1
      ? <img src={imgUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      : <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: w ? (w.color || colorForKey(w.name)) : '#e2e8f0', color: '#fff', fontWeight: 800, fontSize: size * 0.36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{w ? initials(w.name) : '★'}</span>
  )

  return (
    <>
      <WidgetCard title="Front Runner of the Month" accent="#FDAB3D" sourceLabel="Accepted offers" dateRangeLabel={label}
        isAdmin={isAdmin} loading={loading} error={error} onRetry={refresh}
        empty={deployed && winners.length === 0 && !loading && !error}
        emptyText="No accepted offers recorded yet this month.">
        {!deployed ? (
          <p role="status" style={{ fontSize: 13, color: INK.muted, margin: 0 }}>Front Runner is warming up.</p>
        ) : winners.length > 0 ? (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {avatar(52)}
                <span aria-hidden style={{ position: 'absolute', bottom: -4, right: -4, fontSize: 18 }}>🏆</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: INK.title, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {winners.length === 1 ? w.name : 'Tie: ' + winners.map((x) => x.name).join(' & ')}
                </div>
                <div style={{ fontSize: 12, color: INK.faint }}>Top accepted offers · {label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <button onClick={openOffers} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: '#FDAB3D' }}>{top}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: INK.faint, marginLeft: 4 }}>offers</span>
              </button>
              {goal ? (
                <span style={{ fontSize: 12.5, color: INK.body }}>of <b>{goal}</b> goal · <b style={{ color: INK.title }}>{pct}%</b></span>
              ) : (
                <span style={{ fontSize: 11.5, color: INK.faint }}>No individual goal set</span>
              )}
            </div>
            {goal && (
              <div style={{ height: 8, borderRadius: 999, background: '#eef2f7', overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: Math.max(0, Math.min(100, pct)) + '%', height: '100%', background: '#FDAB3D', borderRadius: 999 }} />
              </div>
            )}
            {cfg.message && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: INK.body, fontStyle: 'italic' }}>{cfg.message}</p>}
          </div>
        ) : null}
      </WidgetCard>

      <DrillDown open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))} title={drill.title || 'Accepted offers'}
        explanation="Accepted offers counted for this front runner, within the month." sourceLabel="TargetOS deals" dateRangeLabel={label}
        recordCount={drill.rows ? drill.rows.length : undefined} loading={drill.loading} error={drill.error} rows={drill.rows} onNavigate={navigate} />
    </>
  )
}

export default FrontRunnerWidget
