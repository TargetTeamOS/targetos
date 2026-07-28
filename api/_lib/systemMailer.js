'use strict'
// api/_lib/systemMailer.js — send automated system email from the fixed
// system mailbox via Microsoft Graph APPLICATION auth (client credentials).
// NEVER uses an agent refresh token. Fails closed unless all four
// MICROSOFT_SYSTEM_* env vars are present. Idempotent (system_email_log),
// bounded retries, sanitized errors, saveToSentItems. I/O injectable for
// tests via __setIO / opts.

const connectors = require('./connectors')

const TIMEOUT_MS = 10000
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

async function getLog(key) {
  const { data, error } = await io.sb().from('system_email_log').select('status, attempts').eq('idempotency_key', key).maybeSingle()
  if (error) throw new Error('system log read failed')
  return data || null
}
async function upsertLog(key, patch) {
  const row = Object.assign({ idempotency_key: key, provider: 'microsoft', updated_at: iso() }, patch)
  const { error } = await io.sb().from('system_email_log').upsert(row, { onConflict: 'idempotency_key' })
  if (error) throw new Error('system log write failed')
}

// Send one automated system email. Returns { ok, skipped?, attempts, code? }.
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

  if (key) {
    const existing = await getLog(key)
    if (existing && existing.status === 'sent') return { ok: true, skipped: 'duplicate' }
    await upsertLog(key, { to_address: String(to), subject: subject || null, status: 'pending' })
  }

  const message = {
    message: {
      subject: subject || '(no subject)',
      body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
      toRecipients: [{ emailAddress: { address: String(to) } }],
    },
    saveToSentItems: true,
  }

  let attempt = 0, lastCode = null
  while (attempt < maxAttempts) {
    attempt++
    try {
      const token = await appToken(c, fetchImpl)
      const r = await graphSend(token, c.mailbox, message, fetchImpl)
      if (r.status === 202) {
        if (key) await upsertLog(key, { status: 'sent', attempts: attempt, last_error_code: null })
        return { ok: true, attempts: attempt }
      }
      lastCode = 'graph_' + r.status
      if (r.status === 429 || r.status >= 500) { await doSleep(backoff(attempt)); continue } // retryable
      break // non-retryable 4xx
    } catch (e) { lastCode = 'send_error'; await doSleep(backoff(attempt)) }
  }
  if (key) await upsertLog(key, { status: 'error', attempts: attempt, last_error_code: sanitizeCode(lastCode) })
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

module.exports = { __setIO, io, config, isConfigured, appToken, resetTokenCache, sendSystemEmail, status, sanitizeCode }
