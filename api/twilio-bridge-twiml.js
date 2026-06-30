// Called when AGENT picks up — announces then dials the contact
'use strict'
const querystring = require('querystring')
function getRaw(req) {
  return new Promise((res,rej)=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>res(d));req.on('error',rej)})
}
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  const to   = req.query?.to   || ''
  const name = req.query?.name || 'your contact'
  const base = 'https://app.targetreteam.com'
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Say voice="Polly.Joanna">Connecting you to ' + name.replace(/[<>&]/g,'') + '. Please hold.</Say>' +
      '<Dial callerId="+18453271778" record="record-from-answer" ' +
        'recordingStatusCallback="' + base + '/api/twilio-status" ' +
        'recordingStatusCallbackMethod="POST">' +
        '<Number statusCallback="' + base + '/api/twilio-status" ' +
          'statusCallbackMethod="POST">' + to + '</Number>' +
      '</Dial>' +
    '</Response>'
  )
}
