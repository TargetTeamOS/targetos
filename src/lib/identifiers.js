import catalog from '../../shared/identifierCatalog.json'

function normalizeLegacy(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
}

export function buildIdentifierIndex(source = catalog) {
  const workflows = new Map()
  const statesByCode = new Map()
  const statesByLegacy = new Map()
  const choices = new Map()

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
  }

  return { source, workflows, statesByCode, statesByLegacy, choices }
}

export const identifierCatalog = catalog
export const identifierIndex = buildIdentifierIndex(catalog)

export function getWorkflow(workflowCode, index = identifierIndex) {
  return index.workflows.get(workflowCode) || null
}

export function getWorkflowState(workflowCode, stateCode, index = identifierIndex) {
  if (!workflowCode || !stateCode) return null
  return index.statesByCode.get(`${workflowCode}:${stateCode}`) || null
}

export function resolveWorkflowState(workflowCode, value, index = identifierIndex) {
  if (!workflowCode || value == null) return null
  if (typeof value === 'object') {
    if (value.code) return getWorkflowState(workflowCode, value.code, index)
    value = value.label ?? value.value
  }
  return getWorkflowState(workflowCode, value, index)
    || index.statesByLegacy.get(`${workflowCode}:${normalizeLegacy(value)}`)
    || null
}

export function resolveWorkflowStateCode(workflowCode, value, index = identifierIndex) {
  return resolveWorkflowState(workflowCode, value, index)?.code || null
}

export function workflowStateMatches(workflowCode, value, expectedCode, index = identifierIndex) {
  return resolveWorkflowStateCode(workflowCode, value, index) === expectedCode
}

export function workflowStateHasFlag(workflowCode, value, flag, index = identifierIndex) {
  return resolveWorkflowState(workflowCode, value, index)?.[flag] === true
}

export function workflowStateOptions(workflowCode, index = identifierIndex) {
  const workflow = getWorkflow(workflowCode, index)
  return (workflow?.states || []).map(state => ({
    id: state.code,
    code: state.code,
    value: state.code,
    label: state.label,
    color: state.color,
    hex: state.color,
  }))
}

export function legacyWorkflowValue(workflowCode, stateCode, index = identifierIndex) {
  const state = getWorkflowState(workflowCode, stateCode, index)
  return state?.storageValue || state?.legacyValues?.[0] || null
}

export function displayWorkflowState(workflowCode, value, index = identifierIndex) {
  return resolveWorkflowState(workflowCode, value, index)?.label || String(value ?? '')
}
