// Called when AGENT picks up — announces then dials the contact
'use strict'
const querystring = require('querystring')
function getRaw(req) {
  return new Promise((res,rej)=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>res(d));req.on('error',rej)})
}
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (!require('./_lib/phone').checkTwilioSignature(req, res, {}, 'twilio-bridge-twiml')) return
  const to     = (req.query?.to || '').replace(/[^+0-9]/g, '')
  const name   = req.query?.name   || 'your contact'
  const logId  = req.query?.logId  || ''
  const base   = 'https://app.targetreteam.com'
  const statusUrl = base + '/api/twilio-status?callLogId=' + encodeURIComponent(logId)
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say voice="Polly.Joanna">Connecting you to ' + name.replace(/[<>&]/g,'') + '. Please hold.</Say>' +
      '<Dial callerId="+18453271778" record="record-from-answer" ' +
        'recordingStatusCallback="' + statusUrl + '" ' +
        'recordingStatusCallbackMethod="POST">' +
        '<Number statusCallback="' + statusUrl + '" ' +
          'statusCallbackMethod="POST" url="' + base + '/api/twilio-recording-notice">' + to + '</Number>' +
      '</Dial>' +
    '</Response>'
  )
}
