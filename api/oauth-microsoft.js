'use strict'

const { authenticate, isAdminRole } = require('./_lib/auth')
const {
  getIntegration, patchIntegration, logEvent, upsertAgentAccount,
  saveOAuthPending, consumeOAuthPending,
} = require('./_lib/connectors')
const { createOAuthState, verifyOAuthState, nonceDigest } = require('./_lib/oauthState')
const { publicBaseUrl } = require('./_lib/requestSecurity')

const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite'

function authorizeUrl(clientId, redirectUri, state) {
  return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    + '?client_id=' + encodeURIComponent(clientId)
    + '&response_type=code&response_mode=query'
    + '&redirect_uri=' + encodeURIComponent(redirectUri)
    + '&scope=' + encodeURIComponent(SCOPE)
    + '&prompt=select_account&state=' + encodeURIComponent(state)
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://x')
    const base = publicBaseUrl()
    if (!base) return json(res, 503, { error: 'PUBLIC_BASE_URL is not configured' })
    const redirectUri = base + '/api/oauth-microsoft'
    const integ = await getIntegration('outlook')
    if (!integ) return json(res, 503, { error: 'Outlook integration is not configured' })
    const cfg = integ.config || {}
    const sec = integ.secrets || {}

    if (url.searchParams.get('step') === 'start') {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST required' })
      const identity = await authenticate(req)
      if (!identity.ok) return json(res, identity.status, { error: identity.error })
      const scope = url.searchParams.get('scope') === 'organization' ? 'organization' : 'personal'
      if (scope === 'organization' && !isAdminRole(identity.agent.role)) return json(res, 403, { error: 'forbidden' })
      if (!cfg.client_id || !sec.client_secret) return json(res, 400, { error: 'Outlook credentials are not configured' })
      const created = createOAuthState({
        provider: 'outlook',
        scope,
        userId: identity.user.id,
        agentId: identity.agent.id,
      })
      await saveOAuthPending({
        scope,
        provider: 'outlook',
        userId: identity.user.id,
        agentId: identity.agent.id,
        nonceDigest: nonceDigest(created.payload.nonce),
        expiresAt: new Date(created.payload.exp * 1000).toISOString(),
      })
      return json(res, 200, { url: authorizeUrl(cfg.client_id, redirectUri, created.state) })
    }

    const verified = verifyOAuthState(url.searchParams.get('state'), { provider: 'outlook' })
    if (!verified.ok) return json(res, verified.status, { error: verified.error })
    let pending
    try { pending = await consumeOAuthPending(verified.payload) }
    catch (error) {
      console.warn('[oauth-microsoft] rejected callback:', error.message)
      return json(res, 400, { error: 'OAuth state is invalid or already used' })
    }
    const code = url.searchParams.get('code')
    if (!code) return json(res, 400, { error: 'Microsoft authorization was not completed' })

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.client_id,
        client_secret: sec.client_secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: SCOPE,
      }).toString(),
    })
    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok || !tokenData.access_token) return json(res, 502, { error: 'Microsoft token exchange failed' })

    let accountEmail = ''
    try {
      const me = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: 'Bearer ' + tokenData.access_token } })
      const profile = await me.json()
      accountEmail = profile.mail || profile.userPrincipalName || ''
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
      await patchIntegration('outlook', {
        secrets: Object.assign({}, prior, tokens, { account_email: accountEmail }),
        status: 'connected',
        last_error: null,
      })
    } else {
      await upsertAgentAccount(verified.payload.agentId, 'outlook', {
        secrets: tokens, status: 'connected', last_error: null, account_email: accountEmail,
      })
    }
    await logEvent('outlook', 'in', 'oauth.connected', { scope: verified.payload.scope }, true)
    res.statusCode = 302
    res.setHeader('Location', base + (verified.payload.scope === 'organization' ? '/admin?connected=outlook' : '/settings?connected=outlook'))
    return res.end()
  } catch (error) {
    console.error('[oauth-microsoft] ' + error.message)
    return json(res, 500, { error: 'OAuth request failed' })
  }
}

module.exports = handler
module.exports.authorizeUrl = authorizeUrl
module.exports.SCOPE = SCOPE
