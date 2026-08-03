// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { DrillDown } from './DrillDown.jsx'

afterEach(cleanup)

const rows = [
  { id: 'd1', type: 'deal', label: '123 Main St', secondary: 'Buyer side', status: 'Accepted' },
  { id: 'c9', type: 'contact', label: 'Jane Doe' },
]

describe('DrillDown', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DrillDown open={false} />)
    expect(container.querySelector('[data-testid="drill-panel"]')).toBeNull()
  })

  it('renders rows, title and source/date/count chips', () => {
    render(<DrillDown open title="Accepted offers" sourceLabel="v_deals_canonical"
      dateRangeLabel="Year to date" recordCount={2} rows={rows} onNavigate={() => {}} isMobile={false} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Accepted offers')).toBeTruthy()
    expect(screen.getByText('Source: v_deals_canonical')).toBeTruthy()
    expect(screen.getAllByTestId('drill-row').length).toBe(2)
  })

  it('shows the empty state', () => {
    render(<DrillDown open title="x" rows={[]} isMobile={false} />)
    expect(screen.getByTestId('drill-empty')).toBeTruthy()
  })

  it('shows the error state and retries', () => {
    const onRetry = vi.fn()
    render(<DrillDown open title="x" error={new Error('boom')} onRetry={onRetry} isMobile={false} />)
    expect(screen.getByTestId('drill-error')).toBeTruthy()
    fireEvent.click(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and via the close button', () => {
    const onClose = vi.fn()
    render(<DrillDown open title="x" rows={[]} onClose={onClose} isMobile={false} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('deep-links to the record route on row click, then closes', () => {
    const onNavigate = vi.fn()
    const onClose = vi.fn()
    render(<DrillDown open title="x" rows={rows} onNavigate={onNavigate} onClose={onClose} isMobile={false} />)
    fireEvent.click(screen.getAllByTestId('drill-row')[0])
    expect(onNavigate).toHaveBeenCalledWith('/production/d1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog on open and restores it on close', () => {
    const Wrapper = ({ open }) => (
      <>
        <button data-testid="opener">open</button>
        <DrillDown open={open} title="x" rows={[]} onClose={() => {}} isMobile={false} />
      </>
    )
    const { rerender } = render(<Wrapper open={false} />)
    const opener = screen.getByTestId('opener')
    act(() => opener.focus())
    expect(document.activeElement).toBe(opener)

    rerender(<Wrapper open />)
    expect(document.activeElement).toBe(screen.getByLabelText('Close'))

    rerender(<Wrapper open={false} />)
    expect(document.activeElement).toBe(opener)
  })

  it('traps Tab focus within the dialog', () => {
    render(<DrillDown open title="x" rows={rows} onNavigate={() => {}} isMobile={false} />)
    const dialog = screen.getByRole('dialog')
    const focusables = dialog.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')
    const last = focusables[focusables.length - 1]
    act(() => last.focus())
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(focusables[0]) // wraps to first
  })

  it('supports arrow-key navigation between rows', () => {
    render(<DrillDown open title="x" rows={rows} onNavigate={() => {}} isMobile={false} />)
    const list = screen.getByRole('list')
    const items = screen.getAllByTestId('drill-row')
    act(() => items[0].focus())
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
  })
})
