import React, { useState } from 'react'
import { Card, CardHeader, Btn, StatCard, Modal, ModalTitle, Input, Select, Grid2, Grid3 } from '../components/UI'
import { AGENTS, SOURCES, PROPERTY_TYPES, DEAL_STAGES } from '../lib/constants'
import { BulkUpload } from '../components/BulkUpload'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts'

const fmt$ = n => '$' + Number(n).toLocaleString()

const DEALS = [
  {id:'d1',addr:'12 Nesher Ct #212, Monsey',agent:'Isaac L.',agentId:'a3',gci:27750,prod:925000,side:'Dual',stage:'Offer Accepted',source:'On Market',aoDate:'2026-05-29',type:'Condo'},
  {id:'d2',addr:'15 Calvert Dr #112, Monsey',agent:'Isaac L.',agentId:'a3',gci:18340,prod:917000,side:'Dual',stage:'Offer Accepted',source:'On Market',aoDate:'2026-05-19',type:'Condo'},
  {id:'d3',addr:'36 Gladys Drive, Spring Valley',agent:'Eli H.',agentId:'a7',gci:10335,prod:689000,side:'Buyer',stage:'Offer Accepted',source:'FSBO',aoDate:'2026-06-11',type:'Condo'},
  {id:'d4',addr:'135 Rt 306 Unit 111, Monsey',agent:'Lazer F.',agentId:'a1',gci:25520,prod:638000,side:'Dual',stage:'Offer Accepted',source:'On Market',aoDate:'2026-06-12',type:'Condo'},
  {id:'d5',addr:'40 Route 9W, West Haverstraw',agent:'Mendy',agentId:'a2',gci:12500,prod:625000,side:'Buyer',stage:'Offer Accepted',source:'On Market',aoDate:'2025-09-04',type:'Single Family'},
  {id:'d6',addr:'12 Cloverdale Lane, Monsey',agent:'Eli H.',agentId:'a7',gci:88000,prod:2450000,side:'Dual',stage:'Under Contract',source:'Off Market',aoDate:'2026-03-31',type:'Condo'},
  {id:'d7',addr:'12 Hilda Ln, Monsey',agent:'Joel R.',agentId:'a6',gci:39750,prod:2650000,side:'Dual',stage:'Under Contract',source:'FSBO',aoDate:'2026-03-06',type:'Condo'},
  {id:'d8',addr:'10 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:33960,prod:849000,side:'Dual',stage:'Under Contract',source:'On Market',aoDate:'2026-04-28',type:'Condo'},
  {id:'d9',addr:'105 Grove St #202, Monsey',agent:'Eli H.',agentId:'a7',gci:30400,prod:1520000,side:'Dual',stage:'Under Contract',source:'FSBO',aoDate:'2026-02-19',type:'Condo'},
  {id:'d10',addr:'112 Washington Ave, Suffern',agent:'Avraham W.',agentId:'a8',gci:24000,prod:800000,side:'Dual',stage:'Under Contract',source:'On Market',aoDate:'2026-01-20',type:'Multi Family'},
  {id:'d11',addr:'116 Fairview Ave, Spring Valley',agent:'Mendy',agentId:'a2',gci:21500,prod:1675000,side:'Flip',stage:'Under Contract',source:'On Market',aoDate:'2026-05-29',type:''},
  {id:'d12',addr:'12 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:17500,prod:875000,side:'Listing',stage:'Under Contract',source:'On Market',aoDate:'2026-04-21',type:'Condo'},
  {id:'d13',addr:'121 Broadway, Haverstraw',agent:'Eli H.',agentId:'a7',gci:18000,prod:450000,side:'Dual',stage:'Under Contract',source:'On Market',aoDate:'2026-05-20',type:'Single Family'},
]

const STAGE_ORDER = ['Offer Accepted','Under Shtar','Under Contract','Closed','Deal Fell Through']
const STAGE_COLORS = {'Offer Accepted':'#D97706','Under Shtar':'#7C3AED','Under Contract':'#2563EB','Closed':'#16A34A','Deal Fell Through':'#DC2626'}
const AGENT_COLORS = {'a1':'#CC2200','a2':'#0EA5E9','a3':'#F5A623','a4':'#10B981','a5':'#7C3AED','a6':'#E8650A','a7':'#14B8A6','a8':'#8B5CF6'}

const TEAM_GOAL = 2000000

export function Production() {
  const [deals, setDeals] = useState(DEALS)
  const [view, setView] = useState('board') // board | list | charts
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)

  const filtered = deals.filter(d => {
    if(search && !d.addr.toLowerCase().includes(search.toLowerCase()) && !d.agent.toLowerCase().includes(search.toLowerCase())) return false
    if(filterAgent && d.agent !== filterAgent) return false
    if(filterStage && d.stage !== filterStage) return false
    return true
  })

  const totalGCI  = filtered.reduce((s,d)=>s+d.gci,0)
  const totalProd = filtered.reduce((s,d)=>s+d.prod,0)
  const pipeline  = filtered.filter(d=>!['Closed','Deal Fell Through'].includes(d.stage))
  const goalPct   = Math.round(totalGCI/TEAM_GOAL*100)

  // Chart data
  const agentChartData = AGENTS.map(a => {
    const agentDeals = deals.filter(d=>d.agentId===a.id)
    return { name: a.name.split(' ')[0], gci: agentDeals.reduce((s,d)=>s+d.gci,0), deals: agentDeals.length, color: a.color }
  }).filter(d=>d.deals>0)

  const stageChartData = STAGE_ORDER.map(stage => ({
    name: stage, count: deals.filter(d=>d.stage===stage).length, gci: deals.filter(d=>d.stage===stage).reduce((s,d)=>s+d.gci,0)
  })).filter(d=>d.count>0)

  const sourceChartData = Object.entries(deals.reduce((acc,d)=>{ acc[d.source]=(acc[d.source]||0)+1; return acc },{})).map(([name,value])=>({name,value}))

  const monthlyData = [
    {month:'Jan',gci:24000,deals:1},{month:'Feb',gci:30400,deals:1},{month:'Mar',gci:79500,deals:2},
    {month:'Apr',gci:51460,deals:2},{month:'May',gci:107840,deals:4},{month:'Jun',gci:372345,deals:3},
  ]

  return (
    <div>
      {/* Team goal bar */}
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'18px',marginBottom:'16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
          <div>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'3px'}}>Team GCI Goal — 2026</div>
            <div style={{fontSize:'28px',fontWeight:900}}>{fmt$(totalGCI)} <span style={{color:'var(--muted)',fontSize:'15px',fontWeight:400}}>of {fmt$(TEAM_GOAL)}</span></div>
          </div>
          <div style={{textAlign:'right',background:'rgba(204,34,0,.06)',borderRadius:'12px',padding:'12px 18px',border:'1px solid rgba(204,34,0,.15)'}}>
            <div style={{fontSize:'38px',fontWeight:900,color:'#CC2200',lineHeight:1}}>{goalPct}%</div>
            <div style={{color:'var(--muted)',fontSize:'11px',marginTop:'2px'}}>{TEAM_GOAL-totalGCI>0?fmt$(TEAM_GOAL-totalGCI)+' to go':'Goal reached!'}</div>
          </div>
        </div>
        <div style={{background:'var(--dim)',borderRadius:'99px',height:10,overflow:'hidden',marginBottom:'8px'}}>
          <div style={{background:'linear-gradient(90deg,#CC2200,#E8650A)',borderRadius:'99px',height:10,width:Math.min(goalPct,100)+'%',transition:'width .8s ease'}}/>
        </div>
        <div style={{display:'flex',gap:'20px',fontSize:'12px',color:'var(--muted)'}}>
          <span>{deals.length} total deals</span>
          <span>·</span>
          <span>{pipeline.length} in pipeline</span>
          <span>·</span>
          <span>{fmt$(totalProd)} total volume</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Total GCI',fmt$(totalGCI),'#D97706'],
          ['Volume',fmt$(totalProd),'var(--purple)'],
          ['Pipeline',pipeline.length,'var(--teal)'],
          ['Offer Accepted',deals.filter(d=>d.stage==='Offer Accepted').length,'#D97706'],
          ['Under Contract',deals.filter(d=>d.stage==='Under Contract').length,'#2563EB'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'20px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'180px',fontFamily:'Inter,system-ui,sans-serif'}}/>
          <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            <option value="">All Agents</option>
            {AGENTS.map(a=><option key={a.id} value={a.name.split(' ')[0]+' '+(a.name.split(' ')[1]||''[0]+'.').slice(0,8)}>{a.name}</option>)}
          </select>
          <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            <option value="">All Stages</option>
            {STAGE_ORDER.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['board','Board'],['list','List'],['charts','Charts']].map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)} style={{padding:'5px 11px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:view===k?'var(--panel)':'transparent',color:view===k?'var(--text)':'var(--muted)'}}>{l}</button>
            ))}
          </div>
          <Btn variant="ghost" size="sm" onClick={()=>exportProd(filtered)}>Export CSV</Btn>
          <Btn variant="ghost" size="sm" onClick={()=>setShowBulk(true)}>⬆ Import</Btn>
          <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Add Deal</Btn>
        </div>
      </div>

      {/* Board View */}
      {view==='board' && (
        <div>
          {STAGE_ORDER.map(stage=>{
            const g = filtered.filter(d=>d.stage===stage)
            if(!g.length) return null
            const gGCI = g.reduce((s,d)=>s+d.gci,0)
            const gProd = g.reduce((s,d)=>s+d.prod,0)
            const color = STAGE_COLORS[stage]
            return (
              <div key={stage} style={{marginBottom:'20px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:color}}/>
                  <span style={{fontSize:'14px',fontWeight:800}}>{stage}</span>
                  <span style={{background:color+'18',color,fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'20px'}}>{g.length} deals</span>
                  <span style={{color:'var(--muted)',fontSize:'12px'}}>Volume: {fmt$(gProd)} · GCI: {fmt$(gGCI)}</span>
                </div>
                <Card>
                  <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',minWidth:'600px'}}>
                    <div>Property</div><div>Agent</div><div>Side</div><div>Type</div><div>Source</div><div>Production</div><div>GCI</div>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    {g.map(d=>(
                      <div key={d.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer',minWidth:'600px'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <div>
                          <div style={{fontSize:'13px',fontWeight:700}}>{d.addr}</div>
                          <div style={{fontSize:'10px',color:'var(--muted)'}}>A/O: {d.aoDate}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <div style={{width:8,height:8,borderRadius:'50%',background:AGENT_COLORS[d.agentId]||'#64748B',flexShrink:0}}/>
                          <span style={{fontSize:'11px'}}>{d.agent}</span>
                        </div>
                        <div><span style={{fontSize:'10px',background:'var(--dim)',padding:'2px 8px',borderRadius:'20px',color:'var(--muted)'}}>{d.side}</span></div>
                        <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.type||'—'}</div>
                        <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.source}</div>
                        <div style={{fontSize:'12px',fontWeight:700}}>{fmt$(d.prod)}</div>
                        <div style={{fontSize:'12px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
                      </div>
                    ))}
                    {/* Group total */}
                    <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'10px 16px',background:'var(--dim)',borderTop:'2px solid var(--border)',minWidth:'600px'}}>
                      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)'}}>TOTAL ({g.length})</div>
                      <div/><div/><div/><div/>
                      <div style={{fontSize:'12px',fontWeight:800}}>{fmt$(gProd)}</div>
                      <div style={{fontSize:'12px',fontWeight:800,color:'#D97706'}}>{fmt$(gGCI)}</div>
                    </div>
                  </div>
                </Card>
              </div>
            )
          })}
        </div>
      )}

      {/* List View */}
      {view==='list' && (
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
            <div>Address</div><div>Agent</div><div>Side</div><div>Stage</div><div>Source</div><div>Production</div><div>GCI</div>
          </div>
          {filtered.map(d=>(
            <div key={d.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'11px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div><div style={{fontSize:'13px',fontWeight:700}}>{d.addr}</div><div style={{fontSize:'10px',color:'var(--muted)'}}>A/O: {d.aoDate}</div></div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.agent}</div>
              <div><span style={{fontSize:'10px',background:'var(--dim)',padding:'2px 8px',borderRadius:'20px',color:'var(--muted)'}}>{d.side}</span></div>
              <div><span style={{fontSize:'10px',fontWeight:600,padding:'2px 8px',borderRadius:'20px',background:(STAGE_COLORS[d.stage]||'#94A3B8')+'18',color:STAGE_COLORS[d.stage]||'#94A3B8'}}>{d.stage}</span></div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.source}</div>
              <div style={{fontSize:'12px',fontWeight:700}}>{fmt$(d.prod)}</div>
              <div style={{fontSize:'12px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
            </div>
          ))}
          {/* Totals */}
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr',padding:'12px 16px',background:'var(--dim)',borderTop:'2px solid var(--border)'}}>
            <div style={{fontSize:'12px',fontWeight:700}}>TOTAL ({filtered.length} deals)</div>
            <div/><div/><div/><div/>
            <div style={{fontSize:'13px',fontWeight:800}}>{fmt$(filtered.reduce((s,d)=>s+d.prod,0))}</div>
            <div style={{fontSize:'13px',fontWeight:800,color:'#D97706'}}>{fmt$(filtered.reduce((s,d)=>s+d.gci,0))}</div>
          </div>
        </Card>
      )}

      {/* Charts View */}
      {view==='charts' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>

            {/* GCI by Agent */}
            <Card>
              <CardHeader>GCI by Agent</CardHeader>
              <div style={{padding:'16px',height:'280px'}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentChartData} margin={{top:0,right:0,left:10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="name" tick={{fontSize:11,fill:'var(--muted)'}}/>
                    <YAxis tickFormatter={v=>'$'+Math.round(v/1000)+'k'} tick={{fontSize:10,fill:'var(--muted)'}}/>
                    <Tooltip formatter={v=>[fmt$(v),'GCI']} contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:'12px'}}/>
                    <Bar dataKey="gci" radius={[6,6,0,0]}>
                      {agentChartData.map((entry,i)=><Cell key={i} fill={entry.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Monthly GCI trend */}
            <Card>
              <CardHeader>Monthly GCI Trend</CardHeader>
              <div style={{padding:'16px',height:'280px'}}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="month" tick={{fontSize:11,fill:'var(--muted)'}}/>
                    <YAxis tickFormatter={v=>'$'+Math.round(v/1000)+'k'} tick={{fontSize:10,fill:'var(--muted)'}}/>
                    <Tooltip formatter={v=>[fmt$(v),'GCI']} contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:'12px'}}/>
                    <Line type="monotone" dataKey="gci" stroke="#CC2200" strokeWidth={3} dot={{fill:'#CC2200',r:4}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Deals by Stage */}
            <Card>
              <CardHeader>Pipeline by Stage</CardHeader>
              <div style={{padding:'16px',height:'260px',display:'flex',alignItems:'center'}}>
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie data={stageChartData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40}>
                      {stageChartData.map((entry,i)=><Cell key={i} fill={STAGE_COLORS[entry.name]||'#94A3B8'}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v+' deals',n]} contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:'12px'}}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{flex:1}}>
                  {stageChartData.map((s,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:STAGE_COLORS[s.name]||'#94A3B8',flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'12px',fontWeight:600}}>{s.name}</div>
                        <div style={{fontSize:'10px',color:'var(--muted)'}}>{s.count} deals · {fmt$(s.gci)} GCI</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Lead Source breakdown */}
            <Card>
              <CardHeader>Deals by Source</CardHeader>
              <div style={{padding:'16px',height:'260px'}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceChartData} layout="vertical" margin={{left:60}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:11,fill:'var(--muted)'}}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'var(--muted)'}}/>
                    <Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'8px',fontSize:'12px'}}/>
                    <Bar dataKey="value" fill="#CC2200" radius={[0,6,6,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Agent leaderboard table */}
          <Card>
            <CardHeader>Agent Leaderboard — 2026</CardHeader>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'var(--dim)'}}>
                    {['#','Agent','Deals','Volume','GCI','Goal','Progress'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGENTS.map((agent,i)=>{
                    const agDeals = deals.filter(d=>d.agentId===agent.id)
                    const agGCI = agDeals.reduce((s,d)=>s+d.gci,0)
                    const agProd = agDeals.reduce((s,d)=>s+d.prod,0)
                    const goal = {a1:200000,a2:150000,a3:180000,a4:100000,a5:80000,a6:120000,a7:90000,a8:160000}[agent.id]||100000
                    const pct = Math.min(Math.round(agGCI/goal*100),100)
                    if(agDeals.length===0) return null
                    return (
                      <tr key={agent.id} style={{borderBottom:'1px solid var(--border)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{padding:'12px 14px',fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>{i+1}</td>
                        <td style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
                            <div style={{width:30,height:30,borderRadius:'8px',background:agent.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:800,color:'#fff',flexShrink:0}}>{agent.ini}</div>
                            <div>
                              <div style={{fontSize:'13px',fontWeight:700}}>{agent.name}</div>
                              <div style={{fontSize:'10px',color:'var(--muted)',textTransform:'capitalize'}}>{agent.role}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:'12px 14px',fontSize:'13px',fontWeight:700}}>{agDeals.length}</td>
                        <td style={{padding:'12px 14px',fontSize:'13px',fontWeight:700}}>{fmt$(agProd)}</td>
                        <td style={{padding:'12px 14px',fontSize:'13px',fontWeight:700,color:'#D97706'}}>{fmt$(agGCI)}</td>
                        <td style={{padding:'12px 14px',fontSize:'12px',color:'var(--muted)'}}>{fmt$(goal)}</td>
                        <td style={{padding:'12px 14px',minWidth:'120px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                            <div style={{flex:1,background:'var(--dim)',borderRadius:'99px',height:6,overflow:'hidden'}}>
                              <div style={{background:agent.color,borderRadius:'99px',height:6,width:pct+'%',transition:'width .5s'}}/>
                            </div>
                            <span style={{fontSize:'11px',fontWeight:700,color:agent.color,minWidth:'30px'}}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  }).filter(Boolean)}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {showAdd && <AddDealModal onClose={()=>setShowAdd(false)} onSaved={d=>{setDeals(prev=>[d,...prev]);setShowAdd(false)}}/>}
      {showBulk && <BulkUpload board="deals" onClose={()=>setShowBulk(false)} onImport={async rows=>{const nl=rows.map(r=>({...r,id:'d'+Date.now()+Math.random().toString(36).slice(2,5),prod:parseFloat((r.prod||'0').replace(/[^0-9.]/g,''))||0,gci:parseFloat((r.gci||'0').replace(/[^0-9.]/g,''))||0}));setDeals(prev=>[...nl,...prev]);return {imported:nl.length,errors:0,updated:0,errorDetails:[]}}}/>}
    </div>
  )
}

function AddDealModal({ onClose, onSaved }) {
  const [form, setForm] = useState({addr:'',agent:'',agentId:'',side:'Buyer',stage:'Offer Accepted',source:'',prod:'',gci:'',type:'Condo',aoDate:new Date().toISOString().split('T')[0]})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  function save() {
    if(!form.addr) return
    const agent = AGENTS.find(a=>a.name===form.agent)
    onSaved({...form,id:'d'+Date.now(),prod:parseFloat(form.prod)||0,gci:parseFloat(form.gci)||0,agentId:agent?.id||'',contractDate:'',expectedClose:'',closeDate:''})
  }
  return (
    <Modal onClose={onClose} maxWidth={520}>
      <ModalTitle onClose={onClose}>Add Deal</ModalTitle>
      <Input label="Property Address *" value={form.addr} onChange={e=>set('addr',e.target.value)} placeholder="84 Tennyson Drive, Nanuet NY"/>
      <Grid2 gap={10}>
        <Select label="Agent *" value={form.agent} onChange={e=>set('agent',e.target.value)} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
        <Select label="Side" value={form.side} onChange={e=>set('side',e.target.value)} options={['Buyer','Listing','Dual','Dual Buyer','Dual Listing','Flip']}/>
      </Grid2>
      <Grid2 gap={10}>
        <Select label="Stage" value={form.stage} onChange={e=>set('stage',e.target.value)} options={STAGE_ORDER}/>
        <Select label="Source" value={form.source} onChange={e=>set('source',e.target.value)} options={[{value:'',label:'Select...'},...SOURCES.map(s=>({value:s,label:s}))]}/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Production ($)" value={form.prod} onChange={e=>set('prod',e.target.value)} type="number" placeholder="599000"/>
        <Input label="GCI ($)" value={form.gci} onChange={e=>set('gci',e.target.value)} type="number" placeholder="17970"/>
      </Grid2>
      <Grid2 gap={10}>
        <Select label="Property Type" value={form.type} onChange={e=>set('type',e.target.value)} options={[{value:'',label:'Select...'},...PROPERTY_TYPES.map(p=>({value:p,label:p}))]}/>
        <Input label="A/O Date" value={form.aoDate} onChange={e=>set('aoDate',e.target.value)} type="date"/>
      </Grid2>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save}>Add Deal</Btn>
      </div>
    </Modal>
  )
}

function exportProd(deals) {
  const h='Address,Agent,Side,Stage,Source,Production,GCI,A/O Date\n'
  const r=deals.map(d=>`"${d.addr}","${d.agent}","${d.side}","${d.stage}","${d.source}","${d.prod}","${d.gci}","${d.aoDate}"`)
  const b=new Blob([h+r.join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='production.csv';a.click()
}
