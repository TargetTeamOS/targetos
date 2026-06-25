const { createClient } = require('@supabase/supabase-js')
const querystring = require('querystring')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const OUTCOME = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer', canceled:'No Answer' }
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = body
  try {
    const upd = { status: CallStatus, duration_sec: parseInt(CallDuration)||0, outcome: OUTCOME[CallStatus]||null }
    if (RecordingUrl) { upd.recording_url = RecordingUrl+'.mp3'; upd.recording_sid = RecordingSid }
    await supabase.from('calls').update(upd).eq('twilio_call_sid', CallSid)
    res.status(200).json({ ok: true })
  } catch(err) { console.error('status error:', err.message); res.status(200).json({ ok: false }) }
}
