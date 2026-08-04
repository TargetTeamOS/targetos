import { describe, expect, it } from 'vitest'
import { offersV2Allowed } from './offersV2Flag'

describe('Offers V2 beta authorization', () => {
  const agent = { id: 'agent-1', role: 'admin' }

  it('fails closed when the flag is missing', () => {
    expect(offersV2Allowed(agent, null)).toBe(false)
  })

  it('fails closed when disabled', () => {
    expect(
      offersV2Allowed(agent, {
        enabled: false,
        allowed_agent_ids: ['agent-1'],
      })
    ).toBe(false)
  })

  it('allows an explicitly approved agent', () => {
    expect(
      offersV2Allowed(agent, {
        enabled: true,
        allowed_agent_ids: ['agent-1'],
      })
    ).toBe(true)
  })

  it('rejects an agent not on the allowlist', () => {
    expect(
      offersV2Allowed(agent, {
        enabled: true,
        allowed_agent_ids: ['another-agent'],
      })
    ).toBe(false)
  })

  it('allows full rollout when enabled with an empty allowlist', () => {
    expect(
      offersV2Allowed(agent, {
        enabled: true,
        allowed_agent_ids: [],
      })
    ).toBe(true)
  })

  it('does not automatically bypass the allowlist for admins', () => {
    expect(
      offersV2Allowed(
        { id: 'admin-2', role: 'admin' },
        {
          enabled: true,
          allowed_agent_ids: ['agent-1'],
        }
      )
    ).toBe(false)
  })
})
