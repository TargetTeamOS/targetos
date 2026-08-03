// goalMath — pure, testable display math for goals. The authoritative `actual`
// always comes from the server (app_goals_dashboard); everything here is derived
// presentation only (remaining, %, pace, projection) and is never written back.

const DAY = 86400000

export function basisMeta(basis) {
  switch (basis) {
    case 'accepted_offers': return { label: 'Accepted offers', currency: false, unit: 'offers' }
    case 'closed_units': return { label: 'Closed units', currency: false, unit: 'units' }
    case 'production_volume': return { label: 'Production volume', currency: true, unit: '' }
    case 'gci': return { label: 'GCI', currency: true, unit: '' }
    default: return { label: 'Goal', currency: false, unit: '' }
  }
}

export function formatGoalValue(v, basis) {
  if (v == null || Number.isNaN(v)) return '—'
  const { currency } = basisMeta(basis)
  if (currency) {
    const n = Number(v)
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`
    if (Math.abs(n) >= 1000) return `$${Math.round(n / 1000)}K`
    return `$${Math.round(n).toLocaleString()}`
  }
  return `${Math.round(Number(v)).toLocaleString()}`
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// Everything the UI needs for one goal, derived from server `actual` + target + window.
export function goalProgress(goal, now = new Date()) {
  const target = Number(goal?.target) || 0
  const actual = Number(goal?.actual) || 0
  const start = goal?.start_date ? startOfDay(goal.start_date) : null
  const end = goal?.end_date ? startOfDay(goal.end_date) : null
  const today = startOfDay(now)

  const remaining = Math.max(target - actual, 0)
  const pct = target > 0 ? (actual / target) * 100 : 0
  const complete = target > 0 && actual >= target

  let daysTotal = null, daysElapsed = null, daysRemaining = null, elapsedFrac = null
  if (start && end) {
    daysTotal = Math.max(Math.round((end - start) / DAY) + 1, 1)
    daysElapsed = Math.min(Math.max(Math.round((today - start) / DAY) + 1, 0), daysTotal)
    daysRemaining = Math.max(daysTotal - daysElapsed, 0)
    elapsedFrac = daysTotal > 0 ? daysElapsed / daysTotal : null
  }

  // where a linear plan says we "should" be by now
  const expectedByNow = elapsedFrac != null ? target * elapsedFrac : null
  // to still finish on time: remaining spread over the days left
  const requiredPerDay = daysRemaining && daysRemaining > 0 ? remaining / daysRemaining : null
  const monthsRemaining = daysRemaining != null ? Math.max(daysRemaining / 30.4, 0) : null
  const requiredPerMonth = monthsRemaining && monthsRemaining > 0.05 ? remaining / monthsRemaining : null
  // simple run-rate projection to the end of the window
  const projection = elapsedFrac && elapsedFrac > 0.02 ? actual / elapsedFrac : null

  let status = 'on-pace'
  if (complete) status = 'complete'
  else if (expectedByNow == null) status = 'on-pace'
  else if (actual >= expectedByNow * 1.02) status = 'ahead'
  else if (actual < expectedByNow * 0.92) status = 'behind'
  else status = 'on-pace'

  return {
    target, actual, remaining, pct, complete,
    daysTotal, daysElapsed, daysRemaining, elapsedFrac,
    expectedByNow, requiredPerDay, requiredPerMonth, monthsRemaining, projection, status,
  }
}

export function statusMeta(status) {
  switch (status) {
    case 'ahead': return { word: 'Ahead of pace', glyph: '\u25B2', color: '#037f4c' }
    case 'behind': return { word: 'Behind pace', glyph: '\u25BC', color: '#b42318' }
    case 'complete': return { word: 'Goal reached', glyph: '\u2713', color: '#037f4c' }
    default: return { word: 'On pace', glyph: '\u2014', color: '#0073EA' }
  }
}
