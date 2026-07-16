// ═══════════════════════════════════════════════════════════════
// Feature Flags (July 2026)
// Admin-controlled kill switches + per-agent access, managed in
// Admin → Features. DESIGN RULE: FAIL OPEN — if the table doesn't
// exist, the network fails, or a feature has no row, everything
// behaves exactly as it did before flags existed. Flags can turn
// things OFF; their absence can never break the CRM.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

let _cache = null            // Map(key -> row)
let _fetchedAt = 0
const TTL = 60 * 1000        // re-read at most once a minute
let _inflight = null

export async function loadFlags(force = false) {
  if (!force && _cache && Date.now() - _fetchedAt < TTL) return _cache
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      const { data, error } = await supabase.from('feature_flags').select('*')
      if (error) throw error
      _cache = new Map((data || []).map(r => [r.key, r]))
      _fetchedAt = Date.now()
    } catch (e) {
      // Fail open: no table / no network → empty map → everything ON
      if (!_cache) _cache = new Map()
      _fetchedAt = Date.now()
      console.warn('[flags] load failed (failing open):', e.message)
    } finally { _inflight = null }
    return _cache
  })()
  return _inflight
}

// Synchronous check against whatever is cached. Missing row = ON.
export function flagAllows(key, agent) {
  const row = _cache?.get(key)
  if (!row) return true                       // no row → feature ships as built
  if (agent?.role === 'admin') return true    // admins always see everything
  if (!row.enabled) return false
  if (Array.isArray(row.allowed_agent_ids) && row.allowed_agent_ids.length > 0) {
    return !!agent?.id && row.allowed_agent_ids.includes(agent.id)
  }
  return true                                  // enabled + no allowlist = everyone
}

// React hook: true/false, re-evaluates after flags load. Defaults to
// true (fail open) so first paint never hides existing features.
export function useFeature(key, agent) {
  const [on, setOn] = useState(() => flagAllows(key, agent))
  useEffect(() => {
    let alive = true
    loadFlags().then(() => { if (alive) setOn(flagAllows(key, agent)) })
    return () => { alive = false }
  }, [key, agent?.id, agent?.role])
  return on
}

export function invalidateFlags() { _cache = null; _fetchedAt = 0 }
