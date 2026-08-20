import { describe, expect, it } from 'vitest'
import {
  decorateRecordIdentifiers,
  decorateRecordList,
  identifierCodeFor,
  legacyRecordIdentifierValue,
  prepareRecordIdentifierWrite,
  prepareRecordIdentifierDatabaseWrite,
  recordIdentifierFilterValues,
} from './recordIdentifiers'

describe('record identifier compatibility', () => {
  it('decorates legacy records without replacing stored values', () => {
    const row = decorateRecordIdentifiers('deals', { id: '1', stage: 'Offer Accapted' })
    expect(row.stage).toBe('Offer Accapted')
    expect(row.stage_code).toBe('offer_accepted')
    expect(row.stage_label).toBe('Offer Accepted')
    expect(row.stage_counts_as_active).toBe(true)
  })

  it('normalizes ID-era writes through a stable code', () => {
    expect(prepareRecordIdentifierWrite('deals', { stage_code: 'offer_accepted' })).toMatchObject({
      stage_code: 'offer_accepted',
      stage: 'Offer Accepted',
    })
    expect(prepareRecordIdentifierDatabaseWrite('deals', { stage_code: 'offer_accepted' })).toEqual({
      stage: 'Offer Accepted',
    })
    expect(prepareRecordIdentifierWrite('tasks', { status_code: 'done', priority_code: 'high' })).toMatchObject({
      status: 'done',
      priority: 'high',
    })
  })

  it('fails closed for unknown codes and values', () => {
    expect(() => prepareRecordIdentifierWrite('contacts', { status_code: 'whatever' })).toThrow(/Unknown contact.lifecycle identifier/)
    expect(() => prepareRecordIdentifierWrite('listings', { status: 'Made Up' })).toThrow(/Unregistered listing.lifecycle value/)
  })

  it('keeps the historical task note pseudo-priority compatible', () => {
    expect(prepareRecordIdentifierWrite('tasks', { priority: 'note' })).toEqual({ priority: 'note' })
  })

  it('accepts a validated legacy form edit over its stale decorated code', () => {
    expect(prepareRecordIdentifierWrite('tasks', { status: 'done', status_code: 'pending' })).toMatchObject({
      status: 'done',
      status_code: 'done',
    })
    expect(identifierCodeFor('tasks', 'status', { status: 'done', status_code: 'pending' })).toBe('done')
    expect(decorateRecordIdentifiers('tasks', { status: 'done', status_code: 'pending' }).status_code).toBe('done')
  })

  it('normalizes a stable code supplied through a legacy form field', () => {
    expect(prepareRecordIdentifierDatabaseWrite('deals', { stage: 'offer_accepted' })).toEqual({
      stage: 'Offer Accepted',
    })
  })

  it('clears a stale environment FK when a compatibility form changes state', () => {
    expect(prepareRecordIdentifierDatabaseWrite('contacts', {
      status: 'Hot',
      status_code: 'new',
      status_id: '00000000-0000-0000-0000-000000000001',
    })).toEqual({ status: 'Hot', status_id: null })
  })

  it('supports stable comparisons for lists and individual values', () => {
    const rows = decorateRecordList('tasks', [{ status: 'completed' }, { status: 'pending' }])
    expect(rows.map(row => row.status_code)).toEqual(['done', 'pending'])
    expect(identifierCodeFor('offers', 'status', 'AO')).toBe('accepted')
    expect(legacyRecordIdentifierValue('deals', 'stage', 'offer_accepted')).toBe('Offer Accepted')
    expect(recordIdentifierFilterValues('deals', 'stage', 'offer_accepted')).toEqual(['Offer Accepted', 'Offer Accapted'])
    expect(recordIdentifierFilterValues('deals', 'stage', 'Offer Accapted')).toEqual(['Offer Accapted'])
  })

  it('keeps secondary dashboards and workflow transitions independent of legacy labels', () => {
    expect(['Closed', 'Deal Fell Through'].map(value => identifierCodeFor('deals', 'stage', value)))
      .toEqual(['closed', 'fell_through'])
    expect(['Hot', 'Warm'].map(value => identifierCodeFor('contacts', 'status', value)))
      .toEqual(['hot', 'warm'])
    expect(['AO', 'Accepted', 'Closed'].map(value => identifierCodeFor('offers', 'status', value)))
      .toEqual(['accepted', 'accepted', 'accepted'])
    expect(identifierCodeFor('listings', 'status', 'Accepted offer')).toBe('offer_accepted')
    expect(prepareRecordIdentifierDatabaseWrite('deals', { stage_code: 'offer_accepted' }))
      .toEqual({ stage: 'Offer Accepted' })
    expect(prepareRecordIdentifierDatabaseWrite('listings', { status_code: 'offer_accepted' }))
      .toEqual({ status: 'Accepted offer' })
  })

  it('uses the shared task identities for transaction-coordinator tasks', () => {
    expect(identifierCodeFor('tc_tasks', 'status', 'completed')).toBe('done')
    expect(prepareRecordIdentifierDatabaseWrite('tc_tasks', {
      status_code: 'done',
      priority_code: 'high',
    })).toEqual({ status: 'done', priority: 'high' })
  })
})
