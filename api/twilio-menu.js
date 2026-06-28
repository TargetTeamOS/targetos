// TargetOS V2 — Twilio IVR Menu Handler
// Handles keypress input and continues walking the flow graph.
const querystring = require('querystring')

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return require('@supabase/supabase-js').createClient(url, key)
}

function getRawBody(req) {
  return new Promise((res, rej) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => res(d))
    req.on('error', rej)
  })
}

const wrap  = (xml) => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say   = (t)   => '<Say voice="Polly.Joanna">' + t + '</Say>'
const vmXml = (greeting) =>
  say(greeting || 'Please leave your message after the tone.') +
  '<Record maxLength="120" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'

// Same walkFlow as inbound — needed here to continue after menu selection
async function walkFlow(nodes, edges, nodeId, callData, supabase, depth) {
  if (depth > 20) return say('An error occurred.')

  var node = nodes.find(function(n) { return n.id === nodeId })
  if (!node) return say('Flow error.')

  var cfg = node.config || {}
  var nextEdge = null
  var twiml = ''

  if (node.type === 'greeting') {
    twiml += say(cfg.text || 'Thank you for calling.')
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'out' })
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return twiml
  }

  if (node.type === 'menu') {
    var ctx = encodeURIComponent(JSON.stringify({ nodes: nodes, edges: edges, menuNodeId: nodeId }))
    twiml += '<Gather numDigits="1" action="/api/twilio-menu?ctx=' + ctx + '" method="POST" timeout="' + (cfg.timeout || 10) + '">'
    twiml += say(cfg.text || 'Please make a selection.')
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.')
    return twiml
  }

  if (node.type === 'condition') {
    var result = false
    if (cfg.condition === 'known_contact') result = !!callData.contact
    else if (cfg.condition === 'has_agent') result = !!(callData.contact && callData.contact.agent_id)
    else if (cfg.condition === 'business_hours') { var h = new Date().getUTCHours() - 5; result = h >= 9 && h < 18 }
    else if (cfg.condition === 'after_hours')    { var h2 = new Date().getUTCHours() - 5; result = h2 < 9 || h2 >= 18 }
    var port = result ? 'yes' : 'no'
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === port })
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return say('No route configured. Goodbye.')
  }

  if (node.type === 'dial') {
    var ext = null
    if (cfg.agent_id && supabase) {
      var er = await supabase.from('phone_extensions').select('*').eq('agent_id', cfg.agent_id).eq('active', true).maybeSingle()
      ext = er.data
    }
    var noAnsEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'noanswer' })
    if (ext && ext.forward_to) {
      twiml += '<Dial callerId="' + (callData.to || '') + '" timeout="' + (cfg.timeout || 30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      twiml += '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + ext.forward_to + '</Number></Dial>'
    }
    if (noAnsEdge) twiml += await walkFlow(nodes, edges, noAnsEdge.to, callData, supabase, depth + 1)
    else twiml += vmXml(ext && ext.voicemail_greeting)
    return twiml
  }

  if (node.type === 'roundrobin' || node.type === 'ringall') {
    var agentIds = cfg.agent_ids || []
    var noAnsEdge2 = edges.find(function(e) { return e.from === nodeId && e.port === 'noanswer' })
    if (agentIds.length > 0 && supabase) {
      var extsRes = await supabase.from('phone_extensions').select('*').in('agent_id', agentIds).eq('active', true)
      var exts = extsRes.data || []
      if (node.type === 'ringall') {
        if (exts.length > 0) {
          twiml += '<Dial callerId="' + (callData.to || '') + '" timeout="' + (cfg.timeout || 30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
          exts.forEach(function(e) { if (e.forward_to) twiml += '<Number>' + e.forward_to + '</Number>' })
          twiml += '</Dial>'
        }
      } else {
        var recentRes2 = await supabase.from('calls').select('agent_id').eq('direction','Inbound').in('agent_id',agentIds).order('called_at',{ascending:false}).limit(200)
        var counts = {}; agentIds.forEach(function(id) { counts[id] = 0 })
        ;(recentRes2.data || []).forEach(function(c) { if (counts[c.agent_id] !== undefined) counts[c.agent_id]++ })
        var nextAgentId = agentIds.reduce(function(a,b) { return counts[a] <= counts[b] ? a : b })
        var ext2 = exts.find(function(e) { return e.agent_id === nextAgentId })
        if (ext2 && ext2.forward_to) {
          twiml += '<Dial callerId="' + (callData.to || '') + '" timeout="' + (cfg.timeout || 30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
          twiml += '<Number>' + ext2.forward_to + '</Number></Dial>'
        }
      }
    }
    if (noAnsEdge2) twiml += await walkFlow(nodes, edges, noAnsEdge2.to, callData, supabase, depth + 1)
    else twiml += vmXml(null)
    return twiml
  }

  if (node.type === 'voicemail') return vmXml(cfg.text)

  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Caller', phone: callData.from, status: 'Lead',
          source: cfg.source || 'Inbound Call', created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(), last_activity: new Date().toISOString(),
        })
      } catch(e) {}
    }
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'out' })
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return ''
  }

  if (node.type === 'sms') {
    if ((cfg.send_to === 'caller' || cfg.send_to === 'both' || !cfg.send_to) && callData.from) {
      twiml += '<Sms to="' + callData.from + '">' + (cfg.text || 'Thanks for calling!') + '</Sms>'
    }
    nextEdge = edges.find(function(e) { return e.from === nodeId && e.port === 'out' })
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth + 1)
    return twiml
  }

  if (node.type === 'hangup') return '<Hangup />'

  return say('Unknown step. Goodbye.')
}

// ── MAIN HANDLER ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).end()

  var body = {}
  try { body = querystring.parse(await getRawBody(req)) } catch(e) { body = req.body || {} }

  var digits = body.Digits || ''
  var from   = body.From   || ''
  var to     = body.To     || ''

  var supabase = getSupabase()

  var fallbackVm = wrap(vmXml(null))

  // ── FLOW GRAPH MODE ────────────────────────────────────────
  // If the inbound handler passed flow context in the query string, use it
  var ctxParam = (req.url || '').split('ctx=')[1]
  if (ctxParam) {
    try {
      var ctx = JSON.parse(decodeURIComponent(ctxParam.split('&')[0]))
      var nodes     = ctx.nodes     || []
      var edges     = ctx.edges     || []
      var menuNodeId = ctx.menuNodeId

      var menuNode = nodes.find(function(n) { return n.id === menuNodeId })
      if (menuNode && menuNode.config && menuNode.config.options) {
        var opts = menuNode.config.options
        var chosen = opts.find(function(o) { return String(o.key) === String(digits) })

        // Look up caller contact for condition nodes downstream
        var contact = null
        if (supabase && from) {
          var cleanPhone = from.replace(/\D/g, '').slice(-10)
          var cr = await supabase.from('contacts').select('id,first_name,last_name,agent_id').or('phone.ilike.%' + cleanPhone + '%').maybeSingle()
          contact = cr.data || null
        }
        var callData = { from: from, to: to, contact: contact }

        if (chosen) {
          // Say the "say when pressed" text if configured
          var leadSay = chosen.say ? say(chosen.say) : ''
          // Find the edge from this menu node for this key
          var portId = 'key_' + chosen.key
          var nextEdge = edges.find(function(e) { return e.from === menuNodeId && e.port === portId })
          if (nextEdge) {
            var rest = await walkFlow(nodes, edges, nextEdge.to, callData, supabase, 0)
            return res.send(wrap(leadSay + rest))
          }
          // No edge connected for this key — check if it's a direct extension action (legacy)
          if (chosen.action === 'extension' && chosen.value && supabase) {
            var extRes = await supabase.from('phone_extensions').select('*').eq('number', String(chosen.value)).eq('active', true).maybeSingle()
            var ext = extRes.data
            if (ext && ext.forward_to) {
              return res.send(wrap(
                leadSay +
                say('Connecting you to ' + ext.label + '.') +
                '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
                  '<Number>' + ext.forward_to + '</Number></Dial>' +
                vmXml(ext.voicemail_greeting)
              ))
            }
          }
          if (chosen.action === 'voicemail') return res.send(wrap(leadSay + vmXml(null)))
        }

        // No match — replay menu
        var replayCtx = encodeURIComponent(JSON.stringify(ctx))
        var replayTwiml = '<Gather numDigits="1" action="/api/twilio-menu?ctx=' + replayCtx + '" method="POST" timeout="' + (menuNode.config.timeout || 10) + '">'
        replayTwiml += say('Invalid selection. ' + (menuNode.config.text || 'Please try again.'))
        replayTwiml += '</Gather>'
        replayTwiml += say('We did not receive your selection. Goodbye.')
        return res.send(wrap(replayTwiml))
      }
    } catch(e) {
      console.error('menu ctx parse error:', e.message)
    }
  }

  // ── LEGACY IVR MODE (no flow graph) ───────────────────────
  if (!supabase) return res.send(fallbackVm)

  try {
    // Voicemail shortcut
    if (digits === '9') return res.send(wrap(vmXml(null)))

    var ivrRes = await supabase.from('phone_ivr').select('*').eq('is_active', true).maybeSingle()
    var ivr = ivrRes.data
    var options = (ivr && Array.isArray(ivr.menu_options)) ? ivr.menu_options : []

    if (digits === String((ivr && ivr.voicemail_extension) || '9')) return res.send(wrap(vmXml(null)))

    var chosen2 = options.find(function(o) { return String(o.key) === String(digits) })
    if (!chosen2) {
      return res.send(wrap(say('Invalid selection.') + '<Redirect>/api/twilio-inbound</Redirect>'))
    }
    if (chosen2.action === 'voicemail') return res.send(wrap(vmXml(null)))

    if (chosen2.action === 'extension') {
      var extRes2 = await supabase.from('phone_extensions').select('*').eq('number', String(chosen2.value)).eq('active', true).maybeSingle()
      var ext3 = extRes2.data
      if (ext3 && ext3.forward_to) {
        return res.send(wrap(
          say('Connecting you to ' + ext3.label + '.') +
          '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
            '<Number>' + ext3.forward_to + '</Number></Dial>' +
          vmXml(ext3.voicemail_greeting)
        ))
      }
    }

    if (chosen2.action === 'round_robin') {
      var rrRes = await supabase.from('phone_routing').select('*').eq('rule_type','round_robin').eq('is_active',true).maybeSingle()
      var ids3 = (rrRes.data && rrRes.data.config && rrRes.data.config.agent_ids) || []
      if (ids3.length > 0) {
        var recentRes3 = await supabase.from('calls').select('agent_id').eq('direction','Inbound').in('agent_id',ids3).order('called_at',{ascending:false}).limit(200)
        var counts3 = {}; ids3.forEach(function(id) { counts3[id] = 0 })
        ;(recentRes3.data || []).forEach(function(c) { if (counts3[c.agent_id] !== undefined) counts3[c.agent_id]++ })
        var nextId3 = ids3.reduce(function(a,b) { return counts3[a] <= counts3[b] ? a : b })
        var extRes3 = await supabase.from('phone_extensions').select('*').eq('agent_id', nextId3).eq('active', true).maybeSingle()
        var ext4 = extRes3.data
        if (ext4 && ext4.forward_to) {
          return res.send(wrap(
            say('Connecting you to the next available agent.') +
            '<Dial callerId="' + to + '" timeout="30" record="record-from-answer" recordingStatusCallback="/api/twilio-status">' +
              '<Number>' + ext4.forward_to + '</Number></Dial>' +
            vmXml(null)
          ))
        }
      }
    }

    return res.send(wrap(vmXml(null)))
  } catch(err) {
    console.error('menu error:', err.message)
    return res.send(wrap(vmXml(null)))
  }
}
