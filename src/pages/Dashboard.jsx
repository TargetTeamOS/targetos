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

// ═══════════════════════════════════════════════════════════════
// CUSTOM WIDGET BUILDER
// Admin can create a widget showing any board: Contacts, Deals,
// Tasks, Listings, etc. with a status/field filter and a chosen
// display mode (count, list, or table).
// ═══════════════════════════════════════════════════════════════



const DISPLAY_MODES = [
  { id:'count', label:'Count only',   icon:'🔢', desc:'Big number — how many items match' },
  { id:'list',  label:'Item list',    icon:'📋', desc:'Scrollable list of names' },
  { id:'table', label:'Mini table',   icon:'📊', desc:'Compact table with columns' },
  { id:'donut', label:'Status donut', icon:'🍩', desc:'Pie chart by status' },
]

const DATE_RANGES_BASE = [
  { id:'all',     label:'All time' },
  { id:'today',   label:'Today' },
  { id:'week',    label:'This week' },
  { id:'month',   label:'This month' },
  { id:'quarter', label:'This quarter' },
  { id:'year',    label:'This year' },
]

// Dynamically built — populated at app load from actual DB data
let DATE_RANGES = [...DATE_RANGES_BASE]

// Call once on app init — detects all years present in deals + contacts
async function loadAvailableYears(supabaseClient) {
  try {
    // Pull earliest and latest deal year
    const { data: dealYears } = await supabaseClient
      .from('deals')
      .select('ao_date, close_date, created_at')
      .not('ao_date', 'is', null)
      .order('ao_date', { ascending: true })
      .limit(1)
    const { data: dealYearsMax } = await supabaseClient
      .from('deals')
      .select('ao_date, close_date, created_at')
      .not('ao_date', 'is', null)
      .order('ao_date', { ascending: false })
      .limit(1)

    const minYear = dealYears?.[0]?.ao_date
      ? parseInt(dealYears[0].ao_date.slice(0,4))
      : new Date().getFullYear()
    const maxYear = dealYearsMax?.[0]?.ao_date
      ? parseInt(dealYearsMax[0].ao_date.slice(0,4))
      : new Date().getFullYear()
    const currentYear = new Date().getFullYear()
    const finalMax = Math.max(maxYear, currentYear)

    const years = []
    for (let y = finalMax; y >= Math.min(minYear, finalMax - 1); y--) {
      years.push({ id: String(y), label: String(y) })
    }
    DATE_RANGES = [...DATE_RANGES_BASE, ...years]
    return years
  } catch(e) {
    console.warn('loadAvailableYears:', e.message)
    // Fallback: last 5 years
    const cur = new Date().getFullYear()
    DATE_RANGES = [...DATE_RANGES_BASE, ...Array.from({length:5},(_,i)=>({ id:String(cur-i), label:String(cur-i) }))]
    return []
  }
}

function getDateRange(rangeId) {
  const now = new Date()
  const today = now.toISOString().slice(0,10)
  if (rangeId === 'today')   return { from: today, to: today }
  if (rangeId === 'week')    { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d.toISOString().slice(0,10), to: today } }
  if (rangeId === 'month')   { const d = new Date(now); d.setMonth(d.getMonth() - 1); return { from: d.toISOString().slice(0,10), to: today } }
  if (rangeId === 'quarter') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return { from: d.toISOString().slice(0,10), to: today } }
  if (rangeId === 'year')    return { from: now.getFullYear() + '-01-01', to: today }
  if (/^\d{4}$/.test(rangeId)) return { from: rangeId + '-01-01', to: rangeId + '-12-31' }
  // Custom range: "custom:YYYY-MM-DD:YYYY-MM-DD"
  if (typeof rangeId === 'string' && rangeId.startsWith('custom:')) {
    const [, from, to] = rangeId.split(':')
    if (from && to) return { from, to }
  }
  return null
}

// ── CUSTOM WIDGET BUILDER ────────────────────────────────────────
function CustomWidgetBuilder({ onSave, onClose, agents }) {
  // ── ALL STATE AT TOP — never inside conditionals ──────────────
  const [step,        setStep]       = useState(1)
  const [availYears,  setAvailYears] = useState(DATE_RANGES)
  const [board,       setBoard]      = useState(null)
  const [chartType,   setChartType]  = useState('donut')
  const [groupBy,     setGroupBy]    = useState('')
  const [statuses,    setStatuses]   = useState([])
  const [display,     setDisplay]    = useState('donut')
  const [label,       setLabel]      = useState('')
  const [color,       setColor]      = useState('#3B82F6')
  const [dateRange,   setDateRange]  = useState('all')
  const [agentScope,  setAgentScope] = useState('mine')
  const [columns,     setColumns]    = useState([])
  const [sortBy,      setSortBy]     = useState('created_at')
  const [limitRows,   setLimitRows]  = useState(10)
  const [numericField,setNumericField]=useState('')
  const [liveCount,   setLiveCount]  = useState(null)
  const [loadingCnt,  setLoadingCnt] = useState(false)
  const [showCols,    setShowCols]   = useState(false)

  const STEPS = ['Board', 'Chart', 'Filters', 'Display']

  React.useEffect(() => {
    loadAvailableYears(supabase).then(() => setAvailYears([...DATE_RANGES])).catch(() => setAvailYears([...DATE_RANGES]))
  }, [])

  const boardDef = BOARD_OPTIONS.find(b => b.id === board)

  React.useEffect(function() {
    if (!board || !boardDef) return
    let cancelled = false
    async function countIt() {
      setLoadingCnt(true)
      try {
        let q = supabase.from(boardDef.table).select('id', { count: 'exact', head: true })
        if (statuses.length && boardDef.statusField) q = q.in(boardDef.statusField, statuses)
        const dr = getDateRange(dateRange)
        if (dr && boardDef.dateField) q = q.gte(boardDef.dateField, dr.from).lte(boardDef.dateField, dr.to + 'T23:59:59')
        const { count } = await q
        if (!cancelled) setLiveCount(count || 0)
      } catch { if (!cancelled) setLiveCount(null) }
      finally { if (!cancelled) setLoadingCnt(false) }
    }
    countIt()
    return () => { cancelled = true }
  }, [board, statuses.join(','), dateRange, agentScope])

  React.useEffect(function() {
    if (!boardDef) return
    setGroupBy(boardDef.statusField || '')
    setNumericField(boardDef.numericFields && boardDef.numericFields[0] ? boardDef.numericFields[0].field : '')
    setColumns(boardDef.displayCols.slice(0, 4).map(function(c){ return c.field }))
    setSortBy(boardDef.sortOptions && boardDef.sortOptions[0] ? boardDef.sortOptions[0].field : 'created_at')
    if (!label) setLabel(boardDef.label)
  }, [board])

  const CHART_TYPES = [
    { id:'donut',   label:'Donut',   icon:'🍩', desc:'Group by status' },
    { id:'bar',     label:'Bar',     icon:'📊', desc:'Compare groups' },
    { id:'number',  label:'Number',  icon:'🔢', desc:'Single KPI' },
    { id:'battery', label:'Battery', icon:'🔋', desc:'Progress to goal' },
    { id:'list',    label:'List',    icon:'📋', desc:'Record list' },
    { id:'table',   label:'Table',   icon:'⬜', desc:'Multi-column' },
    { id:'column',  label:'Column',  icon:'📉', desc:'Over time' },
    { id:'line',    label:'Line',    icon:'📈', desc:'Trend line' },
  ]
  const COLOR_OPTS = ['#3B82F6','#10B981','#CC2200','#F5A623','#8B5CF6','#EC4899','#14B8A6','#84CC16','#1B2B4B','#F97316']

  function toggleStatus(s) { setStatuses(function(p){ return p.includes(s) ? p.filter(function(x){return x!==s}) : [...p, s] }) }
  function toggleCol(f)    { setColumns(function(p){ return p.includes(f) ? p.filter(function(x){return x!==f}) : [...p, f] }) }

  function save() {
    if (!board) return
    const displayMode = ['list','table'].includes(chartType) ? chartType : chartType === 'number' || chartType === 'battery' ? 'count' : 'donut'
    const cfg = {
      id: 'custom_' + Date.now(),
      visible: true, size: 'md', color,
      customConfig: {
        board, label: label || boardDef.label, icon: boardDef.icon || '🔲',
        chartType, display: displayMode,
        groupBy: groupBy || boardDef.statusField,
        statuses, dateRange, agentScope,
        sortBy, limitRows,
        columns: columns.length ? columns : boardDef.displayCols.slice(0,4).map(function(c){return c.field}),
        numericField,
      }
    }
    onSave(cfg)
  }

  const S = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const SL = { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5, marginTop:12, display:'block' }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div onClick={function(e){e.stopPropagation()}}
        style={{ background:'var(--panel)', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,.3)', overflow:'hidden' }}>

        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>Add Widget</div>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              {STEPS.map(function(s,i) {
                return (
                  <button key={s} onClick={function(){if(i<step-1)setStep(i+1)}}
                    style={{ padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:700, cursor:i<step-1?'pointer':'default', fontFamily:ff,
                      background: step===i+1 ? 'var(--brand)' : i<step-1 ? 'var(--dim)' : 'transparent',
                      color: step===i+1 ? '#fff' : i<step-1 ? 'var(--text)' : 'var(--muted)',
                      border: '1px solid ' + (step===i+1 ? 'var(--brand)' : 'var(--border)') }}>
                    {i+1}. {s}
                  </button>
                )
              })}
            </div>
          </div>
          {liveCount !== null && (
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:28, fontWeight:900, color:color }}>{loadingCnt ? '...' : liveCount}</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>matching records</div>
            </div>
          )}
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

          {step === 1 && (
            <div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>What data should this widget show?</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                {BOARD_OPTIONS.map(function(b) {
                  return (
                    <div key={b.id} onClick={function(){setBoard(b.id);setStep(2)}}
                      style={{ padding:'12px 14px', borderRadius:10, border:'2px solid '+(board===b.id?'var(--brand)':'var(--border)'),
                        background: board===b.id ? 'rgba(204,34,0,.06)' : 'var(--dim)', cursor:'pointer', transition:'all .12s' }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{b.icon}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{b.label}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{b.displayCols.length} fields</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step === 2 && boardDef && (
            <div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>Choose visualization type</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
                {CHART_TYPES.map(function(ct) {
                  return (
                    <div key={ct.id} onClick={function(){setChartType(ct.id);setDisplay(ct.id==='list'?'list':ct.id==='table'?'table':ct.id==='number'?'count':'donut')}}
                      style={{ padding:'10px 8px', borderRadius:10, border:'2px solid '+(chartType===ct.id?'var(--brand)':'var(--border)'),
                        background: chartType===ct.id ? 'rgba(204,34,0,.06)' : 'var(--dim)', cursor:'pointer', textAlign:'center', transition:'all .12s' }}>
                      <div style={{ fontSize:22, marginBottom:4 }}>{ct.icon}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{ct.label}</div>
                      <div style={{ fontSize:9, color:'var(--muted)', marginTop:2, lineHeight:1.3 }}>{ct.desc}</div>
                    </div>
                  )
                })}
              </div>
              {['donut','bar','column','line'].includes(chartType) && boardDef.chartFields && boardDef.chartFields.length > 0 && (
                <div>
                  <span style={SL}>Group / Segment by</span>
                  <select value={groupBy} onChange={function(e){setGroupBy(e.target.value)}} style={S}>
                    {boardDef.chartFields.map(function(f){ return <option key={f.field} value={f.field}>{f.label}</option> })}
                  </select>
                </div>
              )}
              {['number','battery','bar','column','line'].includes(chartType) && boardDef.numericFields && boardDef.numericFields.length > 0 && (
                <div>
                  <span style={SL}>Value to measure</span>
                  <select value={numericField} onChange={function(e){setNumericField(e.target.value)}} style={S}>
                    <option value="">Count of records</option>
                    {boardDef.numericFields.map(function(f){ return <option key={f.field} value={f.field}>{f.label}</option> })}
                  </select>
                </div>
              )}
            </div>
          )}

          {step === 3 && boardDef && (
            <div>
              <span style={SL}>Widget label</span>
              <input value={label} onChange={function(e){setLabel(e.target.value)}} placeholder={boardDef.label} style={S} />

              <span style={SL}>Show data for</span>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {[{id:'all',label:'All agents'},{id:'mine',label:'My records'},...agents.filter(function(a){return a.active}).map(function(a){return{id:a.id,label:a.name.split(' ')[0],color:a.color}})].map(function(opt) {
                  const active = agentScope === opt.id
                  const c = opt.color || 'var(--brand)'
                  return (
                    <button key={opt.id} onClick={function(){setAgentScope(opt.id)}}
                      style={{ padding:'5px 12px', borderRadius:99, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff,
                        border:'1px solid '+(active?c:'var(--border)'), background:active?c+'18':'transparent', color:active?c:'var(--muted)' }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              <span style={SL}>Date range</span>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                {availYears.map(function(dr) {
                  return (
                    <button key={dr.id} onClick={function(){setDateRange(dr.id)}}
                      style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff,
                        border:'1px solid '+(dateRange===dr.id?'var(--brand)':'var(--border)'), background:dateRange===dr.id?'rgba(204,34,0,.08)':'transparent', color:dateRange===dr.id?'var(--brand)':'var(--muted)' }}>
                      {dr.label}
                    </button>
                  )
                })}
                <button onClick={function(){ if(!String(dateRange).startsWith('custom:')) setDateRange('custom::') }}
                  style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff,
                    border:'1px solid '+(String(dateRange).startsWith('custom:')?'var(--brand)':'var(--border)'), background:String(dateRange).startsWith('custom:')?'rgba(204,34,0,.08)':'transparent', color:String(dateRange).startsWith('custom:')?'var(--brand)':'var(--muted)' }}>
                  Custom…
                </button>
              </div>
              {String(dateRange).startsWith('custom:') && (
                <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
                  <input type="date" value={dateRange.split(':')[1]||''}
                    onChange={e=>{ const p=dateRange.split(':'); setDateRange('custom:'+e.target.value+':'+(p[2]||'')) }}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:12, background:'var(--panel)', color:'var(--text)', fontFamily:ff }} />
                  <span style={{ fontSize:12, color:'var(--muted)' }}>to</span>
                  <input type="date" value={dateRange.split(':')[2]||''}
                    onChange={e=>{ const p=dateRange.split(':'); setDateRange('custom:'+(p[1]||'')+':'+e.target.value) }}
                    style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:12, background:'var(--panel)', color:'var(--text)', fontFamily:ff }} />
                </div>
              )}
                <div>
                  <span style={SL}>Filter by stage/status (empty = all)</span>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {boardDef.statusOptions.map(function(s) {
                      return (
                        <button key={s} onClick={function(){toggleStatus(s)}}
                          style={{ padding:'4px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff,
                            border:'1px solid '+(statuses.includes(s)?'var(--brand)':'var(--border)'), background:statuses.includes(s)?'rgba(204,34,0,.08)':'transparent', color:statuses.includes(s)?'var(--brand)':'var(--muted)' }}>
                          {s}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && boardDef && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <span style={SL}>Sort by</span>
                  <select value={sortBy} onChange={function(e){setSortBy(e.target.value)}} style={S}>
                    {boardDef.sortOptions.map(function(s){ return <option key={s.field} value={s.field}>{s.label}</option> })}
                  </select>
                </div>
                <div>
                  <span style={SL}>Max rows</span>
                  <select value={limitRows} onChange={function(e){setLimitRows(Number(e.target.value))}} style={S}>
                    {[5,10,15,20,25,50].map(function(n){ return <option key={n} value={n}>{n} rows</option> })}
                  </select>
                </div>
              </div>

              <span style={SL}>Widget accent color</span>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {COLOR_OPTS.map(function(c) {
                  return (
                    <div key={c} onClick={function(){setColor(c)}}
                      style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer',
                        border: color===c ? '3px solid var(--text)' : '2px solid transparent', transition:'border .1s' }} />
                  )
                })}
              </div>

              {['list','table'].includes(chartType) && (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4, marginBottom:8 }}>
                    <span style={{...SL, marginTop:0, marginBottom:0}}>Choose columns to show</span>
                    <button onClick={function(){setShowCols(function(p){return !p})}}
                      style={{ fontSize:11, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontFamily:ff, fontWeight:700 }}>
                      {showCols ? 'Hide' : 'Edit (' + columns.length + ' selected)'}
                    </button>
                  </div>
                  {showCols && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, padding:10, background:'var(--dim)', borderRadius:8 }}>
                      {boardDef.displayCols.map(function(col) {
                        return (
                          <label key={col.field} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'3px 6px', borderRadius:6, fontSize:12, color:'var(--text)' }}>
                            <input type="checkbox" checked={columns.includes(col.field)} onChange={function(){toggleCol(col.field)}}
                              style={{ width:14, height:14, accentColor:'var(--brand)', cursor:'pointer' }} />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={step>1?function(){setStep(function(p){return p-1})}:onClose}
            style={{ padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
            {step>1 ? '← Back' : 'Cancel'}
          </button>
          <div style={{ display:'flex', gap:8 }}>
            {step < 4 ? (
              <button onClick={function(){if(step===1&&!board)return;setStep(function(p){return p+1})}}
                disabled={step===1&&!board}
                style={{ padding:'8px 20px', borderRadius:8, border:'none', background:step===1&&!board?'var(--dim)':'var(--brand)', color:'#fff', fontSize:13, fontWeight:700, cursor:step===1&&!board?'not-allowed':'pointer', fontFamily:ff }}>
                Next →
              </button>
            ) : (
              <button onClick={save}
                style={{ padding:'8px 24px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                ✓ Add Widget
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


function CustomWidgetContent({ config, agentId, allAgents }) {
  const navigate = useNavigate()
  const [items,       setItems]       = useState([])
  const [count,       setCount]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [activeSlice, setActiveSlice] = useState(null)
  const [drillItems,  setDrillItems]  = useState(null)

  useEffect(function() {
    if (!config?.board) return
    const boardDef = BOARD_OPTIONS.find(function(b){ return b.id === config.board })
    if (!boardDef) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        let q = supabase.from(boardDef.table).select('*').limit(config.limitRows || 10)

        // Scope
        const scope = config.agentScope || 'mine'
        if (scope === 'mine' && agentId) q = q.eq('agent_id', agentId)
        else if (scope !== 'all' && scope !== 'mine') q = q.eq('agent_id', scope)

        // Status filter
        if (config.statuses?.length && boardDef.statusField) {
          q = q.in(boardDef.statusField, config.statuses)
        }

        // Date range — use the correct date field per board type
        const dr = getDateRange(config.dateRange || 'all')
        if (dr) {
          const dateField = {
            deals: 'ao_date',
            calls: 'called_at',
            offers: 'offer_date',
            open_houses: 'date',
          }[config.board] || 'created_at'
          q = q.gte(dateField, dr.from).lte(dateField, dr.to + 'T23:59:59')
        }

        // Sort
        const sortField = config.sortBy || 'created_at'
        q = q.order(sortField, { ascending: false, nullsFirst: false })

        const { data, error } = await q
        if (!cancelled) {
          setItems(data || [])
          setCount(data?.length || 0)
        }
      } catch(e) {
        if (!cancelled) { setItems([]); setCount(0) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    setActiveSlice(null)
    setDrillItems(null)
    return function() { cancelled = true }
  }, [config?.board, JSON.stringify(config?.statuses), config?.dateRange, config?.agentScope, config?.sortBy, config?.limitRows, agentId])

  const boardDef = BOARD_OPTIONS.find(function(b){ return b.id === config?.board })
  if (!boardDef) return <div style={{ color:'var(--muted)', fontSize:12 }}>Board not configured</div>
  if (loading)   return <div style={{ color:'var(--muted)', fontSize:12, padding:'12px 0', textAlign:'center' }}>Loading...</div>

  const route = {
    contacts:'contacts', deals:'production', tasks:'tasks',
    listings:'listings', calls:'calls', gifts:'gifts', offers:'offers',
    open_houses:'open-house',
  }[config.board] || config.board

  // ── COUNT MODE — click to drill down into records ──
  if (config.display === 'count') {
    return (
      <div>
        <div style={{ textAlign:'center', padding:'8px 0 4px', cursor:'pointer' }}
          onClick={function(){ setActiveSlice(activeSlice ? null : 'all'); setDrillItems(activeSlice ? null : items) }}>
          <div style={{ fontSize:52, fontWeight:900, color:'var(--text)', lineHeight:1 }}>{count}</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>
            {config.statuses?.length ? config.statuses.join(', ') : 'Total'} {boardDef.label}
          </div>
          {config.dateRange && config.dateRange !== 'all' && (
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>({config.dateRange})</div>
          )}
          <div style={{ fontSize:10, color:'var(--brand)', marginTop:6, fontWeight:700 }}>
            {activeSlice ? '▲ Hide details' : '▼ Click to see records'}
          </div>
        </div>
        {activeSlice && drillItems && (
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4 }}>
            {drillItems.slice(0,6).map(function(item, i) {
              const name = boardDef.nameField === 'first_name'
                ? ((item.first_name||'')+' '+(item.last_name||'')).trim()
                : (item[boardDef.nameField]||'—')
              const val = boardDef.valueField && item[boardDef.valueField] ? fmt$(item[boardDef.valueField]) : ''
              const sub = boardDef.subField ? (item[boardDef.subField]||'') : ''
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                  onClick={function(){ navigate('/'+route) }}>
                  <span style={{ fontSize:12 }}>{boardDef.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                    {sub && <div style={{ fontSize:10, color:'var(--muted)' }}>{sub}</div>}
                  </div>
                  {val && <div style={{ fontSize:11, fontWeight:700, color:'#10B981' }}>{val}</div>}
                </div>
              )
            })}
            {drillItems.length > 6 && (
              <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', paddingTop:4 }}>
                +{drillItems.length - 6} more
              </div>
            )}
            <button onClick={function(){ navigate('/'+route) }}
              style={{ width:'100%', marginTop:8, padding:'6px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--brand)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              View all in {boardDef.label} →
            </button>
          </div>
        )}
      </div>
    )
  }
