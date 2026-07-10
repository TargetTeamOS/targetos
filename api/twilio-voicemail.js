'use strict'
const querystring = require('querystring')
const { getSupabase, logTwilioValidation, transcribeAudio } = require('./_lib/phone')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  logTwilioValidation(req, body, 'twilio-voicemail')
  const { CallSid, RecordingUrl, RecordingDuration, From } = body
  try {
    const supabase = getSupabase()
    if (!supabase) return res.status(200).json({ ok: true })

    const fullRecordingUrl = RecordingUrl ? RecordingUrl + '.mp3' : null

    // Whisper transcription (English/Yiddish/Spanish, auto-detected).
    // Replaces Twilio's own TranscriptionText, which almost certainly
    // doesn't support Yiddish and was English-oriented at best.
    // Awaited deliberately -- see twilio-status.js for why "fire and
    // forget" isn't safe on Vercel serverless. No-ops cleanly if
    // OPENAI_API_KEY isn't configured yet.
    let transcriptText = null, transcriptLang = null
    if (fullRecordingUrl) {
      const result = await transcribeAudio(fullRecordingUrl)
      if (result) { transcriptText = result.text; transcriptLang = result.language }
    }

    const { data: call } = await supabase.from('calls').select('*').eq('twilio_call_sid', CallSid).maybeSingle()
    if (call && call.id) await supabase.from('calls').update({
      is_voicemail: true,
      voicemail_url: fullRecordingUrl,
      voicemail_transcript: transcriptText,
      transcript: transcriptText,
      transcript_language: transcriptLang,
      outcome: 'Voicemail',
    }).eq('id', call.id)
    // Reuse lookupContact (searches every phone format variant) --
    // the previous raw-digit-only query could never match the
    // punctuated storage format, so voicemails never linked to the
    // right contact/agent.
    const { lookupContact } = require('./_lib/phone')
    const contact = await lookupContact(supabase, From || '')
    await supabase.from('voicemails').insert({ call_id:(call&&call.id)||null, agent_id:(contact&&contact.agent_id)||null, from_number:From||null, contact_id:(contact&&contact.id)||null, contact_name:contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):null, recording_url:fullRecordingUrl, transcript:transcriptText, duration_sec:parseInt(RecordingDuration)||0, is_read:false, created_at:new Date().toISOString() })
  } catch(err) { console.error('voicemail error:', err.message) }
  return res.status(200).json({ ok: true })
}
