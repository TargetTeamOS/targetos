'use strict'

const {
  choiceOptionValues,
  resolveChoiceOptionCode,
  resolveWorkflowStateCode,
  workflowStateMatches,
  workflowStateValues,
} = require('./identifiers')

const RECORD_IDENTIFIERS = Object.freeze({
  contacts: { status: { kind: 'workflow', definition: 'contact.lifecycle' } },
  deals: {
    stage: { kind: 'workflow', definition: 'deal.lifecycle' },
    ctc: { kind: 'workflow', definition: 'deal.ctc' },
    deal_status: { kind: 'workflow', definition: 'deal.progress' },
    command: { kind: 'workflow', definition: 'command.lifecycle' },
    commission_status: { kind: 'workflow', definition: 'commission.collection' },
  },
  listings: { status: { kind: 'workflow', definition: 'listing.lifecycle' } },
  offers: { status: { kind: 'workflow', definition: 'offer.lifecycle' } },
  tasks: {
    status: { kind: 'workflow', definition: 'task.lifecycle' },
    priority: { kind: 'choice', definition: 'task.priority', passthrough: ['note'] },
  },
  tc_tasks: { status: { kind: 'workflow', definition: 'task.lifecycle' } },
  tc_deals: { tc_phase: { kind: 'workflow', definition: 'tc.phase' } },
  gifts: {
    status: { kind: 'workflow', definition: 'gift.lifecycle' },
    closing_gift_status: { kind: 'workflow', definition: 'gift.closing' },
    label: { kind: 'choice', definition: 'gift.recipient_type' },
  },
  signs: { order_status: { kind: 'workflow', definition: 'sign.lifecycle' } },
  calls: {
    outcome: { kind: 'workflow', definition: 'call.outcome' },
    direction: { kind: 'choice', definition: 'call.direction' },
  },
  tc_photography: { status: { kind: 'workflow', definition: 'photography.lifecycle' } },
  email_campaigns: { status: { kind: 'workflow', definition: 'campaign.lifecycle' } },
  integrations: { status: { kind: 'workflow', definition: 'connector.lifecycle' } },
  integration_accounts: { status: { kind: 'workflow', definition: 'connector.lifecycle' } },
})

function definitionFor(table, field) {
  return RECORD_IDENTIFIERS[table]?.[field] || null
}

function recordIdentifierCode(table, field, recordOrValue) {
  const definition = definitionFor(table, field)
  if (!definition) return null
  const value = recordOrValue && typeof recordOrValue === 'object'
    ? recordOrValue[field]
    : recordOrValue
  if (definition.passthrough?.includes(value)) return value
  return definition.kind === 'choice'
    ? resolveChoiceOptionCode(definition.definition, value)
    : resolveWorkflowStateCode(definition.definition, value)
}

function recordIdentifierMatches(table, field, recordOrValue, expectedCode) {
  const definition = definitionFor(table, field)
  if (!definition) return false
  const value = recordOrValue && typeof recordOrValue === 'object'
    ? recordOrValue[field]
    : recordOrValue
  if (definition.passthrough?.includes(value)) return value === expectedCode
  return definition.kind === 'choice'
    ? resolveChoiceOptionCode(definition.definition, value) === expectedCode
    : workflowStateMatches(definition.definition, value, expectedCode)
}

function recordIdentifierValues(table, field, value) {
  const definition = definitionFor(table, field)
  if (!definition || definition.passthrough?.includes(value)) return value == null ? [] : [value]
  const values = definition.kind === 'choice'
    ? choiceOptionValues(definition.definition, value)
    : workflowStateValues(definition.definition, value)
  const code = recordIdentifierCode(table, field, value)
  return code ? values : []
}

module.exports = {
  RECORD_IDENTIFIERS,
  recordIdentifierCode,
  recordIdentifierMatches,
  recordIdentifierValues,
}
