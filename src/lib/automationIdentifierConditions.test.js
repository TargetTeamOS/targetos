import { describe, expect, it } from 'vitest'
import { checkConditions } from './automationEngine'
import { automationConditionEquals, automationIdentifierChanged } from './automationIdentifiers'

describe('automation identifier conditions', () => {
  it('matches deal conditions by stable identity across legacy aliases', () => {
    const automation = {
      trigger_type: 'deal_stage_change',
      conditions: [{ field: 'stage', operator: 'equals', value: 'offer_accepted' }],
    }
    expect(checkConditions(automation, { stage: 'Offer Accapted' })).toBe(true)
    expect(checkConditions(automation, { stage: 'Offer Accepted' })).toBe(true)
  })

  it('matches task and listing conditions without label equality', () => {
    expect(checkConditions({
      trigger_type: 'task_completed',
      conditions: [{ field: 'status', operator: 'equals', value: 'done' }],
    }, { status: 'Completed' })).toBe(true)
    expect(checkConditions({
      trigger_type: 'listing_status_change',
      conditions: [{ field: 'status', operator: 'not_equals', value: 'active' }],
    }, { status: 'Sold' })).toBe(true)
  })

  it('fails unknown values instead of treating them as registered states', () => {
    expect(checkConditions({
      trigger_type: 'contact_status_change',
      conditions: [{ field: 'status', operator: 'equals', value: 'new' }],
    }, { status: 'invented' })).toBe(false)
    expect(automationConditionEquals('contact_status_change', 'status', 'invented', 'invented')).toBe(false)
  })

  it('does not report an alias-only spelling change as a lifecycle transition', () => {
    expect(automationIdentifierChanged('deals', 'stage', { stage: 'Offer Accepted' }, { stage: 'Offer Accapted' })).toBe(false)
    expect(automationConditionEquals('offer_status_change', 'status', 'AO', 'accepted')).toBe(true)
  })
})
