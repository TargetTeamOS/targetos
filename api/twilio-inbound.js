// TargetOS V2 — Twilio Inbound Call Handler
// - Every call gets recorded (Twilio <Record> or <Dial record="...">)
// - New number → create Contact + activity log
// - Known number → update Contact timeline
// - If a visual flow is saved → walks it node by node
// - If no flow → sensible fallback greeting + voicemail
'use strict'

const querystring = require('querystring')

// ── HELPERS ───────────────────────────────────────────────────────
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

const wrap   = xml => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say    = (t, voice) => '<Say voice="' + (voice || 'Polly.Joanna') + '">' + (t||'') + '</Say>'
const vmXml  = (greeting, voice, maxLen) =>
  say(greeting || 'Please leave your message after the tone.', voice) +
  '<Record maxLength="' + (maxLen||120) + '" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'

// Parse jsonb that may come back as a string
function parseJ(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch(e) { return null } }
  return v
}

// Format phone for display
function fmtPhone(p) {
  const d = (p||'').replace(/\D/g,'').slice(-10)
  return d.length===10 ? '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6) : p
}

// ── FLOW WALKER ───────────────────────────────────────────────────
async function walkFlow(nodes, edges, nodeId, callData, supabase, depth) {
  if (depth > 20) return say('An error occurred. Please call back.')
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return say('Flow configuration error.')
  const cfg = node.config || {}
  let twiml = '', nextEdge = null

  if (node.type === 'incoming') {
    nextEdge = edges.find(e => e.from === nodeId)
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return say('No flow steps configured.')
  }

  if (node.type === 'hangup') return '<Hangup />'

  if (node.type === 'greeting') {
    twiml += say(cfg.text || 'Thank you for calling.', cfg.voice)
    nextEdge = edges.find(e => e.from===nodeId && e.port==='out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  if (node.type === 'hold') {
    const HOLDURLS = { classical:'https://demo.twilio.com/docs/classic.mp3', jazz:'https://demo.twilio.com/docs/jazz.mp3', pop:'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3', silence:'https://demo.twilio.com/docs/silence.mp3' }
    const holdVoice = cfg.voice || 'Polly.Joanna'
    const musicId = cfg.music || 'twilio'
    const musicUrl = musicId === 'custom' ? (cfg.custom_url||'') : (HOLDURLS[musicId]||'')
    if (cfg.say_first) twiml += say(cfg.say_first, holdVoice)
    if (musicUrl) twiml += '<Play loop="' + Math.max(1,Math.ceil((cfg.duration||30)/30)) + '">' + musicUrl + '</Play>'
    else twiml += '<Pause length="' + (cfg.duration||30) + '" />'
    nextEdge = edges.find(e => e.from===nodeId && e.port==='out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  if (node.type === 'audio') {
    const audioVoice = cfg.voice || 'Polly.Joanna'
    if (cfg.say_first) twiml += say(cfg.say_first, audioVoice)
    if (cfg.url) twiml += '<Play loop="' + (cfg.loop||1) + '">' + cfg.url + '</Play>'
    nextEdge = edges.find(e => e.from===nodeId && e.port==='out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  if (node.type === 'menu') {
    const ctx = encodeURIComponent(JSON.stringify({ nodes, edges, menuNodeId: nodeId }))
    twiml += '<Gather numDigits="1" action="/api/twilio-menu?ctx=' + ctx + '" method="POST" timeout="' + (cfg.timeout||10) + '">'
    twiml += say(cfg.text || 'Please make a selection.', cfg.voice)
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.', cfg.voice)
    return twiml
  }

  if (node.type === 'language') {
    const ctx = encodeURIComponent(JSON.stringify({ nodes, edges, menuNodeId: nodeId }))
    twiml += '<Gather numDigits="1" action="/api/twilio-menu?ctx=' + ctx + '" method="POST" timeout="' + (cfg.timeout||10) + '">'
    twiml += say(cfg.prompt || 'For English press 1.', cfg.voice)
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.', cfg.voice)
    return twiml
  }

  if (node.type === 'condition') {
    let result = false
    if (cfg.condition === 'known_contact')  result = !!callData.contact
    if (cfg.condition === 'has_agent')      result = !!(callData.contact && callData.contact.agent_id)
    if (cfg.condition === 'repeat_caller')  result = !!callData.isRepeat
    if (cfg.condition === 'business_hours') {
      const h = new Date().getUTCHours() - 4  // ET approx
      result = h >= 9 && h < 18
    }
    if (cfg.condition === 'after_hours') {
      const h = new Date().getUTCHours() - 4
      result = h < 9 || h >= 18
    }
    const port = result ? 'yes' : 'no'
    nextEdge = edges.find(e => e.from===nodeId && e.port===port)
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return say('Goodbye.')
  }

  if (node.type === 'assigned') {
    let assignedAgent = null
    if (callData.contact && callData.contact.agent_id && supabase) {
      const ar = await supabase.from('agents').select('id,name,phone').eq('id', callData.contact.agent_id).maybeSingle()
      if (ar.data && ar.data.phone) assignedAgent = ar.data
    }
    if (assignedAgent) {
      let agPhone = assignedAgent.phone.replace(/[^+0-9]/g,'')
      if (!agPhone.startsWith('+')) agPhone = '+1' + agPhone
      twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout||30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      twiml += '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + agPhone + '</Number>'
      twiml += '</Dial>'
      const foundEdge = edges.find(e => e.from===nodeId && e.port==='found')
      if (foundEdge) twiml += await walkFlow(nodes, edges, foundEdge.to, callData, supabase, depth+1)
    } else {
      const nfEdge = edges.find(e => e.from===nodeId && e.port==='notfound')
      if (nfEdge) twiml += await walkFlow(nodes, edges, nfEdge.to, callData, supabase, depth+1)
      else twiml += vmXml('No agent is available. Please leave a message.')
    }
    return twiml
  }

  if (node.type === 'dial') {
    let dialTarget = null

    if (cfg.dial_type === 'number' && cfg.direct_number) {
      // Direct number dial
      let n = cfg.direct_number.replace(/[^+0-9]/g,'')
      if (!n.startsWith('+')) n = '+1' + n
      dialTarget = '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + n + '</Number>'
    } else if (cfg.dial_type === 'sip' && cfg.sip_address) {
      // SIP dial
      const sip = cfg.sip_address.includes('@') ? cfg.sip_address : cfg.sip_address
      dialTarget = '<Sip statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + sip + '</Sip>'
    } else if (cfg.agent_id && supabase) {
      // Agent dial — try phone_extensions first, then agents.phone
      const extRes = await supabase.from('phone_extensions').select('*').eq('agent_id', cfg.agent_id).eq('active', true).maybeSingle()
      const agRes  = await supabase.from('agents').select('phone').eq('id', cfg.agent_id).maybeSingle()
      const rawPhone = extRes.data?.forward_to || agRes.data?.phone
      if (rawPhone) {
        let p = rawPhone.replace(/[^+0-9]/g,'')
        if (!p.startsWith('+')) p = '+1' + p
        dialTarget = '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + p + '</Number>'
      }
    }

    if (dialTarget) {
      twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout||30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      twiml += dialTarget
      twiml += '</Dial>'
    }

    const noAns = edges.find(e => e.from===nodeId && e.port==='noanswer')
    if (noAns) twiml += await walkFlow(nodes, edges, noAns.to, callData, supabase, depth+1)
    else if (!dialTarget) twiml += vmXml('No agent available. Please leave a message.')
    else twiml += vmXml()
    return twiml
  }

  if (node.type === 'roundrobin' || node.type === 'ringall') {
    const agentIds = cfg.agent_ids || []
    if (agentIds.length > 0 && supabase) {
      const phones = []
      // Try phone_extensions first, then agents.phone
      for (const aid of agentIds) {
        const extR = await supabase.from('phone_extensions').select('forward_to').eq('agent_id', aid).eq('active', true).maybeSingle()
        const agR  = await supabase.from('agents').select('phone').eq('id', aid).maybeSingle()
        const ph   = extR.data?.forward_to || agR.data?.phone
        if (ph) phones.push(ph.replace(/[^+0-9]/g,''))
      }
      if (phones.length > 0) {
        twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout||30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
        phones.forEach(p => { twiml += '<Number>' + (p.startsWith('+') ? p : '+1'+p) + '</Number>' })
        twiml += '</Dial>'
        const noAns = edges.find(e => e.from===nodeId && e.port==='noanswer')
        if (noAns) twiml += await walkFlow(nodes, edges, noAns.to, callData, supabase, depth+1)
        else twiml += vmXml()
        return twiml
      }
    }
    return vmXml()
  }

  if (node.type === 'voicemail') {
    if (cfg.pin_enabled && cfg.pin) {
      const vmCtx = encodeURIComponent(JSON.stringify({
        greeting: cfg.text, voice: cfg.voice, pin: cfg.pin,
        max_length: cfg.max_length||120, transcribe: cfg.transcribe!==false,
        attempts: cfg.pin_attempts||3, attempt: 0,
      }))
      twiml += '<Gather numDigits="' + String(cfg.pin).length + '" action="/api/twilio-voicemail-access?ctx=' + vmCtx + '" method="POST" timeout="15">'
      twiml += say('Please enter your ' + String(cfg.pin).length + '-digit voicemail PIN.', cfg.voice)
      twiml += '</Gather>'
      twiml += say('No PIN entered. Goodbye.', cfg.voice)
      return twiml
    }
    return vmXml(cfg.text, cfg.voice, cfg.max_length)
  }

  if (node.type === 'listings') {
    // Route to the listing search phone handler
    const voice    = cfg.voice || 'Polly.Joanna'
    const maxRes   = cfg.max_results || 5
    const introEnc = encodeURIComponent(cfg.intro || 'Welcome to our available listings search.')
    const listUrl  = 'https://app.targetreteam.com/api/twilio-listings?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&intro=' + introEnc
    twiml += '<Redirect method="GET">' + listUrl + '</Redirect>'
    return twiml
  }

  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Caller', last_name: '', phone: callData.from,
          source: cfg.source || 'Inbound Call', status: 'New',
          notes: 'Auto-created from inbound call ' + callData.callSid,
          created_at: new Date().toISOString(),
        })
      } catch(e) { console.warn('savelead:', e.message) }
    }
    nextEdge = edges.find(e => e.from===nodeId && e.port==='out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  if (node.type === 'sms') {
    if (supabase && callData.from) {
      try {
        const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
        const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN
        const FROM_NUM    = process.env.TWILIO_PHONE_NUMBER || callData.to
        if (ACCOUNT_SID && AUTH_TOKEN) {
          const auth = Buffer.from(ACCOUNT_SID + ':' + AUTH_TOKEN).toString('base64')
          const targets = cfg.send_to === 'caller' ? [callData.from] : cfg.send_to === 'both' ? [callData.from] : []
          for (const target of targets) {
            await fetch('https://api.twilio.com/2010-04-01/Accounts/' + ACCOUNT_SID + '/Messages.json', {
              method: 'POST',
              headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ To: target, From: FROM_NUM, Body: cfg.text || 'Thank you for calling!' }).toString(),
            }).catch(e => console.warn('sms:', e.message))
          }
        }
      } catch(e) { console.warn('sms node:', e.message) }
    }
    nextEdge = edges.find(e => e.from===nodeId && e.port==='out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  // Unknown node — continue
  nextEdge = edges.find(e => e.from===nodeId)
  if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
  return say('Goodbye.')
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
    // Try is_active=true first, then most recent
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
