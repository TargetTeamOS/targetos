// @vitest-environment jsdom
// Located under src/__tests__ (not src/pages/**) on purpose: validate.js CHECK 8
// flags any .jsx whose path contains "/pages/" and lacks a component export, so
// a test file anywhere under src/pages — including src/pages/__tests__ — would
// trip it. Keeping it here satisfies the check unchanged while Vitest's
// src/**/*.test.jsx glob still collects it.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Identity always comes from the authenticated session; mock it here.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, agent: { id: 'a1', role: 'admin', name: 'Moshe Klein' } }),
}))

import { DashboardCommandCenter } from '../pages/DashboardCommandCenter.jsx'
import { DashboardShell } from '../components/dashboard/DashboardShell.jsx'

afterEach(cleanup)

const renderPage = () => render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <DashboardCommandCenter />
  </MemoryRouter>
)

describe('DashboardShell states', () => {
  it.each(['loading', 'denied', 'error', 'empty'])('renders the %s state', (status) => {
    render(<DashboardShell status={status} />)
    expect(screen.getByTestId(`shell-${status}`)).toBeTruthy()
  })
  it('renders children when ready', () => {
    render(<DashboardShell status="ready"><div data-testid="child">hi</div></DashboardShell>)
    expect(screen.getByTestId('child')).toBeTruthy()
  })
})

describe('DashboardCommandCenter page', () => {
  it('renders the authenticated shell with all widgets', () => {
    renderPage()
    expect(screen.getByText('Command Center')).toBeTruthy()
    expect(screen.getByTestId('masonry')).toBeTruthy()
    expect(screen.getByText('My day')).toBeTruthy()
    expect(screen.getByText('Agent performance')).toBeTruthy()
    expect(screen.getByText('Custom widgets')).toBeTruthy()
  })

  it('greets the signed-in user by first name', () => {
    renderPage()
    expect(screen.getByText(/Welcome back, Moshe/)).toBeTruthy()
  })
})
