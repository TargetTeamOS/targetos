import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn, StatCard, Grid4, Avatar } from '../components/UI'
import { AGENTS } from '../lib/constants'

const LOG_CATS = {
  contact:     {label:'Contact',     color:'#0EA5E9', icon:'👤'},
  listing:     {label:'Listing',     color:'#10B981', icon:'🏠'},
  transaction: {label:'Transaction', color:'#7C3AED', icon:'📋'},
  deal:        {label:'Deal',        color:'#F5A623', icon:'📊'},
  task:        {label:'Task',        color:'#E8650A', icon:'✓'},
  call:        {label:'Call',        color:'#0EA5E9', icon:'📞'},
  offer:       {label:'Offer',       color:'#CC2200', icon:'📝'},
  auth:        {label:'Auth',        color:'#64748B', icon:'🔑'},
  settings:    {label:'Settings',    color:'#8B5CF6', icon:'⚙'},
  system:      {label:'System',      color:'#94A3B8', icon:'🖥'},
}

export function ActivityLog() {
  const { state } = useApp()
  const [log, setLog] = useState([])
  const [filterCat, setFilterCat] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(()=>{
    // Load from Supabase
    import('../lib/supabase').then(({supabase})=>{
      supabase.from('activity_log').select('*').order('created_at',{ascending:false}).limit(500).then(({data})=>{
        if(data) setLog(data.map(r=>({
          id:r.id, timestamp:r.created_at,
          timeLabel: new Date(r.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}),
          cat: r.category||'system', action: r.action||'', subject: r.subject||'', detail: r.detail||'',
          before: r.before_val?JSON.parse(r.before_val):null, after: r.after_val?JSON.parse(r.after_val):null,
          agent: r.agent_name||'System',
        })))
      })
    })
    // Also include in-memory log from context
    if(state.activityLog?.length) setLog(prev=>[...state.activityLog,...prev].slice(0,500))
  },[])

  // Check permission
  const currentAgent = state.currentAgent
  const canView = !currentAgent || ['admin','secretary'].includes(currentAgent.role)

  if(!canView) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'55vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'48px',marginBottom:'12px'}}>🔒</div>
        <div style={{fontSize:'16px',fontWeight:700,marginBottom:'6px'}}>Access Restricted</div>
        <div style={{color:'var(--muted)',fontSize:'13px'}}>Activity log is only visible to admins and secretaries.</div>
      </div>
    </div>
  )

  const today = new Date().toISOString().split('T')[0]
  const todayCount = log.filter(e=>e.timestamp?.startsWith(today)).length

  const filtered = log.filter(e=>{
    if(filterCat && e.cat!==filterCat) return false
    if(filterAgent && e.agent!==filterAgent) return false
    if(search && !(e.subject+' '+e.detail+' '+e.agent+' '+e.action).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function exportLog() {
    const h = 'Time,Category,Action,Subject,Detail,Agent\n'
    const r = filtered.map(e=>`"${e.timeLabel}","${LOG_CATS[e.cat]?.label||e.cat}","${e.action}","${e.subject}","${e.detail}","${e.agent}"`)
    const b = new Blob([h+r.join('\n')],{type:'text/csv'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='activity_log.csv'; a.click()
  }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Total Events" value={log.length.toLocaleString()} sub="All time"     subColor="var(--teal)"/>
        <StatCard label="Today"        value={todayCount}                  sub="Events today" subColor="var(--green)"/>
        <StatCard label="Filtered"     value={filtered.length}             sub="Showing"      subColor="#D97706"/>
        <StatCard label="Categories"   value={Object.keys(LOG_CATS).length} sub="Tracked"     subColor="var(--purple)"/>
      </Grid4>

      {/* Filters */}
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'12px 14px',marginBottom:'13px',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events..."
          style={{flex:1,minWidth:'160px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}
          onFocus={e=>e.target.style.borderColor='var(--red)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
          <option value="">All Categories</option>
          {Object.entries(LOG_CATS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
          <option value="">All Agents</option>
          {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
        </select>
        {(filterCat||filterAgent||search) && <button onClick={()=>{setFilterCat('');setFilterAgent('');setSearch('')}} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Clear</button>}
        <Btn size="sm" variant="ghost" onClick={exportLog}>Export CSV</Btn>
      </div>

      <div style={{color:'var(--muted)',fontSize:'11px',marginBottom:'8px'}}>{filtered.length.toLocaleString()} events</div>

      {log.length === 0 ? (
        <Card>
          <div style={{padding:'48px',textAlign:'center',color:'var(--muted)'}}>
            <div style={{fontSize:'32px',marginBottom:'12px'}}>📋</div>
            <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px'}}>No activity logged yet</div>
            <div style={{fontSize:'12px'}}>Every action in TargetOS will appear here automatically — contacts added, tasks completed, deals updated, and more.</div>
          </div>
        </Card>
      ) : (
        <Card>
          {/* Table header */}
          <div style={{display:'grid',gridTemplateColumns:'140px 90px 100px 1fr 160px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
            <div>Time</div><div>Category</div><div>Action</div><div>Subject / Detail</div><div>Changed By</div>
          </div>
          {filtered.slice(0,200).map(e=>{
            const catInfo = LOG_CATS[e.cat]||LOG_CATS.system
            const ag = AGENTS.find(a=>a.name===e.agent)
            return (
              <div key={e.id} onClick={()=>setSelected(selected?.id===e.id?null:e)}
                style={{display:'grid',gridTemplateColumns:'140px 90px 100px 1fr 160px',padding:'11px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer'}}
                onMouseEnter={ev=>ev.currentTarget.style.background='var(--hov)'} onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                <div style={{fontSize:'10px',color:'var(--muted)'}}>{e.timeLabel}</div>
                <div><span style={{fontSize:'10px',fontWeight:600,padding:'2px 7px',borderRadius:'20px',background:catInfo.color+'18',color:catInfo.color}}>{catInfo.icon} {catInfo.label}</span></div>
                <div style={{fontSize:'11px',fontWeight:600}}>{e.action}</div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:600}}>{e.subject}</div>
                  {e.detail && <div style={{fontSize:'10px',color:'var(--muted)'}}>{e.detail}</div>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                  {ag ? <Avatar name={ag.name} color={ag.color} size={22}/> : <div style={{width:22,height:22,borderRadius:'5px',background:'var(--dim)',flexShrink:0}}/>}
                  <div style={{fontSize:'11px'}}>{e.agent}</div>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {/* Detail panel */}
      {selected && (
        <div onClick={()=>setSelected(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(4px)'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'18px',padding:'26px',width:'100%',maxWidth:'500px',maxHeight:'80vh',overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}>
            <div style={{fontSize:'15px',fontWeight:800,marginBottom:'16px',display:'flex',justifyContent:'space-between'}}>
              Event Detail
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',color:'var(--muted)'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              {[['Time',selected.timeLabel],['Category',(LOG_CATS[selected.cat]?.icon||'')+' '+(LOG_CATS[selected.cat]?.label||selected.cat)],['Action',selected.action],['Agent',selected.agent],['Subject',selected.subject||'—'],['Detail',selected.detail||'—']].map(([k,v])=>(
                <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px'}}>
                  <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                  <div style={{fontSize:'12px',fontWeight:600}}>{v}</div>
                </div>
              ))}
            </div>
            {(selected.before||selected.after) && (
              <div style={{background:'var(--dim)',borderRadius:'9px',padding:'12px'}}>
                <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',marginBottom:'8px'}}>Change Record</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  <div style={{background:'rgba(220,38,38,.06)',border:'1px solid rgba(220,38,38,.15)',borderRadius:'8px',padding:'10px'}}>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#DC2626',marginBottom:'4px'}}>BEFORE</div>
                    <pre style={{fontSize:'11px',whiteSpace:'pre-wrap',margin:0,fontFamily:'monospace'}}>{JSON.stringify(selected.before,null,2)}</pre>
                  </div>
                  <div style={{background:'rgba(22,163,74,.06)',border:'1px solid rgba(22,163,74,.15)',borderRadius:'8px',padding:'10px'}}>
                    <div style={{fontSize:'10px',fontWeight:700,color:'#16A34A',marginBottom:'4px'}}>AFTER</div>
                    <pre style={{fontSize:'11px',whiteSpace:'pre-wrap',margin:0,fontFamily:'monospace'}}>{JSON.stringify(selected.after,null,2)}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
