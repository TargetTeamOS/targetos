import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { AGENTS } from '../lib/constants'
import { StatCard, Card, CardHeader, ProgressBar, Badge, Avatar, Grid4, Grid2, Btn, Modal, ModalTitle, SkeletonTable } from '../components/UI'

const fmt$ = n => '$' + Number(n).toLocaleString()

const REAL_DEALS = [
  {id:'d1',addr:'12 Nesher Ct #212, Monsey',agent:'Isaac L.',agentId:'a3',gci:27750,prod:925000,side:'Dual',stage:'Offer Accepted',aoDate:'2026-05-29'},
  {id:'d2',addr:'15 Calvert Dr #112, Monsey',agent:'Isaac L.',agentId:'a3',gci:18340,prod:917000,side:'Dual',stage:'Offer Accepted',aoDate:'2026-05-19'},
  {id:'d3',addr:'36 Gladys Drive, Spring Valley',agent:'Eli H.',agentId:'a7',gci:10335,prod:689000,side:'Buyer',stage:'Offer Accepted',aoDate:'2026-06-11'},
  {id:'d4',addr:'135 Rt 306 Unit 111, Monsey',agent:'Lazer F.',agentId:'a1',gci:25520,prod:638000,side:'Dual',stage:'Offer Accepted',aoDate:'2026-06-12'},
  {id:'d5',addr:'40 Route 9W, West Haverstraw',agent:'Mendy',agentId:'a2',gci:12500,prod:625000,side:'Buyer',stage:'Offer Accepted',aoDate:'2025-09-04'},
  {id:'d6',addr:'12 Cloverdale Lane, Monsey',agent:'Eli H.',agentId:'a7',gci:88000,prod:2450000,side:'Dual',stage:'Under Contract',aoDate:'2026-03-31'},
  {id:'d7',addr:'12 Hilda Ln, Monsey',agent:'Joel R.',agentId:'a6',gci:39750,prod:2650000,side:'Dual',stage:'Under Contract',aoDate:'2026-03-06'},
  {id:'d8',addr:'10 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:33960,prod:849000,side:'Dual',stage:'Under Contract',aoDate:'2026-04-28'},
  {id:'d9',addr:'105 Grove St #202, Monsey',agent:'Eli H.',agentId:'a7',gci:30400,prod:1520000,side:'Dual',stage:'Under Contract',aoDate:'2026-02-19'},
  {id:'d10',addr:'112 Washington Ave, Suffern',agent:'Avraham W.',agentId:'a8',gci:24000,prod:800000,side:'Dual',stage:'Under Contract',aoDate:'2026-01-20'},
  {id:'d11',addr:'116 Fairview Ave, Spring Valley',agent:'Mendy',agentId:'a2',gci:21500,prod:1675000,side:'Flip',stage:'Under Contract',aoDate:'2026-05-29'},
  {id:'d12',addr:'12 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:17500,prod:875000,side:'Listing',stage:'Under Contract',aoDate:'2026-04-21'},
  {id:'d13',addr:'121 Broadway, Haverstraw',agent:'Eli H.',agentId:'a7',gci:18000,prod:450000,side:'Dual',stage:'Under Contract',aoDate:'2026-05-20'},
]

const GOAL_GCI = 2000000

const AGENT_GOALS = {
  a1:{gci:200000,deals:35},a2:{gci:150000,deals:25},a3:{gci:180000,deals:30},
  a4:{gci:100000,deals:20},a5:{gci:80000,deals:15},a6:{gci:120000,deals:22},
  a7:{gci:90000,deals:18},a8:{gci:160000,deals:28}
}
const AGENT_SPLIT = {a1:.21,a2:.15,a3:.17,a4:.09,a5:.08,a6:.12,a7:.06,a8:.12}

// Widget order stored in localStorage
const DEFAULT_WIDGETS = ['goalbar','stats','zoom','contacts_tasks','leaderboard','pipeline']

export function Dashboard({ setPage }) {
  const { state, dispatch, toast } = useApp()
  const [contacts, setContacts] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // {type, data}
  const [widgets, setWidgets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dash_widgets')) || DEFAULT_WIDGETS } catch { return DEFAULT_WIDGETS }
  })
  const [editMode, setEditMode] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [zoomLink, setZoomLink] = useState(() => localStorage.getItem('zoom_link') || 'https://zoom.us/j/82511980702')
  const [zoomNote, setZoomNote] = useState(() => localStorage.getItem('zoom_note') || 'Mondays 9AM · Meeting ID: 825 1198 0702')
  const [editZoom, setEditZoom] = useState(false)

  useEffect(() => {
    async function load() {
      const [c, t] = await Promise.all([
        supabase.from('contacts').select('*').order('created_at',{ascending:false}),
        supabase.from('tasks').select('*').order('created_at',{ascending:false}),
      ])
      if(c.data) setContacts(c.data)
      if(t.data) setTasks(t.data)
      dispatch({ type:'SET_CONTACTS', payload: c.data||[] })
      dispatch({ type:'SET_TASKS',    payload: t.data||[] })
      setLoading(false)
    }
    load()
  }, [])

  function saveWidgets(w) { setWidgets(w); localStorage.setItem('dash_widgets',JSON.stringify(w)) }
  function moveWidget(from, to) {
    const w = [...widgets]
    const [moved] = w.splice(from,1)
    w.splice(to,0,moved)
    saveWidgets(w)
  }
  function removeWidget(id) { saveWidgets(widgets.filter(w=>w!==id)) }
  function addWidget(id) { if(!widgets.includes(id)) saveWidgets([...widgets,id]) }

  const totalGCI  = REAL_DEALS.reduce((s,d)=>s+d.gci,0)
  const totalProd = REAL_DEALS.reduce((s,d)=>s+d.prod,0)
  const pipeline  = REAL_DEALS.filter(d=>d.stage!=='Closed')
  const openTasks = tasks.filter(t=>t.status!=='done')
  const pct       = Math.round(totalGCI/GOAL_GCI*100)

  // ── WIDGET RENDERERS ────────────────────────────────────────────
  function renderWidget(id) {
    switch(id) {

      case 'goalbar': return (
        <Card key="goalbar" style={{padding:'18px',marginBottom:'14px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
            <div>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'4px'}}>Team GCI Goal — 2026</div>
              <div style={{fontSize:'28px',fontWeight:900}}>
                {fmt$(totalGCI)}
                <span style={{color:'var(--muted)',fontSize:'14px',fontWeight:400}}> of {fmt$(GOAL_GCI)}</span>
              </div>
            </div>
            {/* Clickable GCI total */}
            <div onClick={()=>setModal({type:'gci_detail', deals:REAL_DEALS})}
              style={{textAlign:'right',cursor:'pointer',background:'rgba(204,34,0,.06)',borderRadius:'12px',padding:'10px 16px',border:'1px solid rgba(204,34,0,.15)'}}
              title="Click to see all deals behind this number">
              <div style={{fontSize:'36px',fontWeight:900,color:'#CC2200'}}>{pct}%</div>
              <div style={{color:'var(--muted)',fontSize:'11px'}}>tap to see deals →</div>
            </div>
          </div>
          <ProgressBar pct={pct} style={{margin:'10px 0 6px'}}/>
          <div style={{color:'var(--muted)',fontSize:'11px',display:'flex',gap:'16px'}}>
            <span>{pipeline.length} deals in pipeline</span>
            <span>·</span>
            <span onClick={()=>setModal({type:'gci_detail',deals:REAL_DEALS})} style={{color:'#CC2200',cursor:'pointer',fontWeight:600}}>View all {REAL_DEALS.length} deals →</span>
          </div>
        </Card>
      )

      case 'stats': return (
        <Grid4 key="stats" style={{marginBottom:'14px'}}>
          {/* Contacts — clickable */}
          <div onClick={()=>setModal({type:'contacts_list', contacts})} style={{cursor:'pointer'}}>
            <StatCard label="Contacts" value={loading?'…':contacts.length} sub="Tap to view all" subColor="var(--teal)"/>
          </div>
          {/* Open Tasks — clickable */}
          <div onClick={()=>setModal({type:'tasks_list', tasks:openTasks})} style={{cursor:'pointer'}}>
            <StatCard label="Open Tasks" value={loading?'…':openTasks.length} sub="Tap to view all" subColor="var(--red)"/>
          </div>
          {/* Pipeline — clickable */}
          <div onClick={()=>setModal({type:'pipeline_list', deals:pipeline})} style={{cursor:'pointer'}}>
            <StatCard label="In Pipeline" value={pipeline.length} sub="Tap to view deals" subColor="#D97706"/>
          </div>
          {/* Total GCI — clickable */}
          <div onClick={()=>setModal({type:'gci_detail', deals:REAL_DEALS})} style={{cursor:'pointer'}}>
            <StatCard label="Total GCI" value={fmt$(totalGCI)} sub="Tap to see breakdown" subColor="var(--green)"/>
          </div>
        </Grid4>
      )

      case 'zoom': return (
        <Card key="zoom" style={{padding:'14px 16px',marginBottom:'14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          {editZoom ? (
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
                <input value={zoomLink} onChange={e=>setZoomLink(e.target.value)} placeholder="Zoom URL" style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
              </div>
              <div style={{display:'flex',gap:'8px'}}>
                <input value={zoomNote} onChange={e=>setZoomNote(e.target.value)} placeholder="Note (e.g. Mondays 9AM)" style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
                <Btn size="sm" onClick={()=>{localStorage.setItem('zoom_link',zoomLink);localStorage.setItem('zoom_note',zoomNote);setEditZoom(false);toast('Zoom updated!')}}>Save</Btn>
                <Btn size="sm" variant="ghost" onClick={()=>setEditZoom(false)}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div style={{fontSize:'13px',fontWeight:700}}>Team Meeting — Zoom</div>
                <div style={{color:'var(--muted)',fontSize:'11px',marginTop:'2px'}}>{zoomNote}</div>
              </div>
              <div style={{display:'flex',gap:'7px'}}>
                <Btn size="sm" variant="ghost" onClick={()=>setEditZoom(true)}>✏️ Edit</Btn>
                <a href={zoomLink} target="_blank" rel="noreferrer"><Btn size="sm">Join Meeting</Btn></a>
              </div>
            </>
          )}
        </Card>
      )

      case 'contacts_tasks': return (
        <Grid2 key="contacts_tasks" style={{marginBottom:'14px'}}>
          {/* Recent Contacts */}
          <Card>
            <CardHeader>
              Recent Contacts
              <Btn size="xs" onClick={()=>setPage('contacts')}>View All →</Btn>
            </CardHeader>
            {loading ? <SkeletonTable rows={4}/> : contacts.length===0 ? (
              <div style={{padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>
                No contacts yet. <button onClick={()=>setPage('contacts')} style={{color:'#CC2200',background:'none',border:'none',cursor:'pointer',fontSize:'13px'}}>Add first</button>
              </div>
            ) : contacts.slice(0,5).map(c=>(
              <div key={c.id} onClick={()=>setModal({type:'contact_detail', contact:c})}
                style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <Avatar name={c.first_name+' '+(c.last_name||'')} color={roleColor(c.role)} size={34}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:600}}>{c.first_name} {c.last_name||''}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)'}}>{c.role||'—'} · {c.source||'No source'}</div>
                </div>
                <Badge label={c.status||'New'}/>
              </div>
            ))}
            {contacts.length>5 && (
              <div onClick={()=>setModal({type:'contacts_list',contacts})} style={{padding:'10px 16px',textAlign:'center',color:'#CC2200',fontSize:'12px',fontWeight:600,cursor:'pointer',borderTop:'1px solid var(--border)'}}>
                See all {contacts.length} contacts →
              </div>
            )}
          </Card>

          {/* Open Tasks */}
          <Card>
            <CardHeader>
              Open Tasks ({openTasks.length})
              <Btn size="xs" onClick={()=>setPage('tasks')}>View All →</Btn>
            </CardHeader>
            {loading ? <SkeletonTable rows={4}/> : openTasks.length===0 ? (
              <div style={{padding:'24px',textAlign:'center',color:'var(--green)',fontSize:'13px',fontWeight:600}}>All tasks complete! 🎉</div>
            ) : openTasks.slice(0,5).map(t=>(
              <div key={t.id} onClick={()=>setPage('tasks')}
                style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{width:18,height:18,borderRadius:'5px',border:'2px solid var(--border)',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:600}}>{t.title}</div>
                  <div style={{fontSize:'11px',color:t.due_date&&new Date(t.due_date)<new Date()?'#DC2626':'var(--muted)'}}>
                    {t.due_date?'Due '+new Date(t.due_date).toLocaleDateString():'No due date'} · {t.priority||'normal'}
                  </div>
                </div>
              </div>
            ))}
            {openTasks.length>5 && (
              <div onClick={()=>setModal({type:'tasks_list',tasks:openTasks})} style={{padding:'10px 16px',textAlign:'center',color:'#CC2200',fontSize:'12px',fontWeight:600,cursor:'pointer',borderTop:'1px solid var(--border)'}}>
                See all {openTasks.length} open tasks →
              </div>
            )}
          </Card>
        </Grid2>
      )

      case 'leaderboard': return (
        <Card key="leaderboard" style={{marginBottom:'14px'}}>
          <CardHeader>Agent Leaderboard <span style={{color:'var(--muted)',fontSize:'11px',fontWeight:400}}>Click any agent for full profile</span></CardHeader>
          <div style={{padding:'14px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'10px'}}>
            {AGENTS.map((agent,i)=>{
              const goal = AGENT_GOALS[agent.id]||{gci:100000,deals:20}
              const split = AGENT_SPLIT[agent.id]||0.1
              const actualGCI = Math.round(totalGCI*split)
              const p = Math.min(Math.round(actualGCI/goal.gci*100),100)
              return (
                <div key={agent.id} onClick={()=>setModal({type:'agent_profile', agent, actualGCI, goal, deals:REAL_DEALS.filter(d=>d.agentId===agent.id)})}
                  style={{background:'var(--dim)',borderRadius:'10px',padding:'12px',cursor:'pointer',border:'1px solid transparent',transition:'all .15s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.background='rgba(204,34,0,.04)'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='transparent';e.currentTarget.style.background='var(--dim)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                    <Avatar name={agent.name} color={agent.color} size={30}/>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:700}}>{agent.name.split(' ')[0]}</div>
                      <div style={{fontSize:'10px',color:'var(--muted)',textTransform:'capitalize'}}>{agent.role}</div>
                    </div>
                  </div>
                  <div style={{fontSize:'10px',color:'var(--muted)',marginBottom:'4px'}}>{fmt$(actualGCI)} / {fmt$(goal.gci)}</div>
                  <ProgressBar pct={p} color={agent.color} height={5}/>
                  <div style={{color:agent.color,fontSize:'11px',fontWeight:700,marginTop:'4px'}}>{p}% · {REAL_DEALS.filter(d=>d.agentId===agent.id).length} deals</div>
                </div>
              )
            })}
          </div>
        </Card>
      )

      case 'pipeline': return (
        <Card key="pipeline" style={{marginBottom:'14px'}}>
          <CardHeader>
            Current Pipeline ({pipeline.length} deals)
            <Btn size="xs" onClick={()=>setPage('production')}>View All →</Btn>
          </CardHeader>
          <div style={{overflowX:'auto'}}>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',minWidth:'500px'}}>
              <div>Property</div><div>Agent</div><div>Side</div><div>Stage</div><div>GCI</div>
            </div>
            {REAL_DEALS.map((d,i)=>(
              <div key={i} onClick={()=>setModal({type:'deal_detail', deal:d})}
                style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr',padding:'11px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer',minWidth:'500px'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div>
                  <div style={{fontSize:'13px',fontWeight:700}}>{d.addr}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{d.aoDate}</div>
                </div>
                <div style={{fontSize:'12px',color:'var(--muted)'}}>{d.agent}</div>
                <div><span style={{fontSize:'10px',background:'var(--dim)',padding:'2px 8px',borderRadius:'20px',color:'var(--muted)'}}>{d.side}</span></div>
                <div><Badge label={d.stage}/></div>
                <div style={{fontSize:'12px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
              </div>
            ))}
          </div>
        </Card>
      )

      default: return null
    }
  }

  // ── MODAL CONTENT ───────────────────────────────────────────────
  function renderModal() {
    if(!modal) return null
    const m = modal

    if(m.type==='contacts_list') return (
      <Modal onClose={()=>setModal(null)} maxWidth={680}>
        <ModalTitle onClose={()=>setModal(null)}>All Contacts ({m.contacts.length})</ModalTitle>
        <div style={{maxHeight:'520px',overflowY:'auto'}}>
          {m.contacts.map(c=>(
            <div key={c.id} onClick={()=>setModal({type:'contact_detail',contact:c})}
              style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.opacity='.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
              <Avatar name={c.first_name+' '+(c.last_name||'')} color={roleColor(c.role)} size={36}/>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:700}}>{c.first_name} {c.last_name||''}</div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{c.phone||c.email||'—'} · {c.source||'No source'} · {c.role||'—'}</div>
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <Badge label={c.status||'New'}/>
                {c.budget_max&&<span style={{fontSize:'12px',fontWeight:600}}>{fmt$(c.budget_max)}</span>}
                <span style={{color:'#CC2200',fontSize:'12px'}}>→</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop:'14px'}}>
          <Btn style={{width:'100%'}} onClick={()=>{setModal(null);setPage('contacts')}}>Open Full Contacts Board →</Btn>
        </div>
      </Modal>
    )

    if(m.type==='contact_detail') {
      const c = m.contact
      const ag = AGENTS.find(a=>a.name===c.assigned_agent)
      return (
        <Modal onClose={()=>setModal(null)} maxWidth={560}>
          <ModalTitle onClose={()=>setModal(null)}>{c.first_name} {c.last_name||''}</ModalTitle>
          <div style={{display:'flex',alignItems:'center',gap:'14px',marginBottom:'18px'}}>
            <Avatar name={c.first_name+' '+(c.last_name||'')} color={roleColor(c.role)} size={56}/>
            <div>
              <div style={{display:'flex',gap:'8px',marginBottom:'5px'}}><Badge label={c.status||'New'}/><span style={{fontSize:'12px',color:'var(--muted)',textTransform:'capitalize'}}>{c.role}</span>{c.tag&&<span style={{fontSize:'11px',background:'rgba(204,34,0,.1)',color:'#CC2200',padding:'2px 8px',borderRadius:'20px'}}>{c.tag}</span>}</div>
              <div style={{display:'flex',gap:'8px'}}>
                {c.phone&&<Btn size="sm" onClick={()=>window.location.href='tel:'+c.phone.replace(/\D/g,'')}>Call</Btn>}
                {c.phone&&<Btn size="sm" variant="secondary" onClick={()=>window.location.href='sms:'+c.phone.replace(/\D/g,'')}>Text</Btn>}
                {c.email&&<Btn size="sm" variant="purple" onClick={()=>window.location.href='mailto:'+c.email}>Email</Btn>}
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'14px'}}>
            {[['Phone',c.phone],['Email',c.email],['Source',c.source],['Agent',ag?ag.name:'Unassigned'],['Budget',c.budget_max?fmt$(c.budget_max):null],['Areas',c.preferred_areas],['Type',c.property_type_interest||'Any'],['Status',c.status],['City',c.city],['Notes',c.notes]].filter(f=>f[1]).map(([k,v])=>(
              <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px'}}>
                <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                <div style={{fontSize:'13px',fontWeight:600,wordBreak:'break-word'}}>{v}</div>
              </div>
            ))}
          </div>
          <Btn style={{width:'100%'}} onClick={()=>{setModal(null);setPage('contacts')}}>Open Full Contacts Board →</Btn>
        </Modal>
      )
    }

    if(m.type==='tasks_list') return (
      <Modal onClose={()=>setModal(null)} maxWidth={560}>
        <ModalTitle onClose={()=>setModal(null)}>Open Tasks ({m.tasks.length})</ModalTitle>
        <div style={{maxHeight:'480px',overflowY:'auto'}}>
          {m.tasks.length===0
            ? <div style={{textAlign:'center',padding:'36px',color:'var(--green)',fontWeight:700,fontSize:'14px'}}>All tasks complete! 🎉</div>
            : m.tasks.map(t=>(
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:18,height:18,borderRadius:'5px',border:'2px solid var(--border)',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',fontWeight:600}}>{t.title}</div>
                  <div style={{fontSize:'11px',color:t.due_date&&new Date(t.due_date)<new Date()?'#DC2626':'var(--muted)'}}>
                    {t.due_date?'Due '+new Date(t.due_date).toLocaleDateString():'No due date'} · {t.priority||'normal'}
                    {t.due_date&&new Date(t.due_date)<new Date()?' · OVERDUE':''}
                  </div>
                </div>
                <span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:{urgent:'#FEF2F2',high:'#FFFBEB',normal:'var(--dim)',low:'var(--dim)'}[t.priority||'normal'],color:{urgent:'#DC2626',high:'#D97706',normal:'var(--muted)',low:'var(--muted)'}[t.priority||'normal']}}>{t.priority||'normal'}</span>
              </div>
            ))
          }
        </div>
        <Btn style={{width:'100%',marginTop:'14px'}} onClick={()=>{setModal(null);setPage('tasks')}}>Open Full Tasks Board →</Btn>
      </Modal>
    )

    if(m.type==='pipeline_list') return (
      <Modal onClose={()=>setModal(null)} maxWidth={680}>
        <ModalTitle onClose={()=>setModal(null)}>Pipeline — {m.deals.length} Active Deals</ModalTitle>
        <div style={{maxHeight:'480px',overflowY:'auto'}}>
          {['Offer Accepted','Under Shtar','Under Contract'].map(stage=>{
            const stagDeals = m.deals.filter(d=>d.stage===stage)
            if(!stagDeals.length) return null
            return (
              <div key={stage} style={{marginBottom:'14px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.7px'}}>{stage} ({stagDeals.length})</div>
                {stagDeals.map(d=>(
                  <div key={d.id} onClick={()=>setModal({type:'deal_detail',deal:d})}
                    style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',background:'var(--dim)',borderRadius:'9px',marginBottom:'5px',cursor:'pointer'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(204,34,0,.05)'} onMouseLeave={e=>e.currentTarget.style.background='var(--dim)'}>
                    <div>
                      <div style={{fontSize:'13px',fontWeight:700}}>{d.addr}</div>
                      <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.agent} · {d.side} · A/O {d.aoDate}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:'13px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
                      <div style={{fontSize:'11px',color:'var(--muted)'}}>{fmt$(d.prod)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <Btn style={{width:'100%',marginTop:'14px'}} onClick={()=>{setModal(null);setPage('production')}}>Open Full Production Board →</Btn>
      </Modal>
    )

    if(m.type==='gci_detail') return (
      <Modal onClose={()=>setModal(null)} maxWidth={680}>
        <ModalTitle onClose={()=>setModal(null)}>GCI Breakdown — {fmt$(totalGCI)} total</ModalTitle>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'16px'}}>
          {[['Total GCI',fmt$(totalGCI),'#D97706'],['Total Production',fmt$(totalProd),'var(--purple)'],['Active Deals',pipeline.length,'var(--teal)']].map(([k,v,c])=>(
            <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'4px'}}>{k}</div>
              <div style={{fontSize:'20px',fontWeight:900,color:c}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{maxHeight:'380px',overflowY:'auto'}}>
          {m.deals.map(d=>(
            <div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:'13px',fontWeight:700}}>{d.addr}</div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.agent} · {d.side} · {d.stage}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0,marginLeft:'14px'}}>
                <div style={{fontSize:'13px',fontWeight:800,color:'#D97706'}}>{fmt$(d.gci)}</div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{fmt$(d.prod)} production</div>
              </div>
            </div>
          ))}
        </div>
        <Btn style={{width:'100%',marginTop:'14px'}} onClick={()=>{setModal(null);setPage('production')}}>Open Full Production Board →</Btn>
      </Modal>
    )

    if(m.type==='deal_detail') {
      const d = m.deal
      return (
        <Modal onClose={()=>setModal(null)} maxWidth={480}>
          <ModalTitle onClose={()=>setModal(null)}>Deal Detail</ModalTitle>
          <div style={{fontSize:'18px',fontWeight:900,marginBottom:'4px'}}>{d.addr}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'14px'}}>
            {[['Agent',d.agent],['Side',d.side],['Stage',d.stage],['A/O Date',d.aoDate],['GCI',fmt$(d.gci)],['Production',fmt$(d.prod)]].map(([k,v])=>(
              <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'11px'}}>
                <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>{k}</div>
                <div style={{fontSize:'14px',fontWeight:700}}>{v}</div>
              </div>
            ))}
          </div>
          <Btn style={{width:'100%'}} onClick={()=>{setModal(null);setPage('production')}}>Open in Production Board →</Btn>
        </Modal>
      )
    }

    if(m.type==='agent_profile') {
      const {agent,actualGCI,goal,deals} = m
      const p = Math.min(Math.round(actualGCI/goal.gci*100),100)
      return (
        <Modal onClose={()=>setModal(null)} maxWidth={560}>
          <ModalTitle onClose={()=>setModal(null)}>Agent Profile</ModalTitle>
          <div style={{display:'flex',alignItems:'center',gap:'14px',marginBottom:'18px',paddingBottom:'16px',borderBottom:'1px solid var(--border)'}}>
            <Avatar name={agent.name} color={agent.color} size={60}/>
            <div>
              <div style={{fontSize:'20px',fontWeight:900}}>{agent.name}</div>
              <div style={{fontSize:'13px',color:'var(--muted)',textTransform:'capitalize',marginBottom:'6px'}}>{agent.role} · Ext {agent.ext}</div>
              <div style={{display:'flex',gap:'7px'}}>
                <Btn size="sm" onClick={()=>window.location.href='tel:8454241014'}>Call</Btn>
                <Btn size="sm" variant="ghost" onClick={()=>window.location.href='mailto:'+agent.email}>Email</Btn>
              </div>
            </div>
          </div>
          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'16px'}}>
            {[['GCI',fmt$(actualGCI),'#D97706'],['Goal',fmt$(goal.gci),'var(--muted)'],['Progress',p+'%',agent.color]].map(([k,v,c])=>(
              <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'11px',textAlign:'center'}}>
                <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',marginBottom:'4px'}}>{k}</div>
                <div style={{fontSize:'18px',fontWeight:900,color:c}}>{v}</div>
              </div>
            ))}
          </div>
          <ProgressBar pct={p} color={agent.color} style={{marginBottom:'16px'}}/>
          {/* Contact info */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'16px'}}>
            {[['Email',agent.email],['Extension','Ext '+agent.ext],['Role',agent.role.charAt(0).toUpperCase()+agent.role.slice(1)],['Color',agent.color]].map(([k,v])=>(
              <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px'}}>
                <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                <div style={{fontSize:'13px',fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          {/* Deals */}
          {deals.length>0 && (
            <>
              <div style={{fontSize:'12px',fontWeight:700,marginBottom:'8px'}}>Active Deals ({deals.length})</div>
              {deals.map(d=>(
                <div key={d.id} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px',marginBottom:'6px',display:'flex',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:'12px',fontWeight:700}}>{d.addr}</div>
                    <div style={{fontSize:'11px',color:'var(--muted)'}}>{d.side} · {d.stage}</div>
                  </div>
                  <div style={{fontSize:'12px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
                </div>
              ))}
            </>
          )}
        </Modal>
      )
    }

    return null
  }

  // ── MAIN RENDER ─────────────────────────────────────────────────
  const ALL_WIDGETS = ['goalbar','stats','zoom','contacts_tasks','leaderboard','pipeline']
  const hiddenWidgets = ALL_WIDGETS.filter(w=>!widgets.includes(w))

  return (
    <div>
      {/* Edit mode toggle */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px',gap:'7px'}}>
        {editMode && hiddenWidgets.length>0 && hiddenWidgets.map(w=>(
          <Btn key={w} size="xs" variant="ghost" onClick={()=>addWidget(w)}>+ {w.replace('_',' ')}</Btn>
        ))}
        {editMode && <Btn size="sm" variant="ghost" onClick={()=>saveWidgets(DEFAULT_WIDGETS)}>Reset Layout</Btn>}
        <Btn size="sm" variant={editMode?'primary':'ghost'} onClick={()=>setEditMode(e=>!e)}>
          {editMode ? '✓ Done Editing' : '⊞ Edit Layout'}
        </Btn>
      </div>

      {/* Widgets */}
      {widgets.map((id,idx)=>(
        <div key={id} style={{position:'relative'}}>
          {editMode && (
            <div style={{position:'absolute',top:-8,right:0,zIndex:10,display:'flex',gap:'5px'}}>
              {idx>0 && <button onClick={()=>moveWidget(idx,idx-1)} style={{background:'#1B2B4B',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'3px 8px',cursor:'pointer'}}>↑</button>}
              {idx<widgets.length-1 && <button onClick={()=>moveWidget(idx,idx+1)} style={{background:'#1B2B4B',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'3px 8px',cursor:'pointer'}}>↓</button>}
              <button onClick={()=>removeWidget(id)} style={{background:'#DC2626',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'3px 8px',cursor:'pointer'}}>✕</button>
            </div>
          )}
          {renderWidget(id)}
        </div>
      ))}

      {/* Modals */}
      {renderModal()}
    </div>
  )
}

const roleColor = r => ({buyer:'#0EA5E9',seller:'#10B981',investor:'#7C3AED',tenant:'#F59E0B'}[r]||'#64748B')
