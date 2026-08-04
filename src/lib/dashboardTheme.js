// dashboardTheme — shared, deterministic design tokens for the Command Center so
// every widget uses one typography scale, one card system, and one consistent
// visualization palette (colors never randomize between renders).

export const FONT = 'Inter, system-ui, -apple-system, sans-serif'

// Typography scale (px) — larger, readable hierarchy per the redesign spec
export const TYPE = {
  pageTitle: 26,
  kpi: 34,
  kpiSmall: 28,
  chartTitle: 17,
  cardTitle: 16,
  body: 14,
  row: 13.5,
  meta: 12,
}

export const CARD = {
  radius: 12,
  border: '1px solid #e6eaf0',
  shadow: '0 1px 2px rgba(16,24,40,0.04)',
  pad: 18,
  bg: '#ffffff',
}

export const INK = { title: '#0f172a', body: '#334155', muted: '#64748b', faint: '#94a3b8' }

// Consistent TargetOS visualization palette (Monday.com-inspired)
export const PALETTE = ['#0073EA', '#00C875', '#A25DDC', '#FDAB3D', '#E2445C', '#00A9C7', '#F5C518', '#F65F9A']
export const PALETTE_NAMES = ['blue', 'green', 'purple', 'orange', 'red', 'teal', 'yellow', 'pink']

// Deterministic color for an index or a stable key (same key → same color every render)
export function colorForIndex(i) { return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length] }
export function colorForKey(key) {
  const s = String(key == null ? '' : key)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// Compact money: 1234567 -> "$1.2M", 92800000 -> "$92.8M"; exact via fmtExact for tooltips
export function fmtCompactMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v), a = Math.abs(n), s = n < 0 ? '-' : ''
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
  return `${s}$${Math.round(a).toLocaleString()}`
}
export function fmtCompactNum(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v), a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
  return Math.round(n).toLocaleString()
}
export function fmtExactMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return '$' + Math.round(Number(v)).toLocaleString()
}
