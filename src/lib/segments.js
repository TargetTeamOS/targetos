// ═══════════════════════════════════════════════════════════════
// Shared segment condition -> Supabase query filter logic.
// Used by Segments.jsx (to compute live counts) and Contacts.jsx
// (to actually apply a segment's filter when navigated to via
// /contacts?segment=X) -- extracted here so both use the exact same
// logic rather than risking drift between two copies.
//
// GENERIC CUSTOM-FIELD FALLBACK (Phase 2 of
// UNIVERSAL_FIELD_SYSTEM_PROPOSAL.md): every condition below this
// comment is exactly what shipped before -- untouched, so every
// segment saved up to now keeps behaving identically. What's new is
// the fallback at the bottom: a condition key that ISN'T one of the
// built-ins above is looked up in `customFields` (the entity's field
// definitions from src/lib/customFields.js, as returned by
// getFieldCatalog()/getFieldsForEntity() -- callers pass whatever
// they already have loaded) and, if found, filtered generically by
// TYPE rather than by a hardcoded key -- the same field-catalog idea
// this file used to be the one hardcoded exception to. This is an
// exact-match filter for every custom-field type today (no
// before/after or greater/less-than yet); see fieldCatalog.js for
// why that's a documented limitation, not a bug.
// ═══════════════════════════════════════════════════════════════
export function applySegmentCondition(q, cond, customFields = []) {
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

  // Not a built-in key -- is it a registered custom field on this
  // entity? If so, filter on its value inside the custom_data jsonb
  // column instead of a real table column. `->>` reads it out as
  // text, so this works the same way for every custom-field type.
  const field = (customFields || []).find(f => f.key === cond.key && f.custom)
  if (field && cond.value !== undefined && cond.value !== '') {
    return q.eq('custom_data->>' + field.key, cond.value)
  }
  return q
}
