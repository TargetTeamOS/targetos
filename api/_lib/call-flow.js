// TargetOS V2 — Shared Call Flow Walker
// Single source of truth for walking the visual call flow graph.
// Used by both twilio-inbound.js and twilio-menu.js — never drift out of sync.
'use strict'

const wrap  = xml => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say   = (t, voice) => '<Say voice="' + (voice || 'Polly.Joanna') + '">' + (t||'') + '</Say>'
const vmXml = (greeting, voice, maxLen) =>
  say(greeting || 'Please leave your message after the tone.', voice) +
  '<Record maxLength="' + (maxLen||120) + '" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'

const BASE = 'https://app.targetreteam.com'

// ── WALK FLOW ────────────────────────────────────────────────────
async function walkFlow(nodes, edges, nodeId, callData, supabase, depth) {
  if (depth > 20) return say('An error occurred. Please call back.')
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return say('Flow configuration error. Goodbye.')
  const cfg = node.config || {}
  let twiml = '', nextEdge = null

  // ── INCOMING ────────────────────────────────────────────────────
  if (node.type === 'incoming') {
    nextEdge = edges.find(e => e.from === nodeId)
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return say('No flow steps configured.')
  }

  // ── HANGUP ──────────────────────────────────────────────────────
  if (node.type === 'hangup') return '<Hangup />'

  // ── GREETING ────────────────────────────────────────────────────
  if (node.type === 'greeting') {
    twiml += say(cfg.text || 'Thank you for calling.', cfg.voice)
    nextEdge = edges.find(e => e.from === nodeId && e.port === 'out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  // ── HOLD ────────────────────────────────────────────────────────
  if (node.type === 'hold') {
    const HOLDURLS = {
      classical: 'https://demo.twilio.com/docs/classic.mp3',
      jazz:      'https://demo.twilio.com/docs/jazz.mp3',
      pop:       'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3',
      silence:   'https://demo.twilio.com/docs/silence.mp3',
    }
    if (cfg.say_first) twiml += say(cfg.say_first, cfg.voice || 'Polly.Joanna')
    const musicUrl = cfg.music === 'custom' ? (cfg.custom_url||'') : (HOLDURLS[cfg.music||'classical']||'')
    if (musicUrl) twiml += '<Play loop="' + Math.max(1, Math.ceil((cfg.duration||30)/30)) + '">' + musicUrl + '</Play>'
    else twiml += '<Pause length="' + (cfg.duration||30) + '" />'
    nextEdge = edges.find(e => e.from === nodeId && e.port === 'out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  // ── AUDIO ────────────────────────────────────────────────────────
  if (node.type === 'audio') {
    if (cfg.say_first) twiml += say(cfg.say_first, cfg.voice || 'Polly.Joanna')
    if (cfg.url) twiml += '<Play loop="' + (cfg.loop||1) + '">' + cfg.url + '</Play>'
    nextEdge = edges.find(e => e.from === nodeId && e.port === 'out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  // ── MENU ─────────────────────────────────────────────────────────
  if (node.type === 'menu') {
    // Deduplicate option keys — if two options share a key, keep the last one
    const seenKeys = new Set()
    const opts = []
    for (let i = (cfg.options||[]).length - 1; i >= 0; i--) {
      const o = cfg.options[i]
      if (!seenKeys.has(String(o.key))) { opts.unshift(o); seenKeys.add(String(o.key)) }
    }
    if (opts.length !== (cfg.options||[]).length) {
      console.warn('[call-flow] Menu "' + nodeId + '" had duplicate keys — deduplicated')
    }

    // ACTION URL: only pass the menuNodeId (short string).
    // twilio-menu.js reloads the full flow from phone_ivr on every keypress.
    // This avoids all URL-length issues — no context embedding needed at all.
    const actionUrl = BASE + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(nodeId)

    twiml += '<Gather numDigits="1" action="' + actionUrl + '" method="POST" timeout="' + (cfg.timeout||10) + '">'
    twiml += say(cfg.text || 'Please make a selection.', cfg.voice)
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.', cfg.voice)
    return twiml
  }

  // ── LANGUAGE ─────────────────────────────────────────────────────
  if (node.type === 'language') {
    const actionUrl = BASE + '/api/twilio-menu?menuNodeId=' + encodeURIComponent(nodeId)
    twiml += '<Gather numDigits="1" action="' + actionUrl + '" method="POST" timeout="' + (cfg.timeout||10) + '">'
    twiml += say(cfg.prompt || 'For English press 1.', cfg.voice)
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.', cfg.voice)
    return twiml
  }

  // ── CONDITION ────────────────────────────────────────────────────
  if (node.type === 'condition') {
    let result = false
    if (cfg.condition === 'known_contact')  result = !!callData.contact
    if (cfg.condition === 'has_agent')      result = !!(callData.contact && callData.contact.agent_id)
    if (cfg.condition === 'repeat_caller')  result = !!callData.isRepeat
    if (cfg.condition === 'business_hours') result = isBusinessHours()
    if (cfg.condition === 'after_hours')    result = !isBusinessHours()
    const port = result ? 'yes' : 'no'
    nextEdge = edges.find(e => e.from === nodeId && e.port === port)
    if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return say('Goodbye.')
  }

  // ── ASSIGNED AGENT ───────────────────────────────────────────────
  if (node.type === 'assigned') {
    let assignedAgent = null
    if (callData.contact && callData.contact.agent_id && supabase) {
      const ar = await supabase.from('agents').select('id,name,phone').eq('id', callData.contact.agent_id).maybeSingle()
      if (ar.data && ar.data.phone) assignedAgent = ar.data
    }
    if (assignedAgent) {
      const phone = normalizePhone(assignedAgent.phone)
      twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout||30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      twiml += '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + phone + '</Number>'
      twiml += '</Dial>'
    }
    const nfEdge = edges.find(e => e.from === nodeId && e.port === 'notfound')
    if (nfEdge) twiml += await walkFlow(nodes, edges, nfEdge.to, callData, supabase, depth+1)
    else twiml += vmXml(assignedAgent ? 'Your agent is unavailable. Please leave a message.' : 'No agent is assigned. Please leave a message.')
    return twiml
  }

  // ── DIAL ─────────────────────────────────────────────────────────
  if (node.type === 'dial') {
    let dialTarget = null
    if (cfg.dial_type === 'number' && cfg.direct_number) {
      dialTarget = '<Number>' + normalizePhone(cfg.direct_number) + '</Number>'
    } else if (cfg.dial_type === 'sip' && cfg.sip_address) {
      dialTarget = '<Sip>' + cfg.sip_address + '</Sip>'
    } else if (cfg.agent_id && supabase) {
      const agRes = await supabase.from('agents').select('phone').eq('id', cfg.agent_id).maybeSingle()
      if (agRes.data?.phone) dialTarget = '<Number>' + normalizePhone(agRes.data.phone) + '</Number>'
    }
    if (dialTarget) {
      twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout||30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      twiml += dialTarget
      twiml += '</Dial>'
    }
    const noAns = edges.find(e => e.from === nodeId && e.port === 'noanswer')
    if (noAns) twiml += await walkFlow(nodes, edges, noAns.to, callData, supabase, depth+1)
    else twiml += vmXml()
    return twiml
  }

  // ── ROUND ROBIN / RING ALL ───────────────────────────────────────
  if (node.type === 'roundrobin' || node.type === 'ringall') {
    const agentIds = cfg.agent_ids || []
    const phones = []
    if (agentIds.length > 0 && supabase) {
      for (const aid of agentIds) {
        const agRes = await supabase.from('agents').select('phone').eq('id', aid).maybeSingle()
        if (agRes.data?.phone) phones.push(normalizePhone(agRes.data.phone))
      }
    }
    if (phones.length > 0) {
      twiml += '<Dial callerId="' + callData.to + '" timeout="' + (cfg.timeout||30) + '" record="record-from-answer" recordingStatusCallback="/api/twilio-status">'
      phones.forEach(p => { twiml += '<Number>' + p + '</Number>' })
      twiml += '</Dial>'
      const noAns = edges.find(e => e.from === nodeId && e.port === 'noanswer')
      if (noAns) twiml += await walkFlow(nodes, edges, noAns.to, callData, supabase, depth+1)
      else twiml += vmXml()
    } else {
      twiml += vmXml('All agents are currently unavailable. Please leave a message.')
    }
    return twiml
  }

  // ── VOICEMAIL ────────────────────────────────────────────────────
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
    } else {
      twiml += vmXml(cfg.text, cfg.voice, cfg.max_length)
    }
    return twiml
  }

  // ── SAVE LEAD ────────────────────────────────────────────────────
  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Caller', last_name: '', phone: callData.from,
          source: cfg.source || 'Inbound Call', status: 'New',
          notes: 'Auto-created from inbound call.',
          created_at: new Date().toISOString(),
        })
      } catch(e) { console.warn('savelead:', e.message) }
    }
    nextEdge = edges.find(e => e.from === nodeId && e.port === 'out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  // ── SMS ──────────────────────────────────────────────────────────
  if (node.type === 'sms') {
    if (supabase && callData.from) {
      const SID = process.env.TWILIO_ACCOUNT_SID, TOK = process.env.TWILIO_AUTH_TOKEN, FROM = process.env.TWILIO_PHONE_NUMBER || callData.to
      if (SID && TOK) {
        const auth = Buffer.from(SID + ':' + TOK).toString('base64')
        await fetch('https://api.twilio.com/2010-04-01/Accounts/' + SID + '/Messages.json', {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: callData.from, From: FROM, Body: cfg.text || 'Thank you for calling!' }).toString(),
        }).catch(e => console.warn('sms:', e.message))
      }
    }
    nextEdge = edges.find(e => e.from === nodeId && e.port === 'out')
    if (nextEdge) twiml += await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
    return twiml
  }

  // ── LISTINGS ─────────────────────────────────────────────────────
  if (node.type === 'listings') {
    const listUrl = BASE + '/api/twilio-listings?step=intro' +
      '&voice=' + encodeURIComponent(cfg.voice || 'Polly.Joanna') +
      '&max=' + (cfg.max_results||5) +
      '&intro=' + encodeURIComponent(cfg.intro || 'Welcome to our exclusive listings search.')
    twiml += '<Redirect method="GET">' + listUrl + '</Redirect>'
    return twiml
  }

  // ── MLS SEARCH ───────────────────────────────────────────────────
  if (node.type === 'mlssearch') {
    const mlsUrl = BASE + '/api/twilio-mls-search?step=intro' +
      '&voice=' + encodeURIComponent(cfg.voice || 'Polly.Joanna') +
      '&max=' + (cfg.max_results||5) +
      '&area=' + encodeURIComponent(cfg.area || '') +
      '&intro=' + encodeURIComponent(cfg.intro || 'Welcome to our live MLS search.')
    twiml += '<Redirect method="GET">' + mlsUrl + '</Redirect>'
    return twiml
  }

  // ── AGENT DIRECTORY ──────────────────────────────────────────────
  if (node.type === 'directory') {
    const dirUrl = BASE + '/api/twilio-directory?step=announce' +
      '&voice=' + encodeURIComponent(cfg.voice || 'Polly.Joanna') +
      '&to=' + encodeURIComponent(callData.to || '')
    twiml += '<Redirect method="GET">' + dirUrl + '</Redirect>'
    return twiml
  }

  // ── UNKNOWN NODE ─────────────────────────────────────────────────
  console.warn('[call-flow] Unrecognized node type "' + node.type + '" at depth ' + depth)
  nextEdge = edges.find(e => e.from === nodeId)
  if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
  return say('Goodbye.')
}

// ── HELPERS ──────────────────────────────────────────────────────
function normalizePhone(p) {
  const d = (p||'').replace(/[^0-9]/g, '')
  return d.startsWith('1') && d.length === 11 ? '+' + d : d.length === 10 ? '+1' + d : p
}

function isBusinessHours() {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'numeric', hour12:false })
  const h = parseInt(fmt.format(new Date()), 10)
  return h >= 9 && h < 18
}

function xmlEscape(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// Store flow context in DB so Gather action URL stays short
async function storeMenuContext(supabase, ctx) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('call_flow_contexts')
      .insert({ context: ctx, created_at: new Date().toISOString() })
      .select('id').single()
    if (error || !data) return null
    return data.id
  } catch(e) { return null }
}

async function loadMenuContext(supabase, ctxId) {
  if (!supabase || !ctxId) return null
  try {
    const { data } = await supabase.from('call_flow_contexts').select('context').eq('id', ctxId).maybeSingle()
    return data ? data.context : null
  } catch(e) { return null }
}

module.exports = { walkFlow, wrap, say, vmXml, isBusinessHours, storeMenuContext, loadMenuContext }
