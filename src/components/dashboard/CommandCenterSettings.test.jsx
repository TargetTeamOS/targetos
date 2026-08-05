// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { CommandCenterSettings } from './CommandCenterSettings.jsx'

const ds = () => ({ settings: {}, deployed: false, loading: false, save: vi.fn(), reload: vi.fn() })
afterEach(() => { cleanup(); rpc.mockReset() })

describe('CommandCenterSettings', () => {
  it('shows the A8-not-deployed notice but still offers real goal + news controls', () => {
    render(<CommandCenterSettings open onClose={() => {}} ds={ds()} />)
    expect(screen.getByText(/Settings store not deployed/)).toBeTruthy()
    expect(screen.getByText('Monthly team goal')).toBeTruthy()
    expect(screen.getByText('Yearly team goal')).toBeTruthy()
    expect(screen.getByText('Manage news sources')).toBeTruthy()
  })

  it('saves a monthly team goal through app_goal_upsert with the right shape', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    render(<CommandCenterSettings open onClose={() => {}} ds={ds()} />)
    // the monthly goal target input is the first number field
    const nums = document.querySelectorAll('input[type="number"]')
    fireEvent.change(nums[0], { target: { value: '12' } })
    fireEvent.click(screen.getByText('Save monthly team goal'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('app_goal_upsert', expect.objectContaining({
      p: expect.objectContaining({ goal_basis: 'accepted_offers', period: 'monthly', scope: 'team', target: 12 }),
    })))
  })

  it('mounts closed then opens without a hooks-order crash (React #310 guard)', () => {
    const d = ds()
    const { rerender } = render(<CommandCenterSettings open={false} onClose={() => {}} ds={d} />)
    expect(screen.queryByText('Monthly team goal')).toBeNull()
    rerender(<CommandCenterSettings open onClose={() => {}} ds={d} />)
    expect(screen.getByText('Monthly team goal')).toBeTruthy()
  })
})
