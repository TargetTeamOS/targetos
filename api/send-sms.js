// TargetOS V2 — Send SMS via Twilio
'use strict'
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
  // HARDENED (July 2026): require a logged-in user — this endpoint
  // was previously callable by anyone who found the URL.
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) { res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' })) }
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  // CRITICAL: this sends a real SMS from the business number to any
  // number, using real Twilio credits. Had ZERO auth until July 2026.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const { to, body, contactId, agentId } = await parseBody(req)
  if (!to || !body) return res.status(400).json({ error:'to and body required' })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  if (!accountSid || !authToken) return res.status(500).json({ error:'Twilio not configured' })

  try {
    const auth = 'Basic ' + Buffer.from(accountSid+':'+authToken).toString('base64')
    const params = new URLSearchParams({ To: to, From: fromNumber, Body: body })
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/'+accountSid+'/Messages.json', {
      method:'POST', headers:{ Authorization: auth, 'Content-Type':'application/x-www-form-urlencoded' }, body: params.toString()
    })
    const d = await r.json()
    if (!r.ok) return res.status(400).json({ error: d.message })

    // Save to sms_messages table
    const { createClient } = require('@supabase/supabase-js')
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    if (url && key) {
      const sb = createClient(url, key)
      await sb.from('sms_messages').insert({
        twilio_sid:   d.sid,
        direction:    'outbound',
        from_number:  fromNumber,
        to_number:    to,
        body,
        status:       d.status,
        contact_id:   contactId || null,
        agent_id:     agentId   || null,
        created_at:   new Date().toISOString(),
      }).catch(e => console.warn('sms save:', e.message))
    }

    return res.status(200).json({ ok:true, sid: d.sid, status: d.status })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
