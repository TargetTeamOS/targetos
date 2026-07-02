'use strict'
const querystring = require('querystring')
const { getSupabase } = require('./_lib/phone')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const OUTCOME = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer', canceled:'No Answer' }
module.exports = async function handler(req, res) {
  // Always return 200 to Twilio - never crash
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  const { CallSid, CallStatus, CallDuration, RecordingUrl, RecordingSid } = body
  // callLogId can be passed via query string (most reliable) — set by twilio-browser-twiml / twilio-outbound
  const callLogId = (req.query && req.query.callLogId) || null

  try {
    const supabase = getSupabase()
    if (supabase) {
      const upd = {}
      if (CallStatus)    upd.status = CallStatus
      if (CallDuration)  upd.duration_sec = parseInt(CallDuration) || 0
      if (CallStatus)    upd.outcome = OUTCOME[CallStatus] || null
      if (RecordingUrl) { upd.recording_url = RecordingUrl + '.mp3'; upd.recording_sid = RecordingSid }

      if (Object.keys(upd).length > 0) {
        if (callLogId) {
          // Most reliable — match by our own internal record ID
          await supabase.from('calls').update(upd).eq('id', callLogId)
        } else if (CallSid) {
          // Fallback — match by Twilio's call SID
          await supabase.from('calls').update(upd).eq('twilio_call_sid', CallSid)
        }
      }
    }
  } catch(err) { console.error('status error:', err.message) }
  return res.status(200).json({ ok: true })
}
