// TargetOS V2 - authenticated Twilio outbound bridge calling
'use strict'

const { getSupabase, requireAnyAgent } = require('./_lib/phone')
const { requireExternalEffects } = require('./_lib/externalEffects')
const { publicBaseUrl } = require('./_lib/requestSecurity')

async function resolveOwnedAgentPhone(supabase, authenticatedAgentId) {
  if (!authenticatedAgentId) return null
  const { data, error } = await supabase
    .from('agents')
    .select('id, phone, name')
    .eq('id', authenticatedAgentId)
    .maybeSingle()
  if (error) throw error
  if (!data?.phone) return null
  let phone = String(data.phone).replace(/[^+0-9]/g, '')
  if (!phone.startsWith('+')) phone = '+1' + phone
  return { id: data.id, name: data.name, phone }
}

function twilioConfiguration() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  const baseUrl = publicBaseUrl()
  if (!accountSid || !authToken || !baseUrl) return null
  return {
    accountSid,
    fromNumber,
    baseUrl,
    auth: 'Basic ' + Buffer.from(accountSid + ':' + authToken).toString('base64'),
  }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const identity = await requireAnyAgent(req)
  if (!identity.ok) return res.status(identity.status).json({ error: identity.message })

  if (req.method === 'DELETE') {
    let body = req.body
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}') } catch { body = {} }
    }
    const { callSid } = body || {}
    if (!callSid) return res.status(400).json({ error: 'callSid required' })
    if (!requireExternalEffects(res)) return
    const config = twilioConfiguration()
    if (!config) return res.status(503).json({ error: 'Twilio or PUBLIC_BASE_URL configuration is missing' })

    try {
      const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + config.accountSid + '/Calls/' + callSid + '.json', {
        method: 'POST',
        headers: { Authorization: config.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'Status=completed',
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.code === 20404 || String(data.message || '').includes('not found')) {
          return res.status(200).json({ ok: true, note: 'Call already ended' })
        }
        return res.status(200).json({ ok: false, error: data.message, code: data.code })
      }
      return res.status(200).json({ ok: true, status: data.status })
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, contactName, callLogId } = req.body || {}
  if (!to) return res.status(400).json({ error: 'Phone number required' })

  let supabase
  try {
    supabase = getSupabase()
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.message })
  }

  let ownedAgent
  try {
    // Caller-supplied agentId is intentionally ignored. Phone selection is
    // always bound to the authenticated CRM identity.
    ownedAgent = await resolveOwnedAgentPhone(supabase, identity.agentId)
  } catch {
    return res.status(500).json({ error: 'Unable to resolve authenticated agent phone' })
  }

  if (!requireExternalEffects(res)) return
  const config = twilioConfiguration()
  if (!config) return res.status(503).json({ error: 'Twilio or PUBLIC_BASE_URL configuration is missing' })

  let toNumber = String(to).replace(/[^+0-9]/g, '')
  if (!toNumber.startsWith('+')) toNumber = '+1' + toNumber
  const agentPhone = ownedAgent?.phone || null

  try {
    const bridge = Boolean(agentPhone)
    const twimlUrl = config.baseUrl + (bridge ? '/api/twilio-bridge-twiml' : '/api/twilio-outbound-twiml') +
      '?to=' + encodeURIComponent(toNumber) +
      '&name=' + encodeURIComponent(contactName || toNumber) +
      (bridge ? '&logId=' + encodeURIComponent(callLogId || '') : '')
    const params = new URLSearchParams({
      To: bridge ? agentPhone : toNumber,
      From: config.fromNumber,
      Url: twimlUrl,
      StatusCallback: config.baseUrl + '/api/twilio-status' + (callLogId ? '?callLogId=' + encodeURIComponent(callLogId) : ''),
      StatusCallbackMethod: 'POST',
    })
    if (bridge) params.set('StatusCallbackEvent', 'initiated ringing answered completed')
    else {
      params.set('Record', 'true')
      params.set('RecordingStatusCallback', config.baseUrl + '/api/twilio-status')
    }

    const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + config.accountSid + '/Calls.json', {
      method: 'POST',
      headers: { Authorization: config.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Twilio error code ' + data.code)
    return res.status(200).json({
      callSid: data.sid,
      status: data.status,
      mode: bridge ? 'bridge' : 'direct',
      message: bridge ? 'Your authenticated profile phone will ring now.' : undefined,
      warning: bridge ? undefined : 'No phone number is saved in your authenticated agent profile.',
    })
  } catch (error) {
    console.error('twilio-outbound:', error)
    return res.status(500).json({ error: error.message })
  }
}

module.exports = handler
module.exports.resolveOwnedAgentPhone = resolveOwnedAgentPhone
module.exports.twilioConfiguration = twilioConfiguration
