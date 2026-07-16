// ═══════════════════════════════════════════════════════════════
// Contact Page Layout settings — which right-panel sections show,
// and in what order. Admin-editable in Settings → Contact Layout.
// Stored in system_settings key 'contact_layout'. Falls back to
// DEFAULT_CONTACT_PANELS (all shown, in this order) if unset.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// The canonical panel registry — id must match the render switch in
// ContactDetail's RightPanel. label/icon are for the admin editor.
export const CONTACT_PANELS = [
  { id: 'assigned',   label: 'Assigned To',        icon: '👤' },
  { id: 'showings',   label: 'Showings & Interest', icon: '🏡' },
  { id: 'voice',      label: 'Voice Recordings',   icon: '🎤' },
  { id: 'appointments', label: 'Appointments',     icon: '📅' },
  { id: 'tasks',      label: 'Tasks',              icon: '✅' },
  { id: 'deals',      label: 'Deals',              icon: '💼' },
  { id: 'calls',      label: 'Calls',              icon: '📞' },
  { id: 'gifts',      label: 'Gifts',              icon: '🎁' },
  { id: 'autoplans',  label: 'Auto Plans',         icon: '⚡' },
  { id: 'alerts',     label: 'Listing Alerts',     icon: '🏡' },
  { id: 'market',     label: 'Market Report',      icon: '📊' },
  { id: 'files',      label: 'Files',              icon: '📎' },
]

// Default: every panel visible, in registry order.
export const DEFAULT_CONTACT_LAYOUT = {
  order:  CONTACT_PANELS.map(p => p.id),
  hidden: {},   // { panelId: true }
}

let _cache = null
let _cacheAt = 0

export async function loadContactLayout(force = false) {
  if (!force && _cache && Date.now() - _cacheAt < 120000) return _cache
  let stored = {}
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'contact_layout').maybeSingle()
    stored = data?.value || {}
  } catch { /* defaults */ }
  // Merge: keep any new panels that aren't in a stored order yet (appended)
  const order = Array.isArray(stored.order) ? stored.order.slice() : DEFAULT_CONTACT_LAYOUT.order.slice()
  for (const p of CONTACT_PANELS) if (!order.includes(p.id)) order.push(p.id)
  _cache = { order, hidden: stored.hidden || {} }
  _cacheAt = Date.now()
  return _cache
}

export async function saveContactLayout(layout) {
  _cache = layout
  _cacheAt = Date.now()
  const { data: existing } = await supabase.from('system_settings').select('id').eq('key', 'contact_layout').maybeSingle()
  if (existing) {
    const { error } = await supabase.from('system_settings').update({ value: layout, updated_at: new Date().toISOString() }).eq('key', 'contact_layout')
    if (error) throw error
  } else {
    const { error } = await supabase.from('system_settings').insert({ key: 'contact_layout', value: layout, created_at: new Date().toISOString() })
    if (error) throw error
  }
}
