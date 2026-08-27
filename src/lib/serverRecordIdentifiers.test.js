import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  recordIdentifierCode,
  recordIdentifierMatches,
  recordIdentifierValues,
} = require('../../api/_lib/recordIdentifiers')

describe('server record identifier compatibility', () => {
  it('matches registered legacy spellings through stable codes', () => {
    expect(recordIdentifierMatches('deals', 'stage', 'Offer Accapted', 'offer_accepted')).toBe(true)
    expect(recordIdentifierMatches('deals', 'stage', 'Offer Accepted', 'offer_accepted')).toBe(true)
    expect(recordIdentifierCode('tasks', 'status', 'completed')).toBe('done')
  })

  it('expands database filters to all registered aliases', () => {
    expect(recordIdentifierValues('deals', 'stage', 'offer_accepted')).toEqual(['Offer Accepted', 'Offer Accapted'])
    expect(recordIdentifierValues('tasks', 'status', 'done')).toEqual(['done', 'Done', 'completed', 'Completed'])
  })

  it('fails closed for unknown machine values', () => {
    expect(recordIdentifierMatches('contacts', 'status', 'invented', 'new')).toBe(false)
    expect(recordIdentifierCode('listings', 'status', 'invented')).toBe(null)
    expect(recordIdentifierValues('offers', 'status', 'invented')).toEqual([])
  })

  it('keeps the historical task note pseudo-priority isolated', () => {
    expect(recordIdentifierCode('tasks', 'priority', 'note')).toBe('note')
    expect(recordIdentifierValues('tasks', 'priority', 'note')).toEqual(['note'])
  })
})
