// TargetOS V2 — Twilio Outbound Call
// POST: initiate outbound call (Twilio calls agent first, then bridges to contact)
// DELETE: end/cancel an active call
'use strict'

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  const baseUrl    = 'https://app.targetreteam.com'

  if (!accountSid || !authToken) {
    return res.status(503).json({ error: 'Twilio credentials not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Vercel environment variables.' })
  }

  const auth = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')

  // ── END CALL ──────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { callSid } = req.body || {}
    if (!callSid) return res.status(400).json({ error: 'callSid required' })
    try {
      const r = await fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Calls/' + callSid + '.json',
        {
          method:  'POST',
          headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    'Status=completed',
        }
      )
      const d = await r.json()
      return res.status(200).json({ ok: true, status: d.status })
    } catch(e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── INITIATE CALL ─────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, contactName, callLogId, agentId } = req.body || {}
  if (!to) return res.status(400).json({ error: 'Phone number (to) required' })

  // Normalize number
  let toNum = to.replace(/[^+0-9]/g, '')
  if (!toNum.startsWith('+')) toNum = '+1' + toNum

  // TwiML URL: when agent picks up their phone, Twilio reads this TwiML
  // which then dials the contact
  const twimlUrl = baseUrl + '/api/twilio-outbound-twiml' +
    '?to=' + encodeURIComponent(toNum) +
    '&name=' + encodeURIComponent(contactName || toNum) +
    '&callLogId=' + encodeURIComponent(callLogId || '')

  try {
    const params = new URLSearchParams({
      To:    toNum,           // Call the CONTACT directly (browser click-to-call)
      From:  fromNumber,
      Url:   twimlUrl,        // TwiML that announces and records
      StatusCallback:             baseUrl + '/api/twilio-status',
      StatusCallbackMethod:       'POST',
      StatusCallbackEvent:        'initiated ringing answered completed',
      Record:                     'true',
      RecordingStatusCallback:    baseUrl + '/api/twilio-status',
      RecordingStatusCallbackMethod: 'POST',
    })

    const r = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Calls.json',
      {
        method:  'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      }
    )

    const data = await r.json()

    if (!r.ok) {
      console.error('Twilio outbound error:', data)
      return res.status(r.status).json({ error: data.message || 'Twilio error', code: data.code })
    }

    return res.status(200).json({ callSid: data.sid, status: data.status })
  } catch(e) {
    console.error('twilio-outbound:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
