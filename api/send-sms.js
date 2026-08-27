// TargetOS V2 — Send SMS via Twilio
'use strict'
const { requireAnyAgent } = require('./_lib/phone')
const { createServiceClient } = require('./_lib/supabaseConfig')
const { isAdminRole } = require('./_lib/auth')
const { requireExternalEffects } = require('./_lib/externalEffects')

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

async function authorizeContactAccess(supabase, contactId, identity, request = {}) {
  if (!contactId) return { ok: true, contact: null }
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, agent_id')
    .eq('id', contactId)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: 'Unable to verify contact ownership' }
  if (!contact) return { ok: false, status: 404, error: 'Contact not found' }
  if (contact.agent_id === identity.agentId) return { ok: true, contact }

  const explicitAdminOverride = request.admin_override === true &&
    typeof request.admin_reason === 'string' && request.admin_reason.trim().length >= 8
  if (isAdminRole(identity.role) && explicitAdminOverride) {
    return { ok: true, contact, adminOverride: true }
  }
  return { ok: false, status: 403, error: 'Contact belongs to another agent' }
}

async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' })

  // CRITICAL: this sends a real SMS from the business number to any
  // number, using real Twilio credits. Had ZERO auth until July 2026.
  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  const request = await parseBody(req)
  const { to, body, contactId } = request
  if (!to || !body) return res.status(400).json({ error:'to and body required' })

  let messageStore
  try {
    messageStore = createServiceClient()
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.message })
  }

  const contactAccess = await authorizeContactAccess(messageStore, contactId, authCheck, request)
  if (!contactAccess.ok) return res.status(contactAccess.status).json({ error: contactAccess.error })
  if (!requireExternalEffects(res)) return

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+18453271778'
  if (!accountSid || !authToken) return res.status(503).json({ error:'Twilio not configured' })

  try {
    const auth = 'Basic ' + Buffer.from(accountSid+':'+authToken).toString('base64')
    const params = new URLSearchParams({ To: to, From: fromNumber, Body: body })
    const r = await fetch('https://api.twilio.com/2010-04-01/Accounts/'+accountSid+'/Messages.json', {
      method:'POST', headers:{ Authorization: auth, 'Content-Type':'application/x-www-form-urlencoded' }, body: params.toString()
    })
    const d = await r.json()
    if (!r.ok) return res.status(400).json({ error: d.message })

    // Save to sms_messages table
    await messageStore.from('sms_messages').insert({
      twilio_sid:   d.sid,
      direction:    'outbound',
      from_number:  fromNumber,
      to_number:    to,
      body,
      status:       d.status,
      contact_id:   contactId || null,
      agent_id:     authCheck.agentId,
      created_at:   new Date().toISOString(),
    }).catch(e => console.warn('sms save:', e.message))

    return res.status(200).json({ ok:true, sid: d.sid, status: d.status })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}

module.exports = handler
module.exports.authorizeContactAccess = authorizeContactAccess
