// TargetOS V2 — Twilio Access Token for Browser SDK
// Uses official Twilio SDK's AccessToken builder for correct JWT format
'use strict'

const twilio = require('twilio')
const AccessToken = twilio.jwt.AccessToken
const VoiceGrant  = AccessToken.VoiceGrant
const { requireAnyAgent } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  // HARDENED (July 2026): caller authentication with staged rollout,
  // same pattern as TWILIO_SIG_ENFORCE. Log-only until AUTH_ENFORCE
  // is set to 'true' in Vercel — watch logs for '[AUTH]' lines, flip
  // the env var when clean. Kill-switch: set it back to 'false'.
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // CRITICAL: this issues a real, valid Twilio Access Token good for
  // outgoing + incoming calls through the business account for a full
  // hour. Had ZERO auth until July 2026.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const accountSid  = (process.env.TWILIO_ACCOUNT_SID || '').trim()
  const authToken   = (process.env.TWILIO_AUTH_TOKEN || '').trim()
  const apiKeySid   = (process.env.TWILIO_API_KEY_SID || '').trim()
  const apiKeySecret= (process.env.TWILIO_API_KEY_SECRET || '').trim()
  const twimlAppSid = (process.env.TWILIO_TWIML_APP_SID || '').trim()

  if (!accountSid || !authToken) {
    return res.status(200).json({
      error: 'Twilio credentials missing',
      hint:  'Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Vercel env vars, then redeploy'
    })
  }

  if (!twimlAppSid) {
    return res.status(200).json({
      error: 'TWILIO_TWIML_APP_SID not set',
      hint:  'Visit /api/twilio-setup to create the TwiML App, then add TWILIO_TWIML_APP_SID to Vercel and redeploy'
    })
  }

  const { agentName = 'agent' } = req.query || {}
  const identity = String(agentName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30) || 'agent'

  try {
    let token

    if (apiKeySid && apiKeySecret) {
      // Preferred: use API Key/Secret (recommended by Twilio for Access Tokens)
      token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
        identity,
        ttl: 3600,
      })
    } else {
      // Fallback: use Account SID + Auth Token directly
      // Twilio's AccessToken supports this signature too
      token = new AccessToken(accountSid, accountSid, authToken, {
        identity,
        ttl: 3600,
      })
    }

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    })
    token.addGrant(voiceGrant)

    const jwt = token.toJwt()

    return res.status(200).json({ token: jwt, identity, expires: Math.floor(Date.now()/1000) + 3600 })

  } catch(e) {
    console.error('Token generation error:', e)
    return res.status(500).json({ error: 'Token generation failed: ' + e.message })
  }
}
