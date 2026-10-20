// TargetOS V2 — Voicemail PIN Access
// Called when a caller (agent checking voicemail) enters digits.
// Validates the PIN and either plays recorded messages or rejects.
'use strict'

const querystring = require('querystring')

function getRawBody(req) {
  return new Promise(function(resolve, reject) {
    var data = ''
    req.on('data', function(chunk) { data += chunk })
    req.on('end', function() { resolve(data) })
    req.on('error', reject)
  })
}

const { getSupabase, checkTwilioSignature, say, wrap, loadFlow, play, isTwilioRecordingUrl } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  var ctxRaw = (req.query || {}).ctx || ''
  var ctx = {}
  try { ctx = JSON.parse(decodeURIComponent(ctxRaw)) } catch(e) {
    return res.status(200).send(wrap(say('Invalid request. Goodbye.')))
  }

  var raw = await getRawBody(req)
  var body = querystring.parse(raw)
  if (!checkTwilioSignature(req, res, body, 'twilio-voicemail-access')) return
  var digits = body.Digits || ''
  var from   = body.From || ''
  var voice  = ctx.voice || 'Polly.Joanna'
  var supabase = getSupabase()

  // SECURITY (July 2026): re-fetch the real PIN fresh from the database
  // on every attempt, rather than trusting a pin value round-tripped
  // through the URL (which would have been visible in request logs on
  // every retry). Only a node reference (non-secret) travels in ctx.
  var realPin = null
  try {
    var flow = await loadFlow(supabase)
    var vmNode = (flow.nodes || []).find(function(n) { return n.id === ctx.nodeId })
    realPin = vmNode && vmNode.config ? String(vmNode.config.pin || '') : null
  } catch(e) { console.warn('voicemail PIN lookup:', e.message) }

  if (!realPin) {
    return res.status(200).send(wrap(say('This voicemail box is no longer available. Goodbye.', voice)))
  }

  // Check PIN
  if (digits !== realPin) {
    var attempt = (ctx.attempt || 0) + 1
    var maxAttempts = ctx.attempts || 3

    if (attempt >= maxAttempts) {
      return res.status(200).send(wrap(
        say('Incorrect PIN. Maximum attempts reached. Goodbye.', voice)
      ))
    }

    // Try again
    var newCtx = encodeURIComponent(JSON.stringify(Object.assign({}, ctx, { attempt: attempt })))
    var twiml = '<Gather numDigits="' + (ctx.pinLen || realPin.length) + '" action="/api/twilio-voicemail-access?ctx=' + newCtx + '" method="POST" timeout="15">'
    twiml += say('Incorrect PIN. Please try again.', voice)
    twiml += '</Gather>'
    twiml += say('No input received. Goodbye.', voice)
    return res.status(200).send(wrap(twiml))
  }

  // PIN correct — play voicemails or record a new one
  // Check if this is an agent calling in to retrieve messages
  var hasMessages = false
  var messages = []

  if (supabase && from) {
    try {
      // Look up agent by phone number -- searches every format variant
      // (raw digits alone can never match a punctuated stored value)
      var { phoneVariants } = require('./_lib/phone')
      var variants = phoneVariants(from)
      // FIX (Oct 2026 design review): same unquoted-.or() bug as
      // lookupContact() in _lib/phone.js -- the "(845) 424-1014"-style
      // variant's parentheses corrupt the whole OR clause's grouping
      // grammar unless each value is quoted, silently matching 0 rows
      // instead of erroring. See _lib/phone.js lookupContact for the
      // live-confirmed root cause.
      var agentRes = variants.length
        ? await supabase.from('agents').select('id, name').or(variants.map(function(v){ return 'phone.ilike."%' + v + '%"' }).join(',')).maybeSingle()
        : { data: null }
      var agentId = agentRes.data ? agentRes.data.id : null

      if (agentId) {
        // Get unread voicemails for this agent
        var vmRes = await supabase.from('voicemails').select('*')
          .eq('agent_id', agentId).eq('is_read', false)
          .order('created_at', { ascending: false }).limit(10)
        messages = vmRes.data || []
        hasMessages = messages.length > 0

        if (hasMessages) {
          // Mark as read
          await supabase.from('voicemails').update({ is_read: true }).eq('agent_id', agentId).eq('is_read', false)
        }
      }
    } catch(e) { console.warn('voicemail lookup:', e.message) }
  }

  // FIX (ESLint no-redeclare, Sept 2026 audit follow-up): `twiml` is
  // already `var`-declared (function-scoped) in the incorrect-PIN branch
  // above, which always `return`s before reaching here -- harmless in
  // practice, but redeclaring the same var twice in one function is
  // needless confusion, so this just assigns to it instead.
  twiml = say('PIN accepted. Welcome.', voice)

  if (hasMessages) {
    twiml += say('You have ' + messages.length + ' new voicemail' + (messages.length > 1 ? 's' : '') + '.', voice)
    messages.forEach(function(vm, i) {
      if (vm.recording_url) {
        twiml += say('Message ' + (i + 1) + '.', voice)
        if (vm.contact_name) twiml += say('From ' + vm.contact_name + '.', voice)
        // SECURITY (Oct 2026 hardening): recording_url is a DB value
        // ultimately sourced from the inbound Twilio RecordingUrl
        // webhook field (see twilio-voicemail.js finding C1) -- every
        // other value spliced into TwiML in this file goes through
        // say()/esc(), but this one was inserted raw into a <Play> tag,
        // which is TwiML injection: a crafted recording_url containing
        // "</Play><...>" could splice in arbitrary TwiML (e.g. <Dial>,
        // <Redirect>) and hijack the call. Now it goes through the
        // same esc()-backed play() helper used elsewhere in this
        // codebase, and, like the other Twilio-recording fetch here,
        // is confirmed to actually be a Twilio recording URL before
        // it's trusted enough to play.
        if (isTwilioRecordingUrl(vm.recording_url)) {
          twiml += play(vm.recording_url)
        } else {
          console.warn('[twilio-voicemail-access] refusing to play non-Twilio recording_url:', vm.recording_url)
          twiml += say('Message unavailable.', voice)
        }
      } else if (vm.transcript) {
        twiml += say('Message ' + (i + 1) + ': ' + vm.transcript, voice)
      }
    })
    twiml += say('End of messages. Goodbye.', voice)
  } else {
    // No messages found — drop into record mode (new voicemail)
    twiml += say(ctx.greeting || 'Please leave your message after the tone.', voice)
    twiml += '<Record maxLength="' + (ctx.max_length || 120) + '" transcribe="' + (ctx.transcribe !== false ? 'true' : 'false') + '" transcribeCallback="/api/twilio-voicemail" />'
  }

  return res.status(200).send(wrap(twiml))
}
