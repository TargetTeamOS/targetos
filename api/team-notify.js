'use strict'
// api/team-notify.js — posts a message to the connected Slack/Teams
// incoming webhook. Called by the automation engine's
// notify_team_chat action (the browser can't read the webhook URL —
// it's RLS-sealed — so this route does it with the service key).
// Body: { text }

const { notifyTeamChat, logEvent } = require('./_lib/connectors')

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
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

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
