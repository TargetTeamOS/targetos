// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'agent', name: 'Agent A' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { DashboardDataProvider } from '../../lib/useDashboardData'
import { MyDayWidget } from './MyDayWidget.jsx'

const PAYLOAD = (caps = { complete: true, reschedule: true, add_note: true, create_followup: true }) => ({
  agent_id: 'a1',
  tasks_due_today: [{ id: 't1', type: 'task', label: 'Call the seller', secondary: 'Due today', status: 'high' }],
  tasks_overdue: [{ id: 't2', type: 'task', label: 'Send disclosures', secondary: 'Overdue', status: 'normal' }],
  tasks_completed_today: [], appointments_today: [{ id: 'e1', type: 'appointment', label: 'Showing 12 Oak', secondary: '3:00 PM' }],
  appointments_upcoming: [], followups_due_today: [{ id: 'c1', type: 'contact', label: 'Dana Roth', secondary: 'Follow-up due today' }],
  followups_overdue: [], reminders: [], capabilities: caps,
})

const wrap = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DashboardDataProvider>{ui}</DashboardDataProvider></MemoryRouter>)
afterEach(() => { cleanup(); rpc.mockReset(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'agent', name: 'Agent A' } } })

describe('MyDayWidget — deployed', () => {
  it('renders real rows and completes a task through the secure RPC', async () => {
    rpc.mockResolvedValue({ data: PAYLOAD(), error: null })
    wrap(<MyDayWidget />)
    expect(await screen.findByText('Call the seller')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Complete')[0])
    expect(rpc).toHaveBeenCalledWith('app_task_complete', { p_task_id: 't1' })
  })

  it('opens a bucket drill with only the user’s records', async () => {
    rpc.mockResolvedValue({ data: PAYLOAD(), error: null })
    wrap(<MyDayWidget />)
    await screen.findByText('Call the seller')
    fireEvent.click(screen.getByText('Appointments today'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Showing 12 Oak')).toBeTruthy()
    expect(within(dialog).getByText(/Only your own records/)).toBeTruthy()
  })

  it('disables quick actions when the write capability is off', async () => {
    rpc.mockResolvedValue({ data: PAYLOAD({ complete: false }), error: null })
    wrap(<MyDayWidget />)
    await screen.findByText('Call the seller')
    const btn = screen.getAllByText('Complete')[0]
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('title')).toBe('Secure action setup required')
  })
})

describe('MyDayWidget — not deployed', () => {
  it('shows the setup-required scaffold and never fabricates data', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.app_my_day in the schema cache' } })
    wrap(<MyDayWidget />)
    expect(await screen.findByText(/Secure My Day setup required/)).toBeTruthy()
    // full layout still present: bucket labels render with zero counts
    expect(screen.getByText('Tasks due today')).toBeTruthy()
    expect(screen.queryByText('Call the seller')).toBeNull()
  })
})
