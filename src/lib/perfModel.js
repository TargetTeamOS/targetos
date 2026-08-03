// perfModel — pure metric definitions, formatting, ranking and date ranges for
// the agent-performance leaderboard. GCI is marked financial so the UI only ever
// shows it when the server actually returns it (admins).

export const PERF_METRICS = [
  { key: 'accepted_offers',  label: 'Accepted offers', short: 'Offers',     currency: false, financial: false },
  { key: 'closed_units',     label: 'Closed units',    short: 'Closed',     currency: false, financial: false },
  { key: 'production_volume',label: 'Production',       short: 'Production', currency: true,  financial: false },
  { key: 'buyers',           label: 'Buyers',          short: 'Buyers',     currency: false, financial: false },
  { key: 'listings',         label: 'Listings',        short: 'Listings',   currency: false, financial: false },
  { key: 'gci',              label: 'GCI',             short: 'GCI',        currency: true,  financial: true },
]

export const DEFAULT_VISIBLE = ['accepted_offers', 'closed_units', 'production_volume']

export function metricDef(key) { return PERF_METRICS.find((m) => m.key === key) || null }

export function fmtMetric(v, m) {
  if (v == null || Number.isNaN(v)) return '—'
  if (m && m.currency) {
    const n = Number(v)
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`
    return `$${Math.round(n).toLocaleString()}`
  }
  return Math.round(Number(v)).toLocaleString()
}

export function rankBy(rows, key) {
  return [...(rows || [])].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))
}

// basis to pass to app_agent_records for a given metric column
export function recordBasis(key) {
  return key === 'accepted_offers' ? 'accepted_offers' : (key === 'production_volume' || key === 'gci') ? 'production_volume' : 'closed_units'
}

export const PERF_RANGES = [
  { key: 'mtd', label: 'This month' },
  { key: 'qtd', label: 'This quarter' },
  { key: 'ytd', label: 'This year' },
]

function iso(d) { return d.toISOString().slice(0, 10) }

export function rangeDates(key, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  const to = iso(now)
  if (key === 'ytd') return { from: iso(new Date(y, 0, 1)), to, label: 'This year' }
  if (key === 'qtd') { const qm = Math.floor(m / 3) * 3; return { from: iso(new Date(y, qm, 1)), to, label: 'This quarter' } }
  return { from: iso(new Date(y, m, 1)), to, label: 'This month' }
}
