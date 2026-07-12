// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Notification Dispatch (client-side)
// Checks the agent's saved notification preferences before actually
// creating an in-app notification or sending an email. Every one of
// the 10 toggles on the Settings page was previously cosmetic --
// nothing anywhere checked them. This is the real dispatch logic,
// wired into each real trigger point across the app.
// ═══════════════════════════════════════════════════════════════
import { loadPrefs } from './userPrefs'
import { createNotification } from './notifications'
import { sendEmail } from './emailService'
import { supabase } from './supabase'

// In-app bell notification, gated by prefs.notifications[prefKey].
// Defaults to enabled if the key is missing (matches PREF_DEFAULTS
// being mostly true) -- only skips when explicitly set to false.
export async function notifyAgent(agentId, prefKey, { title, body, link, type }) {
  if (!agentId) return
  try {
    const prefs = await loadPrefs(agentId)
    if (prefs.notifications?.[prefKey] === false) return
    await createNotification(agentId, title, body, type || 'info', link)
  } catch(e) { console.warn('[notify] notifyAgent failed:', e.message) }
}

// Email notification, gated by prefs.notifications[emailPrefKey].
// These are opt-in (default false in PREF_DEFAULTS) -- only sends
// when explicitly enabled. Looks up the agent's email itself so
// callers don't all need to fetch/pass it separately.
export async function notifyAgentEmail(agentId, emailPrefKey, { subject, html }) {
  if (!agentId) return
  try {
    const prefs = await loadPrefs(agentId)
    if (!prefs.notifications?.[emailPrefKey]) return
    const { data: ag } = await supabase.from('agents').select('email').eq('id', agentId).maybeSingle()
    if (!ag?.email) return
    await sendEmail({ to: ag.email, subject, html })
  } catch(e) { console.warn('[notify] notifyAgentEmail failed:', e.message) }
}
