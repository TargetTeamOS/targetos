// DashboardGrid — a deliberate 12-column responsive grid. Cells declare a span per
// breakpoint; desktop uses the full 12 columns, tablet collapses to a 12-col grid
// where most cards become halves/full, and mobile is a single clean column. All
// cells set min-width:0 to prevent horizontal overflow.

import { useState, useEffect } from 'react'

export function useBreakpoint() {
  const get = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440
    return w >= 1080 ? 'desktop' : w >= 680 ? 'tablet' : 'mobile'
  }
  const [bp, setBp] = useState(get)
  useEffect(() => {
    const on = () => setBp(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return bp
}

export function Grid12({ children, gap = 18 }) {
  const bp = useBreakpoint()
  return (
    <div data-testid="cc-grid" style={{
      display: 'grid', gap, alignItems: 'stretch',
      gridTemplateColumns: bp === 'mobile' ? 'minmax(0,1fr)' : 'repeat(12, minmax(0, 1fr))',
    }}>
      {children}
    </div>
  )
}

// span: { desktop, tablet, mobile } in 1..12 (mobile ignored — always full column)
export function Cell({ span = {}, children }) {
  const bp = useBreakpoint()
  const s = bp === 'desktop' ? (span.desktop || 12) : bp === 'tablet' ? (span.tablet || 12) : 12
  const style = bp === 'mobile' ? { minWidth: 0 } : { gridColumn: 'span ' + s, minWidth: 0 }
  return <div style={style}>{children}</div>
}

export default Grid12
