// TargetOS V2 — Twilio Test Call
// Triggers a real outbound call from Twilio to the given number.
// When answered, it routes through /api/twilio-inbound exactly as a real inbound call would.
'use strict'

const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN
const FROM_NUMBER  = process.env.TWILIO_PHONE_NUMBER  || '+18453271778'
const BASE_URL     = process.env.VERCEL_URL
  ? 'https://' + process.env.VERCEL_URL
  : 'https://app.targetreteam.com'

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!AUTH_TOKEN || !ACCOUNT_SID) {
    return res.status(500).json({ error: 'TWILIO_AUTH_TOKEN and TWILIO_ACCOUNT_SID must be set in Vercel environment variables' })
  }

  const { to } = req.body || {}
  if (!to) return res.status(400).json({ error: 'Phone number required' })

  // Normalize number
  let toNum = to.replace(/[^+0-9]/g, '')
  if (!toNum.startsWith('+')) {
    toNum = '+1' + toNum.replace(/^1/, '')
  }

  // The TwiML for the test call: redirect to our inbound handler
  // This simulates an incoming call — Twilio calls `to`, and when answered,
  // runs /api/twilio-inbound which walks the saved flow
  const twimlUrl = BASE_URL + '/api/twilio-inbound'

  try {
    const auth = Buffer.from(ACCOUNT_SID + ':' + AUTH_TOKEN).toString('base64')
    const body = new URLSearchParams({
      To:  toNum,
      From: FROM_NUMBER,
      Url:  twimlUrl,
      Method: 'POST',
      StatusCallback: BASE_URL + '/api/twilio-status',
      StatusCallbackMethod: 'POST',
    })

    const response = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + ACCOUNT_SID + '/Calls.json',
      {
        method:  'POST',
        headers: {
          'Authorization': 'Basic ' + auth,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Twilio error:', data)
      return res.status(400).json({ error: data.message || 'Twilio call failed', details: data })
    }

    return res.status(200).json({
      success: true,
      callSid: data.sid,
      status:  data.status,
      to:      toNum,
      from:    FROM_NUMBER,
    })
  } catch (e) {
    console.error('Test call error:', e)
    return res.status(500).json({ error: e.message })
  }
}
