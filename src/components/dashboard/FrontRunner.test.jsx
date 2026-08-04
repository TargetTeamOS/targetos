// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { DashboardDataProvider } from '../../lib/useDashboardData'
import { FrontRunnerWidget } from './FrontRunnerWidget.jsx'

const wrap = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DashboardDataProvider>{ui}</DashboardDataProvider></MemoryRouter>)
afterEach(() => { cleanup(); rpc.mockReset(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } })

describe('FrontRunnerWidget', () => {
  it('picks the agent with the most accepted offers and drills to those offers', async () => {
    rpc.mockImplementation(async (fn) => {
      if (fn === 'app_agent_performance') return { data: [
        { agent_id: 'a1', name: 'Shmuel Ganz', color: '#00C875', accepted_offers: 5 },
        { agent_id: 'a2', name: 'Toivy Steiner', color: '#0073EA', accepted_offers: 9 },
      ], error: null }
      if (fn === 'app_goals_list') return { data: [{ scope: 'individual', agent_id: 'a2', goal_basis: 'accepted_offers', target: 12, end_date: '2026-12-31' }], error: null }
      if (fn === 'app_agent_records') return { data: [{ id: 'd1', type: 'deal', label: '9 Lake Rd', secondary: 'Aug 3', status: 'Offer accepted' }], error: null }
      return { data: null, error: null }
    })
    wrap(<FrontRunnerWidget settings={{}} />)
    expect(await screen.findByText('Toivy Steiner')).toBeTruthy()
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy() // 9 of 12 goal
    fireEvent.click(screen.getByText('9'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('9 Lake Rd')).toBeTruthy()
  })

  it('handles ties by showing all tied agents', async () => {
    rpc.mockResolvedValue({ data: [
      { agent_id: 'a1', name: 'Eliezer Biner', color: '#00C875', accepted_offers: 4 },
      { agent_id: 'a2', name: 'Shloime Tessler', color: '#0073EA', accepted_offers: 4 },
    ], error: null })
    wrap(<FrontRunnerWidget settings={{}} />)
    expect(await screen.findByText(/Tie: Eliezer Biner & Shloime Tessler/)).toBeTruthy()
  })

  it('does NOT render any settings inputs inside the card (presentation-only)', async () => {
    rpc.mockResolvedValue({ data: [{ agent_id: 'a1', name: 'Winner', color: '#00C875', accepted_offers: 4 }], error: null })
    wrap(<FrontRunnerWidget settings={{ message: 'Great job' }} />)
    await screen.findByText('Winner')
    // no text inputs / checkboxes leaked into the dashboard card
    expect(document.querySelectorAll('input').length).toBe(0)
    expect(screen.queryByPlaceholderText(/Image URL/i)).toBeNull()
    expect(screen.getByText('Great job')).toBeTruthy() // admin message still displayed
  })
})
