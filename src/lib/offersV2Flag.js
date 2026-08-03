// ── Offers V2 beta gate ─────────────────────────────────────────────
// Reuses the EXISTING feature_flags table and Admin -> Features UI
// (sql/feature_flags.sql) -- not a second flag system. Deliberately
// does NOT reuse src/lib/features.js's flagAllows()/useFeature(),
// because that system is intentionally fail-OPEN ("missing row = ON")
// and gives every admin an automatic bypass regardless of the flag's
// own enabled/allowlist state. Both of those defaults are correct for
// ordinary feature flags (a flag's whole job there is to let admins
// turn OFF a shipped feature if something breaks) but are exactly
// backwards for a genuinely unfinished, security-relevant beta: the
// requirement here is "off by default" and "only APPROVED admins,
// not every admin automatically." A dedicated, narrower evaluator is
// the correct tool, not a misuse of the shared one.
import { useState, useEffect } from 'react'
import { loadFlags } from './features'

export const OFFERS_V2_FLAG_KEY = 'offers_v2_beta'

/**
 * @param {object} agent - the signed-in agent row (or null)
 * @param {Map} flags - the feature_flags cache from loadFlags()
 * @returns {boolean}
 */
export function offersV2Allowed(agent, flags) {
  const row = flags?.get(OFFERS_V2_FLAG_KEY)

  // No row at all = the flag has never been created in this
  // environment. Fails CLOSED here (unlike the general flag system),
  // because the alternative is silently shipping an unfinished,
  // permission-sensitive experience to every agent the moment this
  // code deploys, before anyone has had a chance to configure the flag.
  if (!row) return false
  if (row.enabled === false) return false

  // Explicit per-agent allowlist -- this is the "approved user-specific
  // override so the owner can test without enabling the feature for
  // the full office" the spec requires. No automatic admin bypass:
  // an admin not on the list does not see Offers V2, on purpose.
  if (Array.isArray(row.allowed_agent_ids) && row.allowed_agent_ids.length > 0) {
    return !!agent?.id && row.allowed_agent_ids.includes(agent.id)
  }

  // enabled === true with no allowlist = full rollout to everyone --
  // the intended end state once the beta is over, reusing the same
  // row/column the office already knows how to manage.
  return row.enabled === true
}

export function useOffersV2Beta(agent) {
  const [on, setOn] = useState(false) // fail closed while loading, not fail open
  useEffect(() => {
    let alive = true
    loadFlags().then(flags => { if (alive) setOn(offersV2Allowed(agent, flags)) })
    return () => { alive = false }
  }, [agent?.id])
  return on
}
