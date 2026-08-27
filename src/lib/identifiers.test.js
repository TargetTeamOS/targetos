import { describe, expect, it } from 'vitest'
import catalog from '../../shared/identifierCatalog.json'
import {
  buildIdentifierIndex,
  displayWorkflowState,
  legacyWorkflowValue,
  resolveWorkflowStateCode,
  workflowStateHasFlag,
  workflowStateMatches,
} from './identifiers'

describe('stable identifier catalog', () => {
  it('resolves current and legacy spellings to one immutable code', () => {
    expect(resolveWorkflowStateCode('deal.lifecycle', 'Offer Accapted')).toBe('offer_accepted')
    expect(resolveWorkflowStateCode('deal.lifecycle', 'Offer Accepted')).toBe('offer_accepted')
    expect(workflowStateMatches('task.lifecycle', 'completed', 'done')).toBe(true)
    expect(workflowStateMatches('task.lifecycle', 'canceled', 'cancelled')).toBe(true)
  })

  it('uses semantic flags instead of labels for business totals', () => {
    expect(workflowStateHasFlag('deal.lifecycle', 'Closed', 'countsAsWon')).toBe(true)
    expect(workflowStateHasFlag('deal.lifecycle', 'Under Contract', 'countsAsActive')).toBe(true)
    expect(workflowStateHasFlag('deal.lifecycle', 'Deal Fell Through', 'countsAsWon')).toBe(false)
  })

  it('keeps behavior stable when labels are renamed', () => {
    const renamed = structuredClone(catalog)
    renamed.workflows.find(item => item.code === 'deal.lifecycle')
      .states.find(item => item.code === 'closed').label = 'Completed Sale'
    const renamedIndex = buildIdentifierIndex(renamed)

    expect(resolveWorkflowStateCode('deal.lifecycle', 'Closed', renamedIndex)).toBe('closed')
    expect(workflowStateHasFlag('deal.lifecycle', 'Closed', 'countsAsWon', renamedIndex)).toBe(true)
    expect(displayWorkflowState('deal.lifecycle', 'closed', renamedIndex)).toBe('Completed Sale')
    expect(legacyWorkflowValue('deal.lifecycle', 'closed', renamedIndex)).toBe('Closed')
  })

  it('rejects ambiguous aliases instead of guessing', () => {
    const invalid = structuredClone(catalog)
    invalid.workflows.find(item => item.code === 'deal.lifecycle').states[1].legacyValues.push('Closed')
    expect(() => buildIdentifierIndex(invalid)).toThrow(/Ambiguous identifier alias/)
  })
})
