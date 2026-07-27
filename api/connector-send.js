'use strict'
// api/connector-send.js — send an email through the SIGNED-IN user's own
// connected mailbox (Gmail via Gmail API, or Outlook via Microsoft Graph).
// The message goes out FROM the user's real connected address and lands in
// that mailbox's Sent folder; TargetOS logs the send to integration_events
// and (optionally) the contact timeline.
//
// PHASE 1 HARDENING (Connected Email):
//   • Hard auth on every call — no AUTH_ENFORCE log-only bypass here.
//   • The sender is resolved from the authenticated Supabase JWT ONLY.
//     A caller-supplied agent_id is ignored (it is not authorization).
//   • Sending is allowed only through an ACTIVE connection owned by that
//     CRM user. The org/office ("system") mailbox is NOT reachable from
//     this user route — automations use the server-only system pathway.
//   • Any supplied From must match the connected account; else rejected.
//   • CORS is restricted to the app's approved origin(s), not '*'.
//   • Provider errors are sanitized before logging or returning.
// Body: { provider:'outlook'|'gmail', to, subject, html|text, from?, contact_id? }

const {
  logEvent, sb, getAgentAccount, freshAccountToken, agentIdFromAuthUser,
} = require('./_lib/connectors')
const { requireUser } = require('./_lib/auth')

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

// Strip anything token-like from provider error text before it is logged
// or returned to the client.
function sanitize(msg) {
  return String(msg == null ? '' : msg)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|client_secret|id_token)"?\s*[:=]\s*"?[A-Za-z0-9._~+/=-]+/gi, '$1=[redacted]')
    .replace(/enc:v\d+:[A-Za-z0-9+/=]+/g, '[enc]')
    .slice(0, 300)
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

module.exports = async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'Method not allowed' })) }
  res.setHeader('Content-Type', 'application/json')

  // Hard authentication — always required, no log-only bypass.
  const user = await requireUser(req)
  if (!user) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' })) }

  try {
    const body = await parseBody(req)
    const provider = body.provider === 'gmail' ? 'gmail' : 'outlook'
    const acctProvider = provider === 'gmail' ? 'google' : 'outlook'
    const to = String(body.to || '').trim()
    const subject = String(body.subject || '').trim() || '(no subject)'
    const html = body.html || null
    const text = body.text || ''
    if (!to) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'missing "to"' })) }

    // Sender is the authenticated CRM user — never a caller-supplied agent_id.
    const senderAgentId = await agentIdFromAuthUser(user.id)
    if (!senderAgentId) { res.statusCode = 403; return res.end(JSON.stringify({ error: 'no CRM agent is linked to this login' })) }

    const acct = await getAgentAccount(senderAgentId, acctProvider)
    if (!acct || acct.status !== 'connected') {
      res.statusCode = 400
      return res.end(JSON.stringify({ error: 'Connect your ' + (provider === 'gmail' ? 'Google' : 'Outlook') + ' account in Settings → Email Accounts first' }))
    }

    // From-address authorization: a supplied From must be the user's own
    // connected address. Otherwise we always send as the connected account.
    const fromAccount = String(acct.account_email || '').trim()
    if (body.from && String(body.from).trim().toLowerCase() !== fromAccount.toLowerCase()) {
      res.statusCode = 403
      return res.end(JSON.stringify({ error: 'From address is not authorized for your connected account' }))
    }

    let token
    try {
      token = await freshAccountToken(acctProvider, acct)
    } catch (e) {
      await logEvent(acctProvider, 'out', 'email.send', { to, subject, error: sanitize(e.message) }, false)
      res.statusCode = 502
      return res.end(JSON.stringify({ error: 'Could not refresh your mailbox authorization — reconnect the account' }))
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
        await logEvent('outlook', 'out', 'email.send', { to, subject, error: errText }, false)
        res.statusCode = 502; return res.end(JSON.stringify({ error: 'Graph sendMail failed: ' + errText }))
      }
      await logEvent('outlook', 'out', 'email.send', { to, subject, from: fromAccount, agent_id: senderAgentId }, true)
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
        await logEvent('google', 'out', 'email.send', { to, subject, error: errText }, false)
        res.statusCode = 502; return res.end(JSON.stringify({ error: 'Gmail send failed: ' + errText }))
      }
      await logEvent('google', 'out', 'email.send', { to, subject, from: fromAccount, agent_id: senderAgentId }, true)
    }

    // CRM timeline entry on the contact, if one was given.
    if (body.contact_id) {
      try {
        await sb().from('tasks').insert([{
          contact_id: body.contact_id,
          title: 'Email sent via ' + (provider === 'gmail' ? 'Gmail' : 'Outlook') + ': ' + subject,
          notes: 'To: ' + to + ' — from ' + fromAccount,
          priority: 'note',
          status: 'done',
        }])
      } catch (e) { console.warn('[connector-send] timeline log failed: ' + sanitize(e.message)) }
    }

    res.statusCode = 200
    res.end(JSON.stringify({ ok: true, provider, from: fromAccount }))
  } catch (e) {
    console.error('[connector-send] ' + sanitize(e.message))
    res.statusCode = 500; res.end(JSON.stringify({ error: 'send failed' }))
  }
}
