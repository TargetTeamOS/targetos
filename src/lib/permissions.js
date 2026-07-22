// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Permissions System
// Defines what each role can do across every feature area.
// Used by pages to conditionally show/hide/lock UI elements.
// Admin can override any permission in the Admin → Permissions tab.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { lsGet, lsSet } from './utils'

// ── DEFAULT PERMISSIONS BY ROLE ───────────────────────────────────
// These are the defaults. Admins can override them in Admin → Permissions.
// format: { featureKey: { admin, secretary, agent } }
export const DEFAULT_PERMISSIONS = {
  // --- Contacts ---
  'contacts.view':          { admin:true,  secretary:true,  agent:true  },
  'contacts.view_all':      { admin:true,  secretary:true,  agent:false }, // see other agents' contacts
  'contacts.create':        { admin:true,  secretary:true,  agent:true  },
  'contacts.edit':          { admin:true,  secretary:true,  agent:true  },
  'contacts.delete':        { admin:true,  secretary:false, agent:false },
  'contacts.export':        { admin:true,  secretary:true,  agent:false },
  'contacts.import':        { admin:true,  secretary:true,  agent:false },
  'contacts.reassign':      { admin:true,  secretary:true,  agent:false },

  // --- Deals / Production ---
  'deals.view':             { admin:true,  secretary:true,  agent:true  },
  'deals.view_all':         { admin:true,  secretary:true,  agent:true  },
  'deals.create':           { admin:true,  secretary:true,  agent:true  },
  'deals.edit':             { admin:true,  secretary:true,  agent:true  },
  'deals.delete':           { admin:true,  secretary:false, agent:false },
  'deals.export':           { admin:true,  secretary:true,  agent:false },
  'deals.import':           { admin:true,  secretary:true,  agent:false },
  'deals.view_gci':         { admin:true,  secretary:true,  agent:true  },
  'deals.view_team_gci':    { admin:true,  secretary:true,  agent:false },

  // --- Listings ---
  'listings.view':          { admin:true,  secretary:true,  agent:true  },
  'listings.view_all':      { admin:true,  secretary:true,  agent:true  },
  'listings.create':        { admin:true,  secretary:true,  agent:true  },
  'listings.edit':          { admin:true,  secretary:true,  agent:true  },
  'listings.delete':        { admin:true,  secretary:false, agent:false },

  // --- Tasks ---
  'tasks.view':             { admin:true,  secretary:true,  agent:true  },
  'tasks.view_all':         { admin:true,  secretary:true,  agent:false },
  'tasks.create':           { admin:true,  secretary:true,  agent:true  },
  'tasks.edit_own':         { admin:true,  secretary:true,  agent:true  },
  'tasks.edit_any':         { admin:true,  secretary:true,  agent:false },
  'tasks.delete':           { admin:true,  secretary:true,  agent:false },

  // --- Calls ---
  'calls.view':             { admin:true,  secretary:true,  agent:true  },
  'calls.view_all':         { admin:true,  secretary:true,  agent:false },
  'calls.make':             { admin:true,  secretary:true,  agent:true  },
  'calls.recordings':       { admin:true,  secretary:true,  agent:false }, // hear others' recordings
  'calls.own_recordings':   { admin:true,  secretary:true,  agent:true  },
  'calls.flow_edit':        { admin:true,  secretary:false, agent:false },

  // --- Reports ---
  'reports.view':           { admin:true,  secretary:true,  agent:false },
  'reports.export':         { admin:true,  secretary:true,  agent:false },
  'reports.agent_stats':    { admin:true,  secretary:true,  agent:false }, // see other agents' stats

  // --- Admin ---
  'admin.users':            { admin:true,  secretary:false, agent:false },
  'admin.customize':        { admin:true,  secretary:false, agent:false },
  'admin.permissions':      { admin:true,  secretary:false, agent:false },
  'admin.system':           { admin:true,  secretary:false, agent:false },
  'admin.automations':      { admin:true,  secretary:false, agent:false },
  'admin.audit_log':        { admin:true,  secretary:false, agent:false },
  'records.activity_log':   { admin:true,  secretary:true,  agent:true  },
  'admin.data_export':      { admin:true,  secretary:false, agent:false },

  // --- Settings ---
  'settings.profile':       { admin:true,  secretary:true,  agent:true  },
  'settings.notifications': { admin:true,  secretary:true,  agent:true  },
  'settings.branding':      { admin:true,  secretary:false, agent:false },
}

// ── PERMISSION GROUP LABELS ───────────────────────────────────────
export const PERMISSION_GROUPS = [
  { id:'contacts',    label:'Contacts',         icon:'👤', keys:['contacts.view','contacts.view_all','contacts.create','contacts.edit','contacts.delete','contacts.export','contacts.import','contacts.reassign'] },
  { id:'deals',       label:'Deals & Production',icon:'🏠', keys:['deals.view','deals.view_all','deals.create','deals.edit','deals.delete','deals.export','deals.import','deals.view_gci','deals.view_team_gci'] },
  { id:'listings',    label:'Listings',          icon:'🏡', keys:['listings.view','listings.view_all','listings.create','listings.edit','listings.delete'] },
  { id:'tasks',       label:'Tasks',             icon:'✅', keys:['tasks.view','tasks.view_all','tasks.create','tasks.edit_own','tasks.edit_any','tasks.delete'] },
  { id:'calls',       label:'Phone & Calls',     icon:'📞', keys:['calls.view','calls.view_all','calls.make','calls.recordings','calls.own_recordings','calls.flow_edit'] },
  { id:'reports',     label:'Reports & Analytics',icon:'📊',keys:['reports.view','reports.export','reports.agent_stats'] },
  { id:'admin',       label:'Administration',    icon:'⚙️', keys:['admin.users','admin.customize','admin.permissions','admin.system','admin.automations','admin.audit_log','records.activity_log','admin.data_export'] },
  { id:'settings',    label:'Settings',          icon:'🔧', keys:['settings.profile','settings.notifications','settings.branding'] },
]

// ── PERMISSION LABELS ──────────────────────────────────────────────
export const PERMISSION_LABELS = {
  'contacts.view':          'View contacts',
  'contacts.view_all':      'View all agents\' contacts',
  'contacts.create':        'Create new contacts',
  'contacts.edit':          'Edit contacts',
  'contacts.delete':        'Delete contacts',
  'contacts.export':        'Export contact data',
  'contacts.import':        'Import contacts from CSV/Excel',
  'contacts.reassign':      'Reassign contacts to another agent',
  'deals.view':             'View deals',
  'deals.view_all':         'View all agents\' deals',
  'deals.create':           'Create new deals',
  'deals.edit':             'Edit deals',
  'deals.delete':           'Delete deals',
  'deals.export':           'Export deal data',
  'deals.import':           'Import deals from CSV/Excel',
  'deals.view_gci':         'View GCI amounts',
  'deals.view_team_gci':    'View team-wide GCI totals',
  'listings.view':          'View listings',
  'listings.view_all':      'View all agents\' listings',
  'listings.create':        'Create new listings',
  'listings.edit':          'Edit listings',
  'listings.delete':        'Delete listings',
  'tasks.view':             'View tasks',
  'tasks.view_all':         'View all agents\' tasks',
  'tasks.create':           'Create tasks',
  'tasks.edit_own':         'Edit own tasks',
  'tasks.edit_any':         'Edit any agent\'s tasks',
  'tasks.delete':           'Delete tasks',
  'calls.view':             'View call history',
  'calls.view_all':         'View all agents\' calls',
  'calls.make':             'Make outbound calls',
  'calls.recordings':       'Listen to any agent\'s recordings',
  'calls.own_recordings':   'Listen to own call recordings',
  'calls.flow_edit':        'Edit the IVR call flow',
  'reports.view':           'View reports and analytics',
  'reports.export':         'Export reports',
  'reports.agent_stats':    'View per-agent performance stats',
  'admin.users':            'Manage users',
  'admin.customize':        'Customize branding and appearance',
  'admin.permissions':      'Edit permissions',
  'admin.system':           'View system status',
  'admin.automations':      'Manage automations',
  'admin.audit_log':        'View audit log',
  'records.activity_log':   'See per-record activity log (who changed what)',
  'admin.data_export':      'Export all system data',
  'settings.profile':       'Edit own profile',
  'settings.notifications': 'Edit notification preferences',
  'settings.branding':      'Edit org branding',
}

// ── LOAD OVERRIDES FROM DB ────────────────────────────────────────
let _cachedOverrides = null
let _cacheTime = 0

export async function loadPermissionOverrides() {
  // Cache for 5 minutes
  if (_cachedOverrides && Date.now() - _cacheTime < 300000) return _cachedOverrides
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'permission_overrides').maybeSingle()
    _cachedOverrides = data?.value || {}
    _cacheTime = Date.now()
    return _cachedOverrides
  } catch {
    return {}
  }
}

export async function savePermissionOverrides(overrides) {
  _cachedOverrides = overrides
  _cacheTime = Date.now()
  try {
    const { data: existing } = await supabase.from('system_settings').select('id').eq('key', 'permission_overrides').maybeSingle()
    if (existing) {
      await supabase.from('system_settings').update({ value: overrides, updated_at: new Date().toISOString() }).eq('key', 'permission_overrides')
    } else {
      await supabase.from('system_settings').insert({ key: 'permission_overrides', value: overrides, created_at: new Date().toISOString() })
    }
  } catch(e) {
    console.warn('[permissions] Save failed:', e.message)
    throw e
  }
}

// ── HOOK: usePermission ───────────────────────────────────────────
// Usage: const can = usePermission()  →  can('contacts.delete')
export function buildPermissionChecker(role, overrides = {}) {
  return function can(key) {
    // Check overrides first (admin-configured)
    const override = overrides[key]
    if (override && typeof override[role] === 'boolean') return override[role]
    // Fall back to defaults
    const def = DEFAULT_PERMISSIONS[key]
    if (!def) return false
    return def[role] ?? false
  }
}
