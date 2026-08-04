import { describe, it, expect } from 'vitest'
import { buildLeaderboard, statusMeta } from './perfRanking.js'
import { fmtCompactMoney, fmtCompactNum, colorForKey } from './dashboardTheme.js'

const rows = [
  { agent_id: 'A', name: 'Agent A', color: '#0073EA', accepted_offers: 30 },
  { agent_id: 'B', name: 'Agent B', color: '#00C875', accepted_offers: 24 },
  { agent_id: 'C', name: 'Agent C', color: '#A25DDC', accepted_offers: 12 }, // no goal
]
const goals = { A: { target: 60 }, B: { target: 40 } } // A=50%, B=60%, C=none

describe('goal-based leaderboard', () => {
  it('ranks by percentage of individual goal (B 60% above A 50%)', () => {
    const lb = buildLeaderboard(rows, goals, 'accepted_offers')
    expect(lb[0].agent_id).toBe('B')
    expect(Math.round(lb[0].pct)).toBe(60)
    expect(lb[0].rank).toBe(1)
    expect(lb[1].agent_id).toBe('A')
    expect(Math.round(lb[1].pct)).toBe(50)
    expect(lb[1].rank).toBe(2)
  })

  it('shows an agent with no goal as unranked, never as 0% or outranking a real result', () => {
    const lb = buildLeaderboard(rows, goals, 'accepted_offers')
    const c = lb.find((x) => x.agent_id === 'C')
    expect(c.hasGoal).toBe(false)
    expect(c.pct).toBeNull()
    expect(c.rank).toBeNull()
    // C is placed after every ranked agent
    expect(lb.indexOf(c)).toBe(lb.length - 1)
  })

  it('computes remaining and percentage correctly', () => {
    const lb = buildLeaderboard(rows, goals, 'accepted_offers')
    const a = lb.find((x) => x.agent_id === 'A')
    expect(a.remaining).toBe(30)
    expect(a.target).toBe(60)
    expect(a.actual).toBe(30)
  })

  it('shares rank on exact ties', () => {
    const tie = [
      { agent_id: 'X', name: 'X', accepted_offers: 30 },
      { agent_id: 'Y', name: 'Y', accepted_offers: 15 },
    ]
    const g = { X: { target: 60 }, Y: { target: 30 } } // both 50%
    const lb = buildLeaderboard(tie, g, 'accepted_offers')
    expect(lb[0].rank).toBe(1)
    expect(lb[1].rank).toBe(1)
  })

  it('gives each status a word + glyph', () => {
    expect(statusMeta('behind')).toMatchObject({ word: 'Behind' })
    expect(statusMeta('complete')).toMatchObject({ word: 'Complete' })
  })
})

describe('compact formatting + deterministic color', () => {
  it('abbreviates large values cleanly', () => {
    expect(fmtCompactMoney(92800000)).toBe('$92.8M')
    expect(fmtCompactMoney(103300000)).toBe('$103.3M')
    expect(fmtCompactMoney(4200)).toBe('$4.2K')
    expect(fmtCompactNum(128)).toBe('128')
  })
  it('returns the same color for the same key every time', () => {
    expect(colorForKey('Agent A')).toBe(colorForKey('Agent A'))
  })
})
