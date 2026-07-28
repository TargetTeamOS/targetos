'use strict'
// api/_lib/systemMailer.js — send automated system email from the fixed
// system mailbox via Microsoft Graph APPLICATION auth (client credentials).
// NEVER uses an agent refresh token. Fails closed unless all four
// MICROSOFT_SYSTEM_* env vars are present. Idempotent (system_email_log),
// bounded retries, sanitized errors, saveToSentItems. I/O injectable for
// tests via __setIO / opts.

const connectors = require('./connectors')
const crypto = require('crypto')

const TIMEOUT_MS = 10000
const CLAIM_TTL_SECONDS = 300 // lease must comfortably exceed the Graph timeout
const io = { sb: connectors.sb, fetchImpl: null }
function __setIO(p) { Object.assign(io, p) }
function iso() { return new Date().toISOString() }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function backoff(attempt) { return Math.min(2000, 200 * Math.pow(2, attempt - 1)) }
function sanitizeCode(c) { return /^[a-z0-9_]{1,40}$/i.test(String(c || '')) ? String(c) : 'error' }

function config() {
  return {
    tenantId: process.env.MICROSOFT_SYSTEM_TENANT_ID,
    clientId: process.env.MICROSOFT_SYSTEM_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_SYSTEM_CLIENT_SECRET,
    mailbox: process.env.MICROSOFT_SYSTEM_MAILBOX,
  }
}
function isConfigured(c) { c = c || config(); return !!(c.tenantId && c.clientId && c.clientSecret && c.mailbox) }

let _tokenCache = null
function resetTokenCache() { _tokenCache = null }

async function appToken(c, fetchImpl) {
  if (_tokenCache && _tokenCache.exp > Date.now() + 60000) return _tokenCache.token
  const f = fetchImpl || io.fetchImpl || fetch
  const url = 'https://login.microsoftonline.com/' + encodeURIComponent(c.tenantId) + '/oauth2/v2.0/token'
  const body = new URLSearchParams({
    client_id: c.clientId, client_secret: c.clientSecret,
    grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
  })
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let r
  try { r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: ctrl.signal }) }
  finally { clearTimeout(t) }
  if (!r.ok) throw new Error('system token request failed')
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error('system token response missing access_token')
  _tokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) * 1000) }
  return j.access_token
}

async function graphSend(token, mailbox, message, fetchImpl) {
  const f = fetchImpl || io.fetchImpl || fetch
  const url = 'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(mailbox) + '/sendMail'
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await f(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: ctrl.signal })
    let text = ''
    try { text = await r.text() } catch (e) { text = '' }
    return { status: r.status, ok: r.status === 202 }
  } finally { clearTimeout(t) }
}

// Atomic claim via the claim_system_email() RPC. Returns 'claimed',
// 'duplicate' (already sent), or 'in_progress' (a live lease is held).
async function claim(key, token) {
  const { data, error } = await io.sb().rpc('claim_system_email', { p_key: key, p_token: token, p_ttl_seconds: CLAIM_TTL_SECONDS })
  if (error) throw new Error('system claim failed')
  return data
}
// Finalize the row — ONLY if we still hold this claim_token. Returns true if
// the guarded update matched our row (a stale worker whose lease was taken
// over matches 0 rows and therefore cannot finalize another worker's claim).
async function finalize(key, token, { status, attempts, code }) {
  const { data, error } = await io.sb().from('system_email_log')
    .update({ status, attempts, last_error_code: code || null, claim_token: null, claim_until: null, updated_at: iso() })
    .eq('idempotency_key', key).eq('claim_token', token).select('idempotency_key')
  if (error) throw new Error('system log finalize failed')
  return !!(data && data.length)
}

// Send one automated system email. Returns:
//   { ok:true, attempts }                 delivered and finalized
//   { ok:true, accepted:true, warning }    Graph accepted (202) but the final
//                                          log write failed / claim was lost —
//                                          the email was NOT re-sent
//   { ok:true, skipped:'duplicate' }       already delivered
//   { ok:false, skipped:'in_progress' }    another worker owns the claim
//   { ok:false, error, code, attempts }    failed before Graph accepted it
// Throws only for fail-closed misconfiguration.
async function sendSystemEmail(input = {}, opts = {}) {
  const { to, subject, html, text, idempotencyKey } = input
  const c = opts.config || config()
  if (!isConfigured(c)) throw new Error('system mailbox not configured')
  if (!to) throw new Error('recipient required')
  const fetchImpl = opts.fetchImpl || io.fetchImpl
  const doSleep = opts.sleep || sleep
  const maxAttempts = opts.maxAttempts || 3
  const key = idempotencyKey || null

  // Atomically claim the key. Exactly one concurrent caller gets 'claimed'.
  let claimToken = null
  if (key) {
    claimToken = crypto.randomUUID()
    const decision = await claim(key, claimToken)
    if (decision === 'duplicate') return { ok: true, skipped: 'duplicate' }
    if (decision === 'in_progress') return { ok: false, skipped: 'in_progress' }
    // 'claimed' → we are the sole sender for this key
  }

  const message = {
    message: {
      subject: subject || '(no subject)',
      body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
      toRecipients: [{ emailAddress: { address: String(to) } }],
    },
    saveToSentItems: true,
  }

  // Bounded retries apply ONLY to failures BEFORE Graph accepts the message
  // (timeout / 429 / 5xx). Once Graph returns 202 we stop the loop forever.
  let attempt = 0, lastCode = null, accepted = false
  while (attempt < maxAttempts) {
    attempt++
    let r = null
    try {
      const token = await appToken(c, fetchImpl)
      r = await graphSend(token, c.mailbox, message, fetchImpl)
    } catch (e) { lastCode = 'send_error'; await doSleep(backoff(attempt)); continue } // pre-accept failure → retry
    if (r.status === 202) { accepted = true; break }        // ACCEPTED — never send again
    lastCode = 'graph_' + r.status
    if (r.status === 429 || r.status >= 500) { await doSleep(backoff(attempt)); continue } // pre-accept retry
    break // non-retryable 4xx → stop, not accepted
  }

  if (accepted) {
    // CRITICAL: the message is already delivered. Do NOT re-send under any
    // circumstance. If finalizing the log fails or our claim was lost, return
    // accepted with a sanitized warning instead of retrying Graph.
    if (key) {
      let held = false
      try { held = await finalize(key, claimToken, { status: 'sent', attempts: attempt, code: null }) }
      catch (e) { return { ok: true, accepted: true, attempts: attempt, warning: 'delivered; delivery-log finalize failed' } }
      if (!held) return { ok: true, accepted: true, attempts: attempt, warning: 'delivered; claim lease was lost before finalize' }
    }
    return { ok: true, attempts: attempt }
  }

  // Not accepted → record a sanitized error (holder only; ignore if lost).
  if (key) { try { await finalize(key, claimToken, { status: 'error', attempts: attempt, code: sanitizeCode(lastCode) }) } catch (e) { /* best-effort */ } }
  return { ok: false, error: 'system email send failed', code: sanitizeCode(lastCode), attempts: attempt }
}

// Admin status — configuration health + recent counts. No secrets returned
// (mailbox address is not a secret; tenant/client/secret are never exposed).
async function status() {
  const c = config()
  const out = { configured: isConfigured(c), mailbox: c.mailbox || null, recent: { sent: 0, error: 0, pending: 0 } }
  try {
    const { data } = await io.sb().from('system_email_log').select('status').limit(500)
    for (const r of (data || [])) if (out.recent[r.status] != null) out.recent[r.status]++
  } catch (e) { /* status is best-effort; configuration flag is what matters */ }
  return out
}

module.exports = { __setIO, io, config, isConfigured, appToken, resetTokenCache, sendSystemEmail, status, sanitizeCode, claim, finalize, CLAIM_TTL_SECONDS }
