import { describe, it, expect } from 'vitest'
const { verifyOfferOwnership } = require('../../api/_lib/offersDb')

describe('ContactDetail — Related Offers query relies on RLS, never hides rows client-side', () => {
  it('the Related Offers query has no ownership/agent_id filter of its own — structural proof it depends entirely on offers_select RLS', () => {
    // Per the owner's explicit correction: "The Contact page must
    // request related offers through the authoritative Offers
    // permission layer or RLS. Do not load every related offer and
    // hide unauthorized rows only in the browser." This asserts that
    // fact directly against the source rather than re-deriving it.
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '../pages/ContactDetail.jsx'), 'utf8')

    // Find the Related Offers query block specifically (identified by
    // its distinctive roleColumns variable) rather than scanning the
    // whole 1800+ line file, which has plenty of OTHER legitimate
    // agent_id usage unrelated to this query.
    const marker = "const roleColumns"
    const start = src.indexOf(marker)
    expect(start).toBeGreaterThan(-1)
    const block = src.slice(start, start + 600) // enough to cover the full query chain

    expect(block).toMatch(/from\('offers'\)/)
    expect(block).not.toMatch(/\.eq\('agent_id'/)
    expect(block).not.toMatch(/\.filter\(.*agent_id/)
    // The query selects by contact-role columns only (buyer/seller/
    // attorney/agent contact ids) — no manual ownership narrowing.
    expect(block).toMatch(/sellers_agent_contact_id/)
    expect(block).toMatch(/buyers_agent_contact_id/)
  })
})

describe('Shared-outside-Contact scenario — Agent A/B/Admin/Secretary, modeled against the real ownership check', () => {
  // These exercise the SAME verifyOfferOwnership() function that
  // actually gates server-side offer access elsewhere (send-offer.js,
  // generate-offer-pdf.js) — not a new mechanism invented for this
  // test. The Related Offers query itself is gated by the equivalent
  // logic living in the offers_select RLS policy on the live database,
  // which cannot be executed from this sandboxed environment; see
  // sql/offers_v2/A_verify.sql's "SHARED OUTSIDE-CONTACT ISOLATION"
  // section for the exact live-database verification steps. This test
  // proves the ownership RULE is correct; it does not substitute for
  // running that SQL against a real database with real Auth users.
  function mockSupabase({ agentRow, offerRow }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              return agentRow !== undefined
                ? { data: agentRow, error: agentRow ? null : { message: 'not found' } }
                : { data: offerRow, error: offerRow ? null : { message: 'not found' } }
            },
          }),
        }),
      }),
    }
  }
  // Two-table mock: agents lookup then offers lookup, matching
  // verifyOfferOwnership's real sequence.
  function mockTwoTable({ agentRow, offerRow }) {
    let call = 0
    return {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === 'agents') return { data: agentRow, error: agentRow ? null : { message: 'not found' } }
              if (table === 'offers') return { data: offerRow, error: offerRow ? null : { message: 'not found' } }
              return { data: null, error: { message: 'unknown table' } }
            },
          }),
        }),
      }),
    }
  }

  const OFFER_TO_CONTACT_X = { id: 'offer-1', agent_id: 'agent-a', buyers_agent_id: null }

  it('Agent A can access their own offer to Contact X', async () => {
    const sb = mockTwoTable({ agentRow: { id: 'agent-a', role: 'agent', active: true }, offerRow: OFFER_TO_CONTACT_X })
    const result = await verifyOfferOwnership(sb, 'offer-1', 'auth-a')
    expect(result.ok).toBe(true)
  })

  it('Agent B does NOT see Agent A\'s offer to the same Contact X, despite both being able to search/open Contact X itself', async () => {
    const sb = mockTwoTable({ agentRow: { id: 'agent-b', role: 'agent', active: true }, offerRow: OFFER_TO_CONTACT_X })
    const result = await verifyOfferOwnership(sb, 'offer-1', 'auth-b')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(403)
  })

  it('Admin sees Agent A\'s offer to Contact X', async () => {
    const sb = mockTwoTable({ agentRow: { id: 'admin-1', role: 'admin', active: true }, offerRow: OFFER_TO_CONTACT_X })
    const result = await verifyOfferOwnership(sb, 'offer-1', 'auth-admin')
    expect(result.ok).toBe(true)
  })

  it('Secretary sees Agent A\'s offer to Contact X, per the existing secretary permission parity', async () => {
    const sb = mockTwoTable({ agentRow: { id: 'secretary-1', role: 'secretary', active: true }, offerRow: OFFER_TO_CONTACT_X })
    const result = await verifyOfferOwnership(sb, 'offer-1', 'auth-secretary')
    expect(result.ok).toBe(true)
  })
})
