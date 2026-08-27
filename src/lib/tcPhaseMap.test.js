import { describe, it, expect } from 'vitest'
import {
  dealStageToListingStatusCode,
  dealStageToTcPhaseCode,
  phaseToDealStageCode,
  phaseToListingStatusCode,
  phaseToStage,
  phaseToStatus,
  stageToListingStatus,
} from './tcPhaseMap.js'

describe('tcPhaseMap', () => {
  it('maps every tc_phase to a stage', () => {
    expect(phaseToDealStageCode).toEqual({
      pre_listing:    'negotiations',
      active:         'negotiations',
      offer:          'offer_accepted',
      under_contract: 'under_contract',
      closed:         'closed',
    })
  })

  it('maps every tc_phase to a listing status', () => {
    expect(phaseToListingStatusCode).toEqual({
      pre_listing:    'coming_soon',
      active:         'active',
      offer:          'under_contract',
      under_contract: 'under_contract',
      closed:         'sold',
    })
  })

  it('accepts the historical typo without making it a machine identity', () => {
    expect(phaseToDealStageCode.offer).toBe('offer_accepted')
    expect(phaseToStage.offer).toBe('Offer Accepted')
    expect(phaseToStatus.closed).toBe('Sold')
    expect(stageToListingStatus['Offer Accapted']).toBe('Accepted offer')
    expect(dealStageToListingStatusCode.offer_accepted).toBe('offer_accepted')
    expect(dealStageToTcPhaseCode.offer_accepted).toBe('offer')
  })
})
