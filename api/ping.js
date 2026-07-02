// Dead-simple health check — no dependencies
'use strict'
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">The Target Team phone system is online. This is a test. Goodbye.</Say><Hangup /></Response>')
}
