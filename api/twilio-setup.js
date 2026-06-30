// TargetOS V2 — Auto-creates the TwiML App in Twilio
// GET /api/twilio-setup — creates the TwiML App and returns its SID
// You only need to run this once, then add the SID to Vercel env vars
'use strict'

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const existingSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !authToken) {
    return res.status(200).json({
      ok: false,
      step: 'credentials_missing',
      message: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in Vercel first.',
      instructions: [
        'Go to vercel.com → TargetOS project → Settings → Environment Variables',
        'Add TWILIO_ACCOUNT_SID = (your Twilio Account SID from console.twilio.com)',
        'Add TWILIO_AUTH_TOKEN = (get from console.twilio.com → Account → API Keys & Tokens)',
        'Add TWILIO_PHONE_NUMBER = +18453271778',
        'Click Save then Redeploy',
        'Then visit this URL again: https://app.targetreteam.com/api/twilio-setup',
      ]
    })
  }

  const auth    = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')
  const baseUrl = 'https://app.targetreteam.com'

  try {
    // Check if TwiML App already exists
    if (existingSid) {
      const chk = await fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Applications/' + existingSid + '.json',
        { headers: { 'Authorization': auth } }
      )
      if (chk.ok) {
        const app = await chk.json()
        return res.status(200).json({
          ok: true,
          step: 'already_configured',
          twimlAppSid: existingSid,
          appName: app.friendly_name,
          voiceUrl: app.voice_url,
          message: 'TwiML App already configured and working!',
          nextStep: 'Browser calling should work. Click the 📞 button on any contact.'
        })
      }
    }

    // Create the TwiML App
    const params = new URLSearchParams({
      FriendlyName:      'TargetOS CRM Browser Calls',
      VoiceUrl:          baseUrl + '/api/twilio-browser-twiml',
      VoiceMethod:       'POST',
      StatusCallback:    baseUrl + '/api/twilio-status',
      StatusCallbackMethod: 'POST',
    })

    const createRes = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Applications.json',
      {
        method:  'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      }
    )

    const app = await createRes.json()

    if (!createRes.ok) {
      return res.status(200).json({
        ok: false,
        step: 'create_failed',
        error: app.message,
        message: 'Could not create TwiML App: ' + app.message
      })
    }

    return res.status(200).json({
      ok: true,
      step: 'created',
      twimlAppSid: app.sid,
      appName: app.friendly_name,
      voiceUrl: app.voice_url,
      message: 'TwiML App created successfully!',
      nextStep: 'Add TWILIO_TWIML_APP_SID = ' + app.sid + ' to Vercel env vars, then Redeploy.',
      vercelUrl: 'https://vercel.com/dashboard',
    })

  } catch(e) {
    return res.status(200).json({ ok: false, step: 'error', error: e.message })
  }
}
