// ═══════════════════════════════════════════════════════════════════
// TargetOS V2 — Transaction Coordinator Board (TC Board)
// THE single board for the secretary to manage every deal.
// From listing prep → live → offer accepted → under contract → closed.
//
// DESIGN PRINCIPLES:
// - Every deal shows ALL its tasks in one place — no switching boards
// - Tasks are grouped by phase, checked off inline
// - Overdue tasks are bright red and always at the top
// - Photography scheduling creates a calendar event + emails agent
// - Price/status changes sync to all linked boards automatically
// - Every deal must have an agent assigned
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { authFetch } from '../lib/apiAuth'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth }    from '../context/AuthContext'
import { useApp }     from '../context/AppContext'
import { supabase }   from '../lib/supabase'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { phaseToStage, phaseToStatus } from '../lib/tcPhaseMap'
import { DEFAULT_PHASE_TASKS, loadTcSettings } from '../lib/tcSettings'

const PHASE_TASKS = DEFAULT_PHASE_TASKS
import TCSyncHealth from '../components/TCSyncHealth'
import TCMorningSummary from '../components/TCMorningSummary'
import { PeoplePanel, DocumentsPanel, PhotographyPanel } from '../components/TCDealPanels'
import { TCDealChat } from '../components/TCDealChat'
import { TCSignPanel, CommissionBillModal } from '../components/TCStage2'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { BoardLinks } from '../components/BoardLinks'
import { DEFAULT_TC_SETTINGS } from '../lib/tcSettings'
import { PageHeader, Btn, Modal, ModalActions, Loading, Empty } from '../components/UI'
import { usePageView, LastVisited } from '../components/PageViewTracking'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── PHASES ────────────────────────────────────────────────────────
const PHASES = [
  { id:'pre_listing',    label:'Pre-Listing',     icon:'📋', color:'#8B5CF6', desc:'Before going live' },
  { id:'active',         label:'Active',           icon:'🏡', color:'#3B82F6', desc:'Live on market'    },
  { id:'offer',          label:'Offer Accepted',   icon:'✍️', color:'#F5A623', desc:'AO signed'         },
  { id:'under_contract', label:'Under Contract',   icon:'📝', color:'#F97316', desc:'UC through closing'},
  { id:'closed',         label:'Closed',           icon:'🎉', color:'#10B981', desc:'Post-close'        },
]

// ── TASK TEMPLATES PER PHASE ──────────────────────────────────────

function addDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10)
}

// ── SQL MIGRATION TEXT ─────────────────────────────────────────────
const SQL_MIGRATION = `-- Run this in Supabase SQL editor to enable TC Board

create table if not exists tc_deals (
  id uuid primary key default gen_random_uuid(),
  addr text not null,
  side text default 'Seller',
  tc_phase text default 'pre_listing',
  agent_id uuid references agents(id),
  list_price numeric, sale_price numeric,
  ao_date date, close_date date,
  attorney_name text, attorney_phone text, attorney_email text,
  mortgage_broker text, mortgage_phone text,
  inspector text, inspector_phone text,
  linked_deal_id uuid references deals(id),
  linked_listing_id uuid references listings(id),
  contact_id uuid references contacts(id),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tc_tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references tc_deals(id) on delete cascade,
  title text not null,
  priority text default 'high',
  status text default 'pending',
  due_date date,
  completed_at timestamptz,
  agent_id uuid references agents(id),
  needs_calendar boolean default false,
  reminder_days int,
  completion_action text,
  completion_note text,
  phase text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`

// ── PRIORITY COLORS ────────────────────────────────────────────────
const PC = { urgent:'#DC2626', high:'#F97316', normal:'#3B82F6', low:'#94A3B8' }

// ── TASK ROW ──────────────────────────────────────────────────────
function TaskRow({ task, agents, onCheck, onEdit }) {
  const done    = task.status === 'done'
  const overdue = !done && task.due_date && new Date(task.due_date) < new Date()
  const agent   = agents.find(a => a.id === task.agent_id)
  const pc      = PC[task.priority] || '#94A3B8'

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'7px 14px',
      borderBottom:'1px solid var(--border)',
      background: overdue ? 'rgba(220,38,38,.04)' : done ? 'transparent' : 'transparent',
      opacity: done ? .55 : 1,
      transition:'opacity .15s',
    }}>
      {/* Check circle */}
      <div onClick={() => onCheck(task)}
        style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, cursor:done?'default':'pointer',
          border:'2px solid '+(done?'#10B981':pc), background:done?'#10B981':'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
        {done && <span style={{ color:'#fff', fontSize:9, fontWeight:900 }}>✓</span>}
      </div>

      {/* Title + meta */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', textDecoration:done?'line-through':'none',
          display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {task.title}
          {task.needs_calendar && !done && <span style={{ fontSize:9, color:'#8B5CF6', fontWeight:700 }}>📅 Cal</span>}
        </div>
        <div style={{ fontSize:10, color: overdue?'#DC2626':'var(--muted)', fontWeight:overdue?700:400, marginTop:1 }}>
          {overdue && '⚠️ Overdue · '}{task.due_date && fmtDate(task.due_date)}
          {task.notes && ' · ' + task.notes.slice(0,40)}
        </div>
      </div>

      {/* Priority */}
      <span style={{ fontSize:9, fontWeight:700, color:pc, background:pc+'15', padding:'2px 6px', borderRadius:99, textTransform:'uppercase', flexShrink:0 }}>
        {task.priority}
      </span>

      {/* Agent avatar */}
      {agent && (
        <div title={agent.name} style={{ width:22, height:22, borderRadius:'50%', background:agent.color||'#94A3B8',
          color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {agent.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
        </div>
      )}

      {/* Edit */}
      <button onClick={() => onEdit(task)}
        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:13, padding:'0 2px', flexShrink:0 }}>
        ✏️
      </button>
    </div>
  )
}

// ── DEAL CARD ─────────────────────────────────────────────────────
function DealCard({ deal, tasks, agents, onPhaseChange, onCheckTask, onEditTask, onAddTask, onEditDeal, expanded, onToggle }) {
  const phase    = PHASES.find(p => p.id === deal.tc_phase) || PHASES[0]
  const done     = tasks.filter(t => t.status === 'done').length
  const total    = tasks.length
  const overdue  = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length
  const pending  = tasks.filter(t => t.status !== 'done').length
  const agent    = agents.find(a => a.id === deal.agent_id)
  const pct      = total > 0 ? Math.round(done/total*100) : 0

  // Group pending tasks by phase for display
  const pendingTasks  = tasks.filter(t => t.status !== 'done')
  const doneTasks     = tasks.filter(t => t.status === 'done')
  const overdueTasks  = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < new Date())
  const upcomingTasks = pendingTasks.filter(t => !t.due_date || new Date(t.due_date) >= new Date())

  return (
    <div style={{ background:'var(--panel)', borderRadius:14, border:'2px solid '+(overdue>0?'rgba(220,38,38,.3)':'var(--border)'),
      marginBottom:12, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>

      {/* ── CARD HEADER ── */}
      <div onClick={onToggle} style={{ padding:'14px 16px', cursor:'pointer', borderBottom: expanded?'1px solid var(--border)':'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Phase color bar */}
          <div style={{ width:5, borderRadius:99, background:phase.color, alignSelf:'stretch', minHeight:44, flexShrink:0 }} />

          <div style={{ flex:1, minWidth:0 }}>
            {/* Row 1: address + badges */}
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
              <span style={{ fontSize:15, fontWeight:900, color:'var(--text)' }}>{deal.addr || '—'}</span>
              <span style={{ fontSize:10, fontWeight:700, color:'#fff',
                background:deal.side==='Buyer'?'#3B82F6':'#8B5CF6', padding:'1px 8px', borderRadius:99 }}>
                {deal.side}
              </span>
              {overdue > 0 && (
                <span style={{ fontSize:10, fontWeight:700, color:'#DC2626', background:'rgba(220,38,38,.1)', padding:'2px 8px', borderRadius:99, animation:'pulse 1s infinite' }}>
                  ⚠️ {overdue} overdue
                </span>
              )}
              {agent && (
                <span style={{ fontSize:10, color:agent.color||'var(--muted)', fontWeight:700 }}>
                  👤 {agent.name.split(' ')[0]}
                </span>
              )}
            </div>

            {/* Row 2: price + dates */}
            <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
              {deal.list_price && <span style={{ fontSize:11, color:'var(--muted)' }}>List: <strong>{fmt$(deal.list_price)}</strong></span>}
              {deal.sale_price && <span style={{ fontSize:11, color:'var(--muted)' }}>Sale: <strong>{fmt$(deal.sale_price)}</strong></span>}
              {deal.ao_date    && <span style={{ fontSize:11, color:'var(--muted)' }}>AO: {fmtDate(deal.ao_date)}</span>}
              {deal.close_date && <span style={{ fontSize:11, color:'var(--muted)' }}>Close: {fmtDate(deal.close_date)}</span>}
            </div>
          </div>

          {/* Right: phase pill + task count */}
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:11, fontWeight:800, color:phase.color, background:phase.color+'15',
              padding:'4px 12px', borderRadius:99, marginBottom:3, whiteSpace:'nowrap' }}>
              {phase.icon} {phase.label}
            </div>
            <div style={{ fontSize:10, color:overdue>0?'#DC2626':'var(--muted)', fontWeight:overdue>0?700:400 }}>
              {pending > 0 ? pending + ' task' + (pending!==1?'s':'') + ' left' : '✓ All done'}
              {total > 0 && ' · ' + pct + '%'}
            </div>
          </div>

          <span style={{ color:'var(--muted)', fontSize:18, transform:expanded?'rotate(0)':'rotate(-90deg)', transition:'transform .2s', flexShrink:0 }}>▾</span>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ marginTop:10, height:5, background:'var(--border)', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', width:pct+'%', background:pct===100?'#10B981':phase.color, borderRadius:99, transition:'width .5s' }} />
          </div>
        )}
      </div>

      {/* ── EXPANDED BODY ── */}
      {expanded && (
        <div>
          {/* Phase switcher */}
          <div style={{ padding:'10px 16px', background:'var(--dim)', borderBottom:'1px solid var(--border)',
            display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', marginRight:4 }}>Move to phase:</span>
            {PHASES.map(p => (
              <button key={p.id} onClick={() => onPhaseChange(deal, p.id)}
                style={{ padding:'4px 11px', borderRadius:99, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff,
                  border:'1.5px solid '+(deal.tc_phase===p.id?p.color:'var(--border)'),
                  background: deal.tc_phase===p.id?p.color:'transparent',
                  color: deal.tc_phase===p.id?'#fff':'var(--muted)',
                  transition:'all .12s' }}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          {/* Key info strip */}
          <div style={{ padding:'8px 16px', display:'flex', gap:20, flexWrap:'wrap', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
            {[
              { icon:'⚖️', label:'Attorney',       val: deal.attorney_name   || '—' },
              { icon:'🏦', label:'Mortgage Broker', val: deal.mortgage_broker  || '—' },
              { icon:'🔍', label:'Inspector',       val: deal.inspector        || '—' },
              { icon:'📞', label:'Atty Phone',      val: deal.attorney_phone   || '—' },
              { icon:'📱', label:'Broker Phone',    val: deal.mortgage_phone   || '—' },
            ].map(info => (
              <div key={info.label} style={{ minWidth:80 }}>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:2 }}>{info.icon} {info.label}</div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{info.val}</div>
              </div>
            ))}
          </div>

          {/* ── TASKS ── */}
          <div>
            {/* Overdue tasks — always shown first */}
            {overdueTasks.length > 0 && (
              <div>
                <div style={{ padding:'6px 14px 3px', fontSize:10, fontWeight:800, color:'#DC2626',
                  textTransform:'uppercase', letterSpacing:'.06em', background:'rgba(220,38,38,.04)' }}>
                  ⚠️ Overdue ({overdueTasks.length})
                </div>
                {overdueTasks.map(t => (
                  <TaskRow key={t.id} task={t} agents={agents} onCheck={onCheckTask} onEdit={onEditTask} />
                ))}
              </div>
            )}

            {/* Upcoming tasks */}
            {upcomingTasks.length > 0 && (
              <div>
                {overdueTasks.length > 0 && (
                  <div style={{ padding:'6px 14px 3px', fontSize:10, fontWeight:800, color:'var(--muted)',
                    textTransform:'uppercase', letterSpacing:'.06em', background:'var(--dim)' }}>
                    Upcoming ({upcomingTasks.length})
                  </div>
                )}
                {upcomingTasks.map(t => (
                  <TaskRow key={t.id} task={t} agents={agents} onCheck={onCheckTask} onEdit={onEditTask} />
                ))}
              </div>
            )}

            {/* Completed tasks — collapsed by default */}
            {doneTasks.length > 0 && (
              <details style={{ borderTop:'1px solid var(--border)' }}>
                <summary style={{ padding:'6px 14px', fontSize:10, fontWeight:700, color:'#10B981',
                  cursor:'pointer', listStyle:'none', userSelect:'none',
                  display:'flex', alignItems:'center', gap:6 }}>
                  ✓ Completed ({doneTasks.length}) — click to view
                </summary>
                {doneTasks.map(t => (
                  <TaskRow key={t.id} task={t} agents={agents} onCheck={onCheckTask} onEdit={onEditTask} />
                ))}
              </details>
            )}

            {/* Empty state */}
            {tasks.length === 0 && (
              <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                No tasks yet
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div style={{ padding:'10px 16px', display:'flex', gap:8, flexWrap:'wrap',
            borderTop:'1px solid var(--border)', background:'var(--dim)' }}>
            <button onClick={() => onAddTask(deal)}
              style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--brand)',
                background:'rgba(204,34,0,.06)', color:'var(--brand)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              + Add Task
            </button>
            <button onClick={() => onEditDeal(deal)}
              style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)',
                background:'transparent', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              ✏️ Edit Deal
            </button>
            {deal.notes && (
              <div style={{ fontSize:11, color:'var(--muted)', alignSelf:'center', fontStyle:'italic' }}>
                📝 {deal.notes.slice(0,60)}{deal.notes.length>60?'...':''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Shared helper — every send-email call needs the current session's
// access token now that the endpoint actually checks auth (July 2026).
async function callSendEmail(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  return authFetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify(payload),
  })
}

// ── MAIN ──────────────────────────────────────────────────────────
export function TransactionCoordinator() {
  const { agent, isAdmin, canManage } = useAuth()
  usePageView('tc')
  const { toast } = useApp()
  const navigate  = useNavigate()

  const [deals,       setDeals]       = useState([])
  const [tasks,       setTasks]       = useState([])
  const [agents,      setAgents]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [sqlError,    setSqlError]    = useState(false)
  const [search,      setSearch]      = useState('')
  const [phaseFilter, setPhaseFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [expanded,    setExpanded]    = useState({})
  const [saving,      setSaving]      = useState(false)

  // Modals
  const [showAddDeal,  setShowAddDeal]  = useState(false)
  const [showEditDeal, setShowEditDeal] = useState(false)
  const [showAddTask,  setShowAddTask]  = useState(false)
  const [showEditTask, setShowEditTask] = useState(false)
  const [selDeal,      setSelDeal]      = useState(null)
  const [selTask,      setSelTask]      = useState(null)



  const DEAL_BLANK = {
    addr:'', side:'Seller', agent_id:'', tc_phase:'pre_listing',
    list_price:'', sale_price:'', ao_date:'', close_date:'', c2c_enabled:false,
    attorney_name:'', attorney_phone:'', attorney_email:'',
    mortgage_broker:'', mortgage_phone:'',
    inspector:'', inspector_phone:'', notes:'',
  }

  // Safe insert — only columns confirmed in tc_deals table
  function dealPayload(f) {
    return {
      addr:            f.addr,
      side:            f.side || 'Seller',
      agent_id:        f.agent_id || null,
      tc_phase:        f.tc_phase || 'pre_listing',
      list_price:      f.list_price ? parseFloat(String(f.list_price).replace(/[$,]/g,'')) : null,
      sale_price:      f.sale_price ? parseFloat(String(f.sale_price).replace(/[$,]/g,'')) : null,
      ao_date:         f.ao_date    || null,
      c2c_enabled:     !!f.c2c_enabled,
      close_date:      f.close_date || null,
      attorney_name:   f.attorney_name   || null,
      attorney_phone:  f.attorney_phone  || null,
      attorney_email:  f.attorney_email  || null,
      mortgage_broker: f.mortgage_broker || null,
      mortgage_phone:  f.mortgage_phone  || null,
      inspector:       f.inspector       || null,
      inspector_phone: f.inspector_phone || null,
      notes:           f.notes || null,
    }
  }
  const TASK_BLANK = {
    title:'', priority:'high', due_date:'', agent_id:'',
    notes:'', needs_calendar:false, reminder_days:'',
    completion_action:'none', completion_note:'',
  }

  const [dealForm, setDealForm] = useState({ ...DEAL_BLANK })
  const [taskForm, setTaskForm] = useState({ ...TASK_BLANK })

  useEffect(() => { if (canManage) loadAll() }, [canManage])

  // TC Board is Secretary + Admin only — agents get zero access.
  // Placed after every hook call (useState/useEffect above) so this
  // conditional return never violates the rules of hooks.
  if (!canManage) return (
    <div>
      <PageHeader title="TC Board" />
      <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:40,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>🔒</div>
        <div style={{fontWeight:700,fontSize:16,color:'var(--text)'}}>Secretary or Admin Access Only</div>
      </div>
    </div>
  )

  const location = useLocation()
  const [deepLinked, setDeepLinked] = useState(false)
  useEffect(() => {
    if (deepLinked || !deals.length) return
    const id = new URLSearchParams(location.search).get('open')
    if (!id) { setDeepLinked(true); return }
    const d = deals.find(x => x.id === id)
    if (d) {
      setSelDeal(d)
      setDealForm({ addr:d.addr, side:d.side, agent_id:d.agent_id||'', tc_phase:d.tc_phase, list_price:d.list_price||'', sale_price:d.sale_price||'', ao_date:d.ao_date||'', close_date:d.close_date||'', c2c_enabled:!!d.c2c_enabled, attorney_name:d.attorney_name||'', attorney_phone:d.attorney_phone||'', attorney_email:d.attorney_email||'', mortgage_broker:d.mortgage_broker||'', mortgage_phone:d.mortgage_phone||'', inspector:d.inspector||'', inspector_phone:d.inspector_phone||'', notes:d.notes||'' })
      setShowEditDeal(true)
    }
    setDeepLinked(true)
  }, [deals.length, location.search])

  const [tcCfg, setTcCfg] = useState(null)   // merged TC settings (templates, services, statuses…)
  const [showBill, setShowBill] = useState(false)
  const [billPeople, setBillPeople] = useState({ rows: [], contacts: {} })

  async function openCommissionBill() {
    try {
      const { data: rows } = await supabase.from('tc_participants').select('*').eq('tc_deal_id', selDeal.id)
      const ids = [...new Set((rows||[]).map(r => r.contact_id))]
      let contacts = {}
      if (ids.length) {
        const { data: cs } = await supabase.from('contacts').select('id, first_name, last_name, email').in('id', ids)
        contacts = Object.fromEntries((cs||[]).map(x => [x.id, x]))
      }
      setBillPeople({ rows: rows || [], contacts })
    } catch { setBillPeople({ rows: [], contacts: {} }) }
    setShowBill(true)
  }
  const templatesFor = phase => (tcCfg?.task_templates?.[phase] || PHASE_TASKS[phase] || [])

  async function loadAll() {
    setLoading(true)
    try {
      loadTcSettings().then(setTcCfg).catch(() => {})
      const [dr, tr, ar] = await Promise.all([
        supabase.from('tc_deals').select('*').order('updated_at', { ascending:false }).range(0, 499),
        supabase.from('tc_tasks').select('*').order('due_date',   { ascending:true  }).range(0, 4999),
        supabase.from('agents').select('id,name,color,email').eq('active',true).order('name'),
      ])
      if (dr.error?.message?.includes('does not exist')) { setSqlError(true); return }
      setDeals(dr.data || [])
      setTasks(tr.data || [])
      setAgents(ar.data || [])
    } catch(e) {
      setSqlError(true)
    } finally { setLoading(false) }
  }

  // Sync ANY field change to all linked boards
  async function syncToAllBoards(deal, updates) {
    const synced = []
    let failed = false
    try {
      const r0 = await supabase.from('tc_deals').update({ ...updates, updated_at:new Date().toISOString() }).eq('id', deal.id)
      if (r0.error) throw r0.error

      // Keep the Production↔Listings hard link in sync: whenever a TC
      // deal knows both sides, make sure deals.listing_id points at
      // the listing (best-effort — never fails the whole sync).
      if (deal.linked_deal_id && deal.linked_listing_id) {
        supabase.from('deals').update({ listing_id: deal.linked_listing_id }).eq('id', deal.linked_deal_id)
          .then(() => {}, () => {})
      }

      if (updates.list_price !== undefined && deal.linked_listing_id) {
        const r = await supabase.from('listings').update({ list_price:updates.list_price, updated_at:new Date().toISOString() }).eq('id', deal.linked_listing_id)
        if (r.error) throw r.error
        synced.push('Listings')
      }
      if (updates.sale_price !== undefined && deal.linked_deal_id) {
        const r = await supabase.from('deals').update({ sale_price:updates.sale_price, updated_at:new Date().toISOString() }).eq('id', deal.linked_deal_id)
        if (r.error) throw r.error
        synced.push('Production')
      }
      if (updates.ao_date !== undefined && deal.linked_deal_id) {
        const r = await supabase.from('deals').update({ ao_date:updates.ao_date, updated_at:new Date().toISOString() }).eq('id', deal.linked_deal_id)
        if (r.error) throw r.error
        if (!synced.includes('Production')) synced.push('Production')
      }
      if (updates.close_date !== undefined && deal.linked_deal_id) {
        const r = await supabase.from('deals').update({ close_date:updates.close_date, updated_at:new Date().toISOString() }).eq('id', deal.linked_deal_id)
        if (r.error) throw r.error
        if (!synced.includes('Production')) synced.push('Production')
      }
      if (updates.tc_phase !== undefined) {
        if (deal.linked_deal_id) {
          const r = await supabase.from('deals').update({ stage:phaseToStage[updates.tc_phase], updated_at:new Date().toISOString() }).eq('id', deal.linked_deal_id)
          if (r.error) throw r.error
          if (!synced.includes('Production')) synced.push('Production')
        }
        if (deal.linked_listing_id) {
          const r = await supabase.from('listings').update({ status:phaseToStatus[updates.tc_phase], updated_at:new Date().toISOString() }).eq('id', deal.linked_listing_id)
          if (r.error) throw r.error
          if (!synced.includes('Listings')) synced.push('Listings')
        }
      }
      if (updates.agent_id !== undefined) {
        if (deal.linked_deal_id) {
          const r = await supabase.from('deals').update({ agent_id:updates.agent_id }).eq('id', deal.linked_deal_id)
          if (r.error) throw r.error
        }
        if (deal.linked_listing_id) {
          const r = await supabase.from('listings').update({ agent_id:updates.agent_id }).eq('id', deal.linked_listing_id)
          if (r.error) throw r.error
        }
        synced.push('All boards')
      }
    } catch(e) {
      console.warn('sync error:', e.message)
      toast('Some changes may not have synced to other boards — please verify Listings/Production.', '#DC2626')
      failed = true
    }
    return { synced, failed }
  }

  async function createDeal() {
    if (!dealForm.addr.trim()) { toast('Address is required', '#DC2626'); return }
    if (!dealForm.agent_id)    { toast('You must assign an agent to this deal', '#DC2626'); return }
    setSaving(true)
    try {
      const { data:newDeal, error } = await supabase.from('tc_deals').insert({
        ...dealPayload(dealForm),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()
      if (error) throw error

      await generatePhaseTasks(newDeal, dealForm.tc_phase)

      const taskCount = templatesFor(dealForm.tc_phase).length
      toast('✅ Deal created · ' + taskCount + ' tasks auto-generated')
      setShowAddDeal(false)
      setDealForm({ ...DEAL_BLANK })
      setExpanded(p => ({ ...p, [newDeal.id]:true }))
      loadAll()
    } catch(e) {
      console.error('createDeal error:', e)
      toast('Failed: ' + (e.message || e.details || JSON.stringify(e)), '#DC2626')
    }
    finally { setSaving(false) }
  }

  // Contract-to-close service: weekly check-in tasks from now (or AO
  // date) until close date, capped at 12 weeks. Fired once when the
  // toggle flips on; tasks are normal tc_tasks (editable/deletable).
  async function generateC2CTasks(deal) {
    try {
      const start = new Date(Math.max(Date.now(), deal.ao_date ? new Date(deal.ao_date).getTime() : 0))
      const end   = deal.close_date ? new Date(deal.close_date) : new Date(Date.now() + 84*86400000)
      const rows = []
      const d = new Date(start)
      d.setDate(d.getDate() + 7)
      let week = 1
      while (d <= end && rows.length < 12) {
        rows.push({
          deal_id: deal.id,
          title: '📞 C2C week ' + week + ': mortgage broker check-in + update seller, buyer\u2019s agent & attorneys',
          priority: 'high', due_date: d.toISOString().slice(0,10),
          status: 'pending', agent_id: deal.agent_id,
          needs_calendar: false, phase: 'under_contract',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
        d.setDate(d.getDate() + 7); week++
      }
      if (deal.close_date) {
        const bill = new Date(deal.close_date); bill.setDate(bill.getDate() - 7)
        if (bill >= new Date()) rows.push({
          deal_id: deal.id, title: '🧾 Send commission bill to attorneys (1 week before closing)',
          priority: 'urgent', due_date: bill.toISOString().slice(0,10),
          status: 'pending', agent_id: deal.agent_id, needs_calendar: true,
          phase: 'under_contract', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        })
      }
      if (rows.length) {
        const { error } = await supabase.from('tc_tasks').insert(rows)
        if (error) throw error
        setTasks(prev => [...prev, ...rows])
        toast('📋 ' + rows.length + ' contract-to-close tasks generated')
      }
    } catch (e) { toast('C2C task generation failed: ' + e.message, '#DC2626') }
  }

  async function generatePhaseTasks(deal, phase) {
    const templates = templatesFor(phase)
    if (!templates.length) return
    const rows = templates.map(t => ({
      deal_id:       deal.id,
      title:         t.label,
      priority:      t.priority,
      due_date:      addDays(t.days),
      status:        'pending',
      agent_id:      deal.agent_id,
      needs_calendar:!!t.cal,
      phase,
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }))
    const { error } = await supabase.from('tc_tasks').insert(rows)
    if (error) throw error

    // Create calendar events for tasks that need it
    for (const t of rows.filter(r => r.needs_calendar)) {
      try { await supabase.from('calendar_events').insert({
        agent_id:   deal.agent_id,
        title:      t.title + ' — ' + deal.addr,
        start_date: t.due_date,
        start_time: '10:00',
        type:       'task',
        notes:      'Auto-created by TC Board',
        created_at: new Date().toISOString(),
      }) } catch(e) { console.warn('TC calendar sync failed:', e.message) }
    }

    // Email agent about calendar tasks (photography, inspections etc.)
    const calTasks = templates.filter(t => t.cal && t.notify_agent)
    if (calTasks.length > 0) {
      const ag = agents.find(a => a.id === deal.agent_id)
      if (ag?.email) {
        const items = calTasks.map(t => '<li>' + t.label + ' (due in ' + t.days + ' days)</li>').join('')
        callSendEmail({
          to: ag.email,
          subject: '📋 New tasks assigned: ' + deal.addr + ',',
          html: '<p>Hi ' + (ag.name?.split(' ')[0]||'Agent') + ',</p><p>The following tasks require your attention for <strong>' + deal.addr + '</strong>:</p><ul>' + items + '</ul><p>These have been added to your calendar. Please confirm the dates.</p><p><a href="https://app.targetreteam.com/tc">Open TC Board →</a></p>',
        }).catch(() => {})
      }
    }
  }

  async function changePhase(deal, newPhase) {
    if (deal.tc_phase === newPhase) return
    const pDef     = PHASES.find(p => p.id === newPhase)
    const taskCount= templatesFor(newPhase).length
    const calCount = PHASE_TASKS[newPhase]?.filter(t=>t.cal).length || 0
    if (!window.confirm('Move "' + deal.addr + '" to ' + (pDef?.label||'') + '?\n\n• ' + taskCount + ' tasks will be auto-generated' + (calCount>0 ? '\n• ' + calCount + ' calendar events will be created' : '') + '\n• All linked boards will be updated automatically')) return
    try {
      const { synced, failed } = await syncToAllBoards(deal, { tc_phase:newPhase })
      await generatePhaseTasks({ ...deal, tc_phase:newPhase }, newPhase)

      // Email agent
      const ag = agents.find(a => a.id === deal.agent_id)
      if (ag?.email) {
        callSendEmail({
          to: ag.email,
          subject: (pDef?.icon||'') + ' ' + deal.addr + ' moved to ' + (pDef?.label||'') + ',',
          html: '<p>Hi ' + (ag.name?.split(' ')[0]||'Agent') + ',</p><p><strong>' + deal.addr + '</strong> has moved to <strong>' + (pDef?.label||'') + '</strong>.</p><p>' + taskCount + ' new tasks have been assigned. Please check your TC Board.</p><p><a href="https://app.targetreteam.com/tc">Open TC Board →</a></p>',
        }).catch(() => {})
      }

      if (!failed) toast('✅ Phase → ' + (pDef?.label||'') + (synced.length ? ' · Synced: ' + synced.join(', ') : ''))
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function checkTask(task) {
    if (task.status === 'done') return
    try {
      const { error } = await supabase.from('tc_tasks').update({
        status:'done', completed_at:new Date().toISOString(), updated_at:new Date().toISOString()
      }).eq('id', task.id)
      if (error) throw error
      setTasks(p => p.map(t => t.id===task.id ? {...t, status:'done'} : t))

      // Completion action
      if (task.completion_action === 'notify_agent') {
        const deal = deals.find(d => d.id === task.deal_id)
        const ag   = agents.find(a => a.id === (task.agent_id || deal?.agent_id))
        if (ag?.email) {
          callSendEmail({
            to: ag.email,
            subject: '✅ Task completed: ' + task.title + ',',
            html: '<p>Hi ' + (ag.name?.split(' ')[0]||'Agent') + ',</p><p>Task <strong>"' + task.title + '"</strong> for <strong>' + (deal?.addr||'your deal') + '</strong> has been completed.</p>' + (task.completion_note ? '<p>Note: ' + task.completion_note + '</p>' : '') + '<p><a href="https://app.targetreteam.com/tc">Open TC Board →</a></p>',
          }).catch(() => {})
        }
      } else if (task.completion_action === 'create_next_task' && task.completion_note) {
        const { error: nextErr } = await supabase.from('tc_tasks').insert({
          deal_id:    task.deal_id,
          title:      task.completion_note,
          priority:   'high', status:'pending',
          agent_id:   task.agent_id, phase:task.phase,
          created_at: new Date().toISOString(), updated_at:new Date().toISOString(),
        })
        if (nextErr) throw nextErr
        loadAll()
      }
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function saveTask() {
    if (!taskForm.title.trim()) { toast('Task title required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selTask) {
        // Edit existing
        const { error: e1 } = await supabase.from('tc_tasks').update({
          ...taskForm, updated_at:new Date().toISOString()
        }).eq('id', selTask.id)
        if (e1) throw e1
        if (taskForm.needs_calendar && taskForm.due_date) {
          const { error: e2 } = await supabase.from('calendar_events').insert({
            agent_id:   taskForm.agent_id || selDeal?.agent_id,
            title:      taskForm.title + ' — ' + selDeal?.addr,
            start_date: taskForm.due_date, start_time:'10:00', type:'task',
            created_at: new Date().toISOString(),
          })
          if (e2) throw e2
        }
        toast('✅ Task updated')
      } else {
        // Add new
        const { error: e3 } = await supabase.from('tc_tasks').insert({
          deal_id:    selDeal.id,
          agent_id:   taskForm.agent_id || selDeal.agent_id,
          phase:      selDeal.tc_phase,
          status:     'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...taskForm,
        })
        if (e3) throw e3
        if (taskForm.needs_calendar && taskForm.due_date) {
          const { error: e4 } = await supabase.from('calendar_events').insert({
            agent_id:   taskForm.agent_id || selDeal.agent_id,
            title:      taskForm.title + ' — ' + selDeal.addr,
            start_date: taskForm.due_date, start_time:'10:00', type:'task',
            created_at: new Date().toISOString(),
          })
          if (e4) throw e4
        }
        toast('✅ Task added' + (taskForm.needs_calendar && taskForm.due_date ? ' · Calendar event created' : ''))
      }
      setShowAddTask(false); setShowEditTask(false); setSelTask(null)
      setTaskForm({ ...TASK_BLANK })
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function saveDeal() {
    if (!dealForm.addr.trim()) { toast('Address required', '#DC2626'); return }
    if (!dealForm.agent_id)    { toast('Agent required', '#DC2626'); return }
    setSaving(true)
    try {
      const { synced, failed } = await syncToAllBoards(selDeal, dealPayload(dealForm))
      if (!failed) toast('✅ Deal saved' + (synced.length ? ' · Synced: ' + synced.join(', ') : ''))
      if (dealForm.c2c_enabled && !selDeal.c2c_enabled) await generateC2CTasks({ ...selDeal, ...dealPayload(dealForm) })
      setShowEditDeal(false); loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  // Derived state
  const filteredDeals = useMemo(() => deals.filter(d => {
    if (phaseFilter !== 'all' && d.tc_phase !== phaseFilter) return false
    if (agentFilter !== 'all' && d.agent_id !== agentFilter) return false
    if (search && !matchSearch(d, search, ['addr','attorney_name','mortgage_broker','notes'])) return false
    return true
  }), [deals, phaseFilter, agentFilter, search])

  const tasksByDeal = useMemo(() => {
    const m = {}
    tasks.forEach(t => { if (!m[t.deal_id]) m[t.deal_id]=[]; m[t.deal_id].push(t) })
    return m
  }, [tasks])

  const stats = useMemo(() => ({
    total:   deals.length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date)<new Date() && t.status!=='done').length,
    pre:     deals.filter(d => d.tc_phase==='pre_listing').length,
    uc:      deals.filter(d => d.tc_phase==='under_contract').length,
    closing: deals.filter(d => d.tc_phase==='under_contract' && d.close_date && new Date(d.close_date)<=new Date(Date.now()+14*86400000)).length,
  }), [deals, tasks])

  const S  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }
  const SL = { fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4, marginTop:10, display:'block' }

  if (loading) return <div style={{padding:48,textAlign:'center'}}><Loading /></div>

  // SQL migration notice
  if (sqlError) return (
    <div style={{ fontFamily:ff }}>
      <PageHeader title="TC Board" sub="Transaction Coordinator — one board from listing to close" />
      <div style={{ background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.25)', borderRadius:12, padding:20, maxWidth:700 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text)', marginBottom:8 }}>⚙️ First-time setup required</div>
        <p style={{ color:'var(--muted)', fontSize:13, marginBottom:12 }}>
          Run this SQL in your Supabase dashboard to create the TC Board tables.
          Go to <strong>supabase.com → SQL Editor</strong> and paste the following:
        </p>
        <pre style={{ background:'var(--dim)', borderRadius:8, padding:14, fontSize:10, overflow:'auto', color:'var(--text)', lineHeight:1.6 }}>
          {SQL_MIGRATION}
        </pre>
        <Btn onClick={loadAll} style={{ marginTop:12 }}>Retry after running SQL</Btn>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily:ff }}>
      <PageHeader
        title="🎯 TC Board"
        sub="One board — every deal from listing prep to post-close"
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <LastVisited page="tc" />
            {isAdmin && <Btn variant="secondary" onClick={() => navigate('/tc-settings')}>⚙️ TC Settings</Btn>}
            <TCSyncHealth agents={agents} onFixed={loadAll} />
            <Btn variant="secondary" onClick={() => navigate('/calendar')}>📅 Calendar</Btn>
            <Btn onClick={() => { setDealForm({...DEAL_BLANK}); setShowAddDeal(true) }}>+ New Deal</Btn>
          </div>
        }
      />

      <TCMorningSummary tasks={tasks} deals={deals} onCompleteTask={checkTask} />

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Total Deals',    val:stats.total,   color:'var(--brand)', icon:'📋' },
          { label:'Overdue Tasks',  val:stats.overdue, color:'#DC2626',      icon:'⚠️' },
          { label:'Pre-Listing',    val:stats.pre,     color:'#8B5CF6',      icon:'📋' },
          { label:'Under Contract', val:stats.uc,      color:'#F97316',      icon:'📝' },
          { label:'Closing ≤14d',   val:stats.closing, color:'#10B981',      icon:'🎉' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)',
            padding:'12px 14px', borderLeft:'4px solid '+s.color }}>
            <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', marginTop:2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by address, attorney, broker..."
          style={{ flex:1, minWidth:200, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }} />

        {/* Phase filter */}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <button onClick={()=>setPhaseFilter('all')}
            style={{ padding:'6px 12px', borderRadius:99, border:'1px solid '+(phaseFilter==='all'?'var(--brand)':'var(--border)'), background:phaseFilter==='all'?'rgba(204,34,0,.08)':'transparent', color:phaseFilter==='all'?'var(--brand)':'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            All
          </button>
          {PHASES.map(p => (
            <button key={p.id} onClick={()=>setPhaseFilter(p.id)}
              style={{ padding:'6px 12px', borderRadius:99, border:'1px solid '+(phaseFilter===p.id?p.color:'var(--border)'), background:phaseFilter===p.id?p.color+'18':'transparent', color:phaseFilter===p.id?p.color:'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        {/* Agent filter */}
        <select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
          <option value="all">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Deals */}
      {filteredDeals.length === 0 ? (
        <div style={{ textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🎯</div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:8 }}>
            {deals.length === 0 ? 'No deals yet' : 'No deals match your filters'}
          </div>
          {deals.length === 0 && (
            <Btn onClick={() => { setDealForm({...DEAL_BLANK}); setShowAddDeal(true) }}>+ Add Your First Deal</Btn>
          )}
        </div>
      ) : (
        filteredDeals.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            tasks={tasksByDeal[deal.id] || []}
            agents={agents}
            expanded={!!expanded[deal.id]}
            onToggle={() => setExpanded(p => ({...p,[deal.id]:!p[deal.id]}))}
            onPhaseChange={changePhase}
            onCheckTask={checkTask}
            onEditTask={t => { setSelTask(t); setSelDeal(deals.find(d=>d.id===t.deal_id)); setTaskForm({ title:t.title, priority:t.priority, due_date:t.due_date||'', agent_id:t.agent_id||'', notes:t.notes||'', needs_calendar:!!t.needs_calendar, reminder_days:t.reminder_days||'', completion_action:t.completion_action||'none', completion_note:t.completion_note||'' }); setShowEditTask(true) }}
            onAddTask={d => { setSelDeal(d); setSelTask(null); setTaskForm({...TASK_BLANK}); setShowAddTask(true) }}
            onEditDeal={d => { setSelDeal(d); setDealForm({ addr:d.addr, side:d.side, agent_id:d.agent_id||'', tc_phase:d.tc_phase, list_price:d.list_price||'', sale_price:d.sale_price||'', ao_date:d.ao_date||'', close_date:d.close_date||'', c2c_enabled:!!d.c2c_enabled, attorney_name:d.attorney_name||'', attorney_phone:d.attorney_phone||'', attorney_email:d.attorney_email||'', mortgage_broker:d.mortgage_broker||'', mortgage_phone:d.mortgage_phone||'', inspector:d.inspector||'', inspector_phone:d.inspector_phone||'', notes:d.notes||'' }); setShowEditDeal(true) }}
          />
        ))
      )}

      {/* ── ADD DEAL MODAL ── */}
      <Modal open={showAddDeal} onClose={()=>setShowAddDeal(false)} title="New Deal" width={600}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Property Address *</span>
            <AddressAutocomplete value={dealForm.addr||''} onChange={v=>setDealForm(p=>({...p,addr:v}))}
              onSelect={s=>setDealForm(p=>({...p, addr:(s.street||s.full)+(s.unit?' #'+s.unit:'')}))}
              placeholder="123 Main St, Monsey NY" style={S} />
          </div>
          <div>
            <span style={SL}>Side *</span>
            <select value={dealForm.side} onChange={e=>setDealForm(p=>({...p,side:e.target.value}))} style={S}>
              {['Seller','Buyer','Dual','Rental'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Agent * (required)</span>
            <select value={dealForm.agent_id} onChange={e=>setDealForm(p=>({...p,agent_id:e.target.value}))}
              style={{ ...S, borderColor:!dealForm.agent_id?'#DC2626':'var(--border)' }}>
              <option value="">— Select Agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Starting Phase</span>
            <select value={dealForm.tc_phase} onChange={e=>setDealForm(p=>({...p,tc_phase:e.target.value}))} style={S}>
              {PHASES.map(p=><option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>List Price</span>
            <input value={dealForm.list_price} onChange={e=>setDealForm(p=>({...p,list_price:e.target.value}))} placeholder="$0" style={S} />
          </div>
          <div>
            <span style={SL}>AO Date</span>
            <input type="date" value={dealForm.ao_date} onChange={e=>setDealForm(p=>({...p,ao_date:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Expected Close Date</span>
            <input type="date" value={dealForm.close_date} onChange={e=>setDealForm(p=>({...p,close_date:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Name</span>
            <input value={dealForm.attorney_name} onChange={e=>setDealForm(p=>({...p,attorney_name:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Phone</span>
            <input value={dealForm.attorney_phone} onChange={e=>setDealForm(p=>({...p,attorney_phone:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Mortgage Broker</span>
            <input value={dealForm.mortgage_broker} onChange={e=>setDealForm(p=>({...p,mortgage_broker:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Broker Phone</span>
            <input value={dealForm.mortgage_phone} onChange={e=>setDealForm(p=>({...p,mortgage_phone:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Inspector</span>
            <input value={dealForm.inspector} onChange={e=>setDealForm(p=>({...p,inspector:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Inspector Phone</span>
            <input value={dealForm.inspector_phone} onChange={e=>setDealForm(p=>({...p,inspector_phone:e.target.value}))} style={S} />
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Notes</span>
            <textarea value={dealForm.notes} onChange={e=>setDealForm(p=>({...p,notes:e.target.value}))} rows={2} style={{ ...S, resize:'vertical' }} />
          </div>
        </div>
        <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(59,130,246,.06)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
          📋 <strong>{PHASE_TASKS[dealForm.tc_phase]?.length || 0} tasks</strong> will be auto-generated for <strong>{PHASES.find(p=>p.id===dealForm.tc_phase)?.label}</strong>
          {PHASE_TASKS[dealForm.tc_phase]?.filter(t=>t.cal).length > 0 &&
            ' · 📅 ' + PHASE_TASKS[dealForm.tc_phase].filter(t=>t.cal).length + ' calendar events'}
          {PHASE_TASKS[dealForm.tc_phase]?.filter(t=>t.notify_agent).length > 0 &&
            ' · 📧 Agent will be notified'}
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowAddDeal(false)}>Cancel</Btn>
          <Btn onClick={createDeal} loading={saving}>Create Deal + Auto-Tasks</Btn>
        </ModalActions>
      </Modal>

      {/* ── EDIT DEAL MODAL ── */}
      <Modal open={showEditDeal} onClose={()=>setShowEditDeal(false)} title={'Edit — ' + (selDeal?.addr||'')} width={720}>
        <div style={{ marginBottom:10, padding:'8px 12px', background:'rgba(16,185,129,.06)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
          ⚡ Changes sync automatically to Production and Listings boards
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Address</span>
            <AddressAutocomplete value={dealForm.addr||''} onChange={v=>setDealForm(p=>({...p,addr:v}))}
              onSelect={s=>setDealForm(p=>({...p, addr:(s.street||s.full)+(s.unit?' #'+s.unit:'')}))} style={S} />
          </div>
          <div>
            <span style={SL}>Side</span>
            <select value={dealForm.side} onChange={e=>setDealForm(p=>({...p,side:e.target.value}))} style={S}>
              {['Seller','Buyer','Dual','Rental'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Agent</span>
            <select value={dealForm.agent_id} onChange={e=>setDealForm(p=>({...p,agent_id:e.target.value}))} style={S}>
              <option value="">— Select —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>List Price</span>
            <input value={dealForm.list_price} onChange={e=>setDealForm(p=>({...p,list_price:e.target.value}))} placeholder="$0" style={S} />
          </div>
          <div>
            <span style={SL}>Sale Price</span>
            <input value={dealForm.sale_price} onChange={e=>setDealForm(p=>({...p,sale_price:e.target.value}))} placeholder="$0" style={S} />
          </div>
          <div>
            <span style={SL}>AO Date</span>
            <input type="date" value={dealForm.ao_date} onChange={e=>setDealForm(p=>({...p,ao_date:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Close Date</span>
            <input type="date" value={dealForm.close_date} onChange={e=>setDealForm(p=>({...p,close_date:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Name</span>
            <input value={dealForm.attorney_name} onChange={e=>setDealForm(p=>({...p,attorney_name:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Phone</span>
            <input value={dealForm.attorney_phone} onChange={e=>setDealForm(p=>({...p,attorney_phone:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Email</span>
            <input value={dealForm.attorney_email} onChange={e=>setDealForm(p=>({...p,attorney_email:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Mortgage Broker</span>
            <input value={dealForm.mortgage_broker} onChange={e=>setDealForm(p=>({...p,mortgage_broker:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Broker Phone</span>
            <input value={dealForm.mortgage_phone} onChange={e=>setDealForm(p=>({...p,mortgage_phone:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Inspector</span>
            <input value={dealForm.inspector} onChange={e=>setDealForm(p=>({...p,inspector:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Inspector Phone</span>
            <input value={dealForm.inspector_phone} onChange={e=>setDealForm(p=>({...p,inspector_phone:e.target.value}))} style={S} />
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Notes</span>
            <textarea value={dealForm.notes} onChange={e=>setDealForm(p=>({...p,notes:e.target.value}))} rows={2} style={{ ...S, resize:'vertical' }} />
          </div>
          <label style={{ gridColumn:'span 2', display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text)', cursor:'pointer' }}>
            <input type="checkbox" checked={!!dealForm.c2c_enabled}
                   onChange={e=>setDealForm(p=>({...p,c2c_enabled:e.target.checked}))} />
            <span><b>Contract-to-close service</b> — auto-generates weekly mortgage-broker check-ins & party updates until closing, plus a commission-bill reminder a week before close</span>
          </label>
        </div>

        {selDeal?.id && (
          <div style={{ marginTop:14, borderTop:'1px solid var(--border)', paddingTop:4 }}>
            <BoardLinks tcDealId={selDeal.id} listingId={selDeal.linked_listing_id} dealId={selDeal.linked_deal_id} />
            <PeoplePanel dealId={selDeal.id} agentId={selDeal.agent_id}
                         roles={(tcCfg || DEFAULT_TC_SETTINGS).participant_roles} toast={toast} />
            <DocumentsPanel dealId={selDeal.id}
                            statuses={(tcCfg || DEFAULT_TC_SETTINGS).doc_statuses} toast={toast} />
            <PhotographyPanel deal={selDeal}
                              services={(tcCfg || DEFAULT_TC_SETTINGS).photo_services}
                              checklist={(tcCfg || DEFAULT_TC_SETTINGS).readiness_checklist} toast={toast} />
            <TCSignPanel deal={selDeal} toast={toast}
                         onLinked={id => setSelDeal(d => ({ ...d, linked_sign_id: id }))} />
            <TCDealChat dealId={selDeal.id} dealAddr={selDeal.addr} agents={agents} me={agent} toast={toast} />
            <div style={{ marginTop:12 }}>
              <Btn variant="secondary" onClick={openCommissionBill}>🧾 Commission Bill…</Btn>
            </div>
          </div>
        )}

        <CommissionBillModal open={showBill} onClose={()=>setShowBill(false)} deal={selDeal}
                             participants={billPeople.rows} contacts={billPeople.contacts}
                             agent={agent} ratePercent={(tcCfg || DEFAULT_TC_SETTINGS).commission_rate_percent || 1.5}
                             toast={toast} />

        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowEditDeal(false)}>Cancel</Btn>
          <Btn onClick={saveDeal} loading={saving}>Save + Sync All Boards</Btn>
        </ModalActions>
      </Modal>

      {/* ── ADD / EDIT TASK MODAL ── */}
      <Modal open={showAddTask||showEditTask} onClose={()=>{setShowAddTask(false);setShowEditTask(false);setSelTask(null)}}
        title={(selTask?'Edit Task':'Add Task') + ' — ' + (selDeal?.addr||'')} width={500}>
        <span style={SL}>Task Title *</span>
        <input value={taskForm.title} onChange={e=>setTaskForm(p=>({...p,title:e.target.value}))}
          placeholder="What needs to be done?" style={S} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:4 }}>
          <div>
            <span style={SL}>Priority</span>
            <select value={taskForm.priority} onChange={e=>setTaskForm(p=>({...p,priority:e.target.value}))} style={S}>
              {['urgent','high','normal','low'].map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Due Date</span>
            <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(p=>({...p,due_date:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Assign To</span>
            <select value={taskForm.agent_id} onChange={e=>setTaskForm(p=>({...p,agent_id:e.target.value}))} style={S}>
              <option value="">— Same as deal agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Reminder (days before due)</span>
            <select value={taskForm.reminder_days} onChange={e=>setTaskForm(p=>({...p,reminder_days:e.target.value}))} style={S}>
              <option value="">No reminder</option>
              {[1,2,3,5,7,14].map(d=><option key={d} value={d}>{d} day{d!==1?'s':''} before</option>)}
            </select>
          </div>
        </div>

        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', margin:'12px 0 4px', fontSize:13, color:'var(--text)' }}>
          <input type="checkbox" checked={!!taskForm.needs_calendar} onChange={e=>setTaskForm(p=>({...p,needs_calendar:e.target.checked}))}
            style={{ width:15, height:15, accentColor:'var(--brand)' }} />
          📅 Create calendar event + notify agent
        </label>

        <span style={SL}>When completed, automatically…</span>
        <select value={taskForm.completion_action} onChange={e=>setTaskForm(p=>({...p,completion_action:e.target.value}))} style={{ ...S, marginBottom:6 }}>
          <option value="none">Nothing (just mark done)</option>
          <option value="notify_agent">📧 Email agent that this is done</option>
          <option value="create_next_task">➕ Create next task automatically</option>
        </select>

        {taskForm.completion_action === 'create_next_task' && (
          <input value={taskForm.completion_note} onChange={e=>setTaskForm(p=>({...p,completion_note:e.target.value}))}
            placeholder="Next task title to auto-create..." style={S} />
        )}
        {taskForm.completion_action === 'notify_agent' && (
          <textarea value={taskForm.completion_note} onChange={e=>setTaskForm(p=>({...p,completion_note:e.target.value}))}
            placeholder="Optional message to include in the notification..." rows={2} style={{ ...S, resize:'vertical' }} />
        )}

        <span style={SL}>Notes</span>
        <textarea value={taskForm.notes} onChange={e=>setTaskForm(p=>({...p,notes:e.target.value}))}
          placeholder="Any additional details..." rows={2} style={{ ...S, resize:'vertical' }} />

        <ModalActions>
          <Btn variant="secondary" onClick={()=>{setShowAddTask(false);setShowEditTask(false);setSelTask(null)}}>Cancel</Btn>
          <Btn onClick={saveTask} loading={saving}>{selTask ? 'Save Changes' : 'Add Task'}</Btn>
        </ModalActions>
      </Modal>
    </div>
  )
}
