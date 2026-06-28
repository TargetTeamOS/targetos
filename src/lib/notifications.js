// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Notifications
// In-app bell notifications. Stored in Supabase.
// Agents get notified for: overdue tasks, new assignments,
// deal stage changes, closing dates approaching.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

export async function getNotifications(agentId, limit = 50) {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

export async function markRead(id) {
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}

export async function markAllRead(agentId) {
  await supabase.from('notifications').update({ read: true }).eq('agent_id', agentId).eq('read', false)
}

export async function createNotification(agentId, title, body, type = 'info', link = null) {
  if (!agentId) return
  try {
    await supabase.from('notifications').insert({
      agent_id:   agentId,
      title,
      body,
      type,
      link,
      read:       false,
      created_at: new Date().toISOString(),
    })
  } catch { /* never crash on notification failure */ }
}

export async function getUnreadCount(agentId) {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('read', false)
  return count || 0
}
