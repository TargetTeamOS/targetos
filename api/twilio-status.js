const querystring = require('querystring')
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const OUTCOME = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer', canceled:'No Answer' }
module.exports = async function handler(req, res) {
  // Always return 200 to Twilio - never crash
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = body
  try {
    const supabase = getSupabase()
    if (supabase && CallSid) {
      const upd = { status: CallStatus, duration_sec: parseInt(CallDuration)||0, outcome: OUTCOME[CallStatus]||null }
      if (RecordingUrl) { upd.recording_url = RecordingUrl+'.mp3'; upd.recording_sid = RecordingSid }
      await supabase.from('calls').update(upd).eq('twilio_call_sid', CallSid)
    }
  } catch(err) { console.error('status error:', err.message) }
  return res.status(200).json({ ok: true })
}
