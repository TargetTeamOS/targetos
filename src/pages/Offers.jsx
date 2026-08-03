import React from 'react'
import { useAuth } from '../context/AuthContext'
import { useOffersV2Beta } from '../lib/offersV2Flag'
import { OffersLegacy } from './OffersLegacy'
import { OffersV2 } from './OffersV2'

/**
 * Selects the old or new Offers implementation at the same /offers and
 * /offers/:id routes, based on the offers_v2_beta feature flag —
 * reuses the existing feature_flags table/Admin UI (sql/feature_flags.sql),
 * not a second flag system. See src/lib/offersV2Flag.js for why this
 * flag's evaluation deliberately does NOT reuse the general
 * flagAllows()/useFeature() fail-open-and-admin-bypass semantics: an
 * unfinished, security-relevant experience needs to default OFF and
 * needs the owner to be able to test without exposing it to every
 * admin account, not just every agent.
 */
export function Offers() {
  const { agent } = useAuth()
  const v2Enabled = useOffersV2Beta(agent)
  return v2Enabled ? <OffersV2 /> : <OffersLegacy />
}
