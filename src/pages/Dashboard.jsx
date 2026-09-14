// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Dashboard (Complete Rebuild)
//
// Features:
// • Every widget clickable → opens detail popup with all records
// • Drag to reorder — saves to Supabase, persists across devices
// • Widget size control: half / full width
// • Widget accent color picker
// • Per-agent goals stored in DB — each agent sees only their own
// • Admin can update any agent's goal
// • Admin controls what each agent can see
// • Year and agent filters
// ═══════════════════════════════════════════════════════════════

import { ClickToCall } from '../components/ClickToCall'
import { MarketWidget } from '../components/MarketWidget'
import { DashboardListingTiles } from '../components/DashboardListingTiles'
import { DashboardPins } from '../components/DashboardPins'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { BOARD_OPTIONS } from '../lib/boardOptions'
import {
  loadDashPrefs, saveDashPrefs,
  loadAgentGoals, saveAgentGoal,
  loadTeamGoal, saveTeamGoal,
  switchToNewDashLayout, restoreOldDashLayout,
  DEFAULT_WIDGETS
} from '../lib/dashboardPrefs'
import {
  fmt$, fmtDate, parseNum, pct, initials,
  isOverdue, isDueToday, getDaysUntil
} from '../lib/utils'
import { DEAL_STAGES } from '../lib/constants'
import { Avatar, Pill, Btn, Loading, Spinner, Field, Input, Confirm } from '../components/UI'
import { usePageView } from '../components/PageViewTracking'
import { getFieldCatalog } from '../lib/fieldCatalog'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── WIDGET ERROR BOUNDARY ─────────────────────────────────────────
// Catches errors in individual widgets so one broken widget
// never crashes the entire dashboard
class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[Widget Error]', error.message, info.componentStack?.slice(0, 200))
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '14px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px' }}>
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>⚠️</div>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Widget Error</div>
          <div style={{ fontSize: '10px', color: '#DC2626', fontFamily: 'monospace', background: 'var(--dim)', padding: '6px', borderRadius: '6px', maxHeight: '60px', overflow: 'hidden' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '8px', padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: '11px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── WIDGET REGISTRY ───────────────────────────────────────────────
const WIDGET_DEFS = {
  gci_goal:        { label: 'My GCI Goal',           icon: '🎯', roles: ['admin','secretary','agent'] },
  team_goal:       { label: 'Team Goal',             icon: '🏆', roles: ['admin','secretary','agent'] },
  quick_stats:     { label: 'Quick Stats',           icon: '📊', roles: ['admin','secretary','agent'] },
  pipeline:        { label: 'Pipeline by Stage',     icon: '🔀', roles: ['admin','secretary','agent'] },
  todays_tasks:    { label: "Today's Tasks",         icon: '✅', roles: ['admin','secretary','agent'] },
  hot_leads:       { label: 'Hot & Warm Leads',      icon: '🔥', roles: ['admin','secretary','agent'] },
  active_deals:    { label: 'Active Deals',          icon: '💼', roles: ['admin','secretary','agent'] },
  upcoming_close:  { label: 'Upcoming Closings',     icon: '📅', roles: ['admin','secretary','agent'] },
  active_listings: { label: 'Active Listings',       icon: '🏡', roles: ['admin','secretary','agent'] },
  leaderboard:     { label: 'Team Leaderboard',      icon: '🥇', roles: ['admin','secretary','agent'] },
  gci_chart:       { label: 'GCI by Month',          icon: '📈', roles: ['admin','secretary','agent'] },
  open_houses:     { label: 'Open Houses This Week', icon: '🚪', roles: ['admin','secretary','agent'] },
  gifts_pending:   { label: 'Gifts Pending',         icon: '🎁', roles: ['admin','secretary'] },
  quick_add:       { label: 'Quick Add',             icon: '⚡', roles: ['admin','secretary','agent'] },
  overdue_alert:   { label: 'Overdue Alert',         icon: '⚠️',  roles: ['admin','secretary','agent'] },
  announcements:    { label: 'Announcements',          icon: '📣', roles: ['admin','secretary','agent'] },
  production_stats: { label: 'Production Stats',       icon: '💰', roles: ['admin','secretary','agent'] },
  // Custom board widgets — defined by the user at runtime
  custom:           { label: 'Custom Widget',          icon: '🔲', roles: ['admin','secretary','agent'] },
}

const ACCENT_COLORS = [
  '#CC2200','#DC2626','#F97316','#F5A623','#10B981',
  '#0EA5E9','#3B82F6','#8B5CF6','#EC4899','#14B8A6',
  '#84CC16','#6366F1','#9D50DD','#007eb5','#037f4c',
]

// ── GCI RING ─────────────────────────────────────────────────────
function GCIRing({ value, goal, color = '#CC2200', size = 88 }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const p2 = Math.min(100, goal > 0 ? Math.round((value / goal) * 100) : 0)
  const dash = (p2 / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--dim)" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={dash + ' ' + circ} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .7s ease' }} />
    </svg>
  )
}

// ── MINI BAR CHART ────────────────────────────────────────────────
function MiniBar({ data, color = '#CC2200' }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  const curMonth = new Date().getMonth()
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '62px' }}>
      {data.map((d, i) => {
        const isCur = i === curMonth
        const barColor = isCur ? color : color + '55'
        return (
          <div key={i} title={fmt$(d.value)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <div style={{ width: '100%', height: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'var(--dim)', borderRadius: '3px 3px 2px 2px' }}>
              <div style={{
                width: '100%',
                background: 'linear-gradient(180deg, ' + barColor + ', ' + barColor + 'CC)',
                borderRadius: '3px 3px 2px 2px',
                height: (Math.max(3, (d.value / max) * 48)) + 'px',
                transition: 'height .4s ease',
              }} />
            </div>
            <div style={{ fontSize: '8px', fontWeight: isCur ? 800 : 500, color: isCur ? 'var(--text)' : 'var(--muted)' }}>{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}
