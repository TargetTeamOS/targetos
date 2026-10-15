'use strict'
// api/team-notify.js — posts a message to the connected Slack/Teams
// incoming webhook. Called by the automation engine's
// notify_team_chat action (the browser can't read the webhook URL —
// it's RLS-sealed — so this route does it with the service key).
// Body: { text }

const { notifyTeamChat, logEvent } = require('./_lib/connectors')
const { requireAnyAgent } = require('./_lib/phone')

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  // SECURITY (Oct 2026 hardening, task #41): used to only be gated by
  // a staged, log-only requireUser/AUTH_ENFORCE check -- part of a
  // ~20-endpoint cluster found to fail open whenever AUTH_ENFORCE
  // isn't explicitly set to 'true' in Vercel. The only real caller,
  // automationEngine.js, already attaches the signed-in agent's own
  // Bearer token, so this is now hard-gated unconditionally.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) { res.status(authCheck.status).json({ error: authCheck.message }); return }

  try {
    const body = await parseBody(req)
    const text = String(body.text || '').trim()
    if (!text) { res.status(400).json({ error: 'text required' }); return }
    const result = await notifyTeamChat(text)
    if (result.skipped) { res.status(200).json({ ok: false, skipped: true, reason: 'Slack/Teams webhook not configured (Admin → Connectors)' }); return }
    await logEvent('teamchat', 'out', 'notify', { text: text.slice(0, 120) }, result.ok)
    res.status(result.ok ? 200 : 502).json(result.ok ? { ok: true } : { error: 'webhook post failed' })
  } catch (e) {
    console.error('[team-notify] ' + e.message)
    res.status(500).json({ error: e.message })
  }
}
