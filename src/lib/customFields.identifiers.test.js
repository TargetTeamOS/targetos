import { describe, expect, it } from 'vitest'
import { createOptionDefinition, normalizeOption } from './customFields'

describe('custom field option identity', () => {
  it('keeps identity and stored value when a label is renamed', () => {
    const original = createOptionDefinition('First Label', '#123456')
    const renamed = normalizeOption({ ...original, label: 'Renamed Label' })
    expect(renamed.id).toBe(original.id)
    expect(renamed.code).toBe(original.code)
    expect(renamed.value).toBe(original.value)
    expect(renamed.label).toBe('Renamed Label')
  })

  it('normalizes legacy strings without changing their stored value', () => {
    const normalized = normalizeOption('Legacy Label')
    expect(normalized.value).toBe('Legacy Label')
    expect(normalized.code).toBe('legacy_legacy_label')
  })
})
