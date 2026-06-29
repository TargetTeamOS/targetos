// TwiML served when an outbound call connects
// Announces the call and records it
'use strict'

module.exports = function handler(req, res) {
  const name      = req.query?.name || 'your contact'
  const callLogId = req.query?.callLogId || ''
  const to        = req.query?.to || ''

  res.setHeader('Content-Type', 'text/xml')

  // The call goes directly to the contact — this TwiML plays a greeting
  // and records the entire call
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Say voice="Polly.Joanna">Outbound call from Target Team.</Say>' +
      '<Dial record="record-from-answer" recordingStatusCallback="/api/twilio-status" recordingStatusCallbackMethod="POST">' +
        (to ? '<Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">' + to + '</Number>' : '') +
      '</Dial>' +
    '</Response>'
  )
}
