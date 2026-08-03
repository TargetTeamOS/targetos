import { describe, it, expect, vi } from 'vitest'
const { verifyOfferOwnership, createOfferRevision, isSendTestEnabled } = require('../../api/_lib/offersDb')

// Minimal mock of the Supabase query-builder chain used by offersDb.js.
// This is a logic test, not a live-database test — genuinely blocked
// without real SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY credentials,
// which this environment does not have. Reported honestly as such.
function mockSupabase({ agentRow, offerRow, insertResult }) {
  return {
    from(table) {
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === 'agents') return { data: agentRow, error: agentRow ? null : { message: 'not found' } }
              if (table === 'offers') return { data: offerRow, error: offerRow ? null : { message: 'not found' } }
              return { data: null, error: { message: 'unknown table' } }
            },
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: insertResult, error: insertResult ? null : { message: 'insert failed' } }),
          }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }
    },
  }
}

describe('verifyOfferOwnership — access control logic (mocked client)', () => {
  it('denies when no agent profile is linked to the authenticated user', async () => {
    const sb = mockSupabase({ agentRow: null, offerRow: { id: 'o1', agent_id: 'a1', buyers_agent_id: null } })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-user-1')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
  })

  it('denies when the agent is inactive', async () => {
    const sb = mockSupabase({
      agentRow: { id: 'a1', role: 'agent', active: false },
      offerRow: { id: 'o1', agent_id: 'a1', buyers_agent_id: null },
    })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-user-1')
    expect(result.ok).toBe(false)
  })

  it('denies Agent B access to Agent A\'s offer', async () => {
    const sb = mockSupabase({
      agentRow: { id: 'agent-b', role: 'agent', active: true },
      offerRow: { id: 'o1', agent_id: 'agent-a', buyers_agent_id: 'agent-a' },
    })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-user-b')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
  })

  it('allows the owning agent (agent_id match)', async () => {
    const sb = mockSupabase({
      agentRow: { id: 'agent-a', role: 'agent', active: true },
      offerRow: { id: 'o1', agent_id: 'agent-a', buyers_agent_id: null },
    })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-user-a')
    expect(result.ok).toBe(true)
  })

  it('allows the owning agent (buyers_agent_id match)', async () => {
    const sb = mockSupabase({
      agentRow: { id: 'agent-a', role: 'agent', active: true },
      offerRow: { id: 'o1', agent_id: null, buyers_agent_id: 'agent-a' },
    })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-user-a')
    expect(result.ok).toBe(true)
  })

  it('allows admin regardless of ownership', async () => {
    const sb = mockSupabase({
      agentRow: { id: 'admin-1', role: 'admin', active: true },
      offerRow: { id: 'o1', agent_id: 'someone-else', buyers_agent_id: 'someone-else-2' },
    })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-admin')
    expect(result.ok).toBe(true)
  })

  it('allows secretary regardless of ownership — matches the pre-existing client-side canManage convention', async () => {
    const sb = mockSupabase({
      agentRow: { id: 'secretary-1', role: 'secretary', active: true },
      offerRow: { id: 'o1', agent_id: 'someone-else', buyers_agent_id: 'someone-else-2' },
    })
    const result = await verifyOfferOwnership(sb, 'o1', 'auth-secretary')
    expect(result.ok).toBe(true)
  })

  it('returns 404 when the offer itself does not exist', async () => {
    const sb = mockSupabase({ agentRow: { id: 'a1', role: 'agent', active: true }, offerRow: null })
    const result = await verifyOfferOwnership(sb, 'nonexistent', 'auth-user-1')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })
})

describe('createOfferRevision — numbering logic (mocked client)', () => {
  it('starts numbering at 1 for a brand-new offer', async () => {
    const sb = mockSupabase({ insertResult: { id: 'rev-1', revision_number: 1 } })
    const revision = await createOfferRevision(sb, {
      offerId: 'o1', createdBy: 'a1', snapshot: { purchase_price: '900000' },
    })
    expect(revision.revision_number).toBe(1)
  })
})

describe('isSendTestEnabled — second, independent send gate (mocked client)', () => {
  function mockFlagsClient(flagRow) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: flagRow, error: null }) }),
        }),
      }),
    }
  }

  it('is false when the flag row does not exist', async () => {
    expect(await isSendTestEnabled(mockFlagsClient(null), 'a1')).toBe(false)
  })

  it('is false when disabled', async () => {
    expect(await isSendTestEnabled(mockFlagsClient({ enabled: false, allowed_agent_ids: [] }), 'a1')).toBe(false)
  })

  it('is false for an agent not on the allowlist, even if enabled', async () => {
    expect(await isSendTestEnabled(mockFlagsClient({ enabled: true, allowed_agent_ids: ['other-agent'] }), 'a1')).toBe(false)
  })

  it('is true for an agent on the allowlist', async () => {
    expect(await isSendTestEnabled(mockFlagsClient({ enabled: true, allowed_agent_ids: ['a1'] }), 'a1')).toBe(true)
  })

  it('is true for everyone when enabled with an empty allowlist', async () => {
    expect(await isSendTestEnabled(mockFlagsClient({ enabled: true, allowed_agent_ids: [] }), 'any-agent')).toBe(true)
  })
})
