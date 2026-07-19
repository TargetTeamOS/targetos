'use strict'
// api/_lib/connectors.js — shared helpers for the connectors layer.
// Reuses the service-key Supabase client pattern from _lib/phone.js.

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL  = process.env.SUPABASE_URL || 'https://sgrnyvdsyahmypibjarx.supabase.co'

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY ||
              process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_KEY missing — connectors require the service key')
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
}

async function getIntegration(id) {
  const { data, error } = await sb().from('integrations').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error('integrations read failed: ' + error.message)
  return data // may be null if sql/connectors.sql not run yet
}

async function patchIntegration(id, patch) {
  patch.updated_at = new Date().toISOString()
  const { error } = await sb().from('integrations').update(patch).eq('id', id)
  if (error) throw new Error('integrations update failed: ' + error.message)
}

async function logEvent(integration_id, direction, event, detail, ok) {
  try {
    await sb().from('integration_events').insert({
      integration_id, direction, event,
      detail: detail || {}, ok: ok !== false,
    })
  } catch (e) { console.warn('[connectors] event log failed: ' + e.message) }
}

// ── OAuth token refresh ───────────────────────────────────────────
// Both providers: if access token expires within 2 min, refresh it,
// persist the new tokens, return a valid access token.

async function freshMicrosoftToken(integ) {
  const s = integ.secrets || {}
  if (!s.refresh_token) throw new Error('Outlook not connected (no refresh token)')
  if (s.access_token && s.expires_at && Date.parse(s.expires_at) - Date.now() > 120000) {
    return s.access_token
  }
  const cfg = integ.config || {}
  const body = new URLSearchParams({
    client_id: cfg.client_id || '',
    client_secret: s.client_secret || '',
    grant_type: 'refresh_token',
    refresh_token: s.refresh_token,
    scope: 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite',
  })
  const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    await patchIntegration('outlook', { status: 'error', last_error: j.error_description || 'token refresh failed' })
    throw new Error('Outlook token refresh failed: ' + (j.error_description || r.status))
  }
  const secrets = Object.assign({}, s, {
    access_token: j.access_token,
    refresh_token: j.refresh_token || s.refresh_token,
    expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
  })
  await patchIntegration('outlook', { secrets, status: 'connected', last_error: null })
  return j.access_token
}

async function freshGoogleToken(integ) {
  const s = integ.secrets || {}
  if (!s.refresh_token) throw new Error('Google not connected (no refresh token)')
  if (s.access_token && s.expires_at && Date.parse(s.expires_at) - Date.now() > 120000) {
    return s.access_token
  }
  const cfg = integ.config || {}
  const body = new URLSearchParams({
    client_id: cfg.client_id || '',
    client_secret: s.client_secret || '',
    grant_type: 'refresh_token',
    refresh_token: s.refresh_token,
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    await patchIntegration('google', { status: 'error', last_error: j.error_description || 'token refresh failed' })
    throw new Error('Google token refresh failed: ' + (j.error_description || r.status))
  }
  const secrets = Object.assign({}, s, {
    access_token: j.access_token,
    expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
  })
  await patchIntegration('google', { secrets, status: 'connected', last_error: null })
  return j.access_token
}

function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'app.targetreteam.com'
  return 'https://' + host
}

module.exports = { sb, getIntegration, patchIntegration, logEvent, freshMicrosoftToken, freshGoogleToken, baseUrl }

// ── Per-agent accounts (integration_accounts) ─────────────────────

async function getAgentAccount(agentId, provider) {
  const { data, error } = await sb().from('integration_accounts')
    .select('*').eq('agent_id', agentId).eq('provider', provider).maybeSingle()
  if (error) throw new Error('integration_accounts read failed: ' + error.message)
  return data
}

async function upsertAgentAccount(agentId, provider, patch) {
  patch.updated_at = new Date().toISOString()
  const existing = await getAgentAccount(agentId, provider)
  if (existing) {
    const { error } = await sb().from('integration_accounts').update(patch).eq('id', existing.id)
    if (error) throw new Error('integration_accounts update failed: ' + error.message)
    return existing.id
  }
  const row = Object.assign({ agent_id: agentId, provider }, patch)
  const { data, error } = await sb().from('integration_accounts').insert([row]).select('id').single()
  if (error) throw new Error('integration_accounts insert failed: ' + error.message)
  return data.id
}

async function findAccountByState(provider, state) {
  const { data, error } = await sb().from('integration_accounts')
    .select('*').eq('provider', provider).eq('secrets->>oauth_state', state).maybeSingle()
  if (error) throw new Error('integration_accounts state lookup failed: ' + error.message)
  return data
}

// Refresh an agent account's token. App credentials (client id/secret)
// come from the org-level integrations row for that provider.
async function freshAccountToken(provider, account) {
  const s = account.secrets || {}
  if (s.access_token && s.expires_at && Date.parse(s.expires_at) - Date.now() > 120000) {
    return s.access_token
  }
  if (!s.refresh_token) throw new Error(provider + ' account not connected (no refresh token)')
  const app = await getIntegration(provider === 'outlook' ? 'outlook' : 'google')
  const cfg = (app && app.config) || {}
  const appSecret = ((app && app.secrets) || {}).client_secret || ''
  const isMs = provider === 'outlook'
  const params = {
    client_id: cfg.client_id || '',
    client_secret: appSecret,
    grant_type: 'refresh_token',
    refresh_token: s.refresh_token,
  }
  if (isMs) params.scope = 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite'
  const r = await fetch(isMs
    ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    : 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const j = await r.json()
  if (!r.ok || !j.access_token) {
    await upsertAgentAccount(account.agent_id, provider, { status: 'error', last_error: j.error_description || 'token refresh failed' })
    throw new Error(provider + ' token refresh failed: ' + (j.error_description || r.status))
  }
  const secrets = Object.assign({}, s, {
    access_token: j.access_token,
    refresh_token: j.refresh_token || s.refresh_token,
    expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
  })
  await upsertAgentAccount(account.agent_id, provider, { secrets, status: 'connected', last_error: null })
  return j.access_token
}

async function agentIdFromAuthUser(authUserId) {
  if (!authUserId) return null
  const { data } = await sb().from('agents').select('id').eq('auth_user_id', authUserId).maybeSingle()
  return data ? data.id : null
}

module.exports.getAgentAccount = getAgentAccount
module.exports.upsertAgentAccount = upsertAgentAccount
module.exports.findAccountByState = findAccountByState
module.exports.freshAccountToken = freshAccountToken
module.exports.agentIdFromAuthUser = agentIdFromAuthUser
