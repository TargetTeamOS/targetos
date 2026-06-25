// /api/twilio-outbound-twiml — TwiML served when agent answers outbound call
module.exports = function handler(req, res) {
  const name      = req.query?.name || 'your contact'
  const callLogId = req.query?.callLogId || ''
  res.setHeader('Content-Type', 'text/xml')
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Connecting your call to ${name}. Please wait.</Say>
  <Dial record="record-from-answer" recordingStatusCallback="/api/twilio-status">
    <Number statusCallback="/api/twilio-status" statusCallbackMethod="POST">${req.query?.to || ''}</Number>
  </Dial>
</Response>`)
}
