'use strict'
// api/oauth-microsoft.js — Outlook connect flow.
//   GET  ?step=start    → redirects to Microsoft consent screen
//   GET  ?code=...      → callback: exchanges code, stores tokens
// Prereq: Azure app registration; client_id + client_secret saved in
// Admin → Connectors. Redirect URI to register in Azure:
//   https://app.targetreteam.com/api/oauth-microsoft
// Scopes: offline_access, Mail.Send, User.Read (send as signed-in user).

const crypto = require('crypto')
const { getIntegration, patchIntegration, logEvent, baseUrl } = require('./_lib/connectors')

const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read'

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://x')
    const integ = await getIntegration('outlook')
    if (!integ) { res.statusCode = 503; return res.end('Run sql/connectors.sql first') }
    const cfg = integ.config || {}
    const sec = integ.secrets || {}
    const redirectUri = baseUrl(req) + '/api/oauth-microsoft'

    if (url.searchParams.get('step') === 'start') {
      if (!cfg.client_id || !sec.client_secret) {
        res.statusCode = 400
        return res.end('Outlook credentials missing — save Client ID + Secret in Admin → Connectors first')
      }
      const state = crypto.randomBytes(16).toString('hex')
      await patchIntegration('outlook', { secrets: Object.assign({}, sec, { oauth_state: state }) })
      const auth = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
        + '?client_id=' + encodeURIComponent(cfg.client_id)
        + '&response_type=code'
        + '&redirect_uri=' + encodeURIComponent(redirectUri)
        + '&response_mode=query'
        + '&scope=' + encodeURIComponent(SCOPE)
        + '&state=' + state
      res.statusCode = 302; res.setHeader('Location', auth); return res.end()
    }

    const code = url.searchParams.get('code')
    if (!code) {
      const err = url.searchParams.get('error_description') || 'no code returned'
      await patchIntegration('outlook', { status: 'error', last_error: err })
      res.statusCode = 400; return res.end('Microsoft returned an error: ' + err)
    }
    if (url.searchParams.get('state') !== (sec.oauth_state || '__none__')) {
      res.statusCode = 400; return res.end('State mismatch — start the connect flow again from Admin → Connectors')
    }

    const body = new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: sec.client_secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope: SCOPE,
    })
    const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    })
    const j = await r.json()
    if (!r.ok || !j.access_token) {
      const err = j.error_description || ('token exchange failed (' + r.status + ')')
      await patchIntegration('outlook', { status: 'error', last_error: err })
      res.statusCode = 500; return res.end('Token exchange failed: ' + err)
    }

    // who connected?
    let accountEmail = ''
    try {
      const me = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: 'Bearer ' + j.access_token } })
      const mj = await me.json()
      accountEmail = mj.mail || mj.userPrincipalName || ''
    } catch (e) { /* non-fatal */ }

    const secrets = Object.assign({}, sec, {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
      account_email: accountEmail,
    })
    delete secrets.oauth_state
    await patchIntegration('outlook', { secrets, status: 'connected', last_error: null })
    await logEvent('outlook', 'in', 'oauth.connected', { account: accountEmail }, true)

    res.statusCode = 302
    res.setHeader('Location', baseUrl(req) + '/admin?connected=outlook')
    res.end()
  } catch (e) {
    console.error('[oauth-microsoft] ' + e.message)
    res.statusCode = 500; res.end('Error: ' + e.message)
  }
}
