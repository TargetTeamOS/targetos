// DashboardCommandCenter — the Command Center page. A controlled responsive grid
// (DashboardGrid) places each widget in its intended region and size:
//   row 1 (compact): mortgage rates · news · monthly team goal · front runner
//   main:            large My Day  +  yearly goal progress
//   then:            full-width Agent Performance
//   bottom:          full-width Custom Widgets
// The existing Smart Dashboard at "/" is untouched; this lives at its own route.

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DashboardDataProvider, useDashboardData } from '../lib/useDashboardData'
import { DATE_PRESETS } from '../lib/dashboardData'
import { DashboardShell } from '../components/dashboard/DashboardShell'
import { DashboardGrid, Region } from '../components/dashboard/DashboardGrid'
import { MarketRatesWidget } from '../components/dashboard/MarketRatesWidget'
import { NewsWidget } from '../components/dashboard/NewsWidget'
import { MonthlyGoalCard, YearlyGoalCard } from '../components/dashboard/GoalSlots'
import { FrontRunnerWidget } from '../components/dashboard/FrontRunnerWidget'
import { MyDayWidget } from '../components/dashboard/MyDayWidget'
import { AgentPerformanceWidget } from '../components/dashboard/AgentPerformanceWidget'
import { CustomWidgetsSection } from '../components/dashboard/CustomWidgetsSection'
import { CommandCenterSettings } from '../components/dashboard/CommandCenterSettings'
import { useDashboardSettings } from '../lib/dashboardSettings'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

function DateRangePicker() {
  const { preset, setPreset } = useDashboardData()
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
      <span>Range</span>
      <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Date range"
        style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: FF, fontSize: 13, background: '#fff' }}>
        {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
  )
}

function CommandCenterInner() {
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const firstName = (agent?.name || '').split(' ')[0]
  const welcome = firstName ? 'Welcome back, ' + firstName + '. Your team at a glance.' : 'Your team at a glance.'
  const ds = useDashboardSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const frSettings = ds.settings.front_runner || {}
  const saveFr = (val) => ds.save('front_runner', val)

  return (
    <div style={{ fontFamily: FF, padding: '18px 20px 40px', maxWidth: 1360, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Command Center</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>{welcome}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DateRangePicker />
          {isAdmin && (
            <button onClick={() => setSettingsOpen(true)}
              style={{ fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer', fontFamily: FF }}>
              ⚙ Settings
            </button>
          )}
        </div>
      </header>

      <DashboardShell status="ready">
        <DashboardGrid>
          <Region area="rates"><MarketRatesWidget /></Region>
          <Region area="news"><NewsWidget /></Region>
          <Region area="goal"><MonthlyGoalCard /></Region>
          <Region area="frontrunner"><FrontRunnerWidget settings={frSettings} onSettings={saveFr} /></Region>
          <Region area="myday"><MyDayWidget /></Region>
          <Region area="goalside"><YearlyGoalCard /></Region>
          <Region area="agents"><AgentPerformanceWidget /></Region>
          <Region area="custom"><CustomWidgetsSection /></Region>
        </DashboardGrid>
      </DashboardShell>

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
