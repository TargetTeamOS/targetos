// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { DashboardDataProvider } from '../../lib/useDashboardData'
import { GoalWidget } from './GoalWidget.jsx'
import { GoalsSection } from './GoalsSection.jsx'

// a fully-elapsed window (its period is over, regardless of "today") -- for
// asserting the 'expired' status, distinct from a goal that's merely behind
const elapsedGoal = (actual, target = 10, extra = {}) => ({
  id: 'g1', title: 'Team accepted offers', goal_basis: 'accepted_offers', period: 'monthly',
  target, actual, start_date: '2026-01-01', end_date: '2026-06-30', scope: 'team', ...extra,
})

// a window still running right now (10 days in, 10 days left of a 20-day
// span), computed relative to the real clock so it stays "in progress"
// regardless of when the test runs -- for asserting pace status
const iso = (d) => d.toISOString().slice(0, 10)
const ongoingGoal = (actual, target = 10, extra = {}) => {
  const now = new Date()
  const start = new Date(now); start.setDate(start.getDate() - 10)
  const end = new Date(now); end.setDate(end.getDate() + 10)
  return {
    id: 'g1', title: 'Team accepted offers', goal_basis: 'accepted_offers', period: 'monthly',
    target, actual, start_date: iso(start), end_date: iso(end), scope: 'team', ...extra,
  }
}

const router = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>)
const withProvider = (ui) => router(<DashboardDataProvider>{ui}</DashboardDataProvider>)

afterEach(() => { cleanup(); rpc.mockReset(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } })

describe('GoalWidget', () => {
  it('shows the authoritative actual, percentage and a worded status', () => {
    router(<GoalWidget goal={ongoingGoal(4, 10)} />)
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('40% complete')).toBeTruthy()
    expect(screen.getByText(/Behind pace/)).toBeTruthy()
  })

  it('marks a goal whose window has fully elapsed as ended, not behind', () => {
    // FIX (Oct 2026 design review): this used to also read "Behind pace" --
    // confusing for a goal whose period ended long ago (e.g. last month's
    // team goal, still shown because no one made a new one yet) and reads
    // as a live, actionable shortfall instead of a closed-out period.
    router(<GoalWidget goal={elapsedGoal(4, 10)} />)
    expect(screen.getByText(/Period ended/)).toBeTruthy()
    expect(screen.queryByText(/Behind pace/)).toBeNull()
  })

  it('marks a met goal complete', () => {
    router(<GoalWidget goal={elapsedGoal(10, 10)} />)
    expect(screen.getByText(/Goal reached/)).toBeTruthy()
  })

  it('opens the records drill and lists the exact deals', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'd1', type: 'deal', label: '123 Main St', secondary: 'Mar 03, 2026', status: 'Offer Accepted' }], error: null })
    router(<GoalWidget goal={elapsedGoal(4, 10)} />)
    fireEvent.click(screen.getByText('View records'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(await screen.findByText('123 Main St')).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('app_goal_records', { p_goal_id: 'g1' })
  })

  it('degrades gracefully when the records RPC is not deployed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function public.app_goal_records(p_goal_id) in the schema cache' } })
    router(<GoalWidget goal={elapsedGoal(4, 10)} />)
    fireEvent.click(screen.getByText('View records'))
    expect(await screen.findByTestId('drill-error')).toBeTruthy()
    expect(screen.getByText(/isn’t deployed yet/)).toBeTruthy()
  })
})

describe('GoalsSection', () => {
  it('renders a card per returned goal', async () => {
    rpc.mockResolvedValueOnce({ data: [elapsedGoal(4, 10, { id: 'gm', title: 'Monthly offers' }), elapsedGoal(30, 120, { id: 'gy', title: 'Yearly units', period: 'yearly', goal_basis: 'closed_units' })], error: null })
    withProvider(<GoalsSection />)
    expect(await screen.findByText('Monthly offers')).toBeTruthy()
    expect(await screen.findByText('Yearly units')).toBeTruthy()
  })

  it('shows an admin empty state when there are no goals', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    withProvider(<GoalsSection />)
    expect(await screen.findByText(/No goals are set up yet/)).toBeTruthy()
  })
})
