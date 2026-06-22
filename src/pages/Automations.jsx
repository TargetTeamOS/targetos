import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { getAutomations, upsertAutomation, updateAutomation, deleteAutomation } from '../lib/db'

const PRESETS = [
  { id:'p1', name:'New Contact → Welcome Task', description:'When a contact is added, create a follow-up task for the agent', active:true, trigger_type:'trigger_new_contact',
    action_nodes:[{type:'action_task',config:{title:'Follow up with {name}',priority:'high',dueIn:'1 day'}}] },
  { id:'p2', name:'Deal Accepted Offer → UC Gift', description:'When deal moves to Accepted Offer, create Under Contract gift record', active:true, trigger_type:'trigger_offer_accepted',
    action_nodes:[{type:'action_create_gift',config:{giftType:'Under Contract',amount:'75'}},{type:'action_task',config:{title:'Order UC gift — {addr}',priority:'high',dueIn:'2 days'}}] },
  { id:'p3', name:'Deal Closed → Celebration', description:'When deal closes, create closing gift and send celebration email', active:true, trigger_type:'trigger_deal_closed',
    action_nodes:[{type:'action_create_gift',config:{giftType:'Closing',amount:'150'}},{type:'action_email',config:{subject:'🎉 Closed! {addr}',template:'closing_celebration'}}] },
  { id:'p4', name:'Task Overdue Alert', description:'When a task passes due date, notify the assigned agent', active:true, trigger_type:'cron_task_overdue',
    action_nodes:[{type:'action_notify',config:{message:'Task overdue: {title}'}}] },
  { id:'p5', name:'Daily Briefing', description:'Send daily briefing email to all active agents at 7AM ET', active:true, trigger_type:'cron_daily_7am',
    action_nodes:[{type:'action_email',config:{template:'daily_briefing'}}] },
  { id:'p6', name:'No Activity Alert', description:'When a Hot lead has no activity for 3 days, alert the agent', active:true, trigger_type:'trigger_no_activity',
    action_nodes:[{type:'action_task',config:{title:'Re-engage {name} — no activity 3 days',priority:'urgent',dueIn:'today'}}] },
]

const TRIGGER_LABELS = {
  trigger_new_contact:  '👤 New Contact Added',
  trigger_offer_accepted:'📝 Deal → Accepted Offer',
  trigger_deal_closed:  '🎉 Deal Closed',
  trigger_no_activity:  '⏰ No Activity (3 days)',
  cron_daily_7am:       '⏰ Daily at 7AM ET',
  cron_task_overdue:    '⏰ Task Overdue Check',
}

const ACTION_LABELS = {
  action_task:        '✓ Create Task',
  action_create_gift: '🎁 Create Gift Record',
  action_email:       '✉ Send Email',
  action_notify:      '🔔 Send Notification',
  action_announce:    '📣 Post Announcement',
}

const TRIGGER_COLORS = {
  trigger_new_contact:'#0EA5E9',trigger_offer_accepted:'#D97706',
  trigger_deal_closed:'#16A34A',trigger_no_activity:'#DC2626',
  cron_daily_7am:'#7C3AED',cron_task_overdue:'#E8650A',
}

export function Automations() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const [automations, setAutomations] = useState([])
  const [loading, setLoading]         = useState(true)
  const [synced, setSynced]           = useState(false)

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const data = await getAutomations()
        if (data.length === 0) {
          // First time: seed presets to DB
          const seeded = []
          for (const p of PRESETS) {
            const d = await upsertAutomation({ ...p, created_by: agent?.id })
            seeded.push(d)
          }
          setAutomations(seeded)
          setSynced(true)
        } else {
          setAutomations(data)
          setSynced(true)
        }
      } catch(e) {
        // Fall back to presets in memory if DB not ready
        setAutomations(PRESETS)
        toast('Note: DB not connected yet. Run SQL migrations first.', '#D97706')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function toggleActive(id, currentActive) {
    try {
      const newActive = !currentActive
      if (synced) {
        const d = await updateAutomation(id, { active: newActive })
        setAutomations(prev => prev.map(a => a.id === id ? d : a))
      } else {
        setAutomations(prev => prev.map(a => a.id === id ? {...a, active: newActive} : a))
      }
      toast(newActive ? '✅ Automation activated' : 'Automation paused')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this automation?')) return
    try {
      if (synced) await deleteAutomation(id)
      setAutomations(prev => prev.filter(a => a.id !== id))
      toast('Automation deleted')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  const active   = automations.filter(a => a.active)
  const inactive = automations.filter(a => !a.active)

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>⚡ Automations</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>
            {active.length} active · {inactive.length} paused · fires via Postgres triggers
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'14px' }}>
        {[
          ['Active',active.length,'#16A34A'],
          ['Paused',inactive.length,'#94A3B8'],
          ['Total',automations.length,'#CC2200'],
        ].map(([k,v,c])=>(
          <div key={k} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px' }}>
            <div style={{ fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }}>{k}</div>
            <div style={{ fontSize:'20px',fontWeight:900,color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      {automations.map(auto=>{
        const tc = TRIGGER_COLORS[auto.trigger_type]||'#94A3B8'
        const actions = auto.action_nodes||[]
        return (
          <div key={auto.id} style={{ background:'var(--panel)',border:`1px solid var(--border)`,borderLeft:`4px solid ${tc}`,borderRadius:'12px',padding:'16px',marginBottom:'10px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px',flexWrap:'wrap' }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'5px' }}>
                  <span style={{ fontSize:'14px',fontWeight:800 }}>{auto.name}</span>
                  {!auto.active&&<span style={{ fontSize:'10px',fontWeight:700,background:'#FEF3C7',color:'#D97706',border:'1px solid #FDE68A',borderRadius:'20px',padding:'1px 8px' }}>Paused</span>}
                </div>
                <div style={{ fontSize:'12px',color:'var(--muted)',marginBottom:'10px' }}>{auto.description}</div>
                {/* Trigger */}
                <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
                  <span style={{ fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'20px',background:tc+'15',color:tc,border:`1px solid ${tc}30` }}>
                    {TRIGGER_LABELS[auto.trigger_type]||auto.trigger_type}
                  </span>
                  <span style={{ color:'var(--muted)',fontSize:'12px' }}>→</span>
                  {actions.map((a,i)=>(
                    <span key={i} style={{ fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'20px',background:'rgba(22,163,74,.08)',color:'#16A34A',border:'1px solid rgba(22,163,74,.2)' }}>
                      {ACTION_LABELS[a.type]||a.type}
                    </span>
                  ))}
                </div>
                {auto.fire_count>0&&<div style={{ fontSize:'10px',color:'var(--muted)',marginTop:'7px' }}>Fired {auto.fire_count} times{auto.last_fired&&` · Last: ${new Date(auto.last_fired).toLocaleDateString()}`}</div>}
              </div>
              <div style={{ display:'flex',gap:'8px',alignItems:'center',flexShrink:0 }}>
                {isAdmin&&<button onClick={()=>handleDelete(auto.id)}
                  style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px',opacity:.4 }}
                  onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>🗑</button>}
                {/* Toggle */}
                <div onClick={()=>toggleActive(auto.id, auto.active)}
                  style={{ width:44,height:24,borderRadius:'99px',background:auto.active?'#10B981':'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0 }}>
                  <div style={{ width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:auto.active?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}/>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {!loading&&automations.length===0&&(
        <div style={{ padding:'40px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}>
          <div style={{ fontSize:'32px',marginBottom:'12px' }}>⚡</div>
          <div style={{ fontWeight:700 }}>No automations yet</div>
          <div style={{ fontSize:'12px',marginTop:'6px' }}>Run the SQL migrations to activate preset automations</div>
        </div>
      )}

      {/* Note about how it works */}
      <div style={{ marginTop:'16px',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px 16px',fontSize:'12px',color:'var(--muted)',lineHeight:1.7 }}>
        <strong style={{ color:'var(--text)' }}>How automations work:</strong> These fire via Postgres triggers in your Supabase database.
        When you change a deal stage, add a contact, or close a listing — the DB trigger fires the automation-engine Edge Function automatically.
        No polling. No missed fires. Every action is logged in the Audit Log.
      </div>
    </div>
  )
}
