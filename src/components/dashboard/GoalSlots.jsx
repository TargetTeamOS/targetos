// GoalSlots — surfaces the monthly team goal (top row) and the yearly goal
// (main area) as separate cards. Both read the same authoritative
// app_goals_dashboard (deduped by the shared metric key), so actuals always come
// from real accepted-offer / production records — never editable here. If the
// data path errors, the real error is shown (not hidden); if no goal of that
// period exists, a compact empty state renders.

import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { WidgetCard } from './WidgetCard'
import { GoalWidget } from './GoalWidget'

async function goalsFetcher() {
  const { data, error } = await supabase.rpc('app_goals_dashboard')
  if (error) throw error
  const arr = Array.isArray(data) ? data : (data && data.error ? [] : [])
  return { goals: arr }
}

function useGoals() { return useMetric('goals.dashboard', goalsFetcher, { ttlMs: 5 * 60 * 1000 }) }

function pick(goals, period) {
  const list = (goals || []).filter((g) => g.period === period)
  return list[0] || null
}

function GoalSlot({ period, title, accent }) {
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const { data, loading, error, refresh } = useGoals()
  const goal = pick(data?.goals, period)

  if (loading || error || !goal) {
    return (
      <WidgetCard title={title} accent={accent} loading={loading} error={error} onRetry={refresh}
        empty={!loading && !error} emptyText={isAdmin ? 'No ' + period + ' goal set yet — add one in Command Center settings.' : 'No ' + period + ' goal set.'}>
        <div />
      </WidgetCard>
    )
  }
  return <GoalWidget goal={goal} />
}

export function MonthlyGoalCard() { return <GoalSlot period="monthly" title="Monthly team goal" accent="#00C875" /> }
export function YearlyGoalCard() { return <GoalSlot period="yearly" title="Yearly team goal" accent="#A25DDC" /> }

export default MonthlyGoalCard
