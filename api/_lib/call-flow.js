// TargetOS V2 — Call Flow Walker
// Walks the visual flow graph node by node, producing TwiML.
// Used by twilio-inbound.js (start of call) and twilio-menu.js (after keypress).
'use strict'

const {
  wrap, say, pause, play, record, voicemailTwiml, redirect, hangup,
  sanitize, normalizePhone, isBusinessHours, HOLD_MUSIC,
} = require('./phone')

const BASE = 'https://app.targetreteam.com'

async function walkFlow(nodes, edges, nodeId, callData, supabase, depth) {
  if (depth > 25) {
    console.error('[walkFlow] Depth limit reached at node', nodeId)
    return say('An error occurred in the call flow. Goodbye.')
  }

  const node = nodes.find(n => n.id === nodeId)
  if (!node) {
    console.error('[walkFlow] Node not found:', nodeId)
    return say('Flow configuration error. Goodbye.')
  }

  const cfg = node.config || {}
  const voice = cfg.voice || 'Polly.Joanna'

  function next(port) {
    const edge = edges.find(e => e.from === nodeId && e.port === (port || 'out'))
    if (!edge) return null
    return walkFlow(nodes, edges, edge.to, callData, supabase, depth + 1)
  }

  // ── INCOMING ──────────────────────────────────────────────────
  if (node.type === 'incoming') {
    const edge = edges.find(e => e.from === nodeId)
    if (edge) return walkFlow(nodes, edges, edge.to, callData, supabase, depth + 1)
    return say('No flow steps connected. Please contact the office directly.')
  }

  // ── HANGUP ────────────────────────────────────────────────────
  if (node.type === 'hangup') {
    return say('Thank you for calling Target Team. Goodbye.', voice) + hangup()
  }

  // ── GREETING ──────────────────────────────────────────────────
  if (node.type === 'greeting') {
    let twiml = say(cfg.text || 'Thank you for calling.', voice)
    const rest = await next('out')
    if (rest) twiml += rest
    return twiml
  }

  // ── HOLD MUSIC ────────────────────────────────────────────────
  if (node.type === 'hold') {
    let twiml = ''
    if (cfg.say_first) twiml += say(cfg.say_first, voice)
    const musicUrl = cfg.music === 'custom'
      ? (cfg.custom_url || '')
      : (HOLD_MUSIC[cfg.music || 'classical'] || '')
    const loops = Math.max(1, Math.ceil((cfg.duration || 30) / 30))
    twiml += musicUrl ? play(musicUrl, loops) : pause(cfg.duration || 30)
    const rest = await next('out')
    if (rest) twiml += rest
    return twiml
  }

  // ── AUDIO FILE ────────────────────────────────────────────────
  if (node.type === 'audio') {
    let twiml = ''
    if (cfg.say_first) twiml += say(cfg.say_first, voice)
    if (cfg.url) twiml += play(cfg.url, cfg.loop || 1)
    const rest = await next('out')
    if (rest) twiml += rest
    return twiml
  }

  // ── MENU ──────────────────────────────────────────────────────
  if (node.type === 'menu') {
    // Deduplicate option keys — last definition wins
    const seen = new Set()
    const opts = []
    for (let i = (cfg.options || []).length - 1; i >= 0; i--) {
      const o = cfg.options[i]
      const k = String(o.key)
      if (!seen.has(k)) { opts.unshift(o); seen.add(k) }
    }
    if (opts.length !== (cfg.options || []).length) {
      console.warn('[walkFlow] Duplicate menu keys in node', nodeId, '— deduplicated')
    }

    // Pass only the node ID — menu handler reloads the flow from DB
    const actionUrl = BASE + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(nodeId)

    return (
      '<Gather numDigits="1" action="' + actionUrl + '" method="POST" timeout="' + (cfg.timeout || 10) + '">' +
        say(cfg.text || 'Please make a selection.', voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice) +
      hangup()
    )
  }

  // ── LANGUAGE SELECT ───────────────────────────────────────────
  if (node.type === 'language') {
    const actionUrl = BASE + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(nodeId)
    return (
      '<Gather numDigits="1" action="' + actionUrl + '" method="POST" timeout="' + (cfg.timeout || 10) + '">' +
        say(cfg.prompt || 'For English press 1.', voice) +
      '</Gather>' +
      say('We did not receive your input. Goodbye.', voice) +
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
      case 'business_hours': result = isBusinessHours(); break
      case 'after_hours':    result = !isBusinessHours(); break
      default:
        console.warn('[walkFlow] Unknown condition:', cfg.condition)
    }
    const branch = result ? 'yes' : 'no'
    const rest = await next(branch)
    if (rest) return rest
    return say('Goodbye.', voice) + hangup()
  }

  // ── ASSIGNED AGENT ────────────────────────────────────────────
  if (node.type === 'assigned') {
    let twiml = ''
    let agentAvailable = false

    if (callData.contact?.agent_id && supabase) {
      try {
        const { data: ag } = await supabase
          .from('agents').select('id, name, phone')
          .eq('id', callData.contact.agent_id).maybeSingle()

        if (ag?.phone) {
          const phone = normalizePhone(ag.phone)
          agentAvailable = true
          twiml += '<Dial callerId="' + sanitize(callData.to) + '"' +
            ' timeout="' + (cfg.timeout || 30) + '"' +
            ' record="record-from-answer"' +
            ' recordingStatusCallback="/api/twilio-status">' +
            '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' +
            phone + '</Number></Dial>'
        }
      } catch(e) { console.warn('[walkFlow] assigned agent lookup:', e.message) }
    }

    // After Dial (agent didn't answer) or no agent found → notfound port
    const nfRest = await next('notfound')
    if (nfRest) twiml += nfRest
    else twiml += voicemailTwiml(
      agentAvailable
        ? 'Your agent is currently unavailable. Please leave a message.'
        : 'You do not have an assigned agent. Please leave a message after the tone.',
      voice
    )
    return twiml
  }

  // ── DIRECT DIAL ───────────────────────────────────────────────
  if (node.type === 'dial') {
    let twiml = ''
    let dialTarget = ''

    if (cfg.dial_type === 'number' && cfg.direct_number) {
      dialTarget = '<Number>' + normalizePhone(cfg.direct_number) + '</Number>'
    } else if (cfg.dial_type === 'sip' && cfg.sip_address) {
      dialTarget = '<Sip>' + sanitize(cfg.sip_address) + '</Sip>'
    } else if (cfg.agent_id && supabase) {
      try {
        const { data: ag } = await supabase
          .from('agents').select('phone').eq('id', cfg.agent_id).maybeSingle()
        if (ag?.phone) dialTarget = '<Number>' + normalizePhone(ag.phone) + '</Number>'
      } catch(e) { console.warn('[walkFlow] dial agent lookup:', e.message) }
    }

    if (dialTarget) {
      twiml += '<Dial callerId="' + sanitize(callData.to) + '"' +
        ' timeout="' + (cfg.timeout || 30) + '"' +
        ' record="record-from-answer"' +
        ' recordingStatusCallback="/api/twilio-status">' +
        dialTarget + '</Dial>'
    }

    const noAnsRest = await next('noanswer')
    if (noAnsRest) twiml += noAnsRest
    else twiml += voicemailTwiml('That person is unavailable. Please leave a message after the tone.', voice)
    return twiml
  }

  // ── RING ALL / ROUND ROBIN ────────────────────────────────────
  if (node.type === 'ringall' || node.type === 'roundrobin') {
    const agentIds = cfg.agent_ids || []
    const phones = []

    if (agentIds.length > 0 && supabase) {
      try {
        // Single query for all agents
        const { data: agList } = await supabase
          .from('agents').select('id, phone').in('id', agentIds)
        ;(agList || []).forEach(ag => {
          if (ag.phone) phones.push(normalizePhone(ag.phone))
        })
      } catch(e) { console.warn('[walkFlow] ringall agent lookup:', e.message) }
    }

    if (phones.length === 0) {
      console.warn('[walkFlow] ringall/roundrobin: no agent phones found for ids:', agentIds)
      const noAnsRest = await next('noanswer')
      if (noAnsRest) return noAnsRest
      return voicemailTwiml(
        'All agents are currently unavailable. Please leave your name and number after the tone and we will call you back.',
        voice
      )
    }

    let twiml = '<Dial callerId="' + sanitize(callData.to) + '"' +
      ' timeout="' + (cfg.timeout || 30) + '"' +
      ' record="record-from-answer"' +
      ' recordingStatusCallback="/api/twilio-status">'
    phones.forEach(p => { twiml += '<Number>' + p + '</Number>' })
    twiml += '</Dial>'

    const noAnsRest = await next('noanswer')
    if (noAnsRest) twiml += noAnsRest
    else twiml += voicemailTwiml(
      'All agents are currently unavailable. Please leave your name and number after the tone.',
      voice
    )
    return twiml
  }

  // ── VOICEMAIL ─────────────────────────────────────────────────
  if (node.type === 'voicemail') {
    if (cfg.pin_enabled && cfg.pin) {
      const pinCtx = encodeURIComponent(JSON.stringify({
        greeting:   cfg.text,
        voice:      cfg.voice,
        pin:        cfg.pin,
        max_length: cfg.max_length || 120,
        transcribe: cfg.transcribe !== false,
        attempts:   cfg.pin_attempts || 3,
        attempt:    0,
      }))
      const pinLen = String(cfg.pin).length
      return (
        '<Gather numDigits="' + pinLen + '"' +
        ' action="/api/twilio-voicemail-access?ctx=' + pinCtx + '"' +
        ' method="POST" timeout="15">' +
          say('Please enter your ' + pinLen + '-digit voicemail PIN.', voice) +
        '</Gather>' +
        say('No PIN entered. Goodbye.', voice) + hangup()
      )
    }
    return voicemailTwiml(cfg.text, voice, cfg.max_length || 120)
  }

  // ── SAVE LEAD ─────────────────────────────────────────────────
  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Unknown',
          last_name:  'Caller',
          phone:      callData.from,
          source:     cfg.source || 'Inbound Call',
          status:     'New',
          notes:      'Auto-created from inbound call.',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } catch(e) { console.warn('[walkFlow] savelead:', e.message) }
    }
    const rest = await next('out')
    if (rest) return rest
    return ''
  }

  // ── SEND SMS ──────────────────────────────────────────────────
  if (node.type === 'sms') {
    const SID  = process.env.TWILIO_ACCOUNT_SID
    const TOK  = process.env.TWILIO_AUTH_TOKEN
    const FROM = process.env.TWILIO_PHONE_NUMBER || callData.to
    if (SID && TOK && callData.from) {
      const auth = Buffer.from(SID + ':' + TOK).toString('base64')
      fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
        method:  'POST',
        headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({ To: callData.from, From: FROM, Body: cfg.text || 'Thank you for calling!' }).toString(),
      }).catch(e => console.warn('[walkFlow] sms send:', e.message))
    }
    const rest = await next('out')
    if (rest) return rest
    return ''
  }

  // ── CRM LISTINGS SEARCH ───────────────────────────────────────
  if (node.type === 'listings') {
    const url = BASE + '/api/twilio-listings?step=intro' +
      '&voice='  + encodeURIComponent(voice) +
      '&max='    + (cfg.max_results || 5) +
      '&intro='  + encodeURIComponent(cfg.intro || 'Welcome to our exclusive listings search.')
    return redirect(url, 'GET')
  }

  // ── LIVE MLS SEARCH ───────────────────────────────────────────
  if (node.type === 'mlssearch') {
    const url = BASE + '/api/twilio-mls-search?step=intro' +
      '&voice='  + encodeURIComponent(voice) +
      '&max='    + (cfg.max_results || 5) +
      '&area='   + encodeURIComponent(cfg.area || '') +
      '&intro='  + encodeURIComponent(cfg.intro || 'Welcome to our live MLS search.')
    return redirect(url, 'GET')
  }

  // ── AGENT DIRECTORY ───────────────────────────────────────────
  if (node.type === 'directory') {
    const url = BASE + '/api/twilio-directory?step=announce' +
      '&voice=' + encodeURIComponent(voice) +
      '&to='    + encodeURIComponent(callData.to || '')
    return redirect(url, 'GET')
  }

  // ── UNKNOWN ───────────────────────────────────────────────────
  console.warn('[walkFlow] Unknown node type "' + node.type + '" id=' + nodeId)
  const fallback = edges.find(e => e.from === nodeId)
  if (fallback) return walkFlow(nodes, edges, fallback.to, callData, supabase, depth + 1)
  return say('Goodbye.', voice) + hangup()
}

// Keep exporting wrap/say/vmXml for backward compat with any older imports
const vmXml = voicemailTwiml
module.exports = { walkFlow, wrap, say, vmXml, voicemailTwiml }
