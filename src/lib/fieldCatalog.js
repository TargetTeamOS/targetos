// ═══════════════════════════════════════════════════════════════
// Field Catalog — Phase 1/2 of UNIVERSAL_FIELD_SYSTEM_PROPOSAL.md
//
// One place that lists EVERY field on a board -- the handful of
// built-in ones (hardcoded once, here, per entity) plus whatever
// custom fields an admin has added via the Custom Fields page
// (src/lib/customFields.js) -- in one shared shape. This is what
// lets Segments (and, in a later phase, Dashboard/Reports) offer a
// new custom field as a filter option automatically, the moment it's
// created, without a developer adding code for that specific field.
//
// Catalog entry shape (same shape Segments.jsx's old hardcoded
// SEGMENT_CONDITIONS array already used, so nothing downstream had
// to change):
//   {
//     key:     string,                          // stable field key
//     label:   string,                           // shown in the UI
//     type:    'select' | 'bool' | 'number' | 'text',
//     options: [{value,label}] | undefined,       // for type='select'
//     suffix:  string | undefined,                 // e.g. 'days'
//     source:  'built_in' | 'custom',
//     custom:  boolean,                    // true => lives in custom_data
//   }
//
// Adding a new BOARD to this system later means: add one entry to
// BUILT_IN_FIELDS below (a one-time cost for that board) and register
// it with getFieldsForEntity's ENTITY_LABELS in customFields.js --
// nothing else in this file changes, and no per-FIELD code is ever
// needed again on that board once it's registered.
// ═══════════════════════════════════════════════════════════════
import { getFieldsForEntity } from './customFields'
import { CONTACT_STATUSES, CONTACT_SOURCES, CONTACT_TYPES } from './constants'

// ── Built-in fields, per entity ───────────────────────────────────
// Contacts' list is exactly what Segments.jsx hardcoded before this
// catalog existed -- moved here so it's the one shared source instead
// of a copy baked into that page.
export const BUILT_IN_FIELDS = {
  contacts: [
    { key:'status',   label:'Status is',    type:'select', options: CONTACT_STATUSES },
    { key:'source',   label:'Source is',    type:'select', options: (CONTACT_SOURCES||[]).map(s=>({value:s,label:s})) },
    { key:'type',     label:'Type is',      type:'select', options: CONTACT_TYPES.map(v=>({value:v,label:v})) },
    { key:'no_activity_days', label:'No activity for', type:'number', suffix:'days' },
    { key:'created_days',     label:'Added in last',   type:'number', suffix:'days' },
    { key:'has_phone',        label:'Has phone',       type:'bool' },
    { key:'has_email',        label:'Has email',       type:'bool' },
    { key:'assigned',         label:'Has assigned agent', type:'bool' },
    { key:'tags_contains',    label:'Tag contains',    type:'text' },
  ].map(f => ({ ...f, source:'built_in', custom:false })),
}

// ── Custom-field type → catalog condition type ────────────────────
// customFields.js's FIELD_TYPES (text/number/date/select/checkbox/
// textarea/url/phone/email/currency) collapse onto the same small set
// of condition types the filter UI already knows how to render.
// NOTE (documented limitation, not a bug): every custom-field
// condition is an EXACT match today, including 'date' and 'number' --
// there's no before/after or greater/less-than yet for custom fields.
// The built-ins' own no_activity_days/created_days already show what
// a proper range condition looks like; extending that to arbitrary
// custom date/number fields is real follow-up work, not done here.
function customTypeToConditionType(t) {
  switch (t) {
    case 'select':   return 'select'
    case 'checkbox': return 'bool'
    case 'number':
    case 'currency': return 'number'
    default:         return 'text' // text, textarea, url, phone, email, date
  }
}

// ── THE CATALOG: built-in fields + this entity's custom fields ────
export async function getFieldCatalog(entity) {
  const builtIn = BUILT_IN_FIELDS[entity] || []
  let custom = []
  try {
    const defs = await getFieldsForEntity(entity)
    custom = (defs || []).map(f => ({
      key:     f.key,
      label:   f.label + (customTypeToConditionType(f.type) === 'select' ? ' is' : ''),
      type:    customTypeToConditionType(f.type),
      options: f.options,
      source:  'custom',
      custom:  true,
    }))
  } catch (e) {
    console.warn('getFieldCatalog(' + entity + '): custom fields unavailable:', e.message)
  }
  return [...builtIn, ...custom]
}
