// DashboardGrid — the controlled responsive grid that replaces the masonry.
// Fixed named regions so every widget lands in its intended place and keeps its
// size across breakpoints. No CSS files/Tailwind here, so the layout is computed
// from width (same approach as useColumns) and applied via grid-template-areas.
//
// Regions: rates · news · goal · frontrunner (compact top row)
//          myday (large main) · goalside (year/agent goal progress)
//          agents (full width) · custom (full width)

import { useState, useEffect } from 'react'

export function useBreakpoint() {
  const get = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280
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

const AREAS = {
  desktop: [
    '"rates news goal frontrunner"',
    '"myday myday myday goalside"',
    '"agents agents agents agents"',
    '"custom custom custom custom"',
  ].join(' '),
  tablet: [
    '"rates news"',
    '"goal frontrunner"',
    '"myday myday"',
    '"goalside goalside"',
    '"agents agents"',
    '"custom custom"',
  ].join(' '),
  mobile: [
    '"rates"', '"news"', '"goal"', '"frontrunner"',
    '"myday"', '"goalside"', '"agents"', '"custom"',
  ].join(' '),
}

const COLS = { desktop: 'repeat(4, minmax(0, 1fr))', tablet: 'repeat(2, minmax(0, 1fr))', mobile: 'minmax(0, 1fr)' }

export function DashboardGrid({ children }) {
  const bp = useBreakpoint()
  return (
    <div data-testid="cc-grid" style={{
      display: 'grid', gap: 16, alignItems: 'start',
      gridTemplateColumns: COLS[bp], gridTemplateAreas: AREAS[bp],
    }}>
      {children}
    </div>
  )
}

// Region wrapper — assigns a child to a named grid area. minWidth:0 prevents
// wide content (tables) from forcing horizontal overflow.
export function Region({ area, children }) {
  return <div style={{ gridArea: area, minWidth: 0 }}>{children}</div>
}

export default DashboardGrid
