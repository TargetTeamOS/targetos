// ═══════════════════════════════════════════════════════════════
// /api/twilio-inbound — Inbound call handler
// • Validates Twilio webhook signature
// • Looks up caller in contacts DB
// • Routes to assigned agent OR plays IVR
// • Logs every call to Supabase
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

const twiml = (xml) => `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`
const say   = (text) => `<Say voice="Polly.Joanna">${text}</Say>`

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(twiml(say('Method not allowed.')))

  // Validate Twilio signature in production
  if (process.env.TWILIO_AUTH_TOKEN) {
    const validator  = new twilio.webhooks.WebhookClient(process.env.TWILIO_AUTH_TOKEN)
    const url        = `https://${req.headers.host}/api/twilio-inbound`
    const isValid    = validator.validate(url, req.body, req.headers['x-twilio-signature'] || '')
    if (!isValid) return res.status(403).send(twiml(say('Unauthorized.')))
  }

  const from    = req.body?.From || ''
  const to      = req.body?.To  || ''
  const callSid = req.body?.CallSid || ''

  try {
    // ── 1. Log the call ──────────────────────────────────────
    await supabase.from('calls').insert({
      twilio_call_sid: callSid,
      from_number:     from,
      to_number:       to,
      direction:       'Inbound',
      status:          'in-progress',
      called_at:       new Date().toISOString(),
    })

    // ── 2. Look up caller in contacts ────────────────────────
    const cleanPhone = from.replace(/\D/g, '').slice(-10)
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, agent_id, agents(id, name)')
      .or(`phone.ilike.%${cleanPhone}%`)
      .maybeSingle()

    // ── 3. Load IVR config ───────────────────────────────────
    const { data: ivr } = await supabase
      .from('phone_ivr')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    // ── 4. Contact match → route directly to assigned agent ──
    if (contact?.agent_id) {
      const { data: ext } = await supabase
        .from('phone_extensions')
        .select('*')
        .eq('agent_id', contact.agent_id)
        .eq('active', true)
        .maybeSingle()

      if (ext?.forward_to) {
        const agentName = contact.agents?.name?.split(' ')[0] || 'your agent'
        return res.status(200).send(twiml(
          `${say(`One moment, connecting you to ${agentName}.`)}
          <Dial callerId="${to}" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">
            <Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">${ext.forward_to}</Number>
          </Dial>
          ${say(ext.voicemail_greeting || 'Please leave your message after the tone.')}
          <Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />`
        ))
      }
    }

    // ── 5. No match → IVR menu ───────────────────────────────
    const greeting = ivr?.greeting_text ||
      'Thank you for calling Target Team. To reach the sales team, press 1. For a specific agent extension, press 2. To leave a voicemail, press 9.'

    return res.status(200).send(twiml(
      `<Gather numDigits="1" action="/api/twilio-menu" method="POST" timeout="10">
        ${say(greeting)}
      </Gather>
      ${say('We did not receive your selection. Please call back and try again.')}`
    ))

  } catch (err) {
    console.error('twilio-inbound error:', err)
    return res.status(200).send(twiml(say('We are experiencing technical difficulties. Please try your call again.')))
  }
}
