// TargetOS V2 — Shared Call Flow Walker
// Single source of truth for walking the visual call flow graph.
// Used by both twilio-inbound.js (start of call) and twilio-menu.js
// (continuing after a keypad press) so the two never drift out of sync.
'use strict'

const wrap   = xml => '<?xml version="1.0" encoding="UTF-8"?><Response>' + xml + '</Response>'
const say    = (t, voice) => '<Say voice="' + (voice || 'Polly.Joanna') + '">' + (t||'') + '</Say>'
const vmXml  = (greeting, voice, maxLen) =>
  say(greeting || 'Please leave your message after the tone.', voice) +
  '<Record maxLength="' + (maxLen||120) + '" transcribe="true" transcribeCallback="/api/twilio-voicemail" />'

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
    // Deduplicate options by key — if two options share the same key number,
    // keep the last one (most recently added wins). This prevents the "presses 2,
    // gets option 3" bug caused by UI key-assignment after deletions.
    const dedupedOptions = []
    const seenKeys = new Set()
    for (let i = (cfg.options||[]).length - 1; i >= 0; i--) {
      const o = cfg.options[i]
      if (!seenKeys.has(String(o.key))) { dedupedOptions.unshift(o); seenKeys.add(String(o.key)) }
    }
    if (dedupedOptions.length !== (cfg.options||[]).length) {
      console.warn('[call-flow] Menu node "'+nodeId+'" had duplicate option keys — deduplicated. Fix in Call Flow editor.')
    }
    const dedupedNode = { ...node, config: { ...cfg, options: dedupedOptions } }
    // Use deduped node from here on
    const dedupedCfg = dedupedNode.config
    const ctxId = await storeMenuContext(supabase, { nodes: nodes.map(n=>n.id===nodeId?dedupedNode:n), edges, menuNodeId: nodeId })
    // Use DB-backed short ID if available (preferred — short URL, no length limits)
    // Fall back to embedding ctx in the action URL only if DB storage failed AND the
    // encoded context is under Twilio's 2048 char URL limit; otherwise POST it as a
    // hidden form field in a <Redirect> POST — POST body has no length limit.
    const ctxJson = JSON.stringify({ nodes: nodes.map(n=>n.id===nodeId?dedupedNode:n), edges, menuNodeId: nodeId })
    const ctxEnc  = encodeURIComponent(ctxJson)
    let actionUrl, extraFields = ''
    if (ctxId) {
      actionUrl = 'https://app.targetreteam.com/api/twilio-menu?ctxId=' + ctxId
    } else if (ctxEnc.length <= 1800) {
      actionUrl = 'https://app.targetreteam.com/api/twilio-menu?ctx=' + ctxEnc
    } else {
      // Large flow: store ctx as a hidden field in the POST body using Gather's parameter
      // Twilio passes all <Parameter> elements as POST body fields to the action URL
      actionUrl = 'https://app.targetreteam.com/api/twilio-menu'
      extraFields = '<Parameter name="ctx" value="' + ctxJson.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" />'
    }
    twiml += '<Gather numDigits="1" action="' + actionUrl + '" method="POST" timeout="' + (dedupedCfg.timeout||10) + '">'
    if (extraFields) twiml += extraFields
    twiml += say(dedupedCfg.text || 'Please make a selection.', dedupedCfg.voice)
    twiml += '</Gather>'
    twiml += say('We did not receive your selection. Goodbye.', dedupedCfg.voice)
    return twiml
  }

  if (node.type === 'language') {
    const ctxId = await storeMenuContext(supabase, { nodes, edges, menuNodeId: nodeId })
    const ctxJson = JSON.stringify({ nodes: nodes.map(n=>n.id===nodeId?dedupedNode:n), edges, menuNodeId: nodeId })
    const ctxEnc  = encodeURIComponent(ctxJson)
    let actionUrl, extraFields = ''
    if (ctxId) {
      actionUrl = 'https://app.targetreteam.com/api/twilio-menu?ctxId=' + ctxId
    } else if (ctxEnc.length <= 1800) {
      actionUrl = 'https://app.targetreteam.com/api/twilio-menu?ctx=' + ctxEnc
    } else {
      actionUrl = 'https://app.targetreteam.com/api/twilio-menu'
      extraFields = '<Parameter name="ctx" value="' + ctxJson.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" />'
    }
    twiml += '<Gather numDigits="1" action="' + actionUrl + '" method="POST" timeout="' + (cfg.timeout||10) + '">'
    if (extraFields) twiml += extraFields
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
      const h = nowEasternHour()
      result = h >= 9 && h < 18
    }
    if (cfg.condition === 'after_hours') {
      const h = nowEasternHour()
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
      // Once the Dial connects, the call is live and no further TwiML runs.
      // The code below only executes if the agent's phone was busy/no-answer/failed.
      const nfEdge = edges.find(e => e.from===nodeId && e.port==='notfound')
      if (nfEdge) twiml += await walkFlow(nodes, edges, nfEdge.to, callData, supabase, depth+1)
      else twiml += vmXml('Your agent is unavailable. Please leave a message.')
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
      let n = cfg.direct_number.replace(/[^+0-9]/g,'')
      if (!n.startsWith('+')) n = '+1' + n
      dialTarget = '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + n + '</Number>'
    } else if (cfg.dial_type === 'sip' && cfg.sip_address) {
      const sip = cfg.sip_address.includes('@') ? cfg.sip_address : cfg.sip_address
      dialTarget = '<Sip statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + sip + '</Sip>'
    } else if (cfg.agent_id && supabase) {
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
    const voice    = cfg.voice || 'Polly.Joanna'
    const maxRes   = cfg.max_results || 5
    const introEnc = encodeURIComponent(cfg.intro || 'Welcome to our available listings search.')
    const listUrl  = 'https://app.targetreteam.com/api/twilio-listings?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&intro=' + introEnc
    twiml += '<Redirect method="GET">' + listUrl + '</Redirect>'
    return twiml
  }

  if (node.type === 'directory') {
    const voice    = cfg.voice || 'Polly.Joanna'
    const dirUrl   = 'https://app.targetreteam.com/api/twilio-directory?step=announce&voice=' + encodeURIComponent(voice) + '&to=' + encodeURIComponent(callData.to || '')
    twiml += '<Redirect method="GET">' + dirUrl + '</Redirect>'
    return twiml
  }

  if (node.type === 'mlssearch') {
    const voice    = cfg.voice || 'Polly.Joanna'
    const maxRes   = cfg.max_results || 5
    const area     = encodeURIComponent(cfg.area || '')
    const introEnc = encodeURIComponent(cfg.intro || 'Welcome to our live MLS search.')
    const mlsUrl   = 'https://app.targetreteam.com/api/twilio-mls-search?step=intro&voice=' + encodeURIComponent(voice) + '&max=' + maxRes + '&area=' + area + '&intro=' + introEnc
    twiml += '<Redirect method="GET">' + mlsUrl + '</Redirect>'
    return twiml
  }

  if (node.type === 'savelead') {
    if (supabase && callData.from && !callData.contact) {
      try {
        await supabase.from('contacts').insert({
          first_name: 'Caller', last_name: '', phone: callData.from,
          source: cfg.source || 'Inbound Call', status: 'New',
          notes: 'Auto-created from inbound call ' + (callData.callSid||''),
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

  // Unknown node type — log it loudly instead of silently hanging up,
  // then try to continue via the first available edge as a last resort.
  console.warn('walkFlow: unrecognized node type "' + node.type + '" — check NODE_DEFS/walkFlow are in sync')
  nextEdge = edges.find(e => e.from===nodeId)
  if (nextEdge) return await walkFlow(nodes, edges, nextEdge.to, callData, supabase, depth+1)
  return say('Goodbye.')
}

// Eastern time hour, accounting for DST automatically (unlike a hardcoded UTC offset)
function nowEasternHour() {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
  return parseInt(fmt.format(new Date()), 10)
}

// Stores the flow graph + which menu node we're waiting on in a short-lived
// DB row, so the Gather action URL just needs a short ID instead of the
// entire flow JSON — avoids hitting URL length limits on larger flows.
// Returns null (caller falls back to URL-embedding) if the table doesn't exist
// or the insert fails for any reason — never blocks the call.
async function storeMenuContext(supabase, ctx) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('call_flow_contexts')
      .insert({ context: ctx, created_at: new Date().toISOString() })
      .select('id')
      .single()
    if (error || !data) return null
    return data.id
  } catch(e) {
    return null
  }
}

async function loadMenuContext(supabase, ctxId) {
  if (!supabase || !ctxId) return null
  try {
    const { data } = await supabase.from('call_flow_contexts').select('context').eq('id', ctxId).maybeSingle()
    return data ? data.context : null
  } catch(e) {
    return null
  }
}

module.exports = { walkFlow, wrap, say, vmXml, nowEasternHour, storeMenuContext, loadMenuContext }
