// TargetOS V2 — Receive inbound SMS from Twilio
// Configure this URL in Twilio Console → Phone Numbers → Messaging → Webhook
'use strict'
const querystring = require('querystring')
const { createServiceClient } = require('./_lib/supabaseConfig')
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  let body = {}
  try {
    const raw = await new Promise((ok,err) => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err) })
    body = querystring.parse(raw)
  } catch(e) { body = req.body || {} }
  if (!require('./_lib/phone').checkTwilioSignature(req, res, body, 'twilio-sms-inbound')) return

  const from = body.From || ''
  const text = body.Body || ''
  const to   = body.To   || ''

  if (from && text) {
    let sb
    try {
      sb = createServiceClient()
    } catch (error) {
      res.statusCode = error.status || 503
      return res.end('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
    }
    try {
      // Find contact by phone number -- reuse lookupContact (fixed
      // to search every phone format variant), not a raw-digit-only
      // query that can never match the punctuated storage format.
      const { lookupContact } = require('./_lib/phone')
      const contact = await lookupContact(sb, from)
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
    } catch(e) { console.warn('sms inbound save:', e.message) }
  }

  // Return empty TwiML — no auto-reply
  return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
}
