// ═══════════════════════════════════════════════════════════════
// /api/twilio-inbound — Handles all inbound calls from Twilio
// 1. Looks up the caller in Supabase contacts by phone number
// 2. If contact found with assigned agent → routes to that agent
// 3. If no match → plays IVR menu
// 4. Logs the call to Supabase
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const from     = req.body?.From || ''
  const to       = req.body?.To || ''
  const callSid  = req.body?.CallSid || ''
  const digits   = req.body?.Digits || ''

  try {
    // ── 1. Log the call ──────────────────────────────────────
    const { data: callLog } = await supabase.from('calls').insert({
      twilio_call_sid: callSid,
      from_number:     from,
      to_number:       to,
      direction:       'Inbound',
      status:          'in-progress',
      called_at:       new Date().toISOString(),
    }).select().single()

    // ── 2. Look up caller in contacts ────────────────────────
    const cleanPhone = from.replace(/\D/g, '').slice(-10)
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, agent_id, agents(id,name)')
      .or(`phone.ilike.%${cleanPhone}%`)
      .maybeSingle()

    // ── 3. Look up routing rules + IVR ───────────────────────
    const { data: ivr } = await supabase
      .from('phone_ivr')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    // ── 4. If caller is a known contact with assigned agent → route directly ──
    if (contact?.agent_id && process.env.TWILIO_CONTACT_MATCH_ENABLED !== 'false') {
      const { data: agentExt } = await supabase
        .from('phone_extensions')
        .select('*')
        .eq('agent_id', contact.agent_id)
        .eq('active', true)
        .maybeSingle()

      if (agentExt?.forward_to) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">One moment, connecting you to your agent.</Say>
  <Dial callerId="${to}" timeout="30" record="record-from-answer">
    <Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">${agentExt.forward_to}</Number>
  </Dial>
  <Say voice="Polly.Joanna">Your agent is unavailable. Please leave a message after the tone.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />
</Response>`
        res.setHeader('Content-Type', 'text/xml')
        return res.status(200).send(twiml)
      }
    }

    // ── 5. Play IVR menu ─────────────────────────────────────
    const greeting = ivr?.greeting_text || 'Thank you for calling. Press 1 for sales, or press 0 to speak with the next available agent.'
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="/api/twilio-menu" method="POST" timeout="10">
    <Say voice="Polly.Joanna">${greeting}</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive your selection. Please call back and try again.</Say>
</Response>`

    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send(twiml)

  } catch(err) {
    console.error('twilio-inbound error:', err)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>We're experiencing technical difficulties. Please try again.</Say></Response>`
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send(twiml)
  }
}
