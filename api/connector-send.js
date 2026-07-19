'use strict'
// api/connector-send.js — send an email through the connected mailbox
// (Outlook via Microsoft Graph, or Gmail). The message comes FROM the
// official account and lands in its Sent folder; TargetOS logs the
// send to integration_events + the contact's timeline (tasks, priority
// 'note') so tracking lives in the CRM per Yanky's spec.
// Body: { provider: 'outlook'|'gmail', to, subject, html|text, contact_id? }

const { getIntegration, freshMicrosoftToken, freshGoogleToken, logEvent, sb, getAgentAccount, freshAccountToken, agentIdFromAuthUser } = require('./_lib/connectors')

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
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const body = await parseBody(req)
    const provider = body.provider === 'gmail' ? 'gmail' : 'outlook'
    const to = String(body.to || '').trim()
    const subject = String(body.subject || '').trim() || '(no subject)'
    const html = body.html || null
    const text = body.text || ''
    if (!to) { res.status(400).json({ error: 'missing "to"' }); return }

    let fromAccount = ''

    // Whose mailbox? The signed-in agent's own connected account wins;
    // the org-level (office) account is the fallback.
    let senderAgentId = body.agent_id || null
    if (!senderAgentId && __user) senderAgentId = await agentIdFromAuthUser(__user.id)

    if (provider === 'outlook') {
      let token = null
      const acct = senderAgentId ? await getAgentAccount(senderAgentId, 'outlook') : null
      if (acct && acct.status === 'connected') {
        token = await freshAccountToken('outlook', acct)
        fromAccount = acct.account_email || 'Outlook'
      } else {
        const integ = await getIntegration('outlook')
        if (!integ || integ.status !== 'connected') { res.status(400).json({ error: 'Outlook is not connected — connect your account in Settings, or the office account in Admin → Connectors' }); return }
        token = await freshMicrosoftToken(integ)
        fromAccount = (integ.secrets || {}).account_email || 'Outlook'
      }
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
        const errText = await r.text()
        await logEvent('outlook', 'out', 'email.send', { to, subject, error: errText }, false)
        res.status(502).json({ error: 'Graph sendMail failed: ' + errText.slice(0, 300) }); return
      }
      await logEvent('outlook', 'out', 'email.send', { to, subject, from: fromAccount }, true)
    } else {
      let token = null
      const acct = senderAgentId ? await getAgentAccount(senderAgentId, 'google') : null
      if (acct && acct.status === 'connected') {
        token = await freshAccountToken('google', acct)
        fromAccount = acct.account_email || 'Gmail'
      } else {
        const integ = await getIntegration('google')
        if (!integ || integ.status !== 'connected') { res.status(400).json({ error: 'Google is not connected — connect your account in Settings, or the office account in Admin → Connectors' }); return }
        token = await freshGoogleToken(integ)
        fromAccount = (integ.secrets || {}).account_email || 'Gmail'
      }
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
        const errText = await r.text()
        await logEvent('google', 'out', 'email.send', { to, subject, error: errText }, false)
        res.status(502).json({ error: 'Gmail send failed: ' + errText.slice(0, 300) }); return
      }
      await logEvent('google', 'out', 'email.send', { to, subject, from: fromAccount }, true)
    }

    // CRM timeline entry on the contact, if one was given
    if (body.contact_id) {
      try {
        await sb().from('tasks').insert([{
          contact_id: body.contact_id,
          title: 'Email sent via ' + (provider === 'gmail' ? 'Gmail' : 'Outlook') + ': ' + subject,
          notes: 'To: ' + to + ' — from ' + fromAccount,
          priority: 'note',
          status: 'done',
        }])
      } catch (e) { console.warn('[connector-send] timeline log failed: ' + e.message) }
    }

    res.status(200).json({ ok: true, provider, from: fromAccount })
  } catch (e) {
    console.error('[connector-send] ' + e.message)
    res.status(500).json({ error: e.message })
  }
}
