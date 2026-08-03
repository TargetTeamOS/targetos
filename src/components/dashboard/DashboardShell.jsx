// DashboardShell — the page-level frame that renders one of the required
// states (loading, permission-denied, error, empty, ready) and, when ready,
// lays its children out in a compact masonry that lets cards keep their own
// natural height (no forced equal-height boxes). Kept presentational so each
// state is trivially testable in isolation.

import { useEffect, useState } from 'react'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

// Responsive column count for the masonry: 3 / 2 / 1 across desktop / tablet /
// mobile. CSS multi-column keeps cards at their content height automatically.
export function useColumns() {
  const read = () => {
    if (typeof window === 'undefined') return 3
    const w = window.innerWidth
    return w < 640 ? 1 : w < 1024 ? 2 : 3
  }
  const [cols, setCols] = useState(read)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const on = () => setCols(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return cols
}

function StateBlock({ testid, heading, body, action }) {
  return (
    <div data-testid={testid} role="status" style={{ padding: '48px 24px', textAlign: 'center', fontFamily: FF, color: '#475569' }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{heading}</p>
      {body && <p style={{ margin: '6px 0 0', fontSize: 14 }}>{body}</p>}
      {action}
    </div>
  )
}

export function MasonryGrid({ children }) {
  const cols = useColumns()
  return (
    <div data-testid="masonry" style={{ columnCount: cols, columnGap: 16 }}>
      {/* each direct child should set break-inside: avoid + margin-bottom */}
      {children}
    </div>
  )
}

export function DashboardShell({ status = 'ready', onRetry, children }) {
  if (status === 'loading') {
    return <StateBlock testid="shell-loading" heading="Loading your dashboard…" body="Pulling the latest from your team board." />
  }
  if (status === 'denied') {
    return <StateBlock testid="shell-denied" heading="You don’t have access to this dashboard" body="Ask an administrator if you think this is a mistake." />
  }
  if (status === 'error') {
    return (
      <StateBlock
        testid="shell-error" heading="Something went wrong loading the dashboard"
        body="This didn’t affect your data — you can try again."
        action={onRetry ? <button onClick={onRetry} style={{ marginTop: 14, padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: FF, fontSize: 14 }}>Try again</button> : null}
      />
    )
  }
  if (status === 'empty') {
    return <StateBlock testid="shell-empty" heading="Nothing to show here yet" body="As your team logs deals and tasks, this dashboard fills in." />
  }
  return <div data-testid="shell-ready">{children}</div>
}

export default DashboardShell
