// ═══════════════════════════════════════════════════════════════
// Shared segment condition -> Supabase query filter logic.
// Used by Segments.jsx (to compute live counts) and Contacts.jsx
// (to actually apply a segment's filter when navigated to via
// /contacts?segment=X) -- extracted here so both use the exact same
// logic rather than risking drift between two copies.
// ═══════════════════════════════════════════════════════════════
export function applySegmentCondition(q, cond) {
  if (cond.key === 'status'  && cond.value) return q.eq('status', cond.value)
  if (cond.key === 'source'  && cond.value) return q.eq('source', cond.value)
  if (cond.key === 'type'    && cond.value) return q.eq('type', cond.value)
  if (cond.key === 'has_phone'   && cond.value === 'true') return q.not('phone','is',null).neq('phone','')
  if (cond.key === 'has_email'   && cond.value === 'true') return q.not('email','is',null).neq('email','')
  if (cond.key === 'assigned'    && cond.value === 'true') return q.not('agent_id','is',null)
  if (cond.key === 'created_days' && cond.value) {
    const d = new Date(); d.setDate(d.getDate() - parseInt(cond.value))
    return q.gte('created_at', d.toISOString())
  }
  if (cond.key === 'no_activity_days' && cond.value) {
    const d = new Date(); d.setDate(d.getDate() - parseInt(cond.value))
    return q.lt('updated_at', d.toISOString())
  }
  if (cond.key === 'tags_contains' && cond.value) return q.contains('tags', [cond.value])
  return q
}
