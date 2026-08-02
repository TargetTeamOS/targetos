// marketFormat — pure display helpers for the market-strip widgets. Kept
// framework-free so the direction/formatting logic is unit-testable and never
// depends on color alone to convey meaning (each direction carries a glyph +
// word as well).

export function rateDirection(change) {
  if (change == null || Number.isNaN(change)) return { key: 'flat', word: 'unchanged', glyph: '\u2014', sign: '' }
  if (change > 0.001) return { key: 'up', word: 'up', glyph: '\u25B2', sign: '+' }
  if (change < -0.001) return { key: 'down', word: 'down', glyph: '\u25BC', sign: '' }
  return { key: 'flat', word: 'unchanged', glyph: '\u2014', sign: '' }
}

export function fmtRate(v) {
  return v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(2)}%`
}

export function fmtChange(change) {
  if (change == null || Number.isNaN(change)) return '—'
  const d = rateDirection(change)
  return `${d.sign}${Math.abs(change).toFixed(2)} pts`
}

// Short, human relative date for feeds/observations ("today", "3d ago", or a date).
export function relativeDate(input, now = new Date()) {
  if (!input) return ''
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(input).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const CATEGORY_LABELS = {
  real_estate: 'Real estate', housing: 'Housing', zoning: 'Zoning',
  development: 'Development', taxes: 'Taxes', local_business: 'Local business',
  community: 'Community',
}
export function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || 'Community'
}

// Build an <svg> polyline points string for a sparkline given numeric values.
export function sparklinePoints(values, width = 120, height = 32, pad = 2) {
  const nums = (values || []).map(Number).filter((n) => !Number.isNaN(n))
  if (nums.length < 2) return ''
  const min = Math.min(...nums), max = Math.max(...nums)
  const span = max - min || 1
  const stepX = (width - pad * 2) / (nums.length - 1)
  return nums
    .map((v, i) => {
      const x = pad + i * stepX
      const y = height - pad - ((v - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
