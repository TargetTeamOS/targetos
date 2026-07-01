// TargetOS V2 — Receive inbound SMS from Twilio
// Configure this URL in Twilio Console → Phone Numbers → Messaging → Webhook
'use strict'
const querystring = require('querystring')
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  let body = {}
  try {
    const raw = await new Promise((ok,err) => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err) })
    body = querystring.parse(raw)
  } catch(e) { body = req.body || {} }

  const from = body.From || ''
  const text = body.Body || ''
  const to   = body.To   || ''

  if (from && text) {
    try {
      const { createClient } = require('@supabase/supabase-js')
      const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
      if (url && key) {
        const sb = createClient(url, key)
        // Find contact by phone number
        const clean = from.replace(/\D/g,'').slice(-10)
        const { data: contact } = await sb.from('contacts').select('id').or('phone.ilike.%'+clean+'%').maybeSingle()
        // Store message
        await sb.from('sms_messages').insert({
          twilio_sid:   body.SmsSid || body.MessageSid || '',
          direction:    'inbound',
          from_number:  from,
          to_number:    to,
          body:         text,
          status:       'received',
          contact_id:   contact?.id || null,
          created_at:   new Date().toISOString(),
        })
        // Log to contact activity if found
        if (contact?.id) {
          await sb.from('activity_log').insert({
            table_name: 'contacts', record_id: contact.id,
            action: 'sms_received',
            metadata: JSON.stringify({ body: text, from }),
            created_at: new Date().toISOString(),
          })
        }
      }
    } catch(e) { console.warn('sms inbound save:', e.message) }
  }

  // Return empty TwiML — no auto-reply
  return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
}
