// TargetOS V2 — Inbound Call Handler
// On first call with no flow saved: auto-saves the default Target Team flow
'use strict'

const {
  wrap, say, voicemailTwiml, getSupabase,
  parseBody, formatPhone, loadFlow, lookupContact,
} = require('./_lib/phone')
const { walkFlow } = require('./_lib/call-flow')

// The canonical Target Team call flow — saved automatically if phone_ivr is empty
const DEFAULT_NODES = [
  { id:'start',       type:'incoming',  x:60,   y:300, config:{} },
  { id:'greeting',    type:'greeting',  x:340,  y:300, config:{ text:'Thank you for calling Target Team, Keller Williams Valley Realty. Your call is very important to us.', voice:'Polly.Joanna' } },
  { id:'menu',        type:'menu',      x:640,  y:160, config:{
    text:'Press 1 to be connected to an available agent. Press 2 for our agent directory. Press 3 to leave a voicemail. Press 4 for our exclusive listings. Press 5 to search live MLS listings.',
    voice:'Polly.Joanna', timeout:10,
    options:[
      { key:'1', label:'Connect to Agent',  say:'Connecting you to the next available agent. Please hold.' },
      { key:'2', label:'Agent Directory',   say:'Opening our agent directory.' },
      { key:'3', label:'Leave Voicemail',   say:'' },
      { key:'4', label:'Exclusive Listings',say:'Opening our exclusive listings search.' },
      { key:'5', label:'Live MLS Search',   say:'Opening our live MLS search.' },
    ]
  }},
  { id:'ringall',     type:'ringall',   x:960,  y:40,  config:{ agent_ids:[], timeout:30 } },
  { id:'directory',   type:'directory', x:960,  y:160, config:{ voice:'Polly.Joanna' } },
  { id:'voicemail',   type:'voicemail', x:960,  y:280, config:{ text:'Thank you for calling Target Team. Please leave your name, phone number, and a brief message and one of our agents will return your call as soon as possible.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
  { id:'listings',    type:'listings',  x:960,  y:400, config:{ intro:'Welcome to our exclusive listings search. Search by area, price, bedrooms, bathrooms, and property type.', voice:'Polly.Joanna', max_results:5 } },
  { id:'mlssearch',   type:'mlssearch', x:960,  y:520, config:{ intro:'Welcome to our live MLS search for Rockland County.', voice:'Polly.Joanna', max_results:5, area:'Rockland' } },
  { id:'vm_fallback', type:'voicemail', x:1260, y:40,  config:{ text:'We are sorry, all agents are currently unavailable. Please leave your name and number and we will return your call promptly.', voice:'Polly.Joanna', max_length:120, transcribe:true, notify_agent:true, pin_enabled:false } },
]
const DEFAULT_EDGES = [
  { id:'e1', from:'start',    port:'out',      to:'greeting'    },
  { id:'e2', from:'greeting', port:'out',      to:'menu'        },
  { id:'e3', from:'menu',     port:'key_1',    to:'ringall'     },
  { id:'e4', from:'menu',     port:'key_2',    to:'directory'   },
  { id:'e5', from:'menu',     port:'key_3',    to:'voicemail'   },
  { id:'e6', from:'menu',     port:'key_4',    to:'listings'    },
  { id:'e7', from:'menu',     port:'key_5',    to:'mlssearch'   },
  { id:'e8', from:'ringall',  port:'noanswer', to:'vm_fallback' },
]

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

    // Inject real agent IDs into ringall node
    const nodesWithAgents = DEFAULT_NODES.map(n =>
      n.id === 'ringall' ? { ...n, config: { ...n.config, agent_ids: agentIds } } : n
    )

    const payload = {
      name:       'Target Team — Main Call Flow',
      flow_nodes: JSON.stringify(nodesWithAgents),
      flow_edges: JSON.stringify(DEFAULT_EDGES),
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

    console.info('[inbound] Default flow saved with', agentIds.length, 'agents in ringall')
    return { nodes: nodesWithAgents, edges: DEFAULT_EDGES }
  } catch(e) {
    console.error('[inbound] ensureFlow save failed:', e.message)
    return { nodes: DEFAULT_NODES, edges: DEFAULT_EDGES }
  }
}

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
      contact_id:   finalContact?.id       || null,
      agent_id:     finalContact?.agent_id || null,
      contact_name: finalContact
        ? [finalContact.first_name, finalContact.last_name].filter(Boolean).join(' ')
        : formatPhone(from),
      called_at: new Date().toISOString(),
    }).select('id').single()
    callId = cr?.id
  } catch(e) { console.warn('[inbound] log call:', e.message) }

  // 4. Activity log (non-blocking)
  if (finalContact?.id) {
    sb.from('activity_log').insert({
      table_name: 'contacts', record_id: finalContact.id,
      action: 'call_inbound', agent_id: finalContact.agent_id || null,
      metadata: { call_sid: callSid, from, call_id: callId },
      created_at: new Date().toISOString(),
    }).catch(e => console.warn('[inbound] activity:', e.message))
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
