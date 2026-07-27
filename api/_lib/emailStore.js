'use strict'
// api/_lib/emailStore.js — service-role persistence for Connected Email.
// All token material is decrypted/encrypted ONLY here (server-side) and is
// never returned to callers/browser. Writes are idempotent (rely on the
// Phase 2 unique constraints).

const { createClient } = require('@supabase/supabase-js')
const emailCrypto = require('./emailCrypto')
const { getIntegration, sb: connectorsSb } = require('./connectors')
const { buildConnectionRow, pickPrimaryIndex } = require('./emailBackfill')

function sb() { return connectorsSb() }

// ── PURE: choose an unambiguous, permitted contact match ──────────
// candidates: [{ id, is_private, agent_id }], owner: { id, role }
// Returns a single id only when exactly one candidate is accessible to
// the owner (mirrors contacts_select: not-private OR own OR admin).
function chooseContactMatch(candidates, owner) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const isAdmin = !!(owner && owner.role === 'admin')
  const accessible = candidates.filter(c =>
    c.is_private === false || (owner && c.agent_id === owner.id) || isAdmin)
  return accessible.length === 1 ? accessible[0].id : null
}

// Bridge: ensure an email_connections row exists for this agent's Google
// account (encrypting tokens from the legacy integration_accounts row via
// the Phase 2 helper). Returns the connection row or null. Fails closed if
// encryption is misconfigured.
async function ensureGoogleConnection(agentId) {
  const { data: acct, error } = await sb().from('integration_accounts')
    .select('*').eq('agent_id', agentId).eq('provider', 'google').maybeSingle()
  if (error) throw new Error('integration_accounts read failed')
  if (!acct || acct.status !== 'connected') return null
  const row = buildConnectionRow(acct, emailCrypto.encrypt) // throws if key missing/invalid
  if (!row) return null
  const { data: up, error: upErr } = await sb().from('email_connections')
    .upsert(row, { onConflict: 'source_integration_account_id' })
    .select('id, crm_user_id, email_address, provider').maybeSingle()
  if (upErr) throw new Error('ensure connection upsert failed: ' + upErr.message)
  // Ensure exactly one primary for this user.
  const { data: all } = await sb().from('email_connections')
    .select('id, status, is_primary, updated_at').eq('crm_user_id', agentId)
    .order('updated_at', { ascending: false })
  if (all && all.length && !all.some(r => r.is_primary)) {
    const idx = pickPrimaryIndex(all)
    if (idx >= 0) await sb().from('email_connections').update({ is_primary: true }).eq('id', all[idx].id)
  }
  return up
}

async function getConnectionByEmail(email) {
  if (!email) return null
  const { data } = await sb().from('email_connections')
    .select('*').eq('provider', 'google').ilike('email_address', email).maybeSingle()
  return data || null
}
async function getConnectionById(id) {
  const { data } = await sb().from('email_connections').select('*').eq('id', id).maybeSingle()
  return data || null
}

// Server-side fresh access token for a connection. Decrypts, refreshes via
// Google if expired, persists the newly ENCRYPTED access token. Never
// returns refresh tokens; the returned access token stays server-side.
async function freshAccessToken(connection, { fetchImpl } = {}) {
  const f = fetchImpl || fetch
  const exp = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0
  if (connection.encrypted_access_token && exp > Date.now() + 60000) {
    return emailCrypto.decrypt(connection.encrypted_access_token)
  }
  if (!connection.encrypted_refresh_token) throw new Error('no refresh token on connection')
  const refresh = emailCrypto.decrypt(connection.encrypted_refresh_token)
  const app = await getIntegration('google')
  const appSecrets = (app && app.secrets) || {}
  const clientId = appSecrets.client_id
  const clientSecret = appSecrets.client_secret
  if (!clientId || !clientSecret) throw new Error('google app credentials not configured')
  const params = new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: refresh,
    client_id: clientId, client_secret: clientSecret,
  })
  const r = await f('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString(),
  })
  if (!r.ok) { await markConnectionError(connection.id, 'refresh_failed'); throw new Error('token refresh failed') }
  const tok = await r.json()
  const newAccess = tok.access_token
  const expiresAt = new Date(Date.now() + (Number(tok.expires_in || 3600) * 1000)).toISOString()
  await sb().from('email_connections').update({
    encrypted_access_token: emailCrypto.encrypt(newAccess),
    access_token_expires_at: expiresAt, status: 'active', updated_at: new Date().toISOString(),
  }).eq('id', connection.id)
  return newAccess
}

async function markConnectionError(connectionId, code) {
  await sb().from('email_connections').update({
    last_error_code: code, last_error_at: new Date().toISOString(),
  }).eq('id', connectionId)
}

// ── sync state ────────────────────────────────────────────────────
async function loadSyncState(connectionId) {
  const { data } = await sb().from('email_sync_state').select('*').eq('connection_id', connectionId).maybeSingle()
  return data || null
}
async function upsertSyncState(connectionId, patch) {
  const row = Object.assign({ connection_id: connectionId, updated_at: new Date().toISOString() }, patch)
  const { error } = await sb().from('email_sync_state').upsert(row, { onConflict: 'connection_id' })
  if (error) throw new Error('sync state upsert failed: ' + error.message)
}

// Atomic-ish claim to prevent concurrent sync of the same connection.
// Reuses watch_status as a transient lock ('syncing') with stale recovery,
// so no Phase 2 schema change is needed. Returns true if claim acquired.
async function claimSync(connectionId, staleMs = 600000) {
  const staleBefore = new Date(Date.now() - staleMs).toISOString()
  // Try to flip to 'syncing' only if not already syncing (or the lock is stale).
  const { data, error } = await sb().from('email_sync_state')
    .update({ watch_status: 'syncing', updated_at: new Date().toISOString() })
    .eq('connection_id', connectionId)
    .or('watch_status.neq.syncing,updated_at.lt.' + staleBefore)
    .select('connection_id')
  if (error) throw new Error('claim failed: ' + error.message)
  return !!(data && data.length)
}
async function releaseSync(connectionId, patch) {
  await upsertSyncState(connectionId, Object.assign({ watch_status: 'active' }, patch || {}))
}

// ── thread / message persistence (idempotent) ────────────────────
async function findThreadByProviderThreadId(connectionId, providerThreadId) {
  if (!providerThreadId) return null
  const { data } = await sb().from('email_threads')
    .select('*').eq('connection_id', connectionId).eq('provider_thread_id', providerThreadId).maybeSingle()
  return data || null
}
async function createThread({ connection, parsed, contactId }) {
  const { data, error } = await sb().from('email_threads').insert([{
    owner_crm_user_id: connection.crm_user_id, provider: 'google', connection_id: connection.id,
    provider_thread_id: parsed.provider_thread_id, subject: parsed.subject,
    contact_id: contactId || null, last_message_at: parsed.sent_at || new Date().toISOString(),
  }]).select('*').maybeSingle()
  if (error) throw new Error('thread insert failed: ' + error.message)
  return data
}

// Insert a message idempotently on (connection_id, provider_message_id).
// Returns { inserted: bool, id }.
async function insertMessage(threadId, connection, parsed, contactId) {
  const row = {
    email_thread_id: threadId, connection_id: connection.id, provider: 'google',
    provider_message_id: parsed.provider_message_id, internet_message_id: parsed.internet_message_id,
    in_reply_to: parsed.in_reply_to, references: parsed.references, direction: parsed.direction,
    from_address: parsed.from_address, to_addresses: parsed.to_addresses, cc_addresses: parsed.cc_addresses,
    subject: parsed.subject, body_text: parsed.body_text, body_html: parsed.body_html,
    sent_at: parsed.sent_at, received_at: parsed.received_at, has_attachments: parsed.has_attachments,
    provider_payload_metadata: parsed.provider_payload_metadata,
    owner_crm_user_id: connection.crm_user_id, contact_id: contactId || null,
  }
  const { data, error } = await sb().from('email_messages')
    .upsert([row], { onConflict: 'connection_id,provider_message_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error('message upsert failed: ' + error.message)
  return { inserted: !!(data && data.length), id: data && data[0] && data[0].id }
}

async function recordDeliveryEvent(messageId, { eventType, status, errorCode, errorMessage } = {}) {
  if (!messageId) return
  await sb().from('email_delivery_events').insert([{
    message_id: messageId, provider: 'google', event_type: eventType || 'sent',
    status: status || 'ok', error_code: errorCode || null, error_message_sanitized: errorMessage || null,
  }])
}

// Unambiguous, permitted contact match for a sender address.
async function matchContact(email, owner) {
  if (!email) return null
  const { data } = await sb().from('contacts').select('id, is_private, agent_id').ilike('email', email)
  return chooseContactMatch(data || [], owner)
}
async function ownerFor(connection) {
  const { data } = await sb().from('agents').select('id, role').eq('id', connection.crm_user_id).maybeSingle()
  return data || { id: connection.crm_user_id, role: null }
}

// Sanitized contact-timeline note (no tokens, no bodies, no raw payloads).
async function addSanitizedTimeline(contactId, { subject, fromAddress }) {
  if (!contactId) return
  await sb().from('tasks').insert([{
    contact_id: contactId,
    title: 'Email reply received: ' + (subject ? String(subject).slice(0, 120) : '(no subject)'),
    notes: 'From: ' + (fromAddress || 'unknown'),
    priority: 'note', status: 'done',
  }])
}

// Persist a successfully-sent Gmail message (idempotent). Owner is taken
// from the connection (never the request). Best-effort internet Message-ID
// lookup via metadata. Returns a small status object.
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
    } catch (e) { /* best-effort only */ }
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
    sent_at: new Date().toISOString(), received_at: null, has_attachments: false,
    provider_payload_metadata: { source: 'connector-send' },
  }
  if (!thread) thread = await createThread({ connection, parsed, contactId })
  const ins = await insertMessage(thread.id, connection, parsed, contactId)
  if (ins.inserted) await recordDeliveryEvent(ins.id, { eventType: 'sent', status: 'ok' })
  return { ok: true, threadId: thread.id, inserted: ins.inserted }
}

module.exports = {
  sb, chooseContactMatch, ensureGoogleConnection, getConnectionByEmail, getConnectionById,
  freshAccessToken, markConnectionError, loadSyncState, upsertSyncState, claimSync, releaseSync,
  findThreadByProviderThreadId, createThread, insertMessage, recordDeliveryEvent,
  matchContact, ownerFor, addSanitizedTimeline, persistOutboundGmail,
}
