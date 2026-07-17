'use strict'
const querystring = require('querystring')
const { getSupabase, checkTwilioSignature, transcribeAudio } = require('./_lib/phone')
const { notifyAgent } = require('./_lib/notify')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }
  if (!checkTwilioSignature(req, res, body, 'twilio-voicemail')) return
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

    // ── VOICEMAIL EMAIL ALERT (July 2026) ─────────────────────────
    // Controlled by the 'sys-voicemail-email' row on the Automations
    // board: toggle it off there and this stops; edit its config
    // {to_email, cc_email} to change recipients. Audio attached
    // (fetched from Twilio, <8MB) + phone, caller, transcript.
    try {
      const { data: auto } = await supabase.from('automations')
        .select('active, action_nodes').eq('id', 'sys-voicemail-email').maybeSingle()
      if (auto?.active && process.env.RESEND_API_KEY) {
        const cfg = auto.action_nodes?.[0]?.config || {}
        const to  = cfg.to_email || 'yanky@targetreteam.com'
        let attachment = null
        if (fullRecordingUrl && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
          try {
            const rec = await fetch(fullRecordingUrl, { headers: { 'Authorization': 'Basic ' + Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64') } })
            if (rec.ok) {
              const buf = Buffer.from(await rec.arrayBuffer())
              if (buf.length < 8 * 1024 * 1024) attachment = { filename: 'voicemail.mp3', content: buf.toString('base64') }
            }
          } catch (e) { console.warn('[vm-email] attachment fetch failed:', e.message) }
        }
        const callerName = contact ? ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() : ''
        const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
          '<h2 style="color:#1B2B4B;margin:0 0 12px">📬 New Voicemail</h2>' +
          '<p><strong>From:</strong> ' + (From || 'Unknown') + (callerName ? ' — ' + callerName : ' — not in contacts') + '<br/>' +
          '<strong>Duration:</strong> ' + (RecordingDuration || '?') + 's</p>' +
          (transcriptText ? '<p style="background:#F6F7FB;padding:12px;border-radius:8px"><strong>Transcript' + (transcriptLang ? ' (' + transcriptLang + ')' : '') + ':</strong><br/>' + transcriptText + '</p>' : '') +
          (fullRecordingUrl ? '<p>' + (attachment ? 'Audio attached. ' : '') + '<a href="https://app.targetreteam.com/calls">Open in TargetOS →</a></p>' : '') + '</div>'
        const payload = {
          from: 'TargetOS <office@targetreteam.com>', to: [to],
          ...(cfg.cc_email ? { cc: String(cfg.cc_email).split(',').map(x => x.trim()).filter(Boolean) } : {}),
          subject: '📬 Voicemail from ' + (callerName || From || 'Unknown'),
          html, ...(attachment ? { attachments: [attachment] } : {}),
        }
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) console.warn('[vm-email] send failed:', r.status, (await r.text()).slice(0, 200))
      }
    } catch (e) { console.warn('[vm-email] skipped:', e.message) }
    const agentId = (contact && contact.agent_id) || null
    await supabase.from('voicemails').insert({ call_id:(call&&call.id)||null, agent_id:agentId, from_number:From||null, contact_id:(contact&&contact.id)||null, contact_name:contact?[contact.first_name,contact.last_name].filter(Boolean).join(' '):null, recording_url:fullRecordingUrl, transcript:transcriptText, duration_sec:parseInt(RecordingDuration)||0, is_read:false, created_at:new Date().toISOString() })
    if (agentId) {
      notifyAgent(supabase, agentId, 'voicemail', {
        title: 'New voicemail',
        body: (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : From) + ' left a voicemail',
        link: '/calls', type: 'voicemail',
      })
    }
  } catch(err) { console.error('voicemail error:', err.message) }
  return res.status(200).json({ ok: true })
}
