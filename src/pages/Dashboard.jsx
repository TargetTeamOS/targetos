// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Dashboard (Full Rebuild)
// Fully customizable widget-based dashboard.
// Admin controls what each agent can see.
// Agents can reorder and toggle their own widgets.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { lsGet, lsSet, fmt$, fmtDate, parseNum, pct, initials, isOverdue, isDueToday, getDaysUntil } from '../lib/utils'
import { DEAL_STAGES, TEAM_GOAL_GCI, TEAM_GOAL_DEALS, AGENT_GOAL_GCI } from '../lib/constants'
import { Avatar, Pill, Btn, Loading, Spinner } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── WIDGET REGISTRY ───────────────────────────────────────────────
// Every widget has: id, label, icon, roles, defaultOn, minRole
const ALL_WIDGETS = [
  { id: 'gci_goal',       label: 'GCI Goal Progress',     icon: '🎯', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'team_goal',      label: 'Team Goal',             icon: '🏆', roles: ['admin','secretary'],         defaultOn: true },
  { id: 'quick_stats',    label: 'Quick Stats',           icon: '📊', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'pipeline',       label: 'Pipeline by Stage',     icon: '🔀', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'todays_tasks',   label: "Today's Tasks",         icon: '✅', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'hot_leads',      label: 'Hot & Warm Leads',      icon: '🔥', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'active_deals',   label: 'Active Deals',          icon: '💼', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'upcoming_close', label: 'Upcoming Closings',     icon: '📅', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'active_listings',label: 'Active Listings',       icon: '🏡', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'open_houses',    label: 'Open Houses This Week', icon: '🚪', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'overdue_tasks',  label: 'Overdue Tasks Alert',   icon: '⚠️',  roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'gci_chart',      label: 'GCI by Month Chart',    icon: '📈', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'leaderboard',    label: 'Team Leaderboard',      icon: '🥇', roles: ['admin','secretary'],         defaultOn: true },
  { id: 'announcements',  label: 'Announcements',         icon: '📣', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'recent_activity',label: 'Recent Activity',       icon: '🕐', roles: ['admin','secretary','agent'], defaultOn: false },
  { id: 'quick_add',      label: 'Quick Add',             icon: '⚡', roles: ['admin','secretary','agent'], defaultOn: true },
  { id: 'gifts_pending',  label: 'Gifts Pending',         icon: '🎁', roles: ['admin','secretary'],         defaultOn: true },
  { id: 'calls_today',    label: 'Calls Today',           icon: '📞', roles: ['admin','secretary','agent'], defaultOn: false },
]

// ── DASHBOARD PREFS (stored per-agent in localStorage) ──────────
function getDashPrefs(agentId, role) {
  const key = `dash_prefs_${agentId}`
  const saved = lsGet(key, null)
  if (saved) return saved
  // Default: all widgets that match role and are defaultOn
  const visible = ALL_WIDGETS.filter(w => w.defaultOn && w.roles.includes(role)).map(w => w.id)
  return { visible, order: visible }
}

function saveDashPrefs(agentId, prefs) {
  lsSet(`dash_prefs_${agentId}`, prefs)
}

// ── ADMIN CONTROLLED PREFS (stored in Supabase briefing_prefs) ──
// Admin can lock down which widgets agents can see

// ── MINI CHART (GCI by Month) ────────────────────────────────────
function MiniBarChart({ data, color = '#CC2200' }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ width: '100%', background: color, borderRadius: '3px 3px 0 0', height: `${Math.max(4, (d.value / max) * 56)}px`, transition: 'height .4s ease', opacity: i === data.length - 1 ? 1 : 0.6 }} />
          <div style={{ fontSize: '9px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── GCI RING ─────────────────────────────────────────────────────
function GCIRing({ value, goal, color, size = 80 }) {
  const p = Math.min(100, pct(value, goal))
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (p / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--dim)" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .6s ease' }} />
    </svg>
  )
}

// ── WIDGET SHELL ─────────────────────────────────────────────────
function Widget({ title, icon, action, children, loading = false, noPad = false }) {
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{icon}</span>{title}
        </div>
        {action}
      </div>
      <div style={{ flex: 1, padding: noPad ? 0 : '12px 16px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60px' }}>
            <Spinner size={18} color="var(--muted)" />
          </div>
        ) : children}
      </div>
    </div>
  )
}

// ── CUSTOMIZE PANEL ───────────────────────────────────────────────
function CustomizePanel({ prefs, onSave, onClose, role, adminLocked = [] }) {
  const [visible, setVisible] = useState([...prefs.visible])
  const available = ALL_WIDGETS.filter(w => w.roles.includes(role) && !adminLocked.includes(w.id))

  function toggle(id) {
    setVisible(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])
  }

  function save() {
    onSave({ visible, order: visible })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '460px', maxHeight: '80vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>Customize Dashboard</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>Toggle widgets on or off. Enabled widgets show on your dashboard.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {available.map(w => {
              const on = visible.includes(w.id)
              const locked = adminLocked.includes(w.id)
              return (
                <div key={w.id} onClick={() => !locked && toggle(w.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`, background: on ? 'rgba(204,34,0,.04)' : 'var(--dim)', cursor: locked ? 'default' : 'pointer', transition: 'all .12s' }}>
                  <span style={{ fontSize: '18px' }}>{w.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{w.label}</div>
                  </div>
                  <div style={{ width: 36, height: 20, borderRadius: '99px', background: on ? 'var(--brand)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save Layout</Btn>
        </div>
      </div>
    </div>
  )
}

// ── ADMIN DASHBOARD CONTROLS ──────────────────────────────────────
function AdminDashControls({ agents, onClose }) {
  const [selected, setSelected] = useState(agents[0]?.id || '')
  const [agentPrefs, setAgentPrefs] = useState({})
  const { toast } = useApp()

  // Load prefs for selected agent
  useEffect(() => {
    if (!selected) return
    const agent = agents.find(a => a.id === selected)
    if (!agent) return
    const prefs = getDashPrefs(selected, agent.role)
    setAgentPrefs(prefs)
  }, [selected])

  async function saveLocked() {
    // In a real system this would save to Supabase
    // For now save to localStorage per agent
    saveDashPrefs(selected, agentPrefs)
    toast('✅ Dashboard preferences saved for agent')
  }

  const agent = agents.find(a => a.id === selected)
  const available = ALL_WIDGETS.filter(w => agent && w.roles.includes(agent.role))

  function toggleWidget(id) {
    setAgentPrefs(p => ({
      ...p,
      visible: p.visible?.includes(id) ? p.visible.filter(x => x !== id) : [...(p.visible || []), id]
    }))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '540px', maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>⚙️ Admin — Agent Dashboard Controls</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>Select an agent to configure which dashboard widgets they can see.</div>

          {/* Agent selector */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {agents.map(a => (
              <div key={a.id} onClick={() => setSelected(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${selected === a.id ? 'var(--brand)' : 'var(--border)'}`, background: selected === a.id ? 'rgba(204,34,0,.08)' : 'var(--dim)', cursor: 'pointer' }}>
                <Avatar agent={a} size={22} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{a.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>

          {agent && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>
                Widgets for {agent.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {available.map(w => {
                  const on = agentPrefs.visible?.includes(w.id) ?? w.defaultOn
                  return (
                    <div key={w.id} onClick={() => toggleWidget(w.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`, background: on ? 'rgba(204,34,0,.04)' : 'transparent', cursor: 'pointer' }}>
                      <span style={{ fontSize: '16px' }}>{w.icon}</span>
                      <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{w.label}</div>
                      <div style={{ width: 32, height: 18, borderRadius: '99px', background: on ? 'var(--brand)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 1, left: on ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
          <Btn onClick={saveLocked}>Save for {agent?.name?.split(' ')[0]}</Btn>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════
export function Dashboard() {
  const navigate  = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const year = new Date().getFullYear().toString()

  const [data,        setData]        = useState({})
  const [loading,     setLoading]     = useState(true)
  const [agentFilter, setAgentFilter] = useState('') // admin can filter by agent
  const [yearFilter,  setYearFilter]  = useState(year)
  const [showCustomize, setShowCustomize] = useState(false)
  const [showAdminControls, setShowAdminControls] = useState(false)
  const [agents,      setAgents]      = useState([])
  const [prefs,       setPrefs]       = useState(null)

  // Load prefs
  useEffect(() => {
    if (!agent) return
    const p = getDashPrefs(agent.id, agent.role)
    setPrefs(p)
  }, [agent?.id])

  // Save prefs
  function handleSavePrefs(newPrefs) {
    setPrefs(newPrefs)
    saveDashPrefs(agent.id, newPrefs)
    toast('✅ Dashboard saved')
  }

  // Load all dashboard data in parallel
  const loadData = useCallback(async () => {
    if (!agent) return
    setLoading(true)
    try {
      const viewAgentId = agentFilter || ((isAdmin || canManage) ? null : agent.id)

      const [
        allDeals, allContacts, allTasks, allListings,
        allCalls, allOpenHouses, allAnnouncements, allAgents, allOffers, allGifts
      ] = await Promise.all([
        supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,expected_close_date,addr,client_name,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('contacts').select('id,first_name,last_name,status,source,agent_id,created_at,phone').then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('listings').select('id,addr,city,status,list_price,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('calls').select('id,contact_name,direction,outcome,called_at,agent_id').then(r => r.data || []),
        supabase.from('open_houses').select('id,listing_addr,date,start_time,end_time,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('announcements').select('*,agents(id,name,color)').order('pinned', { ascending: false }).limit(5).then(r => r.data || []),
        supabase.from('agents').select('*').eq('active', true).order('name').then(r => r.data || []),
        supabase.from('offers').select('id,listing_addr,status,gci,production,agent_id').then(r => r.data || []),
        supabase.from('gifts').select('id,client_name,status,agent_id').then(r => r.data || []),
      ])

      // Filter by agent if needed
      const filter = (arr) => viewAgentId ? arr.filter(x => x.agent_id === viewAgentId) : arr

      const myDeals    = filter(allDeals)
      const myContacts = filter(allContacts)
      const myTasks    = filter(allTasks)
      const myListings = filter(allListings)
      const myCalls    = filter(allCalls)
      const myOH       = filter(allOpenHouses)

      // Year filter for deals
      const yearDeals  = myDeals.filter(d => d.ao_date?.startsWith(yearFilter))
      const closedDeals = yearDeals.filter(d => d.stage === 'Closed')
      const activeDeals = myDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))

      // GCI calculations
      const closedGCI   = closedDeals.reduce((s, d) => s + parseNum(d.gci), 0)
      const pipelineGCI = activeDeals.reduce((s, d) => s + parseNum(d.gci), 0)
      const totalGCI    = yearDeals.reduce((s, d) => s + parseNum(d.gci), 0)

      // Team GCI (always all agents)
      const teamClosedDeals = allDeals.filter(d => d.ao_date?.startsWith(yearFilter) && d.stage === 'Closed')
      const teamGCI  = teamClosedDeals.reduce((s, d) => s + parseNum(d.gci), 0)
      const teamDeals = teamClosedDeals.length

      // Today
      const todayStr = new Date().toISOString().slice(0, 10)
      const todayTasks    = myTasks.filter(t => t.status !== 'done' && (isDueToday(t.due_date) || isOverdue(t.due_date))).sort((a, b) => isOverdue(a.due_date) ? -1 : 1)
      const overdueTasks  = myTasks.filter(t => t.status !== 'done' && isOverdue(t.due_date))
      const hotLeads      = myContacts.filter(c => c.status === 'Hot' || c.status === 'Warm').sort((a, b) => a.status === 'Hot' ? -1 : 1)
      const todayCalls    = myCalls.filter(c => c.called_at?.startsWith(todayStr))

      // Upcoming closings (next 30 days)
      const upcoming = myDeals.filter(d => {
        const date = d.expected_close_date || d.close_date
        if (!date) return false
        const days = getDaysUntil(date)
        return days !== null && days >= 0 && days <= 30 && d.stage !== 'Closed'
      }).sort((a, b) => {
        const da = getDaysUntil(a.expected_close_date || a.close_date)
        const db_ = getDaysUntil(b.expected_close_date || b.close_date)
        return da - db_
      })

      // Active listings
      const activeListings = myListings.filter(l => l.status === 'Active')

      // Open houses this week
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() + 7)
      const weekEndStr = weekEnd.toISOString().slice(0, 10)
      const upcomingOH = myOH.filter(oh => oh.date >= todayStr && oh.date <= weekEndStr)

      // GCI by month chart
      const monthlyGCI = []
      for (let m = 0; m < 12; m++) {
        const monthStr = `${yearFilter}-${String(m+1).padStart(2,'0')}`
        const monthDeals = myDeals.filter(d => d.ao_date?.startsWith(monthStr) && d.stage === 'Closed')
        const gci = monthDeals.reduce((s, d) => s + parseNum(d.gci), 0)
        monthlyGCI.push({ label: ['J','F','M','A','M','J','J','A','S','O','N','D'][m], value: gci })
      }

      // Leaderboard
      const leaderboard = allAgents.map(a => {
        const aDeals = allDeals.filter(d => d.agent_id === a.id && d.ao_date?.startsWith(yearFilter))
        const gci    = aDeals.filter(d => d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        const active = aDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage)).length
        const closed = aDeals.filter(d => d.stage === 'Closed').length
        return { agent: a, gci, active, closed, total: aDeals.length }
      }).sort((a, b) => b.gci - a.gci)

      // Pipeline by stage
      const pipelineByStage = DEAL_STAGES.map(s => ({
        ...s,
        deals: activeDeals.filter(d => d.stage === s.value),
        gci:   activeDeals.filter(d => d.stage === s.value).reduce((sum, d) => sum + parseNum(d.gci), 0)
      }))

      // Pending gifts
      const pendingGifts = allGifts.filter(g => !['Delivered'].includes(g.status))

      setData({
        closedGCI, pipelineGCI, totalGCI, closedDeals, activeDeals,
        teamGCI, teamDeals, todayTasks, overdueTasks, hotLeads,
        upcoming, activeListings, upcomingOH, monthlyGCI, leaderboard,
        pipelineByStage, announcements: allAnnouncements,
        allTasks: myTasks, todayCalls, pendingGifts, allDeals: myDeals,
        contactCount: myContacts.length, hotCount: hotLeads.length,
        allAgents,
      })
      setAgents(allAgents)
    } catch(e) {
      toast('Dashboard load error: ' + e.message, '#DC2626')
    } finally {
      setLoading(false)
    }
  }, [agent?.id, agentFilter, yearFilter, isAdmin, canManage])

  useEffect(() => { loadData() }, [loadData])

  if (!agent || !prefs) return <div style={{ fontFamily: ff, padding: '28px' }}><Loading /></div>

  const show = (id) => prefs.visible?.includes(id)
  const greeting = ['Good morning','Good afternoon','Good evening'][Math.floor(new Date().getHours() / 6) > 2 ? 2 : Math.floor(new Date().getHours() / 6)]
  const years = []
  for (let y = new Date().getFullYear(); y >= 2015; y--) years.push(y.toString())

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>
            {greeting}, {agent?.name?.split(' ')[0]} 👋
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Year filter */}
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Agent filter (admin only) */}
          {(isAdmin || canManage) && (
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          {/* Refresh */}
          <button onClick={loadData} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', fontFamily: ff }}>
            ↻
          </button>

          {/* Admin controls */}
          {isAdmin && (
            <Btn size="sm" variant="secondary" onClick={() => setShowAdminControls(true)}>
              ⚙️ Agent Views
            </Btn>
          )}

          {/* Customize my dashboard */}
          <Btn size="sm" variant="secondary" onClick={() => setShowCustomize(true)}>
            🎛 Customize
          </Btn>
        </div>
      </div>

      {/* Overdue banner */}
      {show('overdue_tasks') && data.overdueTasks?.length > 0 && (
        <div onClick={() => navigate('/tasks')}
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderLeft: '4px solid #DC2626' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#DC2626', fontSize: '13px' }}>
              {data.overdueTasks.length} overdue task{data.overdueTasks.length > 1 ? 's' : ''}
            </span>
            <span style={{ color: '#B91C1C', fontSize: '13px' }}> — click to view</span>
          </div>
          <span style={{ color: '#DC2626', fontSize: '12px' }}>→</span>
        </div>
      )}

      {/* Announcements banner */}
      {show('announcements') && data.announcements?.filter(a => a.pinned).map(a => (
        <div key={a.id} style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: '10px', display: 'flex', gap: '10px', borderLeft: '4px solid #F5A623' }}>
          <span>📣</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400E' }}>{a.title}</div>
            {a.body && <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>{a.body}</div>}
          </div>
        </div>
      ))}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
          <Loading />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── ROW 1: GOALS ── */}
          {(show('gci_goal') || show('team_goal') || show('quick_stats')) && (
            <div style={{ display: 'grid', gridTemplateColumns: `${show('gci_goal') ? '1fr' : ''} ${show('team_goal') && (isAdmin || canManage) ? '1fr' : ''} ${show('quick_stats') ? '2fr' : ''}`, gap: '16px' }}>

              {/* Personal GCI Goal */}
              {show('gci_goal') && (
                <Widget title="My GCI Goal" icon="🎯">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <GCIRing value={data.closedGCI} goal={AGENT_GOAL_GCI} color="#CC2200" size={84} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{pct(data.closedGCI, AGENT_GOAL_GCI)}%</div>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(AGENT_GOAL_GCI)} goal</div>
                      <div style={{ fontSize: '11px', color: '#F5A623', marginTop: '4px' }}>+ {fmt$(data.pipelineGCI)} pipeline</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{data.closedDeals?.length || 0} closed · {yearFilter}</div>
                    </div>
                  </div>
                </Widget>
              )}

              {/* Team Goal (admin) */}
              {show('team_goal') && (isAdmin || canManage) && (
                <Widget title="Team Goal" icon="🏆">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <GCIRing value={data.teamGCI} goal={TEAM_GOAL_GCI} color="#F5A623" size={84} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{pct(data.teamGCI, TEAM_GOAL_GCI)}%</div>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#F5A623' }}>{fmt$(data.teamGCI)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(TEAM_GOAL_GCI)} team goal</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{data.teamDeals} / {TEAM_GOAL_DEALS} deals · {yearFilter}</div>
                    </div>
                  </div>
                </Widget>
              )}

              {/* Quick Stats */}
              {show('quick_stats') && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Active Deals', value: data.activeDeals?.length || 0, icon: '💼', color: '#3B82F6', link: '/production' },
                    { label: 'Contacts', value: data.contactCount || 0, icon: '👥', color: '#8B5CF6', link: '/contacts' },
                    { label: 'Active Listings', value: data.activeListings?.length || 0, icon: '🏡', color: '#10B981', link: '/listings' },
                    { label: 'Hot Leads', value: data.hotCount || 0, icon: '🔥', color: '#DC2626', link: '/contacts' },
                  ].map(s => (
                    <div key={s.label} onClick={() => navigate(s.link)}
                      style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px', cursor: 'pointer', borderTop: `3px solid ${s.color}`, transition: 'box-shadow .12s' }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                      <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ROW 2: PIPELINE + CHART ── */}
          {(show('pipeline') || show('gci_chart')) && (
            <div style={{ display: 'grid', gridTemplateColumns: show('pipeline') && show('gci_chart') ? '1fr 1fr' : '1fr', gap: '16px' }}>

              {/* Pipeline by Stage */}
              {show('pipeline') && (
                <Widget title="Pipeline by Stage" icon="🔀"
                  action={<button onClick={() => navigate('/pipeline')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>View →</button>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {data.pipelineByStage?.filter(s => s.deals.length > 0).map(s => (
                      <div key={s.value} onClick={() => navigate('/production')}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px 0' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.hex, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}>{s.label}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>{s.deals.length}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: s.hex }}>{fmt$(s.gci)}</div>
                        <div style={{ width: '80px', height: '6px', background: 'var(--dim)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: s.hex, borderRadius: '3px', width: `${pct(s.deals.length, data.activeDeals?.length || 1)}%` }} />
                        </div>
                      </div>
                    ))}
                    {!data.pipelineByStage?.some(s => s.deals.length > 0) && (
                      <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>No active deals</div>
                    )}
                  </div>
                </Widget>
              )}

              {/* GCI by Month */}
              {show('gci_chart') && (
                <Widget title={`GCI by Month — ${yearFilter}`} icon="📈">
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '6px' }}>closed {yearFilter}</span>
                  </div>
                  <MiniBarChart data={data.monthlyGCI} color="#CC2200" />
                </Widget>
              )}
            </div>
          )}

          {/* ── ROW 3: TASKS + LEADS ── */}
          {(show('todays_tasks') || show('hot_leads')) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Today's Tasks */}
              {show('todays_tasks') && (
                <Widget title="Today's Tasks" icon="✅"
                  action={<button onClick={() => navigate('/tasks')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>All Tasks →</button>}>
                  {data.todayTasks?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>🎉 All clear — nothing due today</div>
                  )}
                  {data.todayTasks?.slice(0, 6).map(t => (
                    <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: isOverdue(t.due_date) ? '#DC2626' : '#F97316' }} />
                      <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      {isOverdue(t.due_date) && <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 700, flexShrink: 0 }}>LATE</span>}
                      {t.agents && isAdmin && <Avatar agent={t.agents} size={18} />}
                    </div>
                  ))}
                  <button onClick={() => navigate('/tasks/new')}
                    style={{ marginTop: '8px', width: '100%', padding: '7px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontFamily: ff }}>
                    + Quick Add Task
                  </button>
                </Widget>
              )}

              {/* Hot Leads */}
              {show('hot_leads') && (
                <Widget title="Hot & Warm Leads" icon="🔥"
                  action={<button onClick={() => navigate('/contacts')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>All Contacts →</button>}>
                  {data.hotLeads?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>No hot leads right now</div>
                  )}
                  {data.hotLeads?.slice(0, 6).map(c => (
                    <div key={c.id} onClick={() => navigate('/contacts/' + c.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: c.status === 'Hot' ? '#DC2626' : '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                        {initials(c.first_name + ' ' + (c.last_name || ''))}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name}</div>
                        {c.phone && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.phone}</div>}
                      </div>
                      <Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />
                    </div>
                  ))}
                  <button onClick={() => navigate('/contacts/new')}
                    style={{ marginTop: '8px', width: '100%', padding: '7px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontFamily: ff }}>
                    + Add Lead
                  </button>
                </Widget>
              )}
            </div>
          )}

          {/* ── ROW 4: ACTIVE DEALS + UPCOMING CLOSINGS ── */}
          {(show('active_deals') || show('upcoming_close')) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Active Deals */}
              {show('active_deals') && (
                <Widget title="Active Deals" icon="💼"
                  action={<button onClick={() => navigate('/production')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>View All →</button>}>
                  {data.activeDeals?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>No active deals</div>
                  )}
                  {data.activeDeals?.slice(0, 5).map(d => (
                    <div key={d.id} onClick={() => navigate('/production/' + d.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                        {d.client_name && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.client_name}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
                        <Pill label={d.stage} color={DEAL_STAGES.find(s => s.value === d.stage)?.hex || '#c4c4c4'} />
                      </div>
                    </div>
                  ))}
                </Widget>
              )}

              {/* Upcoming Closings */}
              {show('upcoming_close') && (
                <Widget title="Upcoming Closings" icon="📅">
                  {data.upcoming?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>No closings in the next 30 days</div>
                  )}
                  {data.upcoming?.slice(0, 5).map(d => {
                    const days = getDaysUntil(d.expected_close_date || d.close_date)
                    return (
                      <div key={d.id} onClick={() => navigate('/production/' + d.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '8px', background: days <= 7 ? '#FEF2F2' : '#F0FDF4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: days <= 7 ? '#DC2626' : '#10B981' }}>{days}</div>
                          <div style={{ fontSize: '9px', color: days <= 7 ? '#DC2626' : '#10B981' }}>days</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDate(d.expected_close_date || d.close_date)}</div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981', flexShrink: 0 }}>{fmt$(d.gci)}</div>
                      </div>
                    )
                  })}
                </Widget>
              )}
            </div>
          )}

          {/* ── ROW 5: LISTINGS + OPEN HOUSES ── */}
          {(show('active_listings') || show('open_houses')) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Active Listings */}
              {show('active_listings') && (
                <Widget title="Active Listings" icon="🏡"
                  action={<button onClick={() => navigate('/listings')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>View All →</button>}>
                  {data.activeListings?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>No active listings</div>
                  )}
                  {data.activeListings?.slice(0, 5).map(l => (
                    <div key={l.id} onClick={() => navigate('/listings/' + l.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.addr}</div>
                        {l.city && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{l.city}</div>}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)', flexShrink: 0 }}>{fmt$(l.list_price)}</div>
                    </div>
                  ))}
                </Widget>
              )}

              {/* Open Houses */}
              {show('open_houses') && (
                <Widget title="Open Houses This Week" icon="🚪"
                  action={<button onClick={() => navigate('/openhouse')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>View All →</button>}>
                  {data.upcomingOH?.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>No open houses this week</div>
                  )}
                  {data.upcomingOH?.map(oh => (
                    <div key={oh.id} onClick={() => navigate('/openhouse/' + oh.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oh.listing_addr}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDate(oh.date)} {oh.start_time && `· ${oh.start_time}`}</div>
                      </div>
                      {oh.agents && <Avatar agent={oh.agents} size={22} />}
                    </div>
                  ))}
                </Widget>
              )}
            </div>
          )}

          {/* ── ROW 6: LEADERBOARD (admin) ── */}
          {show('leaderboard') && (isAdmin || canManage) && (
            <Widget title={`Team Leaderboard — ${yearFilter}`} icon="🥇">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.leaderboard?.filter(r => r.gci > 0 || r.total > 0).slice(0, 8).map((row, i) => (
                  <div key={row.agent.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '16px', minWidth: '24px', textAlign: 'center' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                    </div>
                    <Avatar agent={row.agent} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{row.agent.name}</div>
                      <div style={{ height: '4px', background: 'var(--dim)', borderRadius: '2px', marginTop: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: row.agent.color || '#CC2200', borderRadius: '2px', width: `${pct(row.gci, AGENT_GOAL_GCI)}%`, transition: 'width .4s ease' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#10B981' }}>{fmt$(row.gci)}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{row.closed} closed</div>
                    </div>
                  </div>
                ))}
              </div>
            </Widget>
          )}

          {/* ── ROW 7: GIFTS + CALLS ── */}
          {(show('gifts_pending') || show('calls_today')) && (isAdmin || canManage) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {show('gifts_pending') && (
                <Widget title="Gifts Pending" icon="🎁"
                  action={<button onClick={() => navigate('/gifts')} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>View All →</button>}>
                  {data.pendingGifts?.length === 0
                    ? <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>All gifts delivered ✅</div>
                    : data.pendingGifts?.slice(0, 5).map(g => (
                      <div key={g.id} onClick={() => navigate('/gifts/' + g.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <div style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{g.client_name}</div>
                        <Pill label={g.status} color="#9d50dd" />
                      </div>
                    ))
                  }
                </Widget>
              )}
              {show('calls_today') && (
                <Widget title="Calls Today" icon="📞">
                  {data.todayCalls?.length === 0
                    ? <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)', fontSize: '12px' }}>No calls logged today</div>
                    : data.todayCalls?.slice(0, 5).map(c => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)' }}>{c.contact_name || c.phone || 'Unknown'}</div>
                        <Pill label={c.outcome || c.direction} color="#007eb5" />
                      </div>
                    ))
                  }
                </Widget>
              )}
            </div>
          )}

          {/* ── QUICK ADD (floating action row) ── */}
          {show('quick_add') && (
            <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>⚡ Quick Add</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: '+ Lead',     path: '/contacts/new',    color: '#0EA5E9' },
                  { label: '+ Deal',     path: '/production/new',  color: '#10B981' },
                  { label: '+ Task',     path: '/tasks/new',       color: '#8B5CF6' },
                  { label: '+ Listing',  path: '/listings/new',    color: '#F5A623' },
                  { label: '+ Offer',    path: '/offers/new',      color: '#6366F1' },
                  { label: '+ OH',       path: '/openhouse/new',   color: '#14B8A6' },
                  { label: '+ Gift',     path: '/gifts/new',       color: '#EC4899' },
                  { label: '+ Event',    path: '/calendar/new',    color: '#CC2200' },
                ].map(item => (
                  <button key={item.path} onClick={() => navigate(item.path)}
                    style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${item.color}33`, background: item.color + '11', color: item.color, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: ff, transition: 'background .12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = item.color + '22'}
                    onMouseLeave={e => e.currentTarget.style.background = item.color + '11'}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Customize Panel */}
      {showCustomize && (
        <CustomizePanel
          prefs={prefs}
          onSave={handleSavePrefs}
          onClose={() => setShowCustomize(false)}
          role={agent.role}
        />
      )}

      {/* Admin Controls Panel */}
      {showAdminControls && isAdmin && (
        <AdminDashControls
          agents={agents}
          onClose={() => setShowAdminControls(false)}
        />
      )}
    </div>
  )
}
