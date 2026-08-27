import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import * as stateModule from '../../api/_lib/oauthState.js'
const state = stateModule.default || stateModule
const env = {
  OAUTH_STATE_SECRET: 'oauth-test-secret-that-is-at-least-32-bytes',
  PUBLIC_BASE_URL: 'https://app.example.test',
  APP_ORIGINS: 'https://app.example.test',
}

describe('OAuth ownership state', () => {
  const create = (over = {}, now = 1_700_000_000_000) => state.createOAuthState({
    provider: 'google', scope: 'personal', userId: 'u1', agentId: 'a1', ...over,
  }, { env, now, randomBytes: () => Buffer.alloc(24, 7) })

  it('rejects tampering', () => {
    const made = create()
    expect(state.verifyOAuthState(made.state + 'x', {}, { env, now: 1_700_000_001_000 }).ok).toBe(false)
  })

  it('rejects expiration', () => {
    const made = create()
    expect(state.verifyOAuthState(made.state, {}, { env, now: 1_700_001_000_000 }).error).toMatch(/expired/i)
  })

  it('cannot be reused for another provider, user, or agent', () => {
    const made = create()
    expect(state.verifyOAuthState(made.state, { provider: 'outlook' }, { env, now: 1_700_000_001_000 }).ok).toBe(false)
    expect(state.verifyOAuthState(made.state, { userId: 'u2' }, { env, now: 1_700_000_001_000 }).ok).toBe(false)
    expect(state.verifyOAuthState(made.state, { agentId: 'a2' }, { env, now: 1_700_000_001_000 }).ok).toBe(false)
  })

  it('uses a digest suitable for single-use pending-state consumption', () => {
    const made = create()
    expect(state.nonceDigest(made.payload.nonce)).toHaveLength(64)
    expect(state.nonceDigest('different')).not.toBe(state.nonceDigest(made.payload.nonce))
  })

  it('requires authenticated POST initiation and never reads query agent_id', () => {
    for (const file of ['api/oauth-google.js', 'api/oauth-microsoft.js']) {
      const source = fs.readFileSync(file, 'utf8')
      expect(source).toContain('await authenticate(req)')
      expect(source).toContain("req.method !== 'POST'")
      expect(source).not.toContain("searchParams.get('agent_id')")
    }
  })
})
