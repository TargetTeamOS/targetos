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

const { getSupabase, logTwilioValidation, say, wrap } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')

  var ctxRaw = (req.query || {}).ctx || ''
  var ctx = {}
  try { ctx = JSON.parse(decodeURIComponent(ctxRaw)) } catch(e) {
    return res.status(200).send(wrap(say('Invalid request. Goodbye.')))
  }

  var raw = await getRawBody(req)
  var body = querystring.parse(raw)
  logTwilioValidation(req, body, 'twilio-voicemail-access')
  var digits = body.Digits || ''
  var from   = body.From || ''
  var voice  = ctx.voice || 'Polly.Joanna'

  // Check PIN
  if (digits !== String(ctx.pin)) {
    var attempt = (ctx.attempt || 0) + 1
    var maxAttempts = ctx.attempts || 3

    if (attempt >= maxAttempts) {
      return res.status(200).send(wrap(
        say('Incorrect PIN. Maximum attempts reached. Goodbye.', voice)
      ))
    }

    // Try again
    var newCtx = encodeURIComponent(JSON.stringify(Object.assign({}, ctx, { attempt: attempt })))
    var twiml = '<Gather numDigits="' + String(ctx.pin).length + '" action="/api/twilio-voicemail-access?ctx=' + newCtx + '" method="POST" timeout="15">'
    twiml += say('Incorrect PIN. Please try again.', voice)
    twiml += '</Gather>'
    twiml += say('No input received. Goodbye.', voice)
    return res.status(200).send(wrap(twiml))
  }

  // PIN correct — play voicemails or record a new one
  // Check if this is an agent calling in to retrieve messages
  var supabase = getSupabase()
  var hasMessages = false
  var messages = []

  if (supabase && from) {
    try {
      // Look up agent by phone number
      var fromNorm = from.replace(/[^+0-9]/g, '')
      var agentRes = await supabase.from('agents').select('id, name').ilike('phone', '%' + fromNorm.slice(-10) + '%').maybeSingle()
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

  var twiml = say('PIN accepted. Welcome.', voice)

  if (hasMessages) {
    twiml += say('You have ' + messages.length + ' new voicemail' + (messages.length > 1 ? 's' : '') + '.', voice)
    messages.forEach(function(vm, i) {
      if (vm.recording_url) {
        twiml += say('Message ' + (i + 1) + '.', voice)
        if (vm.contact_name) twiml += say('From ' + vm.contact_name + '.', voice)
        twiml += '<Play>' + vm.recording_url + '</Play>'
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
