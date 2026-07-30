'use strict'

const { authenticate, isAdminRole } = require('./_lib/auth')
const {
  getIntegration, patchIntegration, logEvent, upsertAgentAccount,
  saveOAuthPending, consumeOAuthPending,
} = require('./_lib/connectors')
const { createOAuthState, verifyOAuthState, nonceDigest } = require('./_lib/oauthState')
const { publicBaseUrl } = require('./_lib/requestSecurity')

const SCOPE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://x')
    const step = url.searchParams.get('step')
    const base = publicBaseUrl()
    if (!base) return json(res, 503, { error: 'PUBLIC_BASE_URL is not configured' })
    const redirectUri = base + '/api/oauth-google'
    const integ = await getIntegration('google')
    if (!integ) return json(res, 503, { error: 'Google integration is not configured' })
    const cfg = integ.config || {}
    const sec = integ.secrets || {}

    if (step === 'start') {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
      const identity = await authenticate(req)
      if (!identity.ok) return json(res, identity.status, { error: identity.error })
      const scope = url.searchParams.get('scope') === 'organization' ? 'organization' : 'personal'
      if (scope === 'organization' && !isAdminRole(identity.agent.role)) return json(res, 403, { error: 'forbidden' })
      if (!cfg.client_id || !sec.client_secret) return json(res, 400, { error: 'Google credentials are not configured' })
      const created = createOAuthState({
        provider: 'google',
        scope,
        userId: identity.user.id,
        agentId: identity.agent.id,
      })
      await saveOAuthPending({
        scope,
        provider: 'google',
        userId: identity.user.id,
        agentId: identity.agent.id,
        nonceDigest: nonceDigest(created.payload.nonce),
        expiresAt: new Date(created.payload.exp * 1000).toISOString(),
      })
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
        + '?client_id=' + encodeURIComponent(cfg.client_id)
        + '&response_type=code'
        + '&redirect_uri=' + encodeURIComponent(redirectUri)
        + '&scope=' + encodeURIComponent(SCOPE)
        + '&access_type=offline&prompt=consent'
        + '&state=' + encodeURIComponent(created.state)
      return json(res, 200, { url: authUrl })
    }

    const verified = verifyOAuthState(url.searchParams.get('state'), { provider: 'google' })
    if (!verified.ok) return json(res, verified.status, { error: verified.error })
    let pending
    try { pending = await consumeOAuthPending(verified.payload) }
    catch (error) {
      console.warn('[oauth-google] rejected callback:', error.message)
      return json(res, 400, { error: 'OAuth state is invalid or already used' })
    }
    const code = url.searchParams.get('code')
    if (!code) return json(res, 400, { error: 'Google authorization was not completed' })

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.client_id,
        client_secret: sec.client_secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })
    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok || !tokenData.access_token) return json(res, 502, { error: 'Google token exchange failed' })

    let accountEmail = ''
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + tokenData.access_token } })
      const profile = await me.json()
      accountEmail = profile.email || ''
    } catch { /* email is helpful but not required */ }

    const prior = (pending.record && pending.record.secrets) || {}
    delete prior.oauth_nonce_digest
    delete prior.oauth_user_id
    delete prior.oauth_agent_id
    delete prior.oauth_expires_at
    const tokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || prior.refresh_token,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
    }
    if (verified.payload.scope === 'organization') {
      await patchIntegration('google', {
        secrets: Object.assign({}, prior, tokens, { account_email: accountEmail }),
        status: 'connected',
        last_error: null,
      })
    } else {
      await upsertAgentAccount(verified.payload.agentId, 'google', {
        secrets: tokens, status: 'connected', last_error: null, account_email: accountEmail,
      })
    }
    await logEvent('google', 'in', 'oauth.connected', { scope: verified.payload.scope }, true)
    res.statusCode = 302
    res.setHeader('Location', base + (verified.payload.scope === 'organization' ? '/admin?connected=google' : '/settings?connected=google'))
    return res.end()
  } catch (error) {
    console.error('[oauth-google] ' + error.message)
    return json(res, 500, { error: 'OAuth request failed' })
  }
}
module.exports = handler
module.exports.SCOPE = SCOPE
