// widgetModel — the client mirror of the server allowlist in _pw_validate. The
// builder constrains every input to these values so a saved config always passes
// server-side validation; nothing here is a substitute for that server check.
// The engine computes a single scalar per widget, so "display type" is a visual
// treatment of that scalar. Richer display types are shown in the builder but
// flagged as needing the engine extension — they never silently save.

export const METRICS = [
  { key: 'count', label: 'Count', needsField: false },
  { key: 'sum',   label: 'Sum',   needsField: true },
  { key: 'avg',   label: 'Average', needsField: true },
  { key: 'progress', label: 'Progress to goal', needsField: false },
]

export const FIELDS = [
  { key: 'production', label: 'Production volume' },
  { key: 'gci', label: 'GCI' },
  { key: 'expected_gci', label: 'Expected GCI' },
  { key: 'collected_gci', label: 'Collected GCI' },
  { key: 'pipeline_gci', label: 'Pipeline GCI (needs active pipeline)' },
]

export const DATE_MODES = [
  { key: 'board_range', label: 'Board range' },
  { key: 'current_month', label: 'Current month' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'current_year', label: 'Current year' },
  { key: 'all_time', label: 'All time' },
  { key: 'custom', label: 'Custom range' },
]

export const DATE_FIELDS = [
  { key: 'close_date', label: 'Close date' },
  { key: 'ao_date', label: 'Accepted-offer date' },
  { key: 'contract_date', label: 'Contract date' },
  { key: 'expected_close_date', label: 'Expected close date' },
]

export const FORMATS = [
  { key: 'whole', label: 'Whole number' },
  { key: 'currency', label: 'Currency' },
  { key: 'compact_currency', label: 'Compact currency ($1.2M)' },
  { key: 'full_currency', label: 'Full currency' },
  { key: 'percent', label: 'Percent' },
]

export const BOOL_FILTERS = [
  { key: 'active_pipeline', label: 'Active pipeline only' },
  { key: 'official_closed', label: 'Officially closed only' },
]
export const TEXT_FILTERS = ['stage', 'deal_status', 'side', 'sale_type', 'property_type']

// display types — engineSupported ones render live once the engine is applied;
// the rest are visually available but require the widget-engine extension.
export const DISPLAY_TYPES = [
  { key: 'number', label: 'Number', engineSupported: true },
  { key: 'progress', label: 'Progress', engineSupported: true },
  { key: 'number_comparison', label: 'Number with comparison', engineSupported: false },
  { key: 'compact_list', label: 'Compact list', engineSupported: false },
  { key: 'bar_chart', label: 'Bar chart', engineSupported: false },
  { key: 'line_chart', label: 'Line chart', engineSupported: false },
  { key: 'donut_chart', label: 'Donut chart', engineSupported: false },
  { key: 'leaderboard', label: 'Leaderboard', engineSupported: false },
  { key: 'status_breakdown', label: 'Status breakdown', engineSupported: false },
  { key: 'image_progress', label: 'Image + progress card', engineSupported: false },
]

export const MAX_WIDGETS = 12

export function newWidgetForm(position = 0) {
  return {
    id: null, position, title: '', subtitle: '', metric: 'count', field: '',
    filters: {}, date_mode: 'current_year', date_field: 'close_date', custom_from: '', custom_to: '',
    format: 'whole', color: '#0073EA', goal_type: '', goal_value: '', goal_year: '',
    visible: true, scope: 'team', display_type: 'number',
  }
}

export function displayDef(key) { return DISPLAY_TYPES.find((d) => d.key === key) || DISPLAY_TYPES[0] }

// mirror of the server rules — returns [] when valid
export function validateForm(f) {
  const e = []
  const title = (f.title || '').trim()
  if (!title) e.push('Title is required.')
  if (title.length > 40) e.push('Title must be 40 characters or fewer.')
  if ((f.subtitle || '').length > 60) e.push('Subtitle must be 60 characters or fewer.')
  if (!METRICS.some((m) => m.key === f.metric)) e.push('Choose a metric.')
  if ((f.metric === 'sum' || f.metric === 'avg') && !FIELDS.some((x) => x.key === f.field)) e.push('Sum and average need an approved field.')
  if (f.metric === 'count' && f.field) e.push('Count widgets must not set a field.')
  if (f.field === 'pipeline_gci' && String(f.filters?.active_pipeline) !== 'true') e.push('Pipeline GCI requires the “active pipeline” filter.')
  if (!/^#[0-9A-Fa-f]{6}$/.test(f.color || '')) e.push('Colour must be a 6-digit hex value.')
  if (f.date_mode === 'custom' && (!f.custom_from || !f.custom_to || f.custom_from > f.custom_to)) e.push('Custom range needs a valid from/to.')
  if (f.goal_type === 'custom' && !(Number(f.goal_value) > 0)) e.push('A custom goal needs a positive value.')
  return e
}

// emit ONLY allowlisted keys, positions normalised — for the real save RPC
export function toEngineConfig(list) {
  return list.map((f, i) => {
    const def = {
      position: i, title: (f.title || '').trim(), metric: f.metric,
      filters: f.filters || {}, date_mode: f.date_mode, date_field: f.date_field || 'close_date',
      format: f.format, color: f.color, visible: f.visible !== false, scope: 'team',
    }
    if (f.id) def.id = f.id
    if (f.subtitle) def.subtitle = f.subtitle
    if (f.metric === 'sum' || f.metric === 'avg') def.field = f.field
    if (f.date_mode === 'custom') { def.custom_from = f.custom_from; def.custom_to = f.custom_to }
    if (f.goal_type) { def.goal_type = f.goal_type; if (f.goal_value) def.goal_value = Number(f.goal_value); if (f.goal_year) def.goal_year = Number(f.goal_year) }
    return def
  })
}

export function formatValue(value, format) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  if (format === 'percent') return `${Math.round(n)}%`
  if (format === 'compact_currency') {
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`
    return `$${Math.round(n).toLocaleString()}`
  }
  if (format === 'currency' || format === 'full_currency') return `$${Math.round(n).toLocaleString()}`
  return Math.round(n).toLocaleString()
}

// clearly-labelled sample used only for local preview when nothing live exists
export function sampleValue(f) {
  if (f.metric === 'progress') return 68
  if (f.metric === 'count') return 128
  if (f.format && f.format.includes('currency')) return 4200000
  return 42
}
