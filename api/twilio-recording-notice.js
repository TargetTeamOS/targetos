// TargetOS V2 — Recording consent "whisper"
// Used as the url= attribute on <Number> inside outbound <Dial> verbs.
// Twilio plays this TwiML ONLY to that specific leg (the person being
// called) the moment they answer, before bridging them into the call.
// This is what actually reaches the called party for two-party-consent
// purposes — a <Say> placed before <Dial> only reaches whoever was
// already on the call, not the number being dialed.
'use strict'

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Say voice="Polly.Joanna">This call may be recorded for quality and training purposes.</Say>' +
    '</Response>'
  )
}
