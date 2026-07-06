// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Reports Page
// Conversion funnel, YoY comparison, source ROI,
// agent performance over time, pipeline velocity.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { PageHeader, Tabs, Loading, Empty, Btn } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const fmt$ = n => '$' + Number(n||0).toLocaleString(undefined, {maximumFractionDigits:0})
const fmtK = n => '$' + (Number(n||0)/1000).toFixed(0) + 'K'

// ── MINI BAR CHART ────────────────────────────────────────────
function MiniBar({ data, color = 'var(--brand)', valueKey = 'value', labelKey = 'label', height = 120 }) {
  const max = Math.max(...data.map(d=>d[valueKey]), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:4, height, padding:'0 4px' }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
          <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700 }}>
            {d[valueKey] > 0 ? (d[valueKey] >= 1000 ? fmtK(d[valueKey]) : d[valueKey]) : ''}
          </div>
          <div title={d[labelKey]+': '+d[valueKey]}
            style={{ width:'100%', borderRadius:'4px 4px 0 0', background: color, minHeight:2,
              height: Math.max(2, (d[valueKey]/max)*height*0.8) + 'px', opacity:.85, transition:'height .3s' }} />
          <div style={{ fontSize:9, color:'var(--muted)', textAlign:'center', fontWeight:600, lineHeight:1.2 }}>{d[labelKey]}</div>
        </div>
      ))}
    </div>
  )
}

// ── STAT CARD ─────────────────────────────────────────────────
function StatCard({ label, value, sub, color='var(--brand)', trend, icon }) {
  const up = trend > 0, down = trend < 0
  return (
    <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
        {icon && <span style={{ fontSize:20 }}>{icon}</span>}
      </div>
      <div style={{ fontSize:26, fontWeight:800, color, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)' }}>{sub}</div>}
      {trend !== undefined && trend !== null && (
        <div style={{ fontSize:11, fontWeight:700, color: up?'#10B981':down?'#DC2626':'var(--muted)', marginTop:4 }}>
          {up?'↑':down?'↓':'→'} {Math.abs(trend).toFixed(1)}% vs last year
        </div>
      )}
    </div>
  )
}

// ── FUNNEL ────────────────────────────────────────────────────
function Funnel({ stages }) {
  const max = stages[0]?.count || 1
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {stages.map((s,i) => {
        const pct = (s.count/max)*100
        const conv = i > 0 && stages[i-1].count > 0 ? ((s.count/stages[i-1].count)*100).toFixed(0)+'%' : ''
        return (
          <div key={s.label}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{s.label}</span>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                {conv && <span style={{ fontSize:11, color:'#10B981', fontWeight:700 }}>↓ {conv}</span>}
                <span style={{ fontSize:14, fontWeight:800, color:s.color||'var(--brand)' }}>{s.count}</span>
              </div>
            </div>
            <div style={{ height:28, borderRadius:6, background:'var(--dim)', overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:6, background:s.color||'var(--brand)', width:pct+'%', transition:'width .5s', opacity:.85, display:'flex', alignItems:'center', paddingLeft:10 }}>
                {pct > 15 && <span style={{ fontSize:11, color:'#fff', fontWeight:700 }}>{fmt$(s.gci)}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Reports() {
  const { agent, isAdmin, canManage } = useAuth()
  const [tab,    setTab]    = useState('overview')
  const [deals,  setDeals]  = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [year,   setYear]   = useState(new Date().getFullYear().toString())
  const [agents, setAgents]  = useState([])
  const [agentFilter, setAgentFilter] = useState('')

  const [years, setYears] = React.useState(
    Array.from({length: new Date().getFullYear() - 2014}, (_, i) => String(new Date().getFullYear() - i))
  )

  // Load actual years from DB
  React.useEffect(() => {
    supabase.from('deals').select('ao_date').not('ao_date','is',null).order('ao_date',{ascending:true}).limit(1)
      .then(({ data }) => {
        if (data?.[0]?.ao_date) {
          const minYear = parseInt(data[0].ao_date.slice(0,4))
          const curYear = new Date().getFullYear()
          setYears(Array.from({length: curYear - minYear + 1}, (_, i) => String(curYear - i)))
        }
      }).catch(() => {})
  }, [])

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    try {
      const [dealsRes, contactsRes, agentsRes] = await Promise.all([
        supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,agent_id,source,won_reason,lost_reason,side,created_at').order('ao_date',{ascending:false}).range(0,2999),
        supabase.from('contacts').select('id,status,source,agent_id,created_at').order('created_at',{ascending:false}).range(0,4999),
        supabase.from('agents').select('id,name,color').eq('active',true),
      ])
      setDeals(dealsRes.data||[])
      setContacts(contactsRes.data||[])
      setAgents(agentsRes.data||[])
    } catch(e) { console.warn('reports:', e.message) }
    finally { setLoading(false) }
  }

  const prevYear = String(parseInt(year)-1)
  const parseNum = v => parseFloat(String(v||'').replace(/[$,]/g,'')) || 0

  const yearDeals = useMemo(() => {
    const d = deals.filter(d => (d.ao_date||d.close_date||'').startsWith(year))
    return agentFilter ? d.filter(d=>d.agent_id===agentFilter) : d
  }, [deals, year, agentFilter])

  const prevDeals = useMemo(() => deals.filter(d => (d.ao_date||d.close_date||'').startsWith(prevYear)), [deals, prevYear])

  const closed     = yearDeals.filter(d=>d.stage==='Closed')
  const prevClosed = prevDeals.filter(d=>d.stage==='Closed')
  const closedGCI  = closed.reduce((s,d)=>s+parseNum(d.gci),0)
  const prevGCI    = prevClosed.reduce((s,d)=>s+parseNum(d.gci),0)
  const gciTrend   = prevGCI > 0 ? ((closedGCI-prevGCI)/prevGCI)*100 : null

  const closedVol  = closed.reduce((s,d)=>s+parseNum(d.production),0)
  const avgGCI     = closed.length > 0 ? closedGCI/closed.length : 0

  // Monthly GCI chart
  const monthly = useMemo(() => 'JFMAMJJASOND'.split('').map((m,i) => {
    const ms = year+'-'+String(i+1).padStart(2,'0')
    const gci = yearDeals.filter(d=>d.stage==='Closed'&&(d.ao_date||d.close_date||'').startsWith(ms)).reduce((s,d)=>s+parseNum(d.gci),0)
    return { label:m, value: gci }
  }), [yearDeals, year])

  // Conversion funnel
  const yearContacts = contacts.filter(c => c.created_at?.startsWith(year))
  const funnelStages = [
    { label:'New Leads',      count: yearContacts.length, gci:0,        color:'#3B82F6' },
    { label:'Active',         count: yearDeals.filter(d=>!['Closed','Deal Fell Through'].includes(d.stage)).length, gci:0, color:'#F5A623' },
    { label:'Offer / Under Contract', count: yearDeals.filter(d=>['Offer Accapted','Under Contract'].includes(d.stage)).length, gci:0, color:'#8B5CF6' },
    { label:'Closed',         count: closed.length, gci: closedGCI, color:'#10B981' },
  ]

  // Source breakdown
  const sourceMap = {}
  closed.forEach(d => {
    const src = d.source||'Unknown'
    if (!sourceMap[src]) sourceMap[src] = { count:0, gci:0 }
    sourceMap[src].count++; sourceMap[src].gci += parseNum(d.gci)
  })
  const sources = Object.entries(sourceMap).sort((a,b)=>b[1].gci-a[1].gci).slice(0,8)

  // Won/Lost reasons
  const wonReasons  = {}; closed.forEach(d => { if(d.won_reason) { wonReasons[d.won_reason]=(wonReasons[d.won_reason]||0)+1 } })
  const lostReasons = {}; yearDeals.filter(d=>d.stage==='Deal Fell Through').forEach(d => { if(d.lost_reason) { lostReasons[d.lost_reason]=(lostReasons[d.lost_reason]||0)+1 } })

  // Agent leaderboard
  const agentMap = {}
  closed.forEach(d => {
    if (!d.agent_id) return
    const a = agents.find(a=>a.id===d.agent_id)
    if (!a) return
    if (!agentMap[d.agent_id]) agentMap[d.agent_id] = { agent:a, count:0, gci:0 }
    agentMap[d.agent_id].count++; agentMap[d.agent_id].gci += parseNum(d.gci)
  })
  const leaderboard = Object.values(agentMap).sort((a,b)=>b.gci-a.gci)

  const TABS = [
    { id:'overview',   label:'Overview'    },
    { id:'funnel',     label:'Conversion'  },
    { id:'sources',    label:'Lead Sources'},
    { id:'agents',     label:'Agents'      },
    { id:'reasons',    label:'Won / Lost'  },
  ]

  if (loading) return <Loading />

  return (
    <div style={{ fontFamily:ff }}>
      <PageHeader title="Reports" sub="Performance analytics and insights"
        actions={
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {(isAdmin||canManage) && (
              <select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}
                style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
                <option value="">All Agents</option>
                {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <select value={year} onChange={e=>setYear(e.target.value)}
              style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
              {years.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
            <StatCard label="Closed GCI"    value={fmtK(closedGCI)} sub={closed.length+' deals'} color='#10B981' trend={gciTrend} icon="💰" />
            <StatCard label="Volume"        value={fmtK(closedVol)} sub="total production" color='#3B82F6' icon="🏠" />
            <StatCard label="Avg GCI/Deal"  value={fmtK(avgGCI)} sub="per closed deal" color='#F5A623' icon="📊" />
            <StatCard label="Active Deals"  value={yearDeals.filter(d=>!['Closed','Deal Fell Through'].includes(d.stage)).length} sub="in pipeline" color='#8B5CF6' icon="🔄" />
            <StatCard label="New Contacts"  value={yearContacts.length} sub={'vs '+prevDeals.length+' last yr'} color='var(--brand)' icon="👤" />
            <StatCard label="Lost Deals"    value={yearDeals.filter(d=>d.stage==='Deal Fell Through').length} sub="fell through" color='#94A3B8' icon="💔" />
          </div>
          <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:16 }}>Monthly GCI — {year}</div>
            <MiniBar data={monthly} color='var(--brand)' height={140} />
          </div>
        </div>
      )}

      {/* ── CONVERSION FUNNEL ── */}
      {tab === 'funnel' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:16 }}>Conversion Funnel — {year}</div>
            <Funnel stages={funnelStages} />
            <div style={{ marginTop:16, padding:'10px 14px', background:'var(--dim)', borderRadius:8, fontSize:12 }}>
              <strong>Lead → Close rate: </strong>
              <span style={{ color:'#10B981', fontWeight:800 }}>
                {yearContacts.length > 0 ? ((closed.length/yearContacts.length)*100).toFixed(1)+'%' : '—'}
              </span>
            </div>
          </div>
          <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:16 }}>Year over Year</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ borderBottom:'2px solid var(--border)' }}>
                <th style={{ textAlign:'left', padding:'6px 0', color:'var(--muted)', fontSize:10, fontWeight:800, textTransform:'uppercase' }}>Metric</th>
                <th style={{ textAlign:'right', padding:'6px 0', color:'var(--muted)', fontSize:10, fontWeight:800 }}>{year}</th>
                <th style={{ textAlign:'right', padding:'6px 0', color:'var(--muted)', fontSize:10, fontWeight:800 }}>{prevYear}</th>
                <th style={{ textAlign:'right', padding:'6px 0', color:'var(--muted)', fontSize:10, fontWeight:800 }}>Change</th>
              </tr></thead>
              <tbody>
                {[
                  { label:'Closed Deals', curr:closed.length, prev:prevClosed.length, fmt:n=>n },
                  { label:'Total GCI', curr:closedGCI, prev:prevGCI, fmt:fmtK },
                  { label:'Avg GCI', curr:avgGCI, prev:prevClosed.length>0?prevGCI/prevClosed.length:0, fmt:fmtK },
                  { label:'New Leads', curr:yearContacts.length, prev:contacts.filter(c=>c.created_at?.startsWith(prevYear)).length, fmt:n=>n },
                ].map(row => {
                  const chg = row.prev > 0 ? ((row.curr-row.prev)/row.prev)*100 : null
                  return (
                    <tr key={row.label} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'10px 0', fontWeight:600, color:'var(--text)' }}>{row.label}</td>
                      <td style={{ padding:'10px 0', textAlign:'right', fontWeight:800, color:'var(--text)' }}>{row.fmt(row.curr)}</td>
                      <td style={{ padding:'10px 0', textAlign:'right', color:'var(--muted)' }}>{row.fmt(row.prev)}</td>
                      <td style={{ padding:'10px 0', textAlign:'right', fontWeight:700, color: chg===null?'var(--muted)':chg>0?'#10B981':'#DC2626' }}>
                        {chg===null ? '—' : (chg>0?'+':'')+chg.toFixed(0)+'%'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SOURCES ── */}
      {tab === 'sources' && (
        <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:16 }}>Lead Source ROI — {year}</div>
          {sources.length === 0 ? <Empty title="No closed deals yet for this period" /> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ borderBottom:'2px solid var(--border)' }}>
                {['Source','Closed Deals','Total GCI','Avg GCI','% of Total GCI'].map(h => (
                  <th key={h} style={{ textAlign:h==='Source'?'left':'right', padding:'8px 10px 8px 0', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {sources.map(([src,data]) => (
                  <tr key={src} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'11px 10px 11px 0', fontWeight:700, color:'var(--text)' }}>{src}</td>
                    <td style={{ padding:'11px 10px 11px 0', textAlign:'right', fontWeight:600 }}>{data.count}</td>
                    <td style={{ padding:'11px 10px 11px 0', textAlign:'right', fontWeight:800, color:'#10B981' }}>{fmt$(data.gci)}</td>
                    <td style={{ padding:'11px 10px 11px 0', textAlign:'right', color:'var(--muted)' }}>{fmtK(data.gci/data.count)}</td>
                    <td style={{ padding:'11px 0 11px 0', textAlign:'right' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end' }}>
                        <div style={{ width:60, height:6, borderRadius:3, background:'var(--dim)', overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:3, background:'var(--brand)', width:((data.gci/closedGCI)*100)+'%' }} />
                        </div>
                        <span style={{ color:'var(--muted)', fontSize:11, fontWeight:700 }}>{closedGCI>0?((data.gci/closedGCI)*100).toFixed(0)+'%':'—'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── AGENTS ── */}
      {tab === 'agents' && (isAdmin||canManage) && (
        <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:16 }}>Agent Performance — {year}</div>
          {leaderboard.length === 0 ? <Empty title="No data yet" /> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ borderBottom:'2px solid var(--border)' }}>
                {['#','Agent','Closed Deals','Total GCI','Avg GCI'].map(h => (
                  <th key={h} style={{ textAlign:h==='Agent'||h==='#'?'left':'right', padding:'8px 10px 8px 0', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {leaderboard.map((row,i) => (
                  <tr key={row.agent.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'11px 10px 11px 0', color:'var(--muted)', fontWeight:800, fontSize:12 }}>{i+1}</td>
                    <td style={{ padding:'11px 10px 11px 0' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:row.agent.color||'#CC2200', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>
                          {row.agent.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight:700, color:'var(--text)' }}>{row.agent.name}</span>
                      </div>
                    </td>
                    <td style={{ padding:'11px 10px 11px 0', textAlign:'right', fontWeight:600 }}>{row.count}</td>
                    <td style={{ padding:'11px 10px 11px 0', textAlign:'right', fontWeight:800, color:'#10B981' }}>{fmt$(row.gci)}</td>
                    <td style={{ padding:'11px 0', textAlign:'right', color:'var(--muted)' }}>{fmtK(row.gci/row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── WON / LOST REASONS ── */}
      {tab === 'reasons' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#10B981', marginBottom:14 }}>🏆 Won Reasons</div>
            {Object.keys(wonReasons).length === 0 ? <div style={{ fontSize:12, color:'var(--muted)' }}>No won reasons recorded yet.</div> : (
              Object.entries(wonReasons).sort((a,b)=>b[1]-a[1]).map(([r,n]) => (
                <div key={r} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                  <span style={{ fontSize:13, color:'var(--text)' }}>{r}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:60, height:6, borderRadius:3, background:'var(--dim)' }}>
                      <div style={{ height:'100%', borderRadius:3, background:'#10B981', width:(n/Object.values(wonReasons).reduce((a,b)=>a+b,0)*100)+'%' }} />
                    </div>
                    <span style={{ fontSize:13, fontWeight:800, color:'#10B981', minWidth:20, textAlign:'right' }}>{n}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ background:'var(--panel)', borderRadius:'var(--radius)', border:'1px solid var(--border)', padding:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#DC2626', marginBottom:14 }}>💔 Lost Reasons</div>
            {Object.keys(lostReasons).length === 0 ? <div style={{ fontSize:12, color:'var(--muted)' }}>No lost reasons recorded yet.</div> : (
              Object.entries(lostReasons).sort((a,b)=>b[1]-a[1]).map(([r,n]) => (
                <div key={r} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                  <span style={{ fontSize:13, color:'var(--text)' }}>{r}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:60, height:6, borderRadius:3, background:'var(--dim)' }}>
                      <div style={{ height:'100%', borderRadius:3, background:'#DC2626', width:(n/Object.values(lostReasons).reduce((a,b)=>a+b,0)*100)+'%' }} />
                    </div>
                    <span style={{ fontSize:13, fontWeight:800, color:'#DC2626', minWidth:20, textAlign:'right' }}>{n}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
