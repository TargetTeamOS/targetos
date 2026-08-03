// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({ current: { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.current }))
const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { CustomWidgetsSection } from './CustomWidgetsSection.jsx'
import { validateForm, toEngineConfig, newWidgetForm } from '../../lib/widgetModel.js'

const wrap = (ui) => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>)
afterEach(() => { cleanup(); rpc.mockReset(); authState.current = { user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe' } } })

describe('widgetModel', () => {
  it('enforces the metric/field allowlist rules', () => {
    expect(validateForm({ ...newWidgetForm(), title: 'X', metric: 'count', field: 'gci' })).toContain('Count widgets must not set a field.')
    expect(validateForm({ ...newWidgetForm(), title: 'X', metric: 'sum', field: '' })).toContain('Sum and average need an approved field.')
    expect(validateForm({ ...newWidgetForm(), title: '', metric: 'count' })).toContain('Title is required.')
    expect(validateForm({ ...newWidgetForm(), title: 'X', metric: 'count' })).toEqual([])
  })
  it('emits only allowlisted keys with normalised positions', () => {
    const cfg = toEngineConfig([{ ...newWidgetForm(), title: 'Closed', metric: 'sum', field: 'production', format: 'full_currency', display_type: 'bar_chart', icon: '🔥' }])
    expect(cfg[0]).not.toHaveProperty('display_type')
    expect(cfg[0]).not.toHaveProperty('icon')
    expect(cfg[0]).toMatchObject({ position: 0, title: 'Closed', metric: 'sum', field: 'production', scope: 'team' })
  })
})

describe('CustomWidgetsSection — engine not deployed', () => {
  it('shows setup-required and a sample gallery, and disables saving in the builder', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.app_production_widget_values' } })
    wrap(<CustomWidgetsSection />)
    expect(await screen.findByText(/Secure widget engine setup required/)).toBeTruthy()
    fireEvent.click(screen.getByText(/Design a widget/))
    // builder opens; Add button is disabled until the engine is applied
    const addBtn = await screen.findByText('Add widget')
    expect(addBtn.disabled).toBe(true)
    expect(addBtn.getAttribute('title')).toBe('Secure widget engine setup required')
  })
})

describe('CustomWidgetsSection — engine deployed', () => {
  it('lists live widget values and saves a new widget through the validated RPC', async () => {
    rpc.mockImplementation(async (fn) => {
      if (fn === 'app_production_widget_values') return { data: [{ id: 'w1', title: 'Closed deals', subtitle: 'This year', color: '#0073EA', display_format: 'whole', metric: 'count', value: 128 }], error: null }
      if (fn === 'app_get_production_widgets') return { data: [{ id: 'w1', position: 0, title: 'Closed deals', subtitle: 'This year', metric: 'count', filters: {}, date_mode: 'current_year', date_field: 'close_date', format: 'whole', color: '#0073EA', visible: true, scope: 'team' }], error: null }
      if (fn === 'app_save_production_widgets') return { data: { ok: true, count: 2 }, error: null }
      return { data: null, error: null }
    })
    wrap(<CustomWidgetsSection />)
    expect(await screen.findByText('Closed deals')).toBeTruthy()
    expect(screen.getByText('128')).toBeTruthy()

    fireEvent.click(screen.getByText('+ New widget'))
    fireEvent.change(await screen.findByPlaceholderText('Closed deals'), { target: { value: 'New KPI' } })
    fireEvent.click(screen.getByText('Add widget'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('app_save_production_widgets', expect.objectContaining({ config: expect.any(Array) })))
    const call = rpc.mock.calls.find((c) => c[0] === 'app_save_production_widgets')
    expect(call[1].config.some((w) => w.title === 'New KPI')).toBe(true)
  })
})
