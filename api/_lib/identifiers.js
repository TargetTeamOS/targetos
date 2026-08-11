'use strict'

const catalog = require('../../shared/identifierCatalog.json')

function normalizeLegacy(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
}

function buildIndex(source = catalog) {
  const workflows = new Map()
  const statesByCode = new Map()
  const statesByLegacy = new Map()

  for (const workflow of source.workflows || []) {
    workflows.set(workflow.code, workflow)
    for (const state of workflow.states || []) {
      statesByCode.set(`${workflow.code}:${state.code}`, state)
      for (const legacy of state.legacyValues || []) {
        const key = `${workflow.code}:${normalizeLegacy(legacy)}`
        const existing = statesByLegacy.get(key)
        if (existing && existing.code !== state.code) {
          throw new Error(`Ambiguous identifier alias ${workflow.code}:${legacy}`)
        }
        statesByLegacy.set(key, state)
      }
    }
  }
  return { workflows, statesByCode, statesByLegacy }
}

const index = buildIndex()

function resolveWorkflowState(workflowCode, value, sourceIndex = index) {
  if (!workflowCode || value == null) return null
  if (typeof value === 'object') value = value.code || value.label || value.value
  return sourceIndex.statesByCode.get(`${workflowCode}:${value}`)
    || sourceIndex.statesByLegacy.get(`${workflowCode}:${normalizeLegacy(value)}`)
    || null
}

function resolveWorkflowStateCode(workflowCode, value, sourceIndex = index) {
  return resolveWorkflowState(workflowCode, value, sourceIndex)?.code || null
}

function workflowStateMatches(workflowCode, value, expectedCode, sourceIndex = index) {
  return resolveWorkflowStateCode(workflowCode, value, sourceIndex) === expectedCode
}

function workflowStateHasFlag(workflowCode, value, flag, sourceIndex = index) {
  return resolveWorkflowState(workflowCode, value, sourceIndex)?.[flag] === true
}

module.exports = {
  catalog,
  buildIndex,
  index,
  resolveWorkflowState,
  resolveWorkflowStateCode,
  workflowStateMatches,
  workflowStateHasFlag,
}
