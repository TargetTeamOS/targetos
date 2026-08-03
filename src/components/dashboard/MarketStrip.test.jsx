// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(async () => ({ data: [], error: null })) } }))

import { DashboardDataProvider } from '../../lib/useDashboardData'
import { MarketRatesWidget } from './MarketRatesWidget.jsx'
import { NewsWidget } from './NewsWidget.jsx'

const RATES_OK = {
  rates: { rate30: 6.75, rate30_prev: 6.70, rate15: 5.95, change: 0.05, direction: 'up', rate30_date: '2026-07-31',
    history: [{ date: '2026-07-17', value: 6.8 }, { date: '2026-07-24', value: 6.7 }, { date: '2026-07-31', value: 6.75 }],
    source: 'Freddie Mac PMMS via FRED' },
  news: [], fetched_at: '2026-08-01T00:00:00Z',
}
const NEWS_OK = {
  rates: { error: 'unavailable', rate30: null, history: [] },
  news: [{ title: 'Rockland rezoning approved', link: 'https://example.com/a', source: 'Rockland News', category: 'zoning', pubDate: '2026-08-01T10:00:00Z', summary: 'Short summary.' }],
  fetched_at: '2026-08-01T00:00:00Z',
}

const mockFetch = (payload, ok = true) => { global.fetch = vi.fn(async () => ({ ok, json: async () => payload })) }
const wrap = (ui) => render(<DashboardDataProvider>{ui}</DashboardDataProvider>)

afterEach(() => { cleanup(); vi.restoreAllMocks(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } })

describe('MarketRatesWidget', () => {
  it('renders the rate, direction (word, not color) and the disclaimer', async () => {
    mockFetch(RATES_OK)
    wrap(<MarketRatesWidget />)
    expect(await screen.findByText('6.75%')).toBeTruthy()
    expect(screen.getByText(/up/)).toBeTruthy()
    expect(screen.getByText(/not individual borrower quotes/)).toBeTruthy()
  })
  it('shows an unavailable state (never a crash) when rates are missing', async () => {
    mockFetch({ rates: { error: 'unavailable', rate30: null, history: [] }, news: [], fetched_at: 'x' })
    wrap(<MarketRatesWidget />)
    expect(await screen.findByTestId('widget-empty')).toBeTruthy()
  })
  it('isolates a failed request into an error state', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network') })
    wrap(<MarketRatesWidget />)
    expect(await screen.findByTestId('widget-error')).toBeTruthy()
  })
  it('opens the rate-history drill-down with one row per week', async () => {
    mockFetch(RATES_OK)
    wrap(<MarketRatesWidget />)
    await screen.findByText('6.75%')
    fireEvent.click(screen.getByText('Rate history & source'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getAllByTestId('drill-row').length).toBe(3)
  })
})

describe('NewsWidget', () => {
  it('renders headlines as external links with source, date and category', async () => {
    mockFetch(NEWS_OK)
    wrap(<NewsWidget />)
    const link = await screen.findByText('Rockland rezoning approved')
    expect(link.getAttribute('href')).toBe('https://example.com/a')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(screen.getByText('Zoning')).toBeTruthy()
    expect(screen.getByText('Rockland News')).toBeTruthy()
  })
  it('shows Manage sources to admins', async () => {
    mockFetch(NEWS_OK)
    wrap(<NewsWidget />)
    await screen.findByText('Rockland rezoning approved')
    expect(screen.getByText('Manage sources')).toBeTruthy()
  })
  it('hides Manage sources from non-admins', async () => {
    authState.current = { user: { id: 'u2' }, agent: { id: 'a2', role: 'agent', name: 'Agent A' } }
    mockFetch(NEWS_OK)
    wrap(<NewsWidget />)
    await screen.findByText('Rockland rezoning approved')
    expect(screen.queryByText('Manage sources')).toBeNull()
  })
})
