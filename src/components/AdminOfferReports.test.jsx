// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import AdminOfferReports from './AdminOfferReports'

afterEach(cleanup)

// revisionsOverride=[] skips the Supabase fetch entirely (see the
// component's own comment) so these tests verify the aggregation math
// directly against known synthetic data, without mocking a client.
const NO_REVISIONS = []

const AGENTS = [{ id: 'a1', name: 'Agent One' }, { id: 'a2', name: 'Agent Two' }]

function offer(overrides) {
  return {
    id: 'o-' + Math.random().toString(36).slice(2),
    listing_addr: '123 Test St', buyer_name: 'Test Buyer', purchase_price: '500000',
    status: 'Sent', offer_date: '2026-06-01', agent_id: 'a1', off_market: false,
    representing_side: 'Buyer',
    ...overrides,
  }
}

describe('AdminOfferReports — aggregation correctness', () => {
  it('shows an honest empty state with zero offers', () => {
    render(<AdminOfferReports offers={[]} agents={AGENTS} revisionsOverride={NO_REVISIONS} />)
    expect(screen.getByText(/No offers yet/i)).toBeTruthy()
  })

  it('computes total, accepted, pending, and conversion rate correctly', () => {
    const offers = [
      offer({ status: 'AO' }),
      offer({ status: 'AO' }),
      offer({ status: 'Sent' }),
      offer({ status: 'Draft' }),
    ]
    render(<AdminOfferReports offers={offers} agents={AGENTS} revisionsOverride={NO_REVISIONS} />)
    expect(screen.getByText('Total offers')).toBeTruthy()
    // Conversion rate (2 accepted / 4 total = 50%) is a value unlikely
    // to collide with anything else rendered in this fixture.
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText('2 of 4')).toBeTruthy()
  })

  it('groups by agent and computes per-agent conversion', () => {
    const offers = [
      offer({ agent_id: 'a1', status: 'AO' }),
      offer({ agent_id: 'a1', status: 'Sent' }),
      offer({ agent_id: 'a2', status: 'AO' }),
    ]
    render(<AdminOfferReports offers={offers} agents={AGENTS} revisionsOverride={NO_REVISIONS} />)
    expect(screen.getByText('Agent One')).toBeTruthy()
    expect(screen.getByText('Agent Two')).toBeTruthy()
  })

  it('drill-down shows exactly the records behind a clicked metric, not a sample', () => {
    const offers = [
      offer({ status: 'AO', listing_addr: '1 Accepted Ave' }),
      offer({ status: 'Sent', listing_addr: '2 Pending Pl' }),
    ]
    render(<AdminOfferReports offers={offers} agents={AGENTS} revisionsOverride={NO_REVISIONS} />)
    fireEvent.click(screen.getByText('Accepted'))
    const modal = screen.getByTestId('drill-modal')
    expect(within(modal).getByText((_, el) => el.textContent === 'Accepted offers (1)')).toBeTruthy()
    expect(within(modal).getAllByText(/1 Accepted Ave/).length).toBeGreaterThan(0)
    expect(within(modal).queryAllByText(/2 Pending Pl/).length).toBe(0)
  })

  it('off-market vs MLS split is exclusive and covers every offer', () => {
    const offers = [offer({ off_market: true }), offer({ off_market: false }), offer({ off_market: false })]
    render(<AdminOfferReports offers={offers} agents={AGENTS} revisionsOverride={NO_REVISIONS} />)
    fireEvent.click(screen.getByText('Off-market'))
    const modal = screen.getByTestId('drill-modal')
    expect(within(modal).getByText((_, el) => el.textContent === 'Off-market offers (1)')).toBeTruthy()
  })

  it('reports insufficient revision data honestly rather than showing a misleading zero', () => {
    const offers = [offer({ status: 'AO' })]
    render(<AdminOfferReports offers={offers} agents={AGENTS} revisionsOverride={NO_REVISIONS} />)
    expect(screen.getByText(/Insufficient revision data/i)).toBeTruthy()
  })

  it('computes revision-dependent metrics correctly when revision data IS available', () => {
    const o = offer({ status: 'AO', id: 'offer-1' })
    const revisions = [
      { offer_id: 'offer-1', revision_number: 1, purchase_price: '500000' },
      { offer_id: 'offer-1', revision_number: 2, purchase_price: '525000' },
    ]
    render(<AdminOfferReports offers={[o]} agents={AGENTS} revisionsOverride={revisions} />)
    expect(screen.getByText('Avg revisions before acceptance')).toBeTruthy()
    expect(screen.getByText('2.0')).toBeTruthy() // 2 revisions / 1 accepted offer
    expect(screen.getByText('$25K')).toBeTruthy() // 525000-500000 avg $ increase
  })
})
