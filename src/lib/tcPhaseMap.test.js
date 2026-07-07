import { describe, it, expect } from 'vitest'
import { phaseToStage, phaseToStatus } from './tcPhaseMap.js'

describe('tcPhaseMap', () => {
  it('maps every tc_phase to a stage', () => {
    expect(phaseToStage).toEqual({
      pre_listing:    'Negotiations',
      active:         'Negotiations',
      offer:          'Offer Accapted', // intentional spelling — see file header
      under_contract: 'Under Contract',
      closed:         'Closed',
    })
  })

  it('maps every tc_phase to a listing status', () => {
    expect(phaseToStatus).toEqual({
      pre_listing:    'Coming Soon',
      active:         'Active',
      offer:          'Under Contract',
      under_contract: 'Under Contract',
      closed:         'Sold',
    })
  })

  // This test exists ONLY to catch a well-intentioned but breaking "typo fix."
  // 'Offer Accapted' is the real, canonical value used across
  // automationDispatcher.js, Production.jsx, Dashboard.jsx, Segments.jsx,
  // Contacts.jsx, and Reports.jsx for stage matching. If this test fails
  // because someone corrected the spelling to "Accepted," DO NOT just
  // update this test to match — go fix it in all six files listed above,
  // in the same commit, or the TC Board will silently stop syncing deals
  // into the stage the rest of the app expects.
  it('pins the intentional "Offer Accapted" spelling used app-wide', () => {
    expect(phaseToStage.offer).toBe('Offer Accapted')
  })
})
