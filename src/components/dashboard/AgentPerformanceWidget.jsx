// AgentPerformanceWidget — a compact, ranked team leaderboard built only from
// authoritative RPC aggregates (app_agent_performance). GCI appears only if the
// server returns it (admins). Each metric cell drills to the exact deals behind
// it (app_agent_records), respecting the viewer's access. When the RPC isn't
// deployed the full table layout renders with "Data source awaiting secure
// setup" — never invented figures.

import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { PERF_METRICS, DEFAULT_VISIBLE, metricDef, fmtMetric, rankBy, recordBasis, PERF_RANGES, rangeDates } from '../../lib/perfModel'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i

export function AgentPerformanceWidget() {
  const navigate = useNavigate()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const [rangeKey, setRangeKey] = useState('mtd')
  const [sortKey, setSortKey] = useState('closed_units')
  const [visible, setVisible] = useState(DEFAULT_VISIBLE)
  const [showCols, setShowCols] = useState(false)
  const [drill, setDrill] = useState({ open: false, loading: false, error: null, rows: null, title: '' })

  const fetcher = useCallback(async () => {
    const { from, to } = rangeDates(rangeKey)
    const { data, error } = await supabase.rpc('app_agent_performance', { p_from: from, p_to: to })
    if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
    if (data && data.error) return { deployed: true, forbidden: data.error === 'forbidden', rows: [] }
    return { deployed: true, rows: Array.isArray(data) ? data : [] }
  }, [rangeKey])

  const { data, loading, error, refresh } = useMetric('agents.performance', fetcher, { params: { range: rangeKey }, ttlMs: 3 * 60 * 1000 })
  const deployed = !!data?.deployed && !data?.forbidden
  const rows = data?.rows || []
  const hasGci = rows.some((r) => r.gci != null)

  // which columns to show: default set, plus gci only if the server returned it
  const columns = useMemo(() => {
    const keys = visible.filter((k) => k !== 'gci' || hasGci)
    if (hasGci && !keys.includes('gci') && visible.includes('gci')) keys.push('gci')
    return keys.map(metricDef).filter(Boolean)
  }, [visible, hasGci])

  const ranked = useMemo(() => rankBy(rows, sortKey), [rows, sortKey])
  const { from, to, label: rangeLabel } = rangeDates(rangeKey)

  const openDrill = useCallback(async (row, m) => {
    const title = row.name + ' — ' + m.label
    setDrill({ open: true, loading: true, error: null, rows: null, title })
    try {
      const { data: res, error: e } = await supabase.rpc('app_agent_records', { p_agent_id: row.agent_id, p_basis: recordBasis(m.key), p_from: from, p_to: to })
      if (e) {
        const nd = NOT_DEPLOYED.test(e.message || '')
        setDrill({ open: true, loading: false, rows: null, title, error: nd ? 'The performance records view isn’t deployed yet (A7). Once applied, every metric opens its exact deals.' : 'Couldn’t load these records.' })
        return
      }
      if (res && res.error) { setDrill({ open: true, loading: false, rows: null, title, error: res.error === 'forbidden' ? 'You don’t have access to these records.' : 'No records found.' }); return }
      setDrill({ open: true, loading: false, error: null, title, rows: Array.isArray(res) ? res : [] })
    } catch { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }) }
  }, [from, to])

  const rangeControl = (
    <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} aria-label="Date range"
      style={{ fontSize: 12, padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: FF }}>
      {PERF_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
    </select>
  )

  return (
    <>
      <WidgetCard title="Agent performance" accent="#037f4c" sourceLabel="TargetOS deals" dateRangeLabel={rangeLabel}
        loading={loading} error={error} onRetry={refresh} headerRight={rangeControl}>
        {!deployed ? (
          <div>
            {data?.forbidden ? (
              <p role="status" style={{ fontSize: 13, color: '#64748b' }}>You don’t have access to team performance.</p>
            ) : (
              <div role="status" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
                Data source awaiting secure setup — apply <strong>A7_agent_performance</strong> to load the leaderboard. Columns below show the layout; no figures are shown until then.
              </div>
            )}
            <Table columns={columns.length ? columns : DEFAULT_VISIBLE.map(metricDef)} ranked={[]} sortKey={sortKey} setSortKey={setSortKey} onCell={() => {}} />
          </div>
        ) : rows.length === 0 ? (
          <p role="status" style={{ fontSize: 13, color: '#64748b' }}>No production recorded for this period yet.</p>
        ) : (
          <>
            {isAdmin && (
              <div style={{ marginBottom: 8 }}>
                <button onClick={() => setShowCols((v) => !v)} style={{ fontSize: 12, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: 0 }}>
                  {showCols ? 'Hide metrics' : 'Choose metrics'}
                </button>
                {showCols && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                    {PERF_METRICS.map((m) => (
                      <label key={m.key} style={{ fontSize: 12, color: '#475569', display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                        <input type="checkbox" checked={visible.includes(m.key)}
                          onChange={(e) => setVisible((v) => e.target.checked ? [...v, m.key] : v.filter((k) => k !== m.key))} />
                        {m.label}{m.financial ? ' (admin)' : ''}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Table columns={columns} ranked={ranked} sortKey={sortKey} setSortKey={setSortKey} onCell={openDrill} />
          </>
        )}
      </WidgetCard>

      <DrillDown open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))}
        title={drill.title || 'Records'} explanation="Deals behind this metric, within the selected range."
        sourceLabel="TargetOS deals" dateRangeLabel={rangeLabel}
        recordCount={drill.rows ? drill.rows.length : undefined}
        loading={drill.loading} error={drill.error} rows={drill.rows} onNavigate={navigate} />
    </>
  )
}

function Table({ columns, ranked, sortKey, setSortKey, onCell }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FF }}>
        <thead>
          <tr>
            <th style={thL}>#</th>
            <th style={thL}>Agent</th>
            {columns.map((m) => (
              <th key={m.key} style={{ ...thR, cursor: 'pointer' }} onClick={() => setSortKey(m.key)} title="Sort by this metric">
                {m.short}{sortKey === m.key ? ' ▾' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.agent_id} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ ...tdL, color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
              <td style={tdL}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden style={{ width: 22, height: 22, borderRadius: '50%', background: r.color || '#cbd5e1', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {(r.name || '?').split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{r.name}</span>
                </span>
              </td>
              {columns.map((m) => (
                <td key={m.key} style={tdR}>
                  <button onClick={() => onCell(r, m)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, fontSize: 13, color: '#0f172a', padding: 0 }}>
                    {fmtMetric(r[m.key], m)}
                  </button>
                </td>
              ))}
            </tr>
          ))}
          {ranked.length === 0 && (
            <tr><td colSpan={columns.length + 2} style={{ ...tdL, color: '#cbd5e1', fontSize: 12.5, padding: '10px 6px' }}>—</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const thL = { textAlign: 'left', fontSize: 11, color: '#94a3b8', fontWeight: 600, padding: '4px 6px', whiteSpace: 'nowrap' }
const thR = { textAlign: 'right', fontSize: 11, color: '#94a3b8', fontWeight: 600, padding: '4px 6px', whiteSpace: 'nowrap' }
const tdL = { textAlign: 'left', padding: '7px 6px', whiteSpace: 'nowrap' }
const tdR = { textAlign: 'right', padding: '7px 6px', whiteSpace: 'nowrap' }

export default AgentPerformanceWidget
