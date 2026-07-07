// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Dashboard Preferences
// Saves widget layout, visibility, size, and color to Supabase.
// Per-agent — each agent has their own layout saved in the DB.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// Order reflects priority when scanning top-to-bottom (July 2026 restructure):
// urgent alerts -> company info -> overview numbers -> personal goals ->
// performance visuals (full width -- charts/multi-column data need the room) ->
// actionable today-lists -> reference/browsable lists -> team leaderboard ->
// quick-action toolbar last (navigation utility, not information).
const DEFAULT_WIDGETS = [
  { id: 'overdue_alert',   col: 2, size: 'lg', color: '#DC2626',  visible: true  },
  { id: 'announcements',   col: 2, size: 'lg', color: '#F5A623',  visible: false },
  { id: 'quick_stats',     col: 2, size: 'lg', color: '#3B82F6',  visible: true  },
  { id: 'gci_goal',        col: 1, size: 'md', color: '#CC2200',  visible: true  },
  { id: 'team_goal',       col: 1, size: 'md', color: '#F5A623',  visible: true  },
  { id: 'pipeline',        col: 2, size: 'lg', color: '#10B981',  visible: true  },
  { id: 'gci_chart',       col: 2, size: 'lg', color: '#CC2200',  visible: true  },
  { id: 'todays_tasks',    col: 1, size: 'md', color: '#8B5CF6',  visible: true  },
  { id: 'hot_leads',       col: 1, size: 'md', color: '#DC2626',  visible: true  },
  { id: 'active_deals',    col: 1, size: 'md', color: '#0EA5E9',  visible: true  },
  { id: 'upcoming_close',  col: 1, size: 'md', color: '#F97316',  visible: true  },
  { id: 'active_listings', col: 1, size: 'md', color: '#14B8A6',  visible: true  },
  { id: 'open_houses',     col: 1, size: 'md', color: '#84CC16',  visible: true  },
  { id: 'gifts_pending',   col: 1, size: 'md', color: '#EC4899',  visible: true  },
  { id: 'leaderboard',     col: 2, size: 'lg', color: '#F5A623',  visible: true  },
  { id: 'quick_add',       col: 2, size: 'lg', color: '#6366F1',  visible: true  },
]

// ── LOAD PREFS FROM DB ────────────────────────────────────────────
export async function loadDashPrefs(agentId) {
  try {
    // maybeSingle() returns null (not an error) when no row exists
    // single() throws when no row — was causing silent fallback to defaults
    const { data, error } = await supabase
      .from('briefing_prefs')
      .select('dashboard_widgets, dashboard_layout, dashboard_widgets_backup')
      .eq('agent_id', agentId)
      .maybeSingle()

    if (error) {
      console.warn('[dashPrefs] load error:', error.message)
      return { widgets: DEFAULT_WIDGETS, layout: {}, hasBackup: false }
    }

    if (data?.dashboard_widgets?.length) {
      return {
        widgets:   data.dashboard_widgets,
        layout:    data.dashboard_layout || {},
        hasBackup: !!(data.dashboard_widgets_backup?.length),
      }
    }
  } catch(e) {
    console.warn('[dashPrefs] loadDashPrefs error:', e.message)
  }

  return { widgets: DEFAULT_WIDGETS, layout: {}, hasBackup: false }
}

// ── SAVE PREFS TO DB ──────────────────────────────────────────────
export async function saveDashPrefs(agentId, widgets, layout = {}) {
  // Check if a row already exists for this agent
  const { data: existing } = await supabase
    .from('briefing_prefs')
    .select('agent_id')
    .eq('agent_id', agentId)
    .maybeSingle()

  const payload = {
    agent_id:          agentId,
    dashboard_widgets: widgets,
    dashboard_layout:  layout,
    updated_at:        new Date().toISOString(),
  }

  let error
  if (existing) {
    const result = await supabase
      .from('briefing_prefs')
      .update({ dashboard_widgets: widgets, dashboard_layout: layout, updated_at: new Date().toISOString() })
      .eq('agent_id', agentId)
      .then(r => r)
    error = result.error
  } else {
    const result = await supabase
      .from('briefing_prefs')
      .insert(payload)
      .then(r => r)
    error = result.error
  }

  if (error) throw new Error('saveDashPrefs failed: ' + error.message)
}

// ── SWITCH TO THE NEW RECOMMENDED LAYOUT ───────────────────────────
// Backs up the agent's current widget layout first, so it's never
// lost — restoreOldDashLayout() below brings it back exactly as it was.
export async function switchToNewDashLayout(agentId, currentWidgets) {
  const { data: existing } = await supabase
    .from('briefing_prefs')
    .select('agent_id')
    .eq('agent_id', agentId)
    .maybeSingle()

  const payload = {
    dashboard_widgets:        DEFAULT_WIDGETS,
    dashboard_widgets_backup: currentWidgets,
    updated_at:                new Date().toISOString(),
  }

  let error
  if (existing) {
    const result = await supabase.from('briefing_prefs').update(payload).eq('agent_id', agentId)
    error = result.error
  } else {
    const result = await supabase.from('briefing_prefs').insert({ agent_id: agentId, ...payload })
    error = result.error
  }
  if (error) throw new Error('switchToNewDashLayout failed: ' + error.message)
}

// ── RESTORE THE PREVIOUS (PRE-SWITCH) LAYOUT ────────────────────────
// Returns the restored widget array, or null if there was nothing to restore.
export async function restoreOldDashLayout(agentId) {
  const { data, error } = await supabase
    .from('briefing_prefs')
    .select('dashboard_widgets_backup')
    .eq('agent_id', agentId)
    .maybeSingle()

  if (error) throw new Error('restoreOldDashLayout failed: ' + error.message)
  if (!data?.dashboard_widgets_backup?.length) return null

  const { error: uErr } = await supabase
    .from('briefing_prefs')
    .update({ dashboard_widgets: data.dashboard_widgets_backup, updated_at: new Date().toISOString() })
    .eq('agent_id', agentId)

  if (uErr) throw new Error('restoreOldDashLayout failed: ' + uErr.message)
  return data.dashboard_widgets_backup
}

// ── LOAD AGENT GOALS FROM DB ──────────────────────────────────────
export async function loadAgentGoals(agentId) {
  const { data } = await supabase
    .from('agents')
    .select('goal_gci, goal_deals')
    .eq('id', agentId)
    .single()
  return { goal_gci: data?.goal_gci || 250000, goal_deals: data?.goal_deals || 50 }
}

// ── SAVE AGENT GOAL (admin sets per-agent) ────────────────────────
export async function saveAgentGoal(agentId, goalGci, goalDeals) {
  await supabase
    .from('agents')
    .update({ goal_gci: goalGci, goal_deals: goalDeals, updated_at: new Date().toISOString() })
    .eq('id', agentId)
}

// ── LOAD TEAM GOAL (shared, stored in briefing_prefs for agent 'team') ────
export async function loadTeamGoal() {
  try {
    const { data } = await supabase
      .from('briefing_prefs')
      .select('dashboard_layout')
      .eq('agent_id', '00000000-0000-0000-0000-000000000000')
      .single()
    return { team_gci: data?.dashboard_layout?.team_gci || 2000000, team_deals: data?.dashboard_layout?.team_deals || 200 }
  } catch {
    return { team_gci: 2000000, team_deals: 200 }
  }
}

export async function saveTeamGoal(teamGci, teamDeals) {
  const TEAM_ID = '00000000-0000-0000-0000-000000000000'
  const { data: existing } = await supabase.from('briefing_prefs').select('id').eq('agent_id', TEAM_ID).maybeSingle()
  const payload = { agent_id: TEAM_ID, dashboard_layout:{ team_gci: teamGci, team_deals: teamDeals }, updated_at: new Date().toISOString() }
  if (existing?.id) { await supabase.from('briefing_prefs').update(payload).eq('id', existing.id) }
  else { await supabase.from('briefing_prefs').insert(payload) }
}

export { DEFAULT_WIDGETS }
