import catalog from '../../shared/identifierCatalog.json'

function normalizeLegacy(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : ''
}

export function buildIdentifierIndex(source = catalog) {
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
        if (existing && existing.code !== option.code) {
          throw new Error(`Ambiguous identifier alias ${choiceSet.code}:${legacy}`)
        }
        choiceOptionsByLegacy.set(key, option)
      }
    }
  }

  return { source, workflows, statesByCode, statesByLegacy, choices, choiceOptionsByCode, choiceOptionsByLegacy }
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

// Compatibility controls display the editable label while submitting the
// current legacy storage value. New configuration records should persist the
// immutable `code`; direct record forms use these options until the additive
// identifier columns are deployed and made authoritative.
export function workflowStorageOptions(workflowCode, index = identifierIndex) {
  const workflow = getWorkflow(workflowCode, index)
  return (workflow?.states || []).map(state => ({
    id: state.code,
    code: state.code,
    value: state.storageValue || state.legacyValues?.[0] || state.code,
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

export function getChoiceOption(choiceSetCode, optionCode, index = identifierIndex) {
  if (!choiceSetCode || !optionCode) return null
  return index.choiceOptionsByCode.get(`${choiceSetCode}:${optionCode}`) || null
}

export function resolveChoiceOption(choiceSetCode, value, index = identifierIndex) {
  if (!choiceSetCode || value == null) return null
  if (typeof value === 'object') {
    if (value.code) return getChoiceOption(choiceSetCode, value.code, index)
    value = value.label ?? value.value
  }
  return getChoiceOption(choiceSetCode, value, index)
    || index.choiceOptionsByLegacy.get(`${choiceSetCode}:${normalizeLegacy(value)}`)
    || null
}

export function resolveChoiceOptionCode(choiceSetCode, value, index = identifierIndex) {
  return resolveChoiceOption(choiceSetCode, value, index)?.code || null
}

export function legacyChoiceValue(choiceSetCode, optionCode, index = identifierIndex) {
  const option = getChoiceOption(choiceSetCode, optionCode, index)
  return option?.storageValue || option?.legacyValues?.[0] || null
}

export function choiceOptions(choiceSetCode, index = identifierIndex) {
  const choiceSet = index.choices.get(choiceSetCode)
  return (choiceSet?.options || []).map(option => ({
    id: option.code,
    code: option.code,
    value: option.code,
    label: option.label,
    color: option.color,
    hex: option.color,
  }))
}

export function choiceStorageOptions(choiceSetCode, index = identifierIndex) {
  const choiceSet = index.choices.get(choiceSetCode)
  return (choiceSet?.options || []).map(option => ({
    id: option.code,
    code: option.code,
    value: option.storageValue || option.legacyValues?.[0] || option.code,
    label: option.label,
    color: option.color,
    hex: option.color,
  }))
}

export function displayChoiceOption(choiceSetCode, value, index = identifierIndex) {
  return resolveChoiceOption(choiceSetCode, value, index)?.label || String(value ?? '')
}
