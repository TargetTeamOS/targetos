import { describe, it, expect } from 'vitest'
import * as V from '../../api/_lib/pubsubVerify.js'

const ENV = { GMAIL_PUBSUB_AUDIENCE: 'https://app.example/api/webhooks/gmail-pubsub', GMAIL_PUBSUB_SERVICE_ACCOUNT: 'push@proj.iam.gserviceaccount.com' }
const now = 1_800_000_000
const good = { aud: ENV.GMAIL_PUBSUB_AUDIENCE, email: ENV.GMAIL_PUBSUB_SERVICE_ACCOUNT, email_verified: true, exp: now + 600, iat: now - 10 }

describe('pubsubVerify', () => {
  it('getBearer extracts / rejects', () => {
    expect(V.getBearer({ headers: { authorization: 'Bearer abc' } })).toBe('abc')
    expect(V.getBearer({ headers: {} })).toBe(null)
  })

  it('parseJwt rejects malformed tokens', () => {
    expect(() => V.parseJwt('')).toThrow(/missing token/)
    expect(() => V.parseJwt('a.b')).toThrow(/malformed/)
    expect(() => V.parseJwt('!.!.!')).toThrow(/malformed/)
  })

  it('verifyClaims fails closed when not configured', () => {
    expect(() => V.verifyClaims(good, {}, now)).toThrow(/not configured/)
  })
  it('rejects bad audience', () => {
    expect(() => V.verifyClaims({ ...good, aud: 'https://evil' }, ENV, now)).toThrow(/audience/)
  })
  it('rejects wrong service account', () => {
    expect(() => V.verifyClaims({ ...good, email: 'attacker@x.com' }, ENV, now)).toThrow(/service account/)
  })
  it('rejects unverified email', () => {
    expect(() => V.verifyClaims({ ...good, email_verified: false }, ENV, now)).toThrow(/not verified/)
  })
  it('rejects expired token', () => {
    expect(() => V.verifyClaims({ ...good, exp: now - 1 }, ENV, now)).toThrow(/expired/)
  })
  it('accepts a valid token', () => {
    expect(V.verifyClaims(good, ENV, now)).toBe(true)
  })
})
