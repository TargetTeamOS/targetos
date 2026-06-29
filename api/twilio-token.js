// TargetOS V2 — Twilio Access Token
// Generates a short-lived token for the browser Twilio Device SDK
// The browser uses this to make/receive calls directly in the browser
'use strict'

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const accountSid  = process.env.TWILIO_ACCOUNT_SID
  const authToken   = process.env.TWILIO_AUTH_TOKEN
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID  // TwiML App SID

  if (!accountSid || !authToken) {
    return res.status(503).json({
      error: 'Twilio not configured',
      hint:  'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_TWIML_APP_SID to Vercel environment variables'
    })
  }

  if (!twimlAppSid) {
    return res.status(503).json({
      error: 'TWILIO_TWIML_APP_SID not set',
      hint:  'Create a TwiML App in the Twilio Console and set its Voice URL to https://app.targetreteam.com/api/twilio-browser-twiml, then add the SID as TWILIO_TWIML_APP_SID in Vercel'
    })
  }

  try {
    // Generate access token using Twilio's REST API approach
    // We build the JWT manually since we can't install twilio SDK on Vercel edge
    const { agentId = 'agent', agentName = 'Agent' } = req.query || {}

    const identity = (agentName || 'agent').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
    const now      = Math.floor(Date.now() / 1000)
    const exp      = now + 3600  // 1 hour

    // Build Twilio Access Token JWT manually
    const header  = { alg: 'HS256', typ: 'JWT', cty: 'twilio-fpa;v=1' }
    const payload = {
      jti:   accountSid + '-' + now + '-' + Math.random().toString(36).slice(2),
      iss:   accountSid,
      sub:   accountSid,
      exp:   exp,
      grants: {
        identity: identity,
        voice: {
          incoming: { allow: true },
          outgoing: { application_sid: twimlAppSid },
        }
      }
    }

    function b64url(s) {
      return Buffer.from(JSON.stringify(s)).toString('base64')
        .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    }

    const unsigned = b64url(header) + '.' + b64url(payload)

    const crypto = require('crypto')
    const sig = crypto.createHmac('sha256', authToken)
      .update(unsigned).digest('base64')
      .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')

    const token = unsigned + '.' + sig

    return res.status(200).json({ token, identity, expires: exp })
  } catch(e) {
    console.error('token error:', e)
    return res.status(500).json({ error: e.message })
  }
}
