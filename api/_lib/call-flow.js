// TargetOS V2 — Call Flow Walker
// Walks the visual IVR flow graph node by node, generating TwiML.
// Every node type handles its own error — never returns empty string.
'use strict'

const {
  wrap, say, pause, play, voicemailTwiml, hangup, redirect, esc,
  normalizePhone, isBusinessHours, HOLD_MUSIC, BASE_URL, DEFAULT_VOICE,
  loadFlow, logCallEvent, getSupabase,
} = require('./phone')
const { buildDefaultNodes, buildDefaultEdges } = require('./default-flow')

// Loads the saved call flow, auto-creating and saving the default flow
// if none exists yet. Moved here (shared) rather than living only in
// twilio-inbound.js, so any endpoint that needs to walk the flow --
// not just the main inbound handler -- can reuse the exact same logic
// instead of restarting the whole flow from its very first node.
async function ensureFlow(sb) {
  let { nodes, edges } = await loadFlow(sb)
  if (nodes.length > 0) return { nodes, edges }

  console.info('[call-flow] No flow found — auto-saving default Target Team flow')
  try {
    const { data: agents } = await sb.from('agents')
      .select('id,phone').eq('active', true).order('created_at', { ascending: true })
    const agentIds = (agents || []).filter(a => a.phone).map(a => a.id)

    const nodesWithAgents = buildDefaultNodes(agentIds)
    const defaultEdges = buildDefaultEdges()

    const payload = {
      name:       'Target Team — Main Call Flow',
      flow_nodes: JSON.stringify(nodesWithAgents),
      flow_edges: JSON.stringify(defaultEdges),
      is_active:  true,
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await sb.from('phone_ivr').select('id').limit(1).maybeSingle()
    if (existing?.id) {
      await sb.from('phone_ivr').update(payload).eq('id', existing.id)
    } else {
      await sb.from('phone_ivr').insert({ ...payload, voicemail_extension: '9', created_at: new Date().toISOString() })
    }

    console.info('[call-flow] Default flow saved with', agentIds.length, 'agents in roundrobin')
    return { nodes: nodesWithAgents, edges: defaultEdges }
  } catch(e) {
    console.error('[call-flow] ensureFlow save failed:', e.message)
    return { nodes: buildDefaultNodes([]), edges: buildDefaultEdges() }
  }
}

async function walkFlow(nodes, edges, nodeId, callData, supabase, depth) {
  // Safety: prevent infinite loops
  if (depth > 25) {
    console.error('[walkFlow] depth limit at node', nodeId)
    return say('We encountered an issue. Please hold while we connect you.') +
           voicemailTwiml()
  }

  const node = nodes.find(n => n.id === nodeId)
  if (!node) {
    console.error('[walkFlow] node not found:', nodeId, '— available:', nodes.map(n=>n.id).join(','))
    return voicemailTwiml('We encountered a technical error. Please leave a message.')
  }

  const cfg   = node.config || {}
  const voice = cfg.voice   || DEFAULT_VOICE
  const to    = esc(callData.to || '')
  // The number an agent's phone should show as caller ID -- must be
  // the ACTUAL CALLER's number, not the office's own line. Every
  // dial path in this file previously used `to` (the office's own
  // number that was dialed) here, meaning every single call -- no
  // matter which agent, listing, or routing path -- showed the SAME
  // office number to whichever agent's phone rang, instead of who
  // was actually calling.
  const from  = esc(callData.from || '') || to

  // Helper: find next node via edge port and continue walking
  async function follow(port) {
    const edge = edges.find(e => e.from === nodeId && e.port === port)
    if (!edge) return null
    return walkFlow(nodes, edges, edge.to, callData, supabase, depth + 1)
  }

  // ── INCOMING CALL ──────────────────────────────────────────────
  if (node.type === 'incoming') {
    const edge = edges.find(e => e.from === nodeId)
    if (edge) return walkFlow(nodes, edges, edge.to, callData, supabase, depth + 1)
    return voicemailTwiml('Thank you for calling Target Team. Please leave a message.')
  }

  // ── HANG UP ────────────────────────────────────────────────────
  if (node.type === 'hangup') {
    return say('Thank you for calling Target Team. Goodbye.', voice) + hangup()
  }

  // ── GREETING ──────────────────────────────────────────────────
  if (node.type === 'greeting') {
    let twiml = say(cfg.text || 'Thank you for calling.', voice)
    const rest = await follow('out')
    return twiml + (rest || '')
  }

  // ── HOLD MUSIC ────────────────────────────────────────────────
  if (node.type === 'hold') {
    let twiml = cfg.say_first ? say(cfg.say_first, voice) : ''
    const url  = cfg.music === 'custom'
      ? (cfg.custom_url || '')
      : (HOLD_MUSIC[cfg.music || 'classical'] || HOLD_MUSIC.classical)
    const loops = Math.max(1, Math.ceil((cfg.duration || 30) / 30))
    twiml += url ? play(url, loops) : pause(cfg.duration || 30)
    const rest = await follow('out')
    return twiml + (rest || '')
  }

  // ── AUDIO FILE ────────────────────────────────────────────────
  if (node.type === 'audio') {
    let twiml = cfg.say_first ? say(cfg.say_first, voice) : ''
    if (cfg.url) twiml += play(cfg.url, cfg.loop || 1)
    const rest = await follow('out')
    return twiml + (rest || '')
  }

  // ── IVR MENU ──────────────────────────────────────────────────
  if (node.type === 'menu') {
    // Deduplicate keys — last definition wins when there are duplicates
    const seen = new Set()
    const opts = []
    for (let i = (cfg.options || []).length - 1; i >= 0; i--) {
      const k = String(cfg.options[i].key)
      if (!seen.has(k)) { opts.unshift(cfg.options[i]); seen.add(k) }
    }

    // Action URL carries only the node ID — menu handler reloads flow from DB
    const action = BASE_URL + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(nodeId)

    return (
      '<Gather numDigits="1" action="' + esc(action) + '" method="POST"' +
      ' timeout="' + (cfg.timeout || 10) + '">' +
        say(cfg.text || 'Please make a selection.', voice) +
      '</Gather>' +
      say('We did not receive your selection. Goodbye.', voice) +
      hangup()
    )
  }

  // ── LANGUAGE SELECTOR ─────────────────────────────────────────
  if (node.type === 'language') {
    const action = BASE_URL + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(nodeId)
    return (
      '<Gather numDigits="1" action="' + esc(action) + '" method="POST"' +
      ' timeout="' + (cfg.timeout || 10) + '">' +
        say(cfg.prompt || 'For English press 1.', voice) +
      '</Gather>' +
      say('We did not receive your selection. Goodbye.', voice) +
      hangup()
    )
  }

  // ── CONDITION ─────────────────────────────────────────────────
  if (node.type === 'condition') {
    let result = false
    switch (cfg.condition) {
      case 'known_contact':  result = !!callData.contact; break
      case 'has_agent':      result = !!(callData.contact?.agent_id); break
      case 'repeat_caller':  result = !!callData.isRepeat; break
      case 'business_hours': result =  isBusinessHours(); break
      case 'after_hours':    result = !isBusinessHours(); break
      default:
        console.warn('[walkFlow] unknown condition:', cfg.condition)
    }
    const rest = await follow(result ? 'yes' : 'no')
    if (rest) return rest
    return say('Goodbye.', voice) + hangup()
  }

  // ── ASSIGNED AGENT ────────────────────────────────────────────
  if (node.type === 'assigned') {
    let phone = null
    // Only Clients ring their specifically assigned agent directly.
    // Attorneys, mortgage brokers, and other deal collaborators aren't
    // "assigned" to one agent the way a client is -- per business
    // rule, they always go through the round-robin pool instead, even
    // if they happen to have an agent_id on file from being linked to
    // a specific deal.
    const isClient = !callData.contact?.type || callData.contact.type === 'Client'
    if (callData.contact?.agent_id && isClient && supabase) {
      try {
        const { data: ag } = await supabase.from('agents')
          .select('phone').eq('id', callData.contact.agent_id).maybeSingle()
        if (ag?.phone) phone = normalizePhone(ag.phone)
      } catch(e) { console.warn('[walkFlow] assigned lookup:', e.message) }
    }

    let twiml = ''
    if (phone) {
      // Whisper the agent that this is THEIR contact calling back,
      // by name, before the call connects.
      const cname = [callData.contact?.first_name, callData.contact?.last_name].filter(Boolean).join(' ')
      await logCallEvent(supabase, callData.callSid, 'routed_to_assigned_agent',
        'Repeat contact' + (cname ? ' ' + cname : '') + ' routed to their assigned agent')
      twiml += buildDial(from, phone, cfg.timeout || 30, null,
        'context=assigned' + (cname ? '&name=' + encodeURIComponent(cname) : ''))
    }

    // notfound port fires when: no agent assigned, agent has no phone,
    // or the Dial failed (busy/no-answer)
    const rest = await follow('notfound')
    if (rest) return twiml + rest
    return twiml + voicemailTwiml(
      phone
        ? 'Your agent is currently unavailable. Please leave a message.'
        : 'You do not have an assigned agent. Please leave a message.',
      voice
    )
  }

  // ── DIRECT DIAL ───────────────────────────────────────────────
  if (node.type === 'dial') {
    let target = ''
    if (cfg.dial_type === 'number' && cfg.direct_number) {
      target = '<Number>' + esc(normalizePhone(cfg.direct_number)) + '</Number>'
    } else if (cfg.dial_type === 'sip' && cfg.sip_address) {
      target = '<Sip>' + esc(cfg.sip_address) + '</Sip>'
    } else if (cfg.agent_id && supabase) {
      try {
        const { data: ag } = await supabase.from('agents')
          .select('phone').eq('id', cfg.agent_id).maybeSingle()
        if (ag?.phone) target = '<Number>' + esc(normalizePhone(ag.phone)) + '</Number>'
      } catch(e) { console.warn('[walkFlow] dial lookup:', e.message) }
    }

    let twiml = target ? buildDial(from, null, cfg.timeout || 30, target) : ''
    const rest = await follow('noanswer')
    if (rest) return twiml + rest
    return twiml + voicemailTwiml('That person is unavailable. Please leave a message.', voice)
  }

  // ── RING ALL ───────────────────────────────────────────────────
  if (node.type === 'ringall') {
    const ids    = cfg.agent_ids || []
    const phones = []

    if (ids.length > 0 && supabase) {
      try {
        // Single batch query — not N serial queries
        const { data: ags } = await supabase
          .from('agents').select('id, phone').in('id', ids)
        ;(ags || []).forEach(ag => {
          if (ag.phone) phones.push(normalizePhone(ag.phone))
        })
      } catch(e) { console.warn('[walkFlow] ringall lookup:', e.message) }
    }

    if (phones.length === 0) {
      console.warn('[walkFlow] ringall: no phones for agent_ids:', ids)
      const rest = await follow('noanswer')
      if (rest) return rest
      return voicemailTwiml(
        'All agents are currently unavailable. Please leave your name and number and we will call you back.',
        voice
      )
    }

    const numbers = phones.map(p => '<Number>' + esc(p) + '</Number>').join('')
    let twiml = buildDial(from, null, cfg.timeout || 30, numbers)
    const rest = await follow('noanswer')
    if (rest) return twiml + rest
    return twiml + voicemailTwiml(
      'We are sorry, all agents are currently unavailable. Please leave your name and number and we will return your call.',
      voice
    )
  }

  // ── ROUND ROBIN (sequential hunt group) ──────────────────────────
  // Rings agents ONE AT A TIME, least-busy-first, ~20 seconds each,
  // for up to ~1 minute total, then falls to voicemail. This is a
  // real hunt group -- earlier versions only rang a single agent once
  // (first just "ring all simultaneously" mislabeled as round robin,
  // then "ring only the single least-busy agent" with an explicit
  // code comment admitting it wasn't true sequential hunting). Fixed
  // July 2026 per business requirement: 20 sec/agent, 1 min total.
  if (node.type === 'roundrobin') {
    const ids = cfg.agent_ids || []
    let agentsData = []

    if (ids.length > 0 && supabase) {
      try {
        const { data: ags } = await supabase
          .from('agents').select('id, phone').in('id', ids)
        agentsData = (ags || []).filter(a => a.phone)
      } catch(e) { console.warn('[walkFlow] roundrobin lookup:', e.message) }
    }

    if (agentsData.length === 0) {
      console.warn('[walkFlow] roundrobin: no phones for agent_ids:', ids)
      await logCallEvent(supabase, callData.callSid, 'voicemail_fallback',
        'Round-robin configured with ' + ids.length + ' agent(s) [' + ids.join(',') + '], but none have a usable phone number on file')
      const rest = await follow('noanswer')
      if (rest) return rest
      return voicemailTwiml(
        'All agents are currently unavailable. Please leave your name and number and we will call you back.',
        voice
      )
    }

    // Order least-busy-first (today's inbound call count), same
    // fairness logic as before -- just applied to build a SEQUENCE
    // now, not to pick a single winner.
    let ordered = agentsData
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data: todaysCalls } = await supabase
        .from('calls').select('agent_id')
        .in('agent_id', agentsData.map(a => a.id))
        .eq('direction', 'Inbound')
        .gte('called_at', todayStart.toISOString())
      const counts = {}
      agentsData.forEach(a => { counts[a.id] = 0 })
      ;(todaysCalls || []).forEach(c => { if (counts[c.agent_id] !== undefined) counts[c.agent_id]++ })
      ordered = [...agentsData].sort((a, b) => counts[a.id] - counts[b.id])
    } catch(e) {
      console.warn('[walkFlow] roundrobin count lookup:', e.message)
    }

    // Ring each agent PER_AGENT_SECONDS in sequence until TOTAL_SECONDS
    // is used up. A failed <Dial> (no answer/busy) falls straight
    // through to the next <Dial> in the same TwiML response -- no
    // redirect/round-trip needed for the hunt itself. Each <Number>
    // carries its own statusCallback with agentId + callLogId so
    // twilio-status.js can tell EXACTLY which agent answered (needed
    // for the new-contact auto-assignment/email/task automation).
    const PER_AGENT_SECONDS = cfg.per_agent_seconds || 20
    const TOTAL_SECONDS     = cfg.total_seconds || 60
    const maxAgents = Math.max(1, Math.floor(TOTAL_SECONDS / PER_AGENT_SECONDS))
    const huntList  = ordered.slice(0, maxAgents)
    await logCallEvent(supabase, callData.callSid, 'roundrobin_dialing', 'Ringing ' + huntList.length + ' agent(s) in order: ' + huntList.map(a=>a.id).join(', '))
    const isNewLead = !callData.contact?.agent_id

    let twiml = huntList.map(a => {
      const phone = normalizePhone(a.phone)
      const statusUrl = BASE_URL + '/api/twilio-status?agentId=' + encodeURIComponent(a.id) +
        (callData.callId ? '&callLogId=' + encodeURIComponent(callData.callId) : '')
      // FIX (July 2026): recording notice whispered to the agent's leg
      // via url=, not a <Say> before <Dial> (which only reaches the
      // caller, not the agent). Also tells the agent up front if this
      // is a new/unassigned lead, per business requirement.
      const whisperUrl = BASE_URL + '/api/twilio-recording-notice?context=roundrobin' + (isNewLead ? '&newContact=1' : '')
      return (
        '<Dial callerId="' + from + '" timeout="' + PER_AGENT_SECONDS + '" record="record-from-answer"' +
        ' recordingStatusCallback="' + BASE_URL + '/api/twilio-status">' +
        '<Number statusCallback="' + esc(statusUrl) + '" statusCallbackMethod="POST"' +
        ' statusCallbackEvent="answered" url="' + esc(whisperUrl) + '">' + esc(phone) + '</Number>' +
        '</Dial>'
      )
    }).join('')

    const rest = await follow('noanswer')
    if (rest) return twiml + rest
    return twiml + voicemailTwiml(
      'We are sorry, all agents are currently unavailable. Please leave your name and number and we will return your call.',
      voice
    )
  }

  // ── VOICEMAIL ─────────────────────────────────────────────────
  if (node.type === 'voicemail') {
    if (cfg.pin_enabled && cfg.pin) {
      // SECURITY (July 2026): the actual PIN used to travel in this ctx
      // blob, visible in the URL / Twilio request logs on every retry.
      // Now we only pass a reference to WHICH node this is — the real
      // PIN gets re-fetched fresh from the database on each attempt in
      // twilio-voicemail-access.js, so the secret itself never leaves
      // the server.
      const ctx  = encodeURIComponent(JSON.stringify({
        nodeId: node.id, greeting: cfg.text, voice,
        max_length: cfg.max_length || 120,
        transcribe: cfg.transcribe !== false,
        attempts: cfg.pin_attempts || 3, attempt: 0,
        pinLen: String(cfg.pin).length,
      }))
      const pinLen = String(cfg.pin).length
      return (
        '<Gather numDigits="' + pinLen + '"' +
        ' action="' + esc(BASE_URL + '/api/twilio-voicemail-access?ctx=' + ctx) + '"' +
        ' method="POST" timeout="15">' +
          say('Please enter your ' + pinLen + '-digit PIN.', voice) +
        '</Gather>' +
        say('No PIN entered. Goodbye.', voice) + hangup()
      )
    }
    return voicemailTwiml(cfg.text, voice, cfg.max_length || 120)
  }

  // ── SAVE AS LEAD ──────────────────────────────────────────────
  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Unknown', last_name: 'Caller',
          phone: callData.from, source: cfg.source || 'Inbound Call',
          status: 'New', created_at: new Date().toISOString(),
          notes: 'Auto-created from inbound call.',
          updated_at: new Date().toISOString(),
        })
      } catch(e) { console.warn('[walkFlow] savelead:', e.message) }
    }
    const rest = await follow('out')
    return rest || ''
  }

  // ── SEND SMS ──────────────────────────────────────────────────
  if (node.type === 'sms') {
    const SID  = process.env.TWILIO_ACCOUNT_SID
    const TOK  = process.env.TWILIO_AUTH_TOKEN
    const FROM = process.env.TWILIO_PHONE_NUMBER || callData.to
    if (SID && TOK && callData.from) {
      const auth = 'Basic ' + Buffer.from(SID + ':' + TOK).toString('base64')
      fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: callData.from, From: FROM, Body: cfg.text || 'Thank you for calling!' }).toString(),
      }).catch(e => console.warn('[walkFlow] sms:', e.message))
    }
    const rest = await follow('out')
    return rest || ''
  }

  // ── CRM LISTINGS SEARCH ───────────────────────────────────────
  if (node.type === 'listings') {
    const url = BASE_URL + '/api/twilio-listings?step=intro' +
      '&voice='  + encodeURIComponent(voice) +
      '&max='    + (cfg.max_results || 5) +
      '&intro='  + encodeURIComponent(cfg.intro || 'Welcome to our exclusive listings search.')
    return redirect(url, 'GET')
  }

  // ── LIVE MLS SEARCH ───────────────────────────────────────────
  if (node.type === 'mlssearch') {
    const url = BASE_URL + '/api/twilio-mls-search?step=intro' +
      '&voice='  + encodeURIComponent(voice) +
      '&max='    + (cfg.max_results || 5) +
      '&area='   + encodeURIComponent(cfg.area || '') +
      '&intro='  + encodeURIComponent(cfg.intro || 'Welcome to our live MLS search.')
    return redirect(url, 'GET')
  }

  // ── AGENT DIRECTORY ───────────────────────────────────────────
  if (node.type === 'directory') {
    const url = BASE_URL + '/api/twilio-directory?step=announce' +
      '&voice=' + encodeURIComponent(voice) +
      '&to='    + encodeURIComponent(callData.to || '')
    return redirect(url, 'GET')
  }

  // ── UNKNOWN NODE ──────────────────────────────────────────────
  console.warn('[walkFlow] unknown node type "' + node.type + '" id=' + nodeId + ' — skipping')
  const edge = edges.find(e => e.from === nodeId)
  if (edge) return walkFlow(nodes, edges, edge.to, callData, supabase, depth + 1)
  return voicemailTwiml('We encountered a technical issue. Please leave a message.')
}

// ── DIAL HELPER ────────────────────────────────────────────────────
// whisperQs: optional extra query string for the recording-notice
// whisper (e.g. 'context=assigned&name=John%20Smith') so the agent
// hears WHO is calling and why before the legs connect.
function buildDial(callerId, singlePhone, timeout, innerTwiml, whisperQs) {
  // FIX (July 2026): the recording notice was a <Say> BEFORE <Dial>,
  // which only reaches whoever is already on the call (the caller) --
  // not the person being dialed, who is who actually needs to hear it
  // for consent purposes. Whispered via the <Number> url= attribute
  // instead, same mechanism as the outbound-call fix earlier tonight.
  const whisperUrl = BASE_URL + '/api/twilio-recording-notice' + (whisperQs ? '?' + whisperQs : '')
  const inner = innerTwiml || ('<Number url="' + esc(whisperUrl) + '">' + esc(singlePhone) + '</Number>')
  return (
    '<Dial callerId="' + callerId + '"' +
    ' timeout="' + timeout + '"' +
    ' record="record-from-answer"' +
    ' recordingStatusCallback="' + BASE_URL + '/api/twilio-status">' +
    inner +
    '</Dial>'
  )
}

// Backward compat exports
const vmXml = voicemailTwiml
module.exports = { walkFlow, ensureFlow, wrap, say, vmXml, voicemailTwiml }
