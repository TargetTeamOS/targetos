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
import { fmtMetric, rankBy, metricDef } from '../../lib/perfModel.js'

const ADMIN_ROWS = [
  { agent_id: 'a1', name: 'Shmuel Ganz', color: '#00C875', accepted_offers: 5, closed_units: 3, production_volume: 1500000, buyers: 2, listings: 1, gci: 42000 },
  { agent_id: 'a2', name: 'Toivy Steiner', color: '#0073EA', accepted_offers: 8, closed_units: 6, production_volume: 3200000, buyers: 4, listings: 2, gci: 91000 },
]
const AGENT_ROWS = ADMIN_ROWS.map(({ gci, ...r }) => ({ ...r, gci: null }))

const wrap = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DashboardDataProvider>{ui}</DashboardDataProvider></MemoryRouter>)
afterEach(() => { cleanup(); rpc.mockReset(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } })

describe('perfModel', () => {
  it('formats currency vs counts and ranks by a metric', () => {
    expect(fmtMetric(3200000, metricDef('production_volume'))).toBe('$3.20M')
    expect(fmtMetric(6, metricDef('closed_units'))).toBe('6')
    expect(fmtMetric(null, metricDef('gci'))).toBe('—')
    expect(rankBy(ADMIN_ROWS, 'closed_units')[0].name).toBe('Toivy Steiner')
  })
})

describe('AgentPerformanceWidget', () => {
  it('renders a ranked leaderboard from RPC data', async () => {
    rpc.mockResolvedValue({ data: ADMIN_ROWS, error: null })
    wrap(<AgentPerformanceWidget />)
    // ranked by closed_units desc → Toivy first
    expect(await screen.findByText('Toivy Steiner')).toBeTruthy()
    expect(screen.getByText('Shmuel Ganz')).toBeTruthy()
  })

  it('shows GCI for admins but not for agents', async () => {
    // admin: gci present → choosing metrics can surface it; agent: gci null → never shown
    authState.current = { user: { id: 'u2' }, agent: { id: 'a9', role: 'agent', name: 'Agent A' } }
    rpc.mockResolvedValue({ data: AGENT_ROWS, error: null })
    wrap(<AgentPerformanceWidget />)
    await screen.findByText('Toivy Steiner')
    expect(screen.queryByText('$91K')).toBeNull()      // no gci value
    expect(screen.queryByText('Choose metrics')).toBeNull() // metric picker is admin-only
  })

  it('drills a metric cell to the exact deals', async () => {
    rpc.mockImplementation(async (fn) => {
      if (fn === 'app_agent_performance') return { data: ADMIN_ROWS, error: null }
      if (fn === 'app_agent_records') return { data: [{ id: 'd1', type: 'deal', label: '9 Lake Rd', secondary: 'Jul 10, 2026', status: 'Closed' }], error: null }
      return { data: null, error: null }
    })
    wrap(<AgentPerformanceWidget />)
    await screen.findByText('Toivy Steiner')
    fireEvent.click(screen.getAllByText('6')[0]) // Toivy closed_units cell
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('9 Lake Rd')).toBeTruthy()
  })

  it('shows setup-required when the RPC is not deployed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.app_agent_performance' } })
    wrap(<AgentPerformanceWidget />)
    expect(await screen.findByText(/Data source awaiting secure setup/)).toBeTruthy()
    expect(screen.queryByText('Toivy Steiner')).toBeNull()
  })
})
