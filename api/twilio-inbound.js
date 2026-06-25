// /api/twilio-inbound — Inbound call handler
import { createClient } from '@supabase/supabase-js'
import qs from 'qs'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Disable default body parser — we handle it manually
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const wrap = (xml) => `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`
const say  = (t)   => `<Say voice="Polly.Joanna">${t}</Say>`

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(wrap(say('Invalid request.')))

  // Parse urlencoded body from Twilio
  const rawBody = await getRawBody(req)
  const body    = qs.parse(rawBody)

  const from    = body.From    || ''
  const to      = body.To      || ''
  const callSid = body.CallSid || ''

  try {
    // 1. Log the call
    await supabase.from('calls').insert({
      twilio_call_sid: callSid,
      from_number:     from,
      to_number:       to,
      direction:       'Inbound',
      status:          'in-progress',
      called_at:       new Date().toISOString(),
    })

    // 2. Look up caller in contacts
    const cleanPhone = from.replace(/\D/g, '').slice(-10)
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, agent_id, agents(id,name)')
      .or(`phone.ilike.%${cleanPhone}%`)
      .maybeSingle()

    // 3. Load active IVR
    const { data: ivr } = await supabase
      .from('phone_ivr')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()

    // 4. Contact match — route to assigned agent directly
    if (contact?.agent_id) {
      const { data: ext } = await supabase
        .from('phone_extensions')
        .select('*')
        .eq('agent_id', contact.agent_id)
        .eq('active', true)
        .maybeSingle()

      if (ext?.forward_to) {
        const firstName = contact.agents?.name?.split(' ')[0] || 'your agent'
        return res.send(wrap(
          `${say('One moment, connecting you to ' + firstName + '.')}
           <Dial callerId="${to}" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">
             <Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">${ext.forward_to}</Number>
           </Dial>
           ${say(ext.voicemail_greeting || 'Please leave your message after the tone.')}
           <Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />`
        ))
      }
    }

    // 5. No match — play IVR menu
    const greeting = ivr?.greeting_text ||
      'Thank you for calling Target Team. For sales press 1. To reach any available agent press 0. To leave a voicemail press 9.'

    return res.send(wrap(
      `<Gather numDigits="1" action="/api/twilio-menu" method="POST" timeout="10">
         ${say(greeting)}
       </Gather>
       ${say('We did not receive your selection. Please call back and try again.')}`
    ))

  } catch(err) {
    console.error('twilio-inbound error:', err.message)
    return res.send(wrap(say('We are experiencing technical difficulties. Please try your call again.')))
  }
}
