// /api/twilio-outbound — Initiates outbound calls via Twilio REST API
const querystring = require('querystring')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, contactName, callLogId, agentId } = req.body || {}

  if (!to) return res.status(400).json({ error: 'Phone number required' })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const from       = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  const baseUrl    = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.targetreteam.com'

  if (!accountSid || !authToken) {
    // Twilio not configured — return 404 so frontend falls back to tel: link
    return res.status(404).json({ error: 'Twilio not configured' })
  }

  try {
    const body = querystring.stringify({
      To:            to,
      From:          from,
      Url:           `${baseUrl}/api/twilio-outbound-twiml?name=${encodeURIComponent(contactName || to)}&callLogId=${callLogId || ''}`,
      StatusCallback:`${baseUrl}/api/twilio-status`,
      StatusCallbackMethod: 'POST',
      Record:        'true',
      RecordingStatusCallback: `${baseUrl}/api/twilio-status`,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
        body,
      }
    )

    const data = await response.json()
    if (!response.ok) {
      console.error('Twilio outbound error:', data)
      return res.status(response.status).json({ error: data.message })
    }

    return res.status(200).json({ callSid: data.sid, status: data.status })
  } catch(err) {
    console.error('twilio-outbound error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
