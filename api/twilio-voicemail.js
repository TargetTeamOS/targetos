const { createClient } = require('@supabase/supabase-js')
const qs = require('qs')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  let body = {}
  try { body = qs.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  const { CallSid, RecordingUrl, RecordingDuration, TranscriptionText, From } = body
  try {
    const { data: call } = await supabase.from('calls').select('*').eq('twilio_call_sid', CallSid).maybeSingle()
    if (call && call.id) {
      await supabase.from('calls').update({ is_voicemail:true, voicemail_url: RecordingUrl?RecordingUrl+'.mp3':null, voicemail_transcript:TranscriptionText||null, outcome:'Voicemail' }).eq('id', call.id)
    }
    const clean = (From||'').replace(/\D/g,'').slice(-10)
    const { data: contact } = await supabase.from('contacts').select('id,first_name,last_name,agent_id').or(`phone.ilike.%${clean}%`).maybeSingle()
    await supabase.from('voicemails').insert({ call_id:(call&&call.id)||null, agent_id:(contact&&contact.agent_id)||null, from_number:From||null, contact_id:(contact&&contact.id)||null, contact_name:contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):null, recording_url:RecordingUrl?RecordingUrl+'.mp3':null, transcript:TranscriptionText||null, duration_sec:parseInt(RecordingDuration)||0, is_read:false, created_at:new Date().toISOString() })
    res.status(200).json({ ok: true })
  } catch(err) { console.error('voicemail error:', err.message); res.status(200).json({ ok: false }) }
}
