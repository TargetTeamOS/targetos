import { describe, expect, it } from 'vitest'
import { buildPermissionChecker } from './permissions'
import { safeErrorMessage } from './errorMessage'

describe('Phase 2 stable access policy', () => {
  it('denies restricted workspaces to agents by default', () => {
    const can = buildPermissionChecker('agent')
    expect(can('calls.view')).toBe(false)
    expect(can('marketing.access')).toBe(false)
    expect(can('daily_briefing.access')).toBe(false)
    expect(can('announcements.access')).toBe(false)
  })

  it('allows office roles to use restricted workspaces', () => {
    for (const role of ['admin', 'secretary']) {
      const can = buildPermissionChecker(role)
      expect(can('calls.view')).toBe(true)
      expect(can('marketing.access')).toBe(true)
      expect(can('daily_briefing.access')).toBe(true)
      expect(can('announcements.access')).toBe(true)
    }
  })

  it('opens only the granted stable permission for one agent', () => {
    const can = buildPermissionChecker('agent', {}, { 'calls.view': true })
    expect(can('calls.view')).toBe(true)
    expect(can('marketing.access')).toBe(false)
    expect(can('announcements.access')).toBe(false)
  })

  it('never renders structured provider errors as object text', () => {
    expect(safeErrorMessage({ error: { message: 'Connection unavailable' } })).toBe('Connection unavailable')
    expect(safeErrorMessage({ unexpected: true }, 'Request failed')).toBe('Request failed')
  })
})

