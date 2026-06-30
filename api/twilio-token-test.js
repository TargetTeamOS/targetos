// Debug page - tests token generation using official Twilio SDK
'use strict'
const twilio = require('twilio')
const AccessToken = twilio.jwt.AccessToken
const VoiceGrant  = AccessToken.VoiceGrant

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html')

  const accountSid   = (process.env.TWILIO_ACCOUNT_SID || '').trim()
  const authToken    = (process.env.TWILIO_AUTH_TOKEN || '').trim()
  const apiKeySid    = (process.env.TWILIO_API_KEY_SID || '').trim()
  const apiKeySecret = (process.env.TWILIO_API_KEY_SECRET || '').trim()
  const twimlAppSid  = (process.env.TWILIO_TWIML_APP_SID || '').trim()

  let token = '', tokenError = ''
  try {
    const t = apiKeySid && apiKeySecret
      ? new AccessToken(accountSid, apiKeySid, apiKeySecret, { identity: 'test_agent', ttl: 3600 })
      : new AccessToken(accountSid, accountSid, authToken, { identity: 'test_agent', ttl: 3600 })
    t.addGrant(new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: true }))
    token = t.toJwt()
  } catch(e) { tokenError = e.message }

  res.send(`<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;font-size:12px">
    <h3>Token Debug (using official Twilio SDK)</h3>
    <p>ACCOUNT_SID: ${accountSid ? '✅ ' + accountSid.slice(0,10)+'...' : '❌ MISSING'}</p>
    <p>AUTH_TOKEN: ${authToken ? '✅ Set (length ' + authToken.length + ')' : '❌ MISSING'}</p>
    <p>TWIML_APP_SID: ${twimlAppSid ? '✅ ' + twimlAppSid : '❌ MISSING'}</p>
    <p>API_KEY_SID: ${apiKeySid ? '✅ ' + apiKeySid : '⚠️ Not set (using Auth Token fallback — less reliable)'}</p>
    <p>API_KEY_SECRET: ${apiKeySecret ? '✅ Set' : '⚠️ Not set'}</p>
    <hr/>
    ${tokenError
      ? '<p style="color:red">❌ Token generation failed: ' + tokenError + '</p>'
      : '<p style="color:green">✅ Token generated successfully (length ' + token.length + ')</p><p style="word-break:break-all;color:#666">' + token.slice(0,100) + '...</p>'
    }
    <hr/>
    <p style="color:#666">To get a proper API Key (recommended), visit <a href="/api/twilio-create-apikey">/api/twilio-create-apikey</a></p>
  </body></html>`)
}
