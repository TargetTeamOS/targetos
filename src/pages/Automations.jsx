import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Card, Btn, Modal, ModalTitle, Input, Select, Grid2 } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { nowISO, formatActivity } from '../lib/time'

// ── ALL NODE DEFINITIONS ──────────────────────────────────────
const TRIGGER_NODES = [
  { type:'trigger_new_contact',   label:'New Contact Added',        icon:'✦',  color:'#0EA5E9', category:'Contact',  desc:'Fires when a new contact is added to the system' },
  { type:'trigger_status',        label:'Contact Status Changes',   icon:'👤', color:'#0EA5E9', category:'Contact',  desc:'Fires when a contact status changes' },
  { type:'trigger_no_activity',   label:'No Activity for X Days',   icon:'⏰', color:'#7C3AED', category:'Contact',  desc:'Fires when no activity logged for a contact' },
  { type:'trigger_birthday',      label:'Birthday Coming Up',       icon:'🎂', color:'#EC4899', category:'Contact',  desc:'Fires X days before a contact\'s birthday' },
  { type:'trigger_anniversary',   label:'Closing Anniversary',      icon:'🏡', color:'#10B981', category:'Contact',  desc:'Fires before a client\'s closing anniversary' },
  { type:'trigger_offer',         label:'Offer Accepted',           icon:'📝', color:'#D97706', category:'Deal',     desc:'Fires when a deal moves to Offer Accepted' },
  { type:'trigger_deal',          label:'Deal Stage Changes',       icon:'📊', color:'#D97706', category:'Deal',     desc:'Fires when any deal changes stage' },
  { type:'trigger_closed',        label:'Deal Closed',              icon:'🎉', color:'#16A34A', category:'Deal',     desc:'Fires when a deal is marked Closed' },
  { type:'trigger_listing_status',label:'Listing Status Changes',   icon:'🏠', color:'#10B981', category:'Listing',  desc:'Fires when a listing status changes' },
  { type:'trigger_new_listing',   label:'New Listing Added',        icon:'🔑', color:'#10B981', category:'Listing',  desc:'Fires when a new listing is created' },
  { type:'trigger_oh_visitor',    label:'Open House Visitor',       icon:'🏡', color:'#F59E0B', category:'Listing',  desc:'Fires when someone signs in at an open house' },
  { type:'trigger_showing',       label:'Showing Logged',           icon:'👁',  color:'#8B5CF6', category:'Listing',  desc:'Fires when a showing is logged on a listing' },
  { type:'trigger_task_due',      label:'Task Due Soon',            icon:'✓',  color:'#DC2626', category:'Task',     desc:'Fires when a task is due in X days' },
  { type:'trigger_task_overdue',  label:'Task Overdue',             icon:'⚠',  color:'#DC2626', category:'Task',     desc:'Fires when a task becomes overdue' },
  { type:'trigger_scheduled',     label:'Scheduled / Recurring',    icon:'📅', color:'#6366F1', category:'System',   desc:'Fires on a schedule (daily, weekly, monthly)' },
]

const ACTION_NODES = [
  { type:'action_sms',            label:'Send SMS',                 icon:'💬', color:'#10B981', category:'Communicate', desc:'Send an SMS to a contact or agent' },
  { type:'action_email',          label:'Send Email',               icon:'✉',  color:'#0EA5E9', category:'Communicate', desc:'Send an email to a contact or agent' },
  { type:'action_internal_notify',label:'Notify Agent',             icon:'🔔', color:'#F59E0B', category:'Communicate', desc:'Send an in-app notification to an agent' },
  { type:'action_announce',       label:'Post Announcement',        icon:'📣', color:'#8B5CF6', category:'Communicate', desc:'Post a team announcement' },
  { type:'action_celebrate',      label:'Send Celebration',         icon:'🎊', color:'#16A34A', category:'Communicate', desc:'Trigger a team celebration message' },
  { type:'action_task',           label:'Create Task',              icon:'✓',  color:'#7C3AED', category:'Action',      desc:'Create a task and assign it' },
  { type:'action_assign',         label:'Assign to Agent',          icon:'👤', color:'#E8650A', category:'Action',      desc:'Assign the contact to a specific agent' },
  { type:'action_status',         label:'Change Contact Status',    icon:'⇄',  color:'#CC2200', category:'Action',      desc:'Update a contact\'s status' },
  { type:'action_tag',            label:'Tag / Untag Contact',      icon:'🏷', color:'#F59E0B', category:'Action',      desc:'Add or remove a tag on a contact' },
  { type:'action_deal_stage',     label:'Move Deal Stage',          icon:'📊', color:'#D97706', category:'Action',      desc:'Move a deal to a different stage' },
  { type:'action_listing_status', label:'Update Listing Status',    icon:'🏠', color:'#10B981', category:'Action',      desc:'Change a listing\'s status' },
  { type:'action_webhook',        label:'Send Webhook',             icon:'⚡', color:'#64748B', category:'Advanced',    desc:'POST data to an external URL' },
  { type:'action_whatsapp',       label:'Send WhatsApp',            icon:'📱', color:'#25D366', category:'Communicate', desc:'Send a WhatsApp message (requires setup)' },
]

const RULE_NODES = [
  { type:'rule_wait',             label:'Wait / Delay',             icon:'⏱', color:'#94A3B8', category:'Rule', desc:'Wait a set amount of time before continuing' },
  { type:'rule_condition',        label:'Condition / If-Then',      icon:'⟨⟩', color:'#E8650A', category:'Rule', desc:'Branch the flow based on a condition' },
  { type:'rule_split',            label:'Percentage Split A/B',     icon:'⚖', color:'#7C3AED', category:'Rule', desc:'Split contacts randomly for A/B testing' },
  { type:'rule_time_window',      label:'Time Window Check',        icon:'🕐', color:'#6366F1', category:'Rule', desc:'Only continue during business hours' },
  { type:'rule_goal',             label:'Goal / Exit Condition',    icon:'🎯', color:'#16A34A', category:'Rule', desc:'Exit flow if contact meets a goal' },
  { type:'rule_exit',             label:'Exit Flow',                icon:'↩', color:'#DC2626', category:'Rule', desc:'End the automation here' },
]

const ALL_NODES = [...TRIGGER_NODES, ...ACTION_NODES, ...RULE_NODES]

// ── PRESET AUTOMATIONS ─────────────────────────────────────────
const PRESETS = [
  {
    id:'p1', name:'New Lead Welcome Series', description:'Welcome new leads, notify agent, create follow-up task',
    active:true, lastFired:'Jun 17', count:24, color:'#0EA5E9',
    nodes:[
      {id:'n1',type:'trigger_new_contact',label:'New Contact Added',icon:'✦',color:'#0EA5E9',x:260,y:50,config:{}},
      {id:'n2',type:'rule_wait',label:'Wait 5 Minutes',icon:'⏱',color:'#94A3B8',x:260,y:170,config:{duration:5,unit:'minutes'}},
      {id:'n3',type:'action_sms',label:'Send Welcome SMS',icon:'💬',color:'#10B981',x:260,y:290,config:{to:'contact',message:'Hi {name}! This is Target Team. We received your inquiry and will be in touch shortly. Call us anytime: 845.424.1014 🏠'}},
      {id:'n4',type:'action_internal_notify',label:'Notify Assigned Agent',icon:'🔔',color:'#F59E0B',x:260,y:410,config:{message:'New lead: {name} just signed up! Follow up ASAP.',to:'assigned_agent'}},
      {id:'n5',type:'action_task',label:'Create Follow-up Task',icon:'✓',color:'#7C3AED',x:260,y:530,config:{title:'Follow up with {name} — new lead',priority:'urgent',assignTo:'assigned_agent',dueIn:'1 day'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'}]
  },
  {
    id:'p2', name:'Deal Under Contract — CTC Launch', description:'When deal goes Under Contract, start CTC checklist and celebrate',
    active:true, lastFired:'Jun 10', count:8, color:'#2563EB',
    nodes:[
      {id:'n1',type:'trigger_deal',label:'Deal → Under Contract',icon:'📊',color:'#D97706',x:260,y:50,config:{stage:'Under Contract'}},
      {id:'n2',type:'action_celebrate',label:'Team Celebration',icon:'🎊',color:'#16A34A',x:260,y:170,config:{message:'🎉 UNDER CONTRACT! Congrats to {agent} on {addr}!'}},
      {id:'n3',type:'action_announce',label:'Post Team Announcement',icon:'📣',color:'#8B5CF6',x:260,y:290,config:{title:'Under Contract — {addr}',body:'Congratulations to {agent} on getting {addr} under contract! 🏡'}},
      {id:'n4',type:'action_task',label:'Secretary: Start CTC Checklist',icon:'✓',color:'#7C3AED',x:260,y:410,config:{title:'Start CTC for {addr}',priority:'urgent',assignTo:'Gitty Fogel',dueIn:'same day'}},
      {id:'n5',type:'action_task',label:'Agent: Schedule Inspection',icon:'✓',color:'#7C3AED',x:260,y:530,config:{title:'Schedule home inspection — {addr}',priority:'high',assignTo:'assigned_agent',dueIn:'3 days'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'}]
  },
  {
    id:'p3', name:'No Activity — Re-engagement', description:'If no activity for 5 days, check status and act accordingly',
    active:true, lastFired:'Jun 15', count:31, color:'#7C3AED',
    nodes:[
      {id:'n1',type:'trigger_no_activity',label:'No Activity — 5 Days',icon:'⏰',color:'#7C3AED',x:260,y:50,config:{days:5}},
      {id:'n2',type:'rule_condition',label:'Is contact Hot or Active?',icon:'⟨⟩',color:'#E8650A',x:260,y:170,config:{field:'status',operator:'in',value:'Hot,Active'}},
      {id:'n3',type:'action_task',label:'Create Urgent Follow-up',icon:'✓',color:'#7C3AED',x:130,y:310,config:{title:'Re-engage {name} — no activity 5 days',priority:'urgent',assignTo:'assigned_agent'}},
      {id:'n4',type:'action_sms',label:'Send Check-in SMS',icon:'💬',color:'#10B981',x:130,y:430,config:{to:'contact',message:'Hi {name}! Just checking in — are you still looking? We have new listings you might love. — Target Team'}},
      {id:'n5',type:'action_status',label:'Change Status to Nurturing',icon:'⇄',color:'#CC2200',x:400,y:310,config:{status:'Nurturing'}},
      {id:'n6',type:'rule_exit',label:'Exit Flow',icon:'↩',color:'#DC2626',x:400,y:430,config:{}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3',label:'Yes'},{from:'n2',to:'n5',label:'No'},{from:'n3',to:'n4'},{from:'n5',to:'n6'}]
  },
  {
    id:'p4', name:'Deal Closed — Celebration & Gifts', description:'Full closing celebration flow with gifts and thank you',
    active:true, lastFired:'Jun 10', count:5, color:'#16A34A',
    nodes:[
      {id:'n1',type:'trigger_closed',label:'Deal Closed 🎉',icon:'🎉',color:'#16A34A',x:260,y:50,config:{}},
      {id:'n2',type:'action_celebrate',label:'Team Celebration Alert',icon:'🎊',color:'#16A34A',x:260,y:170,config:{message:'🏆 CLOSED! {agent} closed {addr} at {price}! GCI: {gci}'}},
      {id:'n3',type:'action_announce',label:'Post to Team Feed',icon:'📣',color:'#8B5CF6',x:260,y:290,config:{title:'CLOSED! {addr}',body:'Huge congratulations to {agent} for closing {addr} at {price}! Another win for Target Team! 🏆'}},
      {id:'n4',type:'action_task',label:'Order Closing Gift',icon:'✓',color:'#7C3AED',x:260,y:410,config:{title:'Order closing gift for {addr} buyers',assignTo:'Gitty Fogel',priority:'normal',dueIn:'2 days'}},
      {id:'n5',type:'rule_wait',label:'Wait 7 Days',icon:'⏱',color:'#94A3B8',x:260,y:530,config:{duration:7,unit:'days'}},
      {id:'n6',type:'action_sms',label:'Thank You SMS to Client',icon:'💬',color:'#10B981',x:260,y:650,config:{to:'contact',message:'Hi {client_name}! 🏡 It was truly a pleasure working with you. Enjoy your beautiful new home! If you ever need anything, we\'re always here. — Target Team 845.424.1014'}},
      {id:'n7',type:'rule_wait',label:'Wait 6 Months',icon:'⏱',color:'#94A3B8',x:260,y:770,config:{duration:180,unit:'days'}},
      {id:'n8',type:'action_task',label:'Request Referral',icon:'✓',color:'#7C3AED',x:260,y:890,config:{title:'Reach out to {client_name} for referral',assignTo:'assigned_agent',priority:'normal'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'},{from:'n6',to:'n7'},{from:'n7',to:'n8'}]
  },
  {
    id:'p5', name:'Birthday Reminder', description:'Remind agent 3 days before and on the day of a contact\'s birthday',
    active:true, lastFired:'', count:0, color:'#EC4899',
    nodes:[
      {id:'n1',type:'trigger_birthday',label:'Birthday in 3 Days',icon:'🎂',color:'#EC4899',x:260,y:50,config:{daysBefore:3}},
      {id:'n2',type:'action_internal_notify',label:'Notify Agent — 3 Days Out',icon:'🔔',color:'#F59E0B',x:260,y:170,config:{message:"🎂 {name}'s birthday is in 3 days! Great time to reach out with a personal message.",to:'assigned_agent'}},
      {id:'n3',type:'rule_wait',label:'Wait 3 Days',icon:'⏱',color:'#94A3B8',x:260,y:290,config:{duration:3,unit:'days'}},
      {id:'n4',type:'action_sms',label:'Happy Birthday SMS',icon:'💬',color:'#10B981',x:260,y:410,config:{to:'contact',message:'🎂 Happy Birthday {name}! Wishing you a wonderful day! — Target Team'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
  {
    id:'p6', name:'Offer Accepted — Announcement', description:'When offer is accepted, notify team and start tasks',
    active:true, lastFired:'Jun 12', count:9, color:'#D97706',
    nodes:[
      {id:'n1',type:'trigger_offer',label:'Offer Accepted',icon:'📝',color:'#D97706',x:260,y:50,config:{}},
      {id:'n2',type:'action_celebrate',label:'Offer Accepted Alert',icon:'🎊',color:'#16A34A',x:260,y:170,config:{message:'📝 OFFER ACCEPTED! {agent} got an accepted offer on {addr}!'}},
      {id:'n3',type:'action_task',label:'Attorney Review — 3 Days',icon:'✓',color:'#7C3AED',x:260,y:290,config:{title:'Attorney review period for {addr}',priority:'urgent',assignTo:'Gitty Fogel',dueIn:'3 days'}},
      {id:'n4',type:'action_task',label:'Order Title Search',icon:'✓',color:'#7C3AED',x:260,y:410,config:{title:'Order title search for {addr}',priority:'high',assignTo:'Gitty Fogel',dueIn:'5 days'}},
      {id:'n5',type:'action_internal_notify',label:'Notify Admin',icon:'🔔',color:'#F59E0B',x:260,y:530,config:{message:'New accepted offer: {addr} — {agent}. Please review CTC board.',to:'Avraham Weinberger'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'}]
  },
  {
    id:'p7', name:'New Listing Announcement', description:'When a listing goes live, announce to team and share on socials',
    active:false, lastFired:'', count:0, color:'#10B981',
    nodes:[
      {id:'n1',type:'trigger_new_listing',label:'New Listing Added',icon:'🔑',color:'#10B981',x:260,y:50,config:{}},
      {id:'n2',type:'action_announce',label:'Announce New Listing',icon:'📣',color:'#8B5CF6',x:260,y:170,config:{title:'New Listing — {addr}',body:'🏠 New listing alert! {addr}, {city} — {beds}bd/{baths}ba at {price}. Listed by {agent}.'}},
      {id:'n3',type:'action_task',label:'Share on Social Media',icon:'✓',color:'#7C3AED',x:260,y:290,config:{title:'Post {addr} to @thetargetteam Instagram & Facebook',assignTo:'Yanky Lichtenstein',priority:'normal',dueIn:'same day'}},
      {id:'n4',type:'action_task',label:'Schedule Photography',icon:'✓',color:'#7C3AED',x:260,y:410,config:{title:'Schedule photography for {addr}',assignTo:'assigned_agent',priority:'high',dueIn:'2 days'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
  {
    id:'p8', name:'Open House Follow-up', description:'Follow up with every open house visitor automatically',
    active:true, lastFired:'Jun 14', count:18, color:'#F59E0B',
    nodes:[
      {id:'n1',type:'trigger_oh_visitor',label:'Open House Visitor Signs In',icon:'🏡',color:'#F59E0B',x:260,y:50,config:{}},
      {id:'n2',type:'rule_wait',label:'Wait 2 Hours',icon:'⏱',color:'#94A3B8',x:260,y:170,config:{duration:2,unit:'hours'}},
      {id:'n3',type:'action_sms',label:'Thank You SMS',icon:'💬',color:'#10B981',x:260,y:290,config:{to:'contact',message:"Hi {name}! Thanks for visiting {addr} today 🏠 Let us know if you have any questions or would like a second showing. — Target Team 845.424.1014"}},
      {id:'n4',type:'action_task',label:'Add to CRM as Contact',icon:'✓',color:'#7C3AED',x:260,y:410,config:{title:'Follow up with open house visitor: {name}',assignTo:'assigned_agent',priority:'high'}},
      {id:'n5',type:'rule_wait',label:'Wait 3 Days',icon:'⏱',color:'#94A3B8',x:260,y:530,config:{duration:3,unit:'days'}},
      {id:'n6',type:'action_sms',label:'Second Follow-up',icon:'💬',color:'#10B981',x:260,y:650,config:{to:'contact',message:"Hi {name}! Just following up from the open house at {addr}. Still interested? We'd love to help you find your perfect home. — Target Team"}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'}]
  },
  {
    id:'p9', name:'Task Overdue Alert', description:'Alert agent and admin when a task goes overdue',
    active:true, lastFired:'Jun 16', count:7, color:'#DC2626',
    nodes:[
      {id:'n1',type:'trigger_task_overdue',label:'Task Overdue',icon:'⚠',color:'#DC2626',x:260,y:50,config:{}},
      {id:'n2',type:'action_internal_notify',label:'Notify Agent',icon:'🔔',color:'#F59E0B',x:260,y:170,config:{message:'⚠ Overdue task: "{task_title}" was due {due_date}. Please complete it now.',to:'task_owner'}},
      {id:'n3',type:'rule_wait',label:'Wait 24 Hours',icon:'⏱',color:'#94A3B8',x:260,y:290,config:{duration:24,unit:'hours'}},
      {id:'n4',type:'rule_condition',label:'Still Overdue?',icon:'⟨⟩',color:'#E8650A',x:260,y:410,config:{field:'task_status',operator:'equals',value:'pending'}},
      {id:'n5',type:'action_internal_notify',label:'Escalate to Admin',icon:'🔔',color:'#CC2200',x:260,y:530,config:{message:'🚨 Task still overdue after 24hrs: "{task_title}" assigned to {agent}. Please follow up.',to:'Avraham Weinberger'}},
      {id:'n6',type:'rule_exit',label:'Task Completed — Exit',icon:'↩',color:'#16A34A',x:450,y:530,config:{}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5',label:'Yes'},{from:'n4',to:'n6',label:'No'}]
  },
  {
    id:'p10', name:'Closing Anniversary Check-in', description:'Reach out to past clients on their 1-year closing anniversary',
    active:true, lastFired:'', count:0, color:'#8B5CF6',
    nodes:[
      {id:'n1',type:'trigger_anniversary',label:'Closing Anniversary',icon:'🏡',color:'#10B981',x:260,y:50,config:{daysBefore:7}},
      {id:'n2',type:'action_task',label:'Plan Anniversary Outreach',icon:'✓',color:'#7C3AED',x:260,y:170,config:{title:'Anniversary outreach — {name} — {addr} closes 1 year ago',assignTo:'assigned_agent',priority:'normal'}},
      {id:'n3',type:'rule_wait',label:'Wait Until Anniversary Day',icon:'⏱',color:'#94A3B8',x:260,y:290,config:{duration:7,unit:'days'}},
      {id:'n4',type:'action_sms',label:'Anniversary SMS',icon:'💬',color:'#10B981',x:260,y:410,config:{to:'contact',message:"Hi {name}! 🏡 Can you believe it's been a year since you closed on {addr}? We hope you're loving every moment! If you know anyone looking to buy or sell, we'd love the referral. — Target Team"}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
]

// ── MAIN PAGE ──────────────────────────────────────────────────
export function Automations() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [view, setView] = useState('list')
  const [automations, setAutomations] = useState(PRESETS)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  function newAutomation() {
    const blank = { id:'auto_'+Date.now(), name:'New Automation', description:'', active:false, lastFired:'', count:0, color:'#CC2200', nodes:[], connections:[] }
    setEditing(blank)
    setView('builder')
  }

  function saveAuto(auto) {
    setAutomations(prev => { const e=prev.find(a=>a.id===auto.id); return e?prev.map(a=>a.id===auto.id?auto:a):[...prev,auto] })
    setView('list'); setEditing(null)
  }

  function toggleActive(id) { setAutomations(prev=>prev.map(a=>a.id===id?{...a,active:!a.active}:a)) }

  function deleteAuto(id) {
    const a = automations.find(x=>x.id===id)
    confirm({ title:'Delete Automation?', message:`"${a?.name}" will be permanently deleted.`, confirmLabel:'Delete', onConfirm:()=>setAutomations(prev=>prev.filter(x=>x.id!==id)) })
  }

  if(view==='builder' && editing) return <AutomationBuilder automation={editing} onSave={saveAuto} onCancel={()=>{setView('list');setEditing(null)}}/>

  const filtered = automations.filter(a => {
    if(search && !a.name.toLowerCase().includes(search.toLowerCase())) return false
    if(filterStatus==='active' && !a.active) return false
    if(filterStatus==='paused' && a.active) return false
    return true
  })

  const totalFired = automations.reduce((s,a)=>s+a.count,0)

  return (
    <div>
      <ConfirmDialog/>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[['Total Automations',automations.length,'var(--text)'],['Active',automations.filter(a=>a.active).length,'#16A34A'],['Paused',automations.filter(a=>!a.active).length,'#D97706'],['Times Fired',totalFired,'#CC2200']].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'26px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search automations..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'200px',fontFamily:'Inter,system-ui,sans-serif'}}/>
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['all','All'],['active','Active'],['paused','Paused']].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterStatus(k)} style={{padding:'5px 11px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:filterStatus===k?'var(--panel)':'transparent',color:filterStatus===k?'var(--text)':'var(--muted)'}}>{l}</button>
            ))}
          </div>
        </div>
        <Btn size="sm" onClick={newAutomation}>+ Create Automation</Btn>
      </div>

      {/* Grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:'12px'}}>
        {filtered.map(auto => {
          const trigger = auto.nodes.find(n=>n.type.startsWith('trigger_'))
          const actions = auto.nodes.filter(n=>n.type.startsWith('action_'))
          return (
            <div key={auto.id} style={{background:'var(--panel)',border:'1.5px solid '+(auto.active?auto.color+'44':'var(--border)'),borderRadius:'14px',overflow:'hidden',transition:'border-color .15s'}}>
              <div style={{height:4,background:auto.active?auto.color:'var(--dim)'}}/>
              <div style={{padding:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                  <div style={{flex:1,marginRight:'12px'}}>
                    <div style={{fontSize:'14px',fontWeight:800,marginBottom:'2px'}}>{auto.name}</div>
                    <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.5}}>{auto.description}</div>
                  </div>
                  <div onClick={()=>toggleActive(auto.id)} style={{width:44,height:24,borderRadius:'99px',background:auto.active?'#10B981':'var(--border)',position:'relative',cursor:'pointer',flexShrink:0,transition:'background .2s'}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:auto.active?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                  </div>
                </div>

                {/* Flow preview chips */}
                <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px',marginBottom:'12px',display:'flex',gap:'5px',flexWrap:'wrap',alignItems:'center'}}>
                  {trigger && <span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:trigger.color+'18',color:trigger.color}}>{trigger.icon} {trigger.label}</span>}
                  {auto.nodes.filter(n=>n.type.startsWith('rule_')&&n.type!=='rule_exit').slice(0,1).map((n,i)=>(
                    <React.Fragment key={i}><span style={{color:'var(--muted)',fontSize:'11px'}}>→</span><span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:n.color+'18',color:n.color}}>{n.icon} {n.label.split(' ').slice(0,2).join(' ')}</span></React.Fragment>
                  ))}
                  {actions.slice(0,2).map((n,i)=>(
                    <React.Fragment key={i}><span style={{color:'var(--muted)',fontSize:'11px'}}>→</span><span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:n.color+'18',color:n.color}}>{n.icon} {n.label.split(' ').slice(0,2).join(' ')}</span></React.Fragment>
                  ))}
                  {(auto.nodes.length > 4) && <span style={{fontSize:'10px',color:'var(--muted)',padding:'3px 9px'}}>+{auto.nodes.length-4} more</span>}
                </div>

                {/* Stats row */}
                <div style={{display:'flex',gap:'14px',fontSize:'11px',color:'var(--muted)',marginBottom:'12px'}}>
                  <span>📋 {auto.nodes.length} steps</span>
                  <span>⚡ {auto.count} times fired</span>
                  {auto.lastFired && <span>🕐 Last: {auto.lastFired}</span>}
                </div>

                <div style={{display:'flex',gap:'6px'}}>
                  <Btn size="xs" onClick={()=>{setEditing({...auto,nodes:auto.nodes.map(n=>({...n})),connections:[...auto.connections]});setView('builder')}}>✏️ Edit Flow</Btn>
                  <Btn size="xs" variant="ghost" onClick={()=>{ toggleActive(auto.id); alert(auto.active?`"${auto.name}" paused.`:`"${auto.name}" activated!`) }}>
                    {auto.active?'⏸ Pause':'▶ Activate'}
                  </Btn>
                  <Btn size="xs" variant="danger" onClick={()=>deleteAuto(auto.id)}>🗑</Btn>
                </div>
              </div>
            </div>
          )
        })}

        {/* New card */}
        <div onClick={newAutomation} style={{background:'transparent',border:'2px dashed var(--border)',borderRadius:'14px',padding:'32px 24px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',minHeight:'200px',transition:'border-color .15s,background .15s'}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.background='rgba(204,34,0,.03)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='transparent'}}>
          <div style={{fontSize:'36px',marginBottom:'10px',opacity:.4}}>⚡</div>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--muted)',marginBottom:'4px'}}>Create Automation</div>
          <div style={{fontSize:'11px',color:'var(--muted)',textAlign:'center',opacity:.7}}>Visual drag-and-drop builder</div>
        </div>
      </div>
    </div>
  )
}

// ── VISUAL BUILDER ─────────────────────────────────────────────
function AutomationBuilder({ automation, onSave, onCancel }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const [auto, setAuto] = useState({...automation,nodes:[...automation.nodes],connections:[...automation.connections]})
  const [selected, setSelected] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dragOff, setDragOff] = useState({x:0,y:0})
  const [nameEdit, setNameEdit] = useState(false)
  const [activeSection, setActiveSection] = useState('Triggers')
  const canvasRef = useRef()

  const selectedNode = auto.nodes.find(n=>n.id===selected)
  const canvasH = Math.max(700, ...auto.nodes.map(n=>n.y+180), 0)

  function addNode(def) {
    const id = 'n'+Date.now()
    const yOffset = auto.nodes.length > 0 ? Math.max(...auto.nodes.map(n=>n.y)) + 140 : 50
    const node = { id, type:def.type, label:def.label, icon:def.icon, color:def.color, x:220, y:yOffset, config:{} }
    setAuto(a=>({...a,nodes:[...a.nodes,node]}))
    setSelected(id)
    // Auto-connect to last node if sequential
    if(auto.nodes.length > 0 && !def.type.startsWith('trigger_')) {
      const lastNode = auto.nodes.reduce((p,c)=>c.y>p.y?c:p)
      setAuto(a=>({...a,connections:[...a.connections,{from:lastNode.id,to:id,label:''}]}))
    }
  }

  function startDrag(e, id) {
    const n = auto.nodes.find(x=>x.id===id)
    const r = canvasRef.current.getBoundingClientRect()
    setDragId(id); setDragOff({x:e.clientX-r.left-n.x, y:e.clientY-r.top-n.y}); e.preventDefault()
  }

  function onMove(e) {
    if(!dragId) return
    const r = canvasRef.current.getBoundingClientRect()
    setAuto(a=>({...a,nodes:a.nodes.map(n=>n.id===dragId?{...n,x:Math.max(10,e.clientX-r.left-dragOff.x),y:Math.max(10,e.clientY-r.top-dragOff.y)}:n)}))
  }

  function connect(toId) {
    if(!connecting||connecting===toId) { setConnecting(null); return }
    const exists = auto.connections.find(c=>c.from===connecting&&c.to===toId)
    if(!exists) {
      const fromNode = auto.nodes.find(n=>n.id===connecting)
      const isCondition = fromNode?.type==='rule_condition'||fromNode?.type==='rule_split'
      const existingConns = auto.connections.filter(c=>c.from===connecting)
      const label = isCondition ? (existingConns.length===0?'Yes':'No') : ''
      setAuto(a=>({...a,connections:[...a.connections,{from:connecting,to:toId,label}]}))
    }
    setConnecting(null)
  }

  const SECTIONS = {
    Triggers: TRIGGER_NODES,
    Actions:  ACTION_NODES,
    Rules:    RULE_NODES,
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 110px)'}}>
      <ConfirmDialog/>

      {/* Toolbar */}
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'10px 16px',marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0,gap:'10px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <button onClick={onCancel} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',fontWeight:600,display:'flex',alignItems:'center',gap:'5px'}}>← Back</button>
          <div style={{width:1,height:20,background:'var(--border)'}}/>
          {nameEdit
            ? <input value={auto.name} onChange={e=>setAuto(a=>({...a,name:e.target.value}))} onBlur={()=>setNameEdit(false)} onKeyDown={e=>e.key==='Enter'&&setNameEdit(false)} autoFocus style={{background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'8px',color:'var(--text)',fontSize:'14px',fontWeight:800,padding:'4px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
            : <span onClick={()=>setNameEdit(true)} style={{fontSize:'14px',fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}>{auto.name} <span style={{fontSize:'11px',color:'var(--muted)',fontWeight:400}}>✏</span></span>
          }
          <div onClick={()=>setAuto(a=>({...a,active:!a.active}))} style={{display:'flex',alignItems:'center',gap:'6px',background:auto.active?'rgba(16,185,129,.1)':'var(--dim)',borderRadius:'20px',padding:'5px 12px',cursor:'pointer',border:'1px solid '+(auto.active?'rgba(16,185,129,.3)':'var(--border)')}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:auto.active?'#10B981':'#94A3B8'}}/>
            <span style={{fontSize:'11px',fontWeight:700,color:auto.active?'#10B981':'#94A3B8'}}>{auto.active?'Active':'Paused'}</span>
          </div>
          <span style={{fontSize:'11px',color:'var(--muted)'}}>{auto.nodes.length} steps · {auto.connections.length} connections</span>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>confirm({title:'Clear Canvas?',message:'Remove all nodes and connections?',confirmLabel:'Clear',onConfirm:()=>{setAuto(a=>({...a,nodes:[],connections:[]}));setSelected(null)}})}>Clear</Btn>
          <Btn size="sm" onClick={()=>onSave(auto)}>💾 Save</Btn>
        </div>
      </div>

      <div style={{display:'flex',gap:'10px',flex:1,overflow:'hidden',minHeight:0}}>

        {/* Left panel */}
        <div style={{width:'210px',flexShrink:0,overflowY:'auto',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'12px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'10px'}}>Node Library</div>
          <div style={{display:'flex',gap:'4px',marginBottom:'12px'}}>
            {Object.keys(SECTIONS).map(s=>(
              <button key={s} onClick={()=>setActiveSection(s)} style={{flex:1,padding:'5px 4px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'10px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',background:activeSection===s?'#CC2200':'var(--dim)',color:activeSection===s?'#fff':'var(--muted)'}}>
                {s}
              </button>
            ))}
          </div>
          {SECTIONS[activeSection].map(node=>(
            <div key={node.type} onClick={()=>addNode(node)}
              draggable onDragStart={e=>e.dataTransfer.setData('nd',JSON.stringify(node))}
              title={node.desc}
              style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 9px',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',marginBottom:'5px',cursor:'pointer',transition:'all .12s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=node.color;e.currentTarget.style.background=node.color+'10'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--dim)'}}>
              <div style={{width:26,height:26,borderRadius:'7px',background:node.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',flexShrink:0}}>{node.icon}</div>
              <div style={{fontSize:'10px',fontWeight:600,lineHeight:1.3,color:'var(--text)'}}>{node.label}</div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{flex:1,overflow:'auto',background:'var(--dim)',borderRadius:'14px',border:'1px solid var(--border)',position:'relative'}}
          onClick={e=>{if(e.target===e.currentTarget){setSelected(null);if(connecting)setConnecting(null)}}}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();const d=e.dataTransfer.getData('nd');if(d){const nd=JSON.parse(d);const r=canvasRef.current.getBoundingClientRect();const newN={id:'n'+Date.now(),type:nd.type,label:nd.label,icon:nd.icon,color:nd.color,x:Math.max(20,e.clientX-r.left-80),y:Math.max(20,e.clientY-r.top-30),config:{}};setAuto(a=>({...a,nodes:[...a.nodes,newN]}));setSelected(newN.id)}}}>
          <div ref={canvasRef} style={{position:'relative',minHeight:canvasH+'px',minWidth:'580px'}} onMouseMove={onMove} onMouseUp={()=>setDragId(null)}>

            {/* Grid */}
            <svg style={{position:'absolute',inset:0,width:'100%',height:canvasH+'px',pointerEvents:'none'}} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="var(--border)" opacity=".7"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#dots)"/>
              {/* Connections */}
              {auto.connections.map((conn,i)=>{
                const f=auto.nodes.find(n=>n.id===conn.from), t=auto.nodes.find(n=>n.id===conn.to)
                if(!f||!t) return null
                const fw=160,fh=60
                const fx=f.x+fw/2, fy=f.y+fh+14
                const tx=t.x+fw/2, ty=t.y-2
                const my=(fy+ty)/2
                const path=`M${fx},${fy} C${fx},${my} ${tx},${my} ${tx},${ty}`
                const isY=conn.label==='Yes',isN=conn.label==='No'
                const clr=isY?'#16A34A':isN?'#DC2626':'#CC2200'
                return (
                  <g key={i} onClick={()=>{if(window.confirm('Remove this connection?'))setAuto(a=>({...a,connections:a.connections.filter((_,j)=>j!==i)}))}} style={{cursor:'pointer'}}>
                    <defs><marker id={`arr${i}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3z" fill={clr}/></marker></defs>
                    <path d={path} stroke={clr} strokeWidth="2.5" fill="none" strokeDasharray={isN?"7,4":undefined} markerEnd={`url(#arr${i})`} opacity=".85"/>
                    {conn.label&&<rect x={(fx+tx)/2-14} y={my-10} width={28} height={16} rx={8} fill={clr} opacity=".9"/>}
                    {conn.label&&<text x={(fx+tx)/2} y={my+2} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" style={{fontFamily:'Inter,system-ui,sans-serif'}}>{conn.label}</text>}
                  </g>
                )
              })}
            </svg>

            {/* Nodes */}
            {auto.nodes.map(node=>{
              const isSel=selected===node.id, isConn=connecting===node.id
              return (
                <div key={node.id} style={{position:'absolute',left:node.x,top:node.y,width:160,userSelect:'none',zIndex:isSel?10:1}}>
                  <div onMouseDown={e=>startDrag(e,node.id)} onClick={e=>{e.stopPropagation();if(connecting){connect(node.id)}else setSelected(node.id)}}
                    style={{background:'var(--panel)',border:'2px solid '+(isSel?node.color:isConn?'#CC2200':'var(--border)'),borderRadius:'12px',padding:'11px 12px',cursor:connecting?'crosshair':'grab',boxShadow:isSel?'0 4px 20px rgba(0,0,0,.15)':'0 2px 6px rgba(0,0,0,.06)',transition:'border-color .12s,box-shadow .12s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:node.config&&Object.keys(node.config).length>0?'6px':'0'}}>
                      <div style={{width:28,height:28,borderRadius:'7px',background:node.color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',flexShrink:0}}>{node.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'10px',fontWeight:700,lineHeight:1.3,color:'var(--text)'}}>{node.label}</div>
                        <div style={{fontSize:'8px',color:node.color,fontWeight:600,textTransform:'uppercase',letterSpacing:'.5px'}}>{node.type.split('_')[0]}</div>
                      </div>
                    </div>
                    {node.config && Object.keys(node.config).filter(k=>node.config[k]).length > 0 && (
                      <div style={{fontSize:'8px',color:'var(--muted)',background:'var(--dim)',borderRadius:'5px',padding:'4px 6px',lineHeight:1.5,wordBreak:'break-word'}}>
                        {node.type==='rule_wait'?`${node.config.duration} ${node.config.unit}`:
                         node.type==='action_sms'||node.type==='action_email'?`"${(node.config.message||node.config.body||'').slice(0,35)}..."`:
                         node.config.stage||node.config.status||node.config.title?.slice(0,30)||node.config.days&&`${node.config.days} days`||'Configured ✓'}
                      </div>
                    )}
                  </div>
                  {/* Connect button */}
                  <div title={connecting?'Click another node to connect':'Click to start a connection'}
                    onClick={e=>{e.stopPropagation();if(connecting===node.id)setConnecting(null);else if(connecting)connect(node.id);else setConnecting(node.id)}}
                    style={{width:16,height:16,borderRadius:'50%',background:isConn?'#CC2200':'var(--panel)',border:'2px solid '+(isConn?'#CC2200':node.color),margin:'5px auto 0',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,.15)',transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',color:isConn?'#fff':node.color}}>
                    {isConn?'✕':'+'}
                  </div>
                </div>
              )
            })}

            {auto.nodes.length===0&&(
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                <div style={{fontSize:'52px',opacity:.2,marginBottom:'16px'}}>⚡</div>
                <div style={{fontSize:'16px',fontWeight:700,color:'var(--muted)',marginBottom:'6px',opacity:.6}}>Drag or click nodes from the left panel</div>
                <div style={{fontSize:'12px',color:'var(--muted)',opacity:.5}}>Start with a Trigger, then add Actions and Rules</div>
              </div>
            )}
          </div>
        </div>

        {/* Right config panel */}
        {selectedNode && (
          <div style={{width:'240px',flexShrink:0,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <span style={{fontSize:'12px',fontWeight:700}}>Configure</span>
              <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px',lineHeight:1}}>✕</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',background:selectedNode.color+'12',borderRadius:'9px',padding:'9px',marginBottom:'14px',border:'1px solid '+selectedNode.color+'25'}}>
              <div style={{width:30,height:30,borderRadius:'8px',background:selectedNode.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px'}}>{selectedNode.icon}</div>
              <div>
                <div style={{fontSize:'11px',fontWeight:700}}>{selectedNode.label}</div>
                <div style={{fontSize:'9px',color:selectedNode.color,fontWeight:600,textTransform:'uppercase',letterSpacing:'.5px'}}>{selectedNode.type.split('_')[0]}</div>
              </div>
            </div>
            <NodeConfig node={selectedNode} onChange={cfg=>setAuto(a=>({...a,nodes:a.nodes.map(n=>n.id===selectedNode.id?{...n,config:cfg}:n)}))}/>
            <div style={{marginTop:'14px',paddingTop:'12px',borderTop:'1px solid var(--border)'}}>
              <button onClick={()=>confirm({title:'Delete Node?',message:'Remove this step from the flow?',confirmLabel:'Delete',onConfirm:()=>{setAuto(a=>({...a,nodes:a.nodes.filter(n=>n.id!==selectedNode.id),connections:a.connections.filter(c=>c.from!==selectedNode.id&&c.to!==selectedNode.id)}));setSelected(null)}})}
                style={{width:'100%',background:'rgba(220,38,38,.06)',border:'1px solid rgba(220,38,38,.2)',borderRadius:'8px',color:'#DC2626',fontSize:'11px',fontWeight:700,padding:'8px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                🗑 Remove Node
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Connecting hint */}
      {connecting && (
        <div style={{position:'fixed',bottom:'20px',left:'50%',transform:'translateX(-50%)',background:'#1B2B4B',color:'#fff',borderRadius:'12px',padding:'10px 22px',fontSize:'12px',fontWeight:600,zIndex:100,boxShadow:'0 8px 28px rgba(0,0,0,.3)',display:'flex',alignItems:'center',gap:'10px'}}>
          <span style={{color:'#CC2200',fontSize:'16px'}}>🔗</span>
          Click the <strong style={{color:'#CC2200'}}>+</strong> button on another node to connect · Click anywhere to cancel
        </div>
      )}
    </div>
  )
}

// ── NODE CONFIG FORMS ──────────────────────────────────────────
function NodeConfig({ node, onChange }) {
  const cfg = node.config || {}
  const set = (k,v) => onChange({...cfg,[k]:v})
  const AGENTS = ['Lazer Farkas','Mendy Jankovits','Isaac Leibowitz','Yanky Lichtenstein','Gitty Fogel','Joel Rottenstein','Eli Hoffman','Avraham Weinberger']

  function F(label, key, type='text', opts=null, ph='', help='') {
    return (
      <div key={key} style={{marginBottom:'11px'}}>
        <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
        {opts
          ? <select value={cfg[key]||''} onChange={e=>set(key,e.target.value)} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none'}}>
              <option value="">Select...</option>
              {opts.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          : type==='textarea'
          ? <textarea value={cfg[key]||''} onChange={e=>set(key,e.target.value)} placeholder={ph} rows={3} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
          : <input type={type} value={cfg[key]||''} onChange={e=>set(key,e.target.value)} placeholder={ph} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none',boxSizing:'border-box'}}/>
        }
        {help&&<div style={{fontSize:'9px',color:'var(--muted)',marginTop:'3px',lineHeight:1.5}}>{help}</div>}
      </div>
    )
  }

  const VARS = <div style={{fontSize:'9px',color:'var(--muted)',marginTop:'-7px',marginBottom:'10px',lineHeight:1.6}}>Variables: {'{name} {agent} {addr} {price} {gci} {status} {stage}'}</div>
  const STATUSES = ['New','Hot','Active','Nurturing','Cold']
  const STAGES   = ['Offer Accepted','Under Shtar','Under Contract','Closed','Deal Fell Through']
  const LSTATUS  = ['Active','Accepted Offer','Under Contract','Sold','Expired']
  const PRIORITIES = ['normal','high','urgent']
  const UNITS    = ['minutes','hours','days','weeks']

  switch(node.type) {
    case 'trigger_new_contact':   return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Fires whenever a new contact is added to TargetOS — manually, via import, or from a lead form.</div>
    case 'trigger_status':        return <>{F('From Status','fromStatus','text',STATUSES)}{F('To Status','toStatus','text',STATUSES)}</>
    case 'trigger_no_activity':   return <>{F('Days of No Activity','days','number',null,'5')}{F('Apply To Status','applyTo','text',['All Contacts',...STATUSES])}</>
    case 'trigger_birthday':      return <>{F('Days Before Birthday','daysBefore','number',null,'3')}</>
    case 'trigger_anniversary':   return <>{F('Days Before Anniversary','daysBefore','number',null,'7')}</>
    case 'trigger_offer':         return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Fires when any deal moves to "Offer Accepted" stage in Production.</div>
    case 'trigger_deal':          return <>{F('Deal Stage','stage','text',STAGES)}</>
    case 'trigger_closed':        return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Fires when any deal is marked "Closed" in Production.</div>
    case 'trigger_listing_status':return <>{F('Listing Status','status','text',LSTATUS)}</>
    case 'trigger_new_listing':   return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Fires when a new listing is added to Target Listings.</div>
    case 'trigger_oh_visitor':    return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Fires when a visitor signs in at any open house.</div>
    case 'trigger_showing':       return <>{F('Interest Level','interest','text',['Any','Hot','Warm','Cold'])}</>
    case 'trigger_task_due':      return <>{F('Days Before Due','daysBefore','number',null,'1')}</>
    case 'trigger_task_overdue':  return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Fires when a task passes its due date without being completed.</div>
    case 'trigger_scheduled':     return <>{F('Frequency','freq','text',['Daily','Weekly','Monthly','Every Monday'])}{F('Time','time','time',null,'09:00')}</>
    case 'action_sms':            return <>{F('Send To','to','text',['contact','assigned_agent',...AGENTS])}{F('Message','message','textarea',null,'Hi {name}...')}{VARS}</>
    case 'action_email':          return <>{F('Send To','to','text',['contact','assigned_agent',...AGENTS])}{F('Subject','subject','text',null,'Message from Target Team')}{F('Body','body','textarea',null,'Hi {name}...')}{VARS}</>
    case 'action_internal_notify':return <>{F('Notify','to','text',['assigned_agent',...AGENTS])}{F('Message','message','textarea',null,'Heads up: {name} needs attention')}{VARS}</>
    case 'action_announce':       return <>{F('Title','title','text',null,'🏆 {agent} closed {addr}!')}{F('Body','body','textarea',null,'Congratulations!')}{VARS}</>
    case 'action_celebrate':      return <>{F('Message','message','textarea',null,'🎉 {agent} closed {addr} at {price}!')}{VARS}</>
    case 'action_task':           return <>{F('Task Title','title','text',null,'Follow up with {name}')}{F('Assign To','assignTo','text',['assigned_agent','Gitty Fogel',...AGENTS])}{F('Priority','priority','text',PRIORITIES)}{F('Due In','dueIn','text',['same day','1 day','2 days','3 days','1 week'])}</>
    case 'action_assign':         return <>{F('Assign To','agent','text',AGENTS)}</>
    case 'action_status':         return <>{F('New Status','status','text',STATUSES)}</>
    case 'action_tag':            return <>{F('Tag Name','tag','text',null,'VIP')}{F('Action','action','text',['Add Tag','Remove Tag'])}</>
    case 'action_deal_stage':     return <>{F('New Stage','stage','text',STAGES)}</>
    case 'action_listing_status': return <>{F('New Status','status','text',LSTATUS)}</>
    case 'action_webhook':        return <>{F('URL','url','text',null,'https://...')}{F('Method','method','text',['POST','GET'])}{F('Body (JSON)','body','textarea',null,'{"event": "{type}"}')}</>
    case 'action_whatsapp':       return <>{F('Send To','to','text',['contact','assigned_agent',...AGENTS])}{F('Message','message','textarea',null,'Hi {name}...')}<div style={{fontSize:'9px',color:'#D97706',marginTop:'-7px',marginBottom:'10px'}}>⚠ Requires WhatsApp Business setup</div>{VARS}</>
    case 'rule_wait':             return <>{F('Duration','duration','number',null,'1')}{F('Unit','unit','text',UNITS)}</>
    case 'rule_condition':        return <>{F('Field','field','text',['status','stage','source','assigned_agent','budget_max','role','tag'])}{F('Operator','operator','text',['equals','not equals','contains','in','is empty','is not empty','greater than','less than'])}{F('Value','value','text',null,'Hot,Active','Separate multiple values with commas')}</>
    case 'rule_split':            return <>{F('Group A %','pctA','number',null,'50')}{F('Group B %','pctB','number',null,'50')}<div style={{fontSize:'9px',color:'var(--muted)'}}>Creates two branches: A and B</div></>
    case 'rule_time_window':      return <>{F('Days','days','text',['Weekdays only','Mon-Thu','All days'])}{F('From','from','time',null,'09:00')}{F('To','to','time',null,'18:00')}</>
    case 'rule_goal':             return <>{F('Goal: Field','field','text',['status','stage'])}{F('Goal: Value','value','text',null,'Active')}<div style={{fontSize:'9px',color:'var(--muted)',marginTop:'-7px',marginBottom:'10px'}}>Contact exits automation if goal is met</div></>
    case 'rule_exit':             return <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.7}}>Contact exits the automation here. No further steps are taken.</div>
    default:                      return <div style={{fontSize:'11px',color:'var(--muted)'}}>No configuration needed.</div>
  }
}
