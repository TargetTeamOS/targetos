// AnalyticsCharts — the Row-3 visual analytics: Accepted Offers by Agent
// (horizontal bars) and Production by Agent (donut + value legend). Both read the
// authoritative app_agent_performance and drill to the exact deals via
// app_agent_records. Colours are deterministic per agent.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { HBarChart, DonutChart } from './Charts'
import { colorForKey, fmtCompactNum, fmtCompactMoney, fmtExactMoney } from '../../lib/dashboardTheme'
import { rangeDates } from '../../lib/perfModel'

const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i

function useAgents(rangeKey, metricKey) {
  const fetcher = useCallback(async () => {
    const { from, to } = rangeDates(rangeKey)
    const { data, error } = await supabase.rpc('app_agent_performance', { p_from: from, p_to: to })
    if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
    if (data && data.error) return { deployed: true, forbidden: data.error === 'forbidden', rows: [] }
    return { deployed: true, rows: Array.isArray(data) ? data : [] }
  }, [rangeKey])
  return useMetric('analytics.' + metricKey, fetcher, { params: { range: rangeKey }, ttlMs: 3 * 60 * 1000 })
}

function useDrill(basis, from, to, label) {
  const navigate = useNavigate()
  const [drill, setDrill] = useState({ open: false, loading: false, error: null, rows: null, title: '' })
  const open = useCallback(async (agent) => {
    if (!agent) return
    const title = (agent.label || agent.name) + ' — ' + label
    setDrill({ open: true, loading: true, error: null, rows: null, title })
    try {
      const { data, error } = await supabase.rpc('app_agent_records', { p_agent_id: agent.key || agent.agent_id, p_basis: basis, p_from: from, p_to: to })
      if (error || (data && data.error)) { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }); return }
      setDrill({ open: true, loading: false, error: null, title, rows: Array.isArray(data) ? data : [] })
    } catch { setDrill({ open: true, loading: false, rows: null, title, error: 'Couldn’t load these records.' }) }
  }, [basis, from, to, label])
  const node = (
    <DrillDown open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))} title={drill.title || 'Records'}
      explanation="Deals behind this figure, within the selected period." sourceLabel="TargetOS deals"
      recordCount={drill.rows ? drill.rows.length : undefined} loading={drill.loading} error={drill.error} rows={drill.rows} onNavigate={navigate} />
  )
  return { open, node }
}

export function AcceptedOffersChart() {
  const { agent } = useAuth()
  const { data, loading, error, refresh } = useAgents('mtd', 'accepted')
  const { from, to, label } = rangeDates('mtd')
  const drill = useDrill('accepted_offers', from, to, 'accepted offers')
  const rows = (data?.rows || []).map((r) => ({ key: r.agent_id, label: r.name, value: Number(r.accepted_offers) || 0, color: colorForKey(r.name) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  return (
    <>
      <WidgetCard title="Accepted Offers by Agent" accent="#0073EA" sourceLabel="TargetOS deals" dateRangeLabel={label}
        isAdmin={agent?.role === 'admin'} loading={loading} error={error} onRetry={refresh} onRefresh={refresh}
        empty={!loading && !error && rows.length === 0} emptyText="No accepted offers recorded this period yet.">
        <HBarChart data={rows} height={320} valueFormat={fmtCompactNum} onBarClick={drill.open} />
      </WidgetCard>
      {drill.node}
    </>
  )
}

export function ProductionChart() {
  const { agent } = useAuth()
  const { data, loading, error, refresh } = useAgents('ytd', 'production')
  const { from, to, label } = rangeDates('ytd')
  const drill = useDrill('production_volume', from, to, 'closed production')
  const rows = (data?.rows || []).map((r) => ({ key: r.agent_id, label: r.name, value: Number(r.production_volume) || 0, color: colorForKey(r.name) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  return (
    <>
      <WidgetCard title="Production by Agent" accent="#00C875" sourceLabel="Closed production" dateRangeLabel={label}
        isAdmin={agent?.role === 'admin'} loading={loading} error={error} onRetry={refresh} onRefresh={refresh}
        empty={!loading && !error && rows.length === 0} emptyText="No closed production recorded this period yet.">
        <DonutChart data={rows} height={300} valueFormat={fmtCompactMoney} onSliceClick={drill.open} />
      </WidgetCard>
      {drill.node}
    </>
  )
}
