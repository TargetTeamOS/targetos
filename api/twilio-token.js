// TargetOS V2 — Twilio Access Token for Browser SDK
'use strict'
const crypto = require('crypto')

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64url')
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const accountSid  = process.env.TWILIO_ACCOUNT_SID
  const authToken   = process.env.TWILIO_AUTH_TOKEN
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !authToken) {
    return res.status(200).json({
      error: 'Twilio credentials missing',
      hint:  'Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Vercel env vars, then redeploy'
    })
  }

  if (!twimlAppSid) {
    return res.status(200).json({
      error: 'TWILIO_TWIML_APP_SID not set',
      hint:  'Visit https://app.targetreteam.com/api/twilio-setup to create the TwiML App, then add TWILIO_TWIML_APP_SID to Vercel and redeploy'
    })
  }

  const { agentName = 'agent' } = req.query || {}
  const identity = String(agentName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'agent'

  const now = Math.floor(Date.now() / 1000)
  const jti = accountSid + '-' + now + '-' + Math.random().toString(36).slice(2, 8)

  const header = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' }

  const payload = {
    jti,
    iss:      accountSid,
    sub:      accountSid,
    exp:      now + 3600,
    grants: {
      identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: twimlAppSid },
      }
    }
  }

  const unsigned = b64url(header) + '.' + b64url(payload)
  const sig = crypto
    .createHmac('sha256', authToken)
    .update(unsigned)
    .digest('base64url')

  const token = unsigned + '.' + sig

  return res.status(200).json({ token, identity, expires: now + 3600 })
}
