'use strict'
const querystring = require('querystring')
const { getSupabase, logTwilioValidation, transcribeAudio } = require('./_lib/phone')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const OUTCOME = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer', canceled:'No Answer' }
module.exports = async function handler(req, res) {
  // Always return 200 to Twilio - never crash
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  logTwilioValidation(req, body, 'twilio-status')
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
      let fullRecordingUrl = null
      if (RecordingUrl) { fullRecordingUrl = RecordingUrl + '.mp3'; upd.recording_url = fullRecordingUrl; upd.recording_sid = RecordingSid }

      // Transcribe (English/Yiddish/Spanish via Whisper) -- awaited
      // deliberately: Vercel can freeze this function right after we
      // respond, so "fire and forget" here would likely never finish.
      // transcribeAudio() itself no-ops cleanly if OPENAI_API_KEY isn't
      // set yet, so this is safe to leave in before that's configured.
      if (fullRecordingUrl) {
        const result = await transcribeAudio(fullRecordingUrl)
        if (result) {
          upd.transcript = result.text
          upd.transcript_language = result.language
        }
      }

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
