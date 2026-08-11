'use strict'

const crypto = require('crypto')
const { requiredSecret, constantTimeEqual, approvedRedirect } = require('./requestSecurity')

const STATE_TTL_SECONDS = 10 * 60

function stateSecret(env = process.env) {
  return requiredSecret('OAUTH_STATE_SECRET', env)
}

function createOAuthState({ provider, userId, agentId, scope = 'personal', redirectTo }, options = {}) {
  const env = options.env || process.env
  const secret = stateSecret(env)
  if (!secret) throw new Error('OAUTH_STATE_SECRET is not configured')
  if (!['google', 'outlook'].includes(provider) || !['personal', 'organization'].includes(scope) || !userId || !agentId) {
    throw new Error('invalid OAuth ownership')
  }
  const now = options.now || Date.now()
  const nonce = (options.randomBytes || crypto.randomBytes)(24).toString('base64url')
  const redirect = approvedRedirect(redirectTo, env)
  const payload = {
    v: 1,
    provider,
    scope,
    userId,
    agentId,
    nonce,
    redirect,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + STATE_TTL_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  return { state: encoded + '.' + signature, payload }
}

function verifyOAuthState(state, expected = {}, options = {}) {
  const env = options.env || process.env
  const secret = stateSecret(env)
  if (!secret) return { ok: false, status: 503, error: 'OAuth state is not configured' }
  const [encoded, signature, extra] = String(state || '').split('.')
  if (!encoded || !signature || extra) return { ok: false, status: 400, error: 'Invalid OAuth state' }
  const expectedSignature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  if (!constantTimeEqual(signature, expectedSignature)) return { ok: false, status: 400, error: 'Invalid OAuth state' }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    const now = Math.floor((options.now || Date.now()) / 1000)
    if (payload.v !== 1 || !payload.nonce || payload.exp < now || payload.iat > now + 60) {
      return { ok: false, status: 400, error: payload.exp < now ? 'OAuth state expired' : 'Invalid OAuth state' }
    }
    for (const key of ['provider', 'scope', 'userId', 'agentId']) {
      if (expected[key] && payload[key] !== expected[key]) {
        return { ok: false, status: 400, error: 'OAuth state ownership mismatch' }
      }
    }
    return { ok: true, payload }
  } catch {
    return { ok: false, status: 400, error: 'Invalid OAuth state' }
  }
}

function nonceDigest(nonce) {
  return crypto.createHash('sha256').update(String(nonce || '')).digest('hex')
}

module.exports = {
  STATE_TTL_SECONDS,
  createOAuthState,
  verifyOAuthState,
  nonceDigest,
}
