'use strict'
// api/_lib/pubsubVerify.js — verify a Google Pub/Sub PUSH request's OIDC
// token. FAILS CLOSED on any missing/invalid token, wrong issuer, audience,
// service-account identity, unverified email, expiry/nbf, missing kid, or
// missing config. Never logs or returns the bearer token.

const crypto = require('crypto')

const DEFAULT_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

function getBearer(req) {
  const hdr = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || ''
  return hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : null
}

function parseJwt(token) {
  if (!token || typeof token !== 'string') throw new Error('missing token')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  let header, payload
  try { header = dec(parts[0]); payload = dec(parts[1]) } catch (e) { throw new Error('malformed token') }
  return { header, payload, signingInput: parts[0] + '.' + parts[1], signature: parts[2] }
}

// Pure claim checks. env: { GMAIL_PUBSUB_AUDIENCE, GMAIL_PUBSUB_SERVICE_ACCOUNT }
function verifyClaims(payload, env, nowSec) {
  const audience = env.GMAIL_PUBSUB_AUDIENCE
  const sa = env.GMAIL_PUBSUB_SERVICE_ACCOUNT
  if (!audience || !sa) throw new Error('pubsub verification not configured') // fail closed
  if (!payload) throw new Error('missing claims')
  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new Error('bad issuer')
  if (payload.aud !== audience) throw new Error('bad audience')
  if (payload.email !== sa) throw new Error('bad service account')
  if (payload.email_verified !== true) throw new Error('email not verified')
  const now = nowSec || Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('token expired')
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('token not yet valid (iat)')
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) throw new Error('token not yet valid (nbf)')
  return true
}

// ── bounded, conservative in-memory JWKS cache ───────────────────
let _jwksCache = {}
function resetJwksCache() { _jwksCache = {} }
async function fetchJwks(url, fetchImpl, now) {
  const t = now || Date.now()
  const cached = _jwksCache[url]
  if (cached && cached.expiresAt > t) return cached.jwks
  const f = fetchImpl || fetch
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 5000)
  let r
  try { r = await f(url, { signal: ctrl.signal }) } finally { clearTimeout(to) }
  if (!r.ok) throw new Error('jwks fetch failed')
  const jwks = await r.json()
  let ttl = 3600 // default 1h
  const cc = r.headers && (typeof r.headers.get === 'function' ? r.headers.get('cache-control') : null)
  const m = cc && /max-age=(\d+)/.exec(cc)
  if (m) ttl = Math.min(86400, Math.max(60, Number(m[1]))) // bounded [60s, 24h]
  _jwksCache[url] = { jwks, expiresAt: t + ttl * 1000 }
  return jwks
}

async function verifySignature(header, signingInput, signature, opts) {
  if (!header || !header.kid) throw new Error('missing kid') // reject missing kid
  const jwks = await fetchJwks((opts && opts.certsUrl) || DEFAULT_CERTS_URL, opts && opts.fetchImpl, opts && opts.now)
  const key = (jwks.keys || []).find(k => k.kid === header.kid && (k.alg || 'RS256') === (header.alg || 'RS256'))
  if (!key) throw new Error('signing key not found')
  const pub = crypto.createPublicKey({ key, format: 'jwk' })
  const ok = crypto.verify('RSA-SHA256', Buffer.from(signingInput), pub,
    Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
  if (!ok) throw new Error('bad signature')
  return true
}

async function verifyPubSubOidc(req, opts) {
  opts = opts || {}
  const env = opts.env || process.env
  const token = getBearer(req)
  if (!token) throw new Error('missing authorization')
  const { header, payload, signingInput, signature } = parseJwt(token)
  if ((header.alg || '') !== 'RS256') throw new Error('unexpected alg')
  verifyClaims(payload, env, opts.nowSec)
  await verifySignature(header, signingInput, signature, { certsUrl: env.GOOGLE_OIDC_CERTS_URL, fetchImpl: opts.fetchImpl, now: opts.nowMs })
  return payload
}

module.exports = {
  getBearer, parseJwt, verifyClaims, verifySignature, verifyPubSubOidc,
  fetchJwks, resetJwksCache, DEFAULT_CERTS_URL, GOOGLE_ISSUERS,
}
