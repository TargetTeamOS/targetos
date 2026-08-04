// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const rpc = vi.fn()
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

import { MyWidgetsSection } from './MyWidgetsSection.jsx'

const wrap = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <MyWidgetsSection />
  </MemoryRouter>
)

beforeEach(() => rpc.mockReset())
afterEach(cleanup)

describe('MyWidgetsSection (per-agent, self-scoped)', () => {
  it('shows a graceful state when the A9 backend is not deployed yet', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Could not find function app_user_widgets_get in schema cache' } })
    wrap()
    await waitFor(() => expect(screen.getByText(/coming with the next update/i)).toBeTruthy())
    // no "Add widget" affordance until deployed
    expect(screen.queryByText('+ Add widget')).toBeNull()
  })

  it("renders the agent's own widget values", async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'w1', title: 'My deals', metric: 'my_accepted_offers', display_type: 'kpi', date_range: 'ytd', position: 0, value: 7 }], error: null })
    wrap()
    await waitFor(() => expect(screen.getByText('My deals')).toBeTruthy())
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('+ Add widget')).toBeTruthy()
  })

  it('saves a new widget WITHOUT sending any agent id (server self-scopes)', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })              // initial get (empty)
    wrap()
    await waitFor(() => expect(screen.getByText('+ Add widget')).toBeTruthy())
    fireEvent.click(screen.getByText('+ Add widget'))
    rpc.mockResolvedValueOnce({ data: { ok: true, id: 'w2' }, error: null }) // save
    rpc.mockResolvedValueOnce({ data: [], error: null })              // reload get
    fireEvent.click(screen.getByText('Add widget'))
    await waitFor(() => {
      const saveCall = rpc.mock.calls.find((c) => c[0] === 'app_user_widget_save')
      expect(saveCall).toBeTruthy()
      const payload = saveCall[1].p
      // payload carries only presentation choices — never an agent/owner id
      expect(payload.metric).toBe('my_accepted_offers')
      expect('agent_id' in payload).toBe(false)
      expect('owner' in payload).toBe(false)
      expect('owner_auth_uid' in payload).toBe(false)
    })
  })
})
