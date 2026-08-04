// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { DashboardDataProvider } from '../../lib/useDashboardData'
import { AgentPerformanceWidget } from './AgentPerformanceWidget.jsx'

const PERF = [
  { agent_id: 'A', name: 'Agent A', color: '#0073EA', accepted_offers: 30 },
  { agent_id: 'B', name: 'Agent B', color: '#00C875', accepted_offers: 24 },
  { agent_id: 'C', name: 'Agent C', color: '#A25DDC', accepted_offers: 12 },
]
const GOALS = [
  { id: 'g1', scope: 'individual', agent_id: 'A', goal_basis: 'accepted_offers', target: 60, end_date: '2026-12-31' },
  { id: 'g2', scope: 'individual', agent_id: 'B', goal_basis: 'accepted_offers', target: 40, end_date: '2026-12-31' },
]

function mockRpc() {
  rpc.mockImplementation(async (fn) => {
    if (fn === 'app_agent_performance') return { data: PERF, error: null }
    if (fn === 'app_goals_list') return { data: GOALS, error: null }
    if (fn === 'app_agent_records') return { data: [{ id: 'd1', type: 'deal', label: '9 Lake Rd', secondary: 'Aug 3', status: 'Offer accepted' }], error: null }
    return { data: null, error: null }
  })
}

const wrap = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DashboardDataProvider>{ui}</DashboardDataProvider></MemoryRouter>)
afterEach(() => { cleanup(); rpc.mockReset(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } })

describe('AgentPerformanceWidget — goal-based leaderboard', () => {
  it('ranks by percentage of individual goal (B 60% ranks above A 50%)', async () => {
    mockRpc()
    wrap(<AgentPerformanceWidget />)
    expect(await screen.findByText('Agent B')).toBeTruthy()
    expect(screen.getByText('60%')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    // B's row should appear before A's row in DOM order
    const html = document.body.innerHTML
    expect(html.indexOf('Agent B')).toBeLessThan(html.indexOf('Agent A'))
  })

  it('shows "No goal set" for an agent without a matching goal', async () => {
    mockRpc()
    wrap(<AgentPerformanceWidget />)
    await screen.findByText('Agent C')
    expect(screen.getByText('No goal set')).toBeTruthy()
  })

  it('drills to the exact deals when a row is clicked', async () => {
    mockRpc()
    wrap(<AgentPerformanceWidget />)
    fireEvent.click(await screen.findByText('Agent B'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('9 Lake Rd')).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('app_agent_records', expect.objectContaining({ p_agent_id: 'B', p_basis: 'accepted_offers' }))
  })
})
