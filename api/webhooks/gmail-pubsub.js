'use strict'
// api/webhooks/gmail-pubsub.js — Google Pub/Sub PUSH endpoint for Gmail.
// FAILS CLOSED unless OIDC verifies. The payload carries only
// { emailAddress, historyId }; the connection is resolved from the DB by
// that mailbox and ownership is NEVER trusted from the request. History IDs
// are treated as decimal strings (BigInt-safe). 204 only for
// unknown-mailbox / duplicate / success / already-locked; 503 for transient
// DB or sync failures so Pub/Sub retries. No bodies/tokens are logged.

const { verifyPubSubOidc } = require('../_lib/pubsubVerify')
const emailStore = require('../_lib/emailStore')
const { runIncrementalSync } = require('../_lib/gmailSync')

const MAX_BODY = 256 * 1024 // 256 KB cap

function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(obj ? JSON.stringify(obj) : '') }
function noContent(res) { res.statusCode = 204; res.end() }

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''; let over = false
    req.on('data', c => { raw += c; if (raw.length > MAX_BODY) { over = true; try { req.destroy() } catch (e) {} } })
    req.on('end', () => { if (over) return resolve(null); try { resolve(JSON.parse(raw || 'null')) } catch { resolve(null) } })
    req.on('error', () => resolve(null))
  })
}

function isDecimalString(s) { return s != null && /^\d+$/.test(String(s)) }

// Decode standard Base64 and Base64URL Pub/Sub data safely.
function decodePush(body) {
  const msg = body && body.message
  if (!msg || !msg.data) return null
  let str
  try { str = Buffer.from(String(msg.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') } catch (e) { return null }
  let obj; try { obj = JSON.parse(str) } catch (e) { return null }
  if (!obj || !obj.emailAddress || obj.historyId == null) return null
  if (!isDecimalString(obj.historyId)) return null
  return { emailAddress: String(obj.emailAddress), historyId: String(obj.historyId), messageId: msg.messageId || null }
}

const deps = { verify: verifyPubSubOidc, store: emailStore, sync: runIncrementalSync }

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  try { await deps.verify(req, {}) } catch (e) { return json(res, 401, { error: 'unauthorized' }) } // fail closed

  const body = await parseBody(req)
  const push = decodePush(body)
  if (!push) return json(res, 400, { error: 'bad payload' })

  // Resolve connection from DB (transient errors → 503 so Pub/Sub retries).
  let connection
  try { connection = await deps.store.getConnectionByEmail(push.emailAddress) }
  catch (e) { return json(res, 503, { error: 'temporarily unavailable' }) }
  if (!connection) return noContent(res) // unknown mailbox → ack

  // Replay/duplicate protection using BigInt-safe decimal comparison.
  try {
    const state = await deps.store.loadSyncState(connection.id)
    const cursor = state && state.gmail_history_id
    if (isDecimalString(cursor) && BigInt(push.historyId) <= BigInt(cursor)) return noContent(res)
  } catch (e) { return json(res, 503, { error: 'temporarily unavailable' }) }

  // Idempotent, concurrency-guarded sync.
  let result
  try { result = await deps.sync(connection) } catch (e) { return json(res, 503, { error: 'sync failed' }) }
  if (result && result.skipped === 'locked') return noContent(res) // another worker owns it
  if (result && (result.error || result.retryable)) return json(res, 503, { error: 'sync incomplete' })
  return noContent(res)
}

module.exports = handler
module.exports.__setDepsForTests = (d) => { Object.assign(deps, d) }
module.exports.decodePush = decodePush
