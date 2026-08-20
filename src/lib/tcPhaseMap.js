// TC Board cross-board lifecycle mapping.
//
// Machine behavior is defined exclusively with immutable codes. The exported
// legacy maps remain compatibility shims for older callers while records still
// store text; new code must use the *Code maps below and the record adapter.

import { legacyWorkflowValue } from './identifiers'

export const phaseToDealStageCode = Object.freeze({
  pre_listing:    'negotiations',
  active:         'negotiations',
  offer:          'offer_accepted',
  under_contract: 'under_contract',
  closed:         'closed',
})

export const phaseToListingStatusCode = Object.freeze({
  pre_listing:    'coming_soon',
  active:         'active',
  offer:          'under_contract',
  under_contract: 'under_contract',
  closed:         'sold',
})

export const dealStageToListingStatusCode = Object.freeze({
  negotiations:   'active',
  offer_accepted: 'offer_accepted',
  under_shtar:    'under_contract',
  under_contract: 'under_contract',
  closed:         'sold',
  fell_through:   'active',
})

export const dealStageToTcPhaseCode = Object.freeze({
  negotiations:   'active',
  offer_accepted: 'offer',
  under_shtar:    'under_contract',
  under_contract: 'under_contract',
  closed:         'closed',
  fell_through:   'active',
})

// Deprecated compatibility exports. They derive storage text from stable codes
// instead of defining behavior with editable labels.
export const phaseToStage = Object.freeze(Object.fromEntries(
  Object.entries(phaseToDealStageCode).map(([phase, code]) => [phase, legacyWorkflowValue('deal.lifecycle', code)])
))

export const phaseToStatus = Object.freeze(Object.fromEntries(
  Object.entries(phaseToListingStatusCode).map(([phase, code]) => [phase, legacyWorkflowValue('listing.lifecycle', code)])
))

export const stageToListingStatus = Object.freeze({
  Negotiations: legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.negotiations),
  'Offer Accapted': legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.offer_accepted),
  'Offer Accepted': legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.offer_accepted),
  'Under Shtar': legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.under_shtar),
  'Under Contract': legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.under_contract),
  Closed: legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.closed),
  'Deal Fell Through': legacyWorkflowValue('listing.lifecycle', dealStageToListingStatusCode.fell_through),
})

export const stageToTcPhase = Object.freeze({
  Negotiations: dealStageToTcPhaseCode.negotiations,
  'Offer Accapted': dealStageToTcPhaseCode.offer_accepted,
  'Offer Accepted': dealStageToTcPhaseCode.offer_accepted,
  'Under Shtar': dealStageToTcPhaseCode.under_shtar,
  'Under Contract': dealStageToTcPhaseCode.under_contract,
  Closed: dealStageToTcPhaseCode.closed,
  'Deal Fell Through': dealStageToTcPhaseCode.fell_through,
})
