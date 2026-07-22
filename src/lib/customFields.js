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

// ── SELECT OPTION NORMALIZATION (backward compatible) ─────────────
// Options may be plain strings (legacy) OR { label, value, color } objects.
// normalizeOption always returns { label, value, color }.
export function normalizeOption(opt) {
  if (opt && typeof opt === 'object') {
    const value = opt.value ?? opt.label ?? ''
    return { label: opt.label ?? String(value), value, color: opt.color || null }
  }
  return { label: String(opt), value: String(opt), color: null }
}
export function normalizeOptions(options) {
  return (options || []).map(normalizeOption)
}
// Resolve a stored value's color from a field def's options (object or string).
export function optionColor(field, value) {
  if (!field || !Array.isArray(field.options)) return null
  for (const o of field.options) {
    const n = normalizeOption(o)
    if (String(n.value) === String(value)) return n.color
  }
  return null
}

// ── SHARED SIDE COLORS (cosmetic; stored in system_settings) ──────
const SIDE_COLORS_KEY = 'production_side_colors'
export const SIDE_COLOR_DEFAULTS = {
  'Listing': '#F59E0B', 'Seller': '#F59E0B', 'Buyer': '#8B5E3C',
  'Dual Listing': '#F97316', 'Dual Buyer': '#A16207', 'Dual': '#7C3AED',
  'Rental': '#0EA5E9', 'Flip': '#14B8A6', 'Referral': '#6B7280',
}
let _sideCache = null; let _sideTime = 0
export async function loadSideColors() {
  if (_sideCache && Date.now() - _sideTime < 60000) return _sideCache
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', SIDE_COLORS_KEY).maybeSingle()
    _sideCache = { ...SIDE_COLOR_DEFAULTS, ...(data?.value || {}) }
  } catch (e) { _sideCache = { ...SIDE_COLOR_DEFAULTS } }
  _sideTime = Date.now()
  return _sideCache
}
export async function saveSideColors(map) {
  // Persist ONLY the side-color row; never touch other system_settings values.
  const clean = {}
  for (const k in map) if (map[k]) clean[k] = map[k]
  _sideCache = { ...SIDE_COLOR_DEFAULTS, ...clean }; _sideTime = Date.now()
  const { data: existing } = await supabase.from('system_settings').select('id').eq('key', SIDE_COLORS_KEY).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('system_settings').update({ value: clean, updated_at: new Date().toISOString() }).eq('key', SIDE_COLORS_KEY)
    if (error) throw error
  } else {
    const { error } = await supabase.from('system_settings').insert({ key: SIDE_COLORS_KEY, value: clean, created_at: new Date().toISOString() })
    if (error) throw error
  }
  return _sideCache
}
export function invalidateSideCache() { _sideCache = null; _sideTime = 0 }

// ── COMMAND FIELD SEEDS (idempotent) ──────────────────────────────
const CMD_STATUS_KEY = 'command_documents_status'
const CMD_LINK_KEY   = 'command_profile_link'
const CMD_STATUS_OPTIONS = [
  ['Done','#00C875'], ['Waiting','#FDAB3D'], ['Sent not signed','#0086C0'],
  ['Waiting for approval','#A25DDC'], ['Doesn\u2019t Want To Sign','#E2445C'],
  ['Reminder to sign 1','#FFCB00'], ['Reminder to sign 2','#FF9D00'], ['Reminder to sign 3','#FF642E'],
  ['Sent - Waiting for lender','#00D2D2'], ['Contact Info needed','#7C3AED'],
  ['Stuck','#E2445C'], ['No command','#9AADBD'], ['Client has been notified','#0073EA'],
  ['Not Yet','#94A3B8'], ['Lazer gets the commission','#037F4C'], ['Working on it','#FDAB3D'],
].map(([label, color]) => ({ label, value: label, color }))

// Creates the two Command custom fields for `deals` if they don't already
// exist (by key). Never duplicates; never rewrites unrelated field defs.
export async function ensureCommandFields() {
  const all = (await loadFieldDefs()) || []
  const statusDef = all.find(f => f.entity === 'deals' && f.key === CMD_STATUS_KEY)
  const linkDef   = all.find(f => f.entity === 'deals' && f.key === CMD_LINK_KEY)
  if (statusDef && linkDef) return all

  const maxOrder = all.filter(f => f.entity === 'deals').reduce((m, f) => Math.max(m, f.order || 0), 0)
  // Status anchors the pair; the link always sits immediately after it,
  // even if only one of the two currently exists.
  const statusOrder = statusDef ? (statusDef.order || 0) : maxOrder + 1
  const next = [...all]
  if (!statusDef) next.push({
    id: (crypto?.randomUUID?.() || 'cf_' + Date.now() + '_s'),
    entity: 'deals', label: 'Command Documents Status', key: CMD_STATUS_KEY,
    type: 'select', options: CMD_STATUS_OPTIONS, required: false, section: 'Command',
    order: statusOrder, active: true,
  })
  if (!linkDef) next.push({
    id: (crypto?.randomUUID?.() || 'cf_' + Date.now() + '_l'),
    entity: 'deals', label: 'Command Profile Link', key: CMD_LINK_KEY,
    type: 'url', required: false, section: 'Command',
    order: statusOrder + 0.5, active: true,   // fractional keeps it right after status without renumbering others
  })
  await saveFieldDefs(next)
  return next
}
export const COMMAND_FIELD_KEYS = { status: CMD_STATUS_KEY, link: CMD_LINK_KEY }

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
