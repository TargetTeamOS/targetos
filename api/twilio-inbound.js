// TargetOS V2 — Inbound Call Handler
// Every inbound call hits this endpoint first.
// 1. Identify caller from CRM contacts
// 2. Create contact if new number  
// 3. Log the call to the calls table
// 4. Walk the visual call flow from phone_ivr
// 5. Fall back to simple voicemail if no flow configured
'use strict'

const {
  wrap, say, voicemailTwiml, getSupabase,
  parseBody, normalizePhone, formatPhone, loadFlow, lookupContact,
} = require('./_lib/phone')
const { walkFlow } = require('./_lib/call-flow')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  // Twilio always uses POST for webhooks
  if (req.method !== 'POST') {
    return res.status(405).send(wrap(say('Method not allowed.')))
  }

  const body     = await parseBody(req)
  const from     = body.From     || ''
  const to       = body.To       || ''
  const callSid  = body.CallSid  || ''
  const digits10 = from.replace(/\D/g, '').slice(-10)

  console.info('[inbound] from=' + from.slice(-4) + ' sid=' + callSid.slice(0, 10))

  const supabase = getSupabase()

  // ── NO SUPABASE: bare-minimum voicemail ──────────────────────
  if (!supabase) {
    console.error('[inbound] Supabase not configured')
    return res.send(wrap(
      say('Thank you for calling Target Team. Please leave a message after the tone.') +
      voicemailTwiml()
    ))
  }

  // ── 1. IDENTIFY CALLER ───────────────────────────────────────
  let contact = await lookupContact(supabase, from)

  // ── 2. CREATE CONTACT IF NEW ─────────────────────────────────
  if (!contact && digits10.length === 10) {
    try {
      const { data: nc } = await supabase.from('contacts').insert({
        first_name: 'Unknown',
        last_name:  'Caller',
        phone:      formatPhone(from),
        source:     'Inbound Call',
        status:     'New',
        notes:      'Auto-created from inbound call on ' + new Date().toLocaleDateString('en-US') + '.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()
      contact = nc || null
    } catch(e) { console.warn('[inbound] create contact:', e.message) }
  }

  // ── 3. LOG CALL ──────────────────────────────────────────────
  let callId = null
  try {
    const { data: callRow } = await supabase.from('calls').insert({
      twilio_call_sid: callSid,
      from_number:     from,
      to_number:       to,
      direction:       'Inbound',
      status:          'in-progress',
      contact_id:      contact?.id    || null,
      contact_name:    contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
        : formatPhone(from),
      agent_id:        contact?.agent_id || null,
      called_at:       new Date().toISOString(),
    }).select('id').single()
    callId = callRow?.id || null
  } catch(e) { console.warn('[inbound] log call:', e.message) }

  // ── 4. LOG TO CONTACT TIMELINE ───────────────────────────────
  if (contact?.id) {
    supabase.from('activity_log').insert({
      table_name:  'contacts',
      record_id:   contact.id,
      action:      'call_inbound',
      agent_id:    contact.agent_id || null,
      metadata:    { call_sid: callSid, from_number: from, call_id: callId },
      created_at:  new Date().toISOString(),
    }).catch(e => console.warn('[inbound] activity log:', e.message))
  }

  // ── 5. CHECK REPEAT CALLER ───────────────────────────────────
  let isRepeat = false
  try {
    const { data: prev } = await supabase
      .from('calls').select('id', { count: 'exact', head: true })
      .eq('from_number', from).eq('direction', 'Inbound')
    isRepeat = (prev?.length || 0) > 1
  } catch {}

  const callData = { from, to, callSid, callId, contact, isRepeat }

  // ── 6. WALK CALL FLOW ────────────────────────────────────────
  try {
    const { nodes, edges } = await loadFlow(supabase)

    if (nodes.length > 0) {
      const startNode = nodes.find(n => n.type === 'incoming')
      if (startNode) {
        const twiml = await walkFlow(nodes, edges, startNode.id, callData, supabase, 0)
        return res.send(wrap(twiml))
      }
      console.warn('[inbound] Flow found but no incoming node')
    } else {
      console.warn('[inbound] No flow in phone_ivr — using fallback voicemail')
    }
  } catch(e) {
    console.error('[inbound] walkFlow error:', e.message, e.stack)
  }

  // ── 7. FALLBACK VOICEMAIL ─────────────────────────────────────
  return res.send(wrap(
    say('Thank you for calling Target Team. Please leave your name, phone number, and a brief message after the tone and one of our agents will return your call.') +
    voicemailTwiml()
  ))
}
