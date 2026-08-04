// AgentPerformanceWidget — goal-based leaderboard (redesign §9). Agents are ranked
// by PERCENTAGE OF THEIR INDIVIDUAL GOAL for the selected metric, so different
// targets compare fairly. Actuals come from app_agent_performance; each agent's
// individual goal comes from app_goals_list (admin, all agents) or
// app_goals_dashboard (non-admin: team + own only). An agent with no matching
// goal shows "No goal set" and is never ranked as if the goal were zero. Every
// row / actual / progress bar drills to the exact deals via app_agent_records.

import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { PERF_METRICS, DEFAULT_VISIBLE, metricDef, fmtMetric, recordBasis, PERF_RANGES, rangeDates } from '../../lib/perfModel'
import { buildLeaderboard, statusMeta } from '../../lib/perfRanking'
import { FONT, INK, colorForKey } from '../../lib/dashboardTheme'

const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i
const RANKABLE = ['accepted_offers', 'closed_units', 'production_volume', 'gci']

function initials(name) { return (name || '?').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() }

function goalsFromList(list, metric) {
  const out = {}
  for (const g of list || []) {
    if (g && g.scope === 'individual' && g.agent_id && g.goal_basis === metric && Number(g.target) > 0) {
      // prefer the goal with the latest end_date
      if (!out[g.agent_id] || (g.end_date || '') > (out[g.agent_id]._end || '')) out[g.agent_id] = { target: Number(g.target), _end: g.end_date || '' }
    }
  }
  return out
}

export function AgentPerformanceWidget() {
  const navigate = useNavigate()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const [rangeKey, setRangeKey] = useState('mtd')
  const [metric, setMetric] = useState('accepted_offers')
  const [drill, setDrill] = useState({ open: false, loading: false, error: null, rows: null, title: '' })
  const { from, to, label: rangeLabel } = rangeDates(rangeKey)

  const fetcher = useCallback(async () => {
    const r = rangeDates(rangeKey)
    const { data, error } = await supabase.rpc('app_agent_performance', { p_from: r.from, p_to: r.to })
    if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
    if (data && data.error) return { deployed: true, forbidden: data.error === 'forbidden', rows: [], goals: {} }
    let goals = {}
    try {
      if (isAdmin) {
        const gl = await supabase.rpc('app_goals_list')
        if (!gl.error && Array.isArray(gl.data)) goals = goalsFromList(gl.data, metric)
      } else {
        const gd = await supabase.rpc('app_goals_dashboard')
        if (!gd.error && Array.isArray(gd.data)) goals = goalsFromList(gd.data, metric)
      }
    } catch { /* goals optional — leaderboard still renders with "No goal set" */ }
    return { deployed: true, rows: Array.isArray(data) ? data : [], goals }
  }, [rangeKey, metric, isAdmin])

  const { data, loading, error, refresh } = useMetric('agents.performance', fetcher, { params: { range: rangeKey, metric }, ttlMs: 3 * 60 * 1000 })
  const deployed = !!data?.deployed && !data?.forbidden
  const board = useMemo(() => buildLeaderboard(data?.rows || [], data?.goals || {}, metric), [data, metric])
  const mDef = metricDef(metric) || {}
  const hasGci = (data?.rows || []).some((r) => r.gci != null)

  const openDrill = useCallback(async (row) => {
    const title = row.name + ' — ' + (mDef.label || metric)
    setDrill({ open: true, loading: true, error: null, rows: null, title })
    try {
      const { data: res, error: e } = await supabase.rpc('app_agent_records', { p_agent_id: row.agent_id, p_basis: recordBasis(metric), p_from: from, p_to: to })
      if (e || (res && res.error)) { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }); return }
      setDrill({ open: true, loading: false, error: null, title, rows: Array.isArray(res) ? res : [] })
    } catch { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }) }
  }, [from, to, metric, mDef.label])

  const controls = (
    <div style={{ display: 'flex', gap: 6 }}>
      <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric" style={sel}>
        {PERF_METRICS.filter((m) => RANKABLE.includes(m.key) && (!m.financial || hasGci)).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} aria-label="Date range" style={sel}>
        {PERF_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
      </select>
    </div>
  )

  return (
    <>
      <WidgetCard title="Agent Performance" accent="#037f4c" sourceLabel={'Goal-based · ' + (mDef.label || metric)} dateRangeLabel={rangeLabel}
        isAdmin={isAdmin} loading={loading} error={error} onRetry={refresh} onRefresh={refresh} headerRight={controls}
        empty={deployed && !loading && !error && board.length === 0} emptyText="No active agents to rank yet.">
        {!deployed ? (
          <p role="status" style={{ fontSize: 13, color: INK.muted }}>{data?.forbidden ? 'You don’t have access to team performance.' : 'Performance data is warming up.'}</p>
        ) : (
          <div>
            <div style={{ display: 'grid', gap: 8 }}>
              {board.map((r, i) => <Row key={r.agent_id} r={r} i={i} mDef={mDef} onOpen={openDrill} />)}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: INK.faint }}>Ranked by % of each agent’s individual {(mDef.label || metric).toLowerCase()} goal. Agents without a goal are listed after ranked agents.</p>
          </div>
        )}
      </WidgetCard>

      <DrillDown open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))} title={drill.title || 'Records'}
        explanation="Deals behind this agent’s figure, within the selected period." sourceLabel="TargetOS deals" dateRangeLabel={rangeLabel}
        recordCount={drill.rows ? drill.rows.length : undefined} loading={drill.loading} error={drill.error} rows={drill.rows} onNavigate={navigate} />
    </>
  )
}

function Row({ r, i, mDef, onOpen }) {
  const st = r.status ? statusMeta(r.status) : null
  const pct = r.hasGoal ? Math.max(0, Math.min(100, r.pct)) : 0
  const barColor = st ? st.color : '#cbd5e1'
  const valActual = fmtMetric(r.actual, mDef)
  const valGoal = r.hasGoal ? fmtMetric(r.target, mDef) : null
  return (
    <div onClick={() => onOpen(r)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r) }}
      style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'center', padding: '10px 10px', borderRadius: 10, cursor: 'pointer', background: i % 2 ? '#fbfcfe' : '#fff', border: '1px solid #eef2f7' }}>
      <div style={{ fontWeight: 800, color: r.rank ? INK.title : INK.faint, textAlign: 'center', fontSize: 15 }}>{r.rank || '—'}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span aria-hidden style={{ width: 26, height: 26, borderRadius: '50%', background: r.color || colorForKey(r.name), color: '#fff', fontWeight: 800, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(r.name)}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK.title, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          {r.hasGoal ? (
            <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: st.color, whiteSpace: 'nowrap' }}>{st.glyph} {st.word}</span>
          ) : (
            <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: INK.faint, background: '#f1f5f9', borderRadius: 999, padding: '2px 8px' }}>No goal set</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 8, borderRadius: 999, background: '#eef2f7', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: barColor, borderRadius: 999 }} />
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: INK.body, whiteSpace: 'nowrap' }}>
            <b style={{ color: INK.title }}>{valActual}</b>{valGoal ? <span style={{ color: INK.faint }}> / {valGoal}</span> : null}
          </div>
          <div style={{ width: 46, textAlign: 'right', fontSize: 13, fontWeight: 800, color: r.hasGoal ? INK.title : INK.faint }}>{r.hasGoal ? Math.round(r.pct) + '%' : '—'}</div>
        </div>
        {r.hasGoal && (
          <div style={{ fontSize: 11, color: INK.faint, marginTop: 3 }}>{r.remaining > 0 ? fmtMetric(r.remaining, mDef) + ' to goal' : 'Goal reached'}{r.projection != null ? ' · projected ' + fmtMetric(r.projection, mDef) : ''}</div>
        )}
      </div>
    </div>
  )
}

const sel = { fontSize: 12, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 7, fontFamily: FONT, background: '#fff' }

export default AgentPerformanceWidget
