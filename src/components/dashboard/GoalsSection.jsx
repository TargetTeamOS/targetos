// GoalsSection — pulls active/visible goals (app_goals_dashboard, which already
// scopes non-admins to team + their own individual goals) and renders one
// GoalWidget per goal, monthly first. Loading / error / empty collapse to a
// single card so the rest of the dashboard is unaffected.

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

const ORDER = { monthly: 0, yearly: 1, custom: 2 }

export function GoalsSection() {
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const { data, loading, error, refresh } = useMetric('goals.dashboard', goalsFetcher, { ttlMs: 5 * 60 * 1000 })
  const goals = (data?.goals || []).slice().sort((a, b) => (ORDER[a.period] ?? 3) - (ORDER[b.period] ?? 3))

  if (loading || error || goals.length === 0) {
    return (
      <WidgetCard
        title="Goals" accent="#00C875" loading={loading} error={error} onRetry={refresh}
        empty={!loading && !error} emptyText={isAdmin ? 'No goals are set up yet. Add one from the goals admin to see live progress here.' : 'No goals to show right now.'}
      >
        <div />
      </WidgetCard>
    )
  }

  return (
    <>
      {goals.map((g) => <GoalWidget key={g.id} goal={g} />)}
    </>
  )
}

export default GoalsSection
