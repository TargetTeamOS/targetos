// TargetOS V2 — Inbound Call Handler
// On first call with no flow saved: auto-saves the default Target Team flow
'use strict'

const {
  wrap, say, voicemailTwiml, getSupabase,
  parseBody, formatPhone, loadFlow, lookupContact,
  logTwilioValidation,
} = require('./_lib/phone')
const { walkFlow } = require('./_lib/call-flow')
const { buildDefaultNodes, buildDefaultEdges } = require('./_lib/default-flow')

async function ensureFlow(sb) {
  let { nodes, edges } = await loadFlow(sb)
  if (nodes.length > 0) return { nodes, edges }

  // No flow saved — auto-save the default now
  console.info('[inbound] No flow found — auto-saving default Target Team flow')
  try {
    // Get agent IDs to populate ringall
    const { data: agents } = await sb.from('agents')
      .select('id,phone').eq('active', true).order('created_at', { ascending: true })
    const agentIds = (agents || []).filter(a => a.phone).map(a => a.id)

    // Inject real agent IDs into roundrobin node
    const nodesWithAgents = buildDefaultNodes(agentIds)
    const edges = buildDefaultEdges()

    const payload = {
      name:       'Target Team — Main Call Flow',
      flow_nodes: JSON.stringify(nodesWithAgents),
      flow_edges: JSON.stringify(edges),
      is_active:  true,
      updated_at: new Date().toISOString(),
    }

    // Check if a row exists
    const { data: existing } = await sb.from('phone_ivr')
      .select('id').limit(1).maybeSingle()

    if (existing?.id) {
      await sb.from('phone_ivr').update(payload).eq('id', existing.id)
    } else {
      await sb.from('phone_ivr').insert({
        ...payload, voicemail_extension: '9', created_at: new Date().toISOString()
      })
    }

    console.info('[inbound] Default flow saved with', agentIds.length, 'agents in roundrobin')
    return { nodes: nodesWithAgents, edges: edges }
  } catch(e) {
    console.error('[inbound] ensureFlow save failed:', e.message)
    return { nodes: buildDefaultNodes([]), edges: buildDefaultEdges() }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  const body    = await parseBody(req)
  logTwilioValidation(req, body, 'twilio-inbound')
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
