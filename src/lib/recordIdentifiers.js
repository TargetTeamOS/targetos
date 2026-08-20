import {
  getChoiceOption,
  getWorkflowState,
  legacyChoiceValue,
  legacyWorkflowValue,
  resolveChoiceOption,
  resolveWorkflowState,
} from './identifiers'

export const RECORD_IDENTIFIER_FIELDS = Object.freeze({
  contacts: [
    { kind: 'workflow', definitionCode: 'contact.lifecycle', legacyField: 'status', idField: 'status_id' },
  ],
  deals: [
    { kind: 'workflow', definitionCode: 'deal.lifecycle', legacyField: 'stage', idField: 'stage_id' },
  ],
  listings: [
    { kind: 'workflow', definitionCode: 'listing.lifecycle', legacyField: 'status', idField: 'status_id' },
  ],
  tasks: [
    { kind: 'workflow', definitionCode: 'task.lifecycle', legacyField: 'status', idField: 'status_id' },
    { kind: 'choice', definitionCode: 'task.priority', legacyField: 'priority', idField: 'priority_id', passthroughValues: ['note'] },
  ],
  tc_tasks: [
    { kind: 'workflow', definitionCode: 'task.lifecycle', legacyField: 'status', idField: 'status_id' },
    { kind: 'choice', definitionCode: 'task.priority', legacyField: 'priority', idField: 'priority_id' },
  ],
  offers: [
    { kind: 'workflow', definitionCode: 'offer.lifecycle', legacyField: 'status', idField: 'status_id' },
  ],
  tc_deals: [
    { kind: 'workflow', definitionCode: 'tc.phase', legacyField: 'tc_phase', idField: 'phase_id', codeField: 'phase_code', labelField: 'phase_label' },
  ],
})

function fieldNames(config) {
  const base = config.legacyField === 'tc_phase' ? 'phase' : config.legacyField === 'stage' ? 'stage' : config.legacyField
  return {
    code: config.codeField || `${base}_code`,
    label: config.labelField || `${base}_label`,
    color: `${base}_color`,
    semantic: `${base}_semantic_type`,
  }
}

function resolve(config, value) {
  return config.kind === 'workflow'
    ? resolveWorkflowState(config.definitionCode, value)
    : resolveChoiceOption(config.definitionCode, value)
}

function byCode(config, code) {
  return config.kind === 'workflow'
    ? getWorkflowState(config.definitionCode, code)
    : getChoiceOption(config.definitionCode, code)
}

function storageValue(config, code) {
  return config.kind === 'workflow'
    ? legacyWorkflowValue(config.definitionCode, code)
    : legacyChoiceValue(config.definitionCode, code)
}

export function decorateRecordIdentifiers(tableName, record) {
  if (!record || typeof record !== 'object') return record
  const fields = RECORD_IDENTIFIER_FIELDS[tableName] || []
  if (!fields.length) return record
  const decorated = { ...record }

  for (const config of fields) {
    const names = fieldNames(config)
    const hasLegacyValue = Object.prototype.hasOwnProperty.call(record, config.legacyField)
      && record[config.legacyField] != null
    const value = hasLegacyValue ? record[config.legacyField] : record[names.code]
    if (value == null || config.passthroughValues?.includes(value)) continue
    const definition = resolve(config, value)
    if (!definition) continue
    decorated[names.code] = definition.code
    decorated[names.label] = definition.label
    if (definition.color) decorated[names.color] = definition.color
    if (definition.semanticType) decorated[names.semantic] = definition.semanticType
    if (config.kind === 'workflow') {
      decorated[`${names.code.replace(/_code$/, '')}_is_terminal`] = definition.isTerminal === true
      decorated[`${names.code.replace(/_code$/, '')}_counts_as_active`] = definition.countsAsActive === true
      decorated[`${names.code.replace(/_code$/, '')}_counts_as_won`] = definition.countsAsWon === true
    }
  }
  return decorated
}

export function decorateRecordList(tableName, records) {
  return (records || []).map(record => decorateRecordIdentifiers(tableName, record))
}

export function prepareRecordIdentifierWrite(tableName, input) {
  if (!input || typeof input !== 'object') return input
  const fields = RECORD_IDENTIFIER_FIELDS[tableName] || []
  if (!fields.length) return { ...input }
  const output = { ...input }

  for (const config of fields) {
    const names = fieldNames(config)
    const stableCode = output[names.code]
    const legacyValue = output[config.legacyField]
    // Legacy form controls remain common during compatibility. When a decorated
    // record is edited they may carry a stale virtual code alongside the newly
    // selected legacy value, so a validated explicit legacy value takes precedence.
    if (legacyValue != null && !config.passthroughValues?.includes(legacyValue)) {
      const definition = resolve(config, legacyValue)
      if (!definition) throw new Error(`Unregistered ${config.definitionCode} value: ${legacyValue}`)
      output[names.code] = definition.code
      if (byCode(config, legacyValue)) {
        output[config.legacyField] = storageValue(config, definition.code)
      }
    } else if (stableCode != null) {
      const definition = byCode(config, stableCode)
      if (!definition) throw new Error(`Unknown ${config.definitionCode} identifier: ${stableCode}`)
      output[config.legacyField] = storageValue(config, stableCode)
    }
    delete output[names.label]
    delete output[names.color]
    delete output[names.semantic]
    delete output[`${names.code.replace(/_code$/, '')}_is_terminal`]
    delete output[`${names.code.replace(/_code$/, '')}_counts_as_active`]
    delete output[`${names.code.replace(/_code$/, '')}_counts_as_won`]
  }
  return output
}

export function prepareRecordIdentifierDatabaseWrite(tableName, input) {
  const output = prepareRecordIdentifierWrite(tableName, input)
  if (!output || typeof output !== 'object') return output
  for (const config of RECORD_IDENTIFIER_FIELDS[tableName] || []) {
    const names = fieldNames(config)
    // Once the additive ID columns exist, a compatibility form may submit the
    // previously loaded FK together with a newly selected legacy value. Clear
    // that stale FK so the database trigger can resolve the new environment's
    // canonical identifier. Do not add the column before its migration exists.
    if (
      (input?.[config.legacyField] != null || input?.[names.code] != null)
      && Object.prototype.hasOwnProperty.call(input, config.idField)
    ) {
      output[config.idField] = null
    }
    delete output[names.code]
    delete output[names.label]
    delete output[names.color]
    delete output[names.semantic]
    delete output[`${names.code.replace(/_code$/, '')}_is_terminal`]
    delete output[`${names.code.replace(/_code$/, '')}_counts_as_active`]
    delete output[`${names.code.replace(/_code$/, '')}_counts_as_won`]
  }
  return output
}

export function identifierCodeFor(tableName, fieldName, recordOrValue) {
  const config = (RECORD_IDENTIFIER_FIELDS[tableName] || []).find(item => item.legacyField === fieldName)
  if (!config) return null
  const names = fieldNames(config)
  if (recordOrValue && typeof recordOrValue === 'object') {
    if (Object.prototype.hasOwnProperty.call(recordOrValue, fieldName)) {
      return resolve(config, recordOrValue[fieldName])?.code || null
    }
    if (recordOrValue[names.code]) return byCode(config, recordOrValue[names.code])?.code || null
  }
  const value = recordOrValue
  return resolve(config, value)?.code || null
}

export function legacyRecordIdentifierValue(tableName, fieldName, value) {
  const config = (RECORD_IDENTIFIER_FIELDS[tableName] || []).find(item => item.legacyField === fieldName)
  if (!config || value == null || config.passthroughValues?.includes(value)) return value
  const definition = resolve(config, value)
  if (!definition) throw new Error(`Unknown ${config.definitionCode} identifier: ${value}`)
  return storageValue(config, definition.code)
}

export function recordIdentifierFilterValues(tableName, fieldName, value) {
  const config = (RECORD_IDENTIFIER_FIELDS[tableName] || []).find(item => item.legacyField === fieldName)
  if (!config || value == null || config.passthroughValues?.includes(value)) return [value]
  const directCode = byCode(config, value)
  if (!directCode) return [value]
  return [...new Set([storageValue(config, value), ...(directCode.legacyValues || [])].filter(Boolean))]
}
