'use strict'
// api/_lib/pubsubVerify.js — verify a Google Pub/Sub PUSH request's OIDC
// token. FAILS CLOSED: any missing/invalid token, wrong audience, wrong
// service-account identity, expiry, or missing config → throws. No token or
// header material is ever logged or echoed.

const crypto = require('crypto')

const DEFAULT_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

function getBearer(req) {
  const hdr = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || ''
  return hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : null
}

// Split a JWT without verifying. Pure.
function parseJwt(token) {
  if (!token || typeof token !== 'string') throw new Error('missing token')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  let header, payload
  try { header = dec(parts[0]); payload = dec(parts[1]) } catch (e) { throw new Error('malformed token') }
  return { header, payload, signingInput: parts[0] + '.' + parts[1], signature: parts[2] }
}

// Check claims against required config. Pure — unit-tested directly.
// env: { GMAIL_PUBSUB_AUDIENCE, GMAIL_PUBSUB_SERVICE_ACCOUNT }
function verifyClaims(payload, env, nowSec) {
  const audience = env.GMAIL_PUBSUB_AUDIENCE
  const sa = env.GMAIL_PUBSUB_SERVICE_ACCOUNT
  if (!audience || !sa) throw new Error('pubsub verification not configured') // fail closed
  if (!payload || payload.aud !== audience) throw new Error('bad audience')
  if (payload.email !== sa) throw new Error('bad service account')
  if (payload.email_verified !== true) throw new Error('email not verified')
  const now = nowSec || Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('token expired')
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('token not yet valid')
  return true
}

async function fetchJwks(url, fetchImpl) {
  const f = fetchImpl || fetch
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const r = await f(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error('jwks fetch failed')
    return await r.json()
  } finally { clearTimeout(t) }
}

async function verifySignature(header, signingInput, signature, opts) {
  const jwks = await fetchJwks((opts && opts.certsUrl) || DEFAULT_CERTS_URL, opts && opts.fetchImpl)
  const key = (jwks.keys || []).find(k => k.kid === header.kid && (k.alg || 'RS256') === (header.alg || 'RS256'))
  if (!key) throw new Error('signing key not found')
  const pub = crypto.createPublicKey({ key, format: 'jwk' })
  const ok = crypto.verify('RSA-SHA256', Buffer.from(signingInput),
    pub, Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
  if (!ok) throw new Error('bad signature')
  return true
}

// Full verification. Returns claims on success; throws (fail closed) otherwise.
async function verifyPubSubOidc(req, opts) {
  opts = opts || {}
  const env = opts.env || process.env
  const token = getBearer(req)
  if (!token) throw new Error('missing authorization')
  const { header, payload, signingInput, signature } = parseJwt(token)
  if ((header.alg || '') !== 'RS256') throw new Error('unexpected alg')
  verifyClaims(payload, env, opts.nowSec)
  await verifySignature(header, signingInput, signature, { certsUrl: env.GOOGLE_OIDC_CERTS_URL, fetchImpl: opts.fetchImpl })
  return payload
}

module.exports = { getBearer, parseJwt, verifyClaims, verifySignature, verifyPubSubOidc, DEFAULT_CERTS_URL }
