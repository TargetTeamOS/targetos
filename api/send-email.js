'use strict'
// Vercel Serverless Function — proxies email sending to Resend
const { requireAnyAgent } = require('./_lib/phone')

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
  // HARDENED (July 2026): caller authentication with staged rollout,
  // same pattern as TWILIO_SIG_ENFORCE. Log-only until AUTH_ENFORCE
  // is set to 'true' in Vercel — watch logs for '[AUTH]' lines, flip
  // the env var when clean. Kill-switch: set it back to 'false'.
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

  // CRITICAL: forwards straight to Resend, sending real email from
  // the business's verified domain to any recipient. Had ZERO auth
  // until July 2026.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) {
    console.error('[send-email] RESEND_API_KEY not set in environment variables')
    return res.status(500).json({ error: 'Email service not configured' })
  }

  try {
    const emailPayload = await parseBody(req)
    const response = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify(emailPayload),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Send failed' })
    return res.status(200).json({ success: true, id: data.id })
  } catch(err) {
    return res.status(500).json({ error: err.message })
  }
}
