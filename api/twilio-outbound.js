// TargetOS V2 — Twilio Outbound Bridge Call
// How it works:
//   1. Twilio calls the AGENT'S phone (from their profile)
//   2. Agent picks up → hears "Connecting to [contact name]..."
//   3. Twilio then dials the CONTACT
//   4. Both parties are bridged — full two-way call
//   5. Call is recorded automatically
'use strict'

const querystring = require('querystring')

const { getSupabase, requireAnyAgent } = require('./_lib/phone')

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
  if (req.method === 'OPTIONS') return res.status(200).end()

  // CRITICAL: places/ends real outbound calls through the business's
  // Twilio account. Had ZERO auth until July 2026.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  const baseUrl    = 'https://app.targetreteam.com'
  const auth       = 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64')

  if (!accountSid || !authToken) {
    return res.status(503).json({ error: 'Twilio credentials not configured in Vercel env vars' })
  }

  // ── END CALL ─────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    // Vercel doesn't always auto-parse body for DELETE — read it manually if needed
    let body = req.body
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}') } catch(e) { body = {} }
    }
    const { callSid } = body || {}
    if (!callSid) return res.status(400).json({ error: 'callSid required', received: body })

    try {
      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Calls/' + callSid + '.json', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'Status=completed',
      })
      const d = await r.json()

      if (!r.ok) {
        // Call may have already ended naturally — that's fine
        if (d.code === 20404 || (d.message||'').includes('not found')) {
          return res.status(200).json({ ok: true, note: 'Call already ended' })
        }
        return res.status(200).json({ ok: false, error: d.message, code: d.code })
      }

      return res.status(200).json({ ok: true, status: d.status })
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, contactName, callLogId, agentId } = req.body || {}
  if (!to) return res.status(400).json({ error: 'Phone number required' })

  // Normalize contact number
  let toNum = to.replace(/[^+0-9]/g, '')
  if (!toNum.startsWith('+')) toNum = '+1' + toNum

  // Look up agent's phone number from DB
  let agentPhone = null
  if (agentId) {
    try {
      const sb = getSupabase()
      if (sb) {
        const { data: ag } = await sb.from('agents').select('phone, name').eq('id', agentId).maybeSingle()
        if (ag?.phone) {
          agentPhone = ag.phone.replace(/[^+0-9]/g, '')
          if (!agentPhone.startsWith('+')) agentPhone = '+1' + agentPhone
        }
      }
    } catch(e) { console.warn('agent lookup:', e.message) }
  }

  try {
    let callSid, callStatus

    if (agentPhone) {
      // ── BRIDGE CALL: Twilio calls agent first, then connects to contact ──
      // TwiML that plays when agent picks up, then dials the contact
      const twimlUrl = baseUrl + '/api/twilio-bridge-twiml' +
        '?to=' + encodeURIComponent(toNum) +
        '&name=' + encodeURIComponent(contactName || toNum) +
        '&logId=' + encodeURIComponent(callLogId || '')

      const params = new URLSearchParams({
        To:   agentPhone,      // Call the AGENT first
        From: fromNumber,      // From our Twilio number
        Url:  twimlUrl,        // When agent answers, run this TwiML
        StatusCallback: baseUrl + '/api/twilio-status?callLogId=' + encodeURIComponent(callLogId || ''),
        StatusCallbackMethod: 'POST',
        StatusCallbackEvent: 'initiated ringing answered completed',
      })

      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Calls.json', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.message || 'Twilio error code ' + d.code)
      callSid = d.sid; callStatus = d.status

      return res.status(200).json({
        callSid,
        status: callStatus,
        mode: 'bridge',
        agentPhone,
        message: 'Your phone (' + agentPhone + ') will ring now. Pick up to be connected to ' + (contactName || toNum) + '.',
      })

    } else {
      // ── DIRECT CALL: No agent phone saved — call contact directly ──
      // This records but agent can't hear it from browser without WebRTC
      const twimlUrl = baseUrl + '/api/twilio-outbound-twiml' +
        '?to=' + encodeURIComponent(toNum) +
        '&name=' + encodeURIComponent(contactName || toNum)

      const params = new URLSearchParams({
        To:   toNum,
        From: fromNumber,
        Url:  twimlUrl,
        StatusCallback: baseUrl + '/api/twilio-status',
        StatusCallbackMethod: 'POST',
        Record: 'true',
        RecordingStatusCallback: baseUrl + '/api/twilio-status',
      })

      const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Calls.json', {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.message || 'Twilio error code ' + d.code)
      callSid = d.sid; callStatus = d.status

      return res.status(200).json({
        callSid, status: callStatus,
        mode: 'direct',
        warning: 'No phone number saved in your agent profile. Add your phone in Settings → Profile to enable bridge calling.',
      })
    }

  } catch(e) {
    console.error('twilio-outbound:', e)
    return res.status(500).json({ error: e.message })
  }
}
