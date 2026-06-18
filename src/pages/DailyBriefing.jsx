import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { AGENTS } from '../lib/constants'
import { Card, CardHeader, Btn, Grid2 } from '../components/UI'
import { buildDailyEmail, AGENT_EMAILS } from '../lib/dailyBriefing'
import { sendDailyBriefing } from '../lib/emailService'

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
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// Per-agent email preferences
const DEFAULT_AGENT_PREFS = {
  enabled: true,
  sections: {
    gciProgress:    true,
    todayTasks:     true,
    overdueTasks:   true,
    appointments:   true,
    quote:          true,
    teamAnnouncements: false,
    pipelineSnapshot: false,
  }
}

export function DailyBriefing() {
  const { state, toast } = useApp()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewAgent, setPreviewAgent] = useState('Yanky Lichtenstein')
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState('')
  const [lastSent, setLastSent] = useState({})
  const [apiStatus, setApiStatus] = useState(null) // null | 'ok' | 'error'

  // Schedule settings
  const [schedule, setSchedule] = useState({
    time: '07:00',
    days: ['Mon','Tue','Wed','Thu','Fri'],
  })

  // Per-agent preferences
  const [agentPrefs, setAgentPrefs] = useState(() => {
    const prefs = {}
    Object.keys(AGENT_EMAILS).forEach(name => { prefs[name] = {...DEFAULT_AGENT_PREFS, sections:{...DEFAULT_AGENT_PREFS.sections}} })
    return prefs
  })

  const [selectedAgent, setSelectedAgent] = useState(null)

  useEffect(() => {
    supabase.from('tasks').select('*').eq('status','pending').then(({data}) => {
      setTasks(data||[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const agentTasks = tasks.filter(t => t.due_date === today)
    const overdueT = tasks.filter(t => t.due_date && t.due_date < today)
    const prefs = agentPrefs[previewAgent] || DEFAULT_AGENT_PREFS
    const html = buildDailyEmail({
      agentName: previewAgent,
      tasks: prefs.sections.todayTasks ? agentTasks.slice(0,5) : [],
      overdueTasks: prefs.sections.overdueTasks ? overdueT.slice(0,3) : [],
      appointments: prefs.sections.appointments ? [{ title:'Team Meeting — Monday 9AM', time:'9:00 AM', location:'Zoom' }].filter(()=>new Date().getDay()===1) : [],
      agentColor: AGENT_COLORS[previewAgent] || '#CC2200',
      showGCI: prefs.sections.gciProgress,
      showQuote: prefs.sections.quote,
    })
    setPreviewHtml(html)
  }, [previewAgent, tasks, agentPrefs])

  // Check API key status
  async function checkApiConnection() {
    const key = import.meta.env.VITE_RESEND_API_KEY
    if(!key) {
      setApiStatus('error')
      return
    }
    // Key exists — try sending a real test
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'TargetOS <office@targetreteam.com>',
          to: ['yanky@targetreteam.com'],
          subject: '✅ TargetOS Connection Test',
          html: '<p>Resend is connected and working! Your daily briefing emails are ready to send.</p>'
        })
      })
      const data = await res.json()
      if(res.ok) {
        setApiStatus('ok')
        toast('✅ Test email sent to yanky@targetreteam.com!')
      } else {
        console.error('Resend error:', data)
        setApiStatus('error')
      }
    } catch(e) {
      setApiStatus('error')
    }
  }

  async function sendTest(agentName) {
    const email = AGENT_EMAILS[agentName]
    if(!email) { toast('No email for '+agentName,'#DC2626'); return }
    setSending(agentName)
    const today = new Date().toISOString().split('T')[0]
    const agentTasks = tasks.filter(t=>t.due_date===today)
    const overdueT = tasks.filter(t=>t.due_date&&t.due_date<today)
    const prefs = agentPrefs[agentName] || DEFAULT_AGENT_PREFS
    const html = buildDailyEmail({
      agentName, agentColor: AGENT_COLORS[agentName]||'#CC2200',
      tasks: prefs.sections.todayTasks ? agentTasks : [],
      overdueTasks: prefs.sections.overdueTasks ? overdueT : [],
      appointments: [],
      showGCI: prefs.sections.gciProgress,
      showQuote: prefs.sections.quote,
    })
    const result = await sendDailyBriefing({ agentName, email, html })
    setSending('')
    if(result.success) {
      setLastSent(p=>({...p,[agentName]:new Date().toLocaleTimeString()}))
      toast(`✅ Email sent to ${email}!`)
    } else {
      toast('Send failed: '+(result.error||'Check API key in Vercel'),'#DC2626')
    }
  }

  async function sendAll() {
    setSending('all')
    const today = new Date().toISOString().split('T')[0]
    let sent=0, failed=0
    for(const [agentName,email] of Object.entries(AGENT_EMAILS)) {
      const prefs = agentPrefs[agentName] || DEFAULT_AGENT_PREFS
      if(!prefs.enabled) continue
      const html = buildDailyEmail({
        agentName, agentColor:AGENT_COLORS[agentName]||'#CC2200',
        tasks: prefs.sections.todayTasks ? tasks.filter(t=>t.due_date===today) : [],
        overdueTasks: prefs.sections.overdueTasks ? tasks.filter(t=>t.due_date&&t.due_date<today) : [],
        appointments: [],
        showGCI: prefs.sections.gciProgress,
        showQuote: prefs.sections.quote,
      })
      const r = await sendDailyBriefing({agentName,email,html})
      if(r.success) sent++; else failed++
      await new Promise(res=>setTimeout(res,200))
    }
    setSending('')
    toast(`✅ Sent ${sent}${failed>0?' · '+failed+' failed':''}`)
  }

  function setAgentPref(agent, key, val) {
    setAgentPrefs(prev=>({...prev,[agent]:{...prev[agent],[key]:val}}))
  }
  function setAgentSection(agent, section, val) {
    setAgentPrefs(prev=>({...prev,[agent]:{...prev[agent],sections:{...prev[agent].sections,[section]:val}}}))
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const todayTasks = tasks.filter(t=>t.due_date===todayStr)
  const overdueTasks = tasks.filter(t=>t.due_date&&t.due_date<todayStr)
  const enabledCount = Object.values(agentPrefs).filter(p=>p.enabled).length

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>📧 Daily Briefing Emails</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>Personalized morning emails sent to each agent every day</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>setShowPreview(true)}>👁 Preview</Btn>
          <Btn size="sm" onClick={sendAll} disabled={sending==='all'}>{sending==='all'?'Sending…':'📤 Send All Now'}</Btn>
        </div>
      </div>

      {/* API Status banner */}
      <div style={{background:apiStatus==='ok'?'rgba(22,163,74,.08)':apiStatus==='error'?'#FEF2F2':'rgba(245,158,11,.08)',border:'1px solid '+(apiStatus==='ok'?'rgba(22,163,74,.25)':apiStatus==='error'?'#FECACA':'rgba(245,158,11,.3)'),borderRadius:'12px',padding:'14px 16px',marginBottom:'16px'}}>
        {!apiStatus && (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700,color:'#D97706'}}>⚠️ Verify Resend API Connection</div>
              <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'3px'}}>Make sure the API key is set in Vercel before sending</div>
            </div>
            <Btn size="sm" variant="ghost" onClick={checkApiConnection}>Test Connection</Btn>
          </div>
        )}
        {apiStatus==='ok' && <div style={{fontSize:'13px',fontWeight:700,color:'#16A34A'}}>✅ Resend API connected — emails will send from office@targetreteam.com</div>}
        {apiStatus==='error' && (
          <div>
            <div style={{fontSize:'13px',fontWeight:700,color:'#DC2626',marginBottom:'8px'}}>❌ API Key Not Found in this deployment</div>
            <ol style={{margin:0,paddingLeft:'18px',fontSize:'12px',color:'#DC2626',lineHeight:2}}>
              <li>Go to <strong>vercel.com/dashboard</strong> → click <strong>targetos</strong></li>
              <li>Click <strong>Settings</strong> → <strong>Environment Variables</strong></li>
              <li>Click <strong>Add New</strong></li>
              <li>Name: <code style={{background:'#FEE2E2',padding:'1px 5px',borderRadius:'4px'}}>VITE_RESEND_API_KEY</code></li>
              <li>Value: your Resend API key (starts with <code style={{background:'#FEE2E2',padding:'1px 5px',borderRadius:'4px'}}>re_</code>)</li>
              <li>Check <strong>Production</strong>, <strong>Preview</strong>, <strong>Development</strong></li>
              <li>Click <strong>Save</strong></li>
              <li>Go to <strong>Deployments</strong> → click <strong>...</strong> → <strong>Redeploy</strong></li>
            </ol>
            <div style={{marginTop:'10px',fontSize:'12px',color:'#B91C1C',fontWeight:600}}>After redeploying, refresh this page and click "Test Connection" again.</div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Total Agents', Object.keys(AGENT_EMAILS).length, '#CC2200'],
          ['Receiving', enabledCount, '#16A34A'],
          ["Today's Tasks", loading?'…':todayTasks.length, '#D97706'],
          ['Overdue', loading?'…':overdueTasks.length, overdueTasks.length>0?'#DC2626':'#16A34A'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <Grid2 gap={14}>
        {/* Schedule */}
        <Card>
          <CardHeader>⏰ Send Schedule</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{marginBottom:'14px'}}>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>Send Time (Eastern)</label>
              <input type="time" value={schedule.time} onChange={e=>setSchedule(s=>({...s,time:e.target.value}))}
                style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'16px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'9px 13px',outline:'none'}}/>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'5px'}}>⚠️ Auto-schedule requires a cron job — use "Send All Now" until Twilio/cron is connected</div>
            </div>
            <div>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>Send On</label>
              <div style={{display:'flex',gap:'6px'}}>
                {DAYS.map(d=>(
                  <div key={d} onClick={()=>setSchedule(s=>({...s,days:s.days.includes(d)?s.days.filter(x=>x!==d):[...s.days,d]}))}
                    style={{width:36,height:36,borderRadius:'50%',border:'1.5px solid '+(schedule.days.includes(d)?'#CC2200':'var(--border)'),background:schedule.days.includes(d)?'rgba(204,34,0,.1)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'11px',fontWeight:700,color:schedule.days.includes(d)?'#CC2200':'var(--muted)'}}>
                    {d[0]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Global sections */}
        <Card>
          <CardHeader>📋 Default Email Sections</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'12px'}}>These are the defaults — you can customize per agent below</div>
            {[
              ['gciProgress',       '📈 GCI Progress Bar'],
              ['todayTasks',        '✓ Today\'s Tasks'],
              ['overdueTasks',      '⚠️ Overdue Tasks'],
              ['appointments',      '📅 Appointments'],
              ['quote',             '💬 Motivational Quote'],
              ['teamAnnouncements', '📣 Team Announcements'],
              ['pipelineSnapshot',  '📊 Pipeline Snapshot'],
            ].map(([key,label])=>{
              // Check if all agents have this section enabled
              const allEnabled = Object.values(agentPrefs).every(p=>p.sections[key])
              const someEnabled = Object.values(agentPrefs).some(p=>p.sections[key])
              return (
                <div key={key} onClick={()=>{
                  // Toggle all agents
                  const newVal = !allEnabled
                  setAgentPrefs(prev=>{
                    const updated = {...prev}
                    Object.keys(updated).forEach(a=>{ updated[a]={...updated[a],sections:{...updated[a].sections,[key]:newVal}} })
                    return updated
                  })
                }} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}}>
                  <span style={{fontSize:'13px'}}>{label}</span>
                  <div style={{width:38,height:20,borderRadius:'99px',background:allEnabled?'#10B981':someEnabled?'#D97706':'var(--border)',position:'relative',transition:'background .2s',flexShrink:0}}>
                    <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:allEnabled?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </Grid2>

      {/* Per-agent settings */}
      <Card style={{marginTop:'14px'}}>
        <CardHeader>👥 Agent Settings — Click any agent to customize</CardHeader>
        <div>
          {Object.entries(AGENT_EMAILS).map(([name, email]) => {
            const prefs = agentPrefs[name] || DEFAULT_AGENT_PREFS
            const color = AGENT_COLORS[name] || '#CC2200'
            const gci = AGENT_GCI[name] || {gci:0,goal:100000}
            const pct = Math.min(Math.round(gci.gci/gci.goal*100),100)
            const isOpen = selectedAgent === name
            const agent = AGENTS.find(a=>a.name===name)

            return (
              <div key={name} style={{borderBottom:'1px solid var(--border)'}}>
                {/* Agent row */}
                <div onClick={()=>setSelectedAgent(isOpen?null:name)}
                  style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',cursor:'pointer',background:isOpen?'rgba(204,34,0,.03)':'transparent'}}
                  onMouseEnter={e=>!isOpen&&(e.currentTarget.style.background='var(--hov)')} onMouseLeave={e=>!isOpen&&(e.currentTarget.style.background='transparent')}>

                  {/* Avatar */}
                  <div style={{width:40,height:40,borderRadius:'10px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:800,color:'#fff',flexShrink:0}}>
                    {name.charAt(0)}
                  </div>

                  {/* Info */}
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'2px'}}>
                      <span style={{fontSize:'13px',fontWeight:700}}>{name}</span>
                      {!prefs.enabled && <span style={{fontSize:'10px',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:'20px',padding:'1px 8px',fontWeight:600}}>Paused</span>}
                      {lastSent[name] && <span style={{fontSize:'10px',color:'#16A34A',fontWeight:600}}>✓ Sent {lastSent[name]}</span>}
                    </div>
                    <div style={{fontSize:'11px',color:'var(--muted)'}}>{email}</div>
                  </div>

                  {/* GCI mini bar */}
                  <div style={{textAlign:'right',minWidth:'80px'}}>
                    <div style={{fontSize:'11px',fontWeight:700,color,marginBottom:'3px'}}>{pct}%</div>
                    <div style={{background:'var(--dim)',borderRadius:'99px',height:4,overflow:'hidden',width:'70px'}}>
                      <div style={{background:color,borderRadius:'99px',height:4,width:pct+'%'}}/>
                    </div>
                  </div>

                  {/* Enabled toggle */}
                  <div onClick={e=>{e.stopPropagation();setAgentPref(name,'enabled',!prefs.enabled)}}
                    style={{width:40,height:22,borderRadius:'99px',background:prefs.enabled?'#10B981':'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                    <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:prefs.enabled?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                  </div>

                  {/* Actions */}
                  <div style={{display:'flex',gap:'6px'}} onClick={e=>e.stopPropagation()}>
                    <Btn size="xs" variant="ghost" onClick={()=>{setPreviewAgent(name);setShowPreview(true)}}>👁</Btn>
                    <Btn size="xs" onClick={()=>sendTest(name)} disabled={!!sending}>{sending===name?'…':'Send'}</Btn>
                  </div>

                  <span style={{color:'var(--muted)',fontSize:'12px'}}>{isOpen?'▲':'▼'}</span>
                </div>

                {/* Expanded per-agent settings */}
                {isOpen && (
                  <div style={{background:'var(--dim)',padding:'14px 16px 16px',borderTop:'1px solid var(--border)'}}>
                    <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Email Sections for {name.split(' ')[0]}</div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'6px'}}>
                      {[
                        ['gciProgress',       '📈 GCI Progress Bar'],
                        ['todayTasks',        '✓ Today\'s Tasks'],
                        ['overdueTasks',      '⚠️ Overdue Tasks'],
                        ['appointments',      '📅 Appointments'],
                        ['quote',             '💬 Motivational Quote'],
                        ['teamAnnouncements', '📣 Team Announcements'],
                        ['pipelineSnapshot',  '📊 Pipeline Snapshot'],
                      ].map(([key,label])=>(
                        <div key={key} onClick={()=>setAgentSection(name,key,!prefs.sections[key])}
                          style={{display:'flex',alignItems:'center',gap:'9px',padding:'9px 11px',borderRadius:'9px',border:'1.5px solid '+(prefs.sections[key]?color:'var(--border)'),background:prefs.sections[key]?color+'08':'transparent',cursor:'pointer',transition:'all .12s'}}>
                          <div style={{width:32,height:18,borderRadius:'99px',background:prefs.sections[key]?color:'var(--border)',position:'relative',flexShrink:0,transition:'background .2s'}}>
                            <div style={{width:14,height:14,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:prefs.sections[key]?16:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                          </div>
                          <span style={{fontSize:'11px',fontWeight:600,color:prefs.sections[key]?'var(--text)':'var(--muted)'}}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Preview modal */}
      {showPreview && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowPreview(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'18px',width:'100%',maxWidth:'660px',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:800}}>Email Preview</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Showing: {previewAgent}</div>
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <select value={previewAgent} onChange={e=>setPreviewAgent(e.target.value)}
                  style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none'}}>
                  {Object.keys(AGENT_EMAILS).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={()=>setShowPreview(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1}}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              <iframe srcDoc={previewHtml} style={{width:'100%',height:'600px',border:'none',display:'block'}} title="Email Preview"/>
            </div>
            <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:'8px',justifyContent:'flex-end'}}>
              <Btn variant="ghost" onClick={()=>setShowPreview(false)}>Close</Btn>
              <Btn onClick={()=>{sendTest(previewAgent);setShowPreview(false)}} disabled={!!sending}>
                {sending===previewAgent?'Sending…':'Send Test to '+previewAgent.split(' ')[0]}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
