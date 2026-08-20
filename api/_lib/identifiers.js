'use strict'

const catalog = require('../../shared/identifierCatalog.json')

function normalizeLegacy(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
}

function buildIndex(source = catalog) {
  const workflows = new Map()
  const statesByCode = new Map()
  const statesByLegacy = new Map()
  const choices = new Map()
  const choiceOptionsByCode = new Map()
  const choiceOptionsByLegacy = new Map()

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
  for (const choiceSet of source.choiceSets || []) {
    choices.set(choiceSet.code, choiceSet)
    for (const option of choiceSet.options || []) {
      choiceOptionsByCode.set(`${choiceSet.code}:${option.code}`, option)
      for (const legacy of option.legacyValues || []) {
        const key = `${choiceSet.code}:${normalizeLegacy(legacy)}`
        const existing = choiceOptionsByLegacy.get(key)
        if (existing && existing.code !== option.code) throw new Error(`Ambiguous identifier alias ${choiceSet.code}:${legacy}`)
        choiceOptionsByLegacy.set(key, option)
      }
    }
  }
  return { workflows, statesByCode, statesByLegacy, choices, choiceOptionsByCode, choiceOptionsByLegacy }
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

function workflowStateValues(workflowCode, value, sourceIndex = index) {
  const state = resolveWorkflowState(workflowCode, value, sourceIndex)
  if (!state) return value == null ? [] : [value]
  return [...new Set([state.storageValue, ...(state.legacyValues || [])].filter(Boolean))]
}

function resolveChoiceOption(choiceSetCode, value, sourceIndex = index) {
  if (!choiceSetCode || value == null) return null
  if (typeof value === 'object') value = value.code || value.label || value.value
  return sourceIndex.choiceOptionsByCode.get(`${choiceSetCode}:${value}`)
    || sourceIndex.choiceOptionsByLegacy.get(`${choiceSetCode}:${normalizeLegacy(value)}`)
    || null
}

function resolveChoiceOptionCode(choiceSetCode, value, sourceIndex = index) {
  return resolveChoiceOption(choiceSetCode, value, sourceIndex)?.code || null
}

function choiceOptionValues(choiceSetCode, value, sourceIndex = index) {
  const option = resolveChoiceOption(choiceSetCode, value, sourceIndex)
  if (!option) return value == null ? [] : [value]
  return [...new Set([option.storageValue, ...(option.legacyValues || [])].filter(Boolean))]
}

module.exports = {
  catalog,
  buildIndex,
  index,
  resolveWorkflowState,
  resolveWorkflowStateCode,
  workflowStateMatches,
  workflowStateHasFlag,
  workflowStateValues,
  resolveChoiceOption,
  resolveChoiceOptionCode,
  choiceOptionValues,
}
