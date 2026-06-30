// TargetOS V2 — Twilio Inbound Call Handler
// - Every call gets recorded (Twilio <Record> or <Dial record="...">)
// - New number → create Contact + activity log
// - Known number → update Contact timeline
// - If a visual flow is saved → walks it node by node (shared logic in _lib/call-flow.js)
// - If no flow → sensible fallback greeting + voicemail
'use strict'

const querystring = require('querystring')
const { walkFlow, wrap, say } = require('./_lib/call-flow')

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => resolve(d)); req.on('error', reject)
  })
}

// Parse jsonb that may come back as a string
function parseJ(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch(e) { return null } }
  return v
}

function fmtPhone(p) {
  const d = (p||'').replace(/\D/g,'').slice(-10)
  return d.length===10 ? '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6) : p
}

// ── MAIN HANDLER ─────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(wrap(say('Method not allowed.')))

  let body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  const from    = body.From    || ''
  const to      = body.To      || ''
  const callSid = body.CallSid || ''
  const clean10 = from.replace(/\D/g,'').slice(-10)

  console.log('Inbound call from:', from, 'to:', to, 'sid:', callSid)

  const supabase = getSupabase()

  if (!supabase) {
    console.error('Supabase not configured — check SUPABASE_URL and SUPABASE_SERVICE_KEY env vars')
    return res.send(wrap(
      say('Thank you for calling Target Team. Please leave a message after the tone.') +
      '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'
    ))
  }

  // ── STEP 1: Identify the caller ─────────────────────────────
  let contact = null
  let callId  = null

  try {
    const cRes = await supabase.from('contacts')
      .select('id, first_name, last_name, phone, agent_id, status')
      .or('phone.ilike.%' + clean10 + '%')
      .limit(1)
      .maybeSingle()
    contact = cRes.data || null
    console.log('Contact lookup:', contact ? contact.first_name + ' ' + contact.last_name : 'not found')
  } catch(e) { console.warn('contact lookup:', e.message) }

  // ── STEP 2: Create contact if new number ────────────────────
  if (!contact && clean10.length >= 10) {
    try {
      const { data: newContact } = await supabase.from('contacts').insert({
        first_name:  'Unknown',
        last_name:   'Caller',
        phone:       fmtPhone(from),
        source:      'Inbound Call',
        status:      'New',
        notes:       'Auto-created from inbound call. Called on ' + new Date().toLocaleDateString('en-US') + '.',
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      }).select().single()
      contact = newContact
      console.log('New contact created:', newContact?.id)
    } catch(e) { console.warn('create contact:', e.message) }
  }

  // ── STEP 3: Log the call (linked to contact) ─────────────────
  try {
    const { data: callRow } = await supabase.from('calls').insert({
      twilio_call_sid: callSid,
      from_number:     from,
      to_number:       to,
      direction:       'Inbound',
      status:          'in-progress',
      contact_id:      contact?.id || null,
      contact_name:    contact ? (contact.first_name + ' ' + contact.last_name).trim() : fmtPhone(from),
      agent_id:        contact?.agent_id || null,
      called_at:       new Date().toISOString(),
    }).select().single()
    callId = callRow?.id || null
    console.log('Call logged, id:', callId)
  } catch(e) { console.warn('log call:', e.message) }

  // ── STEP 4: Add activity to contact timeline ─────────────────
  if (contact?.id) {
    try {
      await supabase.from('activity_log').insert({
        table_name:   'contacts',
        record_id:    contact.id,
        action:       'call_inbound',
        agent_id:     contact.agent_id || null,
        metadata:     JSON.stringify({
          call_sid:    callSid,
          from_number: from,
          call_id:     callId,
          direction:   'Inbound',
        }),
        created_at:   new Date().toISOString(),
      })
    } catch(e) { console.warn('activity log:', e.message) }
  }

  // ── STEP 5: Check if repeat caller ───────────────────────────
  let isRepeat = false
  try {
    const rr = await supabase.from('calls').select('id').eq('from_number', from).limit(3)
    isRepeat = (rr.data || []).length > 1
  } catch(e) {}

  const callData = { from, to, callSid, callId, contact, isRepeat }

  // ── STEP 6: Load and walk the visual call flow ────────────────
  try {
    let flowRow = null
    const ar = await supabase.from('phone_ivr').select('*').eq('is_active', true).limit(1).maybeSingle()
    flowRow = ar.data
    if (!flowRow) {
      const br = await supabase.from('phone_ivr').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle()
      flowRow = br.data
    }

    if (flowRow) {
      const flowNodes = parseJ(flowRow.flow_nodes) || []
      const flowEdges = parseJ(flowRow.flow_edges) || []
      console.log('Flow:', flowRow.name, '| nodes:', flowNodes.length, '| edges:', flowEdges.length)

      if (flowNodes.length >= 1) {
        const startNode = flowNodes.find(n => n.type === 'incoming')
        if (startNode) {
          const twiml = await walkFlow(flowNodes, flowEdges, startNode.id, callData, supabase, 0)
          console.log('Flow TwiML length:', twiml.length)
          return res.send(wrap(twiml))
        }
        console.log('No "incoming" node found — node types:', flowNodes.map(n=>n.type))
      } else {
        console.log('flow_nodes is empty or null — columns may not exist. Run SQL to add them.')
      }
    } else {
      console.log('No flow saved in phone_ivr table')
    }
  } catch(e) {
    console.error('Flow error:', e.message, e.stack)
  }

  // ── FALLBACK: No flow configured ─────────────────────────────
  console.log('Using fallback response')
  const greeting = contact
    ? say('Thank you for calling Target Team. Please leave your name and message after the tone.')
    : say('Thank you for calling Target Team. Please leave your name, phone number, and a brief message after the tone.')

  return res.send(wrap(
    greeting +
    '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'
  ))
}
