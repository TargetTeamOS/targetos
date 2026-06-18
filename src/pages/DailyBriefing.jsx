import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { AGENTS } from '../lib/constants'
import { Card, CardHeader, Btn, Grid2 } from '../components/UI'
import { buildDailyEmail, AGENT_EMAILS } from '../lib/dailyBriefing'
import { sendDailyBriefing, sendTestEmail as sendTest } from '../lib/emailService'

const AGENT_COLORS = {
  'Lazer Farkas':'#CC2200','Mendy Jankovits':'#0EA5E9','Isaac Leibowitz':'#F5A623',
  'Yanky Lichtenstein':'#10B981','Gitty Fogel':'#7C3AED','Joel Rottenstein':'#E8650A',
  'Eli Hoffman':'#14B8A6','Avraham Weinberger':'#8B5CF6'
}

const AGENT_GCI = {
  'Lazer Farkas':       { gci: 77440,  goal: 200000 },
  'Mendy Jankovits':    { gci: 34000,  goal: 150000 },
  'Isaac Leibowitz':    { gci: 46090,  goal: 180000 },
  'Yanky Lichtenstein': { gci: 0,      goal: 100000 },
  'Gitty Fogel':        { gci: 0,      goal: 80000  },
  'Joel Rottenstein':   { gci: 39750,  goal: 120000 },
  'Eli Hoffman':        { gci: 146735, goal: 90000  },
  'Avraham Weinberger': { gci: 24000,  goal: 160000 },
}

const fmt$ = n => '$' + Number(n).toLocaleString()

export function DailyBriefing() {
  const { state, toast } = useApp()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewAgent, setPreviewAgent] = useState('Yanky Lichtenstein')
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [schedule, setSchedule] = useState({ enabled: true, time: '07:00', days: ['Mon','Tue','Wed','Thu','Fri'] })
  const [lastSent, setLastSent] = useState(null)
  const [settings, setSettings] = useState({
    includeTasks: true,
    includeOverdue: true,
    includeAppointments: true,
    includeProgress: true,
    includeQuote: true,
    replyTo: 'yanky@targetreteam.com',
    fromName: 'Target Team',
  })

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  useEffect(() => {
    supabase.from('tasks').select('*').eq('status','pending').then(({data}) => {
      setTasks(data||[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const agentTasks = tasks.filter(t => t.due_date === today)
    const overdue = tasks.filter(t => t.due_date && t.due_date < today)
    const html = buildDailyEmail({
      agentName: previewAgent,
      tasks: agentTasks.slice(0,5),
      overdueTasks: overdue.slice(0,3),
      appointments: [
        { title:'Team Meeting — Monday 9AM', time:'9:00 AM', location:'Zoom' },
      ].filter(() => new Date().getDay() === 1),
      agentColor: AGENT_COLORS[previewAgent] || '#CC2200',
    })
    setPreviewHtml(html)
  }, [previewAgent, tasks])

  async function sendTestEmail(agentName) {
    setSending(true)
    const email = AGENT_EMAILS[agentName]
    if(!email) { toast('No email for ' + agentName, '#DC2626'); setSending(false); return }
    // Build the HTML for this agent
    const today = new Date().toISOString().split('T')[0]
    const agentTasks = tasks.filter(t => t.due_date === today)
    const overdueT = tasks.filter(t => t.due_date && t.due_date < today)
    const html = buildDailyEmail({
      agentName, tasks: agentTasks, overdueTasks: overdueT, appointments: [],
      agentColor: AGENT_COLORS[agentName] || '#CC2200',
    })
    const result = await sendDailyBriefing({ agentName, email, html })
    setSending(false)
    if(result.success) {
      toast(`✅ Email sent to ${email}!`)
      setLastSent(new Date().toLocaleString())
    } else {
      toast('Send failed: ' + result.error, '#DC2626')
    }
  }

  async function sendAllNow() {
    setSending(true)
    const today = new Date().toISOString().split('T')[0]
    const agents = Object.entries(AGENT_EMAILS)
    let sent = 0, failed = 0
    for(const [agentName, email] of agents) {
      const agentTasks = tasks.filter(t => t.due_date === today)
      const overdueT = tasks.filter(t => t.due_date && t.due_date < today)
      const html = buildDailyEmail({
        agentName, tasks: agentTasks, overdueTasks: overdueT, appointments: [],
        agentColor: AGENT_COLORS[agentName] || '#CC2200',
      })
      const result = await sendDailyBriefing({ agentName, email, html })
      if(result.success) sent++; else failed++
      await new Promise(r => setTimeout(r, 300)) // rate limit buffer
    }
    setSending(false)
    setLastSent(new Date().toLocaleString())
    toast(`✅ Sent ${sent} emails${failed>0?' · '+failed+' failed':''}!`)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const todayTasks = tasks.filter(t => t.due_date === todayStr)
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < todayStr)

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>📧 Daily Briefing Emails</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>Personalized morning emails sent automatically to each agent every day</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>setShowPreview(true)}>👁 Preview Email</Btn>
          <Btn size="sm" onClick={sendAllNow} disabled={sending}>{sending?'Sending…':'📤 Send All Now'}</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Agents', Object.keys(AGENT_EMAILS).length, '#CC2200'],
          ["Today's Tasks", todayTasks.length, '#D97706'],
          ['Overdue', overdueTasks.length, overdueTasks.length>0?'#DC2626':'#16A34A'],
          ['Last Sent', lastSent ? 'Today' : 'Never', lastSent?'#16A34A':'#94A3B8'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <Grid2 gap={14}>
        {/* Schedule Settings */}
        <Card>
          <CardHeader>⏰ Schedule</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
              <div onClick={()=>setSchedule(s=>({...s,enabled:!s.enabled}))} style={{width:44,height:24,borderRadius:'99px',background:schedule.enabled?'#10B981':'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s'}}>
                <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:schedule.enabled?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
              </div>
              <span style={{fontSize:'13px',fontWeight:700,color:schedule.enabled?'#10B981':'var(--muted)'}}>{schedule.enabled?'Enabled — sending daily':'Paused'}</span>
            </div>

            <div style={{marginBottom:'14px'}}>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>Send Time (Eastern)</label>
              <input type="time" value={schedule.time} onChange={e=>setSchedule(s=>({...s,time:e.target.value}))}
                style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'14px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'9px 13px',outline:'none'}}/>
            </div>

            <div>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>Send On</label>
              <div style={{display:'flex',gap:'5px'}}>
                {DAYS.map(d=>(
                  <div key={d} onClick={()=>setSchedule(s=>({...s,days:s.days.includes(d)?s.days.filter(x=>x!==d):[...s.days,d]}))}
                    style={{width:36,height:36,borderRadius:'50%',border:'1.5px solid '+(schedule.days.includes(d)?'#CC2200':'var(--border)'),background:schedule.days.includes(d)?'rgba(204,34,0,.1)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'11px',fontWeight:700,color:schedule.days.includes(d)?'#CC2200':'var(--muted)',transition:'all .12s'}}>
                    {d[0]}
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginTop:'14px',background:'var(--dim)',borderRadius:'10px',padding:'12px',fontSize:'12px',color:'var(--muted)',lineHeight:1.7}}>
              📧 Emails will send at <strong style={{color:'var(--text)'}}>{schedule.time} ET</strong> on <strong style={{color:'var(--text)'}}>{schedule.days.join(', ')}</strong>
              <br/>
              <span style={{fontSize:'11px'}}>⚠️ Connect Resend API in Settings → Integrations to activate real sending</span>
            </div>
          </div>
        </Card>

        {/* Email Settings */}
        <Card>
          <CardHeader>⚙️ Email Settings</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{marginBottom:'12px'}}>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>From Name</label>
              <input value={settings.fromName} onChange={e=>setSettings(s=>({...s,fromName:e.target.value}))}
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none',boxSizing:'border-box'}}/>
            </div>
            <div style={{marginBottom:'14px'}}>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Reply-To Email</label>
              <input value={settings.replyTo} onChange={e=>setSettings(s=>({...s,replyTo:e.target.value}))} type="email"
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none',boxSizing:'border-box'}}/>
            </div>

            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Include in Email</div>
            {[
              ['includeTasks',       "Today's tasks"],
              ['includeOverdue',     'Overdue tasks'],
              ['includeAppointments','Appointments'],
              ['includeProgress',    'GCI progress bar'],
              ['includeQuote',       'Motivational quote'],
            ].map(([key, label]) => (
              <div key={key} onClick={()=>setSettings(s=>({...s,[key]:!s[key]}))}
                style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
                <span style={{fontSize:'13px'}}>{label}</span>
                <div style={{width:36,height:20,borderRadius:'99px',background:settings[key]?'#10B981':'var(--border)',position:'relative',transition:'background .2s',flexShrink:0}}>
                  <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:settings[key]?18:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Grid2>

      {/* Agent list */}
      <Card style={{marginTop:'14px'}}>
        <CardHeader>👥 Agent Emails — {Object.keys(AGENT_EMAILS).length} Recipients</CardHeader>
        {Object.entries(AGENT_EMAILS).map(([name, email]) => {
          const agentTasks = tasks.filter(t => t.due_date === todayStr)
          const gci = AGENT_GCI[name] || { gci:0, goal:100000 }
          const pct = Math.min(Math.round(gci.gci/gci.goal*100),100)
          const color = AGENT_COLORS[name]||'#CC2200'
          return (
            <div key={name} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:38,height:38,borderRadius:'10px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:800,color:'#fff',flexShrink:0}}>
                {name.charAt(0)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:700}}>{name}</div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{email}</div>
              </div>
              <div style={{textAlign:'right',minWidth:'100px'}}>
                <div style={{fontSize:'11px',fontWeight:700,color:color,marginBottom:'3px'}}>{fmt$(gci.gci)} · {pct}%</div>
                <div style={{background:'var(--dim)',borderRadius:'99px',height:4,overflow:'hidden',width:'80px'}}>
                  <div style={{background:color,borderRadius:'99px',height:4,width:pct+'%'}}/>
                </div>
              </div>
              <Btn size="xs" variant="ghost" onClick={()=>{setPreviewAgent(name);setShowPreview(true)}}>Preview</Btn>
              <Btn size="xs" onClick={()=>sendTestEmail(name)} disabled={sending}>Send Test</Btn>
            </div>
          )
        })}
      </Card>

      {/* Preview Modal */}
      {showPreview && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowPreview(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'18px',width:'100%',maxWidth:'660px',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:800}}>Email Preview</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>As seen by: {previewAgent}</div>
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <select value={previewAgent} onChange={e=>setPreviewAgent(e.target.value)}
                  style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none'}}>
                  {Object.keys(AGENT_EMAILS).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={()=>setShowPreview(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1}}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto',padding:'0'}}>
              <iframe
                srcDoc={previewHtml}
                style={{width:'100%',height:'600px',border:'none',display:'block'}}
                title="Email Preview"
              />
            </div>
            <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:'8px',justifyContent:'flex-end'}}>
              <Btn variant="ghost" onClick={()=>setShowPreview(false)}>Close</Btn>
              <Btn onClick={()=>sendTestEmail(previewAgent)} disabled={sending}>{sending?'Sending…':'Send Test to '+previewAgent.split(' ')[0]}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
