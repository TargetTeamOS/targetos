// DashboardCommandCenter — full-width, 12-column Command Center.
//   Header:  title + date · range/refresh/last-updated/Settings (admin)
//   Row 1:   Mortgage(3) · Monthly Goal(3) · Yearly Goal(3) · Front Runner(3)
//   Row 2:   My Day(7) · Local & Market News(5)
//   Row 3:   Accepted Offers by Agent(6) · Production by Agent(6)
//   Row 4:   Agent Performance leaderboard(12)
//   Row 5:   Custom Widgets(12)
// The existing Smart Dashboard at "/" is untouched; this lives at its own route.

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DashboardDataProvider, useDashboardData } from '../lib/useDashboardData'
import { DATE_PRESETS } from '../lib/dashboardData'
import { useDashboardSettings } from '../lib/dashboardSettings'
import { FONT, TYPE, INK } from '../lib/dashboardTheme'
import { Grid12, Cell } from '../components/dashboard/DashboardGrid'
import { MarketRatesWidget } from '../components/dashboard/MarketRatesWidget'
import { NewsWidget } from '../components/dashboard/NewsWidget'
import { MonthlyGoalCard, YearlyGoalCard } from '../components/dashboard/GoalSlots'
import { FrontRunnerWidget } from '../components/dashboard/FrontRunnerWidget'
import { MyDayWidget } from '../components/dashboard/MyDayWidget'
import { AcceptedOffersChart, ProductionChart } from '../components/dashboard/AnalyticsCharts'
import { AgentPerformanceWidget } from '../components/dashboard/AgentPerformanceWidget'
import { CustomWidgetsSection } from '../components/dashboard/CustomWidgetsSection'
import { CommandCenterSettings } from '../components/dashboard/CommandCenterSettings'

function DateRangePicker() {
  const { preset, setPreset } = useDashboardData()
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK.body }}>
      <span style={{ color: INK.faint }}>Range</span>
      <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Date range"
        style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: FONT, fontSize: 13, background: '#fff' }}>
        {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
  )
}

function CommandCenterInner() {
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const firstName = (agent?.name || '').split(' ')[0]
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const ds = useDashboardSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const refreshAll = () => { setNonce((n) => n + 1); setUpdatedAt(new Date()) }

  const iconBtn = { border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, height: 34, padding: '0 10px', cursor: 'pointer', color: INK.body, fontFamily: FONT, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ fontFamily: FONT, width: '100%', maxWidth: 1600, margin: '0 auto', padding: '20px clamp(16px, 3vw, 32px) 48px' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: TYPE.pageTitle, fontWeight: 800, color: INK.title, letterSpacing: '-0.01em' }}>Command Center</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: INK.muted }}>{firstName ? 'Welcome back, ' + firstName + ' · ' : ''}{today}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <DateRangePicker />
          <button onClick={refreshAll} style={iconBtn} aria-label="Refresh dashboard">⟳ Refresh</button>
          <span style={{ fontSize: 12, color: INK.faint }}>Updated {updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          {isAdmin && <button onClick={() => setSettingsOpen(true)} style={{ ...iconBtn, borderColor: '#cfe0fb', color: '#0073EA' }}>⚙ Settings</button>}
        </div>
      </header>

      <div key={nonce}>
        <Grid12>
          <Cell span={{ desktop: 3, tablet: 6 }}><MarketRatesWidget /></Cell>
          <Cell span={{ desktop: 3, tablet: 6 }}><MonthlyGoalCard /></Cell>
          <Cell span={{ desktop: 3, tablet: 6 }}><YearlyGoalCard /></Cell>
          <Cell span={{ desktop: 3, tablet: 6 }}><FrontRunnerWidget settings={ds.settings.front_runner || {}} /></Cell>

          <Cell span={{ desktop: 7, tablet: 12 }}><MyDayWidget /></Cell>
          <Cell span={{ desktop: 5, tablet: 12 }}><NewsWidget /></Cell>

          <Cell span={{ desktop: 6, tablet: 12 }}><AcceptedOffersChart /></Cell>
          <Cell span={{ desktop: 6, tablet: 12 }}><ProductionChart /></Cell>

          <Cell span={{ desktop: 12, tablet: 12 }}><AgentPerformanceWidget /></Cell>
          <Cell span={{ desktop: 12, tablet: 12 }}><CustomWidgetsSection /></Cell>
        </Grid12>
      </div>

      {isAdmin && <CommandCenterSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} ds={ds} />}
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
