// Simple test endpoint - no auth needed, just tests the full call flow
'use strict'
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18453271778'

  const checks = {
    TWILIO_ACCOUNT_SID:  accountSid  ? '✅ Set' : '❌ MISSING',
    TWILIO_AUTH_TOKEN:   authToken   ? '✅ Set' : '❌ MISSING',
    TWILIO_PHONE_NUMBER: fromNumber  ? '✅ ' + fromNumber : '❌ MISSING',
    TWILIO_TWIML_APP_SID: process.env.TWILIO_TWIML_APP_SID ? '✅ ' + process.env.TWILIO_TWIML_APP_SID : '❌ MISSING',
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ MISSING',
  }

  // Test Twilio credentials
  let twilioStatus = 'not tested'
  if (accountSid && authToken) {
    try {
      const auth = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
        headers: { 'Authorization': auth }
      })
      const d = await r.json()
      twilioStatus = r.ok ? '✅ Valid - Account: ' + d.friendly_name : '❌ Invalid: ' + d.message
    } catch(e) { twilioStatus = '❌ Error: ' + e.message }
  }

  // Test making a call if ?to= param provided
  const to = req.query?.to
  let callResult = null
  if (to && accountSid && authToken) {
    try {
      const auth = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')
      const params = new URLSearchParams({
        To:   to.startsWith('+') ? to : '+1' + to.replace(/\D/g,''),
        From: fromNumber,
        Url:  'https://app.targetreteam.com/api/twilio-bridge-twiml?to=' + encodeURIComponent(to) + '&name=Test',
        StatusCallback: 'https://app.targetreteam.com/api/twilio-status',
      })
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })
      const d = await r.json()
      callResult = r.ok ? { ok: true, sid: d.sid, status: d.status } : { ok: false, error: d.message, code: d.code }
    } catch(e) { callResult = { ok: false, error: e.message } }
  }

  res.json({
    env_checks: checks,
    twilio_auth: twilioStatus,
    call_test: callResult || 'Add ?to=+18451234567 to test an actual call',
    instructions: 'Visit /api/twilio-call-test?to=YOUR_PHONE to make a real test call'
  })
}
