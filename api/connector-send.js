'use strict'

// Sends through the authenticated CRM user's own connected mailbox.
// Caller-supplied agent_id and organization-level fallback accounts are never
// trusted by this personal-send route.

const connectors = require('./_lib/connectors')
const auth = require('./_lib/auth')
const { requireExternalEffects } = require('./_lib/externalEffects')

const deps = {
  authenticate: auth.authenticate,
  logEvent: connectors.logEvent,
  getAgentAccount: connectors.getAgentAccount,
  freshAccountToken: connectors.freshAccountToken,
  contactAccess: connectors.contactAccess,
  insertContactTimeline: connectors.insertContactTimeline,
}

const ALLOWED_PROVIDERS = ['gmail', 'outlook']

function allowedOrigins(env = process.env) {
  return String(env.APP_ORIGINS || 'https://app.targetreteam.com')
    .split(',').map(value => value.trim()).filter(Boolean)
}

function applyCors(req, res) {
  const origin = req.headers.origin || ''
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sanitize(message) {
  return String(message == null ? '' : message)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|client_secret|id_token)"?\s*[:=]\s*"?[A-Za-z0-9._~+/=-]+/gi, '$1=[redacted]')
    .slice(0, 300)
}

function hasHeaderInjection(value) {
  return /[\r\n]/.test(String(value == null ? '' : value))
}

function isValidEmail(value) {
  const email = String(value == null ? '' : value)
  return !!email && !/\s/.test(email) && !hasHeaderInjection(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function json(res, status, body) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise(resolve => {
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

  const identity = await deps.authenticate(req)
  if (!identity.ok) return json(res, identity.status, { error: identity.error })

  try {
    const body = await parseBody(req)
    const provider = body.provider
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      return json(res, 400, { error: "provider must be 'gmail' or 'outlook'" })
    }
    const accountProvider = provider === 'gmail' ? 'google' : 'outlook'
    const to = String(body.to || '').trim()
    const subject = String(body.subject || '').trim() || '(no subject)'
    const html = body.html || null
    const text = body.text || ''
    const parseAddrs = value => (Array.isArray(value) ? value : String(value || '').split(','))
      .map(address => address.trim()).filter(Boolean)
    const cc = parseAddrs(body.cc)
    const bcc = parseAddrs(body.bcc)
    const attachments = Array.isArray(body.attachments) ? body.attachments.filter(attachment => attachment?.base64) : []

    if (hasHeaderInjection(to) || hasHeaderInjection(subject) || hasHeaderInjection(body.from)
      || [...cc, ...bcc].some(hasHeaderInjection)
      || attachments.some(attachment => hasHeaderInjection(attachment.filename) || hasHeaderInjection(attachment.contentType))) {
      return json(res, 400, { error: 'invalid characters in email headers' })
    }
    if (!isValidEmail(to) || [...cc, ...bcc].some(address => !isValidEmail(address))) {
      return json(res, 400, { error: 'invalid recipient address' })
    }
    let providerMessageId = null
    let providerThreadId = null

    const agent = identity.agent
    if (body.contact_id != null && body.contact_id !== '') {
      let access
      try { access = await deps.contactAccess(body.contact_id, agent) }
      catch { return json(res, 500, { error: 'contact check failed' }) }
      if (!access.exists) return json(res, 404, { error: 'contact not found' })
      if (!access.allowed) return json(res, 403, { error: 'not authorized for that contact' })
    }

    // Always use the authenticated agent's personal connector. body.agent_id
    // is intentionally ignored.
    const account = await deps.getAgentAccount(agent.id, accountProvider)
    if (!account || account.status !== 'connected') {
      return json(res, 400, { error: 'Connect your ' + (provider === 'gmail' ? 'Google' : 'Outlook') + ' account first' })
    }
    const fromAccount = String(account.account_email || '').trim()
    if (!fromAccount) return json(res, 409, { error: 'Connected account has no email address; reconnect it' })
    if (body.from && String(body.from).trim().toLowerCase() !== fromAccount.toLowerCase()) {
      return json(res, 403, { error: 'From address is not authorized for your connected account' })
    }
    if (!requireExternalEffects(res)) return

    let token
    try { token = await deps.freshAccountToken(accountProvider, account) }
    catch (error) {
      await deps.logEvent(accountProvider, 'out', 'email.send', { to, subject, error: sanitize(error.message) }, false)
      return json(res, 502, { error: 'Could not refresh mailbox authorization; reconnect the account' })
    }

    if (provider === 'outlook') {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: html ? 'HTML' : 'Text', content: html || text },
            toRecipients: [{ emailAddress: { address: to } }],
            ...(cc.length ? { ccRecipients: cc.map(a => ({ emailAddress: { address: a } })) } : {}),
            ...(bcc.length ? { bccRecipients: bcc.map(a => ({ emailAddress: { address: a } })) } : {}),
            ...(attachments.length ? { attachments: attachments.map(a => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: a.filename || 'attachment',
              contentType: a.contentType || 'application/octet-stream',
              contentBytes: a.base64,
            })) } : {}),
          },
          saveToSentItems: true,
        }),
      })
      if (response.status !== 202) {
        const detail = sanitize(await response.text())
        await deps.logEvent('outlook', 'out', 'email.send', { to, subject, error: detail }, false)
        return json(res, 502, { error: 'Graph sendMail failed: ' + detail })
      }
      try { await deps.logEvent('outlook', 'out', 'email.send', { to, subject, from: fromAccount, agent_id: agent.id }, true) }
      catch (error) { console.warn('[connector-send] send-event log failed: ' + sanitize(error.message)) }
    } else {
      let raw
      if (attachments.length) {
        const boundary = 'targetos_' + Date.now().toString(36)
        const parts = [
          'To: ' + to,
          ...(cc.length ? ['Cc: ' + cc.join(', ')] : []),
          ...(bcc.length ? ['Bcc: ' + bcc.join(', ')] : []),
          'Subject: ' + subject,
          'MIME-Version: 1.0',
          'Content-Type: multipart/mixed; boundary="' + boundary + '"',
          '',
          '--' + boundary,
          html ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
          '',
          html || text,
          '',
        ]
        for (const attachment of attachments) {
          parts.push(
            '--' + boundary,
            'Content-Type: ' + (attachment.contentType || 'application/octet-stream'),
            'Content-Transfer-Encoding: base64',
            'Content-Disposition: attachment; filename="' + (attachment.filename || 'attachment') + '"',
            '',
            attachment.base64,
            '',
          )
        }
        parts.push('--' + boundary + '--')
        raw = Buffer.from(parts.join('\r\n')).toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      } else {
        const mimeLines = [
          'To: ' + to,
          ...(cc.length ? ['Cc: ' + cc.join(', ')] : []),
          ...(bcc.length ? ['Bcc: ' + bcc.join(', ')] : []),
          'Subject: ' + subject,
          'MIME-Version: 1.0',
          html ? 'Content-Type: text/html; charset=UTF-8' : 'Content-Type: text/plain; charset=UTF-8',
          '',
          html || text,
        ]
        raw = Buffer.from(mimeLines.join('\r\n')).toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      }
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })
      if (!response.ok) {
        const detail = sanitize(await response.text())
        await deps.logEvent('google', 'out', 'email.send', { to, subject, error: detail }, false)
        return json(res, 502, { error: 'Gmail send failed: ' + detail })
      }
      const sentData = await response.json().catch(() => ({}))
      providerMessageId = sentData.id || null
      providerThreadId = sentData.threadId || null
      try {
        await deps.logEvent('google', 'out', 'email.send', {
          to, subject, from: fromAccount, agent_id: agent.id, message_id: providerMessageId,
        }, true)
      } catch (error) {
        console.warn('[connector-send] send-event log failed: ' + sanitize(error.message))
      }
    }

    if (body.contact_id != null && body.contact_id !== '') {
      try { await deps.insertContactTimeline({ contactId: body.contact_id, provider, subject, to, fromAccount }) }
      catch (error) { console.warn('[connector-send] timeline log failed: ' + sanitize(error.message)) }
    }
    return json(res, 200, {
      ok: true,
      provider,
      from: fromAccount,
      cc,
      bcc,
      attachments: attachments.map(attachment => attachment.filename),
      providerMessageId,
      providerThreadId,
    })
  } catch (error) {
    console.error('[connector-send] ' + sanitize(error.message))
    return json(res, 500, { error: 'send failed' })
  }
}

module.exports = handler
module.exports.__setDepsForTests = overrides => { Object.assign(deps, overrides) }
module.exports.__private = { allowedOrigins, hasHeaderInjection, isValidEmail, sanitize }
