'use strict'
// api/outlook-account.js — the signed-in agent's OWN Outlook connection.
//   GET  (or POST {action:'status'})      → { connected, from }
//   POST {action:'disconnect'}            → { ok:true }
// The agent is resolved from the authenticated JWT; a caller-supplied
// agent_id is ignored, so no agent can read or disconnect another agent's
// mailbox. Tokens are never returned. CORS is limited to APP_ORIGINS.

const { requireUser } = require('./_lib/auth')
const { getAgentForUser, getAgentAccount, sb } = require('./_lib/connectors')

const ALLOWED_ORIGINS = String(process.env.APP_ORIGINS || 'https://app.targetreteam.com')
  .split(',').map(s => s.trim()).filter(Boolean)

function applyCors(req, res) {
  const origin = req.headers.origin || ''
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } }); req.on('error', () => resolve({})) })
}

const deps = { requireUser, getAgentForUser, getAgentAccount, sb }

async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }

  const user = await deps.requireUser(req)
  if (!user) return json(res, 401, { error: 'unauthorized' })

  const agent = await deps.getAgentForUser(user.id)
  if (!agent || !agent.id) return json(res, 403, { error: 'no CRM agent is linked to this login' })

  try {
    const body = req.method === 'POST' ? await parseBody(req) : {}
    const action = body.action || (req.method === 'GET' ? 'status' : '')

    if (action === 'status') {
      const acct = await deps.getAgentAccount(agent.id, 'outlook') // own account only
      const connected = !!(acct && acct.status === 'connected' && acct.account_email)
      return json(res, 200, { connected, from: connected ? acct.account_email : null })
    }

    if (action === 'disconnect') {
      const { error } = await deps.sb().from('integration_accounts')
        .delete().eq('agent_id', agent.id).eq('provider', 'outlook') // own account only
      if (error) return json(res, 500, { error: 'disconnect failed' })
      return json(res, 200, { ok: true })
    }

    return json(res, 400, { error: 'unknown action' })
  } catch (e) {
    console.error('[outlook-account] ' + String(e && e.message).slice(0, 200))
    return json(res, 500, { error: 'request failed' })
  }
}

module.exports = handler
module.exports.__setDepsForTests = (d) => { Object.assign(deps, d) }
