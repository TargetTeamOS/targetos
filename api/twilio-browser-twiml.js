// TwiML App Voice URL — called when browser SDK makes an outbound call
// req.body.To = the number the agent wants to call
'use strict'
const querystring = require('querystring')
function getRawBody(req) {
  return new Promise((res,rej)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>res(d)); req.on('error',rej) })
}
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  const body = querystring.parse(await getRawBody(req))
  const to   = body.To || body.to || ''
  const from = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  const base = 'https://app.targetreteam.com'

  if (!to) {
    return res.send('<?xml version="1.0"?><Response><Say>No number provided.</Say></Response>')
  }

  // Normalize number
  let toNum = to.replace(/[^+0-9]/g,'')
  if (!toNum.startsWith('+')) toNum = '+1' + toNum

  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
      '<Dial callerId="' + from + '" record="record-from-answer" ' +
        'recordingStatusCallback="' + base + '/api/twilio-status" ' +
        'recordingStatusCallbackMethod="POST">' +
        '<Number statusCallback="' + base + '/api/twilio-status" ' +
          'statusCallbackMethod="POST">' + toNum + '</Number>' +
      '</Dial>' +
    '</Response>'
  )
}
