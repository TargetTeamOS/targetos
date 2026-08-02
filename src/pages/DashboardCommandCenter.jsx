// DashboardCommandCenter — the new dashboard's page shell (Commit 1).
// This establishes the frame only: masonry layout, branding, the shared data
// provider, the state scaffolding, and one reusable drill-down. The real
// widgets (market, goals, My Day, agent performance, custom widgets) are added
// in later commits; here their slots are compact placeholder cards.
//
// The existing Smart Dashboard at "/" is untouched; this lives at its own route.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DashboardDataProvider, useDashboardData } from '../lib/useDashboardData'
import { DATE_PRESETS } from '../lib/dashboardData'
import { DashboardShell, MasonryGrid } from '../components/dashboard/DashboardShell'
import { DrillDown } from '../components/dashboard/DrillDown'
import { MarketRatesWidget } from '../components/dashboard/MarketRatesWidget'
import { NewsWidget } from '../components/dashboard/NewsWidget'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

// Slots for the widgets that arrive in later commits. Marked clearly as
// placeholders so nobody mistakes the shell for finished work.
const SLOTS = [
  { key: 'monthly', title: 'Monthly team goal',  note: 'Accepted offers vs target',          accent: '#00C875', commit: 3 },
  { key: 'myday',   title: 'My day',             note: 'Tasks, appointments, follow-ups',     accent: '#A25DDC', commit: 4 },
  { key: 'yearly',  title: 'Yearly team goal',   note: 'Pace and projection',                 accent: '#FDAB3D', commit: 3 },
  { key: 'agents',  title: 'Agent performance',  note: 'Leaderboard across the team',         accent: '#037f4c', commit: 5 },
  { key: 'custom',  title: 'Custom widgets',     note: 'Admin-built production metrics',       accent: '#579BFC', commit: 6 },
]

function PlaceholderCard({ slot, onPreview }) {
  return (
    <section
      style={{
        breakInside: 'avoid', marginBottom: 16, background: '#fff',
        border: '1px solid #e9edf3', borderRadius: 12, padding: 16,
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: slot.accent }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{slot.title}</h3>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>{slot.note}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', borderRadius: 999, padding: '3px 9px' }}>
          Arrives in commit {slot.commit}
        </span>
        <button
          onClick={() => onPreview(slot)}
          style={{ marginLeft: 'auto', fontSize: 13, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: 0 }}
        >
          Preview drill-down
        </button>
      </div>
    </section>
  )
}

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
  const navigate = useNavigate()
  const [drill, setDrill] = useState(null) // { slot } | null

  const openPreview = useCallback((slot) => setDrill({ slot }), [])
  const closePreview = useCallback(() => setDrill(null), [])

  const firstName = (agent?.name || '').split(' ')[0]

  return (
    <div style={{ fontFamily: FF, padding: '18px 20px 40px', maxWidth: 1280, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Command Center
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {firstName ? `Welcome back, ${firstName}. ` : ''}Your team at a glance.
          </p>
        </div>
        <DateRangePicker />
      </header>

      <DashboardShell status="ready">
        <MasonryGrid>
          <MarketRatesWidget />
          <NewsWidget />
          {SLOTS.map((slot) => (
            <PlaceholderCard key={slot.key} slot={slot} onPreview={openPreview} />
          ))}
        </MasonryGrid>
      </DashboardShell>

      <DrillDown
        open={!!drill}
        onClose={closePreview}
        title={drill ? drill.slot.title : ''}
        explanation="This is the shared drill-down. Real widgets will list their supporting records here, each linking to its exact CRM page."
        sourceLabel="Preview"
        dateRangeLabel="All time"
        recordCount={0}
        rows={[]}
        onNavigate={navigate}
      />
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
