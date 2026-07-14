// TargetOS V2 — Recording consent + context "whisper"
// Used as the url= attribute on <Number> inside outbound <Dial> verbs.
// Twilio plays this TwiML ONLY to that specific leg (the person being
// called) the moment they answer, before bridging them into the call.
// This is what actually reaches the called party for two-party-consent
// purposes — a <Say> placed before <Dial> only reaches whoever was
// already on the call, not the number being dialed.
//
// Extended (July 2026) to also tell the AGENT what the call is about
// before they pick up — e.g. "caller is interested in the listing at
// 5 Main St" or "caller was looking for you specifically in the
// directory" — so they're not going in blind.
'use strict'
const querystring = require('querystring')
const { esc, checkTwilioSignature } = require('./_lib/phone')

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (!checkTwilioSignature(req, res, {}, 'twilio-recording-notice')) return

  const rawUrl = req.url || ''
  const qp = querystring.parse(rawUrl.includes('?') ? rawUrl.split('?')[1] : '')

  let contextMsg = ''
  if (qp.context === 'listing' && qp.addr) {
    contextMsg = 'Incoming call. The caller is interested in the listing at ' + qp.addr + '. '
  } else if (qp.context === 'directory') {
    contextMsg = 'Incoming call. The caller was looking to reach you specifically from our directory. '
  } else if (qp.context === 'roundrobin' && qp.newContact === '1') {
    contextMsg = 'Incoming call from a new lead. This is a general inquiry, not directed at anyone specifically. '
  } else if (qp.context === 'roundrobin') {
    contextMsg = 'Incoming call. This is a general inquiry, not directed at anyone specifically. '
  }

  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      (contextMsg ? '<Say voice="Polly.Joanna">' + esc(contextMsg) + '</Say>' : '') +
      '<Say voice="Polly.Joanna">This call may be recorded for quality and training purposes.</Say>' +
    '</Response>'
  )
}
