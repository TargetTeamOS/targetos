// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Agent Performance Dashboard
// Calculates each agent's production from the deals table.
// Shows GCI, volume, deal count, avg deal size, close rate,
// trends by month, and per-agent breakdowns.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate } from '../lib/utils'
import { Loading, Avatar } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const YEARS = []
for (let y = new Date().getFullYear(); y >= 2020; y--) YEARS.push(y.toString())

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── MINI BAR ─────────────────────────────────────────────────────
function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 2, transition: 'width .5s' }} />
    </div>
  )
}

// ── STAT CARD ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 10, border: '1px solid var(--border)', padding: '14px 16px', borderLeft: "3px solid " + (color) }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── MONTHLY CHART ─────────────────────────────────────────────────
function MonthlyChart({ data, color, label }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
        {data.map((d, i) => {
          const pct = max > 0 ? (d.value / max) * 100 : 0
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div
                title={MONTHS[i] + ': ' + fmt$(d.value)}
                style={{ width: '100%', background: d.value > 0 ? color : 'var(--border)', borderRadius: '3px 3px 0 0', height: Math.max(2, (pct / 100) * 52) + 'px', transition: 'height .4s', cursor: 'default' }}
              />
              <span style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>{MONTHS[i].slice(0, 1)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── AGENT CARD ─────────────────────────────────────────────────────
function AgentCard({ agent, stats, rank, maxGCI, year }) {
  const [expanded, setExpanded] = useState(false)
  const closedDeals   = stats.deals.filter(d => d.stage === 'Closed')
  const activeDeals   = stats.deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
  const fellThrough   = stats.deals.filter(d => d.stage === 'Deal Fell Through')
  const avgGCI        = closedDeals.length ? stats.gci / closedDeals.length : 0
  const closeRate     = stats.deals.length ? Math.round((closedDeals.length / stats.deals.length) * 100) : 0

  // Monthly breakdown
  const monthlyGCI = Array.from({ length: 12 }, (_, m) => ({
    value: closedDeals
      .filter(d => {
        const date = d.close_date || d.ao_date
        return date && new Date(date).getMonth() === m && new Date(date).getFullYear() === parseInt(year)
      })
      .reduce((s, d) => s + (parseFloat(d.gci) || 0), 0)
  }))

  const RANK_COLORS = ['#F5A623', '#94A3B8', '#CD7F32', '#CC2200', '#10B981']
  const rankColor = RANK_COLORS[Math.min(rank - 1, 4)]

  return (
    <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 10 }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        {/* Rank */}
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: rankColor + '22', border: "2px solid " + (rankColor), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: rankColor, flexShrink: 0 }}>
          {rank}
        </div>

        {/* Agent avatar */}
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: agent.color || '#CC2200', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
          {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>

        {/* Name & title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {closedDeals.length} closed · {activeDeals.length} active · {fellThrough.length} fell
          </div>
        </div>

        {/* GCI bar */}
        <div style={{ width: 120, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#10B981' }}>{fmt$(stats.gci)}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>GCI</span>
          </div>
          <MiniBar value={stats.gci} max={maxGCI} color={agent.color || '#10B981'} />
        </div>

        {/* Volume */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmt$(stats.production)}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Volume</div>
        </div>

        {/* Close rate */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: closeRate >= 70 ? '#10B981' : closeRate >= 40 ? '#F5A623' : '#DC2626' }}>
            {closeRate}%
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Close rate</div>
        </div>

        <span style={{ fontSize: 12, color: 'var(--muted)', transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s', display: 'inline-block' }}>▾</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16, marginTop: 14 }}>
            <StatCard label="Total GCI"     value={fmt$(stats.gci)}           color="#10B981" icon="💰" />
            <StatCard label="Volume"        value={fmt$(stats.production)}     color="#3B82F6" icon="📊" />
            <StatCard label="Avg GCI/Deal"  value={fmt$(avgGCI)}               color="#F5A623" icon="📈" sub={(closedDeals.length) + " closed deals"} />
            <StatCard label="Pipeline"      value={fmt$(stats.pipelineGCI)}    color="#8B5CF6" icon="⏳" sub={(activeDeals.length) + " active deals"} />
          </div>

          <MonthlyChart data={monthlyGCI} color={agent.color || '#10B981'} label={"Monthly GCI — " + (year)} />

          {/* Recent deals */}
          {closedDeals.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Recent Closed Deals</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {closedDeals.slice(0, 6).map(d => (
                  <div key={d.id} style={{ padding: '6px 10px', background: 'var(--dim)', borderRadius: 7, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{d.addr}</div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#10B981', flexShrink: 0, marginLeft: 8 }}>{fmt$(d.gci)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}



// ── GOAL PROGRESS BAR ────────────────────────────────────────────
function GoalBar({ value, goal, color, label, fmt }) {
  const pct  = goal > 0 ? Math.min(100, (value / goal) * 100) : 0
  const over = goal > 0 && value >= goal
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:800, color: over ? '#10B981' : 'var(--text)' }}>
          {fmt ? fmt(value) : value}
          <span style={{ color:'var(--muted)', fontWeight:400 }}> / {fmt ? fmt(goal) : goal}</span>
          {over && <span style={{ color:'#10B981', marginLeft:5 }}>✓</span>}
        </span>
      </div>
      <div style={{ height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
        <div style={{ width: pct + '%', height:'100%', background: over ? '#10B981' : color, borderRadius:4, transition:'width .5s' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:2 }}>
        <span style={{ fontSize:10, color: over ? '#10B981' : 'var(--muted)', fontWeight: over ? 700 : 400 }}>
          {pct.toFixed(0)}%{over ? ' — Goal reached! 🎉' : ''}
        </span>
      </div>
    </div>
  )
}

// ── GOALS TAB ────────────────────────────────────────────────────
function GoalsTab({ agents, year, goals, setGoals, agentStats, contacts, savingGoal, setSavingGoal, toast, isAdmin, canManage, me }) {
  const canEdit  = isAdmin || canManage
  const [editing, setEditing] = useState(null)  // agentId being edited
  const [form,    setForm]    = useState({ deals:0, gci:0, production:0, leads:0 })

  function openEdit(agentId) {
    const existing = goals[agentId + '_' + year] || {}
    setForm({
      deals:      existing.deals      || 0,
      gci:        existing.gci        || 0,
      production: existing.production || 0,
      leads:      existing.leads      || 0,
    })
    setEditing(agentId)
  }

  async function saveGoal(agentId) {
    setSavingGoal(agentId)
    try {
      const row = {
        agent_id:   agentId,
        year:       parseInt(year),
        deals:      parseInt(form.deals)      || 0,
        gci:        parseFloat(form.gci)      || 0,
        production: parseFloat(form.production)|| 0,
        leads:      parseInt(form.leads)      || 0,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('agent_goals').upsert(row, { onConflict: 'agent_id,year' })
      if (error) {
        // Table doesn't exist yet — show SQL
        toast('Create the agent_goals table first — see instructions below', '#F5A623')
      } else {
        setGoals(prev => ({ ...prev, [agentId + '_' + year]: row }))
        setEditing(null)
        toast('\u2705 Goal saved for ' + (agents.find(a=>a.id===agentId)?.name||'agent'))
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSavingGoal(null) }
  }

  // Show only agents with deals OR all agents if admin
  const displayAgents = canEdit ? agents : agents.filter(a => a.id === me?.id)

  return (
    <div>
      {/* SQL setup notice */}
      <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:'12px 16px', marginBottom:20, fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
        <strong style={{ color:'var(--text)' }}>One-time Supabase setup:</strong><br/>
        <code style={{ fontFamily:'monospace', color:'#CC2200', fontSize:11, wordBreak:'break-all' }}>
          create table if not exists agent_goals (id uuid default gen_random_uuid() primary key, agent_id uuid references agents(id) on delete cascade, year int not null, deals int default 0, gci numeric default 0, production numeric default 0, leads int default 0, updated_at timestamptz default now(), unique(agent_id, year)); alter table agent_goals enable row level security; create policy "Allow all" on agent_goals for all using (true);
        </code>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {displayAgents.map(ag => {
          const key     = ag.id + '_' + year
          const goal    = goals[key] || {}
          const stats   = agentStats.find(s => s.agent.id === ag.id) || { gci:0, production:0, deals:[] }
          const closed  = (stats.deals || []).filter(d => d.stage === 'Closed')
          const leadCount = contacts[ag.id] || 0
          const isEditing = editing === ag.id
          const hasGoal = goal.gci > 0 || goal.deals > 0 || goal.production > 0 || goal.leads > 0

          return (
            <div key={ag.id} style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
              {/* Agent header */}
              <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:ag.color||'#CC2200',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                  {(ag.name||'').split(' ').map(n=>n[0]).join('').slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{ag.name}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:1 }}>{ag.role || 'Agent'} · {year} Goals</div>
                </div>
                {/* Quick stats */}
                <div style={{ display:'flex', gap:16, flexShrink:0, flexWrap:'wrap' }}>
                  {[
                    { label:'Deals',      value: closed.length,    goal: goal.deals,      color:'#3B82F6' },
                    { label:'GCI',        value: fmt$(stats.gci),  goal: goal.gci,        color:'#10B981', isMoney:true },
                    { label:'Volume',     value: fmt$(stats.production), goal: goal.production, color:'#8B5CF6', isMoney:true },
                    { label:'Leads',      value: leadCount,        goal: goal.leads,      color:'#F5A623' },
                  ].map(s => {
                    const pct   = s.goal > 0 ? Math.min(100, (typeof s.value === 'string'
                      ? (parseFloat(String(s.value).replace(/[^0-9.]/g,''))||0)
                      : s.value) / s.goal * 100) : null
                    const over  = pct !== null && pct >= 100
                    return (
                      <div key={s.label} style={{ textAlign:'center', minWidth:52 }}>
                        <div style={{ fontSize:15, fontWeight:900, color: over?'#10B981':'var(--text)' }}>
                          {typeof s.value === 'number' ? s.value : s.value}
                        </div>
                        <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{s.label}</div>
                        {s.goal > 0 && (
                          <div style={{ fontSize:9, color: over?'#10B981':'var(--muted)', fontWeight:over?700:400 }}>
                            {pct !== null ? pct.toFixed(0) + '%' : ''}
                            {over ? ' ✓' : ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {canEdit && (
                  <button onClick={() => isEditing ? setEditing(null) : openEdit(ag.id)}
                    style={{ padding:'7px 14px', borderRadius:8, border:'1px solid '+(isEditing?'#CC2200':'var(--border)'), background:isEditing?'rgba(204,34,0,.1)':'var(--dim)', color:isEditing?'#CC2200':'var(--muted)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', flexShrink:0 }}>
                    {isEditing ? 'Cancel' : hasGoal ? '✏️ Edit' : '+ Set Goals'}
                  </button>
                )}
              </div>

              {/* Goal editor */}
              {isEditing && (
                <div style={{ padding:'14px 18px', borderTop:'1px solid var(--border)', background:'var(--dim)' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:12 }}>
                    Set {year} Goals for {ag.name}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:14 }}>
                    {[
                      { k:'deals',      label:'Deals Closed',     placeholder:'20',         prefix:'' },
                      { k:'gci',        label:'GCI Goal ($)',      placeholder:'200000',      prefix:'$' },
                      { k:'production', label:'Production Vol. ($)',placeholder:'5000000',    prefix:'$' },
                      { k:'leads',      label:'Total Leads (contacts)',placeholder:'100',    prefix:'' },
                    ].map(f => (
                      <div key={f.k}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{f.label}</div>
                        <div style={{ position:'relative' }}>
                          {f.prefix && <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'var(--muted)' }}>{f.prefix}</span>}
                          <input type="number" min="0" value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}
                            placeholder={f.placeholder}
                            style={{ width:'100%', padding:'8px 10px', paddingLeft: f.prefix?'22px':'10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:'Inter,system-ui,sans-serif', boxSizing:'border-box' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => saveGoal(ag.id)} disabled={savingGoal===ag.id}
                    style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'#CC2200', color:'#fff', fontSize:13, fontWeight:700, cursor:savingGoal===ag.id?'default':'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:savingGoal===ag.id?.7:1 }}>
                    {savingGoal === ag.id ? 'Saving...' : '💾 Save Goals'}
                  </button>
                </div>
              )}

              {/* Progress bars */}
              {!isEditing && hasGoal && (
                <div style={{ padding:'14px 18px', borderTop:'1px solid var(--border)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'0 32px' }}>
                    {goal.deals > 0 && (
                      <GoalBar value={closed.length} goal={goal.deals} color='#3B82F6' label='Deals Closed' />
                    )}
                    {goal.gci > 0 && (
                      <GoalBar value={stats.gci} goal={goal.gci} color='#10B981' label='GCI' fmt={fmt$} />
                    )}
                    {goal.production > 0 && (
                      <GoalBar value={stats.production} goal={goal.production} color='#8B5CF6' label='Production Volume' fmt={fmt$} />
                    )}
                    {goal.leads > 0 && (
                      <GoalBar value={leadCount} goal={goal.leads} color='#F5A623' label='Leads in CRM' />
                    )}
                  </div>
                </div>
              )}

              {/* No goal set yet */}
              {!isEditing && !hasGoal && canEdit && (
                <div style={{ padding:'10px 18px', borderTop:'1px solid var(--border)', fontSize:12, color:'var(--muted)', fontStyle:'italic' }}>
                  No goals set for {year} yet. Click "+ Set Goals" to add targets.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════
export function AgentPerformance() {
  const { agent: me, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const [deals,     setDeals]     = useState([])
  const [agents,    setAgents]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [year,      setYear]      = useState(new Date().getFullYear().toString())
  const [activeTab, setActiveTab] = useState('leaderboard')
  const [goals,     setGoals]     = useState({})       // agentId_year -> { deals, gci, production, leads }
  const [savingGoal,setSavingGoal]= useState(null)
  const [contacts,  setContacts]  = useState([])

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    try {
      const [dealsRes, agentsRes] = await Promise.all([
        supabase.from('deals')
          .select('id, addr, agent_id, stage, side, production, gci, ao_date, close_date, expected_close_date, created_at')
          .order('ao_date', { ascending: false }),
        supabase.from('agents').select('id, name, color, role').eq('active', true).order('name'),
      ])
      if (dealsRes.error) throw dealsRes.error
      if (agentsRes.error) throw agentsRes.error
      setDeals(dealsRes.data || [])
      setAgents(agentsRes.data || [])

      // Load goals for this year
      try {
        const { data: goalsData } = await supabase
          .from('agent_goals')
          .select('*')
          .eq('year', parseInt(year))
        const goalsMap = {}
        ;(goalsData || []).forEach(g => { goalsMap[g.agent_id + '_' + g.year] = g })
        setGoals(goalsMap)
      } catch(e) { /* goals table may not exist yet */ }

      // Load contact counts per agent
      try {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('agent_id')
        const cMap = {}
        ;(contactData || []).forEach(c => { cMap[c.agent_id] = (cMap[c.agent_id] || 0) + 1 })
        setContacts(cMap)
      } catch(e) {}
    } catch(e) {
      toast('Failed to load: ' + e.message, '#DC2626')
    } finally { setLoading(false) }
  }

  // Filter deals to selected year
  const yearDeals = deals.filter(d => {
    const dateStr = d.close_date || d.ao_date || d.created_at || ''
    return dateStr.slice(0, 4) === year
  })

  // Calculate per-agent stats
  const agentStats = agents.map(agent => {
    const agentDeals    = yearDeals.filter(d => d.agent_id === agent.id)
    const closedDeals   = agentDeals.filter(d => d.stage === 'Closed')
    const activeDeals   = agentDeals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
    const gci           = closedDeals.reduce((s, d) => s + (parseFloat(d.gci)        || 0), 0)
    const production    = closedDeals.reduce((s, d) => s + (parseFloat(d.production) || 0), 0)
    const pipelineGCI   = activeDeals.reduce((s, d) => s + (parseFloat(d.gci)        || 0), 0)
    return { agent, gci, production, pipelineGCI, deals: agentDeals }
  }).filter(s => s.deals.length > 0)
    .sort((a, b) => b.gci - a.gci)

  // Team totals
  const teamGCI      = agentStats.reduce((s, a) => s + a.gci, 0)
  const teamVolume   = agentStats.reduce((s, a) => s + a.production, 0)
  const teamPipeline = agentStats.reduce((s, a) => s + a.pipelineGCI, 0)
  const totalClosed  = yearDeals.filter(d => d.stage === 'Closed').length
  const maxGCI       = agentStats[0]?.gci || 1

  // Monthly team GCI for chart
  const monthlyTeamGCI = Array.from({ length: 12 }, (_, m) => ({
    value: yearDeals
      .filter(d => d.stage === 'Closed' && (d.close_date || d.ao_date || '').slice(5, 7) === String(m + 1).padStart(2, '0'))
      .reduce((s, d) => s + (parseFloat(d.gci) || 0), 0)
  }))

  return (
    <div style={{ fontFamily: ff }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>📈 Agent Performance</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {agentStats.length} agents · {totalClosed} closed deals · {fmt$(teamGCI)} total GCI
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display:'flex', gap:10, alignItems:'center' }}>
          <select value={year} onChange={e => setYear(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'2px solid var(--border)', marginBottom:20, gap:0 }}>
        {[['leaderboard','📈 Leaderboard'],['goals','🎯 Goals']].map(([id, label]) => {
          const active = activeTab === id
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{ padding:'9px 18px', border:'none', background:'none', cursor:'pointer',
                borderBottom: active?'2px solid #CC2200':'2px solid transparent', marginBottom:'-2px',
                fontSize:13, fontWeight:active?700:500, color:active?'#CC2200':'var(--muted)', fontFamily:ff }}>
              {label}
            </button>
          )
        })}
      </div>

      {activeTab === 'leaderboard' && (loading ? <Loading /> : (
        <>
          {/* Team totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            <StatCard label="Team GCI"      value={fmt$(teamGCI)}      color="#10B981" icon="💰" sub={(totalClosed) + " deals closed"} />
            <StatCard label="Team Volume"   value={fmt$(teamVolume)}   color="#3B82F6" icon="🏡" />
            <StatCard label="Pipeline GCI"  value={fmt$(teamPipeline)} color="#F5A623" icon="⏳" sub="Active deals" />
            <StatCard label="Agents"        value={agentStats.length}  color="#8B5CF6" icon="👥" sub={"of " + (agents.length) + " total"} />
          </div>

          {/* Team monthly chart */}
          <div style={{ background: 'var(--panel)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 20 }}>
            <MonthlyChart data={monthlyTeamGCI} color="#10B981" label={"Team GCI by Month — " + (year)} />
          </div>

          {/* Leaderboard */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Agent Leaderboard — {year}
          </div>
          {agentStats.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
              No deals found for {year}. Add deals to Production Sheet to see performance data.
            </div>
          )}
          {agentStats.map((s, i) => (
            <AgentCard
              key={s.agent.id}
              agent={s.agent}
              stats={s}
              rank={i + 1}
              maxGCI={maxGCI}
              year={year}
            />
          ))}
        </>
      ))}

      {/* ── GOALS TAB ── */}
      {activeTab === 'goals' && (
        <GoalsTab
          agents={agents}
          year={year}
          goals={goals}
          setGoals={setGoals}
          agentStats={agentStats}
          contacts={contacts}
          savingGoal={savingGoal}
          setSavingGoal={setSavingGoal}
          toast={toast}
          isAdmin={isAdmin}
          canManage={canManage}
          me={me}
        />
      )}
    </div>
  )
}
