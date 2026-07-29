'use strict'
// api/email/gmail-watch.js — authenticated endpoint to create/renew/stop a
// Gmail users.watch for the CALLER'S OWN Google connection. Tokens are
// decrypted only server-side and never returned. A caller-supplied
// connection_id/agent_id is ignored; the connection is resolved from the
// authenticated user. Body: { action?: 'create'|'renew'|'stop' }.

const emailStore = require('../_lib/emailStore')
const gmailApi = require('../_lib/gmailApi')
const { requireUser } = require('../_lib/auth')
const { getAgentForUser } = require('../_lib/connectors')

const MAX_BODY = 16 * 1024
const ALLOWED_ORIGINS = String(process.env.APP_ORIGINS || 'https://app.targetreteam.com')
  .split(',').map(s => s.trim()).filter(Boolean)

function applyCors(req, res) {
  const origin = req.headers.origin || ''
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
function sanitize(m) { return String(m == null ? '' : m).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]').slice(0, 200) }
function isDecimalString(s) { return s != null && /^\d+$/.test(String(s)) }
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return new Promise((resolve) => {
    let raw = ''; let over = false
    req.on('data', c => { raw += c; if (raw.length > MAX_BODY) { over = true; try { req.destroy() } catch (e) {} } })
    req.on('end', () => { if (over) return resolve({}); try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

const deps = { requireUser, getAgentForUser, store: emailStore, gmail: gmailApi }

async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  const user = await deps.requireUser(req)
  if (!user) return json(res, 401, { error: 'unauthorized' })

  const topic = process.env.GMAIL_PUBSUB_TOPIC
  if (!topic) return json(res, 503, { error: 'Gmail push is not configured' }) // fail closed

  try {
    const body = await parseBody(req)
    const action = ['create', 'renew', 'stop'].includes(body.action) ? body.action : 'create'

    const agent = await deps.getAgentForUser(user.id)
    if (!agent || !agent.id) return json(res, 403, { error: 'no CRM agent is linked to this login' })

    const connection = await deps.store.ensureGoogleConnection(agent.id) // own connection only
    if (!connection) return json(res, 400, { error: 'Connect your Google account first' })

    const token = await deps.store.freshAccessToken(connection)

    if (action === 'stop') {
      const s = await deps.gmail.stopWatch(token)
      if (!s || !s.ok) return json(res, 502, { error: 'Gmail watch stop failed' }) // check before marking stopped
      await deps.store.upsertSyncState(connection.id, { provider: 'google', watch_status: 'stopped' })
      return json(res, 200, { ok: true, action: 'stop' })
    }

    const w = await deps.gmail.watch(token, { topicName: topic })
    if (!w || !w.ok || !w.json) return json(res, 502, { error: 'Gmail watch failed' })
    const historyId = w.json.historyId
    const expMs = Number(w.json.expiration || 0)
    if (!isDecimalString(historyId) || !(expMs > 0)) return json(res, 502, { error: 'malformed watch response' })

    await deps.store.upsertSyncState(connection.id, {
      provider: 'google', gmail_history_id: String(historyId), watch_status: 'active',
      subscription_expires_at: new Date(expMs).toISOString(),
      last_successful_sync_at: new Date().toISOString(), retry_count: 0,
    })
    return json(res, 200, { ok: true, action, expiration: expMs }) // no tokens returned
  } catch (e) {
    console.error('[gmail-watch] ' + sanitize(e.message))
    return json(res, 500, { error: 'watch setup failed' })
  }
}

module.exports = handler
module.exports.__setDepsForTests = (d) => { Object.assign(deps, d) }
