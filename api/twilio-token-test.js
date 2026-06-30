// Debug page - tests token generation and shows the actual JWT for inspection
'use strict'
const crypto = require('crypto')
function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url') }

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html')

  const accountSid  = process.env.TWILIO_ACCOUNT_SID
  const authToken   = process.env.TWILIO_AUTH_TOKEN
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

  const now = Math.floor(Date.now()/1000)
  const identity = 'test_agent'

  const header = { alg:'HS256', typ:'JWT', cty:'twilio-fpa;v=1' }
  const payload = {
    jti: accountSid + '-' + now,
    iss: accountSid, sub: accountSid, exp: now+3600,
    grants: { identity, voice: { incoming:{allow:true}, outgoing:{application_sid:twimlAppSid} } }
  }
  const unsigned = b64url(header) + '.' + b64url(payload)
  const sig = crypto.createHmac('sha256', authToken||'').update(unsigned).digest('base64url')
  const token = unsigned + '.' + sig

  // Find any env var that looks like it might be the TwiML SID (in case of typo/case issue)
  const allEnvKeys = Object.keys(process.env).filter(k => k.toUpperCase().includes('TWIML') || k.toUpperCase().includes('TWILIO'))

  res.send(`<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;font-size:12px">
    <h3>Token Debug</h3>
    <p>ACCOUNT_SID: ${accountSid ? '✅ ' + accountSid.slice(0,10)+'...' : '❌ MISSING'}</p>
    <p>AUTH_TOKEN: ${authToken ? '✅ Set (length ' + authToken.length + ')' : '❌ MISSING'}</p>
    <p>TWIML_APP_SID: ${twimlAppSid ? '✅ ' + twimlAppSid : '❌ MISSING'}</p>
    <p style="color:#666">All TWILIO/TWIML-related env var names found: ${JSON.stringify(allEnvKeys)}</p>
    <p style="color:#666">VERCEL_ENV: ${process.env.VERCEL_ENV || 'not set'} | VERCEL_GIT_COMMIT_SHA: ${(process.env.VERCEL_GIT_COMMIT_SHA||'').slice(0,8)}</p>
    <p>Generated token (first 60 chars): ${token.slice(0,60)}...</p>
    <p>Token length: ${token.length}</p>
    <hr/>
    <h3>Live SDK Test</h3>
    <div id="status">Loading SDK...</div>
    <script src="https://sdk.twilio.com/js/voice/releases/2.11.1/twilio.min.js"
      onerror="document.getElementById('status').innerHTML='❌ Failed to load SDK from sdk.twilio.com - possibly blocked by network/firewall/adblocker'"></script>
    <script>
      const statusEl = document.getElementById('status')
      function log(msg) { statusEl.innerHTML += '<br/>' + msg }

      setTimeout(() => {
        if (!window.Twilio || !window.Twilio.Device) {
          log('❌ Twilio.Device not found after SDK load')
          return
        }
        log('✅ Twilio SDK loaded, Device class available')

        try {
          const device = new Twilio.Device('${token}', { logLevel: 'debug' })
          log('✅ Device instance created')

          device.on('registered', () => log('✅ DEVICE REGISTERED SUCCESSFULLY — browser calling should work!'))
          device.on('error', (err) => log('❌ DEVICE ERROR: ' + err.message + ' (code: ' + err.code + ')'))

          device.register().then(() => {
            log('✅ register() promise resolved')
          }).catch(err => {
            log('❌ register() promise rejected: ' + err.message)
          })
        } catch(e) {
          log('❌ Exception creating device: ' + e.message)
        }
      }, 500)
    </script>
  </body></html>`)
}
