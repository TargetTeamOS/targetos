// TargetOS V2 — Twilio Inbound Call Handler
// Walks the visual Call Flow graph node by node to build TwiML.
const querystring = require('querystring')

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const wrap = (xml) => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say  = (t)   => '<Say voice="Polly.Joanna">' + t + '</Say>'
const vmXml = (greeting) =>
  say(greeting || 'Please leave your message after the tone.') +
  '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'

// ── FLOW WALKER ──────────────────────────────────────────────
// Given the flow graph, the incoming call data, and current node,
// recursively builds TwiML. Stops at blocking nodes (dial, voicemail,
// hangup, menu) since those need user input or end the call.
async function walkFlow(nodes, edges, nodeId, callData, supabase, depth) {
  if (depth > 20) return say('An error occurred. Please call back.')

  var node = nodes.find(function(n) { return n.id === nodeId })
  if (!node) return say('Flow error. Please call back.')

  var cfg = node.config || {}
  var nextEdge = null
  var twiml = ''

  // ── GREETING ─────────────────────────────────────────────
  if (node.type === 'greeting') {
    twiml += say(cfg.text || 'Thank you for calling.')
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'out' })
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return twiml
  }

  // ── MENU ─────────────────────────────────────────────────
  // Hands off to twilio-menu which will continue the flow
  if (node.type === 'menu') {
    var menuEdgesJson = JSON.stringify(edges)
    var nodesJson     = JSON.stringify(nodes)
    // Encode flow context into the action URL so twilio-menu can continue walking
    var ctx = encodeURIComponent(JSON.stringify({ nodes: nodes, edges: edges, menuNodeId: nodeId }))
    twiml += '<Gather numDigits="1" action="/api/twilio-menu?ctx=' + ctx + '" method="POST" timeout="' + (cfg.timeout || 10) + '">'
    twiml += say(cfg.text || 'Please make a selection.')
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.')
    return twiml
  }

  // ── CONDITION ────────────────────────────────────────────
  if (node.type === 'condition') {
    var result = false
    if (cfg.condition === 'known_contact') result = !!callData.contact
    else if (cfg.condition === 'has_agent') result = !!(callData.contact && callData.contact.agent_id)
    else if (cfg.condition === 'business_hours') {
      var h = new Date().getUTCHours() - 5 // ET
      result = h >= 9 && h < 18
    }
    else if (cfg.condition === 'after_hours') {
      var h2 = new Date().getUTCHours() - 5
      result = h2 < 9 || h2 >= 18
    }
    else if (cfg.condition === 'repeat_caller') result = !!callData.isRepeat

    var port = result ? 'yes' : 'no'
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === port })
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return say('No route configured. Goodbye.')
  }

  // ── DIAL ─────────────────────────────────────────────────
  if (node.type === 'dial') {
    var ext = null
    if (cfg.agent_id && supabase) {
      var extRes = await supabase.from('phone_extensions').select('*').eq('agent_id', cfg.agent_id).eq('active', true).maybeSingle()
      ext = extRes.data
    }
    var answeredEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'answered' })
    var noAnsEdge    = edges.find(function(e) { return e.from === nodeId && e.port === 'noanswer' })

    if (ext && ext.forward_to) {
      twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout || 30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      twiml += '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + ext.forward_to + '</Number>'
      twiml += '</Dial>'
      // After dial fails/no answer — walk the noanswer branch
      if (noAnsEdge) twiml += await walkFlow(nodes, edges, noAnsEdge.to, callData, supabase, depth + 1)
      else twiml += vmXml(ext.voicemail_greeting)
    } else {
      if (noAnsEdge) twiml += await walkFlow(nodes, edges, noAnsEdge.to, callData, supabase, depth + 1)
      else twiml += vmXml(null)
    }
    return twiml
  }

  // ── ROUND ROBIN ──────────────────────────────────────────
  if (node.type === 'roundrobin' || node.type === 'ringall') {
    var agentIds = cfg.agent_ids || []
    var noAnsEdge2 = edges.find(function(e) { return e.from === nodeId && e.port === 'noanswer' })

    if (agentIds.length > 0 && supabase) {
      var extsRes = await supabase.from('phone_extensions').select('*').in('agent_id', agentIds).eq('active', true)
      var exts = extsRes.data || []

      if (node.type === 'ringall') {
        // Ring all simultaneously using <Dial> with multiple <Number>
        if (exts.length > 0) {
          twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout || 30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
          exts.forEach(function(e) { twiml += '<Number>' + e.forward_to + '</Number>' })
          twiml += '</Dial>'
        }
      } else {
        // Round robin — pick agent with fewest recent calls
        var recentRes = supabase ? await supabase.from('calls').select('agent_id').eq('direction','Inbound').in('agent_id',agentIds).order('called_at',{ascending:false}).limit(200) : {data:[]}
        var counts = {}; agentIds.forEach(function(id) { counts[id] = 0 })
        ;(recentRes.data || []).forEach(function(c) { if (counts[c.agent_id] !== undefined) counts[c.agent_id]++ })
        var nextAgentId = agentIds.reduce(function(a,b) { return counts[a] <= counts[b] ? a : b })
        var ext2 = exts.find(function(e) { return e.agent_id === nextAgentId })
        if (ext2 && ext2.forward_to) {
          twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout || 30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
          twiml += '<Number>' + ext2.forward_to + '</Number>'
          twiml += '</Dial>'
        }
      }
    }

    if (noAnsEdge2) twiml += await walkFlow(nodes, edges, noAnsEdge2.to, callData, supabase, depth + 1)
    else twiml += vmXml(null)
    return twiml
  }

  // ── VOICEMAIL ────────────────────────────────────────────
  if (node.type === 'voicemail') {
    return vmXml(cfg.text)
  }

  // ── SAVE LEAD ────────────────────────────────────────────
  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Caller',
          phone: callData.from,
          status: 'Lead',
          source: cfg.source || 'Inbound Call',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        })
      } catch(e) { /* non-fatal */ }
    }
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'out' })
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return ''
  }

  // ── SMS ──────────────────────────────────────────────────
  if (node.type === 'sms') {
    var sendTo = cfg.send_to || 'caller'
    if ((sendTo === 'caller' || sendTo === 'both') && callData.from) {
      twiml += '<Sms to="' + callData.from + '">' + (cfg.text || 'Thanks for calling!') + '</Sms>'
    }
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'out' })
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return twiml
  }

  // ── HANGUP ───────────────────────────────────────────────
  if (node.type === 'hangup') {
    return '<Hangup />'
  }

  // ── INCOMING (start) — follow first edge ─────────────────
  if (node.type === 'incoming') {
    nextEdge = edges.find(function(e) { return e.from === nodeId })
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return say('No flow configured. Please call back.')
  }

  return say('Unknown node. Please call back.')
}

// ── MAIN HANDLER ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(wrap(say('Invalid.')))

  var body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  var from    = body.From    || ''
  var to      = body.To      || ''
  var callSid = body.CallSid || ''

  var supabase = getSupabase()

  var fallback = wrap(
    '<Gather numDigits="1" action="/api/twilio-menu" method="POST" timeout="10">' +
      say('Thank you for calling Target Team. For sales press 1. For any agent press 0. To leave a voicemail press 9.') +
    '</Gather>' +
    say('We did not receive your selection. Goodbye.')
  )

  if (!supabase) {
    console.error('Supabase not configured')
    return res.send(fallback)
  }

  try {
    // Log the call
    await supabase.from('calls').insert({
      twilio_call_sid: callSid, from_number: from, to_number: to,
      direction: 'Inbound', status: 'in-progress', called_at: new Date().toISOString(),
    }).catch(function() {})

    // Look up caller
    var cleanPhone = from.replace(/\D/g, '').slice(-10)
    var contactRes = await supabase.from('contacts')
      .select('id, first_name, last_name, agent_id, agents(id,name)')
      .or('phone.ilike.%' + cleanPhone + '%').maybeSingle()
    var contact = contactRes.data || null

    // Check if repeat caller
    var recentRes = await supabase.from('calls').select('id').eq('from_number', from).limit(2)
    var isRepeat  = (recentRes.data || []).length > 1

    var callData = { from: from, to: to, callSid: callSid, contact: contact, isRepeat: isRepeat }

    // Load the active flow
    var flowRes = await supabase.from('phone_ivr').select('*').eq('is_active', true).maybeSingle()
    var flow    = flowRes.data

    // If flow has visual nodes — walk them
    if (flow && flow.flow_nodes && flow.flow_nodes.length > 1) {
      var startNode = flow.flow_nodes.find(function(n) { return n.type === 'incoming' })
      if (startNode) {
        var twiml = await walkFlow(flow.flow_nodes, flow.flow_edges || [], startNode.id, callData, supabase, 0)
        return res.send(wrap(twiml))
      }
    }

    // Fallback: old IVR menu_options style
    if (flow && flow.greeting_text) {
      return res.send(wrap(
        '<Gather numDigits="1" action="/api/twilio-menu" method="POST" timeout="10">' +
          say(flow.greeting_text) +
        '</Gather>' +
        say('We did not receive your selection. Goodbye.')
      ))
    }

    // Contact match without flow
    if (contact && contact.agent_id) {
      var extRes = await supabase.from('phone_extensions').select('*').eq('agent_id', contact.agent_id).eq('active', true).maybeSingle()
      var ext = extRes.data
      if (ext && ext.forward_to) {
        var agName = (contact.agents && contact.agents.name) ? contact.agents.name.split(' ')[0] : 'your agent'
        return res.send(wrap(
          say('One moment, connecting you to ' + agName + '.') +
          '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
            '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + ext.forward_to + '</Number>' +
          '</Dial>' +
          vmXml(ext.voicemail_greeting)
        ))
      }
    }

    return res.send(fallback)

  } catch(err) {
    console.error('twilio-inbound error:', err.message)
    return res.send(fallback)
  }
}
