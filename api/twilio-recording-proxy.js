// TargetOS V2 — Call Recording Proxy
// Twilio recording URLs (api.twilio.com/.../Recordings/...) require HTTP
// Basic Auth with the real Account SID + Auth Token. The browser can't
// do that without us exposing live Twilio credentials client-side, which
// we will never do. Instead: the browser hits this proxy, we fetch the
// audio server-side (with real credentials), and stream it back.
//
// This independently re-checks recording access via can_hear_recording()
// -- it does NOT just trust that the frontend already decided to show a
// play button. Otherwise this endpoint would become a backdoor around
// the access control added July 2026.
'use strict'

const { requireAnyAgent, getSupabase } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  // HARDENED (July 2026): require a logged-in user — this endpoint
  // was previously callable by anyone who found the URL.
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) { res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' })) }
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const callId       = req.query?.callId
  const voicemailId  = req.query?.voicemailId
  if (!callId && !voicemailId) return res.status(400).json({ error: 'callId or voicemailId required' })

  const supabase = getSupabase()
  let recordingUrl = null

  if (callId) {
    const { data: call, error } = await supabase
      .from('calls').select('id, contact_id, recording_url, voicemail_url')
      .eq('id', callId).maybeSingle()
    if (error || !call) return res.status(404).json({ error: 'Call not found' })

    recordingUrl = call.recording_url || call.voicemail_url
    if (!recordingUrl) return res.status(404).json({ error: 'No recording for this call' })

    // Independent authorization check -- same rule as get_contact_calls()/
    // get_calls_list(), re-verified here regardless of what the frontend
    // already knew.
    const { data: allowed, error: permErr } = await supabase.rpc('can_hear_recording', {
      p_agent_id: authCheck.agentId,
      p_contact_id: call.contact_id,
    })
    if (permErr || !allowed) {
      return res.status(403).json({ error: 'You do not have access to this recording' })
    }
  } else {
    // Standalone agent voicemail box -- not gated by the same
    // admin-approval rule as call recordings (out of scope for that
    // feature), just needs to be a logged-in agent, matching this
    // table's existing open access model.
    const { data: vm, error } = await supabase
      .from('voicemails').select('id, recording_url').eq('id', voicemailId).maybeSingle()
    if (error || !vm) return res.status(404).json({ error: 'Voicemail not found' })
    recordingUrl = vm.recording_url
    if (!recordingUrl) return res.status(404).json({ error: 'No recording for this voicemail' })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) return res.status(500).json({ error: 'Twilio not configured' })

  try {
    const basicAuth = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')
    const twilioHeaders = { Authorization: basicAuth }
    // Pass through Range requests so the browser can seek/scrub properly
    if (req.headers.range) twilioHeaders.Range = req.headers.range

    const twilioRes = await fetch(recordingUrl, { headers: twilioHeaders })
    if (!twilioRes.ok && twilioRes.status !== 206) {
      return res.status(twilioRes.status).json({ error: 'Could not fetch recording from Twilio' })
    }

    res.status(twilioRes.status)
    const passthroughHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges']
    passthroughHeaders.forEach(h => {
      const v = twilioRes.headers.get(h)
      if (v) res.setHeader(h, v)
    })
    if (!twilioRes.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes')

    const buffer = Buffer.from(await twilioRes.arrayBuffer())
    res.send(buffer)
  } catch (e) {
    return res.status(500).json({ error: 'Recording fetch failed: ' + e.message })
  }
}
