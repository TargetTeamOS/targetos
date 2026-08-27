import { identifierCodeFor } from './recordIdentifiers'

export function automationIdentifierTable(triggerType, field) {
  if (field === 'stage') return 'deals'
  if (field === 'priority') return 'tasks'
  if (field === 'tc_phase') return 'tc_deals'
  if (field !== 'status') return null
  if (triggerType?.startsWith('listing_')) return 'listings'
  if (triggerType?.startsWith('task_')) return 'tasks'
  if (triggerType?.startsWith('offer_')) return 'offers'
  return 'contacts'
}

export function automationIdentifierMatches(table, field, recordOrValue, expected) {
  const actualCode = identifierCodeFor(table, field, recordOrValue)
  const expectedCode = identifierCodeFor(table, field, expected)
  return !!actualCode && !!expectedCode && actualCode === expectedCode
}

export function automationIdentifierChanged(table, field, record, previous) {
  return identifierCodeFor(table, field, record) !== identifierCodeFor(table, field, previous)
}

export function automationConditionEquals(triggerType, field, recordValue, conditionValue) {
  const table = automationIdentifierTable(triggerType, field)
  if (!table) return recordValue === conditionValue
  const leftCode = identifierCodeFor(table, field, recordValue)
  const rightCode = identifierCodeFor(table, field, conditionValue)
  return !!leftCode && !!rightCode && leftCode === rightCode
}
