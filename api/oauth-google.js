'use strict'
// api/oauth-google.js — Google connect flow (Gmail send + Sheets export).
//   GET  ?step=start → redirects to Google consent screen
//   GET  ?code=...   → callback: exchanges code, stores tokens
// Prereq: Google Cloud OAuth client; client_id + client_secret saved in
// Admin → Connectors. Redirect URI to register in Google Cloud:
//   https://app.targetreteam.com/api/oauth-google
// Scopes: gmail.send, spreadsheets, userinfo.email

const crypto = require('crypto')
const { getIntegration, patchIntegration, logEvent, baseUrl, upsertAgentAccount, findAccountByState } = require('./_lib/connectors')

const SCOPE = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://x')
    const integ = await getIntegration('google')
    if (!integ) { res.statusCode = 503; return res.end('Run sql/connectors.sql first') }
    const cfg = integ.config || {}
    const sec = integ.secrets || {}
    const redirectUri = baseUrl(req) + '/api/oauth-google'

    if (url.searchParams.get('step') === 'start') {
      if (!cfg.client_id || !sec.client_secret) {
        res.statusCode = 400
        return res.end('Google credentials missing — save Client ID + Secret in Admin → Connectors first')
      }
      const state = crypto.randomBytes(16).toString('hex')
      const agentId = url.searchParams.get('agent_id')
      if (agentId) {
        // per-agent connect: state lives on the agent's account row
        await upsertAgentAccount(agentId, 'google', { status: 'pending', secrets: { oauth_state: state } })
      } else {
        // org-level (office account) connect
        await patchIntegration('google', { secrets: Object.assign({}, sec, { oauth_state: state }) })
      }
      const auth = 'https://accounts.google.com/o/oauth2/v2/auth'
        + '?client_id=' + encodeURIComponent(cfg.client_id)
        + '&response_type=code'
        + '&redirect_uri=' + encodeURIComponent(redirectUri)
        + '&scope=' + encodeURIComponent(SCOPE)
        + '&access_type=offline'
        + '&prompt=consent'           // forces refresh_token every time
        + '&state=' + state
      res.statusCode = 302; res.setHeader('Location', auth); return res.end()
    }

    const code = url.searchParams.get('code')
    if (!code) {
      const err = url.searchParams.get('error') || 'no code returned'
      await patchIntegration('google', { status: 'error', last_error: err })
      res.statusCode = 400; return res.end('Google returned an error: ' + err)
    }
    const cbState = url.searchParams.get('state') || ''
    const agentAccount = await findAccountByState('google', cbState)
    if (!agentAccount && cbState !== (sec.oauth_state || '__none__')) {
      res.statusCode = 400; return res.end('State mismatch — start the connect flow again')
    }

    const body = new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: sec.client_secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    })
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    })
    const j = await r.json()
    if (!r.ok || !j.access_token) {
      const err = j.error_description || ('token exchange failed (' + r.status + ')')
      await patchIntegration('google', { status: 'error', last_error: err })
      res.statusCode = 500; return res.end('Token exchange failed: ' + err)
    }

    let accountEmail = ''
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + j.access_token } })
      const mj = await me.json()
      accountEmail = mj.email || ''
    } catch (e) { /* non-fatal */ }

    const tok = {
      access_token: j.access_token,
      refresh_token: j.refresh_token || (agentAccount ? (agentAccount.secrets || {}).refresh_token : sec.refresh_token),
      expires_at: new Date(Date.now() + (j.expires_in || 3600) * 1000).toISOString(),
    }
    if (agentAccount) {
      await upsertAgentAccount(agentAccount.agent_id, 'google', {
        secrets: tok, status: 'connected', last_error: null, account_email: accountEmail,
      })
      await logEvent('google', 'in', 'oauth.connected', { account: accountEmail, agent_id: agentAccount.agent_id }, true)
      res.statusCode = 302
      res.setHeader('Location', baseUrl(req) + '/settings?connected=google')
      return res.end()
    }
    const secrets = Object.assign({}, sec, tok, { account_email: accountEmail })
    delete secrets.oauth_state
    await patchIntegration('google', { secrets, status: 'connected', last_error: null })
    await logEvent('google', 'in', 'oauth.connected', { account: accountEmail }, true)

    res.statusCode = 302
    res.setHeader('Location', baseUrl(req) + '/admin?connected=google')
    res.end()
  } catch (e) {
    console.error('[oauth-google] ' + e.message)
    res.statusCode = 500; res.end('Error: ' + e.message)
  }
}
