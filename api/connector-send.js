'use strict'
// api/connector-send.js — send an email through the SIGNED-IN user's own
// connected mailbox (Gmail via Gmail API, or Outlook via Microsoft Graph).
// FROM the user's real connected address; lands in that mailbox's Sent
// folder; the send is logged to integration_events and (optionally) the
// contact timeline.
//
// SECURITY (Phase 1 + v2 corrections):
//   • Hard auth on every call (no AUTH_ENFORCE bypass).
//   • provider must be exactly 'gmail' or 'outlook' (else 400).
//   • Sender resolved from the authenticated JWT only; caller-supplied
//     agent_id is ignored. Org/system mailbox is not reachable here.
//   • Sending requires the user's own ACTIVE connection with a non-empty
//     account_email; a supplied From must match it.
//   • MIME header-injection guarded: CR/LF rejected in to/subject/from;
//     recipient must be a valid single address.
//   • contact_id timeline writes are authorized against existing contact
//     permissions BEFORE anything is sent or written (403/404 otherwise).
//   • CORS limited to APP_ORIGINS; provider errors sanitized.
// Body: { provider:'gmail'|'outlook', to, subject, html|text, from?, contact_id? }

const _connectors = require('./_lib/connectors')
const _auth = require('./_lib/auth')
const emailCrypto = require('./_lib/emailCrypto')
const _emailStore = require('./_lib/emailStore')
const { requireExternalEffects } = require('./_lib/externalEffects')

// Dependencies resolved through a single object so unit tests can override
// them in-process (there is no HTTP surface for this). Defaults are the real
// modules; __setDepsForTests is used only by the route test suite.
const deps = {
  requireUser: _auth.requireUser,
  logEvent: _connectors.logEvent,
  getAgentAccount: _connectors.getAgentAccount,
  freshAccountToken: _connectors.freshAccountToken,
  getAgentForUser: _connectors.getAgentForUser,
  contactAccess: _connectors.contactAccess,
  insertContactTimeline: _connectors.insertContactTimeline,
  persistOutboundGmail: _emailStore.persistOutboundGmail,
}

const ALLOWED_PROVIDERS = ['gmail', 'outlook']

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

function sanitize(msg) {
  return String(msg == null ? '' : msg)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|client_secret|id_token)"?\s*[:=]\s*"?[A-Za-z0-9._~+/=-]+/gi, '$1=[redacted]')
    .replace(/enc:v\d+:[A-Za-z0-9+/=]+/g, '[enc]')
    .slice(0, 300)
}

// Header-injection guard: no CR/LF allowed in any value used to build a
// MIME header (to, subject, from, and future cc/bcc).
function hasHeaderInjection(v) { return /[\r\n]/.test(String(v == null ? '' : v)) }

// Minimal single-address validator (no server-side util exists in-repo).
// Rejects whitespace/control chars; keeps Unicode subjects unaffected.
function isValidEmail(v) {
  const s = String(v == null ? '' : v)
  if (!s || /\s/.test(s) || hasHeaderInjection(s)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function json(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })

  // Hard authentication — always required.
  const user = await deps.requireUser(req)
  if (!user) return json(res, 401, { error: 'unauthorized' })

  try {
    const body = await parseBody(req)

    // (1) provider allowlist — never silently default.
    const provider = body.provider
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return json(res, 400, { error: "provider must be 'gmail' or 'outlook'" })
    }
    const acctProvider = provider === 'gmail' ? 'google' : 'outlook'

    const to = String(body.to || '').trim()
    const subject = String(body.subject || '').trim() || '(no subject)'
    const html = body.html || null
    const text = body.text || ''

    // (4) header-injection + recipient validation.
    if (hasHeaderInjection(to) || hasHeaderInjection(subject) || hasHeaderInjection(body.from)) {
      return json(res, 400, { error: 'invalid characters in email headers' })
    }
    if (!isValidEmail(to)) return json(res, 400, { error: 'invalid recipient address' })

    // Sender is the authenticated CRM user — never a caller-supplied agent_id.
    const agent = await deps.getAgentForUser(user.id)
    if (!agent || !agent.id) return json(res, 403, { error: 'no CRM agent is linked to this login' })

    // (2) Authorize contact BEFORE sending or writing anything.
    if (body.contact_id != null && body.contact_id !== '') {
      let access
      try { access = await deps.contactAccess(body.contact_id, agent) }
      catch (e) { return json(res, 500, { error: 'contact check failed' }) }
      if (!access.exists) return json(res, 404, { error: 'contact not found' })
      if (!access.allowed) return json(res, 403, { error: 'not authorized for that contact' })
    }

    // Require the user's own ACTIVE connection with a real From address.
    const acct = await deps.getAgentAccount(agent.id, acctProvider)
    if (!acct || acct.status !== 'connected') {
      return json(res, 400, { error: 'Connect your ' + (provider === 'gmail' ? 'Google' : 'Outlook') + ' account in Settings → Email Accounts first' })
    }
    const fromAccount = String(acct.account_email || '').trim()
    if (!fromAccount) {
      return json(res, 409, { error: 'Your connected account has no email address — reconnect it' })
    }
    if (body.from && String(body.from).trim().toLowerCase() !== fromAccount.toLowerCase()) {
      return json(res, 403, { error: 'From address is not authorized for your connected account' })
    }
    if (!requireExternalEffects(res)) return

    let token
    try {
      token = await deps.freshAccountToken(acctProvider, acct)
    } catch (e) {
      await deps.logEvent(acctProvider, 'out', 'email.send', { to, subject, error: sanitize(e.message) }, false)
      return json(res, 502, { error: 'Could not refresh your mailbox authorization — reconnect the account' })
    }

    if (provider === 'outlook') {
      const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: html ? 'HTML' : 'Text', content: html || text },
            toRecipients: [{ emailAddress: { address: to } }],
          },
          saveToSentItems: true,
        }),
      })
      if (r.status !== 202) {
        const errText = sanitize(await r.text())
        await deps.logEvent('outlook', 'out', 'email.send', { to, subject, error: errText }, false)
        return json(res, 502, { error: 'Graph sendMail failed: ' + errText })
      }
      // Microsoft Graph 202 is the AUTHORITATIVE acceptance point: the email
      // is already sent. Success telemetry must never convert that into a
      // failure, so it is best-effort and cannot reach the outer catch. Never
      // call Graph again from here.
      try {
        await deps.logEvent('outlook', 'out', 'email.send', { to, subject, from: fromAccount, agent_id: agent.id }, true)
      } catch (e) {
        console.warn('[connector-send] outlook send-event log failed after Graph 202: ' + sanitize(e.message))
      }
    } else {
      const mimeLines = [
        'To: ' + to,
        'Subject: ' + subject,
        'MIME-Version: 1.0',
        html ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
        '',
        html || text,
      ]
      const raw = Buffer.from(mimeLines.join('\r\n')).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })
      if (!r.ok) {
        const errText = sanitize(await r.text())
        await deps.logEvent('google', 'out', 'email.send', { to, subject, error: errText }, false)
        return json(res, 502, { error: 'Gmail send failed: ' + errText })
      }
      await deps.logEvent('google', 'out', 'email.send', { to, subject, from: fromAccount, agent_id: agent.id }, true)
      // Phase 3: best-effort, idempotent persistence of the sent message into
      // email_threads/messages/delivery_events. Only when token encryption is
      // configured; the owner is derived from the authenticated connection
      // (agent.id), never from the request. Never blocks the send response.
      if (emailCrypto.keyringFromEnv().keyConfigured) {
        let sendJson = {}
        try { sendJson = await r.json() } catch (e) { sendJson = {} }
        try {
          await deps.persistOutboundGmail(agent.id, {
            to, subject, html, text, fromAccount,
            providerMessageId: sendJson.id, providerThreadId: sendJson.threadId, token,
          })
        } catch (e) { console.warn('[connector-send] outbound persist skipped: ' + sanitize(e.message)) }
      }
    }

    // Contact timeline entry — already authorized above.
    if (body.contact_id != null && body.contact_id !== '') {
      try {
        await deps.insertContactTimeline({ contactId: body.contact_id, provider, subject, to, fromAccount })
      } catch (e) { console.warn('[connector-send] timeline log failed: ' + sanitize(e.message)) }
    }

    return json(res, 200, { ok: true, provider, from: fromAccount })
  } catch (e) {
    console.error('[connector-send] ' + sanitize(e.message))
    return json(res, 500, { error: 'send failed' })
  }
}

module.exports = handler
module.exports.__setDepsForTests = (d) => { Object.assign(deps, d) }
