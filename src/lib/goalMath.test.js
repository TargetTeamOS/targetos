import { describe, it, expect } from 'vitest'
import { goalProgress, basisMeta, formatGoalValue, statusMeta } from './goalMath.js'

const monthGoal = (actual, target = 10) => ({
  goal_basis: 'accepted_offers', period: 'monthly', target, actual,
  start_date: '2026-08-01', end_date: '2026-08-31',
})

describe('goalProgress core math', () => {
  it('computes remaining, percentage and days for a mid-month goal', () => {
    const p = goalProgress(monthGoal(4, 10), new Date('2026-08-16T12:00:00'))
    expect(p.remaining).toBe(6)
    expect(Math.round(p.pct)).toBe(40)
    expect(p.daysTotal).toBe(31)
    expect(p.daysElapsed).toBe(16)
    expect(p.daysRemaining).toBe(15)
  })

  it('flags behind when actual trails the linear plan', () => {
    // half the month elapsed, only 2 of 10 → behind
    const p = goalProgress(monthGoal(2, 10), new Date('2026-08-16T12:00:00'))
    expect(p.status).toBe('behind')
  })

  it('flags ahead when actual beats the linear plan', () => {
    const p = goalProgress(monthGoal(9, 10), new Date('2026-08-10T12:00:00'))
    expect(p.status).toBe('ahead')
  })

  it('flags complete when the target is met', () => {
    const p = goalProgress(monthGoal(10, 10), new Date('2026-08-20T12:00:00'))
    expect(p.complete).toBe(true)
    expect(p.status).toBe('complete')
    expect(p.remaining).toBe(0)
  })

  it('projects a year-end run rate from elapsed fraction', () => {
    const yearGoal = { goal_basis: 'closed_units', period: 'yearly', target: 120, actual: 30, start_date: '2026-01-01', end_date: '2026-12-31' }
    const p = goalProgress(yearGoal, new Date('2026-04-01T12:00:00')) // ~1/4 elapsed
    expect(p.projection).toBeGreaterThan(100)
    expect(p.projection).toBeLessThan(140)
    expect(p.requiredPerMonth).toBeGreaterThan(0)
  })
})

describe('formatting helpers', () => {
  it('labels bases and formats currency vs counts', () => {
    expect(basisMeta('gci').currency).toBe(true)
    expect(basisMeta('accepted_offers').label).toBe('Accepted offers')
    expect(formatGoalValue(1500000, 'production_volume')).toBe('$1.50M')
    expect(formatGoalValue(42000, 'gci')).toBe('$42K')
    expect(formatGoalValue(7, 'accepted_offers')).toBe('7')
    expect(formatGoalValue(null, 'gci')).toBe('—')
  })
  it('gives each status a word + glyph (never color alone)', () => {
    expect(statusMeta('behind')).toMatchObject({ word: 'Behind pace', glyph: '▼' })
    expect(statusMeta('ahead')).toMatchObject({ word: 'Ahead of pace' })
    expect(statusMeta('on-pace').word).toBe('On pace')
  })
})
