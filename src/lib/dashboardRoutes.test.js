import { describe, it, expect } from 'vitest'
import { resolveRecordRoute, rowRoute } from './dashboardRoutes.js'

describe('resolveRecordRoute', () => {
  it('maps each record type to its existing TargetOS route', () => {
    expect(resolveRecordRoute('contact', 'c1')).toBe('/contacts/c1/detail')
    expect(resolveRecordRoute('deal', 'd2')).toBe('/production/d2')
    expect(resolveRecordRoute('listing', 'l3')).toBe('/listings/l3')
    expect(resolveRecordRoute('task', 't4')).toBe('/tasks/t4')
    expect(resolveRecordRoute('appointment', 'a5')).toBe('/calendar/a5')
    expect(resolveRecordRoute('offer', 'o6')).toBe('/offers/o6')
    expect(resolveRecordRoute('transaction', 'x7')).toBe('/transactions/x7')
  })

  it('url-encodes ids and rejects unknown types / empty ids', () => {
    expect(resolveRecordRoute('deal', 'a/b')).toBe('/production/a%2Fb')
    expect(resolveRecordRoute('nope', '1')).toBeNull()
    expect(resolveRecordRoute('deal', '')).toBeNull()
    expect(resolveRecordRoute('deal', null)).toBeNull()
  })
})

describe('rowRoute precedence', () => {
  it('prefers an explicit route override', () => {
    expect(rowRoute({ route: '/custom', type: 'deal', id: '1' })).toBe('/custom')
  })
  it('falls back to the row type, then the related record', () => {
    expect(rowRoute({ type: 'deal', id: '1' })).toBe('/production/1')
    expect(rowRoute({ type: 'mystery', id: '1', related: { type: 'contact', id: '9' } }))
      .toBe('/contacts/9/detail')
    expect(rowRoute({ type: 'mystery', id: '1' })).toBeNull()
    expect(rowRoute(null)).toBeNull()
  })
})
