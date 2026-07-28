import { describe, it, expect, vi } from 'vitest'
import * as V from '../../api/_lib/pubsubVerify.js'

const ENV = { GMAIL_PUBSUB_AUDIENCE: 'https://app.example/api/webhooks/gmail-pubsub', GMAIL_PUBSUB_SERVICE_ACCOUNT: 'push@proj.iam.gserviceaccount.com' }
const now = 1_800_000_000
const good = { iss: 'https://accounts.google.com', aud: ENV.GMAIL_PUBSUB_AUDIENCE, email: ENV.GMAIL_PUBSUB_SERVICE_ACCOUNT, email_verified: true, exp: now + 600, iat: now - 10 }

describe('pubsubVerify claims', () => {
  it('getBearer extracts / rejects', () => {
    expect(V.getBearer({ headers: { authorization: 'Bearer abc' } })).toBe('abc')
    expect(V.getBearer({ headers: {} })).toBe(null)
  })
  it('parseJwt rejects malformed tokens', () => {
    expect(() => V.parseJwt('')).toThrow(/missing token/)
    expect(() => V.parseJwt('a.b')).toThrow(/malformed/)
  })
  it('fails closed when not configured', () => {
    expect(() => V.verifyClaims(good, {}, now)).toThrow(/not configured/)
  })
  it('rejects a MISSING issuer', () => {
    const { iss, ...noIss } = good
    expect(() => V.verifyClaims(noIss, ENV, now)).toThrow(/issuer/)
  })
  it('rejects an INVALID issuer', () => {
    expect(() => V.verifyClaims({ ...good, iss: 'https://evil.example' }, ENV, now)).toThrow(/issuer/)
  })
  it('accepts the Google issuer (both forms)', () => {
    expect(V.verifyClaims({ ...good, iss: 'https://accounts.google.com' }, ENV, now)).toBe(true)
    expect(V.verifyClaims({ ...good, iss: 'accounts.google.com' }, ENV, now)).toBe(true)
  })
  it('rejects bad audience / service account / unverified / expired', () => {
    expect(() => V.verifyClaims({ ...good, aud: 'x' }, ENV, now)).toThrow(/audience/)
    expect(() => V.verifyClaims({ ...good, email: 'x@y' }, ENV, now)).toThrow(/service account/)
    expect(() => V.verifyClaims({ ...good, email_verified: false }, ENV, now)).toThrow(/not verified/)
    expect(() => V.verifyClaims({ ...good, exp: now - 1 }, ENV, now)).toThrow(/expired/)
  })
  it('rejects a token whose nbf is in the future', () => {
    expect(() => V.verifyClaims({ ...good, nbf: now + 3600 }, ENV, now)).toThrow(/nbf/)
  })
})

describe('pubsubVerify signature/JWKS', () => {
  it('rejects a token with no kid', async () => {
    await expect(V.verifySignature({ alg: 'RS256' }, 'si', 'sig', {})).rejects.toThrow(/missing kid/)
  })
  it('reuses the JWKS cache within TTL (fetch called once)', async () => {
    V.resetJwksCache()
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ keys: [{ kid: 'k1' }] }),
      headers: { get: (h) => (h === 'cache-control' ? 'public, max-age=3600' : null) } }))
    const a = await V.fetchJwks('https://certs.example/jwks', fetchImpl, now)
    const b = await V.fetchJwks('https://certs.example/jwks', fetchImpl, now + 1000)
    expect(a).toBe(b)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
