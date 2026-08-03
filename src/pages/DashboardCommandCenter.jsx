// DashboardCommandCenter — the Command Center page. One masonry of self-contained
// widgets, each with its own data, drill-downs and setup/empty/error states. The
// existing Smart Dashboard at "/" is untouched; this lives at its own route
// (/dashboard/command-center).

import { useAuth } from '../context/AuthContext'
import { DashboardDataProvider, useDashboardData } from '../lib/useDashboardData'
import { DATE_PRESETS } from '../lib/dashboardData'
import { DashboardShell, MasonryGrid } from '../components/dashboard/DashboardShell'
import { MarketRatesWidget } from '../components/dashboard/MarketRatesWidget'
import { NewsWidget } from '../components/dashboard/NewsWidget'
import { GoalsSection } from '../components/dashboard/GoalsSection'
import { MyDayWidget } from '../components/dashboard/MyDayWidget'
import { AgentPerformanceWidget } from '../components/dashboard/AgentPerformanceWidget'
import { CustomWidgetsSection } from '../components/dashboard/CustomWidgetsSection'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

function DateRangePicker() {
  const { preset, setPreset } = useDashboardData()
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
      <span>Range</span>
      <select
        value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Date range"
        style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: FF, fontSize: 13, background: '#fff' }}
      >
        {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
  )
}

function CommandCenterInner() {
  const { agent } = useAuth()
  const firstName = (agent?.name || '').split(' ')[0]
  const welcome = firstName ? 'Welcome back, ' + firstName + '. Your team at a glance.' : 'Your team at a glance.'

  return (
    <div style={{ fontFamily: FF, padding: '18px 20px 40px', maxWidth: 1280, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Command Center</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{welcome}</p>
        </div>
        <DateRangePicker />
      </header>

      <DashboardShell status="ready">
        <MasonryGrid>
          <MarketRatesWidget />
          <NewsWidget />
          <GoalsSection />
          <MyDayWidget />
          <AgentPerformanceWidget />
          <CustomWidgetsSection />
        </MasonryGrid>
      </DashboardShell>
    </div>
  )
}

export function DashboardCommandCenter() {
  return (
    <DashboardDataProvider>
      <CommandCenterInner />
    </DashboardDataProvider>
  )
}

export default DashboardCommandCenter
