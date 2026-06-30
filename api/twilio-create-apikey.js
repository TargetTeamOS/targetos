// One-time setup: creates a Twilio API Key for secure Access Token generation
// Visit this once, copy the SID + Secret into Vercel env vars
'use strict'

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim()
  const authToken  = (process.env.TWILIO_AUTH_TOKEN || '').trim()

  if (!accountSid || !authToken) {
    return res.status(200).json({ error: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set first' })
  }

  const auth = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')

  try {
    const params = new URLSearchParams({ FriendlyName: 'TargetOS CRM Browser Calls Key' })
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Keys.json', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const d = await r.json()

    if (!r.ok) {
      return res.status(200).json({ ok: false, error: d.message })
    }

    return res.status(200).json({
      ok: true,
      message: 'API Key created! Add these TWO new env vars to Vercel, then redeploy:',
      vars_to_add: {
        TWILIO_API_KEY_SID:    d.sid,
        TWILIO_API_KEY_SECRET: d.secret,
      },
      warning: 'The secret is only shown once — copy it now!'
    })
  } catch(e) {
    return res.status(200).json({ ok: false, error: e.message })
  }
}
