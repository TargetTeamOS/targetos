// perfRanking — goal-based Agent Performance ranking (redesign §9).
// Agents are ranked PRIMARILY by percentage of their INDIVIDUAL goal achieved,
// so agents with different targets compare fairly. An agent with no configured
// goal is shown as "No goal set" and is NOT ranked as if the goal were zero —
// such agents are listed after the ranked ones and never outrank a real result.

export const PERF_METRIC_BASIS = {
  accepted_offers: 'accepted_offers',
  closed_units: 'closed_units',
  production_volume: 'production_volume',
  gci: 'gci',
}

function statusFor(pct, elapsedFrac) {
  if (pct >= 100) return 'complete'
  if (elapsedFrac == null) return 'on-pace'
  const expected = elapsedFrac * 100
  if (pct >= expected * 1.02) return 'ahead'
  if (pct < expected * 0.92) return 'behind'
  return 'on-pace'
}

export function statusMeta(status) {
  switch (status) {
    case 'ahead': return { word: 'Ahead', glyph: '\u25B2', color: '#037f4c' }
    case 'behind': return { word: 'Behind', glyph: '\u25BC', color: '#b42318' }
    case 'complete': return { word: 'Complete', glyph: '\u2713', color: '#037f4c' }
    default: return { word: 'On pace', glyph: '\u2014', color: '#0073EA' }
  }
}

// rows: [{agent_id,name,color,<metricKey>:actual,...}]
// goals: { [agent_id]: { target, start_date?, end_date? } }
// metric: e.g. 'accepted_offers'
// now/elapsedFrac optional for pace/projection
export function buildLeaderboard(rows, goals, metric, opts = {}) {
  const elapsedFrac = opts.elapsedFrac ?? null
  const items = (rows || []).map((r) => {
    const actual = Number(r[metric]) || 0
    const g = goals ? goals[r.agent_id] : null
    const target = g && Number(g.target) > 0 ? Number(g.target) : null
    const hasGoal = target != null
    const pct = hasGoal ? (actual / target) * 100 : null
    const remaining = hasGoal ? Math.max(target - actual, 0) : null
    const projection = hasGoal && elapsedFrac && elapsedFrac > 0.02 ? actual / elapsedFrac : null
    const requiredPace = hasGoal && elapsedFrac != null && elapsedFrac < 1
      ? Math.max(target - actual, 0) / Math.max(1 - elapsedFrac, 0.0001) : null
    return {
      agent_id: r.agent_id, name: r.name, color: r.color,
      actual, target, hasGoal, pct, remaining, projection, requiredPace,
      status: hasGoal ? statusFor(pct, elapsedFrac) : null,
    }
  })

  const ranked = items.filter((x) => x.hasGoal).sort((a, b) => (b.pct - a.pct) || (b.actual - a.actual) || a.name.localeCompare(b.name))
  // dense-ish rank with tie sharing on equal pct
  let lastPct = null, lastRank = 0
  ranked.forEach((x, i) => {
    if (lastPct != null && Math.abs(x.pct - lastPct) < 1e-9) { x.rank = lastRank }
    else { x.rank = i + 1; lastRank = x.rank; lastPct = x.pct }
  })
  const noGoal = items.filter((x) => !x.hasGoal).sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name))
  noGoal.forEach((x) => { x.rank = null })

  return [...ranked, ...noGoal]
}
