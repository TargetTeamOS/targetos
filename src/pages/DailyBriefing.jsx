import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn, Grid2 } from '../components/UI'
import { buildDailyEmail, AGENT_EMAILS } from '../lib/dailyBriefing'
import { sendDailyBriefing } from '../lib/emailService'
import { saveBriefingPrefs, loadBriefingPrefs } from '../lib/briefingPrefs'

const AGENT_COLORS = {
  'Lazer Farkas':'#CC2200','Mendy Jankovits':'#0EA5E9','Isaac Leibowitz':'#F5A623',
  'Yanky Lichtenstein':'#10B981','Gitty Fogel':'#7C3AED','Joel Rottenstein':'#E8650A',
  'Eli Hoffman':'#14B8A6','Avraham Weinberger':'#8B5CF6'
}

const AGENT_GCI = {
  'Lazer Farkas':{gci:77440,goal:200000},
  'Mendy Jankovits':{gci:34000,goal:150000},
  'Isaac Leibowitz':{gci:46090,goal:180000},
  'Yanky Lichtenstein':{gci:0,goal:100000},
  'Gitty Fogel':{gci:0,goal:80000},
  'Joel Rottenstein':{gci:39750,goal:120000},
  'Eli Hoffman':{gci:146735,goal:90000},
  'Avraham Weinberger':{gci:24000,goal:160000},
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const fmt$ = n => '$' + Number(n||0).toLocaleString()

// All available email sections with labels
const ALL_SECTIONS = [
  { key:'greeting',      label:'👋 Greeting & Date',       required:true  },
  { key:'summary',       label:'📊 Day Summary Line',      required:true  },
  { key:'overdueTasks',  label:'⚠️ Overdue Tasks',         required:false },
  { key:'appointments',  label:'📅 Appointments',          required:false },
  { key:'todayTasks',    label:'✓ Today\'s Tasks',         required:false },
  { key:'allClear',      label:'✅ All Clear Banner',      required:false },
  { key:'quote',         label:'💬 Daily Quote',           required:false },
  { key:'quickLinks',    label:'🔗 Quick Links Footer',    required:true  },
]

// KW / Gary Keller quotes
const DEFAULT_QUOTES = [
  { text:"Your next deal is one conversation away.", author:"Target Team", category:"motivation" },
  { text:"Every call you make is a door you open.", author:"Target Team", category:"motivation" },
  { text:"Consistency builds empires. Show up every day.", author:"Target Team", category:"motivation" },
  { text:"In real estate, relationships are your inventory.", author:"Target Team", category:"real estate" },
  { text:"A real estate agent's most powerful asset is their follow-up.", author:"Target Team", category:"real estate" },
  { text:"Your mindset determines your market.", author:"Gary Keller", category:"kw" },
  { text:"No one succeeds alone. Never have, never will.", author:"Gary Keller", category:"kw" },
  { text:"Time on dollar — focus only on what moves you toward your goals.", author:"Gary Keller", category:"kw" },
  { text:"The ONE Thing you can do such that by doing it everything else will be easier or unnecessary.", author:"Gary Keller", category:"kw" },
  { text:"Leverage is the ability to do more work with the same amount of energy.", author:"Gary Keller", category:"kw" },
  { text:"Your job is to list and sell. Everything else is a distraction.", author:"Gary Keller", category:"kw" },
  { text:"Lead generation is the lifeblood of your business.", author:"Gary Keller", category:"kw" },
  { text:"Knowledge is only potential power — it becomes power when you act on it.", author:"Gary Keller", category:"kw" },
  { text:"Success is actually a short race — a sprint fueled by discipline.", author:"Gary Keller", category:"kw" },
  { text:"The secret of getting ahead is getting started.", author:"Mark Twain", category:"general" },
  { text:"Push yourself, because no one else is going to do it for you.", author:"Unknown", category:"general" },
  { text:"Wake up with determination. Go to bed with satisfaction.", author:"Unknown", category:"general" },
  { text:"Do something today that your future self will thank you for.", author:"Unknown", category:"general" },
  { text:"Sometimes later becomes never. Do it now.", author:"Unknown", category:"general" },
  { text:"Discipline is choosing between what you want now and what you want most.", author:"Unknown", category:"general" },
]

const DEFAULT_AGENT_PREFS = {
  enabled: true,
  sectionOrder: ALL_SECTIONS.map(s => s.key),
  sections: {
    greeting:true, summary:true, overdueTasks:true,
    appointments:true, todayTasks:true, allClear:true,
    quote:true, quickLinks:true,
  }
}

export function DailyBriefing() {
  const { state, toast } = useApp()
  const [tasks, setTasks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [agentPrefs, setAgentPrefs]   = useState({})
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewAgent, setPreviewAgent] = useState('Yanky Lichtenstein')
  const [previewHtml, setPreviewHtml] = useState('')
  const [sending, setSending]         = useState('')
  const [lastSent, setLastSent]       = useState({})
  const [schedule, setSchedule]       = useState({ time:'07:00', days:['Mon','Tue','Wed','Thu','Fri'] })
  const [quotes, setQuotes]           = useState(DEFAULT_QUOTES)
  const [showQuoteManager, setShowQuoteManager] = useState(false)
  const [newQuote, setNewQuote]       = useState({ text:'', author:'', category:'motivation' })
  const [quoteFilter, setQuoteFilter] = useState('all')
  const [dragOver, setDragOver]       = useState(null)
  const saveTimeout = useRef(null)

  // Load prefs from DB on mount
  useEffect(() => {
    async function init() {
      setPrefsLoading(true)
      const saved = await loadBriefingPrefs()
      if(saved) {
        // Merge with defaults to ensure new agents/sections are included
        const merged = {}
        Object.keys(AGENT_EMAILS).forEach(name => {
          merged[name] = saved[name]
            ? {
                ...DEFAULT_AGENT_PREFS,
                ...saved[name],
                sections: { ...DEFAULT_AGENT_PREFS.sections, ...(saved[name].sections||{}) },
                sectionOrder: saved[name].sectionOrder || DEFAULT_AGENT_PREFS.sectionOrder,
              }
            : { ...DEFAULT_AGENT_PREFS, sections:{...DEFAULT_AGENT_PREFS.sections}, sectionOrder:[...DEFAULT_AGENT_PREFS.sectionOrder] }
        })
        setAgentPrefs(merged)
      } else {
        const defaults = {}
        Object.keys(AGENT_EMAILS).forEach(name => {
          defaults[name] = { ...DEFAULT_AGENT_PREFS, sections:{...DEFAULT_AGENT_PREFS.sections}, sectionOrder:[...DEFAULT_AGENT_PREFS.sectionOrder] }
        })
        setAgentPrefs(defaults)
      }
      setPrefsLoading(false)
    }
    init()
    supabase.from('tasks').select('*').eq('status','pending').then(({data}) => {
      setTasks(data||[]); setLoading(false)
    })
  }, [])

  // Debounced save — wait 1 second after last change before saving
  function savePrefs(newPrefs) {
    setAgentPrefs(newPrefs)
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      await saveBriefingPrefs(newPrefs)
      toast('✅ Preferences saved!', undefined, 1500)
    }, 1000)
  }

  function setAgentEnabled(name, enabled) {
    const updated = { ...agentPrefs, [name]: { ...agentPrefs[name], enabled } }
    savePrefs(updated)
  }

  function setAgentSection(name, key, val) {
    const updated = {
      ...agentPrefs,
      [name]: {
        ...agentPrefs[name],
        sections: { ...agentPrefs[name].sections, [key]: val }
      }
    }
    savePrefs(updated)
  }

  function reorderSection(name, fromIdx, toIdx) {
    const order = [...(agentPrefs[name]?.sectionOrder || DEFAULT_AGENT_PREFS.sectionOrder)]
    const [moved] = order.splice(fromIdx, 1)
    order.splice(toIdx, 0, moved)
    const updated = { ...agentPrefs, [name]: { ...agentPrefs[name], sectionOrder: order } }
    savePrefs(updated)
  }

  // Build preview HTML
  useEffect(() => {
    if(!previewAgent || prefsLoading) return
    const today = new Date().toISOString().split('T')[0]
    const prefs = agentPrefs[previewAgent] || DEFAULT_AGENT_PREFS
    const html = buildDailyEmail({
      agentName: previewAgent,
      tasks: prefs.sections.todayTasks ? tasks.filter(t=>t.due_date===today) : [],
      overdueTasks: prefs.sections.overdueTasks ? tasks.filter(t=>t.due_date&&t.due_date<today) : [],
      appointments: [],
      agentColor: AGENT_COLORS[previewAgent]||'#CC2200',
      showQuote: prefs.sections.quote,
      sectionOrder: prefs.sectionOrder,
      quotes,
    })
    setPreviewHtml(html)
  }, [previewAgent, tasks, agentPrefs, prefsLoading, quotes])

  async function sendTest(agentName) {
    const email = AGENT_EMAILS[agentName]
    if(!email) { toast('No email for '+agentName,'#DC2626'); return }
    setSending(agentName)
    const today = new Date().toISOString().split('T')[0]
    const prefs = agentPrefs[agentName] || DEFAULT_AGENT_PREFS
    const html = buildDailyEmail({
      agentName, agentColor:AGENT_COLORS[agentName]||'#CC2200',
      tasks: prefs.sections.todayTasks ? tasks.filter(t=>t.due_date===today) : [],
      overdueTasks: prefs.sections.overdueTasks ? tasks.filter(t=>t.due_date&&t.due_date<today) : [],
      appointments: [],
      showQuote: prefs.sections.quote,
      sectionOrder: prefs.sectionOrder,
      quotes,
    })
    const result = await sendDailyBriefing({ agentName, email, html })
    setSending('')
    if(result.success) {
      setLastSent(p=>({...p,[agentName]:new Date().toLocaleTimeString()}))
      toast(`✅ Email sent to ${email}!`)
    } else {
      toast('Send failed: '+(result.error||'Check API key'),'#DC2626')
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
        showQuote: prefs.sections.quote,
        sectionOrder: prefs.sectionOrder,
        quotes,
      })
      const r = await sendDailyBriefing({agentName,email,html})
      if(r.success) sent++; else failed++
      await new Promise(r=>setTimeout(r,250))
    }
    setSending('')
    toast(`✅ Sent ${sent}${failed>0?' · '+failed+' failed':''}`)
  }

  function addQuote() {
    if(!newQuote.text.trim()||!newQuote.author.trim()) { toast('Quote and author required','#DC2626'); return }
    setQuotes(q=>[...q, {...newQuote}])
    setNewQuote({text:'',author:'',category:'motivation'})
    toast('Quote added!')
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const enabledCount = Object.values(agentPrefs).filter(p=>p.enabled).length

  if(prefsLoading) return (
    <div style={{padding:'40px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>
      <div style={{fontSize:'24px',marginBottom:'10px'}}>⏳</div>
      Loading preferences...
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>📧 Daily Briefing Emails</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{enabledCount} of 8 agents receiving · sends 7AM ET daily</div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>setShowQuoteManager(true)}>💬 Manage Quotes</Btn>
          <Btn size="sm" variant="ghost" onClick={()=>setShowPreview(true)}>👁 Preview</Btn>
          <Btn size="sm" onClick={sendAll} disabled={sending==='all'}>{sending==='all'?'Sending…':'📤 Send All Now'}</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Receiving',enabledCount,'#16A34A'],
          ['Paused',8-enabledCount,'#DC2626'],
          ["Today's Tasks",loading?'…':tasks.filter(t=>t.due_date===todayStr).length,'#D97706'],
          ['Overdue',loading?'…':tasks.filter(t=>t.due_date&&t.due_date<todayStr).length,'#CC2200'],
        ].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Schedule */}
      <Card style={{marginBottom:'14px'}}>
        <CardHeader>⏰ Schedule</CardHeader>
        <div style={{padding:'14px 16px',display:'flex',gap:'20px',alignItems:'center',flexWrap:'wrap'}}>
          <div>
            <label style={lbl}>Send Time (Eastern)</label>
            <input type="time" value={schedule.time} onChange={e=>setSchedule(s=>({...s,time:e.target.value}))}
              style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'14px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'8px 12px',outline:'none'}}/>
          </div>
          <div>
            <label style={lbl}>Days</label>
            <div style={{display:'flex',gap:'5px'}}>
              {DAYS.map(d=>(
                <div key={d} onClick={()=>setSchedule(s=>({...s,days:s.days.includes(d)?s.days.filter(x=>x!==d):[...s.days,d]}))}
                  style={{width:34,height:34,borderRadius:'50%',border:'1.5px solid '+(schedule.days.includes(d)?'#CC2200':'var(--border)'),background:schedule.days.includes(d)?'rgba(204,34,0,.1)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'11px',fontWeight:700,color:schedule.days.includes(d)?'#CC2200':'var(--muted)'}}>
                  {d[0]}
                </div>
              ))}
            </div>
          </div>
          <div style={{fontSize:'11px',color:'var(--muted)',background:'var(--dim)',borderRadius:'8px',padding:'8px 12px'}}>
            ⚡ Auto-sends at {schedule.time} ET on {schedule.days.join(', ')} via Edge Function
          </div>
        </div>
      </Card>

      {/* Agent list */}
      <Card>
        <CardHeader>👥 Agent Preferences — toggle and customize each agent</CardHeader>
        {Object.entries(AGENT_EMAILS).map(([name, email]) => {
          const prefs = agentPrefs[name] || DEFAULT_AGENT_PREFS
          const color = AGENT_COLORS[name]||'#CC2200'
          const gci = AGENT_GCI[name]||{gci:0,goal:100000}
          const pct = Math.min(Math.round(gci.gci/gci.goal*100),100)
          const isOpen = selectedAgent === name
          const sectionOrder = prefs.sectionOrder || DEFAULT_AGENT_PREFS.sectionOrder

          return (
            <div key={name} style={{borderBottom:'1px solid var(--border)'}}>
              {/* Agent row */}
              <div onClick={()=>setSelectedAgent(isOpen?null:name)}
                style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',cursor:'pointer',background:isOpen?'rgba(204,34,0,.02)':'transparent'}}
                onMouseEnter={e=>!isOpen&&(e.currentTarget.style.background='var(--hov)')}
                onMouseLeave={e=>!isOpen&&(e.currentTarget.style.background='transparent')}>
                <div style={{width:40,height:40,borderRadius:'10px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',fontWeight:800,color:'#fff',flexShrink:0}}>
                  {name.charAt(0)}
                </div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'2px'}}>
                    <span style={{fontSize:'13px',fontWeight:700}}>{name}</span>
                    {!prefs.enabled&&<span style={{fontSize:'10px',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:'20px',padding:'1px 8px',fontWeight:600}}>Paused</span>}
                    {lastSent[name]&&<span style={{fontSize:'10px',color:'#16A34A',fontWeight:600}}>✓ Sent {lastSent[name]}</span>}
                  </div>
                  <div style={{fontSize:'11px',color:'var(--muted)'}}>{email}</div>
                </div>
                <div style={{textAlign:'right',minWidth:'70px'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color,marginBottom:'3px'}}>{pct}%</div>
                  <div style={{background:'var(--dim)',borderRadius:'99px',height:4,overflow:'hidden',width:'60px'}}>
                    <div style={{background:color,borderRadius:'99px',height:4,width:pct+'%'}}/>
                  </div>
                </div>
                {/* Enabled toggle */}
                <div onClick={e=>{e.stopPropagation();setAgentEnabled(name,!prefs.enabled)}}
                  style={{width:42,height:22,borderRadius:'99px',background:prefs.enabled?'#10B981':'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                  <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:prefs.enabled?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                </div>
                <div style={{display:'flex',gap:'5px'}} onClick={e=>e.stopPropagation()}>
                  <Btn size="xs" variant="ghost" onClick={()=>{setPreviewAgent(name);setShowPreview(true)}}>👁</Btn>
                  <Btn size="xs" onClick={()=>sendTest(name)} disabled={!!sending}>{sending===name?'…':'Send'}</Btn>
                </div>
                <span style={{color:'var(--muted)',fontSize:'12px'}}>{isOpen?'▲':'▼'}</span>
              </div>

              {/* Expanded settings */}
              {isOpen && (
                <div style={{background:'var(--dim)',padding:'16px',borderTop:'1px solid var(--border)'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'12px'}}>
                    📧 Email Sections for {name.split(' ')[0]} — drag to reorder, toggle to show/hide
                  </div>

                  {/* Drag-and-drop section order */}
                  <div style={{marginBottom:'14px'}}>
                    {sectionOrder.map((key, idx) => {
                      const section = ALL_SECTIONS.find(s=>s.key===key)
                      if(!section) return null
                      const enabled = prefs.sections[key] !== false
                      return (
                        <div key={key}
                          draggable
                          onDragStart={e=>{e.dataTransfer.setData('idx',String(idx));e.dataTransfer.setData('agent',name)}}
                          onDragOver={e=>{e.preventDefault();setDragOver(idx)}}
                          onDragEnd={()=>setDragOver(null)}
                          onDrop={e=>{
                            e.preventDefault()
                            const fromIdx=parseInt(e.dataTransfer.getData('idx'))
                            if(fromIdx!==idx) reorderSection(name,fromIdx,idx)
                            setDragOver(null)
                          }}
                          style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 12px',background:dragOver===idx?'rgba(204,34,0,.05)':'var(--panel)',borderRadius:'9px',marginBottom:'5px',cursor:'grab',border:'1.5px solid '+(dragOver===idx?'#CC2200':'var(--border)'),transition:'all .1s',opacity:enabled?1:.5}}>
                          <span style={{color:'var(--muted)',fontSize:'14px',cursor:'grab'}}>⠿</span>
                          <span style={{flex:1,fontSize:'12px',fontWeight:600}}>{section.label}</span>
                          {section.required
                            ? <span style={{fontSize:'10px',color:'var(--muted)',background:'var(--dim)',borderRadius:'4px',padding:'2px 7px'}}>Required</span>
                            : <div onClick={e=>{e.stopPropagation();setAgentSection(name,key,!enabled)}}
                                style={{width:36,height:18,borderRadius:'99px',background:enabled?color:'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                                <div style={{width:14,height:14,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:enabled?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                              </div>
                          }
                        </div>
                      )
                    })}
                    <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'5px'}}>Drag rows to reorder • toggle to show/hide</div>
                  </div>

                  <div style={{display:'flex',gap:'7px'}}>
                    <Btn size="sm" variant="ghost" onClick={()=>{setPreviewAgent(name);setShowPreview(true)}}>👁 Preview Email</Btn>
                    <Btn size="sm" onClick={()=>sendTest(name)} disabled={!!sending}>{sending===name?'Sending…':'Send Test Email'}</Btn>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </Card>

      {/* Preview modal */}
      {showPreview && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowPreview(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'18px',width:'100%',maxWidth:'660px',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'14px',fontWeight:800}}>Email Preview — {previewAgent}</div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <select value={previewAgent} onChange={e=>setPreviewAgent(e.target.value)}
                  style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'6px 10px',outline:'none'}}>
                  {Object.keys(AGENT_EMAILS).map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={()=>setShowPreview(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1}}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflowY:'auto'}}>
              <iframe srcDoc={previewHtml} style={{width:'100%',height:'600px',border:'none',display:'block'}} title="Preview"/>
            </div>
            <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:'8px',justifyContent:'flex-end'}}>
              <Btn variant="ghost" onClick={()=>setShowPreview(false)}>Close</Btn>
              <Btn onClick={()=>{sendTest(previewAgent);setShowPreview(false)}} disabled={!!sending}>Send Test to {previewAgent.split(' ')[0]}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Quote manager modal */}
      {showQuoteManager && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowQuoteManager(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'18px',width:'100%',maxWidth:'640px',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'15px',fontWeight:800}}>💬 Manage Quotes ({quotes.length})</div>
              <button onClick={()=>setShowQuoteManager(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
            </div>

            {/* Add new quote */}
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',background:'var(--dim)'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Add New Quote</div>
              <textarea value={newQuote.text} onChange={e=>setNewQuote(q=>({...q,text:e.target.value}))} placeholder="Quote text..." rows={2}
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',resize:'none',boxSizing:'border-box',marginBottom:'8px'}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 100px',gap:'8px'}}>
                <input value={newQuote.author} onChange={e=>setNewQuote(q=>({...q,author:e.target.value}))} placeholder="Author (e.g. Gary Keller)"
                  style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none'}}/>
                <select value={newQuote.category} onChange={e=>setNewQuote(q=>({...q,category:e.target.value}))}
                  style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none'}}>
                  <option value="kw">KW / Gary Keller</option>
                  <option value="real estate">Real Estate</option>
                  <option value="motivation">Motivation</option>
                  <option value="general">General</option>
                </select>
                <Btn size="sm" onClick={addQuote}>Add</Btn>
              </div>
            </div>

            {/* Filter + list */}
            <div style={{padding:'10px 20px',borderBottom:'1px solid var(--border)',display:'flex',gap:'6px'}}>
              {[['all','All'],['kw','KW/Gary Keller'],['real estate','Real Estate'],['motivation','Motivation'],['general','General']].map(([k,l])=>(
                <button key={k} onClick={()=>setQuoteFilter(k)} style={{padding:'5px 11px',borderRadius:'20px',border:'1.5px solid '+(quoteFilter===k?'#CC2200':'var(--border)'),background:quoteFilter===k?'rgba(204,34,0,.1)':'transparent',color:quoteFilter===k?'#CC2200':'var(--muted)',fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                  {l} ({k==='all'?quotes.length:quotes.filter(q=>q.category===k).length})
                </button>
              ))}
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'12px 20px'}}>
              {quotes.filter(q=>quoteFilter==='all'||q.category===quoteFilter).map((q,i)=>(
                <div key={i} style={{display:'flex',gap:'10px',padding:'10px 12px',background:'var(--dim)',borderRadius:'9px',marginBottom:'6px',alignItems:'flex-start'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'13px',fontStyle:'italic',color:'var(--text)',lineHeight:1.6,marginBottom:'4px'}}>"{q.text}"</div>
                    <div style={{fontSize:'11px',color:'var(--muted)'}}>— {q.author} · <span style={{background:'var(--panel)',borderRadius:'4px',padding:'1px 7px',fontWeight:600}}>{q.category}</span></div>
                  </div>
                  <button onClick={()=>setQuotes(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'14px',flexShrink:0,paddingTop:'2px'}}>🗑</button>
                </div>
              ))}
            </div>

            <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'12px',color:'var(--muted)'}}>Quotes rotate daily — each agent gets a different one based on the date</div>
              <Btn variant="ghost" onClick={()=>setShowQuoteManager(false)}>Done</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px' }
