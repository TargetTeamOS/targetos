import { describe, it, expect } from 'vitest'
import { offersV2Allowed } from './offersV2Flag'

function flagMap(row) {
  return new Map(row ? [['offers_v2_beta', row]] : [])
}

describe('offersV2Allowed — fails closed, unlike the general flag system', () => {
  it('is OFF when the flag row does not exist at all', () => {
    expect(offersV2Allowed({ id: 'a1', role: 'admin' }, flagMap(null))).toBe(false)
  })

  it('is OFF when explicitly disabled, even for admins', () => {
    expect(offersV2Allowed({ id: 'a1', role: 'admin' }, flagMap({ enabled: false }))).toBe(false)
  })

  it('an admin NOT on the allowlist does not get automatic access — no bypass', () => {
    const row = { enabled: true, allowed_agent_ids: ['some-other-agent'] }
    expect(offersV2Allowed({ id: 'admin-1', role: 'admin' }, flagMap(row))).toBe(false)
  })

  it('a regular agent ON the allowlist gets access', () => {
    const row = { enabled: true, allowed_agent_ids: ['agent-1'] }
    expect(offersV2Allowed({ id: 'agent-1', role: 'agent' }, flagMap(row))).toBe(true)
  })

  it('an admin on the allowlist gets access (the "owner testing alone" case)', () => {
    const row = { enabled: true, allowed_agent_ids: ['owner-admin-id'] }
    expect(offersV2Allowed({ id: 'owner-admin-id', role: 'admin' }, flagMap(row))).toBe(true)
  })

  it('enabled with an empty allowlist means full rollout to everyone', () => {
    const row = { enabled: true, allowed_agent_ids: [] }
    expect(offersV2Allowed({ id: 'any-agent', role: 'agent' }, flagMap(row))).toBe(true)
  })

  it('is OFF for a signed-out / missing agent even if the flag is enabled', () => {
    const row = { enabled: true, allowed_agent_ids: ['agent-1'] }
    expect(offersV2Allowed(null, flagMap(row))).toBe(false)
  })
})
