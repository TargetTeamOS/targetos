const querystring = require('querystring')
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const wrap = (xml) => `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`
const say  = (t)   => `<Say voice="Polly.Joanna">${t}</Say>`
const vmXml = say('Please leave your message after the tone.') + '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  const digits = body.Digits || ''
  const to     = body.To     || ''
  if (digits === '9') return res.send(wrap(vmXml))

  const supabase = getSupabase()
  if (!supabase) return res.send(wrap(vmXml))

  try {
    const { data: ivr } = await supabase.from('phone_ivr').select('*').eq('is_active', true).maybeSingle()
    const options = (ivr && Array.isArray(ivr.menu_options)) ? ivr.menu_options : []
    if (digits === ((ivr && ivr.voicemail_extension) || '9')) return res.send(wrap(vmXml))
    const chosen = options.find(o => String(o.key) === String(digits))
    if (!chosen) return res.send(wrap(say('Invalid selection.') + '<Redirect>/api/twilio-inbound</Redirect>'))
    if (chosen.action === 'voicemail') return res.send(wrap(vmXml))
    if (chosen.action === 'extension') {
      const { data: ext } = await supabase.from('phone_extensions').select('*').eq('number', String(chosen.value)).eq('active', true).maybeSingle()
      if (ext && ext.forward_to) {
        return res.send(wrap(
          say('Connecting you to ' + ext.label + '.') +
          '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
            '<Number>' + ext.forward_to + '</Number></Dial>' +
          say(ext.voicemail_greeting || 'Please leave a message.') + vmXml
        ))
      }
    }
    if (chosen.action === 'round_robin') {
      const { data: rule } = await supabase.from('phone_routing').select('*').eq('rule_type','round_robin').eq('is_active',true).maybeSingle()
      const ids = (rule && rule.config && rule.config.agent_ids) || []
      if (ids.length > 0) {
        const { data: recent } = await supabase.from('calls').select('agent_id').eq('direction','Inbound').in('agent_id',ids).order('called_at',{ascending:false}).limit(200)
        const counts = {}; ids.forEach(id=>{counts[id]=0}); (recent||[]).forEach(c=>{if(counts[c.agent_id]!==undefined)counts[c.agent_id]++})
        const nextId = ids.reduce((a,b)=>counts[a]<=counts[b]?a:b)
        const { data: ext } = await supabase.from('phone_extensions').select('*').eq('agent_id',nextId).eq('active',true).maybeSingle()
        if (ext && ext.forward_to) {
          return res.send(wrap(
            say('Connecting you to the next available agent.') +
            '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
              '<Number>' + ext.forward_to + '</Number></Dial>' + vmXml
          ))
        }
      }
    }
    return res.send(wrap(vmXml))
  } catch(err) { console.error('menu error:', err.message); return res.send(wrap(vmXml)) }
}
