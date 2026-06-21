import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDeals } from '../lib/hooks/useDeals'
import { useContacts } from '../lib/hooks/useContacts'
import { useTasks } from '../lib/hooks/useTasks'
import { useListings } from '../lib/hooks/useListings'
import { useAgents } from '../lib/hooks/useAgents'
import { fmt$, fmtDate } from '../lib/utils/format'
import { createContact } from '../lib/db/contacts'
import { createListing } from '../lib/db/listings'
import { createTask } from '../lib/db/tasks'
import { useApp } from '../context/AppContext'

const AGENT_GOALS = {
  'Lazer Farkas':       { gci: 200000, deals: 20 },
  'Mendy Jankovits':    { gci: 150000, deals: 15 },
  'Isaac Leibowitz':    { gci: 180000, deals: 18 },
  'Yanky Lichtenstein': { gci: 100000, deals: 10 },
  'Gitty Fogel':        { gci: 80000,  deals: 8  },
  'Joel Rottenstein':   { gci: 120000, deals: 12 },
  'Eli Hoffman':        { gci: 90000,  deals: 9  },
  'Avraham Weinberger': { gci: 160000, deals: 16 },
}

const TEAM_GOAL_GCI   = 2000000
const TEAM_GOAL_DEALS = 50

const HEADLINES = [
  "📈 Median home price in Rockland County up 8% YoY",
  "🏠 Inventory remains tight — now is the time to list",
  "💰 Mortgage rates holding steady at 6.8% this week",
  "🔥 Spring market in full swing — buyer demand is high",
  "📋 New HGAR MLS rules effective July 1, 2026",
]

export function Dashboard({ setPage }) {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const year = new Date().getFullYear().toString()

  const { deals,    loading: dLoading } = useDeals({ year })
  const { contacts, loading: cLoading } = useContacts()
  const { tasks,    loading: tLoading } = useTasks({ status: 'pending' })
  const { listings, loading: lLoading } = useListings()
  const { agents } = useAgents()

  const [showQuickAdd, setShowQuickAdd] = useState(null) // 'lead' | 'listing' | 'task'
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // Agent stats
  const closedDeals   = deals.filter(d => d.stage === 'Closed')
  const activeDeals   = deals.filter(d => ['Negotiations','Offer Accapted','Under Shtar','Under Contract'].includes(d.stage))
  const totalGCI      = closedDeals.reduce((s,d) => s+(d.gci||0), 0)
  const totalProd     = closedDeals.reduce((s,d) => s+(d.production||0), 0)
  const pendingGCI    = activeDeals.reduce((s,d) => s+(d.gci||0), 0)
  const overdueTasks  = tasks.filter(t => t.due_date && t.due_date < today)
  const todayTasks    = tasks.filter(t => t.due_date === today)
  const hotLeads      = contacts.filter(c => c.status === 'Hot')
  const activeListings = listings.filter(l => l.status === 'Active')

  const agentGoal = AGENT_GOALS[agent?.name] || { gci: 100000, deals: 10 }
  const gciPct    = Math.min(Math.round(totalGCI / agentGoal.gci * 100), 100)
  const dealsPct  = Math.min(Math.round(closedDeals.length / agentGoal.deals * 100), 100)

  // Admin team stats
  const teamGCI     = isAdmin ? deals.filter(d=>d.stage==='Closed').reduce((s,d)=>s+(d.gci||0),0) : 0
  const teamPct     = Math.min(Math.round(teamGCI / TEAM_GOAL_GCI * 100), 100)
  const color       = agent?.color || '#CC2200'
  const firstName   = agent?.name?.split(' ')[0] || 'Agent'

  // Agent leaderboard for admin
  const leaderboard = isAdmin ? agents.map(a => {
    const agentDeals = deals.filter(d => d.agent_id === a.id && d.stage === 'Closed')
    const agentGCI   = agentDeals.reduce((s,d)=>s+(d.gci||0),0)
    const goal       = AGENT_GOALS[a.name]?.gci || 100000
    return { ...a, gci: agentGCI, deals: agentDeals.length, pct: Math.min(Math.round(agentGCI/goal*100),100) }
  }).sort((a,b) => b.gci - a.gci) : []

  async function quickSaveLead() {
    if (!form.first_name?.trim()) { toast('Name required','#DC2626'); return }
    setSaving(true)
    try {
      await createContact({ ...form, agent_id: agent?.id, status: 'New', last_activity: new Date().toISOString() })
      toast('✅ Lead added!'); setShowQuickAdd(null); setForm({})
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function quickSaveListing() {
    if (!form.addr?.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      await createListing({ ...form, agent_id: agent?.id, status: 'Active', spend:[], showings:[], interests:[] })
      toast('✅ Listing added!'); setShowQuickAdd(null); setForm({})
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function quickSaveTask() {
    if (!form.title?.trim()) { toast('Title required','#DC2626'); return }
    setSaving(true)
    try {
      await createTask({ ...form, agent_id: agent?.id, created_by: agent?.id, status:'pending', priority: form.priority||'normal' })
      toast('✅ Task added!'); setShowQuickAdd(null); setForm({})
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div style={{ fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:900 }}>
            Good {getTimeOfDay()}, {firstName} 👋
          </div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'3px' }}>
            {new Date().toLocaleDateString('en-US',{ weekday:'long', month:'long', day:'numeric' })}
            {isAdmin && <span style={{ marginLeft:'8px', fontSize:'11px', fontWeight:700, color:'#CC2200', background:'rgba(204,34,0,.1)', padding:'2px 9px', borderRadius:'20px' }}>ADMIN VIEW</span>}
          </div>
        </div>

        {/* Quick Add buttons */}
        <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
          {[
            { key:'lead',    label:'+ Add Lead',    icon:'👤' },
            { key:'listing', label:'+ Add Listing', icon:'🏠' },
            { key:'task',    label:'+ Add Task',    icon:'✓'  },
          ].map(btn=>(
            <button key={btn.key} onClick={()=>{ setShowQuickAdd(showQuickAdd===btn.key?null:btn.key); setForm({}) }}
              style={{ background:showQuickAdd===btn.key?color:'var(--panel)', border:`1.5px solid ${showQuickAdd===btn.key?color:'var(--border)'}`, borderRadius:'9px', color:showQuickAdd===btn.key?'#fff':'var(--text)', fontSize:'12px', fontWeight:700, padding:'8px 14px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', transition:'all .15s' }}>
              {btn.icon} {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Add Forms */}
      {showQuickAdd === 'lead' && (
        <div style={{ background:'var(--panel)', border:`1.5px solid ${color}`, borderRadius:'12px', padding:'16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color }}>👤 Quick Add Lead</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:'8px', flexWrap:'wrap' }}>
            <input value={form.first_name||''} onChange={e=>set('first_name',e.target.value)} placeholder="First name *" style={inp}/>
            <input value={form.last_name||''} onChange={e=>set('last_name',e.target.value)} placeholder="Last name" style={inp}/>
            <input value={form.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="Phone" style={inp}/>
            <select value={form.source||''} onChange={e=>set('source',e.target.value)} style={inp}>
              <option value="">Source...</option>
              {['SOI','Referral','Zillow','Sign Call','Cold Call','Social Media','Other'].map(s=><option key={s}>{s}</option>)}
            </select>
            <button onClick={quickSaveLead} disabled={saving} style={saveBtn}>{saving?'…':'Save'}</button>
          </div>
        </div>
      )}

      {showQuickAdd === 'listing' && (
        <div style={{ background:'var(--panel)', border:`1.5px solid ${color}`, borderRadius:'12px', padding:'16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color }}>🏠 Quick Add Listing</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:'8px' }}>
            <input value={form.addr||''} onChange={e=>set('addr',e.target.value)} placeholder="Property address *" style={inp}/>
            <input value={form.list_price||''} onChange={e=>set('list_price',e.target.value)} placeholder="List price $" type="number" style={inp}/>
            <input value={form.beds||''} onChange={e=>set('beds',e.target.value)} placeholder="Beds" style={inp}/>
            <input value={form.baths||''} onChange={e=>set('baths',e.target.value)} placeholder="Baths" style={inp}/>
            <button onClick={quickSaveListing} disabled={saving} style={saveBtn}>{saving?'…':'Save'}</button>
          </div>
        </div>
      )}

      {showQuickAdd === 'task' && (
        <div style={{ background:'var(--panel)', border:`1.5px solid ${color}`, borderRadius:'12px', padding:'16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:700, marginBottom:'12px', color }}>✓ Quick Add Task / Note</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', gap:'8px' }}>
            <input value={form.title||''} onChange={e=>set('title',e.target.value)} placeholder="Task or note..." style={inp} onKeyDown={e=>e.key==='Enter'&&quickSaveTask()}/>
            <select value={form.priority||'normal'} onChange={e=>set('priority',e.target.value)} style={inp}>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">🟠 High</option>
              <option value="normal">🔵 Normal</option>
              <option value="low">⚪ Low</option>
              <option value="note">📌 Note</option>
            </select>
            <input value={form.due_date||''} onChange={e=>set('due_date',e.target.value)} type="date" style={inp}/>
            <button onClick={quickSaveTask} disabled={saving} style={saveBtn}>{saving?'…':'Save'}</button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:'9px', marginBottom:'16px' }}>
        {[
          { label:'Closed Deals',    value:closedDeals.length,          color:'#CC2200',  sub:`${agentGoal.deals} goal` },
          { label:'Closed GCI',      value:fmt$(totalGCI),              color:'#16A34A',  sub:`${gciPct}% of goal` },
          { label:'Total Volume',    value:fmt$(totalProd),             color:'#225091',  sub:'this year' },
          { label:'Pending GCI',     value:fmt$(pendingGCI),            color:'#D97706',  sub:`${activeDeals.length} active` },
          { label:'Hot Leads',       value:hotLeads.length,             color:'#DC2626',  sub:`${contacts.length} total` },
          { label:'Active Listings', value:activeListings.length,       color:'#0EA5E9',  sub:'on market' },
        ].map(s=>(
          <div key={s.label} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'11px', padding:'13px' }}>
            <div style={{ fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }}>{s.label}</div>
            <div style={{ fontSize:'19px', fontWeight:900, color:s.color, marginBottom:'2px' }}>{s.value}</div>
            <div style={{ fontSize:'10px', color:'var(--muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* GCI Progress */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', padding:'16px 18px', marginBottom:'14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
          <div>
            <div style={{ fontSize:'13px', fontWeight:700 }}>GCI Progress {year}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
              {fmt$(totalGCI)} of {fmt$(agentGoal.gci)} goal · {closedDeals.length} of {agentGoal.deals} deals
            </div>
          </div>
          <div style={{ fontSize:'24px', fontWeight:900, color:gciPct>=100?'#16A34A':color }}>{gciPct}%</div>
        </div>
        <div style={{ background:'var(--dim)', borderRadius:'99px', height:10, overflow:'hidden', marginBottom:'6px' }}>
          <div style={{ background:`linear-gradient(90deg,${color},${color}99)`, borderRadius:'99px', height:10, width:gciPct+'%', transition:'width .5s ease' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'var(--muted)' }}>
          <span>Deals progress: {dealsPct}%</span>
          <span>{agentGoal.deals - closedDeals.length > 0 ? `${agentGoal.deals - closedDeals.length} deals to goal` : '🎉 Goal reached!'}</span>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns:isAdmin?'1fr 1fr 1fr':'1fr 1fr', gap:'12px', marginBottom:'14px' }}>

        {/* Today's Tasks */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          <div style={{ padding:'12px 15px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>✓ Today's Tasks</span>
            <div style={{ display:'flex', gap:'5px' }}>
              {overdueTasks.length>0 && <span style={{ fontSize:'10px', fontWeight:700, background:'rgba(220,38,38,.1)', color:'#DC2626', borderRadius:'99px', padding:'2px 8px' }}>{overdueTasks.length} overdue</span>}
              <span style={{ fontSize:'10px', fontWeight:700, background:'rgba(204,34,0,.1)', color:'#CC2200', borderRadius:'99px', padding:'2px 8px' }}>{todayTasks.length} today</span>
            </div>
          </div>
          {tLoading ? <Loader/> :
           todayTasks.length===0 && overdueTasks.length===0
           ? <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>🎯 All clear for today!</div>
           : <>
               {overdueTasks.slice(0,3).map(t=>(
                 <div key={t.id} style={{ padding:'9px 15px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center', background:'rgba(220,38,38,.02)' }}>
                   <div style={{ width:7, height:7, borderRadius:'2px', background:'#DC2626', flexShrink:0 }}/>
                   <span style={{ fontSize:'12px', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#DC2626' }}>{t.title}</span>
                   <span style={{ fontSize:'10px', color:'#DC2626', fontWeight:600 }}>Overdue</span>
                 </div>
               ))}
               {todayTasks.slice(0,5).map(t=>(
                 <div key={t.id} style={{ padding:'9px 15px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center' }}>
                   <div style={{ width:7, height:7, borderRadius:'2px', background:t.priority==='urgent'?'#DC2626':t.priority==='high'?'#D97706':'#0EA5E9', flexShrink:0 }}/>
                   <span style={{ fontSize:'12px', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</span>
                 </div>
               ))}
             </>
          }
          <div style={{ padding:'9px 15px' }}>
            <button onClick={()=>setPage&&setPage('tasks')} style={{ fontSize:'11px', color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>View all tasks →</button>
          </div>
        </div>

        {/* Active Pipeline */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          <div style={{ padding:'12px 15px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>📈 Active Pipeline</span>
            <span style={{ fontSize:'11px', color:'var(--muted)' }}>{fmt$(pendingGCI)} pending</span>
          </div>
          {dLoading ? <Loader/> :
           activeDeals.length===0
           ? <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>No active deals</div>
           : activeDeals.slice(0,6).map(d=>(
               <div key={d.id} style={{ padding:'9px 15px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center' }}>
                 <StageDot stage={d.stage}/>
                 <div style={{ flex:1, minWidth:0 }}>
                   <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.addr}</div>
                   <div style={{ fontSize:'10px', color:'var(--muted)' }}>{d.stage}</div>
                 </div>
                 <div style={{ fontSize:'11px', fontWeight:700, color:'#16A34A', flexShrink:0 }}>{fmt$(d.gci)}</div>
               </div>
             ))
          }
          <div style={{ padding:'9px 15px' }}>
            <button onClick={()=>setPage&&setPage('production')} style={{ fontSize:'11px', color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>View production board →</button>
          </div>
        </div>

        {/* Admin: Agent Leaderboard */}
        {isAdmin && (
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
            <div style={{ padding:'12px 15px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'13px', fontWeight:700 }}>🏆 Team Leaderboard</span>
              <span style={{ fontSize:'11px', color:'var(--muted)' }}>Team: {teamPct}% of goal</span>
            </div>
            {leaderboard.filter(a=>a.gci>0).slice(0,7).map((a,i)=>(
              <div key={a.id} style={{ padding:'8px 15px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' }}>
                <span style={{ fontSize:'12px', fontWeight:900, color:'var(--muted)', width:'16px', flexShrink:0 }}>#{i+1}</span>
                <div style={{ width:28, height:28, borderRadius:'50%', background:a.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:800, color:'#fff', flexShrink:0 }}>
                  {a.name?.[0]}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:700 }}>{a.name.split(' ')[0]}</div>
                  <div style={{ background:'var(--dim)', borderRadius:'99px', height:4, overflow:'hidden', marginTop:'3px' }}>
                    <div style={{ background:a.color, borderRadius:'99px', height:4, width:a.pct+'%' }}/>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:700, color:'#16A34A' }}>{fmt$(a.gci)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>{a.pct}%</div>
                </div>
              </div>
            ))}
            {leaderboard.filter(a=>a.gci===0).length>0 && (
              <div style={{ padding:'8px 15px', fontSize:'11px', color:'var(--muted)' }}>
                {leaderboard.filter(a=>a.gci===0).length} agents with no closed deals yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Headlines */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
        <div style={{ padding:'12px 15px', borderBottom:'1px solid var(--border)', fontSize:'13px', fontWeight:700 }}>📰 Market Headlines</div>
        {HEADLINES.map((h,i)=>(
          <div key={i} style={{ padding:'10px 15px', borderBottom:i<HEADLINES.length-1?'1px solid var(--border)':'none', fontSize:'12px', color:'var(--muted)', lineHeight:1.6 }}>
            {h}
          </div>
        ))}
      </div>
    </div>
  )
}

function StageDot({ stage }) {
  const colors = { 'Negotiations':'#037f4c','Offer Accapted':'#00c875','Under Shtar':'#bb3354','Under Contract':'#757575' }
  return <div style={{ width:8, height:8, borderRadius:'50%', background:colors[stage]||'#94A3B8', flexShrink:0 }}/>
}

function Loader() {
  return <div style={{ padding:'20px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>Loading...</div>
}

function getTimeOfDay() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

const inp     = { background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none', width:'100%', boxSizing:'border-box' }
const saveBtn = { background:'#CC2200', border:'none', borderRadius:'8px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'8px 16px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', whiteSpace:'nowrap' }
