// TargetOS V2 — Send SMS via Twilio
'use strict'
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  const { to, body, contactId, agentId } = req.body || {}
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
