// TargetOS V2 — Custom Fields System
// Admins define extra fields per entity (contacts, deals, listings).
// Fields are stored in system_settings table as JSON.
// Values are stored in a jsonb column (custom_data) on each entity row.
//
// SQL required:
//   alter table contacts  add column if not exists custom_data jsonb default '{}';
//   alter table deals     add column if not exists custom_data jsonb default '{}';
//   alter table listings  add column if not exists custom_data jsonb default '{}';
//
// Field definition shape:
// {
//   id:       string (uuid),
//   entity:   'contacts' | 'deals' | 'listings',
//   label:    string,
//   key:      string (snake_case, used as the jsonb key),
//   type:     'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'url' | 'phone' | 'email',
//   options:  string[] (for type=select),
//   required: boolean,
//   section:  string (groups fields in the UI, e.g. 'Buyer Info'),
//   order:    number,
//   active:   boolean,
// }

import { supabase } from './supabase'

const SETTINGS_KEY = 'custom_field_definitions'
let _cache = null
let _cacheTime = 0

// ── LOAD ALL FIELD DEFINITIONS ────────────────────────────────────
export async function loadFieldDefs() {
  // Cache for 60 seconds
  if (_cache && Date.now() - _cacheTime < 60000) return _cache
  try {
    const { data } = await supabase
      .from('system_settings').select('value')
      .eq('key', SETTINGS_KEY).maybeSingle()
    _cache = data?.value || []
    _cacheTime = Date.now()
    return _cache
  } catch(e) {
    console.warn('loadFieldDefs:', e.message)
    return []
  }
}

// ── SAVE ALL FIELD DEFINITIONS ────────────────────────────────────
export async function saveFieldDefs(defs) {
  _cache = defs
  _cacheTime = Date.now()
  try {
    const { data: existing } = await supabase
      .from('system_settings').select('id').eq('key', SETTINGS_KEY).maybeSingle()
    if (existing) {
      await supabase.from('system_settings')
        .update({ value: defs, updated_at: new Date().toISOString() })
        .eq('key', SETTINGS_KEY)
    } else {
      await supabase.from('system_settings')
        .insert({ key: SETTINGS_KEY, value: defs, created_at: new Date().toISOString() })
    }
  } catch(e) {
    console.warn('saveFieldDefs:', e.message)
    throw e
  }
}

// ── GET FIELDS FOR A SPECIFIC ENTITY ─────────────────────────────
export async function getFieldsForEntity(entity) {
  const all = await loadFieldDefs()
  return (all || [])
    .filter(f => f.entity === entity && f.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
}

// ── INVALIDATE CACHE ──────────────────────────────────────────────
export function invalidateFieldCache() {
  _cache = null
  _cacheTime = 0
}

// ── GENERATE A SLUG KEY FROM LABEL ───────────────────────────────
export function labelToKey(label) {
  return label.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40)
}

// ── FIELD TYPE LABELS ─────────────────────────────────────────────
export const FIELD_TYPES = [
  { value: 'text',     label: 'Text',        icon: '📝' },
  { value: 'number',   label: 'Number',       icon: '🔢' },
  { value: 'date',     label: 'Date',         icon: '📅' },
  { value: 'select',   label: 'Dropdown',     icon: '📋' },
  { value: 'checkbox', label: 'Yes / No',     icon: '☑️' },
  { value: 'textarea', label: 'Long Text',    icon: '📄' },
  { value: 'url',      label: 'Website URL',  icon: '🔗' },
  { value: 'phone',    label: 'Phone',        icon: '📞' },
  { value: 'email',    label: 'Email',        icon: '✉️' },
  { value: 'currency', label: 'Currency $',   icon: '💰' },
]

export const ENTITY_LABELS = {
  contacts: 'Contacts',
  deals:    'Deals / Production',
  listings: 'Listings',
}
