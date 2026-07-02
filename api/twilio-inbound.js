// TargetOS V2 — Inbound Call Handler
'use strict'

const {
  wrap, say, voicemailTwiml, getSupabase,
  parseBody, normalizePhone, formatPhone, loadFlow, lookupContact,
} = require('./_lib/phone')
const { walkFlow } = require('./_lib/call-flow')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  const body    = await parseBody(req)
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
      const { data: nc } = await sb.from('contacts').insert({
        first_name: 'Unknown', last_name: 'Caller',
        phone: formatPhone(from), source: 'Inbound Call',
        status: 'New', created_at: new Date().toISOString(),
        notes: 'Auto-created from inbound call on ' + new Date().toLocaleDateString('en-US'),
        updated_at: new Date().toISOString(),
      }).select().single()
      finalContact = nc
    } catch(e) { console.warn('[inbound] create contact:', e.message) }
  }

  // 3. Log call
  let callId = null
  try {
    const { data: cr } = await sb.from('calls').insert({
      twilio_call_sid: callSid,
      from_number: from, to_number: to,
      direction: 'Inbound', status: 'in-progress',
      contact_id:   finalContact?.id   || null,
      agent_id:     finalContact?.agent_id || null,
      contact_name: finalContact
        ? [finalContact.first_name, finalContact.last_name].filter(Boolean).join(' ')
        : formatPhone(from),
      called_at: new Date().toISOString(),
    }).select('id').single()
    callId = cr?.id
  } catch(e) { console.warn('[inbound] log call:', e.message) }

  // 4. Activity log
  if (finalContact?.id) {
    sb.from('activity_log').insert({
      table_name: 'contacts', record_id: finalContact.id,
      action: 'call_inbound', agent_id: finalContact.agent_id || null,
      metadata: { call_sid: callSid, from, call_id: callId },
      created_at: new Date().toISOString(),
    }).catch(e => console.warn('[inbound] activity:', e.message))
  }

  // 5. Repeat caller check
  let isRepeat = false
  try {
    const { count } = await sb.from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('from_number', from).eq('direction', 'Inbound')
    isRepeat = (count || 0) > 1
  } catch {}

  const callData = { from, to, callSid, callId, contact: finalContact, isRepeat }

  // 6. Walk the call flow
  try {
    const { nodes, edges } = await loadFlow(sb)
    if (nodes.length > 0) {
      const start = nodes.find(n => n.type === 'incoming')
      if (start) {
        const twiml = await walkFlow(nodes, edges, start.id, callData, sb, 0)
        return res.send(wrap(twiml))
      }
      console.warn('[inbound] flow has no incoming node — node types:', nodes.map(n=>n.type).join(','))
    } else {
      console.warn('[inbound] no flow found in phone_ivr — using fallback voicemail')
    }
  } catch(e) {
    console.error('[inbound] walkFlow error:', e.message, e.stack)
  }

  // 7. Fallback voicemail
  return res.send(wrap(voicemailTwiml(
    'Thank you for calling Target Team. Please leave your name, number, and message and an agent will call you back.'
  )))
}
