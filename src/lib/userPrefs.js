// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — User Preferences Library
// Per-agent preferences: saved filters, column visibility,
// default sorts, notification settings, saved views.
// Stored in Supabase so they persist across devices.
// Falls back to localStorage gracefully if Supabase is unavailable.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { lsGet, lsSet } from './utils'

// ── DEFAULTS ──────────────────────────────────────────────────────
export const PREF_DEFAULTS = {
  // Per-page column visibility (key = column key, value = bool)
  columns: {
    contacts:    { phone:true, email:true, source:true, status:true, agent:true, stage:true, created:false, city:false },
    listings:    { addr:true, price:true, status:true, agent:true, city:true, type:true, beds:false, baths:false, dom:false },
    tasks:       { title:true, priority:true, status:true, due:true, agent:true, contact:true, notes:false },
    calls:       { from:true, to:true, direction:true, status:true, duration:true, agent:true, recording:true, date:true },
    production:  { addr:true, agent:true, side:true, stage:true, production:true, gci:true, ao_date:true, close_date:true, client:false },
  },
  // Default sort per page
  sorts: {
    contacts:   { key:'created_at', dir:'desc' },
    listings:   { key:'created_at', dir:'desc' },
    tasks:      { key:'due_date',   dir:'asc'  },
    calls:      { key:'called_at',  dir:'desc' },
    production: { key:'ao_date',    dir:'desc' },
  },
  // Saved filter presets (array of { id, name, filters })
  savedFilters: {
    contacts:   [],
    listings:   [],
    tasks:      [],
    calls:      [],
    production: [],
  },
  // Notification preferences
  notifications: {
    newLead:           true,
    taskDue:           true,
    taskOverdue:       true,
    dealStageChange:   true,
    newAnnouncement:   true,
    callMissed:        false,
    voicemail:         true,
    dailyBriefing:     true,
    emailOnNewLead:    false,
    emailOnTaskDue:    false,
  },
  // Layout preferences
  layout: {
    contactsView:   'table',    // 'table' | 'cards'
    listingsView:   'grid',     // 'grid' | 'table'
    tasksView:      'list',     // 'list' | 'kanban' | 'calendar'
    sidebarPinned:  true,
    tableRowHeight: 'normal',   // 'compact' | 'normal' | 'spacious'
    dateFormat:     'MM/DD/YYYY',
    timeFormat:     '12h',
  },
}

const LS_KEY = 'tos_prefs_v2'

// ── LOAD ─────────────────────────────────────────────────────────
export async function loadPrefs(agentId) {
  // Try localStorage first (instant, avoids flash)
  let local = null
  try {
    const raw = lsGet(LS_KEY + '_' + agentId, null)
    if (raw) local = JSON.parse(raw)
  } catch {}

  // Deep-merge with defaults so new preference keys always have a value
  const merged = deepMerge(PREF_DEFAULTS, local || {})

  // Sync from Supabase in background
  if (agentId) {
    try {
      const { data } = await supabase
        .from('briefing_prefs')
        .select('user_prefs')
        .eq('agent_id', agentId)
        .maybeSingle()

      if (data?.user_prefs) {
        const synced = deepMerge(PREF_DEFAULTS, data.user_prefs)
        // Save back to localStorage for next load
        lsSet(LS_KEY + '_' + agentId, JSON.stringify(synced))
        return synced
      }
    } catch {}
  }

  return merged
}

// ── SAVE ─────────────────────────────────────────────────────────
export async function savePrefs(agentId, prefs) {
  // Always save to localStorage first (sync, instant)
  try { lsSet(LS_KEY + '_' + agentId, JSON.stringify(prefs)) } catch {}

  // Sync to Supabase
  if (!agentId) return
  try {
    const { data: existing } = await supabase
      .from('briefing_prefs').select('agent_id').eq('agent_id', agentId).maybeSingle()
    if (existing) {
      await supabase.from('briefing_prefs').update({ user_prefs: prefs, updated_at: new Date().toISOString() }).eq('agent_id', agentId)
    } else {
      await supabase.from('briefing_prefs').insert({ agent_id: agentId, user_prefs: prefs, updated_at: new Date().toISOString() })
    }
  } catch(e) {
    console.warn('[userPrefs] Supabase sync failed:', e.message)
  }
}

// ── PATCH HELPER ─────────────────────────────────────────────────
// Saves a single nested key without replacing other prefs
export async function patchPref(agentId, path, value, currentPrefs) {
  const updated = deepSet({ ...currentPrefs }, path, value)
  await savePrefs(agentId, updated)
  return updated
}

// ── SQL MIGRATION NOTE ────────────────────────────────────────────
// Add to briefing_prefs table:
//   alter table briefing_prefs add column if not exists user_prefs jsonb;
//
// This column stores the entire user_prefs object per agent.

// ── UTILS ─────────────────────────────────────────────────────────
function deepMerge(defaults, overrides) {
  const result = { ...defaults }
  for (const key of Object.keys(overrides || {})) {
    if (overrides[key] !== null && typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) &&
        defaults[key] !== null && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])) {
      result[key] = deepMerge(defaults[key], overrides[key])
    } else {
      result[key] = overrides[key]
    }
  }
  return result
}

function deepSet(obj, path, value) {
  const parts = Array.isArray(path) ? path : path.split('.')
  if (parts.length === 1) return { ...obj, [parts[0]]: value }
  return { ...obj, [parts[0]]: deepSet(obj[parts[0]] || {}, parts.slice(1), value) }
}
