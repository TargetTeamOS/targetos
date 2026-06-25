// /api/twilio-menu — Handles IVR keypress and routes accordingly
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const digits = req.body?.Digits || ''
  const from   = req.body?.From || ''
  const to     = req.body?.To || ''

  try {
    const { data: ivr } = await supabase.from('phone_ivr').select('*').eq('is_active', true).maybeSingle()
    const options = ivr?.menu_options || []
    const chosen  = options.find(o => o.key === digits)

    let twiml = ''

    if (!chosen) {
      twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Invalid selection. Please try again.</Say><Redirect>/api/twilio-inbound</Redirect></Response>`
    } else if (chosen.action === 'voicemail') {
      twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Please leave your message after the tone.</Say><Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" /></Response>`
    } else if (chosen.action === 'extension') {
      const { data: ext } = await supabase.from('phone_extensions').select('*').eq('number', chosen.value).eq('active', true).maybeSingle()
      if (ext?.forward_to) {
        twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Connecting you to ${ext.label}.</Say><Dial callerId="${to}" timeout="30" record="record-from-answer"><Number>${ext.forward_to}</Number></Dial><Say voice="Polly.Joanna">${ext.voicemail_greeting || 'Please leave a message.'}</Say><Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" /></Response>`
      } else {
        twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">That extension is unavailable. Please try another option.</Say><Redirect>/api/twilio-inbound</Redirect></Response>`
      }
    } else if (chosen.action === 'round_robin') {
      // Get available agents from routing rule
      const { data: rule } = await supabase.from('phone_routing').select('*').eq('rule_type', 'round_robin').eq('is_active', true).maybeSingle()
      const agentIds = rule?.config?.agent_ids || []
      if (agentIds.length > 0) {
        // Simple round robin: use call count to determine next agent
        const callCount = await supabase.from('calls').select('agent_id').eq('direction','Inbound').in('agent_id', agentIds)
        const counts = {}
        agentIds.forEach(id => counts[id] = 0)
        ;(callCount.data || []).forEach(c => { if (counts[c.agent_id] !== undefined) counts[c.agent_id]++ })
        const nextAgentId = agentIds.reduce((a, b) => counts[a] <= counts[b] ? a : b)
        const { data: ext } = await supabase.from('phone_extensions').select('*').eq('agent_id', nextAgentId).eq('active', true).maybeSingle()
        if (ext?.forward_to) {
          twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Connecting you to the next available agent.</Say><Dial callerId="${to}" timeout="30" record="record-from-answer"><Number>${ext.forward_to}</Number></Dial><Say voice="Polly.Joanna">Please leave a message.</Say><Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" /></Response>`
        }
      }
      if (!twiml) twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">All agents are currently unavailable. Please leave a message.</Say><Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" /></Response>`
    } else {
      twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect>/api/twilio-inbound</Redirect></Response>`
    }

    res.setHeader('Content-Type', 'text/xml')
    res.status(200).send(twiml)
  } catch(err) {
    console.error('twilio-menu error:', err)
    res.setHeader('Content-Type', 'text/xml')
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Error. Please call back.</Say></Response>`)
  }
}
