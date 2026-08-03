import { describe, it, expect } from 'vitest'

const { shouldSkipAsAlreadySent, isExternalEffectsEnabled } = require('../../api/send-offer')

describe('send-offer — idempotency decision', () => {
  it('skips as already-sent when a prior offer_sends row exists for this key', () => {
    expect(shouldSkipAsAlreadySent({ status: 'Sent', sent_at: '2026-08-01T00:00:00Z' })).toBe(true)
  })

  it('does NOT skip when no prior row exists for this key', () => {
    expect(shouldSkipAsAlreadySent(null)).toBe(false)
    expect(shouldSkipAsAlreadySent(undefined)).toBe(false)
  })

  it('still skips even for a prior row whose last attempt failed — a caller should inspect status, not re-send blindly', () => {
    // Documents actual behavior: the key was already claimed once, so a
    // second call with the SAME idempotency key returns the cached
    // outcome rather than silently retrying. A genuine retry after a
    // failure should use a NEW idempotency key, which is the caller's
    // responsibility (Offers.jsx), not this function's.
    expect(shouldSkipAsAlreadySent({ status: 'Failed' })).toBe(true)
  })
})

describe('send-offer — external effects gate', () => {
  it('fails closed by default (no env var set)', () => {
    expect(isExternalEffectsEnabled({})).toBe(false)
  })

  it('fails closed for anything other than the literal string "true"', () => {
    expect(isExternalEffectsEnabled({ EXTERNAL_EFFECTS_ENABLED: '1' })).toBe(false)
    expect(isExternalEffectsEnabled({ EXTERNAL_EFFECTS_ENABLED: 'yes' })).toBe(false)
  })

  it('is case-insensitive for the true value specifically (Vercel env UI sometimes normalizes case)', () => {
    expect(isExternalEffectsEnabled({ EXTERNAL_EFFECTS_ENABLED: 'true' })).toBe(true)
    expect(isExternalEffectsEnabled({ EXTERNAL_EFFECTS_ENABLED: 'True' })).toBe(true)
  })
})
