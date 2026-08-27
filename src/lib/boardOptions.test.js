import { describe, expect, it } from 'vitest'
import { BOARD_OPTIONS, boardStatusCode, boardStatusFilterValues, boardStatusLabels } from './boardOptions'

describe('saved board identifier filters', () => {
  const deals = BOARD_OPTIONS.find(board => board.id === 'deals')

  it('persists and displays stable deal-stage codes', () => {
    expect(boardStatusCode(deals, 'Offer Accapted')).toBe('offer_accepted')
    expect(boardStatusLabels(deals, ['offer_accepted'])).toEqual(['Offer Accepted'])
  })

  it('expands stable codes to all compatible database aliases', () => {
    const values = boardStatusFilterValues(deals, ['offer_accepted'])
    expect(values).toContain('Offer Accapted')
    expect(values).toContain('Offer Accepted')
  })

  it('keeps old saved label filters compatible', () => {
    expect(boardStatusFilterValues(deals, ['Closed'])).toContain('Closed')
  })
})
