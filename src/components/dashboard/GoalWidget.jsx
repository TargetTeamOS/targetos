// GoalWidget — one goal (monthly or yearly). The `actual` is authoritative and
// never editable here; remaining / % / pace / projection are derived for display
// only. Every figure is a button that opens the exact deals behind the number
// (via app_goal_records). Until that RPC is deployed, the drill shows a clear
// "not yet available" message instead of failing.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { goalProgress, basisMeta, formatGoalValue, statusMeta } from '../../lib/goalMath'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

export function GoalWidget({ goal }) {
  const navigate = useNavigate()
  const [drill, setDrill] = useState({ open: false, loading: false, error: null, rows: null })

  const p = goalProgress(goal)
  const meta = basisMeta(goal.goal_basis)
  const st = statusMeta(p.status)
  const isYearly = goal.period === 'yearly'
  const rangeLabel = fmtDate(goal.start_date) + ' – ' + fmtDate(goal.end_date)
  const barPct = Math.max(0, Math.min(100, p.pct))
  const progressAria = 'Progress: ' + Math.round(p.pct) + '% of ' + meta.label.toLowerCase() + ' goal, ' + st.word.toLowerCase()
  const perDay = p.requiredPerDay != null ? formatGoalValue(p.requiredPerDay, goal.goal_basis) + '/day' : '—'
  const perMonth = p.requiredPerMonth != null ? formatGoalValue(p.requiredPerMonth, goal.goal_basis) + '/mo' : '—'

  const openDrill = useCallback(async () => {
    setDrill({ open: true, loading: true, error: null, rows: null })
    try {
      const { data, error } = await supabase.rpc('app_goal_records', { p_goal_id: goal.id })
      if (error) {
        const notDeployed = /function|does not exist|schema cache|42883|not find/i.test(error.message || '')
        setDrill({ open: true, loading: false, rows: null, error: notDeployed
          ? 'The goal records view isn’t deployed yet. Once its supporting function is applied, every figure here opens its exact deals.'
          : 'Couldn’t load these records right now.' })
        return
      }
      if (data && data.error) {
        setDrill({ open: true, loading: false, rows: null, error: data.error === 'forbidden' ? 'You don’t have access to these records.' : 'No records found.' })
        return
      }
      setDrill({ open: true, loading: false, error: null, rows: Array.isArray(data) ? data : [] })
    } catch {
      setDrill({ open: true, loading: false, rows: null, error: 'Couldn’t load these records right now.' })
    }
  }, [goal.id])

  const Figure = ({ label, value, big }) => (
    <button onClick={openDrill}
      style={{ textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FF }}>
      <div style={{ fontSize: big ? 28 : 16, fontWeight: big ? 800 : 700, color: '#0f172a', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </button>
  )

  return (
    <>
      <WidgetCard
        title={goal.title || meta.label} accent={isYearly ? '#A25DDC' : '#00C875'}
        sourceLabel="TargetOS deals" dateRangeLabel={rangeLabel}
        onDrill={openDrill} drillLabel="View records"
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <Figure big label={meta.label + ' so far'} value={formatGoalValue(p.actual, goal.goal_basis)} />
          <div style={{ paddingBottom: 4, fontSize: 13, color: '#64748b' }}>
            of <button onClick={openDrill} style={{ ...inlineBtn, fontWeight: 700, color: '#334155' }}>{formatGoalValue(p.target, goal.goal_basis)}</button> target
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: st.color }}>{st.glyph} {st.word}</span>
        </div>

        <div role="progressbar" aria-valuenow={Math.round(p.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={progressAria}
          style={{ marginTop: 12, height: 8, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: barPct + '%', height: '100%', background: st.color, borderRadius: 999 }} />
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>{Math.round(p.pct)}% complete</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
          <Figure label="Remaining" value={formatGoalValue(p.remaining, goal.goal_basis)} />
          <Figure label="Days left" value={p.daysRemaining != null ? p.daysRemaining : '—'} />
          <Figure label="Pace needed" value={isYearly ? perMonth : perDay} />
        </div>

        {isYearly && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            <Figure label="Projected year-end" value={p.projection != null ? formatGoalValue(p.projection, goal.goal_basis) : '—'} />
            <Figure label="Required / month" value={perMonth} />
          </div>
        )}

        {goal.image_url && (
          <img src={goal.image_url} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 8, marginTop: 12 }} />
        )}
        {goal.message && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#475569', fontStyle: 'italic' }}>{goal.message}</p>
        )}
      </WidgetCard>

      <DrillDown
        open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))}
        title={(goal.title || meta.label) + ' — records'}
        explanation={meta.label + ' counted toward this goal in the selected window.'}
        sourceLabel="TargetOS deals" dateRangeLabel={rangeLabel}
        recordCount={drill.rows ? drill.rows.length : undefined}
        loading={drill.loading} error={drill.error} rows={drill.rows}
        onRetry={openDrill} onNavigate={navigate}
      />
    </>
  )
}

const inlineBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FF, fontSize: 13 }

export default GoalWidget
