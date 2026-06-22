import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useDeals } from '../lib/hooks'
import { useContacts } from '../lib/hooks'
import { useTasks } from '../lib/hooks'
import { useListings } from '../lib/hooks'
import { useAgents } from '../lib/hooks'
import * as db from '../lib/db'
import { fmt$, fmtDate, fmtDateShort, timeOfDay, today, isOverdue, isDueToday, pct, truncate } from '../lib/utils'
import { AGENT_GOALS, TEAM_GOAL, DEAL_STAGES, PIPELINE_STAGES, CONTACT_SOURCES, TASK_PRIORITIES, HEADLINES } from '../lib/constants'
import { StatCard, ProgressBar, Pill, Btn, Avatar, Empty, Loading, PageHeader, Grid } from '../components/UI'

export function Dashboard() {
  const navigate    = useNavigate()
  const { agent, isAdmin } = useAuth()
  const { toast }   = useApp()

  const year = new Date().getFullYear()
  const { deals,    loading: dLoad } = useDeals()
  const { contacts, loading: cLoad } = useContacts()
  const { tasks,    loading: tLoad } = useTasks()
  const { listings, loading: lLoad } = useListings()
  const { agents }                   = useAgents()

  const [quickAdd, setQuickAdd] = useState(null)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [adminTab, setAdminTab] = useState('overview')

  const todayStr = today()
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  // ── PERSONAL STATS ────────────────────────────────────────────
  const myDeals    = isAdmin ? deals : deals.filter(d => d.agent_id === agent?.id)
  const myClosed   = myDeals.filter(d => d.stage === 'Closed')
  const myActive   = myDeals.filter(d => PIPELINE_STAGES.includes(d.stage))
  const myGCI      = myClosed.reduce((s,d)=>s+(d.gci||0), 0)
  const myVolume   = myClosed.reduce((s,d)=>s+(d.production||0), 0)
  const myPending  = myActive.reduce((s,d)=>s+(d.gci||0), 0)
  const myTasks    = isAdmin ? tasks : tasks.filter(t => t.agent_id === agent?.id)
  const overdue    = myTasks.filter(t => t.status==='pending' && isOverdue(t.due_date))
  const dueToday   = myTasks.filter(t => t.status==='pending' && isDueToday(t.due_date))
  const myContacts = isAdmin ? contacts : contacts.filter(c => c.agent_id === agent?.id)
  const hotLeads   = myContacts.filter(c => c.status === 'Hot')
  const warmLeads  = myContacts.filter(c => c.status === 'Warm')
  const myListings = isAdmin ? listings : listings.filter(l => l.agent_id === agent?.id)
  const activeListings = myListings.filter(l => l.status === 'Active')

  const goal   = AGENT_GOALS[agent?.name] || { gci: 150000, deals: 15 }
  const gciPct = pct(myGCI, goal.gci)
  const delPct = pct(myClosed.length, goal.deals)

  // ── ADMIN TEAM STATS ──────────────────────────────────────────
  const agentStats = agents.map(a => {
    const ad = deals.filter(d => d.agent_id === a.id)
    const ac = ad.filter(d => d.stage === 'Closed')
    const av = ad.filter(d => PIPELINE_STAGES.includes(d.stage))
    const gci    = ac.reduce((s,d)=>s+(d.gci||0), 0)
    const vol    = ac.reduce((s,d)=>s+(d.production||0), 0)
    const pend   = av.reduce((s,d)=>s+(d.gci||0), 0)
    const g      = AGENT_GOALS[a.name] || { gci:150000, deals:15 }
    const ap     = pct(gci, g.gci)
    const aLists = listings.filter(l => l.agent_id===a.id && l.status==='Active').length
    const aCons  = contacts.filter(c => c.agent_id===a.id).length
    const aTasks = tasks.filter(t => t.agent_id===a.id && t.status==='pending' && isOverdue(t.due_date)).length
    return { ...a, closed:ac.length, active:av.length, gci, vol, pend, pct:ap, goal:g, listings:aLists, contacts:aCons, overdue:aTasks }
  }).sort((a,b)=>b.gci-a.gci)

  const teamGCI   = agentStats.reduce((s,a)=>s+a.gci, 0)
  const teamVol   = agentStats.reduce((s,a)=>s+a.vol, 0)
  const teamDeals = agentStats.reduce((s,a)=>s+a.closed, 0)
  const teamPend  = agentStats.reduce((s,a)=>s+a.pend, 0)
  const teamPct   = pct(teamGCI, TEAM_GOAL.gci)

  // ── QUICK ADD ─────────────────────────────────────────────────
  async function quickSave(type) {
    setSaving(true)
    try {
      if (type === 'lead') {
        if (!form.first_name?.trim()) { toast('Name required','#DC2626'); setSaving(false); return }
        await db.contacts.create({ first_name: form.first_name, last_name: form.last_name||'', phone: form.phone||'', source: form.source||'SOI', agent_id: agent?.id })
        toast('✅ Lead saved!')
      } else if (type === 'listing') {
        if (!form.addr?.trim()) { toast('Address required','#DC2626'); setSaving(false); return }
        await db.listings.create({ addr: form.addr, list_price: parseFloat(form.list_price)||null, beds: form.beds||'', baths: form.baths||'', status: 'Active', agent_id: agent?.id })
        toast('✅ Listing saved!')
      } else if (type === 'task') {
        if (!form.title?.trim()) { toast('Task title required','#DC2626'); setSaving(false); return }
        await db.tasks.create({ title: form.title, priority: form.priority||'normal', due_date: form.due_date||null, status: 'pending', agent_id: agent?.id, created_by: agent?.id })
        toast('✅ Task saved!')
      }
      setQuickAdd(null); setForm({})
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  const firstN = agent?.name?.split(' ')[0] || 'there'

  return (
    <div>
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
        <div>
          <div style={{ fontSize:'22px', fontWeight:900 }}>Good {timeOfDay()}, {firstN} 👋</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'3px' }}>
            {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
            {isAdmin && <Pill label="ADMIN" color="#CC2200" style={{ marginLeft:'8px' }}/>}
          </div>
        </div>
        <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
          {[
            {key:'lead',    icon:'👤', label:'+ Lead'},
            {key:'listing', icon:'🏡', label:'+ Listing'},
            {key:'task',    icon:'✓',  label:'+ Task'},
          ].map(b => (
            <Btn key={b.key}
              variant={quickAdd===b.key?'primary':'secondary'}
              onClick={()=>{setQuickAdd(quickAdd===b.key?null:b.key);setForm({})}}>
              {b.icon} {b.label}
            </Btn>
          ))}
        </div>
      </div>

      {/* ── QUICK ADD FORMS ─────────────────────────────────────── */}
      {quickAdd === 'lead' && (
        <div style={{ background:'var(--panel)', border:'1.5px solid #CC2200', borderRadius:'12px', padding:'14px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#CC2200', marginBottom:'10px' }}>👤 Quick Add Lead</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr auto', gap:'7px' }}>
            <input value={form.first_name||''} onChange={e=>set('first_name',e.target.value)} placeholder="First name *" autoFocus/>
            <input value={form.last_name||''}  onChange={e=>set('last_name',e.target.value)}  placeholder="Last name"/>
            <input value={form.phone||''}      onChange={e=>set('phone',e.target.value)}      placeholder="Phone"/>
            <input value={form.email||''}      onChange={e=>set('email',e.target.value)}      placeholder="Email" type="email"/>
            <select value={form.source||''} onChange={e=>set('source',e.target.value)}>
              <option value="">Source...</option>
              {CONTACT_SOURCES.map(s=><option key={s}>{s}</option>)}
            </select>
            <Btn onClick={()=>quickSave('lead')} disabled={saving}>{saving?'…':'Save'}</Btn>
          </div>
        </div>
      )}

      {quickAdd === 'listing' && (
        <div style={{ background:'var(--panel)', border:'1.5px solid #CC2200', borderRadius:'12px', padding:'14px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#CC2200', marginBottom:'10px' }}>🏡 Quick Add Listing</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:'7px' }}>
            <input value={form.addr||''}       onChange={e=>set('addr',e.target.value)}       placeholder="Address *" autoFocus/>
            <input value={form.list_price||''} onChange={e=>set('list_price',e.target.value)} placeholder="Price $" type="number"/>
            <input value={form.beds||''}       onChange={e=>set('beds',e.target.value)}       placeholder="Beds"/>
            <input value={form.baths||''}      onChange={e=>set('baths',e.target.value)}      placeholder="Baths"/>
            <Btn onClick={()=>quickSave('listing')} disabled={saving}>{saving?'…':'Save'}</Btn>
          </div>
        </div>
      )}

      {quickAdd === 'task' && (
        <div style={{ background:'var(--panel)', border:'1.5px solid #CC2200', borderRadius:'12px', padding:'14px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#CC2200', marginBottom:'10px' }}>✓ Quick Add Task / Note / Reminder</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 120px 140px auto', gap:'7px' }}>
            <input value={form.title||''} onChange={e=>set('title',e.target.value)} placeholder="What needs to be done?" autoFocus onKeyDown={e=>e.key==='Enter'&&quickSave('task')}/>
            <select value={form.priority||'normal'} onChange={e=>set('priority',e.target.value)}>
              {TASK_PRIORITIES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <input value={form.due_date||''} onChange={e=>set('due_date',e.target.value)} type="date"/>
            <Btn onClick={()=>quickSave('task')} disabled={saving}>{saving?'…':'Save'}</Btn>
          </div>
        </div>
      )}

      {/* ── ADMIN TEAM VIEW ──────────────────────────────────────── */}
      {isAdmin && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', overflow:'hidden', marginBottom:'16px' }}>
          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
            {[['overview','📊 Overview'],['agents','👥 All Agents'],['pipeline','📈 Pipeline']].map(([k,l])=>(
              <button key={k} onClick={()=>setAdminTab(k)}
                style={{ padding:'11px 18px', border:'none', background:'transparent', cursor:'pointer', fontSize:'12px', fontWeight:700, fontFamily:'Inter,system-ui,sans-serif', color:adminTab===k?'#CC2200':'var(--muted)', borderBottom:`2px solid ${adminTab===k?'#CC2200':'transparent'}`, transition:'all .15s' }}>
                {l}
              </button>
            ))}
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:'14px', fontSize:'11px', color:'var(--muted)' }}>{year} YTD</div>
          </div>

          {/* Overview tab */}
          {adminTab === 'overview' && (
            <div style={{ padding:'16px' }}>
              <div style={{ marginBottom:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                  <div>
                    <div style={{ fontSize:'13px', fontWeight:700 }}>Team GCI — {year}</div>
                    <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
                      {fmt$(teamGCI)} of {fmt$(TEAM_GOAL.gci)} goal · {teamDeals} deals closed
                    </div>
                  </div>
                  <div style={{ fontSize:'26px', fontWeight:900, color:teamPct>=100?'#16A34A':'#CC2200' }}>{teamPct}%</div>
                </div>
                <ProgressBar value={teamGCI} max={TEAM_GOAL.gci} color="#CC2200" height={10}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
                {[
                  ['Team GCI',    fmt$(teamGCI),  '#16A34A'],
                  ['Volume',      fmt$(teamVol),  '#225091'],
                  ['Closed',      teamDeals,      '#CC2200'],
                  ['Active Deals',agentStats.reduce((s,a)=>s+a.active,0),'#D97706'],
                  ['Pending GCI', fmt$(teamPend), '#7C3AED'],
                ].map(([k,v,c])=>(
                  <StatCard key={k} label={k} value={v} color={c}/>
                ))}
              </div>
            </div>
          )}

          {/* All Agents tab */}
          {adminTab === 'agents' && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'900px', fontSize:'12px' }}>
                <thead>
                  <tr style={{ background:'var(--dim)' }}>
                    {['Agent','GCI','Goal %','Volume','Pending GCI','Closed','Active','Listings','Contacts','Overdue'].map(h=>(
                      <th key={h} style={{ padding:'8px 11px', textAlign:'left', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px', borderBottom:'1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((a,i)=>(
                    <tr key={a.id} style={{ borderBottom:'1px solid var(--border)' }}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{ padding:'10px 11px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <Avatar name={a.name} color={a.color} size={28}/>
                          <div>
                            <div style={{ fontWeight:700 }}>{a.name.split(' ')[0]}</div>
                            <div style={{ fontSize:'10px', color:'var(--muted)', textTransform:'capitalize' }}>{a.role}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'10px 11px', fontWeight:700, color:'#16A34A' }}>{fmt$(a.gci)}</td>
                      <td style={{ padding:'10px 11px' }}>
                        <div style={{ fontWeight:700, color:a.pct>=100?'#16A34A':a.color, marginBottom:'3px' }}>{a.pct}%</div>
                        <ProgressBar value={a.gci} max={a.goal.gci} color={a.color} height={4} showPct={false}/>
                      </td>
                      <td style={{ padding:'10px 11px', color:'#225091', fontWeight:600 }}>{fmt$(a.vol)}</td>
                      <td style={{ padding:'10px 11px', color:'#D97706', fontWeight:600 }}>{fmt$(a.pend)}</td>
                      <td style={{ padding:'10px 11px', fontWeight:700 }}>{a.closed} <span style={{ fontSize:'10px', color:'var(--muted)' }}>/ {a.goal.deals}</span></td>
                      <td style={{ padding:'10px 11px', color:a.active>0?'#D97706':'var(--muted)', fontWeight:600 }}>{a.active}</td>
                      <td style={{ padding:'10px 11px', color:a.listings>0?'#0EA5E9':'var(--muted)', fontWeight:600 }}>{a.listings}</td>
                      <td style={{ padding:'10px 11px', fontWeight:600 }}>{a.contacts}</td>
                      <td style={{ padding:'10px 11px', color:a.overdue>0?'#DC2626':'var(--muted)', fontWeight:a.overdue>0?700:400 }}>
                        {a.overdue > 0 ? `⚠️ ${a.overdue}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pipeline tab */}
          {adminTab === 'pipeline' && (
            <div style={{ padding:'14px', display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'8px' }}>
              {agentStats.filter(a=>a.active>0).map(a=>(
                <div key={a.id} style={{ background:'var(--dim)', borderRadius:'11px', padding:'13px', borderLeft:`3px solid ${a.color}`, cursor:'pointer' }}
                  onClick={()=>navigate('/pipeline')}>
                  <div style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'8px' }}>
                    <Avatar name={a.name} color={a.color} size={24}/>
                    <span style={{ fontSize:'12px', fontWeight:700 }}>{a.name.split(' ')[0]}</span>
                  </div>
                  <div style={{ fontSize:'17px', fontWeight:900, color:a.color }}>{fmt$(a.pend)}</div>
                  <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'2px' }}>{a.active} active deal{a.active!==1?'s':''}</div>
                </div>
              ))}
              {agentStats.every(a=>a.active===0) && <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'13px', gridColumn:'1/-1' }}>No active pipeline</div>}
            </div>
          )}
        </div>
      )}

      {/* ── AGENT GCI PROGRESS ──────────────────────────────────── */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', padding:'16px 18px', marginBottom:'14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
          <div>
            <div style={{ fontSize:'13px', fontWeight:700 }}>My GCI Progress — {year}</div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
              {fmt$(myGCI)} of {fmt$(goal.gci)} · {myClosed.length} of {goal.deals} deals
            </div>
          </div>
          <div style={{ fontSize:'26px', fontWeight:900, color:gciPct>=100?'#16A34A':'#CC2200' }}>{gciPct}%</div>
        </div>
        <ProgressBar value={myGCI} max={goal.gci} height={10} color={agent?.color||'#CC2200'}/>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'var(--muted)', marginTop:'5px' }}>
          <span>Deals: {delPct}% of goal</span>
          <span>{goal.deals - myClosed.length > 0 ? `${goal.deals - myClosed.length} more deals to reach goal` : '🎉 Goal reached!'}</span>
        </div>
      </div>

      {/* ── STATS GRID ──────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:'8px', marginBottom:'14px' }}>
        <StatCard label="Closed GCI"      value={fmt$(myGCI)}           color="#16A34A"/>
        <StatCard label="Total Volume"    value={fmt$(myVolume)}        color="#225091"/>
        <StatCard label="Pending GCI"     value={fmt$(myPending)}       color="#D97706"/>
        <StatCard label="Closed Deals"    value={myClosed.length}       color="#CC2200"/>
        <StatCard label="Active Deals"    value={myActive.length}       color="#E8650A"/>
        <StatCard label="Hot Leads"       value={hotLeads.length}       color="#DC2626"/>
        <StatCard label="Warm Leads"      value={warmLeads.length}      color="#D97706"/>
        <StatCard label="Active Listings" value={activeListings.length} color="#0EA5E9"/>
        <StatCard label="Total Contacts"  value={myContacts.length}     color="#7C3AED"/>
      </div>

      {/* ── BOTTOM GRID ─────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>

        {/* Tasks */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>✓ Today's Tasks</span>
            <div style={{ display:'flex', gap:'5px' }}>
              {overdue.length   > 0 && <Pill label={`${overdue.length} overdue`}   color="#DC2626"/>}
              {dueToday.length  > 0 && <Pill label={`${dueToday.length} today`}    color="#CC2200"/>}
            </div>
          </div>
          {tLoad ? <Loading/>
          : overdue.length===0 && dueToday.length===0
          ? <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>🎯 Nothing due today!</div>
          : <>
              {overdue.slice(0,3).map(t=>(
                <div key={t.id} style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center', background:'rgba(220,38,38,.02)', cursor:'pointer' }}
                  onClick={()=>navigate('/tasks/'+t.id)}>
                  <div style={{ width:7,height:7,borderRadius:'2px',background:'#DC2626',flexShrink:0 }}/>
                  <span style={{ fontSize:'12px',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#DC2626' }}>{t.title}</span>
                  <span style={{ fontSize:'10px',color:'#DC2626',fontWeight:600 }}>Overdue</span>
                </div>
              ))}
              {dueToday.slice(0,5).map(t=>(
                <div key={t.id} style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center', cursor:'pointer' }}
                  onClick={()=>navigate('/tasks/'+t.id)}>
                  <div style={{ width:7,height:7,borderRadius:'2px',background:t.priority==='urgent'?'#DC2626':t.priority==='high'?'#D97706':'#0EA5E9',flexShrink:0 }}/>
                  <span style={{ fontSize:'12px',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{t.title}</span>
                  {t.due_date && <span style={{ fontSize:'10px',color:'var(--muted)' }}>{fmtDateShort(t.due_date)}</span>}
                </div>
              ))}
            </>
          }
          <button onClick={()=>navigate('/tasks')} style={{ display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:'var(--muted)',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left' }}>
            View all tasks →
          </button>
        </div>

        {/* Pipeline */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>📈 Active Pipeline</span>
            <span style={{ fontSize:'11px', color:'var(--muted)' }}>{fmt$(myPending)} pending</span>
          </div>
          {dLoad ? <Loading/>
          : myActive.length===0
          ? <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>No active deals</div>
          : myActive.slice(0,6).map(d=>{
              const stage = DEAL_STAGES.find(s=>s.id===d.stage)
              return (
                <div key={d.id} style={{ padding:'9px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center', cursor:'pointer' }}
                  onClick={()=>navigate('/production/'+d.id)}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{ width:8,height:8,borderRadius:'50%',background:stage?.color||'#94A3B8',flexShrink:0 }}/>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:'12px',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{d.addr}</div>
                    <div style={{ fontSize:'10px',color:'var(--muted)' }}>{d.stage}{d.client_name?` · ${d.client_name}`:''}</div>
                  </div>
                  <span style={{ fontSize:'11px',fontWeight:700,color:'#16A34A',flexShrink:0 }}>{fmt$(d.gci)}</span>
                </div>
              )
            })
          }
          <button onClick={()=>navigate('/production')} style={{ display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:'var(--muted)',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left' }}>
            View production board →
          </button>
        </div>
      </div>

      {/* ── HOT LEADS ───────────────────────────────────────────── */}
      {hotLeads.length > 0 && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden', marginBottom:'14px' }}>
          <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'13px', fontWeight:700 }}>🔥 Hot Leads</span>
            <Pill label={`${hotLeads.length} hot`} color="#DC2626"/>
          </div>
          {hotLeads.slice(0,5).map(c=>(
            <div key={c.id} style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:'10px', alignItems:'center', cursor:'pointer' }}
              onClick={()=>navigate('/contacts/'+c.id)}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <Avatar name={`${c.first_name} ${c.last_name||''}`} color="#DC2626" size={32}/>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:'13px',fontWeight:700 }}>{c.first_name} {c.last_name}</div>
                <div style={{ fontSize:'11px',color:'var(--muted)' }}>{c.phone||c.email||c.source||'No contact info'}</div>
              </div>
              <Pill label="HOT" color="#DC2626" size="sm"/>
            </div>
          ))}
          <button onClick={()=>navigate('/contacts')} style={{ display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:'var(--muted)',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left' }}>
            View all contacts →
          </button>
        </div>
      )}

      {/* ── HEADLINES ───────────────────────────────────────────── */}
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
        <div style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', fontSize:'13px', fontWeight:700 }}>📰 Market Headlines</div>
        {HEADLINES.map((h,i)=>(
          <div key={i} style={{ padding:'10px 14px', borderBottom:i<HEADLINES.length-1?'1px solid var(--border)':'none', fontSize:'12px', color:'var(--muted)', lineHeight:1.7 }}>
            {h}
          </div>
        ))}
      </div>
    </div>
  )
}
