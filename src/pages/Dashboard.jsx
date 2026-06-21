import React from 'react'
import { useAuth } from '../context/AuthContext'
import { useDeals } from '../lib/hooks/useDeals'
import { useContacts } from '../lib/hooks/useContacts'
import { useTasks } from '../lib/hooks/useTasks'
import { useListings } from '../lib/hooks/useListings'
import { fmt$, fmtDate, getDaysAgo } from '../lib/utils/format'

const GOAL_GCI  = 2000000
const GOAL_DEALS = 50

export function Dashboard() {
  const { agent, isAdmin } = useAuth()
  const year = new Date().getFullYear().toString()

  // Load data scoped to current agent (RLS handles security)
  const { deals,    loading: dLoading } = useDeals({ year })
  const { contacts, loading: cLoading } = useContacts()
  const { tasks,    loading: tLoading } = useTasks({ status: 'pending' })
  const { listings, loading: lLoading } = useListings()

  const today     = new Date().toISOString().split('T')[0]
  const closedDeals  = deals.filter(d => d.stage === 'Closed')
  const activeDeals  = deals.filter(d => ['Negotiations','Offer Accapted','Under Shtar','Under Contract'].includes(d.stage))
  const totalGCI     = closedDeals.reduce((s, d) => s + (d.gci || 0), 0)
  const totalProd    = closedDeals.reduce((s, d) => s + (d.production || 0), 0)
  const pendingGCI   = activeDeals.reduce((s, d) => s + (d.gci || 0), 0)
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today)
  const todayTasks   = tasks.filter(t => t.due_date === today)
  const hotLeads     = contacts.filter(c => c.status === 'Hot')
  const activeListings = listings.filter(l => l.status === 'Active')
  const gciPct       = Math.min(Math.round(totalGCI / GOAL_GCI * 100), 100)
  const dealsPct     = Math.min(Math.round(closedDeals.length / GOAL_DEALS * 100), 100)

  const firstName = agent?.name?.split(' ')[0] || 'Agent'
  const color     = agent?.color || '#CC2200'

  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '22px', fontWeight: 900 }}>
          Good {getTimeOfDay()}, {firstName} 👋
        </div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>
          {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
        </div>
      </div>

      {/* KPI Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '10px', marginBottom: '18px' }}>
        {[
          { label:'Closed Deals',    value: closedDeals.length,   color:'#CC2200',  sub:`${GOAL_DEALS - closedDeals.length} to goal` },
          { label:'Closed GCI',      value: fmt$(totalGCI),       color:'#16A34A',  sub:`${gciPct}% of ${fmt$(GOAL_GCI)} goal` },
          { label:'Total Volume',    value: fmt$(totalProd),      color:'#225091',  sub:'this year' },
          { label:'Pending GCI',     value: fmt$(pendingGCI),     color:'#D97706',  sub:`${activeDeals.length} active deals` },
          { label:'Hot Leads',       value: hotLeads.length,      color:'#DC2626',  sub:`${contacts.length} total contacts` },
          { label:'Active Listings', value: activeListings.length,color:'#0EA5E9',  sub:'on market' },
        ].map(stat => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* GCI Progress */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', padding:'18px 20px', marginBottom:'14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
          <div>
            <div style={{ fontSize:'13px', fontWeight:700 }}>GCI Progress — {year}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>{fmt$(totalGCI)} of {fmt$(GOAL_GCI)} goal</div>
          </div>
          <div style={{ fontSize:'22px', fontWeight:900, color }}>
            {gciPct}%
          </div>
        </div>
        <div style={{ background:'var(--dim)', borderRadius:'99px', height:10, overflow:'hidden' }}>
          <div style={{ background:`linear-gradient(90deg,${color},${color}99)`, borderRadius:'99px', height:10, width:gciPct+'%', transition:'width .5s ease' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px', fontSize:'10px', color:'var(--muted)' }}>
          <span>{closedDeals.length} / {GOAL_DEALS} deals</span>
          <span>{GOAL_DEALS - closedDeals.length} more needed</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
        {/* Today's Tasks */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
          <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>✓ Today's Tasks ({todayTasks.length})</span>
            {overdueTasks.length > 0 && (
              <span style={{ fontSize:'11px', fontWeight:700, background:'rgba(220,38,38,.1)', color:'#DC2626', borderRadius:'99px', padding:'2px 9px' }}>
                {overdueTasks.length} overdue
              </span>
            )}
          </div>
          {tLoading ? <Loader /> :
           todayTasks.length === 0
           ? <Empty text="No tasks today 🎯" />
           : todayTasks.slice(0, 6).map(task => (
              <div key={task.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
                <div style={{ width:8, height:8, borderRadius:'2px', background:task.priority==='urgent'?'#DC2626':task.priority==='high'?'#D97706':'#0EA5E9', flexShrink:0 }}/>
                <span style={{ fontSize:'12px', fontWeight:500, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</span>
              </div>
            ))
          }
        </div>

        {/* Recent Activity */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
          <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>📈 Active Pipeline</span>
          </div>
          {dLoading ? <Loader /> :
           activeDeals.length === 0
           ? <Empty text="No active deals" />
           : activeDeals.slice(0, 6).map(deal => (
              <div key={deal.id} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'10px' }}>
                <StageDot stage={deal.stage} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{deal.addr}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)' }}>{deal.stage} · {fmt$(deal.gci)} GCI</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px', padding:'14px' }}>
      <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'5px' }}>{label}</div>
      <div style={{ fontSize:'20px', fontWeight:900, color, marginBottom:'2px' }}>{value}</div>
      <div style={{ fontSize:'10px', color:'var(--muted)' }}>{sub}</div>
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
function Empty({ text }) {
  return <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>{text}</div>
}
function getTimeOfDay() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}
