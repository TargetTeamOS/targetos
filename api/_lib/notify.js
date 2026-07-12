// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Notification Dispatch (server-side, CommonJS)
// Same logic as src/lib/notify.js, for API/cron files that can't
// import the ES module version.
// ═══════════════════════════════════════════════════════════════
'use strict'

async function loadAgentNotificationPrefs(supabase, agentId) {
  try {
    const { data } = await supabase.from('briefing_prefs').select('user_prefs').eq('agent_id', agentId).maybeSingle()
    return (data?.user_prefs?.notifications) || {}
  } catch(e) { return {} }
}

async function notifyAgent(supabase, agentId, prefKey, { title, body, link, type }) {
  if (!agentId) return
  try {
    const notifs = await loadAgentNotificationPrefs(supabase, agentId)
    if (notifs[prefKey] === false) return
    await supabase.from('notifications').insert({
      agent_id: agentId, title, body, type: type || 'info', link: link || null,
      read: false, created_at: new Date().toISOString(),
    })
  } catch(e) { console.warn('[notify] notifyAgent failed:', e.message) }
}

module.exports = { loadAgentNotificationPrefs, notifyAgent }
