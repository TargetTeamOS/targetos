// TargetOS V2 — Call Flow Walker
// Walks the visual IVR flow graph node by node, generating TwiML.
// Every node type handles its own error — never returns empty string.
'use strict'

const {
  wrap, say, pause, play, voicemailTwiml, hangup, redirect, esc,
  normalizePhone, isBusinessHours, HOLD_MUSIC, BASE_URL, DEFAULT_VOICE,
} = require('./phone')

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
    if (callData.contact?.agent_id && supabase) {
      try {
        const { data: ag } = await supabase.from('agents')
          .select('phone').eq('id', callData.contact.agent_id).maybeSingle()
        if (ag?.phone) phone = normalizePhone(ag.phone)
      } catch(e) { console.warn('[walkFlow] assigned lookup:', e.message) }
    }

    let twiml = ''
    if (phone) {
      twiml += buildDial(to, phone, cfg.timeout || 30)
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

    let twiml = target ? buildDial(to, null, cfg.timeout || 30, target) : ''
    const rest = await follow('noanswer')
    if (rest) return twiml + rest
    return twiml + voicemailTwiml('That person is unavailable. Please leave a message.', voice)
  }

  // ── RING ALL / ROUND ROBIN ────────────────────────────────────
  if (node.type === 'ringall' || node.type === 'roundrobin') {
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
    let twiml = buildDial(to, null, cfg.timeout || 30, numbers)
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
      const ctx  = encodeURIComponent(JSON.stringify({
        greeting: cfg.text, voice, pin: cfg.pin,
        max_length: cfg.max_length || 120,
        transcribe: cfg.transcribe !== false,
        attempts: cfg.pin_attempts || 3, attempt: 0,
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
      supabase.from('contacts').insert({
        first_name: 'Unknown', last_name: 'Caller',
        phone: callData.from, source: cfg.source || 'Inbound Call',
        status: 'New', created_at: new Date().toISOString(),
        notes: 'Auto-created from inbound call.',
        updated_at: new Date().toISOString(),
      }).catch(e => console.warn('[walkFlow] savelead:', e.message))
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
function buildDial(callerId, singlePhone, timeout, innerTwiml) {
  const inner = innerTwiml || ('<Number>' + esc(singlePhone) + '</Number>')
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
module.exports = { walkFlow, wrap, say, vmXml, voicemailTwiml }
