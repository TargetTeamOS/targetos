'use strict'
const querystring = require('querystring')
const { getSupabase, logTwilioValidation, transcribeAudio } = require('./_lib/phone')
function getRawBody(req) { return new Promise((res,rej)=>{ let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>res(d)); req.on('error',rej) }) }
const OUTCOME = { completed:'Connected', busy:'No Answer', 'no-answer':'No Answer', failed:'No Answer', canceled:'No Answer' }

// New/unassigned-contact automation: fires when an agent actually
// answers a hunt-group call (see call-flow.js's roundrobin, which
// embeds agentId in each <Number>'s statusCallback specifically so
// this can be detected). Per business requirement: an agent should
// NOT get this extra email for a contact that already had them (or
// any agent) assigned before this call -- only genuinely new/unknown
// callers.
async function handleAgentAnswered(supabase, agentId, callLogId) {
  if (!agentId || !callLogId) return
  try {
    const { data: call } = await supabase.from('calls').select('id, contact_id, from_number').eq('id', callLogId).maybeSingle()
    if (!call?.contact_id) return

    const { data: contact } = await supabase.from('contacts').select('id, agent_id, first_name, last_name').eq('id', call.contact_id).maybeSingle()
    if (!contact || contact.agent_id) return // already assigned -- not a "new" contact, no automation

    const { data: agent } = await supabase.from('agents').select('id, name, email').eq('id', agentId).maybeSingle()
    if (!agent?.email) return

    // Assign the contact to the agent who answered
    await supabase.from('contacts').update({ agent_id: agentId, updated_at: new Date().toISOString() }).eq('id', contact.id)

    // Create a follow-up task
    await supabase.from('tasks').insert({
      title: 'Follow up: new inbound call from ' + (call.from_number || 'unknown number'),
      agent_id: agentId, created_by: agentId, contact_id: contact.id,
      due_date: new Date().toISOString().slice(0, 10),
      priority: 'high', status: 'pending',
      notes: 'Auto-created: you answered an inbound call from a new/unassigned contact.',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })

    // Log to the call itself
    await supabase.from('calls').update({
      notes: 'New lead — auto-assigned to ' + (agent.name || 'agent') + ' after answering.',
    }).eq('id', callLogId)

    // Email the agent
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (RESEND_KEY) {
      const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'New caller'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'TargetOS <office@targetreteam.com>',
          to: [agent.email],
          subject: '📞 New lead assigned to you — ' + contactName,
          html: '<div style="font-family:Inter,sans-serif;padding:20px">' +
            '<h2 style="color:#CC2200">New Lead: ' + contactName + '</h2>' +
            '<p>You just answered an inbound call from a new contact, and they\'ve been assigned to you.</p>' +
            '<p><strong>Phone:</strong> ' + (call.from_number || '—') + '</p>' +
            '<p>A follow-up task has been added to your list.</p>' +
            '<a href="https://app.targetreteam.com/contacts/' + contact.id + '/detail" style="background:#CC2200;color:#fff;padding:10px 20px;text-decoration:none;border-radius:7px;display:inline-block;margin-top:12px">Open Contact →</a>' +
            '</div>',
        }),
      }).catch(e => console.warn('[twilio-status] agent email failed:', e.message))
    }
  } catch(e) {
    console.warn('[twilio-status] handleAgentAnswered failed:', e.message)
  }
}

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
  const agentId   = (req.query && req.query.agentId) || null

  try {
    const supabase = getSupabase()
    if (supabase) {
      // Hunt-group "answered" event for a specific agent -- fire the
      // new-contact automation. Twilio sends CallStatus=in-progress
      // for the answered statusCallbackEvent (not literally "answered").
      if (agentId && (CallStatus === 'in-progress' || CallStatus === 'answered')) {
        await handleAgentAnswered(supabase, agentId, callLogId)
      }

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
