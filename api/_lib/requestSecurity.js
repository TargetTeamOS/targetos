'use strict'

const crypto = require('crypto')

function requiredSecret(name, env = process.env) {
  const value = String(env[name] || '').trim()
  return value.length >= 16 ? value : null
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')
  if (!left.length || left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function bearerToken(req) {
  const value = String((req.headers || {}).authorization || '')
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

function verifyBearerSecret(req, envName, env = process.env) {
  const expected = requiredSecret(envName, env)
  if (!expected) return { ok: false, status: 503, error: envName + ' is not configured' }
  if (!constantTimeEqual(bearerToken(req), expected)) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true }
}

function verifyHeaderSecret(req, envName, headerName, env = process.env) {
  const expected = requiredSecret(envName, env)
  if (!expected) return { ok: false, status: 503, error: envName + ' is not configured' }
  const provided = String((req.headers || {})[String(headerName).toLowerCase()] || '')
  if (!constantTimeEqual(provided, expected)) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true }
}

function appOrigins(env = process.env) {
  return String(env.APP_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' && url.origin === value.replace(/\/$/, '')
      } catch { return false }
    })
}

function publicBaseUrl(env = process.env) {
  const raw = String(env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.origin !== raw) return null
    return raw
  } catch { return null }
}

function approvedRedirect(value, env = process.env) {
  if (!value) return publicBaseUrl(env)
  try {
    const candidate = new URL(value)
    const allowed = new Set(appOrigins(env))
    const base = publicBaseUrl(env)
    if (base) allowed.add(base)
    return allowed.has(candidate.origin) ? candidate.toString() : null
  } catch { return null }
}

function sendSecurityError(res, result) {
  const status = result.status || 401
  const body = { error: result.error || 'unauthorized' }
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(body))
}

function signExpiring(value, secretName, ttlSeconds, env = process.env, now = Date.now()) {
  const secret = requiredSecret(secretName, env)
  if (!secret) throw new Error(secretName + ' is not configured')
  const exp = Math.floor(now / 1000) + ttlSeconds
  const payload = Buffer.from(JSON.stringify({ value, exp })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return payload + '.' + sig
}

function verifyExpiring(token, secretName, env = process.env, now = Date.now()) {
  const secret = requiredSecret(secretName, env)
  if (!secret) return { ok: false, status: 503, error: secretName + ' is not configured' }
  const [payload, sig, extra] = String(token || '').split('.')
  if (!payload || !sig || extra) return { ok: false, status: 400, error: 'invalid token' }
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  if (!constantTimeEqual(sig, expected)) return { ok: false, status: 400, error: 'invalid token' }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!Number.isFinite(data.exp) || data.exp < Math.floor(now / 1000)) {
      return { ok: false, status: 400, error: 'expired token' }
    }
    return { ok: true, value: data.value, exp: data.exp }
  } catch {
    return { ok: false, status: 400, error: 'invalid token' }
  }
}

module.exports = {
  requiredSecret,
  constantTimeEqual,
  bearerToken,
  verifyBearerSecret,
  verifyHeaderSecret,
  appOrigins,
  publicBaseUrl,
  approvedRedirect,
  sendSecurityError,
  signExpiring,
  verifyExpiring,
}
