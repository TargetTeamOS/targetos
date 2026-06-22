// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Dashboard (Full Rebuild)
// • Every widget is clickable — opens a detail card popup
//   showing every line that made the number
// • Drag to reorder widgets
// • Admin can edit goals and control what each agent sees
// • Custom metric filters per widget
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import {
  fmt$, fmtDate, fmtDateShort, parseNum, pct, initials,
  isOverdue, isDueToday, getDaysUntil, lsGet, lsSet
} from '../lib/utils'
import { DEAL_STAGES, CONTACT_STATUSES } from '../lib/constants'
import { Avatar, Pill, Btn, Loading, Spinner, Modal, Field, Input, Select, Tabs } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── DEFAULT GOALS (editable by admin) ────────────────────────────
const DEFAULT_GOALS = {
  agent_gci:   250000,
  team_gci:    2000000,
  team_deals:  200,
}

function getGoals() { return lsGet('tos_goals', DEFAULT_GOALS) }
function saveGoals(g) { lsSet('tos_goals', g) }

// ── WIDGET DEFINITIONS ────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: 'gci_goal',        label: 'My GCI Goal',           icon: '🎯', roles: ['admin','secretary','agent'] },
  { id: 'team_goal',       label: 'Team Goal',             icon: '🏆', roles: ['admin','secretary'] },
  { id: 'quick_stats',     label: 'Quick Stats',           icon: '📊', roles: ['admin','secretary','agent'] },
  { id: 'pipeline',        label: 'Pipeline by Stage',     icon: '🔀', roles: ['admin','secretary','agent'] },
  { id: 'todays_tasks',    label: "Today's Tasks",         icon: '✅', roles: ['admin','secretary','agent'] },
  { id: 'hot_leads',       label: 'Hot & Warm Leads',      icon: '🔥', roles: ['admin','secretary','agent'] },
  { id: 'active_deals',    label: 'Active Deals',          icon: '💼', roles: ['admin','secretary','agent'] },
  { id: 'upcoming_close',  label: 'Upcoming Closings',     icon: '📅', roles: ['admin','secretary','agent'] },
  { id: 'active_listings', label: 'Active Listings',       icon: '🏡', roles: ['admin','secretary','agent'] },
  { id: 'open_houses',     label: 'Open Houses',           icon: '🚪', roles: ['admin','secretary','agent'] },
  { id: 'leaderboard',     label: 'Team Leaderboard',      icon: '🥇', roles: ['admin','secretary'] },
  { id: 'gci_chart',       label: 'GCI by Month',          icon: '📈', roles: ['admin','secretary','agent'] },
  { id: 'gifts_pending',   label: 'Gifts Pending',         icon: '🎁', roles: ['admin','secretary'] },
  { id: 'quick_add',       label: 'Quick Add',             icon: '⚡', roles: ['admin','secretary','agent'] },
  { id: 'announcements',   label: 'Announcements',         icon: '📣', roles: ['admin','secretary','agent'] },
  { id: 'overdue_alert',   label: 'Overdue Alert',         icon: '⚠️',  roles: ['admin','secretary','agent'] },
]

function getPrefs(agentId, role) {
  const saved = lsGet(`dash2_${agentId}`, null)
  if (saved) return saved
  const visible = WIDGET_DEFS.filter(w => w.roles.includes(role)).map(w => w.id)
  return { visible, order: visible }
}
function savePrefs(agentId, p) { lsSet(`dash2_${agentId}`, p) }

// ── GCI RING ─────────────────────────────────────────────────────
function GCIRing({ value, goal, color = '#CC2200', size = 88 }) {
  const r    = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const p2   = Math.min(100, pct(value, goal))
  const dash = (p2 / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--dim)" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .7s ease' }} />
    </svg>
  )
}

// ── MINI BAR CHART ────────────────────────────────────────────────
function MiniBar({ data, color = '#CC2200' }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '56px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div title={fmt$(d.value)} style={{ width: '100%', background: i === new Date().getMonth() ? color : color + '55', borderRadius: '2px 2px 0 0', height: `${Math.max(3, (d.value / max) * 48)}px`, transition: 'height .4s ease', cursor: 'pointer' }} />
          <div style={{ fontSize: '8px', color: 'var(--muted)' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── WIDGET SHELL ─────────────────────────────────────────────────
function Widget({ id, title, icon, sub = null, onDragStart, onDragOver, onDrop, isDragging, children }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart?.(id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(id) }}
      onDrop={() => onDrop?.(id)}
      style={{
        background:    'var(--panel)',
        borderRadius:  'var(--radius)',
        border:        '1px solid var(--border)',
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        opacity:       isDragging ? 0.4 : 1,
        transition:    'opacity .15s, box-shadow .15s',
        cursor:        'grab',
      }}>
      <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{title}</span>
          {sub && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{sub}</span>}
        </div>
        <span style={{ fontSize: '11px', color: 'var(--border)', userSelect: 'none' }}>⋮⋮</span>
      </div>
      <div style={{ flex: 1, padding: '12px 14px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ── DETAIL POPUP ──────────────────────────────────────────────────
// Opens when clicking a widget — shows every row that made the number
function DetailPopup({ open, onClose, title, icon, children, width = 560 }) {
  if (!open) return null
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(3px)', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: width, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp .15s ease' }}>
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>{icon}</span>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)', padding: '4px 8px', borderRadius: '6px' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Row component for detail popups
function DetailRow({ left, right, sub = null, onClick, color = null }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default', transition: 'background .1s' }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--hov)'; e.currentTarget.style.margin = '0 -4px'; e.currentTarget.style.padding = '9px 4px' }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.margin = ''; e.currentTarget.style.padding = '9px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
        {sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {typeof right === 'string' || typeof right === 'number'
          ? <div style={{ fontSize: '13px', fontWeight: 700, color: color || 'var(--text)' }}>{right}</div>
          : right}
      </div>
    </div>
  )
}

// ── CUSTOMIZE PANEL ───────────────────────────────────────────────
function CustomizePanel({ prefs, onSave, onClose, role }) {
  const [visible, setVisible] = useState([...(prefs.visible || [])])
  const available = WIDGET_DEFS.filter(w => w.roles.includes(role))
  function toggle(id) {
    setVisible(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '420px', maxHeight: '80vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>🎛 Customize Dashboard</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>Toggle widgets on or off. Drag them on the dashboard to reorder.</div>
          {available.map(w => {
            const on = visible.includes(w.id)
            return (
              <div key={w.id} onClick={() => toggle(w.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`, background: on ? 'rgba(204,34,0,.04)' : 'transparent', cursor: 'pointer', marginBottom: '6px', transition: 'all .12s' }}>
                <span style={{ fontSize: '16px' }}>{w.icon}</span>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{w.label}</div>
                <div style={{ width: 34, height: 18, borderRadius: '99px', background: on ? 'var(--brand)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
                  <div style={{ position: 'absolute', top: 1, left: on ? 17 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave({ visible, order: visible }); onClose() }}>Save Layout</Btn>
        </div>
      </div>
    </div>
  )
}

// ── GOAL EDITOR (admin only) ──────────────────────────────────────
function GoalEditor({ goals, onSave, onClose }) {
  const [g, setG] = useState({ ...goals })
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '380px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>🎯 Edit Goals</div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <Field label="Agent Annual GCI Goal ($)">
            <Input value={g.agent_gci} onChange={v => setG(x => ({ ...x, agent_gci: parseNum(v) }))} type="number" placeholder="250000" />
          </Field>
          <Field label="Team Annual GCI Goal ($)">
            <Input value={g.team_gci} onChange={v => setG(x => ({ ...x, team_gci: parseNum(v) }))} type="number" placeholder="2000000" />
          </Field>
          <Field label="Team Deal Count Goal">
            <Input value={g.team_deals} onChange={v => setG(x => ({ ...x, team_deals: parseNum(v) }))} type="number" placeholder="200" />
          </Field>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave(g); onClose() }}>Save Goals</Btn>
        </div>
      </div>
    </div>
  )
}

// ── AGENT VIEW ADMIN CONTROL ──────────────────────────────────────
function AgentViewControl({ agents, onClose }) {
  const [sel, setSel]  = useState(agents[0]?.id || '')
  const [vis, setVis]  = useState([])
  const { toast }      = useApp()

  useEffect(() => {
    if (!sel) return
    const a = agents.find(x => x.id === sel)
    if (!a) return
    const p = getPrefs(sel, a.role)
    setVis(p.visible || [])
  }, [sel])

  const selAgent = agents.find(a => a.id === sel)
  const available = WIDGET_DEFS.filter(w => selAgent && w.roles.includes(selAgent.role))

  function save() {
    const a = agents.find(x => x.id === sel)
    if (!a) return
    savePrefs(sel, { visible: vis, order: vis })
    toast(`✅ Dashboard saved for ${a.name}`)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '500px', maxHeight: '85vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>⚙️ Manage Agent Dashboards</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {agents.map(a => (
              <div key={a.id} onClick={() => setSel(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${sel === a.id ? 'var(--brand)' : 'var(--border)'}`, background: sel === a.id ? 'rgba(204,34,0,.08)' : 'transparent', cursor: 'pointer' }}>
                <Avatar agent={a} size={20} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{a.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
          {selAgent && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
                Widgets visible to {selAgent.name}
              </div>
              {available.map(w => {
                const on = vis.includes(w.id)
                return (
                  <div key={w.id} onClick={() => setVis(v => on ? v.filter(x => x !== w.id) : [...v, w.id])}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`, background: on ? 'rgba(204,34,0,.04)' : 'transparent', cursor: 'pointer', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px' }}>{w.icon}</span>
                    <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{w.label}</div>
                    <div style={{ width: 32, height: 18, borderRadius: '99px', background: on ? 'var(--brand)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 1, left: on ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>Save for {selAgent?.name?.split(' ')[0]}</Btn>
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
  const [agentFilter, setAgentFilter] = useState('')
  const [yearFilter,  setYearFilter]  = useState(year)
  const [goals,       setGoals]       = useState(getGoals)
  const [prefs,       setPrefs]       = useState(null)
  const [agents,      setAgents]      = useState([])
  const [popup,       setPopup]       = useState(null) // which detail popup is open
  const [showCustomize, setShowCustomize]   = useState(false)
  const [showGoalEditor, setShowGoalEditor] = useState(false)
  const [showAgentView,  setShowAgentView]  = useState(false)
  const [dragId,      setDragId]      = useState(null)
  const [dragOverId,  setDragOverId]  = useState(null)

  useEffect(() => {
    if (!agent) return
    setPrefs(getPrefs(agent.id, agent.role))
  }, [agent?.id])

  const show = useCallback((id) => prefs?.visible?.includes(id), [prefs])

  // ── LOAD ALL DATA ────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!agent) return
    setLoading(true)
    try {
      const viewAgentId = agentFilter || ((isAdmin || canManage) ? null : agent.id)
      const filter = (arr) => viewAgentId ? arr.filter(x => x.agent_id === viewAgentId) : arr

      const [rawDeals, rawContacts, rawTasks, rawListings, rawOH, rawAnn, rawAgents, rawOffers, rawGifts] = await Promise.all([
        supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,expected_close_date,addr,client_name,agent_id,side,agents(id,name,color)').then(r => r.data || []),
        supabase.from('contacts').select('id,first_name,last_name,status,source,agent_id,created_at,phone').then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('listings').select('id,addr,city,status,list_price,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('open_houses').select('id,listing_addr,date,start_time,end_time,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('announcements').select('*,agents(id,name,color)').order('pinned', { ascending: false }).limit(5).then(r => r.data || []),
        supabase.from('agents').select('*').eq('active', true).order('name').then(r => r.data || []),
        supabase.from('offers').select('id,listing_addr,status,gci,production,agent_id,side').then(r => r.data || []),
        supabase.from('gifts').select('id,client_name,status,agent_id').then(r => r.data || []),
      ])

      const myDeals    = filter(rawDeals)
      const myContacts = filter(rawContacts)
      const myTasks    = filter(rawTasks)
      const myListings = filter(rawListings)
      const myOH       = filter(rawOH)

      const todayStr = new Date().toISOString().slice(0, 10)
      const weekEnd  = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
      const weekStr  = weekEnd.toISOString().slice(0, 10)

      // Year filter
      const yearDeals   = myDeals.filter(d => d.ao_date?.startsWith(yearFilter))
      const closedDeals = yearDeals.filter(d => d.stage === 'Closed')
      const activeDeals = myDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))

      // GCI
      const closedGCI   = closedDeals.reduce((s, d) => s + parseNum(d.gci), 0)
      const pipelineGCI = activeDeals.reduce((s, d) => s + parseNum(d.gci), 0)

      // Team GCI
      const teamClosed = rawDeals.filter(d => d.ao_date?.startsWith(yearFilter) && d.stage === 'Closed')
      const teamGCI    = teamClosed.reduce((s, d) => s + parseNum(d.gci), 0)
      const teamDeals  = teamClosed.length

      // Accepted offers (AO) — stage is 'Offer Accapted'
      const acceptedOffers     = myDeals.filter(d => d.stage === 'Offer Accapted')
      const acceptedOffersProd = acceptedOffers.reduce((s, d) => s + parseNum(d.production), 0)

      // Under Contract
      const underContract     = myDeals.filter(d => d.stage === 'Under Contract')
      const underContractProd = underContract.reduce((s, d) => s + parseNum(d.production), 0)

      // Today tasks
      const todayTasks   = myTasks.filter(t => t.status !== 'done' && (isDueToday(t.due_date) || isOverdue(t.due_date))).sort((a, b) => isOverdue(a.due_date) ? -1 : 1)
      const overdueTasks = myTasks.filter(t => t.status !== 'done' && isOverdue(t.due_date))

      // Hot leads
      const hotLeads = myContacts.filter(c => c.status === 'Hot' || c.status === 'Warm').sort((a, b) => a.status === 'Hot' ? -1 : 1)

      // Upcoming closings 30 days
      const upcoming = myDeals.filter(d => {
        const date = d.expected_close_date || d.close_date
        if (!date) return false
        const days = getDaysUntil(date)
        return days !== null && days >= 0 && days <= 30 && d.stage !== 'Closed'
      }).sort((a, b) => getDaysUntil(a.expected_close_date || a.close_date) - getDaysUntil(b.expected_close_date || b.close_date))

      // Active listings
      const activeListings = myListings.filter(l => l.status === 'Active')

      // Open houses this week
      const upcomingOH = myOH.filter(oh => oh.date >= todayStr && oh.date <= weekStr)

      // GCI by month
      const monthlyGCI = Array.from({ length: 12 }, (_, m) => {
        const ms = `${yearFilter}-${String(m+1).padStart(2,'0')}`
        const gci = myDeals.filter(d => d.ao_date?.startsWith(ms) && d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        return { label: 'JFMAMJJASOND'[m], value: gci }
      })

      // Leaderboard
      const leaderboard = rawAgents.map(a => {
        const ad = rawDeals.filter(d => d.agent_id === a.id && d.ao_date?.startsWith(yearFilter))
        const gci    = ad.filter(d => d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        const closed = ad.filter(d => d.stage === 'Closed').length
        const active = ad.filter(d => !['Closed','Deal Fell Through'].includes(d.stage)).length
        return { agent: a, gci, closed, active, total: ad.length }
      }).sort((a, b) => b.gci - a.gci)

      // Pipeline by stage
      const pipeByStage = DEAL_STAGES.map(s => ({
        ...s,
        deals: activeDeals.filter(d => d.stage === s.value),
        gci:   activeDeals.filter(d => d.stage === s.value).reduce((sum, d) => sum + parseNum(d.gci), 0),
      }))

      // Pending gifts
      const pendingGifts = rawGifts.filter(g => !['Delivered'].includes(g.status))

      setAgents(rawAgents)
      setData({
        closedGCI, pipelineGCI, closedDeals, activeDeals, yearDeals,
        teamGCI, teamDeals, todayTasks, overdueTasks,
        hotLeads, upcoming, activeListings, upcomingOH,
        monthlyGCI, leaderboard, pipeByStage,
        announcements: rawAnn, pendingGifts, allTasks: myTasks,
        contactCount: myContacts.length, hotCount: hotLeads.length,
        acceptedOffers, acceptedOffersProd, underContract, underContractProd,
        allDeals: myDeals, allListings: myListings, allContacts: myContacts,
      })
    } catch(e) {
      toast('Error loading dashboard: ' + e.message, '#DC2626')
    } finally { setLoading(false) }
  }, [agent?.id, agentFilter, yearFilter, isAdmin, canManage])

  useEffect(() => { load() }, [load])

  // ── DRAG TO REORDER ──────────────────────────────────────────
  function handleDragStart(id) { setDragId(id) }
  function handleDragOver(id)  { setDragOverId(id) }
  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const newOrder = [...(prefs?.order || prefs?.visible || [])]
    const fromIdx  = newOrder.indexOf(dragId)
    const toIdx    = newOrder.indexOf(targetId)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDragOverId(null); return }
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, dragId)
    const newPrefs = { ...prefs, order: newOrder, visible: newOrder.filter(id => prefs.visible.includes(id)) }
    setPrefs(newPrefs)
    savePrefs(agent.id, newPrefs)
    setDragId(null); setDragOverId(null)
  }

  function savePrefsAndUpdate(p) {
    setPrefs(p)
    savePrefs(agent.id, p)
    toast('✅ Dashboard saved')
  }

  function saveGoalsAndUpdate(g) {
    setGoals(g)
    saveGoals(g)
    toast('✅ Goals updated')
  }

  if (!agent || !prefs) return <div style={{ fontFamily: ff }}><Loading /></div>

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString())
  const orderedVisible = (prefs.order || prefs.visible || []).filter(id => prefs.visible?.includes(id))

  // Stage color helper
  const stageHex = (s) => DEAL_STAGES.find(x => x.value === s)?.hex || '#c4c4c4'

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── TOP BAR ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>{greeting}, {agent?.name?.split(' ')[0]} 👋</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(isAdmin || canManage) && (
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button onClick={load} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', fontFamily: ff }}>↻</button>
          {isAdmin && <Btn size="sm" variant="secondary" onClick={() => setShowGoalEditor(true)}>🎯 Goals</Btn>}
          {isAdmin && <Btn size="sm" variant="secondary" onClick={() => setShowAgentView(true)}>👥 Agent Views</Btn>}
          <Btn size="sm" variant="secondary" onClick={() => setShowCustomize(true)}>🎛 Customize</Btn>
        </div>
      </div>

      {/* Overdue alert banner */}
      {show('overdue_alert') && data.overdueTasks?.length > 0 && (
        <div onClick={() => setPopup('overdue_alert')}
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderLeft: '4px solid #DC2626' }}>
          <span>⚠️</span>
          <div style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>
            {data.overdueTasks.length} overdue task{data.overdueTasks.length > 1 ? 's' : ''} — click to view
          </div>
        </div>
      )}

      {/* Pinned announcements */}
      {show('announcements') && data.announcements?.filter(a => a.pinned).map(a => (
        <div key={a.id} style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: '10px', borderLeft: '4px solid #F5A623', display: 'flex', gap: '10px', cursor: 'pointer' }}
          onClick={() => navigate('/announcements')}>
          <span>📣</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', color: '#92400E' }}>{a.title}</div>
            {a.body && <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>{a.body}</div>}
          </div>
        </div>
      ))}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}><Loading /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', alignItems: 'start' }}>
          {orderedVisible.map(wid => {
            const def = WIDGET_DEFS.find(x => x.id === wid)
            if (!def) return null
            const dragProps = {
              id: wid, onDragStart: handleDragStart,
              onDragOver: handleDragOver, onDrop: handleDrop,
              isDragging: dragId === wid,
            }

            // ── GCI GOAL WIDGET ──
            if (wid === 'gci_goal') return (
              <Widget key={wid} {...dragProps} title="My GCI Goal" icon="🎯">
                <div onClick={() => setPopup('gci_goal')} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <GCIRing value={data.closedGCI} goal={goals.agent_gci} color="#CC2200" />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text)' }}>{pct(data.closedGCI, goals.agent_gci)}%</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(goals.agent_gci)} goal · {data.closedDeals?.length || 0} closed</div>
                    <div style={{ fontSize: '11px', color: '#F5A623', marginTop: '3px' }}>+ {fmt$(data.pipelineGCI)} pipeline</div>
                  </div>
                </div>
              </Widget>
            )

            // ── TEAM GOAL WIDGET ──
            if (wid === 'team_goal' && (isAdmin || canManage)) return (
              <Widget key={wid} {...dragProps} title="Team Goal" icon="🏆">
                <div onClick={() => setPopup('team_goal')} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <GCIRing value={data.teamGCI} goal={goals.team_gci} color="#F5A623" />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text)' }}>{pct(data.teamGCI, goals.team_gci)}%</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#F5A623' }}>{fmt$(data.teamGCI)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(goals.team_gci)} · {data.teamDeals}/{goals.team_deals} deals</div>
                  </div>
                </div>
              </Widget>
            )

            // ── QUICK STATS WIDGET ──
            if (wid === 'quick_stats') return (
              <Widget key={wid} {...dragProps} title="Quick Stats" icon="📊" sub={yearFilter}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { label: 'Active Deals',     value: data.activeDeals?.length || 0,    color: '#3B82F6', popup: 'active_deals',    nav: '/production' },
                    { label: 'Accepted Offers',  value: data.acceptedOffers?.length || 0, color: '#00c875', popup: 'accepted_offers',  nav: '/production' },
                    { label: 'Under Contract',   value: data.underContract?.length || 0,  color: '#9d50dd', popup: 'under_contract',   nav: '/production' },
                    { label: 'Hot Leads',        value: data.hotCount || 0,               color: '#DC2626', popup: 'hot_leads',        nav: '/contacts' },
                    { label: 'Active Listings',  value: data.activeListings?.length || 0, color: '#10B981', popup: 'active_listings',  nav: '/listings' },
                    { label: 'Closed GCI',       value: fmt$(data.closedGCI),             color: '#F5A623', popup: 'gci_goal',         nav: '/production' },
                  ].map(s => (
                    <div key={s.label} onClick={() => setPopup(s.popup)}
                      style={{ padding: '10px 12px', background: 'var(--dim)', borderRadius: '8px', cursor: 'pointer', borderTop: `3px solid ${s.color}`, transition: 'box-shadow .12s' }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </Widget>
            )

            // ── PIPELINE WIDGET ──
            if (wid === 'pipeline') return (
              <Widget key={wid} {...dragProps} title="Pipeline by Stage" icon="🔀">
                <div>
                  {data.pipeByStage?.filter(s => s.deals.length > 0).map(s => (
                    <div key={s.value} onClick={() => setPopup(`stage_${s.value}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.hex, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{s.deals.length}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: s.hex, flexShrink: 0 }}>{fmt$(s.gci)}</div>
                      <div style={{ width: '60px', height: '5px', background: 'var(--dim)', borderRadius: '99px', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ height: '100%', background: s.hex, width: `${pct(s.deals.length, data.activeDeals?.length || 1)}%` }} />
                      </div>
                    </div>
                  ))}
                  {!data.pipeByStage?.some(s => s.deals.length > 0) && <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>No active deals</div>}
                  <button onClick={() => navigate('/pipeline')} style={{ marginTop: '8px', fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff, padding: 0 }}>View Pipeline →</button>
                </div>
              </Widget>
            )

            // ── TODAY'S TASKS WIDGET ──
            if (wid === 'todays_tasks') return (
              <Widget key={wid} {...dragProps} title="Today's Tasks" icon="✅" sub={`(${data.todayTasks?.length || 0})`}>
                <div>
                  {data.todayTasks?.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>🎉 All clear!</div>}
                  {data.todayTasks?.slice(0, 5).map(t => (
                    <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: isOverdue(t.due_date) ? '#DC2626' : '#F97316' }} />
                      <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      {isOverdue(t.due_date) && <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 700 }}>LATE</span>}
                    </div>
                  ))}
                  {data.todayTasks?.length > 5 && (
                    <div onClick={() => setPopup('todays_tasks')} style={{ fontSize: '11px', color: 'var(--brand)', cursor: 'pointer', marginTop: '6px' }}>
                      +{data.todayTasks.length - 5} more — view all
                    </div>
                  )}
                  <button onClick={() => navigate('/tasks/new')} style={{ marginTop: '8px', width: '100%', padding: '6px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', fontFamily: ff }}>+ Quick Add Task</button>
                </div>
              </Widget>
            )

            // ── HOT LEADS WIDGET ──
            if (wid === 'hot_leads') return (
              <Widget key={wid} {...dragProps} title="Hot & Warm Leads" icon="🔥" sub={`(${data.hotLeads?.length || 0})`}>
                <div>
                  {data.hotLeads?.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>No hot leads</div>}
                  {data.hotLeads?.slice(0, 5).map(c => (
                    <div key={c.id} onClick={() => navigate('/contacts/' + c.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.status === 'Hot' ? '#DC2626' : '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                        {initials(c.first_name + ' ' + (c.last_name || ''))}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name}</div>
                        {c.phone && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{c.phone}</div>}
                      </div>
                      <Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />
                    </div>
                  ))}
                  {data.hotLeads?.length > 5 && (
                    <div onClick={() => setPopup('hot_leads')} style={{ fontSize: '11px', color: 'var(--brand)', cursor: 'pointer', marginTop: '6px' }}>
                      +{data.hotLeads.length - 5} more — view all
                    </div>
                  )}
                </div>
              </Widget>
            )

            // ── ACTIVE DEALS WIDGET ──
            if (wid === 'active_deals') return (
              <Widget key={wid} {...dragProps} title="Active Deals" icon="💼" sub={`(${data.activeDeals?.length || 0})`}>
                <div>
                  {data.activeDeals?.slice(0, 4).map(d => (
                    <div key={d.id} onClick={() => navigate('/production/' + d.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                        {d.client_name && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{d.client_name}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
                        <Pill label={d.stage} color={stageHex(d.stage)} />
                      </div>
                    </div>
                  ))}
                  <div onClick={() => setPopup('active_deals')} style={{ fontSize: '11px', color: 'var(--brand)', cursor: 'pointer', marginTop: '8px' }}>View all {data.activeDeals?.length} active deals →</div>
                </div>
              </Widget>
            )

            // ── UPCOMING CLOSINGS WIDGET ──
            if (wid === 'upcoming_close') return (
              <Widget key={wid} {...dragProps} title="Upcoming Closings" icon="📅" sub="30 days">
                <div>
                  {data.upcoming?.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>No closings in 30 days</div>}
                  {data.upcoming?.slice(0, 4).map(d => {
                    const days = getDaysUntil(d.expected_close_date || d.close_date)
                    return (
                      <div key={d.id} onClick={() => navigate('/production/' + d.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '8px', background: days <= 7 ? '#FEF2F2' : '#F0FDF4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: days <= 7 ? '#DC2626' : '#10B981' }}>{days}</div>
                          <div style={{ fontSize: '8px', color: days <= 7 ? '#DC2626' : '#10B981' }}>days</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(d.expected_close_date || d.close_date)}</div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981', flexShrink: 0 }}>{fmt$(d.gci)}</div>
                      </div>
                    )
                  })}
                  {data.upcoming?.length > 4 && <div onClick={() => setPopup('upcoming_close')} style={{ fontSize: '11px', color: 'var(--brand)', cursor: 'pointer', marginTop: '6px' }}>+{data.upcoming.length - 4} more →</div>}
                </div>
              </Widget>
            )

            // ── ACTIVE LISTINGS WIDGET ──
            if (wid === 'active_listings') return (
              <Widget key={wid} {...dragProps} title="Active Listings" icon="🏡" sub={`(${data.activeListings?.length || 0})`}>
                <div>
                  {data.activeListings?.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>No active listings</div>}
                  {data.activeListings?.slice(0, 5).map(l => (
                    <div key={l.id} onClick={() => navigate('/listings/' + l.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.addr}</div>
                        {l.city && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{l.city}</div>}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)', flexShrink: 0 }}>{fmt$(l.list_price)}</div>
                    </div>
                  ))}
                  <div onClick={() => setPopup('active_listings')} style={{ fontSize: '11px', color: 'var(--brand)', cursor: 'pointer', marginTop: '8px' }}>View all listings →</div>
                </div>
              </Widget>
            )

            // ── OPEN HOUSES WIDGET ──
            if (wid === 'open_houses') return (
              <Widget key={wid} {...dragProps} title="Open Houses This Week" icon="🚪">
                <div>
                  {data.upcomingOH?.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>No open houses this week</div>}
                  {data.upcomingOH?.map(oh => (
                    <div key={oh.id} onClick={() => navigate('/openhouse/' + oh.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oh.listing_addr}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(oh.date)} {oh.start_time && `· ${oh.start_time}`}</div>
                      </div>
                      {oh.agents && <Avatar agent={oh.agents} size={20} />}
                    </div>
                  ))}
                </div>
              </Widget>
            )

            // ── LEADERBOARD WIDGET ──
            if (wid === 'leaderboard' && (isAdmin || canManage)) return (
              <Widget key={wid} {...dragProps} title={`Leaderboard ${yearFilter}`} icon="🥇">
                <div>
                  {data.leaderboard?.filter(r => r.gci > 0 || r.total > 0).slice(0, 6).map((row, i) => (
                    <div key={row.agent.id} onClick={() => { setAgentFilter(row.agent.id); setPopup('gci_goal') }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ fontSize: '14px', minWidth: '20px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</div>
                      <Avatar agent={row.agent} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.agent.name}</div>
                        <div style={{ height: '3px', background: 'var(--dim)', borderRadius: '99px', marginTop: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: row.agent.color || '#CC2200', width: `${pct(row.gci, goals.agent_gci)}%` }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>{fmt$(row.gci)}</div>
                        <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{row.closed} closed</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Widget>
            )

            // ── GCI CHART WIDGET ──
            if (wid === 'gci_chart') return (
              <Widget key={wid} {...dragProps} title={`GCI by Month ${yearFilter}`} icon="📈">
                <div>
                  <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>closed {yearFilter}</span>
                  </div>
                  <MiniBar data={data.monthlyGCI} color="#CC2200" />
                </div>
              </Widget>
            )

            // ── GIFTS PENDING WIDGET ──
            if (wid === 'gifts_pending' && (isAdmin || canManage)) return (
              <Widget key={wid} {...dragProps} title="Gifts Pending" icon="🎁" sub={`(${data.pendingGifts?.length || 0})`}>
                <div>
                  {data.pendingGifts?.length === 0 && <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>All delivered ✅</div>}
                  {data.pendingGifts?.slice(0, 5).map(g => (
                    <div key={g.id} onClick={() => navigate('/gifts/' + g.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)' }}>{g.client_name}</div>
                      <Pill label={g.status} color="#9d50dd" />
                    </div>
                  ))}
                  {data.pendingGifts?.length > 5 && <div onClick={() => setPopup('gifts_pending')} style={{ fontSize: '11px', color: 'var(--brand)', cursor: 'pointer', marginTop: '6px' }}>+{data.pendingGifts.length - 5} more →</div>}
                </div>
              </Widget>
            )

            // ── QUICK ADD WIDGET ──
            if (wid === 'quick_add') return (
              <Widget key={wid} {...dragProps} title="Quick Add" icon="⚡">
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { label: '+ Lead',    path: '/contacts/new',   color: '#0EA5E9' },
                    { label: '+ Deal',    path: '/production/new', color: '#10B981' },
                    { label: '+ Task',    path: '/tasks/new',      color: '#8B5CF6' },
                    { label: '+ Listing', path: '/listings/new',   color: '#F5A623' },
                    { label: '+ Offer',   path: '/offers/new',     color: '#6366F1' },
                    { label: '+ OH',      path: '/openhouse/new',  color: '#14B8A6' },
                    { label: '+ Gift',    path: '/gifts/new',      color: '#EC4899' },
                    { label: '+ Event',   path: '/calendar/new',   color: '#CC2200' },
                  ].map(item => (
                    <button key={item.path} onClick={() => navigate(item.path)}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${item.color}33`, background: item.color + '11', color: item.color, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </Widget>
            )

            return null
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* DETAIL POPUPS — click any widget stat to open these  */}
      {/* ══════════════════════════════════════════════════════ */}

      {/* GCI Goal Detail */}
      <DetailPopup open={popup === 'gci_goal'} onClose={() => setPopup(null)} title="Closed Deals — GCI Detail" icon="🎯" width={600}>
        <div style={{ marginBottom: '12px', padding: '12px 14px', background: 'var(--dim)', borderRadius: '8px', display: 'flex', gap: '20px' }}>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Closed GCI {yearFilter}</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#F5A623' }}>{fmt$(data.pipelineGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Pipeline GCI</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{data.closedDeals?.length || 0}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Closed Deals</div></div>
        </div>
        {data.closedDeals?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || ''} · ${d.side || ''} · ${fmtDate(d.ao_date)}`} right={fmt$(d.gci)} color="#10B981" onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.closedDeals?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No closed deals in {yearFilter}</div>}
      </DetailPopup>

      {/* Team Goal Detail */}
      <DetailPopup open={popup === 'team_goal'} onClose={() => setPopup(null)} title="Team Goal Detail" icon="🏆" width={640}>
        <div style={{ marginBottom: '12px', padding: '12px 14px', background: 'var(--dim)', borderRadius: '8px', display: 'flex', gap: '20px' }}>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#F5A623' }}>{fmt$(data.teamGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Team GCI {yearFilter}</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{data.teamDeals}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Deals Closed</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{pct(data.teamGCI, goals.team_gci)}%</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Goal Progress</div></div>
        </div>
        {data.leaderboard?.map((row, i) => (
          <DetailRow key={row.agent.id}
            left={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span><Avatar agent={row.agent} size={24} /><span>{row.agent.name}</span></div>}
            sub={`${row.closed} closed · ${row.active} active`}
            right={fmt$(row.gci)} color="#10B981" />
        ))}
      </DetailPopup>

      {/* Active Deals Detail */}
      <DetailPopup open={popup === 'active_deals'} onClose={() => setPopup(null)} title="All Active Deals" icon="💼" width={640}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>{data.activeDeals?.length} active deals · {fmt$(data.pipelineGCI)} pipeline GCI</div>
        {data.activeDeals?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · ${d.side || ''}`}
            right={<div style={{ textAlign: 'right' }}><div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div><Pill label={d.stage} color={stageHex(d.stage)} /></div>}
            onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.activeDeals?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No active deals</div>}
      </DetailPopup>

      {/* Accepted Offers Detail */}
      <DetailPopup open={popup === 'accepted_offers'} onClose={() => setPopup(null)} title="Accepted Offers (AO)" icon="✅" width={600}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>{data.acceptedOffers?.length} accepted offers · {fmt$(data.acceptedOffersProd)} total production</div>
        {data.acceptedOffers?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={d.client_name || '—'} right={fmt$(d.production)} color="#00c875" onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.acceptedOffers?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No accepted offers</div>}
      </DetailPopup>

      {/* Under Contract Detail */}
      <DetailPopup open={popup === 'under_contract'} onClose={() => setPopup(null)} title="Under Contract" icon="📝" width={600}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>{data.underContract?.length} under contract · {fmt$(data.underContractProd)} total production</div>
        {data.underContract?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={d.client_name || '—'} right={fmt$(d.production)} color="#9d50dd" onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.underContract?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No deals under contract</div>}
      </DetailPopup>

      {/* Hot Leads Detail */}
      <DetailPopup open={popup === 'hot_leads'} onClose={() => setPopup(null)} title="Hot & Warm Leads" icon="🔥" width={560}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>{data.hotLeads?.length} hot and warm leads</div>
        {data.hotLeads?.map(c => (
          <DetailRow key={c.id} left={`${c.first_name} ${c.last_name || ''}`} sub={c.phone || c.source || ''}
            right={<Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />}
            onClick={() => { navigate('/contacts/' + c.id); setPopup(null) }} />
        ))}
      </DetailPopup>

      {/* Active Listings Detail */}
      <DetailPopup open={popup === 'active_listings'} onClose={() => setPopup(null)} title="Active Listings" icon="🏡" width={560}>
        {data.activeListings?.map(l => (
          <DetailRow key={l.id} left={l.addr} sub={l.city || ''} right={fmt$(l.list_price)} color="var(--brand)" onClick={() => { navigate('/listings/' + l.id); setPopup(null) }} />
        ))}
        {!data.activeListings?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No active listings</div>}
      </DetailPopup>

      {/* Today's Tasks Detail */}
      <DetailPopup open={popup === 'todays_tasks'} onClose={() => setPopup(null)} title="Today's Tasks" icon="✅" width={520}>
        {data.todayTasks?.map(t => (
          <DetailRow key={t.id} left={t.title} sub={isOverdue(t.due_date) ? 'OVERDUE' : 'Due today'}
            right={<Pill label={isOverdue(t.due_date) ? '⚠️ Late' : '📅 Today'} color={isOverdue(t.due_date) ? '#DC2626' : '#F97316'} />}
            onClick={() => { navigate('/tasks/' + t.id); setPopup(null) }} />
        ))}
        {!data.todayTasks?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>Nothing due today!</div>}
      </DetailPopup>

      {/* Overdue Alert Detail */}
      <DetailPopup open={popup === 'overdue_alert'} onClose={() => setPopup(null)} title="Overdue Tasks" icon="⚠️" width={520}>
        {data.overdueTasks?.map(t => (
          <DetailRow key={t.id} left={t.title} sub={`Due ${fmtDate(t.due_date)}`}
            right={<Pill label="OVERDUE" color="#DC2626" />}
            onClick={() => { navigate('/tasks/' + t.id); setPopup(null) }} />
        ))}
      </DetailPopup>

      {/* Upcoming Closings Detail */}
      <DetailPopup open={popup === 'upcoming_close'} onClose={() => setPopup(null)} title="Upcoming Closings" icon="📅" width={580}>
        {data.upcoming?.map(d => {
          const days = getDaysUntil(d.expected_close_date || d.close_date)
          return (
            <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · Closes ${fmtDate(d.expected_close_date || d.close_date)}`}
              right={<div style={{ textAlign: 'right' }}><div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div><div style={{ fontSize: '10px', color: days <= 7 ? '#DC2626' : 'var(--muted)', fontWeight: days <= 7 ? 700 : 400 }}>{days} days</div></div>}
              onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
          )
        })}
        {!data.upcoming?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No closings in the next 30 days</div>}
      </DetailPopup>

      {/* Pipeline Stage Popups */}
      {DEAL_STAGES.map(s => (
        <DetailPopup key={s.value} open={popup === `stage_${s.value}`} onClose={() => setPopup(null)} title={`${s.label} — Deals`} icon="🔀" width={580}>
          {data.pipeByStage?.find(x => x.value === s.value)?.deals?.map(d => (
            <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · ${d.side || ''} · AO ${fmtDate(d.ao_date)}`}
              right={fmt$(d.gci)} color="#10B981"
              onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
          ))}
        </DetailPopup>
      ))}

      {/* Gifts Pending Detail */}
      <DetailPopup open={popup === 'gifts_pending'} onClose={() => setPopup(null)} title="Pending Gifts" icon="🎁" width={480}>
        {data.pendingGifts?.map(g => (
          <DetailRow key={g.id} left={g.client_name} right={<Pill label={g.status} color="#9d50dd" />}
            onClick={() => { navigate('/gifts/' + g.id); setPopup(null) }} />
        ))}
      </DetailPopup>

      {/* ── OVERLAYS ── */}
      {showCustomize && <CustomizePanel prefs={prefs} onSave={savePrefsAndUpdate} onClose={() => setShowCustomize(false)} role={agent.role} />}
      {showGoalEditor && isAdmin && <GoalEditor goals={goals} onSave={saveGoalsAndUpdate} onClose={() => setShowGoalEditor(false)} />}
      {showAgentView  && isAdmin && <AgentViewControl agents={agents} onClose={() => setShowAgentView(false)} />}
    </div>
  )
}
