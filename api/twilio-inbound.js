const { createClient } = require('@supabase/supabase-js')
const querystring = require('querystring')

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end',  () => resolve(data))
    req.on('error', reject)
  })
}

const wrap = (xml) => `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`
const say  = (t)   => `<Say voice="Polly.Joanna">${t}</Say>`

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(wrap(say('Invalid request.')))

  // Create supabase client inside handler so missing env vars dont crash on load
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  let body = {}
  try { const raw = await getRawBody(req); body = querystring.parse(raw) } catch(e) { body = req.body || {} }

  const from    = body.From    || ''
  const to      = body.To      || ''
  const callSid = body.CallSid || ''

  try {
    // Log the call
    await supabase.from('calls').insert({
      twilio_call_sid: callSid, from_number: from, to_number: to,
      direction: 'Inbound', status: 'in-progress', called_at: new Date().toISOString(),
    })

    // Look up caller in contacts
    const cleanPhone = from.replace(/\D/g, '').slice(-10)
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, agent_id, agents(id,name)')
      .or(`phone.ilike.%${cleanPhone}%`)
      .maybeSingle()

    // Load active IVR config
    const { data: ivr } = await supabase
      .from('phone_ivr').select('*').eq('is_active', true).maybeSingle()

    // Contact match — route to assigned agent
    if (contact && contact.agent_id) {
      const { data: ext } = await supabase
        .from('phone_extensions').select('*')
        .eq('agent_id', contact.agent_id).eq('active', true).maybeSingle()
      if (ext && ext.forward_to) {
        const name = (contact.agents && contact.agents.name) ? contact.agents.name.split(' ')[0] : 'your agent'
        return res.send(wrap(
          say('One moment, connecting you to ' + name + '.') +
          '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
            '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + ext.forward_to + '</Number>' +
          '</Dial>' +
          say(ext.voicemail_greeting || 'Please leave your message after the tone.') +
          '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'
        ))
      }
    }

    // No match — play IVR menu
    const greeting = (ivr && ivr.greeting_text) ||
      'Thank you for calling Target Team. For sales press 1. For any available agent press 0. To leave a voicemail press 9.'
    return res.send(wrap(
      '<Gather numDigits="1" action="/api/twilio-menu" method="POST" timeout="10">' +
        say(greeting) +
      '</Gather>' +
      say('We did not receive your selection. Please call back and try again.')
    ))

  } catch(err) {
    console.error('twilio-inbound error:', err.message)
    return res.send(wrap(say('We are experiencing technical difficulties. Please try again shortly.')))
  }
}
