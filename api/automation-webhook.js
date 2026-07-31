'use strict'

const { authenticate, sendAuthError } = require('./_lib/auth')
const { requireExternalEffects } = require('./_lib/externalEffects')

function publicHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return null
    if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(host)) return null
    const match = host.match(/^172\.(\d+)\./)
    if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return null
    return url.toString()
  } catch { return null }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const identity = await authenticate(req, { roles: ['team'] })
  if (!identity.ok) return sendAuthError(res, identity)
  const url = publicHttpsUrl(req.body?.url)
  if (!url) return res.status(400).json({ error: 'A public HTTPS webhook URL is required' })
  if (!requireExternalEffects(res)) return
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body?.payload || {}),
    })
    if (!response.ok) return res.status(502).json({ error: 'Webhook delivery failed' })
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(502).json({ error: 'Webhook delivery failed' })
  }
}

module.exports = handler
module.exports.publicHttpsUrl = publicHttpsUrl
