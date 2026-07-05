// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Transaction Coordinator Board
// One board for the secretary to manage every deal from
// listing creation → photography → live → offer → UC → close
//
// PHASES:
// 1. PRE-LISTING  — before property goes live
// 2. ACTIVE       — property is live on market
// 3. OFFER        — accepted offer, going under contract
// 4. UNDER CONTRACT — UC through closing (buyer & seller sides)
// 5. CLOSED       — post-close follow-up
//
// FEATURES:
// - All tasks in one place, grouped by deal/listing
// - Auto-tasks generated per phase when status changes
// - Photography scheduling → calendar event + agent notification
// - Price change syncs across all boards automatically
// - Every deal requires an assigned agent
// - Mortgage broker, appraisal, attorney tracking per deal
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill, ModalActions, Loading, Empty, Confirm, SearchInput } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── PHASE DEFINITIONS ─────────────────────────────────────────────
const PHASES = [
  { id: 'pre_listing',     label: 'Pre-Listing',      color: '#8B5CF6', icon: '📋', desc: 'Before going live' },
  { id: 'active',          label: 'Active Listing',   color: '#3B82F6', icon: '🏡', desc: 'Live on market' },
  { id: 'offer',           label: 'Offer Accepted',   color: '#F5A623', icon: '✍️', desc: 'AO signed' },
  { id: 'under_contract',  label: 'Under Contract',   color: '#F97316', icon: '📝', desc: 'UC through closing' },
  { id: 'closed',          label: 'Closed',           color: '#10B981', icon: '🎉', desc: 'Post-close' },
]

// ── AUTO-TASK TEMPLATES PER PHASE ────────────────────────────────
const PHASE_TASKS = {
  pre_listing: [
    { id: 'listing_agreement',  label: 'Get listing agreement signed',        priority: 'urgent', days_from_now: 0 },
    { id: 'schedule_photos',    label: 'Schedule photography',                priority: 'urgent', days_from_now: 2, needs_calendar: true },
    { id: 'order_sign',         label: 'Order yard sign',                     priority: 'high',   days_from_now: 3 },
    { id: 'disclosure_docs',    label: 'Prepare disclosure documents',        priority: 'high',   days_from_now: 3 },
    { id: 'floor_plan',         label: 'Arrange floor plan / measurements',   priority: 'normal', days_from_now: 4 },
    { id: 'brochure',           label: 'Create property brochure',            priority: 'normal', days_from_now: 5 },
    { id: 'mls_prep',           label: 'Prepare MLS listing description',     priority: 'high',   days_from_now: 5 },
    { id: 'lockbox',            label: 'Install lockbox',                     priority: 'high',   days_from_now: 6 },
    { id: 'showing_instructions',label:'Set up showing instructions',         priority: 'high',   days_from_now: 6 },
    { id: 'social_ads',         label: 'Create social media ads',             priority: 'normal', days_from_now: 7 },
  ],
  active: [
    { id: 'mls_live',           label: 'Confirm listing is live on MLS',      priority: 'urgent', days_from_now: 0 },
    { id: 'ads_running',        label: 'Confirm ads are running',             priority: 'high',   days_from_now: 1 },
    { id: 'open_house',         label: 'Schedule first open house',           priority: 'high',   days_from_now: 3, needs_calendar: true },
    { id: 'agent_followup',     label: 'Follow up with showing agents',       priority: 'normal', days_from_now: 7 },
    { id: 'price_review',       label: 'Price review with agent (2 weeks)',   priority: 'normal', days_from_now: 14 },
  ],
  offer: [
    { id: 'offer_signed',       label: 'Get accepted offer signed by all parties', priority: 'urgent', days_from_now: 0 },
    { id: 'notify_attorney',    label: 'Notify attorney / title company',     priority: 'urgent', days_from_now: 0 },
    { id: 'binder_deposit',     label: 'Confirm binder deposit received',     priority: 'urgent', days_from_now: 1 },
    { id: 'open_escrow',        label: 'Open escrow / title order',           priority: 'high',   days_from_now: 2 },
    { id: 'buyer_attorney',     label: 'Confirm buyer attorney info',         priority: 'high',   days_from_now: 2 },
    { id: 'seller_attorney',    label: 'Confirm seller attorney info',        priority: 'high',   days_from_now: 2 },
    { id: 'contract_send',      label: 'Send contract to all parties',        priority: 'urgent', days_from_now: 3 },
  ],
  under_contract: [
    { id: 'inspection',         label: 'Schedule inspection',                 priority: 'urgent', days_from_now: 2, needs_calendar: true },
    { id: 'inspection_results', label: 'Follow up on inspection results',     priority: 'urgent', days_from_now: 7 },
    { id: 'mortgage_applied',   label: 'Confirm buyer mortgage application',  priority: 'urgent', days_from_now: 3 },
    { id: 'mortgage_followup',  label: 'Follow up with mortgage broker',      priority: 'high',   days_from_now: 10 },
    { id: 'appraisal_ordered',  label: 'Confirm appraisal ordered',          priority: 'high',   days_from_now: 7 },
    { id: 'appraisal_result',   label: 'Follow up on appraisal result',      priority: 'high',   days_from_now: 21 },
    { id: 'conditional_approval',label:'Confirm conditional loan approval',   priority: 'urgent', days_from_now: 25 },
    { id: 'clear_to_close',     label: 'Get clear to close confirmation',    priority: 'urgent', days_from_now: 30 },
    { id: 'closing_date',       label: 'Confirm closing date & time',        priority: 'urgent', days_from_now: 30, needs_calendar: true },
    { id: 'final_walkthrough',  label: 'Schedule final walkthrough',         priority: 'high',   days_from_now: 32, needs_calendar: true },
    { id: 'closing_docs',       label: 'Prepare closing documents',          priority: 'urgent', days_from_now: 33 },
    { id: 'wire_instructions',  label: 'Send wire instructions to buyer',    priority: 'urgent', days_from_now: 33 },
    { id: 'hud_review',         label: 'Review HUD / closing disclosure',    priority: 'urgent', days_from_now: 34 },
    { id: 'keys_ready',         label: 'Confirm keys & access transfer plan',priority: 'high',   days_from_now: 35 },
  ],
  closed: [
    { id: 'commission_confirm', label: 'Confirm commission received',        priority: 'urgent', days_from_now: 1 },
    { id: 'update_production',  label: 'Update production board as Closed', priority: 'urgent', days_from_now: 0 },
    { id: 'thank_you_card',     label: 'Send thank you card to client',     priority: 'high',   days_from_now: 2 },
    { id: 'gift_sent',          label: 'Arrange closing gift',              priority: 'high',   days_from_now: 2 },
    { id: 'google_review',      label: 'Request Google review from client', priority: 'normal', days_from_now: 7 },
    { id: 'referral_ask',       label: 'Ask for referrals',                priority: 'normal', days_from_now: 14 },
    { id: 'file_archive',       label: 'Archive transaction file',          priority: 'normal', days_from_now: 7 },
  ],
}

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── TASK ROW ──────────────────────────────────────────────────────
function TaskRow({ task, onComplete, onEdit, agents }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
  const isDone    = task.status === 'done'
  const agent     = agents?.find(a => a.id === task.agent_id)

  const PCOLORS = { urgent: '#DC2626', high: '#F97316', normal: '#3B82F6', low: '#94A3B8' }
  const pc = PCOLORS[task.priority] || '#94A3B8'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', opacity: isDone ? 0.5 : 1, background: isOverdue ? 'rgba(220,38,38,.03)' : 'transparent' }}>
      {/* Complete checkbox */}
      <div onClick={() => !isDone && onComplete(task.id)}
        style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (isDone ? '#10B981' : pc), background: isDone ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isDone ? 'default' : 'pointer', flexShrink: 0 }}>
        {isDone && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
      </div>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>{task.title}</div>
        {task.due_date && (
          <div style={{ fontSize: 10, color: isOverdue ? '#DC2626' : 'var(--muted)', fontWeight: isOverdue ? 700 : 400, marginTop: 1 }}>
            {isOverdue ? '⚠️ Overdue · ' : ''}{fmtDate(task.due_date)}
            {task.needs_calendar && ' · 📅 Calendar'}
          </div>
        )}
      </div>

      {/* Priority badge */}
      <div style={{ fontSize: 9, fontWeight: 700, color: pc, background: pc + '18', padding: '2px 6px', borderRadius: 99, flexShrink: 0, textTransform: 'uppercase' }}>
        {task.priority}
      </div>

      {/* Agent avatar */}
      {agent && (
        <div title={agent.name} style={{ width: 22, height: 22, borderRadius: '50%', background: agent.color || '#94A3B8', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {agent.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
        </div>
      )}

      {/* Edit */}
      <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: '0 4px' }}>✏️</button>
    </div>
  )
}

// ── DEAL CARD ─────────────────────────────────────────────────────
function DealCard({ deal, tasks, agents, onPhaseChange, onCompleteTask, onEditTask, onAddTask, onPriceChange, onEditDeal, expanded, onToggle }) {
  const phase     = PHASES.find(p => p.id === deal.tc_phase) || PHASES[0]
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const totalTasks= tasks.length
  const overdue   = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length
  const agent     = agents?.find(a => a.id === deal.agent_id)
  const progress  = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0

  return (
    <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      {/* Header */}
      <div onClick={onToggle} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: expanded ? '1px solid var(--border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Phase indicator */}
          <div style={{ width: 6, height: 40, borderRadius: 99, background: phase.color, flexShrink: 0 }} />

          {/* Address + details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{deal.addr || deal.listing_addr || '—'}</span>
              {deal.side && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: deal.side === 'Buyer' ? '#3B82F6' : '#8B5CF6', padding: '1px 7px', borderRadius: 99 }}>{deal.side}</span>}
              {overdue > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: 'rgba(220,38,38,.1)', padding: '1px 7px', borderRadius: 99 }}>⚠️ {overdue} overdue</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {deal.list_price && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Listed: {fmt$(deal.list_price)}</span>}
              {deal.sale_price && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sale: {fmt$(deal.sale_price)}</span>}
              {deal.close_date && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Close: {fmtDate(deal.close_date)}</span>}
              {agent && <span style={{ fontSize: 11, color: agent.color || 'var(--muted)', fontWeight: 700 }}>👤 {agent.name.split(' ')[0]}</span>}
            </div>
          </div>

          {/* Progress + phase pill */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: phase.color, background: phase.color + '18', padding: '3px 10px', borderRadius: 99, marginBottom: 4 }}>
              {phase.icon} {phase.label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{doneTasks}/{totalTasks} tasks · {progress}%</div>
          </div>

          <span style={{ color: 'var(--muted)', fontSize: 14, transition: 'transform .2s', transform: expanded ? 'rotate(0)' : 'rotate(-90deg)' }}>▾</span>
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: progress + '%', background: phase.color, borderRadius: 99, transition: 'width .4s' }} />
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div>
          {/* Phase selector */}
          <div style={{ padding: '10px 16px', background: 'var(--dim)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Phase:</span>
            {PHASES.map(p => (
              <button key={p.id} onClick={() => onPhaseChange(deal, p.id)}
                style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid ' + (deal.tc_phase === p.id ? p.color : 'var(--border)'), background: deal.tc_phase === p.id ? p.color + '18' : 'transparent', color: deal.tc_phase === p.id ? p.color : 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          {/* Key deal info row */}
          <div style={{ padding: '8px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--dim)' }}>
            {[
              { label: 'Attorney', value: deal.attorney_name || '—', icon: '⚖️' },
              { label: 'Mortgage Broker', value: deal.mortgage_broker || '—', icon: '🏦' },
              { label: 'Inspector', value: deal.inspector || '—', icon: '🔍' },
              { label: 'AO Date', value: deal.ao_date ? fmtDate(deal.ao_date) : '—', icon: '📅' },
              { label: 'Close Date', value: deal.close_date ? fmtDate(deal.close_date) : '—', icon: '🎯' },
            ].map(info => (
              <div key={info.label}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{info.icon} {info.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>{info.value}</div>
              </div>
            ))}
          </div>

          {/* Tasks */}
          <div>
            {tasks.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                No tasks yet — <button onClick={() => onAddTask(deal)} style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff, fontWeight: 700 }}>add task</button>
              </div>
            ) : (
              tasks.map(t => (
                <TaskRow key={t.id} task={t} agents={agents} onComplete={onCompleteTask} onEdit={onEditTask} />
              ))
            )}
          </div>

          {/* Footer actions */}
          <div style={{ padding: '8px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--dim)' }}>
            <button onClick={() => onAddTask(deal)}
              style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              + Add Task
            </button>
            <button onClick={() => onPriceChange(deal)}
              style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              💰 Update Price
            </button>
            <button onClick={() => onEditDeal(deal)}
              style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
              ✏️ Edit Deal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────
export function TransactionCoordinator() {
  const navigate = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const [deals,      setDeals]      = useState([])
  const [tasks,      setTasks]      = useState([])
  const [agents,     setAgents]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [phaseFilter,setPhaseFilter]= useState('all')
  const [agentFilter,setAgentFilter]= useState('all')
  const [expanded,   setExpanded]   = useState({})
  const [showAddDeal,setShowAddDeal]= useState(false)
  const [showAddTask,setShowAddTask]= useState(false)
  const [showPrice,  setShowPrice]  = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [showEditDeal,setShowEditDeal]=useState(false)
  const [selDeal,    setSelDeal]    = useState(null)
  const [selTask,    setSelTask]    = useState(null)
  const [saving,     setSaving]     = useState(false)

  const [dealForm, setDealForm] = useState({
    addr: '', side: 'Seller', agent_id: '', tc_phase: 'pre_listing',
    list_price: '', sale_price: '', ao_date: '', close_date: '',
    attorney_name: '', attorney_phone: '', attorney_email: '',
    mortgage_broker: '', mortgage_phone: '',
    inspector: '', inspector_phone: '',
    notes: '', contact_id: null,
  })

  const [taskForm, setTaskForm] = useState({ title: '', priority: 'high', due_date: '', agent_id: '', notes: '', needs_calendar: false, reminder_days: '', completion_action: 'none', completion_note: '', completion_value: '' })
  const [priceForm, setPriceForm] = useState({ list_price: '', sale_price: '', reason: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [dealsRes, tasksRes, agentsRes] = await Promise.all([
        supabase.from('tc_deals').select('*').order('updated_at', { ascending: false }),
        supabase.from('tc_tasks').select('*').order('due_date', { ascending: true }),
        supabase.from('agents').select('id,name,color,email,phone').eq('active', true).order('name'),
      ])
      setDeals(dealsRes.data || [])
      setTasks(tasksRes.data || [])
      setAgents(agentsRes.data || [])
    } catch(e) {
      // Tables may not exist yet — show migration notice
      toast('Run SQL migration to enable TC Board — see below', '#F97316')
    } finally { setLoading(false) }
  }

  // Filter deals
  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      if (phaseFilter !== 'all' && d.tc_phase !== phaseFilter) return false
      if (agentFilter !== 'all' && d.agent_id !== agentFilter) return false
      if (search && !matchSearch(d, search, ['addr', 'side', 'attorney_name', 'mortgage_broker'])) return false
      return true
    })
  }, [deals, phaseFilter, agentFilter, search])

  // Group tasks by deal
  const tasksByDeal = useMemo(() => {
    const map = {}
    tasks.forEach(t => {
      if (!map[t.deal_id]) map[t.deal_id] = []
      map[t.deal_id].push(t)
    })
    return map
  }, [tasks])

  // Stats
  const stats = useMemo(() => ({
    total:    deals.length,
    overdue:  tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
    preListing: deals.filter(d => d.tc_phase === 'pre_listing').length,
    uc:       deals.filter(d => d.tc_phase === 'under_contract').length,
    closing:  deals.filter(d => d.tc_phase === 'under_contract' && d.close_date && new Date(d.close_date) <= new Date(Date.now() + 14*86400000)).length,
  }), [deals, tasks])

  async function createDeal() {
    if (!dealForm.addr.trim()) { toast('Address required', '#DC2626'); return }
    if (!dealForm.agent_id)    { toast('Assign an agent to this deal', '#DC2626'); return }
    setSaving(true)
    try {
      const { data: newDeal, error } = await supabase.from('tc_deals').insert({
        ...dealForm,
        list_price: dealForm.list_price ? parseFloat(dealForm.list_price.replace(/[$,]/g,'')) : null,
        sale_price: dealForm.sale_price ? parseFloat(dealForm.sale_price.replace(/[$,]/g,'')) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()

      if (error) throw error

      // Auto-generate tasks for the initial phase
      await generatePhaseTasks(newDeal.id, dealForm.tc_phase, dealForm.agent_id)
      toast('✅ Deal created with ' + (PHASE_TASKS[dealForm.tc_phase]?.length || 0) + ' auto-tasks')
      setShowAddDeal(false)
      setDealForm({ addr:'', side:'Seller', agent_id:'', tc_phase:'pre_listing', list_price:'', sale_price:'', ao_date:'', close_date:'', attorney_name:'', attorney_phone:'', attorney_email:'', mortgage_broker:'', mortgage_phone:'', inspector:'', inspector_phone:'', notes:'', contact_id:null })
      setExpanded(p => ({ ...p, [newDeal.id]: true }))
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function generatePhaseTasks(dealId, phase, agentId) {
    const templates = PHASE_TASKS[phase] || []
    if (!templates.length) return

    const tasks = templates.map(t => ({
      deal_id:       dealId,
      title:         t.label,
      priority:      t.priority,
      due_date:      addDays(t.days_from_now),
      status:        'pending',
      agent_id:      agentId,
      needs_calendar:t.needs_calendar || false,
      phase,
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }))

    const { error } = await supabase.from('tc_tasks').insert(tasks)
    if (error) throw error

    // Auto-create calendar events for tasks that need it
    for (const t of tasks.filter(t => t.needs_calendar)) {
      await supabase.from('calendar_events').insert({
        agent_id:   agentId,
        title:      t.title + ' — ' + (deals.find(d => d.id === dealId)?.addr || 'Property'),
        start_date: t.due_date,
        start_time: '10:00',
        type:       'task',
        notes:      'Auto-created from Transaction Coordinator',
        created_at: new Date().toISOString(),
      }).catch(() => {})
    }
  }

  async function changePhase(deal, newPhase) {
    if (deal.tc_phase === newPhase) return
    const phaseDef = PHASES.find(p => p.id === newPhase)
    const taskCount = PHASE_TASKS[newPhase]?.length || 0
    const calCount  = PHASE_TASKS[newPhase]?.filter(t=>t.needs_calendar).length || 0

    if (!window.confirm(
      'Move "' + deal.addr + '" to ' + phaseDef?.label + '?\n\n' +
      '• ' + taskCount + ' tasks will be auto-generated\n' +
      (calCount > 0 ? '• ' + calCount + ' calendar events will be created\n' : '') +
      '• Listing/Deal status will sync to all boards'
    )) return

    try {
      const synced = await syncToAllBoards(deal, { tc_phase: newPhase })
      await generatePhaseTasks(deal.id, newPhase, deal.agent_id)

      // Send email notification to agent about phase change
      const ag = agents.find(a => a.id === deal.agent_id)
      if (ag?.email) {
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: ag.email,
            subject: '📋 ' + deal.addr + ' moved to ' + phaseDef?.label,
            html: '<p>Hi ' + (ag.name?.split(' ')[0]||'Agent') + ',</p>' +
                  '<p>The transaction for <strong>' + deal.addr + '</strong> has been moved to <strong>' + phaseDef?.label + '</strong>.</p>' +
                  '<p>' + taskCount + ' new tasks have been generated for this phase. Please check your TC Board for the latest tasks and deadlines.</p>' +
                  '<p><a href="https://app.targetreteam.com/tc">Open TC Board →</a></p>',
          })
        }).catch(() => {})
      }

      toast('✅ Phase → ' + phaseDef?.label + (synced.length ? ' · Synced: ' + synced.join(', ') : ''))
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  // ── EDIT EXISTING TASK ──────────────────────────────────────────
  async function saveEditTask() {
    if (!taskForm.title.trim()) { toast('Title required', '#DC2626'); return }
    setSaving(true)
    try {
      const updates = {
        title:          taskForm.title,
        priority:       taskForm.priority,
        due_date:       taskForm.due_date || null,
        agent_id:       taskForm.agent_id || selDeal?.agent_id || null,
        notes:          taskForm.notes || null,
        needs_calendar: taskForm.needs_calendar,
        reminder_days:  taskForm.reminder_days || null,
        completion_action: taskForm.completion_action || null,
        completion_note:   taskForm.completion_note || null,
        updated_at:     new Date().toISOString(),
      }

      const { error } = await supabase.from('tc_tasks').update(updates).eq('id', selTask.id)
      if (error) throw error

      // Update calendar event if date changed
      if (taskForm.needs_calendar && taskForm.due_date) {
        // Check if calendar event exists
        const { data: existing } = await supabase.from('calendar_events')
          .select('id').ilike('title', '%' + selTask.title.slice(0, 20) + '%').maybeSingle()
        if (existing?.id) {
          await supabase.from('calendar_events').update({ start_date: taskForm.due_date }).eq('id', existing.id)
        } else {
          await supabase.from('calendar_events').insert({
            agent_id:   taskForm.agent_id || selDeal?.agent_id,
            title:      taskForm.title + ' — ' + selDeal?.addr,
            start_date: taskForm.due_date,
            start_time: '10:00', type: 'task',
            created_at: new Date().toISOString(),
          }).catch(() => {})
        }
      }

      toast('✅ Task updated')
      setShowEdit(false)
      setSelTask(null)
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  // ── COMPLETE TASK + TRIGGER ACTION ──────────────────────────────
  async function completeTask(taskId) {
    try {
      const task = tasks.find(t => t.id === taskId)
      await supabase.from('tc_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', taskId)
      setTasks(p => p.map(t => t.id === taskId ? { ...t, status: 'done' } : t))

      // Handle completion actions
      if (task?.completion_action && task?.completion_action !== 'none') {
        const deal = deals.find(d => d.id === task.deal_id)
        const ag   = agents.find(a => a.id === (task.agent_id || deal?.agent_id))

        if (task.completion_action === 'notify_agent' && ag?.email) {
          fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: ag.email,
              subject: '✅ Task completed: ' + task.title,
              html: '<p>Hi ' + (ag.name?.split(' ')[0]||'Agent') + ',</p>' +
                    '<p>The following task has been completed for <strong>' + (deal?.addr||'your deal') + '</strong>:</p>' +
                    '<p><strong>' + task.title + '</strong></p>' +
                    (task.completion_note ? '<p>Notes: ' + task.completion_note + '</p>' : '') +
                    '<p><a href="https://app.targetreteam.com/tc">View TC Board →</a></p>',
            })
          }).catch(() => {})
          toast('✅ Task done · Agent notified by email')

        } else if (task.completion_action === 'update_stage' && deal) {
          await syncToAllBoards(deal, { tc_phase: task.completion_value || deal.tc_phase })
          toast('✅ Task done · Status synced to all boards')

        } else if (task.completion_action === 'create_next_task' && task.completion_note) {
          await supabase.from('tc_tasks').insert({
            deal_id:    task.deal_id,
            title:      task.completion_note,
            priority:   'high',
            status:     'pending',
            agent_id:   task.agent_id,
            phase:      task.phase,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          toast('✅ Task done · Next task created automatically')
          loadAll()
          return

        } else {
          toast('✅ Task completed')
        }
      } else {
        toast('✅ Task completed')
      }
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  // ── EDIT DEAL (sync to all boards) ──────────────────────────────
  async function saveDealEdit() {
    setSaving(true)
    try {
      // Build updates from dealForm — only changed fields
      const updates = {
        addr:            dealForm.addr,
        side:            dealForm.side,
        agent_id:        dealForm.agent_id,
        list_price:      dealForm.list_price ? parseFloat(String(dealForm.list_price).replace(/[$,]/g,'')) : null,
        sale_price:      dealForm.sale_price ? parseFloat(String(dealForm.sale_price).replace(/[$,]/g,'')) : null,
        ao_date:         dealForm.ao_date    || null,
        close_date:      dealForm.close_date || null,
        attorney_name:   dealForm.attorney_name  || null,
        attorney_phone:  dealForm.attorney_phone || null,
        attorney_email:  dealForm.attorney_email || null,
        mortgage_broker: dealForm.mortgage_broker || null,
        mortgage_phone:  dealForm.mortgage_phone  || null,
        inspector:       dealForm.inspector       || null,
        inspector_phone: dealForm.inspector_phone || null,
        notes:           dealForm.notes || null,
      }
      const synced = await syncToAllBoards(selDeal, updates)
      toast('✅ Deal updated' + (synced.length ? ' · Synced: ' + synced.join(', ') : ''))
      setShowEditDeal(false)
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }



  async function addTask() {
    if (!taskForm.title.trim()) { toast('Task title required', '#DC2626'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('tc_tasks').insert({
        deal_id:       selDeal.id,
        title:         taskForm.title,
        priority:      taskForm.priority,
        due_date:      taskForm.due_date || null,
        status:        'pending',
        agent_id:      taskForm.agent_id || selDeal.agent_id,
        needs_calendar:taskForm.needs_calendar,
        notes:         taskForm.notes || null,
        phase:         selDeal.tc_phase,
        created_at:    new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      })
      if (error) throw error

      // Calendar event if needed
      if (taskForm.needs_calendar && taskForm.due_date) {
        await supabase.from('calendar_events').insert({
          agent_id:   taskForm.agent_id || selDeal.agent_id,
          title:      taskForm.title + ' — ' + selDeal.addr,
          start_date: taskForm.due_date,
          start_time: '10:00',
          type:       'task',
          created_at: new Date().toISOString(),
        }).catch(() => {})
        toast('✅ Task added + calendar event created')
      } else {
        toast('✅ Task added')
      }
      setShowAddTask(false)
      setTaskForm({ title:'', priority:'high', due_date:'', agent_id:'', notes:'', needs_calendar:false })
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  // ── MASTER SYNC ENGINE ──────────────────────────────────────────
  // When ANY field changes in TC, sync it everywhere it appears
  async function syncToAllBoards(deal, updates) {
    const synced = []
    try {
      // Always update tc_deals itself
      await supabase.from('tc_deals')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', deal.id)

      // Sync list_price → listings table
      if (updates.list_price !== undefined && deal.linked_listing_id) {
        await supabase.from('listings')
          .update({ list_price: updates.list_price, updated_at: new Date().toISOString() })
          .eq('id', deal.linked_listing_id)
        synced.push('Listings board')
      }

      // Sync sale_price → deals table
      if (updates.sale_price !== undefined && deal.linked_deal_id) {
        await supabase.from('deals')
          .update({ sale_price: updates.sale_price, updated_at: new Date().toISOString() })
          .eq('id', deal.linked_deal_id)
        synced.push('Production board')
      }

      // Sync ao_date → deals table
      if (updates.ao_date !== undefined && deal.linked_deal_id) {
        await supabase.from('deals')
          .update({ ao_date: updates.ao_date, updated_at: new Date().toISOString() })
          .eq('id', deal.linked_deal_id)
        if (!synced.includes('Production board')) synced.push('Production board')
      }

      // Sync close_date → deals table
      if (updates.close_date !== undefined && deal.linked_deal_id) {
        await supabase.from('deals')
          .update({ close_date: updates.close_date, updated_at: new Date().toISOString() })
          .eq('id', deal.linked_deal_id)
        if (!synced.includes('Production board')) synced.push('Production board')
      }

      // Sync stage/phase → deals table stage column
      if (updates.tc_phase !== undefined && deal.linked_deal_id) {
        const phaseToStage = {
          pre_listing:    'Negotiations',
          active:         'Negotiations',
          offer:          'Offer Accapted',
          under_contract: 'Under Contract',
          closed:         'Closed',
        }
        const stage = phaseToStage[updates.tc_phase]
        if (stage) {
          await supabase.from('deals')
            .update({ stage, updated_at: new Date().toISOString() })
            .eq('id', deal.linked_deal_id)
          if (!synced.includes('Production board')) synced.push('Production board')
        }
      }

      // Sync listing status → listings table
      if (updates.tc_phase !== undefined && deal.linked_listing_id) {
        const phaseToStatus = {
          pre_listing:    'Coming Soon',
          active:         'Active',
          offer:          'Under Contract',
          under_contract: 'Under Contract',
          closed:         'Sold',
        }
        const status = phaseToStatus[updates.tc_phase]
        if (status) {
          await supabase.from('listings')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', deal.linked_listing_id)
          if (!synced.includes('Listings board')) synced.push('Listings board')
        }
      }

      // Sync agent_id everywhere
      if (updates.agent_id !== undefined) {
        if (deal.linked_deal_id) {
          await supabase.from('deals')
            .update({ agent_id: updates.agent_id, updated_at: new Date().toISOString() })
            .eq('id', deal.linked_deal_id)
          if (!synced.includes('Production board')) synced.push('Production board')
        }
        if (deal.linked_listing_id) {
          await supabase.from('listings')
            .update({ agent_id: updates.agent_id, updated_at: new Date().toISOString() })
            .eq('id', deal.linked_listing_id)
          if (!synced.includes('Listings board')) synced.push('Listings board')
        }
      }

      return synced
    } catch(e) {
      console.error('syncToAllBoards error:', e.message)
      return synced
    }
  }

  async function updatePrice() {
    if (!priceForm.list_price && !priceForm.sale_price) { toast('Enter at least one price', '#DC2626'); return }
    setSaving(true)
    try {
      const updates = {}
      if (priceForm.list_price) updates.list_price = parseFloat(String(priceForm.list_price).replace(/[$,]/g,''))
      if (priceForm.sale_price) updates.sale_price = parseFloat(String(priceForm.sale_price).replace(/[$,]/g,''))
      const synced = await syncToAllBoards(selDeal, updates)
      toast('✅ Price updated' + (synced.length ? ' · Synced to: ' + synced.join(', ') : ''))
      setShowPrice(false)
      setPriceForm({ list_price:'', sale_price:'', reason:'' })
      loadAll()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  const S = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const SL = { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5, marginTop:12, display:'block' }

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Loading /></div>

  return (
    <div style={{ fontFamily:ff }}>
      <PageHeader
        title="Transaction Coordinator"
        sub="All deals from listing to closing — one place for the secretary"
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="secondary" onClick={() => navigate('/calendar')}>📅 Calendar</Btn>
            <Btn onClick={() => setShowAddDeal(true)}>+ New Deal</Btn>
          </div>
        }
      />

      {/* Stats bar */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Total Active', value:stats.total,      color:'var(--brand)', icon:'📋' },
          { label:'⚠️ Overdue Tasks', value:stats.overdue, color:'#DC2626',    icon:'🔴' },
          { label:'Pre-Listing',  value:stats.preListing, color:'#8B5CF6',     icon:'📋' },
          { label:'Under Contract',value:stats.uc,        color:'#F97316',     icon:'📝' },
          { label:'Closing Soon', value:stats.closing,    color:'#10B981',     icon:'🎉' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', padding:'12px 14px', borderLeftWidth:3, borderLeftColor:s.color }}>
            <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, marginTop:2, textTransform:'uppercase', letterSpacing:'.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* SQL notice if tables missing */}
      {deals.length === 0 && tasks.length === 0 && !loading && (
        <div style={{ background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', borderRadius:10, padding:'14px 16px', marginBottom:16, fontSize:12, color:'var(--text)' }}>
          <strong>📋 First-time setup:</strong> Run this SQL in Supabase to create the TC Board tables:
          <pre style={{ fontSize:10, background:'var(--dim)', padding:'10px', borderRadius:8, marginTop:8, overflow:'auto', color:'var(--text)' }}>{`create table if not exists tc_deals (
  id uuid primary key default gen_random_uuid(),
  addr text not null,
  side text default 'Seller',
  tc_phase text default 'pre_listing',
  agent_id uuid references agents(id),
  list_price numeric,
  sale_price numeric,
  ao_date date,
  close_date date,
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
  phase text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);`}</pre>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search deals..." style={{ flex:1, minWidth:200 }} />
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <button onClick={()=>setPhaseFilter('all')}
            style={{ padding:'5px 12px', borderRadius:99, border:'1px solid '+(phaseFilter==='all'?'var(--brand)':'var(--border)'), background:phaseFilter==='all'?'rgba(204,34,0,.08)':'transparent', color:phaseFilter==='all'?'var(--brand)':'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            All Phases
          </button>
          {PHASES.map(p => (
            <button key={p.id} onClick={()=>setPhaseFilter(p.id)}
              style={{ padding:'5px 12px', borderRadius:99, border:'1px solid '+(phaseFilter===p.id?p.color:'var(--border)'), background:phaseFilter===p.id?p.color+'18':'transparent', color:phaseFilter===p.id?p.color:'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}
          style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
          <option value="all">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* Deal list */}
      {filteredDeals.length === 0 ? (
        <Empty text={deals.length === 0 ? 'No deals yet — click + New Deal to start' : 'No deals match your filters'} />
      ) : (
        filteredDeals.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            tasks={tasksByDeal[deal.id] || []}
            agents={agents}
            expanded={!!expanded[deal.id]}
            onToggle={() => setExpanded(p => ({ ...p, [deal.id]: !p[deal.id] }))}
            onPhaseChange={changePhase}
            onCompleteTask={completeTask}
            onEditTask={t => { setSelTask(t); setTaskForm({ title:t.title, priority:t.priority, due_date:t.due_date||'', agent_id:t.agent_id||'', notes:t.notes||'', needs_calendar:t.needs_calendar||false, reminder_days:t.reminder_days||'', completion_action:t.completion_action||'none', completion_note:t.completion_note||'', completion_value:t.completion_value||'' }); setShowEdit(true) }}
            onAddTask={d => { setSelDeal(d); setShowAddTask(true) }}
            onPriceChange={d => { setSelDeal(d); setPriceForm({ list_price: d.list_price||'', sale_price: d.sale_price||'', reason:'' }); setShowPrice(true) }}
            onEditDeal={d => { setSelDeal(d); setDealForm({ addr:d.addr, side:d.side, agent_id:d.agent_id||'', tc_phase:d.tc_phase, list_price:d.list_price||'', sale_price:d.sale_price||'', ao_date:d.ao_date||'', close_date:d.close_date||'', attorney_name:d.attorney_name||'', attorney_phone:d.attorney_phone||'', attorney_email:d.attorney_email||'', mortgage_broker:d.mortgage_broker||'', mortgage_phone:d.mortgage_phone||'', inspector:d.inspector||'', inspector_phone:d.inspector_phone||'', notes:d.notes||'', contact_id:d.contact_id||null }); setShowEditDeal(true) }}
          />
        ))
      )}

      {/* ── ADD DEAL MODAL ── */}
      <Modal open={showAddDeal} onClose={()=>setShowAddDeal(false)} title="New Deal / Listing" width={600}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Property Address *</span>
            <input value={dealForm.addr} onChange={e=>setDealForm(p=>({...p,addr:e.target.value}))} placeholder="123 Main St, Monsey NY" style={S} />
          </div>
          <div>
            <span style={SL}>Side *</span>
            <select value={dealForm.side} onChange={e=>setDealForm(p=>({...p,side:e.target.value}))} style={S}>
              {['Seller','Buyer','Dual','Rental'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Assigned Agent * (required)</span>
            <select value={dealForm.agent_id} onChange={e=>setDealForm(p=>({...p,agent_id:e.target.value}))} style={{ ...S, borderColor: !dealForm.agent_id ? '#DC2626' : 'var(--border)' }}>
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
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Attorney Name</span>
            <input value={dealForm.attorney_name} onChange={e=>setDealForm(p=>({...p,attorney_name:e.target.value}))} placeholder="Attorney name" style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Phone</span>
            <input value={dealForm.attorney_phone} onChange={e=>setDealForm(p=>({...p,attorney_phone:e.target.value}))} placeholder="(845) 555-1234" style={S} />
          </div>
          <div>
            <span style={SL}>Attorney Email</span>
            <input value={dealForm.attorney_email} onChange={e=>setDealForm(p=>({...p,attorney_email:e.target.value}))} placeholder="attorney@firm.com" style={S} />
          </div>
          <div>
            <span style={SL}>Mortgage Broker</span>
            <input value={dealForm.mortgage_broker} onChange={e=>setDealForm(p=>({...p,mortgage_broker:e.target.value}))} placeholder="Broker name" style={S} />
          </div>
          <div>
            <span style={SL}>Broker Phone</span>
            <input value={dealForm.mortgage_phone} onChange={e=>setDealForm(p=>({...p,mortgage_phone:e.target.value}))} placeholder="(845) 555-1234" style={S} />
          </div>
          <div>
            <span style={SL}>Inspector</span>
            <input value={dealForm.inspector} onChange={e=>setDealForm(p=>({...p,inspector:e.target.value}))} placeholder="Inspector name" style={S} />
          </div>
          <div>
            <span style={SL}>Inspector Phone</span>
            <input value={dealForm.inspector_phone} onChange={e=>setDealForm(p=>({...p,inspector_phone:e.target.value}))} placeholder="(845) 555-1234" style={S} />
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Notes</span>
            <textarea value={dealForm.notes} onChange={e=>setDealForm(p=>({...p,notes:e.target.value}))} rows={3} style={{ ...S, resize:'vertical' }} />
          </div>
        </div>
        <div style={{ background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', borderRadius:8, padding:'8px 12px', marginTop:12, fontSize:11, color:'var(--muted)' }}>
          📋 <strong>{PHASE_TASKS[dealForm.tc_phase]?.length || 0} tasks</strong> will be auto-generated for the <strong>{PHASES.find(p=>p.id===dealForm.tc_phase)?.label}</strong> phase
          {PHASE_TASKS[dealForm.tc_phase]?.filter(t=>t.needs_calendar).length > 0 && (
            <span> · 📅 <strong>{PHASE_TASKS[dealForm.tc_phase].filter(t=>t.needs_calendar).length} calendar events</strong> will be created</span>
          )}
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowAddDeal(false)}>Cancel</Btn>
          <Btn onClick={createDeal} loading={saving}>Create Deal + Auto-Tasks</Btn>
        </ModalActions>
      </Modal>

      {/* ── ADD TASK MODAL ── */}
      <Modal open={showAddTask} onClose={()=>setShowAddTask(false)} title={'Add Task — ' + (selDeal?.addr||'')} width={460}>
        <span style={SL}>Task Title</span>
        <input value={taskForm.title} onChange={e=>setTaskForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Call mortgage broker" style={S} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
          <div>
            <span style={SL}>Priority</span>
            <select value={taskForm.priority} onChange={e=>setTaskForm(p=>({...p,priority:e.target.value}))} style={S}>
              {['urgent','high','normal','low'].map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Due Date</span>
            <input type="date" value={taskForm.due_date} onChange={e=>setTaskForm(p=>({...p,due_date:e.target.value}))} style={S} />
          </div>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Assign To</span>
            <select value={taskForm.agent_id} onChange={e=>setTaskForm(p=>({...p,agent_id:e.target.value}))} style={S}>
              <option value="">— Same as deal agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginTop:12, fontSize:13, color:'var(--text)' }}>
          <input type="checkbox" checked={taskForm.needs_calendar} onChange={e=>setTaskForm(p=>({...p,needs_calendar:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--brand)' }} />
          📅 Create calendar event for this task
        </label>
        <span style={SL}>Notes</span>
        <textarea value={taskForm.notes} onChange={e=>setTaskForm(p=>({...p,notes:e.target.value}))} rows={2} style={{ ...S, resize:'vertical' }} />
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowAddTask(false)}>Cancel</Btn>
          <Btn onClick={addTask} loading={saving}>Add Task</Btn>
        </ModalActions>
      </Modal>

      {/* ── PRICE UPDATE MODAL ── */}
      <Modal open={showPrice} onClose={()=>setShowPrice(false)} title={'Update Price — ' + (selDeal?.addr||'')} width={400}>
        <div style={{ background:'rgba(245,166,35,.08)', border:'1px solid rgba(245,166,35,.3)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'var(--text)', marginBottom:12 }}>
          ⚡ Any price change syncs to Listings board, Production board, and Contact records
        </div>
        <span style={SL}>New List Price</span>
        <input value={priceForm.list_price} onChange={e=>setPriceForm(p=>({...p,list_price:e.target.value}))} placeholder="Current: $0" style={S} />
        <span style={SL}>Sale / Accepted Price</span>
        <input value={priceForm.sale_price} onChange={e=>setPriceForm(p=>({...p,sale_price:e.target.value}))} placeholder="Accepted offer price" style={{ ...S, marginBottom:8 }} />
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowPrice(false)}>Cancel</Btn>
          <Btn onClick={updatePrice} loading={saving}>Update Price</Btn>
        </ModalActions>
      </Modal>

      {/* ── EDIT TASK MODAL ── */}
      <Modal open={showEdit} onClose={()=>setShowEdit(false)} title={'Edit Task'} width={520}>
        <span style={SL}>Task Title</span>
        <input value={taskForm.title} onChange={e=>setTaskForm(p=>({...p,title:e.target.value}))} style={S} />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
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
              <option value="">— Deal agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Remind (days before due)</span>
            <select value={taskForm.reminder_days} onChange={e=>setTaskForm(p=>({...p,reminder_days:e.target.value}))} style={S}>
              <option value="">No reminder</option>
              {['1','2','3','5','7','14'].map(d=><option key={d} value={d}>{d} day{d!=='1'?'s':''} before</option>)}
            </select>
          </div>
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', margin:'12px 0', fontSize:13, color:'var(--text)' }}>
          <input type="checkbox" checked={taskForm.needs_calendar} onChange={e=>setTaskForm(p=>({...p,needs_calendar:e.target.checked}))} style={{ width:16, height:16, accentColor:'var(--brand)' }} />
          📅 Create / update calendar event for this task
        </label>
        <span style={SL}>When completed, automatically...</span>
        <select value={taskForm.completion_action} onChange={e=>setTaskForm(p=>({...p,completion_action:e.target.value}))} style={{ ...S, marginBottom:8 }}>
          <option value="none">Nothing (just mark done)</option>
          <option value="notify_agent">📧 Email agent that this is done</option>
          <option value="create_next_task">➕ Create next task automatically</option>
          <option value="update_stage">🔄 Sync status to all boards</option>
        </select>
        {taskForm.completion_action === 'create_next_task' && (
          <div>
            <span style={SL}>Next task to create when this is done</span>
            <input value={taskForm.completion_note} onChange={e=>setTaskForm(p=>({...p,completion_note:e.target.value}))} placeholder="e.g. Follow up on inspection results" style={S} />
          </div>
        )}
        {taskForm.completion_action === 'notify_agent' && (
          <div>
            <span style={SL}>Message to include in notification (optional)</span>
            <textarea value={taskForm.completion_note} onChange={e=>setTaskForm(p=>({...p,completion_note:e.target.value}))} rows={2} placeholder="e.g. Please review the inspection report" style={{ ...S, resize:'vertical' }} />
          </div>
        )}
        <span style={SL}>Task Notes</span>
        <textarea value={taskForm.notes} onChange={e=>setTaskForm(p=>({...p,notes:e.target.value}))} rows={2} style={{ ...S, resize:'vertical' }} />
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowEdit(false)}>Cancel</Btn>
          <Btn onClick={saveEditTask} loading={saving}>Save Changes</Btn>
        </ModalActions>
      </Modal>

      {/* ── EDIT DEAL MODAL ── */}
      <Modal open={showEditDeal} onClose={()=>setShowEditDeal(false)} title={'Edit Deal — ' + (selDeal?.addr||'')} width={600}>
        <div style={{ background:'rgba(59,130,246,.06)', border:'1px solid rgba(59,130,246,.2)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'var(--text)', marginBottom:12 }}>
          ⚡ All changes sync automatically to Listings, Production, and Contact boards
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'span 2' }}>
            <span style={SL}>Property Address</span>
            <input value={dealForm.addr} onChange={e=>setDealForm(p=>({...p,addr:e.target.value}))} style={S} />
          </div>
          <div>
            <span style={SL}>Side</span>
            <select value={dealForm.side} onChange={e=>setDealForm(p=>({...p,side:e.target.value}))} style={S}>
              {['Seller','Buyer','Dual','Rental'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>Assigned Agent</span>
            <select value={dealForm.agent_id} onChange={e=>setDealForm(p=>({...p,agent_id:e.target.value}))} style={S}>
              <option value="">— Select Agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span style={SL}>List Price</span>
            <input value={dealForm.list_price} onChange={e=>setDealForm(p=>({...p,list_price:e.target.value}))} placeholder="$0" style={S} />
          </div>
          <div>
            <span style={SL}>Sale / Accepted Price</span>
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
            <textarea value={dealForm.notes} onChange={e=>setDealForm(p=>({...p,notes:e.target.value}))} rows={3} style={{ ...S, resize:'vertical' }} />
          </div>
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={()=>setShowEditDeal(false)}>Cancel</Btn>
          <Btn onClick={saveDealEdit} loading={saving}>Save + Sync All Boards</Btn>
        </ModalActions>
      </Modal>
    </div>
  )
}
