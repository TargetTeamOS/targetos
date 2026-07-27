'use strict'
// api/webhooks/gmail-pubsub.js — Google Pub/Sub PUSH endpoint for Gmail.
// FAILS CLOSED unless the OIDC token verifies (audience + service account
// from env). The push payload carries only { emailAddress, historyId }; we
// resolve the connection from the DB by that email and NEVER trust
// crm_user_id/connection_id/ownership from the request. Work is idempotent
// and returns quickly. No bodies/tokens are logged.

const { verifyPubSubOidc } = require('../_lib/pubsubVerify')
const emailStore = require('../_lib/emailStore')
const { runIncrementalSync } = require('../_lib/gmailSync')

function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(obj ? JSON.stringify(obj) : '') }
function noContent(res) { res.statusCode = 204; res.end() }

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve(null) } }); req.on('error', () => resolve(null)) })
}

// Decode the Pub/Sub envelope's base64 data → { emailAddress, historyId }.
function decodePush(body) {
  const msg = body && body.message
  if (!msg || !msg.data) return null
  let obj
  try { obj = JSON.parse(Buffer.from(String(msg.data), 'base64').toString('utf8')) } catch (e) { return null }
  if (!obj || !obj.emailAddress || obj.historyId == null) return null
  return { emailAddress: String(obj.emailAddress), historyId: String(obj.historyId), messageId: msg.messageId || null }
}

const deps = { verify: verifyPubSubOidc, store: emailStore, sync: runIncrementalSync }

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  // 1) Verify OIDC — fail closed on any problem. No detail leaked.
  try { await deps.verify(req, {}) }
  catch (e) { return json(res, 401, { error: 'unauthorized' }) }

  // 2) Parse + validate payload shape.
  const body = await parseBody(req)
  const push = decodePush(body)
  if (!push) return json(res, 400, { error: 'bad payload' })

  // 3) Resolve the connection from the DB by mailbox address (never trust
  //    ownership fields from the request).
  let connection
  try { connection = await deps.store.getConnectionByEmail(push.emailAddress) }
  catch (e) { return json(res, 200, { ok: true }) } // ack; avoid retHTTP storms on transient DB errors
  if (!connection) return noContent(res) // unknown mailbox → ack, nothing to do

  // 4) Replay/duplicate protection: ignore notifications at or behind the
  //    cursor we've already processed.
  try {
    const state = await deps.store.loadSyncState(connection.id)
    const cursor = state && state.gmail_history_id
    if (cursor && Number(push.historyId) <= Number(cursor)) return noContent(res)
  } catch (e) { /* fall through to sync, which is itself idempotent */ }

  // 5) Kick an idempotent, concurrency-guarded incremental sync. Errors are
  //    swallowed (sanitized inside) so we always ack quickly.
  try { await deps.sync(connection) } catch (e) { /* sanitized inside sync */ }
  return noContent(res)
}

module.exports = handler
module.exports.__setDepsForTests = (d) => { Object.assign(deps, d) }
module.exports.decodePush = decodePush
