// userWidgets — per-agent PERSONAL widgets. Every call is self-scoped in the
// database (the RPCs never accept an agent id); this client just talks to them.
// Before A9_user_widgets is applied, the RPCs don't exist, so we report
// deployed:false and the UI shows a compact "available soon" state instead of an
// error. No agent id is ever sent from the browser.
import { supabase } from './supabase'

const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i

// Allowlisted self-metrics the agent can choose from (labels only — the metric
// keys and all computation live server-side, scoped to the caller).
export const USER_METRICS = [
  { key: 'my_accepted_offers', label: 'My accepted offers', kind: 'count' },
  { key: 'my_closed_units', label: 'My closed units', kind: 'count' },
  { key: 'my_production_volume', label: 'My production volume', kind: 'money' },
  { key: 'my_gci', label: 'My GCI', kind: 'money' },
  { key: 'my_open_tasks', label: 'My open tasks', kind: 'count' },
]
export const USER_RANGES = [
  { key: 'mtd', label: 'This month' },
  { key: 'qtd', label: 'This quarter' },
  { key: 'ytd', label: 'This year' },
]
export function metricMeta(key) { return USER_METRICS.find((m) => m.key === key) || { key, label: key, kind: 'count' } }

export async function fetchUserWidgets() {
  const { data, error } = await supabase.rpc('app_user_widgets_get')
  if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false, widgets: [] }; throw error }
  if (data && data.error) return { deployed: true, widgets: [], error: data.error }
  return { deployed: true, widgets: Array.isArray(data) ? data : [] }
}

export async function saveUserWidget(p) {
  const { data, error } = await supabase.rpc('app_user_widget_save', { p })
  if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
  if (data && data.error) return { deployed: true, ok: false, error: data.error }
  return { deployed: true, ok: true, id: data && data.id }
}

export async function deleteUserWidget(id) {
  const { data, error } = await supabase.rpc('app_user_widget_delete', { p_id: id })
  if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
  return { deployed: true, ok: !!(data && data.ok) }
}

export async function fetchUserWidgetRecords(metric, range) {
  const { data, error } = await supabase.rpc('app_user_widget_records', { p_metric: metric, p_range: range })
  if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false, rows: [] }; throw error }
  return { deployed: true, rows: Array.isArray(data) ? data : [] }
}
