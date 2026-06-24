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

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import {
  loadDashPrefs, saveDashPrefs,
  loadAgentGoals, saveAgentGoal,
  loadTeamGoal, saveTeamGoal,
  DEFAULT_WIDGETS
} from '../lib/dashboardPrefs'
import {
  fmt$, fmtDate, parseNum, pct, initials,
  isOverdue, isDueToday, getDaysUntil
} from '../lib/utils'
import { DEAL_STAGES } from '../lib/constants'
import { Avatar, Pill, Btn, Loading, Spinner, Field, Input } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── WIDGET REGISTRY ───────────────────────────────────────────────
const WIDGET_DEFS = {
  gci_goal:        { label: 'My GCI Goal',           icon: '🎯', roles: ['admin','secretary','agent'] },
  team_goal:       { label: 'Team Goal',             icon: '🏆', roles: ['admin','secretary'] },
  quick_stats:     { label: 'Quick Stats',           icon: '📊', roles: ['admin','secretary','agent'] },
  pipeline:        { label: 'Pipeline by Stage',     icon: '🔀', roles: ['admin','secretary','agent'] },
  todays_tasks:    { label: "Today's Tasks",         icon: '✅', roles: ['admin','secretary','agent'] },
  hot_leads:       { label: 'Hot & Warm Leads',      icon: '🔥', roles: ['admin','secretary','agent'] },
  active_deals:    { label: 'Active Deals',          icon: '💼', roles: ['admin','secretary','agent'] },
  upcoming_close:  { label: 'Upcoming Closings',     icon: '📅', roles: ['admin','secretary','agent'] },
  active_listings: { label: 'Active Listings',       icon: '🏡', roles: ['admin','secretary','agent'] },
  leaderboard:     { label: 'Team Leaderboard',      icon: '🥇', roles: ['admin','secretary'] },
  gci_chart:       { label: 'GCI by Month',          icon: '📈', roles: ['admin','secretary','agent'] },
  open_houses:     { label: 'Open Houses This Week', icon: '🚪', roles: ['admin','secretary','agent'] },
  gifts_pending:   { label: 'Gifts Pending',         icon: '🎁', roles: ['admin','secretary'] },
  quick_add:       { label: 'Quick Add',             icon: '⚡', roles: ['admin','secretary','agent'] },
  overdue_alert:   { label: 'Overdue Alert',         icon: '⚠️',  roles: ['admin','secretary','agent'] },
  announcements:   { label: 'Announcements',         icon: '📣', roles: ['admin','secretary','agent'] },
  // Custom board widgets — defined by the user at runtime
  custom:          { label: 'Custom Widget',         icon: '🔲', roles: ['admin','secretary','agent'] },
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
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px' }}>
      {data.map((d, i) => (
        <div key={i} title={fmt$(d.value)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{ width: '100%', background: i === curMonth ? color : color + '44', borderRadius: '2px 2px 0 0', height: `${Math.max(3, (d.value / max) * 50)}px`, transition: 'height .4s ease' }} />
          <div style={{ fontSize: '8px', color: 'var(--muted)' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM WIDGET BUILDER
// Admin can create a widget showing any board: Contacts, Deals,
// Tasks, Listings, etc. with a status/field filter and a chosen
// display mode (count, list, or table).
// ═══════════════════════════════════════════════════════════════

const BOARD_OPTIONS = [
  { id: 'contacts',      label: 'Contacts',      icon: '👤', table: 'contacts',     statusField: 'status',  nameField: 'first_name', statusOptions: ['New','Hot','Warm','Cold','Active','Nurturing','Closed','Unresponsive'] },
  { id: 'deals',         label: 'Deals',         icon: '💼', table: 'deals',        statusField: 'stage',   nameField: 'addr',       statusOptions: ['Negotiations','Offer Accapted','Under Shtar','Under Contract','Closed','Deal Fell Through'] },
  { id: 'tasks',         label: 'Tasks',         icon: '✅', table: 'tasks',        statusField: 'status',  nameField: 'title',      statusOptions: ['pending','in_progress','done','cancelled'] },
  { id: 'listings',      label: 'Listings',      icon: '🏡', table: 'listings',     statusField: 'status',  nameField: 'addr',       statusOptions: ['Active','Under Contract','Sold','Expired','Withdrawn'] },
  { id: 'calls',         label: 'Calls',         icon: '📞', table: 'calls',        statusField: 'outcome', nameField: 'contact_name',statusOptions: ['Answered','Voicemail','No Answer','Busy','Left Message'] },
  { id: 'gifts',         label: 'Gifts',         icon: '🎁', table: 'gifts',        statusField: 'status',  nameField: 'client_name', statusOptions: ['Pending','Ordered','Delivered'] },
  { id: 'open_houses',   label: 'Open Houses',   icon: '🚪', table: 'open_houses',  statusField: null,      nameField: 'listing_addr',statusOptions: [] },
  { id: 'offers',        label: 'Offers',        icon: '📝', table: 'offers',       statusField: 'status',  nameField: 'addr',        statusOptions: ['Pending','Accepted','Rejected','Countered'] },
  { id: 'announcements', label: 'Announcements', icon: '📣', table: 'announcements',statusField: 'priority',nameField: 'title',       statusOptions: ['low','normal','high','urgent'] },
]

const DISPLAY_OPTIONS = [
  { id: 'count',  label: 'Count only',    icon: '🔢' },
  { id: 'list',   label: 'Item list',     icon: '📋' },
  { id: 'table',  label: 'Mini table',   icon: '📊' },
]

function CustomWidgetBuilder({ onSave, onClose }) {
  const [step,     setStep]    = useState(1) // 1=board, 2=filter, 3=display
  const [board,    setBoard]   = useState(null)
  const [statuses, setStatus]  = useState([]) // [] = all
  const [display,  setDisplay] = useState('list')
  const [label,    setLabel]   = useState('')
  const [color,    setColor]   = useState('#3B82F6')
  const ff2 = 'Inter,system-ui,sans-serif'

  const boardDef = BOARD_OPTIONS.find(b => b.id === board)

  function finish() {
    if (!board) return
    const widgetLabel = label.trim() || (boardDef?.label + (statuses.length ? ' · ' + statuses.slice(0,2).join(', ') : ''))
    onSave({
      id:           'custom_' + Date.now(),
      size:         'md',
      color,
      visible:      true,
      customConfig: { board, statuses, display, label: widgetLabel, icon: boardDef?.icon || '🔲' },
    })
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px', fontFamily:ff2 }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'520px', boxShadow:'0 20px 50px rgba(0,0,0,.3)', display:'flex', flexDirection:'column', maxHeight:'90vh', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>🔲 Create Custom Widget</div>
            <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>Step {step} of 3</div>
          </div>
          {/* Progress dots */}
          <div style={{ display:'flex', gap:'5px' }}>
            {[1,2,3].map(s => (
              <div key={s} style={{ width:8, height:8, borderRadius:'50%', background: step >= s ? '#CC2200' : 'var(--border)', transition:'background .2s' }} />
            ))}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>
          {/* Step 1: Choose board */}
          {step === 1 && (
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'12px' }}>Which board do you want to show?</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                {BOARD_OPTIONS.map(b => (
                  <div key={b.id} onClick={() => { setBoard(b.id); setStatus([]) }}
                    style={{ padding:'12px', borderRadius:'9px', border:`2px solid ${board === b.id ? '#CC2200' : 'var(--border)'}`, background: board === b.id ? 'rgba(204,34,0,.06)' : 'var(--dim)', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px' }}>
                    <span style={{ fontSize:'20px' }}>{b.icon}</span>
                    <span style={{ fontSize:'13px', fontWeight:700, color: board === b.id ? '#CC2200' : 'var(--text)' }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Filter by status */}
          {step === 2 && boardDef && (
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'4px' }}>Filter by status (optional)</div>
              <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'12px' }}>Leave all unchecked to show everything</div>
              {boardDef.statusOptions.length > 0 ? (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'16px' }}>
                  {boardDef.statusOptions.map(s => {
                    const on = statuses.includes(s)
                    return (
                      <div key={s} onClick={() => setStatus(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                        style={{ padding:'5px 12px', borderRadius:'20px', border:`1px solid ${on ? '#CC2200' : 'var(--border)'}`, background: on ? 'rgba(204,34,0,.1)' : 'var(--dim)', cursor:'pointer', fontSize:'12px', fontWeight:600, color: on ? '#CC2200' : 'var(--muted)' }}>
                        {s}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ padding:'12px', background:'var(--dim)', borderRadius:'8px', fontSize:'12px', color:'var(--muted)', marginBottom:'16px' }}>
                  This board has no status filter — all items will be shown.
                </div>
              )}
              <div style={{ marginBottom:'12px' }}>
                <div style={{ fontSize:'12px', fontWeight:600, color:'var(--muted)', marginBottom:'6px' }}>Widget name (optional)</div>
                <input value={label} onChange={e => setLabel(e.target.value)}
                  placeholder={boardDef.label + (statuses.length ? ' · ' + statuses[0] : '')}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff2, boxSizing:'border-box' }} />
              </div>
            </div>
          )}

          {/* Step 3: Display + color */}
          {step === 3 && (
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)', marginBottom:'12px' }}>How should it display?</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'20px' }}>
                {DISPLAY_OPTIONS.map(d => (
                  <div key={d.id} onClick={() => setDisplay(d.id)}
                    style={{ padding:'12px 14px', borderRadius:'9px', border:`2px solid ${display === d.id ? '#CC2200' : 'var(--border)'}`, background: display === d.id ? 'rgba(204,34,0,.06)' : 'var(--dim)', cursor:'pointer', display:'flex', alignItems:'center', gap:'10px' }}>
                    <span style={{ fontSize:'18px' }}>{d.icon}</span>
                    <div>
                      <div style={{ fontSize:'13px', fontWeight:700, color: display === d.id ? '#CC2200' : 'var(--text)' }}>{d.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:'12px', fontWeight:600, color:'var(--muted)', marginBottom:'8px' }}>Widget color</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                {['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16','#0EA5E9'].map(c => (
                  <div key={c} onClick={() => setColor(c)}
                    style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border: color === c ? '3px solid var(--text)' : '2px solid transparent', transition:'border .1s' }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          {step > 1 && <Btn variant="secondary" onClick={() => setStep(s => s - 1)}>← Back</Btn>}
          {step < 3 && <Btn onClick={() => { if (!board && step === 1) return; setStep(s => s + 1) }} style={{ opacity: !board && step === 1 ? 0.5 : 1 }}>Next →</Btn>}
          {step === 3 && <Btn onClick={finish} style={{ background:'#10B981', border:'none' }}>✅ Add Widget</Btn>}
        </div>
      </div>
    </div>
  )
}

// ── CUSTOM WIDGET RENDERER ────────────────────────────────────────
function CustomWidgetContent({ config, agentId }) {
  const [items, setItems] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { supabase: sb } = { supabase } // use global supabase

  useEffect(() => {
    if (!config?.board) return
    const boardDef = BOARD_OPTIONS.find(b => b.id === config.board)
    if (!boardDef) return

    async function load() {
      setLoading(true)
      try {
        let q = supabase.from(boardDef.table).select('*').eq('agent_id', agentId).limit(50)
        if (config.statuses?.length && boardDef.statusField) {
          q = q.in(boardDef.statusField, config.statuses)
        }
        const { data, count: cnt } = await q
        setItems(data || [])
        setCount(cnt || (data?.length || 0))
      } catch { setItems([]); setCount(0) }
      finally { setLoading(false) }
    }
    load()
  }, [config?.board, JSON.stringify(config?.statuses), agentId])

  const boardDef = BOARD_OPTIONS.find(b => b.id === config?.board)
  if (!boardDef) return <div style={{ color:'var(--muted)', fontSize:'12px' }}>Board not found</div>
  if (loading)   return <div style={{ color:'var(--muted)', fontSize:'12px' }}>Loading...</div>

  if (config.display === 'count') {
    return (
      <div style={{ textAlign:'center', padding:'16px 0' }}>
        <div style={{ fontSize:'48px', fontWeight:900, color:'var(--text)' }}>{count}</div>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'4px' }}>
          {config.statuses?.length ? config.statuses.join(', ') : 'Total'} {boardDef.label}
        </div>
      </div>
    )
  }

  if (config.display === 'list') {
    return (
      <div>
        {items.slice(0,6).map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:'12px' }}>{boardDef.icon}</span>
            <div style={{ flex:1, fontSize:'12px', fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {item[boardDef.nameField] || 'Untitled'}
            </div>
            {boardDef.statusField && item[boardDef.statusField] && (
              <span style={{ fontSize:'10px', color:'var(--muted)', fontWeight:600, flexShrink:0 }}>{item[boardDef.statusField]}</span>
            )}
          </div>
        ))}
        {count === 0 && <div style={{ textAlign:'center', padding:'12px', color:'var(--muted)', fontSize:'12px' }}>No items</div>}
        {count > 6 && <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'6px', textAlign:'right' }}>+{count - 6} more</div>}
      </div>
    )
  }

  // table display
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
        <thead>
          <tr style={{ borderBottom:'1px solid var(--border)' }}>
            <th style={{ textAlign:'left', padding:'4px 0', color:'var(--muted)', fontWeight:700 }}>Name</th>
            {boardDef.statusField && <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)', fontWeight:700 }}>Status</th>}
          </tr>
        </thead>
        <tbody>
          {items.slice(0,8).map((item, i) => (
            <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
              <td style={{ padding:'4px 0', color:'var(--text)', fontWeight:600, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item[boardDef.nameField] || 'Untitled'}
              </td>
              {boardDef.statusField && (
                <td style={{ padding:'4px 8px', color:'var(--muted)' }}>{item[boardDef.statusField] || '—'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {count === 0 && <div style={{ textAlign:'center', padding:'12px', color:'var(--muted)', fontSize:'12px' }}>No items</div>}
    </div>
  )
}

// ── DETAIL POPUP ──────────────────────────────────────────────────
function DetailPopup({ open, onClose, title, icon, children, width = 580 }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [open])

  if (!open) return null
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(3px)', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: '16px', width: '100%', maxWidth: width, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.35)', animation: 'fadeUp .15s ease' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>{icon}</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{title}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)', padding: '4px 8px' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>{children}</div>
      </div>
    </div>
  )
}

function DetailRow({ left, sub, right, onClick, badge }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 8px', borderBottom: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default', borderRadius: '6px', transition: 'background .1s' }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--hov)' }}
      onMouseLeave={e => e.currentTarget.style.background = ''}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
        {sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        {badge && <div style={{ marginBottom: '3px' }}>{badge}</div>}
        {right && <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{right}</div>}
      </div>
      {onClick && <span style={{ color: 'var(--muted)', fontSize: '12px', flexShrink: 0 }}>→</span>}
    </div>
  )
}

// ── WIDGET SETTINGS PANEL ─────────────────────────────────────────
function WidgetSettings({ widget, onUpdate, onClose }) {
  const [color,   setColor]   = useState(widget.color || '#CC2200')
  const [size,    setSize]    = useState(widget.size  || 'md')
  const [visible, setVisible] = useState(widget.visible !== false)

  function save() {
    onUpdate({ ...widget, color, size, visible })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '360px', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            {WIDGET_DEFS[widget.id]?.icon} Widget Settings
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Accent Color</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
            {ACCENT_COLORS.map(c => (
              <div key={c} onClick={() => setColor(c)}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--text)' : '2px solid transparent', transition: 'border .12s', boxShadow: color === c ? '0 0 0 1px var(--panel)' : 'none' }} />
            ))}
          </div>

          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Width</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[
              { value: 'md', label: 'Half Width',  desc: '1 column' },
              { value: 'lg', label: 'Full Width',  desc: '2 columns' },
            ].map(s => (
              <div key={s.value} onClick={() => setSize(s.value)}
                style={{ flex: 1, padding: '10px 12px', border: `2px solid ${size === s.value ? color : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', background: size === s.value ? color + '11' : 'transparent', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: size === s.value ? color : 'var(--text)' }}>{s.label}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <div onClick={() => setVisible(v => !v)}
              style={{ width: 36, height: 20, borderRadius: '99px', background: visible ? color : 'var(--border)', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 2, left: visible ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>Visible on dashboard</span>
          </label>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} style={{ background: color }}>Save</Btn>
        </div>
      </div>
    </div>
  )
}

// ── CUSTOMIZE PANEL ───────────────────────────────────────────────
function CustomizePanel({ widgets, onSave, onClose, role }) {
  const [wids, setWids] = useState(widgets.map(w => ({ ...w })))
  const [editing, setEditing] = useState(null)

  function toggleVisible(id) {
    setWids(ws => ws.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  function updateWidget(updated) {
    setWids(ws => ws.map(w => w.id === updated.id ? updated : w))
  }

  const available = wids.filter(w => WIDGET_DEFS[w.id]?.roles.includes(role))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '440px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>🎛 Customize Dashboard</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '10px 20px 0' }}>Toggle, resize, or change colors. Drag widgets on the dashboard to reorder.</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
          {available.map(w => {
            const def = WIDGET_DEFS[w.id]
            if (!def) return null
            return (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${w.visible ? w.color + '55' : 'var(--border)'}`, background: w.visible ? w.color + '08' : 'transparent', marginBottom: '6px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: w.color, flexShrink: 0 }} />
                <span style={{ fontSize: '15px' }}>{def.icon}</span>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{def.label}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--dim)', padding: '2px 6px', borderRadius: '4px' }}>
                  {w.size === 'lg' ? 'Full' : 'Half'}
                </div>
                <button onClick={() => setEditing(w)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', fontFamily: ff }}>
                  ✏️
                </button>
                <div onClick={() => toggleVisible(w.id)}
                  style={{ width: 32, height: 18, borderRadius: '99px', background: w.visible ? w.color : 'var(--border)', position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background .2s' }}>
                  <div style={{ position: 'absolute', top: 1, left: w.visible ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave(wids); onClose() }}>Save Layout</Btn>
        </div>
      </div>
      {editing && <WidgetSettings widget={editing} onUpdate={updateWidget} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ── GOAL EDITOR ───────────────────────────────────────────────────
function GoalEditor({ agents, currentAgent, isAdmin, onClose, onSaved }) {
  const [selId,      setSelId]      = useState(currentAgent.id)
  const [goalGci,    setGoalGci]    = useState('')
  const [goalDeals,  setGoalDeals]  = useState('')
  const [teamGci,    setTeamGci]    = useState('')
  const [teamDeals,  setTeamDeals]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [loading,    setLoading]    = useState(false)
  const { toast } = useApp()

  useEffect(() => { loadForAgent(selId) }, [selId])

  async function loadForAgent(id) {
    setLoading(true)
    const goals = await loadAgentGoals(id)
    setGoalGci(goals.goal_gci)
    setGoalDeals(goals.goal_deals)
    const tg = await loadTeamGoal()
    setTeamGci(tg.team_gci)
    setTeamDeals(tg.team_deals)
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      await saveAgentGoal(selId, parseFloat(goalGci) || 250000, parseInt(goalDeals) || 50)
      if (isAdmin) await saveTeamGoal(parseFloat(teamGci) || 2000000, parseInt(teamDeals) || 200)
      toast('✅ Goals saved')
      onSaved?.()
      onClose()
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>🎯 Edit Goals</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {/* Agent selector — admin sees all, agent sees only themselves */}
          {isAdmin && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Agent</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {agents.map(a => (
                  <div key={a.id} onClick={() => setSelId(a.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '8px', border: `1px solid ${selId === a.id ? 'var(--brand)' : 'var(--border)'}`, background: selId === a.id ? 'rgba(204,34,0,.08)' : 'transparent', cursor: 'pointer' }}>
                    <Avatar agent={a} size={18} />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{a.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>Loading...</div> : (
            <>
              {/* Agent goals */}
              <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px' }}>
                  {isAdmin ? agents.find(a => a.id === selId)?.name + "'s Goals" : 'My Goals'}
                </div>
                <Field label="Annual GCI Goal ($)">
                  <Input value={goalGci} onChange={setGoalGci} type="number" placeholder="250000" />
                </Field>
                <Field label="Annual Deal Goal">
                  <Input value={goalDeals} onChange={setGoalDeals} type="number" placeholder="50" />
                </Field>
              </div>

              {/* Team goals — admin only */}
              {isAdmin && (
                <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px' }}>Team Goals (All Agents)</div>
                  <Field label="Team Annual GCI Goal ($)">
                    <Input value={teamGci} onChange={setTeamGci} type="number" placeholder="2000000" />
                  </Field>
                  <Field label="Team Annual Deal Goal">
                    <Input value={teamDeals} onChange={setTeamDeals} type="number" placeholder="200" />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>Save Goals</Btn>
        </div>
      </div>
    </div>
  )
}

// ── AGENT VIEW ADMIN CONTROL ──────────────────────────────────────
function AgentViewControl({ agents, onClose }) {
  const [sel,   setSel]   = useState(agents[0]?.id || '')
  const [wids,  setWids]  = useState([])
  const [saving,setSaving]= useState(false)
  const { toast } = useApp()

  useEffect(() => {
    if (!sel) return
    const a = agents.find(x => x.id === sel)
    if (!a) return
    loadDashPrefs(sel).then(p => setWids(p.widgets || DEFAULT_WIDGETS))
  }, [sel])

  const selAgent  = agents.find(a => a.id === sel)
  const available = wids.filter(w => WIDGET_DEFS[w.id]?.roles.includes(selAgent?.role || 'agent'))

  async function save() {
    setSaving(true)
    await saveDashPrefs(sel, wids)
    toast(`✅ Dashboard saved for ${selAgent?.name}`)
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '480px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>👥 Manage Agent Dashboards</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {agents.map(a => (
              <div key={a.id} onClick={() => setSel(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', border: `1px solid ${sel === a.id ? 'var(--brand)' : 'var(--border)'}`, background: sel === a.id ? 'rgba(204,34,0,.08)' : 'transparent', cursor: 'pointer' }}>
                <Avatar agent={a} size={20} />
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{a.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px' }}>
          {available.map(w => {
            const def = WIDGET_DEFS[w.id]
            if (!def) return null
            return (
              <div key={w.id} onClick={() => setWids(ws => ws.map(x => x.id === w.id ? { ...x, visible: !x.visible } : x))}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px', border: `1px solid ${w.visible ? w.color + '55' : 'var(--border)'}`, background: w.visible ? w.color + '08' : 'transparent', marginBottom: '6px', cursor: 'pointer' }}>
                <span style={{ fontSize: '15px' }}>{def.icon}</span>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{def.label}</div>
                <div style={{ width: 32, height: 18, borderRadius: '99px', background: w.visible ? (w.color || 'var(--brand)') : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
                  <div style={{ position: 'absolute', top: 1, left: w.visible ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} loading={saving}>Save for {selAgent?.name?.split(' ')[0]}</Btn>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// WIDGET CONFIG MODAL — filter/display options per widget
// ═══════════════════════════════════════════════════════════════
const WIDGET_CONFIG_OPTIONS = {
  gci_goal:      { label: 'My GCI Goal',           fields: [{ key:'year', label:'Year', type:'year' }] },
  team_goal:     { label: 'Team Goal',             fields: [{ key:'year', label:'Year', type:'year' }] },
  quick_stats:   { label: 'Quick Stats',           fields: [{ key:'year', label:'Year', type:'year' }, { key:'agentFilter', label:'Filter Agent', type:'agent' }] },
  pipeline:      { label: 'Pipeline by Stage',     fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'sideFilter', label:'Side', type:'select', options:['All','Buyer','Listing','Dual Buyer','Dual Listing','Flip'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:8 }] },
  todays_tasks:  { label: "Today's Tasks",         fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'priorityFilter', label:'Priority', type:'select', options:['All','urgent','high','normal','low'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  hot_leads:     { label: 'Hot & Warm Leads',      fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'statusFilter', label:'Status', type:'select', options:['All','Hot','Warm','Cold','Active','New'] }, { key:'sourceFilter', label:'Source', type:'select', options:['All','SOI','Zillow','Referral','Farm - Open House','System Call','Past Client Repeat'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  active_deals:  { label: 'Active Deals',          fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'stageFilter', label:'Stage', type:'select', options:['All','Negotiations','Offer Accapted','Under Shtar','Under Contract'] }, { key:'sideFilter', label:'Side', type:'select', options:['All','Buyer','Listing','Dual Buyer','Dual Listing'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  upcoming_close:{ label: 'Upcoming Closings',     fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'daysAhead', label:'Days ahead', type:'number', min:7, max:90, default:30 }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  active_listings:{ label: 'Active Listings',      fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'statusFilter', label:'Status', type:'select', options:['All','Active','Under Contract','Coming Soon'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
  leaderboard:   { label: 'Team Leaderboard',      fields: [{ key:'year', label:'Year', type:'year' }, { key:'metric', label:'Rank by', type:'select', options:['gci','production','deal_count'], default:'gci' }, { key:'limit', label:'Show top N', type:'number', min:2, max:8, default:5 }] },
  gci_chart:     { label: 'GCI by Month',          fields: [{ key:'year', label:'Year', type:'year' }, { key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'chartType', label:'Chart style', type:'select', options:['bar','line'], default:'bar' }] },
  open_houses:   { label: 'Open Houses This Week', fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'daysAhead', label:'Days ahead', type:'number', min:3, max:30, default:7 }] },
  overdue_alert: { label: 'Overdue Alert',         fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:5 }] },
  announcements: { label: 'Announcements',         fields: [{ key:'priorityFilter', label:'Priority', type:'select', options:['All','urgent','high','normal','low'] }, { key:'limit', label:'Max items', type:'number', min:2, max:10, default:3 }] },
  gifts_pending: { label: 'Gifts Pending',         fields: [{ key:'agentFilter', label:'Filter Agent', type:'agent' }, { key:'statusFilter', label:'Status', type:'select', options:['All','Pending','Ordered','Delivered'] }, { key:'limit', label:'Max items', type:'number', min:3, max:20, default:6 }] },
}

const YEARS_LIST = []
for (let y = new Date().getFullYear(); y >= 2020; y--) YEARS_LIST.push(y.toString())

function WidgetConfigModal({ widget, agents, onSave, onClose }) {
  const def = WIDGET_CONFIG_OPTIONS[widget?.id]
  const [cfg, setCfg] = useState(() => ({ ...(widget?.config || {}) }))
  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }))

  if (!def) return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', padding:'28px', textAlign:'center' }}>
        <div style={{ fontSize:'13px', color:'var(--muted)', marginBottom:'14px' }}>No configuration options for this widget.</div>
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
      </div>
    </div>
  )

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'440px', boxShadow:'0 20px 50px rgba(0,0,0,.3)', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
          <span style={{ fontSize:'18px' }}>{WIDGET_DEFS[widget.id]?.icon || '⚙️'}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'14px', fontWeight:800, color:'var(--text)' }}>Configure — {def.label}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'1px' }}>Customize what this widget shows</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>
        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'14px' }}>
          {def.fields.map(field => (
            <div key={field.key}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' }}>{field.label}</div>
              {field.type === 'year' && (
                <select value={cfg[field.key] || new Date().getFullYear().toString()} onChange={e => set(field.key, e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  <option value="">All Years</option>
                  {YEARS_LIST.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {field.type === 'agent' && (
                <select value={cfg[field.key] || ''} onChange={e => set(field.key, e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  <option value="">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              {field.type === 'select' && (
                <select value={cfg[field.key] || field.default || field.options[0]} onChange={e => set(field.key, e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', fontFamily:ff }}>
                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {field.type === 'number' && (
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <input type="range" min={field.min||1} max={field.max||20}
                    value={parseInt(cfg[field.key])||field.default||field.min||5}
                    onChange={e => set(field.key, parseInt(e.target.value))}
                    style={{ flex:1, accentColor:'#CC2200' }} />
                  <div style={{ width:40, height:32, borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:800, color:'var(--text)', flexShrink:0 }}>
                    {parseInt(cfg[field.key])||field.default||field.min||5}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setCfg({})}
            style={{ fontSize:'11px', color:'var(--muted)', background:'none', border:'none', cursor:'pointer', textAlign:'left', padding:0, fontFamily:ff, textDecoration:'underline', marginTop:'-4px' }}>
            Reset to defaults
          </button>
        </div>
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave({ ...widget, config: cfg }); onClose() }}>✅ Apply</Btn>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// WIDGET MANAGER — add/remove/reorder widgets from a central panel
// ═══════════════════════════════════════════════════════════════
function WidgetManager({ widgets, role, onSave, onClose }) {
  const [wids, setWids] = useState(() => {
    // Ensure all known widget IDs are represented
    const existing = new Set(widgets.map(w => w.id))
    const allBuiltIn = Object.entries(WIDGET_DEFS)
      .filter(([id, d]) => id !== 'custom' && d.roles.includes(role))
      .map(([id, d]) => widgets.find(w => w.id === id) || { id, visible: false, size: 'md', color: '#CC2200' })
    // Include custom widgets too
    const customs = widgets.filter(w => w.id.startsWith('custom_'))
    return [...allBuiltIn, ...customs]
  })

  const visible = wids.filter(w => w.visible !== false)
  const hidden  = wids.filter(w => w.visible === false)

  function toggle(id) {
    setWids(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w))
  }

  function setSize(id, size) {
    setWids(prev => prev.map(w => w.id === id ? { ...w, size } : w))
  }

  function setColor(id, color) {
    setWids(prev => prev.map(w => w.id === id ? { ...w, color } : w))
  }

  function removeCustom(id) {
    setWids(prev => prev.filter(w => w.id !== id))
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:ff }}>
      <div style={{ background:'var(--panel)', borderRadius:'14px', width:'100%', maxWidth:'640px', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 50px rgba(0,0,0,.3)', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'var(--text)' }}>📐 Widget Manager</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'1px' }}>{visible.length} visible · {hidden.length} hidden</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:'var(--muted)' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 18px' }}>
          {/* Active widgets */}
          <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px' }}>
            Active Widgets — {visible.length}
          </div>
          {visible.map(w => {
            const isCustom = w.id.startsWith('custom_')
            const def = isCustom ? { label: w.customConfig?.label || 'Custom', icon: w.customConfig?.icon || '🔲' } : WIDGET_DEFS[w.id]
            if (!def) return null
            return (
              <div key={w.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--dim)', borderRadius:'9px', border:'1px solid var(--border)', marginBottom:'6px' }}>
                <span style={{ fontSize:'18px', flexShrink:0 }}>{def.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>{def.label}</div>
                  {isCustom && w.customConfig?.statuses?.length > 0 && (
                    <div style={{ fontSize:'10px', color:'var(--muted)' }}>Filter: {w.customConfig.statuses.join(', ')}</div>
                  )}
                </div>
                {/* Size toggle */}
                <div style={{ display:'flex', background:'var(--panel)', borderRadius:'6px', padding:'2px', gap:'2px' }}>
                  {[['md','½'],['lg','▭']].map(([sz, lbl]) => (
                    <button key={sz} onClick={() => setSize(w.id, sz)}
                      style={{ padding:'3px 8px', borderRadius:'5px', border:'none', background: w.size===sz ? '#CC2200' : 'transparent', color: w.size===sz ? '#fff' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {/* Color swatches */}
                <div style={{ display:'flex', gap:'3px' }}>
                  {['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899'].map(c => (
                    <div key={c} onClick={() => setColor(w.id, c)}
                      style={{ width:14, height:14, borderRadius:'50%', background:c, cursor:'pointer', border:(w.color||'#CC2200')===c ? '2px solid var(--text)' : '1px solid transparent' }} />
                  ))}
                </div>
                {/* Hide button */}
                <button onClick={() => toggle(w.id)}
                  style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
                  Hide
                </button>
                {isCustom && (
                  <button onClick={() => removeCustom(w.id)}
                    style={{ padding:'4px 8px', borderRadius:'6px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'11px', cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
                    Delete
                  </button>
                )}
              </div>
            )
          })}

          {/* Hidden widgets */}
          {hidden.length > 0 && (
            <div style={{ marginTop:'16px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px' }}>
                Hidden — click to show
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                {hidden.map(w => {
                  const isCustom = w.id.startsWith('custom_')
                  const def = isCustom ? { label: w.customConfig?.label || 'Custom', icon: w.customConfig?.icon || '🔲' } : WIDGET_DEFS[w.id]
                  if (!def) return null
                  return (
                    <button key={w.id} onClick={() => toggle(w.id)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', borderRadius:'9px', border:'1px dashed var(--border)', background:'transparent', color:'var(--muted)', fontSize:'12px', fontWeight:600, cursor:'pointer', fontFamily:ff, textAlign:'left' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#CC2200'; e.currentTarget.style.color = '#CC2200' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                      <span style={{ fontSize:'16px' }}>{def.icon}</span>
                      + {def.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave(wids); onClose() }} style={{ background:'#10B981', border:'none' }}>
            💾 Save Changes
          </Btn>
        </div>
      </div>
    </div>
  )
}

export function Dashboard() {
  const navigate  = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const year = new Date().getFullYear().toString()

  // State
  const [data,         setData]         = useState({})
  const [loading,      setLoading]      = useState(true)
  const [widgets,      setWidgets]      = useState([])
  const [agentGoals,   setAgentGoals]   = useState({ goal_gci: 250000, goal_deals: 50 })
  const [teamGoals,    setTeamGoals]    = useState({ team_gci: 2000000, team_deals: 200 })
  const [agents,       setAgents]       = useState([])
  const [agentFilter,  setAgentFilter]  = useState('')
  const [yearFilter,   setYearFilter]   = useState(year)
  const [stageFilter,  setStageFilter]  = useState([])   // multi-select stages
  const [sideFilter,   setSideFilter]   = useState('')
  const [showFilters,  setShowFilters]  = useState(false) // filter panel open
  const [showWidgetMgr,setShowWidgetMgr]= useState(false) // widget manager open
  const [popup,        setPopup]        = useState(null)
  const [showCustomize,    setShowCustomize]    = useState(false)
  const [showGoals,        setShowGoals]        = useState(false)
  const [showAgentView,    setShowAgentView]    = useState(false)
  const [showCustomWidget, setShowCustomWidget] = useState(false)
  const [dragId,       setDragId]       = useState(null)
  const [editMode,       setEditMode]       = useState(false)
  const [pendingWidgets, setPendingWidgets]  = useState(null) // staged changes before save
  const [configWidget,   setConfigWidget]    = useState(null) // widget being configured
  const [savingPrefs,  setSavingPrefs]  = useState(false)

  // ── LOAD PREFS AND GOALS FROM DB ──────────────────────────────
  useEffect(() => {
    if (!agent) return
    loadDashPrefs(agent.id).then(p => setWidgets(p.widgets || DEFAULT_WIDGETS))
    loadAgentGoals(agent.id).then(setAgentGoals)
    loadTeamGoal().then(setTeamGoals)
  }, [agent?.id])

  // ── SAVE WIDGETS TO DB ────────────────────────────────────────
  async function persistWidgets(newWidgets) {
    setWidgets(newWidgets)
    setSavingPrefs(true)
    try {
      await saveDashPrefs(agent.id, newWidgets)
    } catch(e) {
      toast('Could not save layout: ' + e.message, '#DC2626')
    } finally { setSavingPrefs(false) }
  }

  // ── DRAG TO REORDER ───────────────────────────────────────────
  const dragOver = useRef(null)

  function onDragStart(id) {
    if (!editMode) return
    setDragId(id)
  }
  function onDragEnter(e, id) {
    // Only update if entering the widget root element, not a child
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) {
      dragOver.current = id
    }
  }

  function onDragEnd() {
    if (!dragId || !dragOver.current || dragId === dragOver.current) {
      setDragId(null); dragOver.current = null; return
    }
    // Stage changes — don't save until Save Layout is clicked
    const base = pendingWidgets || widgets
    const newW = [...base]
    const fromIdx = newW.findIndex(w => w.id === dragId)
    const toIdx   = newW.findIndex(w => w.id === dragOver.current)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return }
    const [moved] = newW.splice(fromIdx, 1)
    newW.splice(toIdx, 0, moved)
    setPendingWidgets(newW)   // stage only — not saved to DB yet
    setWidgets(newW)          // update UI immediately
    setDragId(null)
    dragOver.current = null
  }

  async function saveLayout() {
    const toSave = pendingWidgets || widgets
    await persistWidgets(toSave)
    setPendingWidgets(null)
    setEditMode(false)
    toast('✅ Layout saved and locked')
  }

  function cancelEdit() {
    // Revert unsaved changes
    if (pendingWidgets) {
      loadDashPrefs(agent.id).then(p => setWidgets(p.widgets || DEFAULT_WIDGETS))
      setPendingWidgets(null)
    }
    setEditMode(false)
  }

  // ── LOAD DATA ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!agent) return
    setLoading(true)
    try {
      const viewId = agentFilter || ((isAdmin || canManage) ? null : agent.id)
      const filter = arr => viewId ? arr.filter(x => x.agent_id === viewId) : arr

      const [rawDeals, rawContacts, rawTasks, rawListings, rawOH, rawAnn, rawAgents, rawGifts] = await Promise.all([
        supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,expected_close_date,addr,client_name,agent_id,side,agents(id,name,color)').then(r => r.data || []),
        supabase.from('contacts').select('id,first_name,last_name,status,source,agent_id,created_at,phone').then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('listings').select('id,addr,city,status,list_price,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('open_houses').select('id,listing_addr,date,start_time,agent_id,agents(id,name,color)').then(r => r.data || []),
        supabase.from('announcements').select('*,agents(id,name,color)').order('pinned', { ascending: false }).limit(5).then(r => r.data || []),
        supabase.from('agents').select('*').eq('active', true).order('name').then(r => r.data || []),
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

      const yearDeals   = myDeals.filter(d => {
        if (!d.ao_date?.startsWith(yearFilter)) return false
        if (sideFilter  && d.side  !== sideFilter)           return false
        return true
      })
      const closedDeals = yearDeals.filter(d => d.stage === 'Closed')
      const activeDeals = myDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
      const closedGCI   = closedDeals.reduce((s, d) => s + parseNum(d.gci), 0)
      const pipelineGCI = activeDeals.reduce((s, d) => s + parseNum(d.gci), 0)

      // Team GCI — always all agents, for team_goal widget
      const teamClosed = rawDeals.filter(d => {
        if (!d.ao_date?.startsWith(yearFilter)) return false
        if (d.stage !== 'Closed') return false
        if (sideFilter && d.side !== sideFilter) return false
        return true
      })
      const teamGCI    = teamClosed.reduce((s, d) => s + parseNum(d.gci), 0)
      const teamDeals  = teamClosed.length

      const todayTasks  = myTasks.filter(t => t.status !== 'done' && (isDueToday(t.due_date) || isOverdue(t.due_date)))
      const overdueTasks = myTasks.filter(t => t.status !== 'done' && isOverdue(t.due_date))
      const hotLeads    = myContacts.filter(c => c.status === 'Hot' || c.status === 'Warm').sort((a, b) => a.status === 'Hot' ? -1 : 1)

      const upcoming = myDeals.filter(d => {
        const date = d.expected_close_date || d.close_date
        if (!date) return false
        const days = getDaysUntil(date)
        return days !== null && days >= 0 && days <= 30 && d.stage !== 'Closed'
      }).sort((a, b) => getDaysUntil(a.expected_close_date||a.close_date) - getDaysUntil(b.expected_close_date||b.close_date))

      const activeListings = myListings.filter(l => l.status === 'Active')
      const upcomingOH     = myOH.filter(oh => oh.date >= todayStr && oh.date <= weekStr)

      const monthlyGCI = Array.from({ length: 12 }, (_, m) => {
        const ms = `${yearFilter}-${String(m+1).padStart(2,'0')}`
        const gci = myDeals.filter(d => d.ao_date?.startsWith(ms) && d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        return { label: 'JFMAMJJASOND'[m], value: gci }
      })

      const leaderboard = rawAgents.map(a => {
        const ad  = rawDeals.filter(d => d.agent_id === a.id && d.ao_date?.startsWith(yearFilter))
        const gci = ad.filter(d => d.stage === 'Closed').reduce((s, d) => s + parseNum(d.gci), 0)
        return { agent: a, gci, closed: ad.filter(d => d.stage === 'Closed').length, active: ad.filter(d => !['Closed','Deal Fell Through'].includes(d.stage)).length }
      }).sort((a, b) => b.gci - a.gci)

      const pipeByStage = DEAL_STAGES.map(s => ({
        ...s,
        deals: activeDeals.filter(d => d.stage === s.value),
        gci:   activeDeals.filter(d => d.stage === s.value).reduce((sum, d) => sum + parseNum(d.gci), 0),
      }))

      const acceptedOffers   = myDeals.filter(d => d.stage === 'Offer Accapted')
      const underContract    = myDeals.filter(d => d.stage === 'Under Contract')
      const pendingGifts     = rawGifts.filter(g => !['Delivered'].includes(g.status))

      setAgents(rawAgents)
      setData({
        closedGCI, pipelineGCI, closedDeals, activeDeals, yearDeals,
        teamGCI, teamDeals, todayTasks, overdueTasks, hotLeads,
        upcoming, activeListings, upcomingOH, monthlyGCI, leaderboard,
        pipeByStage, announcements: rawAnn, pendingGifts,
        acceptedOffers, underContract,
        contactCount: myContacts.length,
      })
    } catch(e) {
      toast('Dashboard error: ' + e.message, '#DC2626')
    } finally { setLoading(false) }
  }, [agent?.id, agentFilter, yearFilter, stageFilter, sideFilter, isAdmin, canManage])

  useEffect(() => { loadData() }, [loadData])

  const stageHex = s => DEAL_STAGES.find(x => x.value === s)?.hex || '#c4c4c4'
  const show = id => widgets.find(w => w.id === id)?.visible
  const wColor = id => widgets.find(w => w.id === id)?.color || '#CC2200'
  const wSize  = id => widgets.find(w => w.id === id)?.size  || 'md'
  const visibleOrdered = widgets.filter(w => w.visible && WIDGET_DEFS[w.id]?.roles.includes(agent?.role || 'agent'))

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString())

  if (!agent || !widgets.length) return <div style={{ fontFamily: ff }}><Loading /></div>

  // ── RENDER A WIDGET ───────────────────────────────────────────
  function renderWidget(w) {
    // Custom widgets have dynamic id like 'custom_1234'
    const isCustom = w.id.startsWith('custom_') || w.id === 'custom'
    const def   = isCustom ? { ...WIDGET_DEFS.custom, label: w.customConfig?.label || 'Custom Widget', icon: w.customConfig?.icon || '🔲' } : WIDGET_DEFS[w.id]
    const color = w.color || '#CC2200'
    const isLg  = w.size === 'lg'
    // Widget-level config filters (set via ⚙️ button by admin)
    const wcfg  = w.config || {}

    const shell = (widgetContent) => (
      <div key={w.id}
        draggable={editMode}
        onDragStart={() => onDragStart(w.id)}
        onDragEnter={e => onDragEnter(e, w.id)}
        onDragEnd={onDragEnd}
        onDragOver={e => { if (editMode) e.preventDefault() }}
        style={{
          gridColumn:    isLg ? 'span 2' : 'span 1',
          background:    'var(--panel)',
          borderRadius:  '12px',
          border:        editMode ? `2px dashed ${color}` : `1px solid var(--border)`,
          borderTop:     editMode ? `2px dashed ${color}` : `3px solid ${color}`,
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
          opacity:       dragId === w.id ? 0.35 : 1,
          transition:    'opacity .15s, box-shadow .15s, border .15s',
          cursor:        editMode ? 'grab' : 'default',
          position:      'relative',
        }}>
        {/* Widget header */}
        <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: editMode ? color + '0a' : 'transparent' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {editMode && <span style={{ fontSize: '14px', color: 'var(--muted)', cursor: 'grab' }}>⠿</span>}
            <span style={{ fontSize: '14px' }}>{def?.icon}</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{def?.label}</span>
          </div>
          {editMode ? (
            /* Edit mode controls on each widget */
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Size toggle */}
              <button onClick={() => {
                const updated = widgets.map(x => x.id === w.id ? { ...x, size: x.size === 'lg' ? 'md' : 'lg' } : x)
                setWidgets(updated)
                setPendingWidgets(updated)
              }}
                style={{ padding: '2px 7px', borderRadius: '5px', border: `1px solid ${color}44`, background: color + '11', color: color, fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                {w.size === 'lg' ? '◻ Half' : '▭ Full'}
              </button>
              {/* Color picker dots */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899','#14B8A6'].map(c => (
                  <div key={c} onClick={() => {
                    const updated = widgets.map(x => x.id === w.id ? { ...x, color: c } : x)
                    setWidgets(updated)
                    setPendingWidgets(updated)
                  }}
                    style={{ width: 12, height: 12, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text)' : '1px solid transparent', transition: 'border .1s' }} />
                ))}
              </div>
              {/* Hide widget */}
              <button onClick={() => {
                const updated = widgets.map(x => x.id === w.id ? { ...x, visible: false } : x)
                setWidgets(updated)
                setPendingWidgets(updated)
              }}
                style={{ padding: '2px 6px', borderRadius: '5px', border: '1px solid #DC262644', background: '#FEF2F2', color: '#DC2626', fontSize: '11px', cursor: 'pointer', fontFamily: ff, fontWeight: 700 }}>
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              {(isAdmin || canManage) && WIDGET_CONFIG_OPTIONS[w.id] && (
                <button
                  onClick={e => { e.stopPropagation(); setConfigWidget(w) }}
                  title="Configure widget"
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'var(--muted)', padding:'2px 4px', borderRadius:'4px', lineHeight:1 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hov)'; e.currentTarget.style.color = 'var(--text)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)' }}>
                  ⚙️
                </button>
              )}
              <span style={{ fontSize: '10px', color: 'var(--border)', userSelect: 'none', letterSpacing: '1px' }}>⋮⋮</span>
            </div>
          )}
        </div>
        {/* Widget content — dimmed in edit mode so controls are clear */}
        <div style={{ flex: 1, padding: '12px 14px', overflow: 'hidden', opacity: editMode ? 0.4 : 1, pointerEvents: editMode ? 'none' : 'auto' }}>
          {widgetContent}
        </div>
      </div>
    )

    // ── GCI GOAL ──
    if (w.id === 'gci_goal') return shell(
      <div onClick={() => setPopup('gci_goal')} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <GCIRing value={data.closedGCI} goal={agentGoals.goal_gci} color={color} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text)' }}>{pct(data.closedGCI, agentGoals.goal_gci)}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(agentGoals.goal_gci)} goal · {data.closedDeals?.length || 0} closed</div>
          <div style={{ fontSize: '11px', color: color, marginTop: '3px' }}>+ {fmt$(data.pipelineGCI)} pipeline</div>
        </div>
      </div>
    )

    // ── TEAM GOAL ──
    if (w.id === 'team_goal' && (isAdmin || canManage)) return shell(
      <div onClick={() => setPopup('team_goal')} style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <GCIRing value={data.teamGCI} goal={teamGoals.team_gci} color={color} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text)' }}>{pct(data.teamGCI, teamGoals.team_gci)}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: color }}>{fmt$(data.teamGCI)}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>of {fmt$(teamGoals.team_gci)} · {data.teamDeals}/{teamGoals.team_deals} deals</div>
        </div>
      </div>
    )

    // ── QUICK STATS ──
    if (w.id === 'quick_stats') return shell(
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {[
          { label: 'Active Deals',    value: data.activeDeals?.length || 0,    popup: 'active_deals',   c: '#3B82F6' },
          { label: 'Accepted Offers', value: data.acceptedOffers?.length || 0, popup: 'accepted_offers',c: '#10B981' },
          { label: 'Under Contract',  value: data.underContract?.length || 0,  popup: 'under_contract', c: '#9D50DD' },
          { label: 'Closed GCI',      value: fmt$(data.closedGCI),             popup: 'gci_goal',       c: '#F5A623' },
          { label: 'Hot Leads',       value: data.contactCount || 0,           popup: 'hot_leads',      c: '#DC2626' },
          { label: 'Active Listings', value: data.activeListings?.length || 0, popup: 'active_listings',c: '#14B8A6' },
        ].map(s => (
          <div key={s.label} onClick={() => setPopup(s.popup)}
            style={{ padding: '10px', background: 'var(--dim)', borderRadius: '8px', cursor: 'pointer', borderLeft: `3px solid ${s.c}` }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>
    )

    // ── PIPELINE ──
    if (w.id === 'pipeline') return shell(
      <div>
        {data.pipeByStage?.filter(s => s.deals.length > 0).map(s => (
          <div key={s.value} onClick={() => setPopup('stage_' + s.value)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.hex, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>{s.deals.length}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: s.hex }}>{fmt$(s.gci)}</div>
          </div>
        ))}
        {!data.pipeByStage?.some(s => s.deals.length > 0) && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>No active deals</div>}
        <div onClick={() => navigate('/pipeline')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '8px' }}>View Pipeline →</div>
      </div>
    )

    // ── TODAY'S TASKS ──
    if (w.id === 'todays_tasks') {
      const filteredTasks = data.todaysTasks?.filter(t => {
        if (wcfg.agentFilter    && t.agent_id !== wcfg.agentFilter) return false
        if (wcfg.priorityFilter && wcfg.priorityFilter !== 'All' && t.priority !== wcfg.priorityFilter) return false
        return true
      }).slice(0, wcfg.limit || 6) || []
      return shell(
      <div>
        {data.todayTasks?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>🎉 All clear!</div>}
        {data.todayTasks?.slice(0, 5).map(t => (
          <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: isOverdue(t.due_date) ? '#DC2626' : color }} />
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
            {isOverdue(t.due_date) && <span style={{ fontSize: '9px', color: '#DC2626', fontWeight: 700 }}>LATE</span>}
          </div>
        ))}
        {data.todayTasks?.length > 5 && <div onClick={() => setPopup('todays_tasks')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{data.todayTasks.length - 5} more →</div>}
        <div onClick={() => navigate('/tasks/new')} style={{ marginTop: '8px', padding: '6px', border: '1px dashed var(--border)', borderRadius: '6px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}>+ Quick Add Task</div>
      </div>
    ) }

    // ── HOT LEADS ──
    if (w.id === 'hot_leads') {
      const filteredLeads = data.hotLeads?.filter(c => {
        if (wcfg.agentFilter && c.agent_id !== wcfg.agentFilter) return false
        if (wcfg.statusFilter && wcfg.statusFilter !== 'All' && c.status !== wcfg.statusFilter) return false
        if (wcfg.sourceFilter && wcfg.sourceFilter !== 'All' && c.source !== wcfg.sourceFilter) return false
        return true
      }).slice(0, wcfg.limit || 6) || []
      return shell(
      <div>
        {data.hotLeads?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No hot leads</div>}
        {data.hotLeads?.slice(0, 5).map(c => (
          <div key={c.id} onClick={() => navigate('/contacts/' + c.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.status === 'Hot' ? '#DC2626' : '#F97316', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
              {initials((c.first_name || '') + ' ' + (c.last_name || ''))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_name} {c.last_name}</div>
              {c.phone && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{c.phone}</div>}
            </div>
            <Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />
          </div>
        ))}
        {data.hotLeads?.length > 5 && <div onClick={() => setPopup('hot_leads')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{data.hotLeads.length - 5} more →</div>}
      </div>
    ) }

    // ── ACTIVE DEALS ──
    if (w.id === 'active_deals') {
      const filteredDeals = data.activeDeals?.filter(d => {
        if (wcfg.agentFilter && d.agent_id !== wcfg.agentFilter) return false
        if (wcfg.stageFilter && wcfg.stageFilter !== 'All' && d.stage !== wcfg.stageFilter) return false
        if (wcfg.sideFilter  && wcfg.sideFilter  !== 'All' && d.side  !== wcfg.sideFilter)  return false
        return true
      }).slice(0, wcfg.limit || 6) || []
      return shell(
      <div>
        {data.activeDeals?.slice(0, 4).map(d => (
          <div key={d.id} onClick={() => navigate('/production/' + d.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
              {d.client_name && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{d.client_name}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
              <Pill label={d.stage} color={stageHex(d.stage)} />
            </div>
          </div>
        ))}
        <div onClick={() => setPopup('active_deals')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '8px' }}>View all {data.activeDeals?.length} →</div>
      </div>
    ) }

    // ── UPCOMING CLOSINGS ──
    if (w.id === 'upcoming_close') return shell(
      <div>
        {data.upcoming?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No closings in 30 days</div>}
        {data.upcoming?.slice(0, 4).map(d => {
          const days = getDaysUntil(d.expected_close_date || d.close_date)
          return (
            <div key={d.id} onClick={() => navigate('/production/' + d.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ width: 32, height: 32, borderRadius: '8px', background: days <= 7 ? '#FEF2F2' : '#F0FDF4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: days <= 7 ? '#DC2626' : '#10B981' }}>{days}</div>
                <div style={{ fontSize: '8px', color: days <= 7 ? '#DC2626' : '#10B981' }}>days</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(d.expected_close_date || d.close_date)}</div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
            </div>
          )
        })}
        {data.upcoming?.length > 4 && <div onClick={() => setPopup('upcoming_close')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{data.upcoming.length - 4} more →</div>}
      </div>
    )

    // ── ACTIVE LISTINGS ──
    if (w.id === 'active_listings') return shell(
      <div>
        {data.activeListings?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No active listings</div>}
        {data.activeListings?.slice(0, 5).map(l => (
          <div key={l.id} onClick={() => navigate('/listings/' + l.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.addr}</div>
              {l.city && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{l.city}</div>}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: color }}>{fmt$(l.list_price)}</div>
          </div>
        ))}
        <div onClick={() => setPopup('active_listings')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '8px' }}>View all listings →</div>
      </div>
    )

    // ── LEADERBOARD ──
    if (w.id === 'leaderboard' && (isAdmin || canManage)) return shell(
      <div>
        {data.leaderboard?.filter(r => r.gci > 0 || r.closed > 0).slice(0, 6).map((row, i) => (
          <div key={row.agent.id} onClick={() => { setAgentFilter(row.agent.id); setPopup('gci_goal') }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ fontSize: '14px', minWidth: '22px' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}</div>
            <Avatar agent={row.agent} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.agent.name}</div>
              <div style={{ height: '3px', background: 'var(--dim)', borderRadius: '99px', marginTop: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: row.agent.color || '#CC2200', width: `${pct(row.gci, agentGoals.goal_gci)}%` }} />
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#10B981' }}>{fmt$(row.gci)}</div>
              <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{row.closed} closed</div>
            </div>
          </div>
        ))}
      </div>
    )

    // ── GCI CHART ──
    if (w.id === 'gci_chart') return shell(
      <div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '6px' }}>closed {yearFilter}</span>
        </div>
        <MiniBar data={data.monthlyGCI} color={color} />
      </div>
    )

    // ── OPEN HOUSES ──
    if (w.id === 'open_houses') return shell(
      <div>
        {data.upcomingOH?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No open houses this week</div>}
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
    )

    // ── GIFTS PENDING ──
    if (w.id === 'gifts_pending' && (isAdmin || canManage)) return shell(
      <div>
        {data.pendingGifts?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>All delivered ✅</div>}
        {data.pendingGifts?.slice(0, 5).map(g => (
          <div key={g.id} onClick={() => navigate('/gifts/' + g.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text)' }}>{g.client_name}</div>
            <Pill label={g.status} color="#9d50dd" />
          </div>
        ))}
        {data.pendingGifts?.length > 5 && <div onClick={() => setPopup('gifts_pending')} style={{ fontSize: '11px', color: color, cursor: 'pointer', marginTop: '6px' }}>+{data.pendingGifts.length - 5} more →</div>}
      </div>
    )

    // ── QUICK ADD ──
    if (w.id === 'quick_add') return shell(
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { label: '+ Lead',    path: '/contacts/new',   c: '#0EA5E9' },
          { label: '+ Deal',    path: '/production/new', c: '#10B981' },
          { label: '+ Task',    path: '/tasks/new',      c: '#8B5CF6' },
          { label: '+ Listing', path: '/listings/new',   c: '#F5A623' },
          { label: '+ Offer',   path: '/offers/new',     c: '#6366F1' },
          { label: '+ OH',      path: '/openhouse/new',  c: '#14B8A6' },
          { label: '+ Gift',    path: '/gifts/new',      c: '#EC4899' },
          { label: '+ Event',   path: '/calendar/new',   c: '#CC2200' },
        ].map(item => (
          <button key={item.path} onClick={() => navigate(item.path)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${item.c}33`, background: item.c + '11', color: item.c, fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            {item.label}
          </button>
        ))}
      </div>
    )

    // ── OVERDUE ALERT ──
    if (w.id === 'overdue_alert') return shell(
      <div onClick={() => setPopup('overdue_alert')} style={{ cursor: 'pointer' }}>
        {data.overdueTasks?.length === 0
          ? <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>✅ No overdue tasks</div>
          : <div style={{ background: '#FEF2F2', borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #FECACA' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ fontWeight: 700, color: '#DC2626', fontSize: '13px' }}>{data.overdueTasks?.length} overdue task{data.overdueTasks?.length > 1 ? 's' : ''} — click to view</div>
            </div>
        }
      </div>
    )

    // ── ANNOUNCEMENTS ──
    if (w.id === 'announcements') return shell(
      <div>
        {data.announcements?.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No announcements</div>}
        {data.announcements?.map(a => (
          <div key={a.id} onClick={() => navigate('/announcements/' + a.id)}
            style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{a.title}</div>
            {a.body && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>}
          </div>
        ))}
      </div>
    )

    return null
  }

  return (
    <div style={{ fontFamily: ff }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>{greeting}, {agent?.name?.split(' ')[0]} 👋</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {savingPrefs && <span style={{ marginLeft: '8px', color: 'var(--brand)', fontSize: '11px' }}>💾 Saving layout...</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Filters — hidden during edit mode */}
          {!editMode && (
            <>
              {/* Year selector */}
              <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>

              {/* Agent filter */}
              {(isAdmin || canManage) && (
                <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                  <option value="">All Agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}

              {/* Side filter */}
              <select value={sideFilter} onChange={e => setSideFilter(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                <option value="">All Sides</option>
                {['Buyer','Listing','Dual Buyer','Dual Listing','Flip'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              {/* Stage quick filters — pill toggles */}
              <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
                {[
                  { id:'ao',       label:'AO',              stages:['Offer Accapted'],                      color:'#037f4c' },
                  { id:'uc',       label:'Under Contract',  stages:['Under Shtar','Under Contract'],        color:'#757575' },
                  { id:'closed',   label:'Sold',            stages:['Closed'],                              color:'#225091' },
                ].map(f => {
                  const isOn = f.stages.every(s => stageFilter.includes(s))
                  return (
                    <button key={f.id}
                      onClick={() => {
                        setStageFilter(prev => {
                          if (isOn) return prev.filter(s => !f.stages.includes(s))
                          return [...new Set([...prev, ...f.stages])]
                        })
                      }}
                      style={{ padding:'4px 10px', borderRadius:'20px', border:`1px solid ${isOn ? f.color : 'var(--border)'}`, background: isOn ? f.color : 'transparent', color: isOn ? '#fff' : 'var(--muted)', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff, transition:'all .15s' }}>
                      {f.label}
                    </button>
                  )
                })}
                {(stageFilter.length > 0 || sideFilter || agentFilter) && (
                  <button onClick={() => { setStageFilter([]); setSideFilter(''); setAgentFilter('') }}
                    style={{ padding:'4px 8px', borderRadius:'20px', border:'1px solid #DC262644', background:'#FEF2F2', color:'#DC2626', fontSize:'11px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                    ✕ Clear
                  </button>
                )}
              </div>

              <button onClick={loadData}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', cursor: 'pointer', fontSize: '13px', fontFamily: ff }}
                title="Refresh">↻</button>
              <Btn size="sm" variant="secondary" onClick={() => setShowGoals(true)}>🎯 Goals</Btn>
              {isAdmin && <Btn size="sm" variant="secondary" onClick={() => setShowAgentView(true)}>👥 Agent Views</Btn>}
              {isAdmin && (
                <Btn size="sm" variant="secondary" onClick={() => setShowWidgetMgr(true)}>+ Widgets</Btn>
              )}
            </>
          )}

          {/* Edit Mode controls */}
          {editMode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>🎛 Edit Mode — drag widgets to reorder</span>
              <Btn size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Btn>
              <Btn size="sm" onClick={saveLayout} loading={savingPrefs} style={{ background: '#10B981', border: 'none' }}>
                💾 Save Layout
              </Btn>
            </div>
          ) : (
            <Btn size="sm" variant="secondary" onClick={() => { setEditMode(true); setPendingWidgets(null) }}>🎛 Edit Layout</Btn>
          )}
        </div>
      </div>

      {/* Active filter summary bar — shows totals for current filter combination */}
      {!loading && (stageFilter.length > 0 || sideFilter || agentFilter) && (
        <div style={{ display:'flex', gap:'16px', padding:'12px 16px', background:'var(--dim)', borderRadius:'10px', border:'1px solid var(--border)', marginBottom:'12px', flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>Filtered Results</div>
          {(() => {
            // Calculate production totals for the current filter combo
            const allDeals = data.closedDeals || []
            const filtered = allDeals.filter(d => {
              if (stageFilter.length > 0 && !stageFilter.includes(d.stage)) return false
              if (sideFilter && d.side !== sideFilter) return false
              return true
            })
            const allActive = data.activeDeals || []
            const filteredActive = allActive.filter(d => {
              if (stageFilter.length > 0 && !stageFilter.includes(d.stage)) return false
              if (sideFilter && d.side !== sideFilter) return false
              return true
            })
            const gci   = filtered.reduce((s, d) => s + (parseFloat(d.gci) || 0), 0)
            const vol   = filtered.reduce((s, d) => s + (parseFloat(d.production) || 0), 0)
            const agci  = filteredActive.reduce((s, d) => s + (parseFloat(d.gci) || 0), 0)
            return (
              <>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'#10B981' }}>{fmt$(gci)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Closed GCI</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text)' }}>{fmt$(vol)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Volume</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'#F5A623' }}>{fmt$(agci)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Pipeline GCI</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text)' }}>{filtered.length}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Closed Deals</div>
                </div>
                <div>
                  <div style={{ fontSize:'16px', fontWeight:900, color:'var(--text)' }}>{filteredActive.length}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>Active Deals</div>
                </div>
              </>
            )
          })()}
          <div style={{ flex:1, textAlign:'right' }}>
            <span style={{ fontSize:'11px', color:'var(--muted)' }}>
              {[agentFilter ? agents.find(a=>a.id===agentFilter)?.name : null, sideFilter||null, stageFilter.length ? stageFilter.join(', ') : null, yearFilter].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}><Loading /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', alignItems: 'start' }}>
          {visibleOrdered.map(w => renderWidget(w))}
        </div>
      )}

      {/* ══════════════════════ DETAIL POPUPS ══════════════════════ */}

      {/* GCI Goal Detail */}
      <DetailPopup open={popup === 'gci_goal'} onClose={() => setPopup(null)} title="Closed Deals — GCI Detail" icon="🎯">
        <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', padding: '12px', background: 'var(--dim)', borderRadius: '8px' }}>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981' }}>{fmt$(data.closedGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Closed GCI</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: '#F5A623' }}>{fmt$(data.pipelineGCI)}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Pipeline GCI</div></div>
          <div><div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{data.closedDeals?.length || 0}</div><div style={{ fontSize: '11px', color: 'var(--muted)' }}>Closed Deals</div></div>
        </div>
        {data.closedDeals?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · ${d.side || ''} · ${fmtDate(d.ao_date)}`}
            right={fmt$(d.gci)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.closedDeals?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No closed deals in {yearFilter}</div>}
      </DetailPopup>

      {/* Team Goal Detail */}
      <DetailPopup open={popup === 'team_goal'} onClose={() => setPopup(null)} title="Team Goal — All Agents" icon="🏆">
        {data.leaderboard?.map((row, i) => (
          <DetailRow key={row.agent.id}
            left={<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span><Avatar agent={row.agent} size={24} /><span style={{ fontWeight: 600 }}>{row.agent.name}</span></div>}
            sub={`${row.closed} closed · ${row.active} active`} right={fmt$(row.gci)} />
        ))}
      </DetailPopup>

      {/* Active Deals Detail */}
      <DetailPopup open={popup === 'active_deals'} onClose={() => setPopup(null)} title="All Active Deals" icon="💼" width={640}>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--muted)' }}>{data.activeDeals?.length} deals · {fmt$(data.pipelineGCI)} pipeline GCI</div>
        {data.activeDeals?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · ${d.side || ''}`}
            right={fmt$(d.gci)} badge={<Pill label={d.stage} color={stageHex(d.stage)} />}
            onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.activeDeals?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No active deals</div>}
      </DetailPopup>

      {/* Accepted Offers Detail */}
      <DetailPopup open={popup === 'accepted_offers'} onClose={() => setPopup(null)} title="Accepted Offers (AO)" icon="✅">
        {data.acceptedOffers?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={d.client_name || '—'}
            right={fmt$(d.production)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.acceptedOffers?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No accepted offers</div>}
      </DetailPopup>

      {/* Under Contract Detail */}
      <DetailPopup open={popup === 'under_contract'} onClose={() => setPopup(null)} title="Under Contract" icon="📝">
        {data.underContract?.map(d => (
          <DetailRow key={d.id} left={d.addr} sub={d.client_name || '—'}
            right={fmt$(d.production)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
        ))}
        {!data.underContract?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No deals under contract</div>}
      </DetailPopup>

      {/* Hot Leads Detail */}
      <DetailPopup open={popup === 'hot_leads'} onClose={() => setPopup(null)} title="Hot & Warm Leads" icon="🔥">
        {data.hotLeads?.map(c => (
          <DetailRow key={c.id} left={`${c.first_name} ${c.last_name || ''}`} sub={c.phone || c.source || ''}
            badge={<Pill label={c.status} color={c.status === 'Hot' ? '#DC2626' : '#F97316'} />}
            onClick={() => { navigate('/contacts/' + c.id); setPopup(null) }} />
        ))}
        {!data.hotLeads?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No hot leads</div>}
      </DetailPopup>

      {/* Active Listings Detail */}
      <DetailPopup open={popup === 'active_listings'} onClose={() => setPopup(null)} title="Active Listings" icon="🏡">
        {data.activeListings?.map(l => (
          <DetailRow key={l.id} left={l.addr} sub={l.city || ''}
            right={fmt$(l.list_price)} onClick={() => { navigate('/listings/' + l.id); setPopup(null) }} />
        ))}
        {!data.activeListings?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No active listings</div>}
      </DetailPopup>

      {/* Today's Tasks Detail */}
      <DetailPopup open={popup === 'todays_tasks'} onClose={() => setPopup(null)} title="Today's Tasks" icon="✅">
        {data.todayTasks?.map(t => (
          <DetailRow key={t.id} left={t.title} sub={isOverdue(t.due_date) ? '⚠️ Overdue' : 'Due today'}
            badge={<Pill label={t.priority} color={t.priority === 'urgent' ? '#DC2626' : '#F97316'} />}
            onClick={() => { navigate('/tasks/' + t.id); setPopup(null) }} />
        ))}
        {!data.todayTasks?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>Nothing due today!</div>}
      </DetailPopup>

      {/* Overdue Tasks Detail */}
      <DetailPopup open={popup === 'overdue_alert'} onClose={() => setPopup(null)} title="Overdue Tasks" icon="⚠️">
        {data.overdueTasks?.map(t => (
          <DetailRow key={t.id} left={t.title} sub={`Due ${fmtDate(t.due_date)}`}
            badge={<Pill label="OVERDUE" color="#DC2626" />}
            onClick={() => { navigate('/tasks/' + t.id); setPopup(null) }} />
        ))}
        {!data.overdueTasks?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No overdue tasks!</div>}
      </DetailPopup>

      {/* Upcoming Closings Detail */}
      <DetailPopup open={popup === 'upcoming_close'} onClose={() => setPopup(null)} title="Upcoming Closings (30 days)" icon="📅">
        {data.upcoming?.map(d => {
          const days = getDaysUntil(d.expected_close_date || d.close_date)
          return (
            <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · Closes ${fmtDate(d.expected_close_date || d.close_date)}`}
              right={fmt$(d.gci)} badge={<Pill label={`${days}d`} color={days <= 7 ? '#DC2626' : '#10B981'} />}
              onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
          )
        })}
        {!data.upcoming?.length && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>No closings in 30 days</div>}
      </DetailPopup>

      {/* Pipeline Stage Popups */}
      {DEAL_STAGES.map(s => (
        <DetailPopup key={s.value} open={popup === 'stage_' + s.value} onClose={() => setPopup(null)} title={`${s.label}`} icon="🔀">
          {data.pipeByStage?.find(x => x.value === s.value)?.deals?.map(d => (
            <DetailRow key={d.id} left={d.addr} sub={`${d.client_name || '—'} · ${d.side || ''}`}
              right={fmt$(d.gci)} onClick={() => { navigate('/production/' + d.id); setPopup(null) }} />
          ))}
        </DetailPopup>
      ))}

      {/* Gifts Pending Detail */}
      <DetailPopup open={popup === 'gifts_pending'} onClose={() => setPopup(null)} title="Pending Gifts" icon="🎁">
        {data.pendingGifts?.map(g => (
          <DetailRow key={g.id} left={g.client_name} badge={<Pill label={g.status} color="#9d50dd" />}
            onClick={() => { navigate('/gifts/' + g.id); setPopup(null) }} />
        ))}
      </DetailPopup>

      {/* ── OVERLAYS ── */}
      {/* Edit mode — hidden widgets tray */}
      {editMode && (
        <div style={{ marginTop: '16px', padding: '14px 16px', background: 'var(--dim)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Hidden Widgets — click to show
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {widgets.filter(w => !w.visible && WIDGET_DEFS[w.id]?.roles.includes(agent.role)).map(w => {
              const def = WIDGET_DEFS[w.id]
              if (!def) return null
              return (
                <button key={w.id}
                  onClick={() => {
                    const updated = widgets.map(x => x.id === w.id ? { ...x, visible: true } : x)
                    setWidgets(updated)
                    setPendingWidgets(updated)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <span>{def.icon}</span> + {def.label}
                </button>
              )
            })}
            {widgets.filter(w => !w.visible && WIDGET_DEFS[w.id]?.roles.includes(agent.role)).length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>All widgets are visible</span>
            )}
            {/* Add custom widget button — admin only */}
            {isAdmin && (
              <button
                onClick={() => setShowCustomWidget(true)}
                style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'8px', border:'2px dashed #CC2200', background:'rgba(204,34,0,.04)', color:'#CC2200', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                🔲 + Custom Widget
              </button>
            )}
          </div>
        </div>
      )}

      {showCustomize && (
        <CustomizePanel widgets={widgets} role={agent.role}
          onSave={newW => { persistWidgets(newW); toast('✅ Layout saved') }}
          onClose={() => setShowCustomize(false)} />
      )}

      {/* Widget Manager */}
      {showWidgetMgr && (
        <WidgetManager
          widgets={widgets}
          role={agent.role}
          onSave={newWids => {
            persistWidgets(newWids)
            toast('✅ Widget layout saved')
          }}
          onClose={() => setShowWidgetMgr(false)}
        />
      )}

      {/* Widget config modal */}
      {configWidget && (
        <WidgetConfigModal
          widget={configWidget}
          agents={agents}
          onSave={updated => {
            const newWidgets = widgets.map(w => w.id === updated.id ? updated : w)
            persistWidgets(newWidgets)
          }}
          onClose={() => setConfigWidget(null)}
        />
      )}

      {showCustomWidget && (
        <CustomWidgetBuilder
          onSave={cfg => {
            // Add new custom widget to the list and stage it
            const newWidget = { ...cfg }
            const updated   = [...widgets, newWidget]
            setWidgets(updated)
            setPendingWidgets(updated)
            setShowCustomWidget(false)
            toast('✅ Custom widget added — click Save Layout to lock it in')
          }}
          onClose={() => setShowCustomWidget(false)}
        />
      )}
      {showGoals && (
        <GoalEditor agents={agents} currentAgent={agent} isAdmin={isAdmin}
          onSaved={() => { loadAgentGoals(agent.id).then(setAgentGoals); loadTeamGoal().then(setTeamGoals) }}
          onClose={() => setShowGoals(false)} />
      )}
      {showAgentView && isAdmin && (
        <AgentViewControl agents={agents} onClose={() => setShowAgentView(false)} />
      )}
    </div>
  )
}
