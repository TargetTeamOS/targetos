// ═══════════════════════════════════════════════════════════════
// TC Board — phase → stage/status mapping
// Extracted from TransactionCoordinator.jsx (July 2026) so this
// mapping has one canonical source and is covered by a unit test.
//
// IMPORTANT: 'Offer Accapted' is an INTENTIONAL spelling, not a typo.
// It's the canonical stage value used across automationDispatcher.js,
// Production.jsx, Dashboard.jsx, Segments.jsx, Contacts.jsx, and
// Reports.jsx. Do NOT "fix" this spelling — see tcPhaseMap.test.js,
// which pins this value on purpose.
// ═══════════════════════════════════════════════════════════════

export const phaseToStage = {
  pre_listing:    'Negotiations',
  active:         'Negotiations',
  offer:          'Offer Accapted',
  under_contract: 'Under Contract',
  closed:         'Closed',
}

export const phaseToStatus = {
  pre_listing:    'Coming Soon',
  active:         'Active',
  offer:          'Under Contract',
  under_contract: 'Under Contract',
  closed:         'Sold',
}
