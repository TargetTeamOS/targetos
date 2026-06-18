import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { VoiceContactCapture } from '../components/VoiceContactCapture'
import { AGENTS } from '../lib/constants'

const fmt$ = n => '$' + Number(n).toLocaleString()

const DEALS = [
  {id:'d1',addr:'12 Nesher Ct #212, Monsey',agent:'Isaac L.',agentId:'a3',gci:27750,prod:925000,stage:'Offer Accepted',aoDate:'2026-05-29'},
  {id:'d2',addr:'15 Calvert Dr #112, Monsey',agent:'Isaac L.',agentId:'a3',gci:18340,prod:917000,stage:'Offer Accepted',aoDate:'2026-05-19'},
  {id:'d3',addr:'36 Gladys Drive, Spring Valley',agent:'Eli H.',agentId:'a7',gci:10335,prod:689000,stage:'Offer Accepted',aoDate:'2026-06-11'},
  {id:'d4',addr:'135 Rt 306 Unit 111, Monsey',agent:'Lazer F.',agentId:'a1',gci:25520,prod:638000,stage:'Offer Accepted',aoDate:'2026-06-12'},
  {id:'d6',addr:'12 Cloverdale Lane, Monsey',agent:'Eli H.',agentId:'a7',gci:88000,prod:2450000,stage:'Under Contract',aoDate:'2026-03-31'},
  {id:'d7',addr:'12 Hilda Ln, Monsey',agent:'Joel R.',agentId:'a6',gci:39750,prod:2650000,stage:'Under Contract',aoDate:'2026-03-06'},
  {id:'d8',addr:'10 Sneden Ct, Spring Valley',agent:'Lazer F.',agentId:'a1',gci:33960,prod:849000,stage:'Under Contract',aoDate:'2026-04-28'},
]

const TEAM_GOAL = 2000000
const STAGE_COLORS = {'Offer Accepted':'#D97706','Under Shtar':'#bb3354','Under Contract':'#2563EB','Closed':'#16A34A'}

export function MobileDashboard({ setPage }) {
  const { state, dispatch } = useApp()
  const [contacts, setContacts] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showVoice, setShowVoice] = useState(false)

  useEffect(() => {
    async function load() {
      const [c, t] = await Promise.all([
        supabase.from('contacts').select('id,first_name,last_name,status,phone,source,assigned_agent').order('created_at',{ascending:false}).limit(20),
        supabase.from('tasks').select('*').eq('status','pending').order('due_date',{ascending:true}).limit(10),
      ])
      if(c.data) setContacts(c.data)
      if(t.data) setTasks(t.data)
      setLoading(false)
    }
    load()
  }, [])

  const totalGCI = DEALS.reduce((s,d)=>s+d.gci,0)
  const pct = Math.round(totalGCI/TEAM_GOAL*100)
  const pipeline = DEALS.filter(d=>!['Closed','Deal Fell Through'].includes(d.stage))
  const overdueTask = tasks.filter(t=>t.due_date&&new Date(t.due_date)<new Date())

  return (
    <div style={{padding:'14px'}}>
      {/* Voice FAB */}
      <button onClick={()=>setShowVoice(true)} style={{position:'fixed',bottom:'76px',right:'16px',width:54,height:54,borderRadius:'50%',background:'linear-gradient(135deg,#CC2200,#E8650A)',border:'none',color:'#fff',fontSize:'22px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',zIndex:50,boxShadow:'0 4px 16px rgba(204,34,0,.4)'}}>
        🎤
      </button>

      {/* Voice modal */}
      {showVoice && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:200,display:'flex',alignItems:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)setShowVoice(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'20px 20px 0 0',padding:'20px 20px max(20px,env(safe-area-inset-bottom)) 20px',width:'100%',boxShadow:'0 -8px 40px rgba(0,0,0,.3)'}}>
            <VoiceContactCapture onSaved={()=>setTimeout(()=>setShowVoice(false),2500)} onClose={()=>setShowVoice(false)}/>
          </div>
        </div>
      )}

      {/* Welcome */}
      <div style={{marginBottom:'16px'}}>
        <div style={{fontSize:'20px',fontWeight:900}}>Good {new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}! 👋</div>
        <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>Wednesday · Target Team</div>
      </div>

      {/* GCI Goal Card */}
      <div style={{background:'linear-gradient(135deg,#1B2B4B,#0F1A2E)',borderRadius:'18px',padding:'18px',marginBottom:'14px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-20,right:-20,width:100,height:100,borderRadius:'50%',background:'rgba(204,34,0,.15)'}}/>
        <div style={{fontSize:'10px',fontWeight:700,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'4px'}}>Team GCI Goal 2026</div>
        <div style={{fontSize:'28px',fontWeight:900,color:'#fff',marginBottom:'4px'}}>{fmt$(totalGCI)}</div>
        <div style={{fontSize:'12px',color:'rgba(255,255,255,.5)',marginBottom:'12px'}}>of {fmt$(TEAM_GOAL)} goal</div>
        <div style={{background:'rgba(255,255,255,.15)',borderRadius:'99px',height:8,marginBottom:'8px',overflow:'hidden'}}>
          <div style={{background:'linear-gradient(90deg,#CC2200,#F5A623)',borderRadius:'99px',height:8,width:pct+'%',transition:'width 1s ease'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'rgba(255,255,255,.6)'}}>
          <span>{pipeline.length} deals in pipeline</span>
          <span style={{color:'#F5A623',fontWeight:700}}>{pct}% complete</span>
        </div>
      </div>

      {/* Quick stats row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
        {[
          ['Contacts', loading?'…':contacts.length, '#0EA5E9', 'contacts'],
          ['Open Tasks', loading?'…':tasks.length, tasks.length>0?'#CC2200':'#16A34A', 'tasks'],
          ['Pipeline', pipeline.length, '#D97706', 'production'],
        ].map(([label, val, color, pageId]) => (
          <div key={label} onClick={() => setPage(pageId)}
            style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px 12px',textAlign:'center',cursor:'pointer',active:{background:'var(--dim)'}}}>
            <div style={{fontSize:'24px',fontWeight:900,color,marginBottom:'3px'}}>{val}</div>
            <div style={{fontSize:'10px',fontWeight:600,color:'var(--muted)'}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Urgent alerts */}
      {overdueTask.length > 0 && (
        <div onClick={() => setPage('tasks')} style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'14px',padding:'13px 15px',marginBottom:'14px',display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}>
          <span style={{fontSize:'22px'}}>⚠️</span>
          <div>
            <div style={{fontSize:'13px',fontWeight:700,color:'#DC2626'}}>{overdueTask.length} Overdue Task{overdueTask.length>1?'s':''}</div>
            <div style={{fontSize:'11px',color:'#DC2626',opacity:.8}}>{overdueTask[0]?.title}</div>
          </div>
          <span style={{marginLeft:'auto',color:'#DC2626',fontSize:'16px'}}>→</span>
        </div>
      )}

      {/* Quick actions */}
      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'9px'}}>Quick Actions</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'16px'}}>
        {[
          {label:'Add Contact', icon:'👤+', color:'#0EA5E9', page:'contacts'},
          {label:'New Listing',  icon:'🏠+', color:'#10B981', page:'listings'},
          {label:'Add Deal',     icon:'📊+', color:'#D97706', page:'production'},
          {label:'Open House',  icon:'🏡',  color:'#F59E0B', page:'openhouse'},
        ].map(a => (
          <div key={a.label} onClick={() => setPage(a.page)}
            style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px',display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}>
            <div style={{width:36,height:36,borderRadius:'10px',background:a.color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>{a.icon}</div>
            <span style={{fontSize:'12px',fontWeight:700}}>{a.label}</span>
          </div>
        ))}
      </div>

      {/* Pipeline snapshot */}
      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'9px'}}>Active Pipeline</div>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'16px'}}>
        {DEALS.slice(0,5).map((d,i) => (
          <div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 15px',borderBottom:i<4?'1px solid var(--border)':'none'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'12px',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.addr}</div>
              <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}>{d.agent} · {d.aoDate}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0,marginLeft:'10px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#D97706'}}>{fmt$(d.gci)}</div>
              <div style={{fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:'20px',background:(STAGE_COLORS[d.stage]||'#94A3B8')+'18',color:STAGE_COLORS[d.stage]||'#94A3B8',marginTop:'2px'}}>{d.stage}</div>
            </div>
          </div>
        ))}
        <div onClick={() => setPage('production')} style={{padding:'12px 15px',textAlign:'center',color:'#CC2200',fontSize:'12px',fontWeight:700,cursor:'pointer',background:'var(--dim)'}}>
          See all {DEALS.length} deals →
        </div>
      </div>

      {/* Recent contacts */}
      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'9px'}}>Recent Contacts</div>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'16px'}}>
        {loading ? (
          <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Loading...</div>
        ) : contacts.slice(0,5).map((c,i) => (
          <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 15px',borderBottom:i<4&&i<contacts.length-1?'1px solid var(--border)':'none'}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:statusColor(c.status),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:800,color:'#fff',flexShrink:0}}>
              {(c.first_name||'?')[0]}{(c.last_name||'?')[0]}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',fontWeight:700}}>{c.first_name} {c.last_name||''}</div>
              <div style={{fontSize:'10px',color:'var(--muted)'}}>{c.source||'No source'} · {c.status||'New'}</div>
            </div>
            <div style={{display:'flex',gap:'6px'}}>
              {c.phone && <a href={'tel:'+c.phone.replace(/\D/g,'')} style={{textDecoration:'none'}} onClick={e=>e.stopPropagation()}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(16,185,129,.1)',border:'1px solid rgba(16,185,129,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px'}}>📞</div>
              </a>}
              {c.phone && <a href={'sms:'+c.phone.replace(/\D/g,'')} style={{textDecoration:'none'}} onClick={e=>e.stopPropagation()}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(14,165,233,.1)',border:'1px solid rgba(14,165,233,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px'}}>💬</div>
              </a>}
            </div>
          </div>
        ))}
        <div onClick={() => setPage('contacts')} style={{padding:'12px 15px',textAlign:'center',color:'#CC2200',fontSize:'12px',fontWeight:700,cursor:'pointer',background:'var(--dim)'}}>
          See all {contacts.length} contacts →
        </div>
      </div>

      {/* Upcoming tasks */}
      {tasks.length > 0 && (
        <>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'9px'}}>Open Tasks</div>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'16px'}}>
            {tasks.slice(0,4).map((t,i) => {
              const overdue = t.due_date && new Date(t.due_date) < new Date()
              return (
                <div key={t.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 15px',borderBottom:i<3?'1px solid var(--border)':'none'}}>
                  <div style={{width:20,height:20,borderRadius:'5px',border:'2px solid var(--border)',flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'12px',fontWeight:600}}>{t.title}</div>
                    <div style={{fontSize:'10px',color:overdue?'#DC2626':'var(--muted)'}}>{t.due_date?new Date(t.due_date).toLocaleDateString():''} · {t.priority||'normal'}{overdue?' · OVERDUE':''}</div>
                  </div>
                </div>
              )
            })}
            <div onClick={() => setPage('tasks')} style={{padding:'12px 15px',textAlign:'center',color:'#CC2200',fontSize:'12px',fontWeight:700,cursor:'pointer',background:'var(--dim)'}}>
              See all tasks →
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function statusColor(s) {
  return {Hot:'#CC2200',Active:'#10B981',New:'#0EA5E9',Nurturing:'#7C3AED',Cold:'#94A3B8'}[s]||'#64748B'
}
