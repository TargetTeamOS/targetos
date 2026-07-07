// TwiML served when an outbound call connects
// Announces the call and records it
'use strict'

module.exports = function handler(req, res) {
  try { require('./_lib/phone').logTwilioValidation(req, {}, 'twilio-outbound-twiml') } catch(e) {}
  const name      = req.query?.name || 'your contact'
  const callLogId = req.query?.callLogId || ''
  const to        = (req.query?.to || '').replace(/[^+0-9]/g, '')
  const base      = 'https://app.targetreteam.com'

  res.setHeader('Content-Type', 'text/xml')

  // The call goes directly to the contact — this TwiML plays a greeting
  // and records the entire call
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Say voice="Polly.Joanna">Outbound call from Target Team.</Say>' +
      '<Dial record="record-from-answer" recordingStatusCallback="' + base + '/api/twilio-status" recordingStatusCallbackMethod="POST">' +
        (to ? '<Number statusCallback="' + base + '/api/twilio-status" statusCallbackMethod="POST" url="' + base + '/api/twilio-recording-notice">' + to + '</Number>' : '') +
      '</Dial>' +
    '</Response>'
  )
}
