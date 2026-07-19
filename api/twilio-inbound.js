// TargetOS V2 — Inbound Call Handler
// On first call with no flow saved: auto-saves the default Target Team flow
'use strict'

const {
  wrap, say, voicemailTwiml, getSupabase,
  parseBody, formatPhone, lookupContact,
  checkTwilioSignature,
} = require('./_lib/phone')
const { walkFlow, ensureFlow } = require('./_lib/call-flow')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  const body    = await parseBody(req)
  if (!checkTwilioSignature(req, res, body, 'twilio-inbound')) return
  const from    = body.From    || ''
  const to      = body.To      || ''
  const callSid = body.CallSid || ''

  console.info('[inbound] from=...'+from.slice(-4)+' sid='+callSid.slice(0,8))

  const sb = getSupabase()

  // 1. Identify caller
  const contact = await lookupContact(sb, from)

  // 2. Create contact if new number
  let finalContact = contact
  if (!contact && from.replace(/\D/g,'').length >= 10) {
    try {
      const { data: nc, error: ncErr } = await sb.from('contacts').insert({
        first_name: 'Unknown', last_name: 'Caller',
        phone: formatPhone(from), source: 'Inbound Call',
        status: 'New', created_at: new Date().toISOString(),
        notes: 'Auto-created from inbound call on ' + new Date().toLocaleDateString('en-US'),
        updated_at: new Date().toISOString(),
      }).select().single()
      if (ncErr) console.warn('[inbound] create contact error:', ncErr.message)
      finalContact = nc
    } catch(e) { console.warn('[inbound] create contact:', e.message) }
  }

  // 3. Log call
  let callId = null
  try {
    const { data: cr, error: crErr } = await sb.from('calls').insert({
      twilio_call_sid: callSid,
      from_number: from, to_number: to,
      direction: 'Inbound', status: 'in-progress',
      contact_id:   finalContact?.id       || null,
      agent_id:     finalContact?.agent_id || null,
      contact_name: finalContact
        ? [finalContact.first_name, finalContact.last_name].filter(Boolean).join(' ')
        : formatPhone(from),
      called_at: new Date().toISOString(),
    }).select('id').single()
    if (crErr) console.warn('[inbound] log call error:', crErr.message)
    callId = cr?.id
  } catch(e) { console.warn('[inbound] log call:', e.message) }

  // 3b. FULL-CALL RECORDING (July 2026): start recording via the REST
  // API so the recording covers the ENTIRE call from the first menu —
  // not just after an agent answers (TwiML record-from-answer only
  // captures dial legs). Combined with the listings_step_* /
  // menu_selected call events, this gives a complete picture of what
  // every caller heard and pressed. Recording lands on the call row
  // via the existing /api/twilio-status callback.
  // Disable with IVR_RECORD_FULL_CALL=false. Fire-and-forget: a
  // recording failure must never delay answering the call.
  if (String(process.env.IVR_RECORD_FULL_CALL || 'true').toLowerCase() !== 'false' && callSid) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    if (accountSid && authToken) {
      const recUrl = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Calls/' + callSid + '/Recordings.json'
      const params = new URLSearchParams({
        RecordingChannels: 'dual',
        RecordingStatusCallback: (process.env.BASE_URL || 'https://app.targetreteam.com') + '/api/twilio-status',
        RecordingStatusCallbackEvent: 'completed',
      })
      // MUST be awaited: Vercel freezes the lambda when the response
      // returns, killing un-awaited requests — recordings never started.
      // Timeout race keeps call answering snappy even if Twilio is slow.
      try {
        const r = await Promise.race([
          fetch(recUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('recording-start timeout')), 2500)),
        ])
        if (!r.ok) console.warn('[inbound] full-call recording failed to start:', r.status, (await r.text()).slice(0, 200))
      } catch (e) { console.warn('[inbound] full-call recording error:', e.message) }
    }
  }

  // 4. Activity log (non-blocking)
  if (finalContact?.id) {
    try {
      await sb.from('activity_log').insert({
        table_name: 'contacts', record_id: finalContact.id,
        action: 'call_inbound', agent_id: finalContact.agent_id || null,
        metadata: { call_sid: callSid, from, call_id: callId },
        created_at: new Date().toISOString(),
      })
    } catch(e) { console.warn('[inbound] activity:', e.message) }
  }

  // 5. Repeat caller check (non-blocking)
  let isRepeat = false
  sb.from('calls').select('id', { count:'exact', head:true })
    .eq('from_number', from).eq('direction', 'Inbound')
    .then(r => { isRepeat = (r.count || 0) > 1 })
    .catch(() => {})

  const callData = { from, to, callSid, callId, contact: finalContact, isRepeat }

  // 6. Load flow — auto-save default if empty
  try {
    const { nodes, edges } = await ensureFlow(sb)

    const start = nodes.find(n => n.type === 'incoming')
    if (start) {
      const twiml = await walkFlow(nodes, edges, start.id, callData, sb, 0)
      return res.send(wrap(twiml))
    }
    console.warn('[inbound] no incoming node in flow')
  } catch(e) {
    console.error('[inbound] walkFlow error:', e.message, e.stack)
  }

  // 7. Last-resort fallback
  return res.send(wrap(voicemailTwiml(
    'Thank you for calling Target Team. Please leave your name, phone number, and a brief message and an agent will call you back.'
  )))
}
