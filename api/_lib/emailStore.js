'use strict'
// api/_lib/emailStore.js — service-role persistence for Connected Email.
// Tokens are decrypted/encrypted ONLY here and never returned to the browser.
// Writes are idempotent (Phase 2 unique constraints). Every security- or
// cursor-critical DB call checks its error and throws rather than degrading
// to an empty result. I/O is injectable via __setIO for unit tests.

const crypto = require('crypto')
const emailCrypto = require('./emailCrypto')
const connectors = require('./connectors')
const { buildConnectionRow, pickPrimaryIndex } = require('./emailBackfill')
const { sanitizeEmailHtml } = require('./emailSanitize')

function safeTimeout() {
  const v = Number(process.env.GMAIL_API_TIMEOUT_MS)
  return (Number.isFinite(v) && v >= 1000 && v <= 60000) ? v : 10000
}

// Injectable I/O boundary (defaults to the real service-role client + the
// approved connectors boundary). Tests override via __setIO.
const io = {
  sb: connectors.sb,
  getAgentAccount: connectors.getAgentAccount,
  getIntegration: connectors.getIntegration,
  fetchImpl: null,
}
function __setIO(partial) { Object.assign(io, partial) }
function nowIso() { return new Date().toISOString() }

// ── PURE: unambiguous, permitted contact match ───────────────────
function chooseContactMatch(candidates, owner) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const isAdmin = !!(owner && owner.role === 'admin')
  const accessible = candidates.filter(c =>
    c.is_private === false || (owner && c.agent_id === owner.id) || isAdmin)
  return accessible.length === 1 ? accessible[0].id : null
}

// ── connection bridge (uses the decrypted getAgentAccount boundary) ──
async function ensureGoogleConnection(agentId) {
  const acct = await io.getAgentAccount(agentId, 'google') // decrypted secrets; throws on db error
  if (!acct || acct.status !== 'connected') return null
  // buildConnectionRow encrypts EXACTLY ONCE. getAgentAccount already
  // decrypted, so we never double-encrypt an already-encrypted value.
  const row = buildConnectionRow(acct, emailCrypto.encrypt) // throws if key missing/invalid
  if (!row) return null
  const cols = 'id, crm_user_id, provider, email_address, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, granted_scopes, status, is_primary'
  const { data: up, error: upErr } = await io.sb().from('email_connections')
    .upsert(row, { onConflict: 'source_integration_account_id' }).select(cols).maybeSingle()
  if (upErr) throw new Error('ensure connection upsert failed: ' + upErr.message)
  if (!up) throw new Error('ensure connection returned no row')
  const { data: all, error: selErr } = await io.sb().from('email_connections')
    .select('id, status, is_primary, updated_at').eq('crm_user_id', agentId).order('updated_at', { ascending: false })
  if (selErr) throw new Error('primary selection query failed: ' + selErr.message)
  if (all && all.length && !all.some(r => r.is_primary)) {
    const idx = pickPrimaryIndex(all)
    if (idx >= 0) {
      const { error: updErr } = await io.sb().from('email_connections').update({ is_primary: true }).eq('id', all[idx].id)
      if (updErr) throw new Error('primary update failed: ' + updErr.message)
      if (all[idx].id === up.id) up.is_primary = true
    }
  }
  return up // server-only object (includes encrypted tokens); never sent to browser
}

async function getConnectionByEmail(email) {
  if (!email) return null
  const { data, error } = await io.sb().from('email_connections')
    .select('*').eq('provider', 'google').ilike('email_address', email)
  if (error) throw new Error('connection lookup failed: ' + error.message) // never swallow → not "not found"
  if (!data || data.length === 0) return null
  if (data.length > 1) throw new Error('ambiguous mailbox ownership (' + data.length + ' connections)') // fail closed
  return data[0]
}
async function getConnectionById(id) {
  const { data, error } = await io.sb().from('email_connections').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error('connection read failed: ' + error.message)
  return data || null
}

async function markConnectionError(connectionId, code) {
  try {
    await io.sb().from('email_connections').update({ last_error_code: code, last_error_at: nowIso() }).eq('id', connectionId)
  } catch (e) { /* best-effort; never throw sanitized codes upward */ }
}

// Server-side fresh access token. Times out, validates, persists (checked),
// rotates refresh token if returned, and never returns a token if the
// persistence write failed.
async function freshAccessToken(connection, opts = {}) {
  const exp = connection.access_token_expires_at ? Date.parse(connection.access_token_expires_at) : 0
  if (connection.encrypted_access_token && exp > Date.now() + 60000) {
    return emailCrypto.decrypt(connection.encrypted_access_token)
  }
  if (!connection.encrypted_refresh_token) throw new Error('no refresh token on connection')
  const refresh = emailCrypto.decrypt(connection.encrypted_refresh_token)
  const app = await io.getIntegration('google')
  const s = (app && app.secrets) || {}
  if (!s.client_id || !s.client_secret) throw new Error('google app credentials not configured')
  const f = opts.fetchImpl || io.fetchImpl || fetch
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: s.client_id, client_secret: s.client_secret })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), safeTimeout())
  let r
  try {
    r = await f('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(), signal: ctrl.signal,
    })
  } catch (e) { await markConnectionError(connection.id, 'refresh_timeout'); throw new Error('token refresh request failed') }
  finally { clearTimeout(timer) }
  if (!r.ok) { await markConnectionError(connection.id, 'refresh_failed'); throw new Error('token refresh failed') }
  let tok
  try { tok = await r.json() } catch (e) { throw new Error('token refresh parse failed') }
  if (!tok || !tok.access_token) { await markConnectionError(connection.id, 'refresh_no_token'); throw new Error('token refresh returned no access_token') }
  const update = {
    encrypted_access_token: emailCrypto.encrypt(tok.access_token),
    access_token_expires_at: new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString(),
    status: 'active', updated_at: nowIso(),
  }
  if (tok.refresh_token) update.encrypted_refresh_token = emailCrypto.encrypt(tok.refresh_token)
  const { error: updErr } = await io.sb().from('email_connections').update(update).eq('id', connection.id)
  if (updErr) throw new Error('persisting refreshed token failed') // do NOT return a token we failed to persist
  return tok.access_token
}

// ── sync state + lock-token concurrency ──────────────────────────
async function loadSyncState(connectionId) {
  const { data, error } = await io.sb().from('email_sync_state').select('*').eq('connection_id', connectionId).maybeSingle()
  if (error) throw new Error('sync state read failed: ' + error.message)
  return data || null
}
async function upsertSyncState(connectionId, patch) {
  const row = Object.assign({ connection_id: connectionId, updated_at: nowIso() }, patch)
  const { error } = await io.sb().from('email_sync_state').upsert(row, { onConflict: 'connection_id' })
  if (error) throw new Error('sync state upsert failed: ' + error.message)
}

// Claim an unlocked/expired lock atomically; return a unique token or null.
async function claimSync(connectionId, ttlMs = 600000) {
  const token = crypto.randomUUID()
  const now = nowIso()
  const until = new Date(Date.now() + ttlMs).toISOString()
  const { error: insErr } = await io.sb().from('email_sync_state')
    .upsert({ connection_id: connectionId, updated_at: now }, { onConflict: 'connection_id', ignoreDuplicates: true })
  if (insErr) throw new Error('sync row ensure failed: ' + insErr.message)
  const { data, error } = await io.sb().from('email_sync_state')
    .update({ sync_lock_token: token, sync_lock_until: until, updated_at: now })
    .eq('connection_id', connectionId)
    .or('sync_lock_until.is.null,sync_lock_until.lt.' + now)
    .select('connection_id')
  if (error) throw new Error('claim failed: ' + error.message)
  return (data && data.length) ? token : null
}
// Release only if we still hold THIS token; preserve watch_status unless the
// caller explicitly sets it in patch.
async function releaseSync(connectionId, token, patch) {
  const upd = Object.assign({ sync_lock_token: null, sync_lock_until: null, updated_at: nowIso() }, patch || {})
  const { error } = await io.sb().from('email_sync_state')
    .update(upd).eq('connection_id', connectionId).eq('sync_lock_token', token)
  if (error) throw new Error('release failed: ' + error.message)
}

// ── threads / messages ───────────────────────────────────────────
async function getThreadById(connectionId, id) {
  const { data, error } = await io.sb().from('email_threads').select('*').eq('id', id).eq('connection_id', connectionId).maybeSingle()
  if (error) throw new Error('thread read failed: ' + error.message)
  return data || null
}
async function findThreadByProviderThreadId(connectionId, providerThreadId) {
  if (!providerThreadId) return null
  const { data, error } = await io.sb().from('email_threads')
    .select('*').eq('connection_id', connectionId).eq('provider_thread_id', providerThreadId).maybeSingle()
  if (error) throw new Error('thread lookup failed: ' + error.message)
  return data || null
}
async function threadForInternetId(connectionId, internetId) {
  if (!internetId) return null
  const { data, error } = await io.sb().from('email_messages')
    .select('email_thread_id').eq('connection_id', connectionId).eq('internet_message_id', internetId).limit(1)
  if (error) throw new Error('message lookup failed: ' + error.message)
  if (!data || !data.length) return null
  return getThreadById(connectionId, data[0].email_thread_id)
}
// Ordered tracked-thread match, all scoped to the same connection:
// 1) provider_thread_id  2) In-Reply-To  3) each References id  4) self id
async function findTrackedThread(connectionId, parsed) {
  let t = await findThreadByProviderThreadId(connectionId, parsed.provider_thread_id)
  if (t) return t
  t = await threadForInternetId(connectionId, parsed.in_reply_to)
  if (t) return t
  for (const ref of String(parsed.references || '').split(/\s+/).filter(Boolean)) {
    t = await threadForInternetId(connectionId, ref)
    if (t) return t
  }
  return await threadForInternetId(connectionId, parsed.internet_message_id)
}
async function listTrackedThreads(connectionId, max = 200) {
  const { data, error } = await io.sb().from('email_threads')
    .select('id, provider_thread_id, contact_id')
    .eq('connection_id', connectionId).not('provider_thread_id', 'is', null).limit(max)
  if (error) throw new Error('tracked-thread list failed: ' + error.message)
  return data || []
}
async function createThread({ connection, parsed, contactId }) {
  const { data, error } = await io.sb().from('email_threads').insert([{
    owner_crm_user_id: connection.crm_user_id, provider: 'google', connection_id: connection.id,
    provider_thread_id: parsed.provider_thread_id, subject: parsed.subject,
    contact_id: contactId || null, last_message_at: parsed.sent_at || nowIso(),
  }]).select('*').maybeSingle()
  if (error) throw new Error('thread insert failed: ' + error.message)
  return data
}

// Idempotent message write. HTML is sanitized BEFORE storage. On a genuinely
// new row, the thread's last_message_at is bumped.
async function insertMessage(threadId, connection, parsed, contactId) {
  const row = {
    email_thread_id: threadId, connection_id: connection.id, provider: 'google',
    provider_message_id: parsed.provider_message_id, internet_message_id: parsed.internet_message_id,
    in_reply_to: parsed.in_reply_to, references: parsed.references, direction: parsed.direction,
    from_address: parsed.from_address, to_addresses: parsed.to_addresses, cc_addresses: parsed.cc_addresses,
    subject: parsed.subject, body_text: parsed.body_text, body_html: sanitizeEmailHtml(parsed.body_html),
    sent_at: parsed.sent_at, received_at: parsed.received_at, has_attachments: parsed.has_attachments,
    provider_payload_metadata: parsed.provider_payload_metadata,
    owner_crm_user_id: connection.crm_user_id, contact_id: contactId || null,
  }
  const { data, error } = await io.sb().from('email_messages')
    .upsert([row], { onConflict: 'connection_id,provider_message_id', ignoreDuplicates: true }).select('id')
  if (error) throw new Error('message upsert failed: ' + error.message)
  const inserted = !!(data && data.length)
  if (inserted) {
    const { error: tErr } = await io.sb().from('email_threads')
      .update({ last_message_at: parsed.sent_at || parsed.received_at || nowIso() }).eq('id', threadId)
    if (tErr) throw new Error('thread timestamp update failed: ' + tErr.message)
  }
  return { inserted, id: data && data[0] && data[0].id }
}

async function recordDeliveryEvent(messageId, { eventType, status, errorCode, errorMessage } = {}) {
  if (!messageId) return
  const { error } = await io.sb().from('email_delivery_events').insert([{
    message_id: messageId, provider: 'google', event_type: eventType || 'sent',
    status: status || 'ok', error_code: errorCode || null, error_message_sanitized: errorMessage || null,
  }])
  if (error) throw new Error('delivery event insert failed: ' + error.message)
}

async function matchContact(email, owner) {
  if (!email) return null
  const { data, error } = await io.sb().from('contacts').select('id, is_private, agent_id').ilike('email', email)
  if (error) throw new Error('contact lookup failed: ' + error.message)
  return chooseContactMatch(data || [], owner)
}
async function ownerFor(connection) {
  const { data, error } = await io.sb().from('agents').select('id, role').eq('id', connection.crm_user_id).maybeSingle()
  if (error) throw new Error('owner lookup failed: ' + error.message)
  return data || { id: connection.crm_user_id, role: null }
}

// Sanitized timeline note (no tokens/bodies/raw payloads). Best-effort so a
// retry (idempotent messages) does not duplicate notes.
async function addSanitizedTimeline(contactId, { subject, fromAddress }) {
  if (!contactId) return
  try {
    await io.sb().from('tasks').insert([{
      contact_id: contactId,
      title: 'Email reply received: ' + (subject ? String(subject).slice(0, 120) : '(no subject)'),
      notes: 'From: ' + (fromAddress || 'unknown'), priority: 'note', status: 'done',
    }])
  } catch (e) { /* best-effort */ }
}

// Persist a sent Gmail message idempotently (owner from connection).
async function persistOutboundGmail(agentId, opts = {}) {
  const { to, subject, html, text, fromAccount, providerMessageId, providerThreadId, token, fetchImpl } = opts
  const connection = await ensureGoogleConnection(agentId) // fails closed if key missing/invalid
  if (!connection) return { skipped: 'no-connection' }
  let internetMessageId = null
  if (token && providerMessageId) {
    try {
      const gmailApi = require('./gmailApi')
      const got = await gmailApi.getMessage(token, providerMessageId, { format: 'metadata', fetchImpl })
      if (got.ok && got.json) internetMessageId = require('./gmailParse').headerMap(got.json.payload)['message-id'] || null
    } catch (e) { /* best-effort */ }
  }
  let thread = await findThreadByProviderThreadId(connection.id, providerThreadId)
  const owner = await ownerFor(connection)
  const contactId = thread ? thread.contact_id : await matchContact(to, owner)
  const parsed = {
    provider_message_id: providerMessageId || null, provider_thread_id: providerThreadId || null,
    internet_message_id: internetMessageId, in_reply_to: null, references: null,
    direction: 'outbound', from_address: fromAccount || null,
    to_addresses: to ? [String(to).toLowerCase()] : [], cc_addresses: [],
    subject: subject || null, body_text: text || null, body_html: html || null,
    sent_at: nowIso(), received_at: null, has_attachments: false,
    provider_payload_metadata: { source: 'connector-send' },
  }
  if (!thread) thread = await createThread({ connection, parsed, contactId })
  const ins = await insertMessage(thread.id, connection, parsed, contactId)
  if (ins.inserted) await recordDeliveryEvent(ins.id, { eventType: 'sent', status: 'ok' })
  return { ok: true, threadId: thread.id, inserted: ins.inserted }
}

module.exports = {
  __setIO, io, nowIso, chooseContactMatch,
  ensureGoogleConnection, getConnectionByEmail, getConnectionById, markConnectionError,
  freshAccessToken, loadSyncState, upsertSyncState, claimSync, releaseSync,
  getThreadById, findThreadByProviderThreadId, threadForInternetId, findTrackedThread,
  listTrackedThreads, createThread, insertMessage, recordDeliveryEvent,
  matchContact, ownerFor, addSanitizedTimeline, persistOutboundGmail,
}
