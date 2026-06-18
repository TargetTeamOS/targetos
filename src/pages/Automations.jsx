import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Card, Btn, Modal, ModalTitle, Input, Select, Grid2 } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { nowISO, formatActivity } from '../lib/time'

// ── NODE DEFINITIONS ─────────────────────────────────────────
const TRIGGER_NODES = [
  { type:'trigger_status',    label:'Contact Status Changes', icon:'👤', color:'#0EA5E9', category:'Contact' },
  { type:'trigger_deal',      label:'Deal Stage Changes',     icon:'📊', color:'#D97706', category:'Deal' },
  { type:'trigger_listing',   label:'Listing Status Changes', icon:'🏠', color:'#10B981', category:'Listing' },
  { type:'trigger_no_activity',label:'No Activity for X Days',icon:'⏰', color:'#7C3AED', category:'Contact' },
  { type:'trigger_birthday',  label:'Birthday Coming Up',     icon:'🎂', color:'#EC4899', category:'Contact' },
  { type:'trigger_new_contact',label:'New Contact Added',     icon:'✦',  color:'#0EA5E9', category:'Contact' },
  { type:'trigger_offer',     label:'Offer Accepted',         icon:'📝', color:'#CC2200', category:'Deal' },
  { type:'trigger_closed',    label:'Deal Closed',            icon:'🎉', color:'#16A34A', category:'Deal' },
  { type:'trigger_oh_visitor',label:'Open House Visitor',     icon:'🏡', color:'#F59E0B', category:'Listing' },
  { type:'trigger_new_listing',label:'New Listing Added',     icon:'🔑', color:'#10B981', category:'Listing' },
]

const ACTION_NODES = [
  { type:'action_sms',        label:'Send SMS',               icon:'💬', color:'#10B981', category:'Communication' },
  { type:'action_email',      label:'Send Email',             icon:'✉',  color:'#0EA5E9', category:'Communication' },
  { type:'action_task',       label:'Create Task',            icon:'✓',  color:'#7C3AED', category:'Action' },
  { type:'action_assign',     label:'Assign to Agent',        icon:'👤', color:'#E8650A', category:'Action' },
  { type:'action_status',     label:'Change Contact Status',  icon:'⇄',  color:'#CC2200', category:'Action' },
  { type:'action_tag',        label:'Tag / Untag Contact',    icon:'🏷', color:'#F59E0B', category:'Action' },
  { type:'action_notify',     label:'Notify Admin',           icon:'🔔', color:'#CC2200', category:'Action' },
  { type:'action_announce',   label:'Post Announcement',      icon:'📣', color:'#8B5CF6', category:'Action' },
  { type:'action_celebrate',  label:'Send Celebration',       icon:'🎊', color:'#16A34A', category:'Action' },
  { type:'action_webhook',    label:'Send Webhook',           icon:'⚡', color:'#64748B', category:'Advanced' },
]

const RULE_NODES = [
  { type:'rule_wait',         label:'Wait / Delay',           icon:'⏱', color:'#94A3B8', category:'Rule' },
  { type:'rule_condition',    label:'Conditional Split',      icon:'⟨⟩', color:'#E8650A', category:'Rule' },
  { type:'rule_split',        label:'Percentage Split',       icon:'⚖', color:'#7C3AED', category:'Rule' },
  { type:'rule_exit',         label:'Exit Flow',              icon:'↩', color:'#DC2626', category:'Rule' },
]

const ALL_NODE_TYPES = [...TRIGGER_NODES, ...ACTION_NODES, ...RULE_NODES]

// ── PRESET AUTOMATIONS ─────────────────────────────────────────
const PRESETS = [
  {
    id:'p1', name:'New Lead Welcome', description:'Automatically welcome new leads and assign to agent',
    active:true, lastFired:'Jun 15', count:12,
    nodes:[
      {id:'n1',type:'trigger_new_contact',label:'New Contact Added',icon:'✦',color:'#0EA5E9',x:300,y:60,config:{}},
      {id:'n2',type:'rule_wait',label:'Wait 10 minutes',icon:'⏱',color:'#94A3B8',x:300,y:180,config:{duration:10,unit:'minutes'}},
      {id:'n3',type:'action_sms',label:'Send Welcome SMS',icon:'💬',color:'#10B981',x:300,y:300,config:{message:'Hi {name}! This is Target Team. We received your inquiry and will be in touch shortly. Call us anytime: 845.424.1014'}},
      {id:'n4',type:'action_task',label:'Create Follow-up Task',icon:'✓',color:'#7C3AED',x:300,y:420,config:{title:'Follow up with {name}',priority:'urgent',assignTo:'assigned_agent'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
  {
    id:'p2', name:'Deal Under Contract', description:'Trigger when deal goes to Under Contract status',
    active:true, lastFired:'Jun 10', count:5,
    nodes:[
      {id:'n1',type:'trigger_deal',label:'Deal → Under Contract',icon:'📊',color:'#D97706',x:300,y:60,config:{stage:'Under Contract'}},
      {id:'n2',type:'action_celebrate',label:'Send Team Celebration',icon:'🎊',color:'#16A34A',x:300,y:180,config:{message:'🎉 Congratulations! {addr} is now Under Contract!'}},
      {id:'n3',type:'action_announce',label:'Post Announcement',icon:'📣',color:'#8B5CF6',x:300,y:300,config:{title:'Under Contract — {addr}',body:'Congratulations to {agent} on getting {addr} under contract!'}},
      {id:'n4',type:'action_task',label:'Start CTC Checklist',icon:'✓',color:'#7C3AED',x:300,y:420,config:{title:'Start CTC checklist for {addr}',assignTo:'secretary',priority:'urgent'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'}]
  },
  {
    id:'p3', name:'No Contact — 5 Days', description:'Follow up if no activity on a contact for 5 days',
    active:true, lastFired:'Jun 13', count:8,
    nodes:[
      {id:'n1',type:'trigger_no_activity',label:'No Activity — 5 Days',icon:'⏰',color:'#7C3AED',x:300,y:60,config:{days:5}},
      {id:'n2',type:'rule_condition',label:'Is contact Hot or Active?',icon:'⟨⟩',color:'#E8650A',x:300,y:180,config:{field:'status',operator:'in',value:'Hot,Active'}},
      {id:'n3',type:'action_task',label:'Create Follow-up Task',icon:'✓',color:'#7C3AED',x:180,y:320,config:{title:'Follow up — no contact 5 days',assignTo:'assigned_agent',priority:'high'}},
      {id:'n4',type:'rule_exit',label:'Exit — Not Hot/Active',icon:'↩',color:'#DC2626',x:420,y:320,config:{}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3',label:'Yes'},{from:'n2',to:'n4',label:'No'}]
  },
  {
    id:'p4', name:'Deal Closed — Celebration', description:'Celebrate when a deal closes and send closing gifts',
    active:true, lastFired:'Jun 10', count:3,
    nodes:[
      {id:'n1',type:'trigger_closed',label:'Deal Closed',icon:'🎉',color:'#16A34A',x:300,y:60,config:{}},
      {id:'n2',type:'action_celebrate',label:'Team Celebration Alert',icon:'🎊',color:'#16A34A',x:300,y:180,config:{message:'DEAL CLOSED! 🎉 {agent} closed {addr} at {price}!'}},
      {id:'n3',type:'action_announce',label:'Post to Team Feed',icon:'📣',color:'#8B5CF6',x:300,y:300,config:{title:'Closed! {addr}',body:'Congratulations {agent} on closing {addr} at {price}! GCI: {gci}'}},
      {id:'n4',type:'action_task',label:'Order Closing Gift',icon:'✓',color:'#7C3AED',x:300,y:420,config:{title:'Order closing gift for {addr} client',assignTo:'secretary',priority:'normal'}},
      {id:'n5',type:'rule_wait',label:'Wait 7 days',icon:'⏱',color:'#94A3B8',x:300,y:540,config:{duration:7,unit:'days'}},
      {id:'n6',type:'action_sms',label:'Thank You SMS to Client',icon:'💬',color:'#10B981',x:300,y:660,config:{message:'Hi {client_name}! It was a pleasure working with you. Enjoy your new home! — Target Team 845.424.1014'}},
    ],
    connections:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n4',to:'n5'},{from:'n5',to:'n6'}]
  },
  {
    id:'p5', name:'Birthday Reminder', description:'Remind agent 3 days before contact birthday',
    active:true, lastFired:'', count:0,
    nodes:[
      {id:'n1',type:'trigger_birthday',label:'Birthday in 3 Days',icon:'🎂',color:'#EC4899',x:300,y:60,config:{daysBefore:3}},
      {id:'n2',type:'action_notify',label:'Notify Assigned Agent',icon:'🔔',color:'#CC2200',x:300,y:180,config:{message:"{contact}'s birthday is in 3 days — great time to reach out!"}},
    ],
    connections:[{from:'n1',to:'n2'}]
  },
]

// ── MAIN AUTOMATIONS PAGE ──────────────────────────────────────
export function Automations() {
  const { confirm, ConfirmDialog } = useConfirm()
  const [view, setView] = useState('list') // list | builder
  const [automations, setAutomations] = useState(PRESETS)
  const [editing, setEditing] = useState(null) // automation being built
  const [showNew, setShowNew] = useState(false)

  function newAutomation() {
    const blank = {
      id: 'auto_'+Date.now(),
      name: 'New Automation',
      description: '',
      active: false,
      lastFired: '',
      count: 0,
      nodes: [],
      connections: [],
    }
    setEditing(blank)
    setView('builder')
  }

  function editAutomation(auto) {
    setEditing({...auto, nodes: auto.nodes.map(n=>({...n})), connections:[...auto.connections]})
    setView('builder')
  }

  function saveAutomation(auto) {
    setAutomations(prev => {
      const exists = prev.find(a=>a.id===auto.id)
      if(exists) return prev.map(a=>a.id===auto.id?auto:a)
      return [...prev, auto]
    })
    setView('list')
    setEditing(null)
  }

  function toggleActive(id) {
    setAutomations(prev => prev.map(a => a.id===id ? {...a,active:!a.active} : a))
  }

  function deleteAuto(id) {
    const a = automations.find(x=>x.id===id)
    confirm({
      title: 'Delete Automation?',
      message: `"${a?.name}" will be permanently deleted.`,
      confirmLabel: 'Delete',
      onConfirm: () => setAutomations(prev=>prev.filter(x=>x.id!==id))
    })
  }

  if(view==='builder' && editing) {
    return <AutomationBuilder automation={editing} onSave={saveAutomation} onCancel={()=>{setView('list');setEditing(null)}}/>
  }

  const active = automations.filter(a=>a.active).length
  const totalFired = automations.reduce((s,a)=>s+a.count,0)

  return (
    <div>
      <ConfirmDialog/>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[['Total',automations.length,'var(--text)'],['Active',active,'#16A34A'],['Paused',automations.length-active,'#D97706'],['Times Fired',totalFired,'#CC2200']].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'24px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>{automations.length} automations · Visual workflow builder</span>
        <Btn size="sm" onClick={newAutomation}>+ Create Automation</Btn>
      </div>

      {/* Automation cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))',gap:'12px'}}>
        {automations.map(auto=>{
          const trigger = auto.nodes.find(n=>n.type.startsWith('trigger_'))
          const actions = auto.nodes.filter(n=>n.type.startsWith('action_'))
          return (
            <div key={auto.id} style={{background:'var(--panel)',border:'1.5px solid '+(auto.active?'rgba(16,185,129,.3)':'var(--border)'),borderRadius:'14px',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
              {/* Status bar */}
              <div style={{height:4,background:auto.active?'#10B981':'var(--dim)'}}/>
              <div style={{padding:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:'14px',fontWeight:800,marginBottom:'3px'}}>{auto.name}</div>
                    <div style={{fontSize:'11px',color:'var(--muted)'}}>{auto.description}</div>
                  </div>
                  {/* Toggle */}
                  <div onClick={()=>toggleActive(auto.id)} style={{width:44,height:24,borderRadius:'99px',background:auto.active?'#10B981':'var(--border)',position:'relative',cursor:'pointer',flexShrink:0,marginLeft:'12px',transition:'background .2s'}}>
                    <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:auto.active?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                  </div>
                </div>

                {/* Flow preview */}
                <div style={{background:'var(--dim)',borderRadius:'10px',padding:'11px',marginBottom:'12px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}>
                    {trigger && (
                      <span style={{fontSize:'11px',fontWeight:600,padding:'4px 10px',borderRadius:'20px',background:trigger.color+'18',color:trigger.color,display:'flex',alignItems:'center',gap:'4px'}}>
                        {trigger.icon} {trigger.label}
                      </span>
                    )}
                    {auto.nodes.filter(n=>n.type.startsWith('rule_')).map((n,i)=>(
                      <React.Fragment key={i}>
                        <span style={{color:'var(--muted)',fontSize:'12px'}}>→</span>
                        <span style={{fontSize:'11px',fontWeight:600,padding:'4px 10px',borderRadius:'20px',background:n.color+'18',color:n.color}}>{n.icon} {n.label.split(' ').slice(0,2).join(' ')}</span>
                      </React.Fragment>
                    ))}
                    {actions.slice(0,2).map((n,i)=>(
                      <React.Fragment key={i}>
                        <span style={{color:'var(--muted)',fontSize:'12px'}}>→</span>
                        <span style={{fontSize:'11px',fontWeight:600,padding:'4px 10px',borderRadius:'20px',background:n.color+'18',color:n.color}}>{n.icon} {n.label.split(' ').slice(0,2).join(' ')}</span>
                      </React.Fragment>
                    ))}
                    {actions.length > 2 && <span style={{fontSize:'11px',color:'var(--muted)'}}>+{actions.length-2} more</span>}
                  </div>
                </div>

                {/* Stats */}
                <div style={{display:'flex',gap:'16px',marginBottom:'12px',fontSize:'11px',color:'var(--muted)'}}>
                  <span>🔢 {auto.nodes.length} steps</span>
                  <span>⚡ Fired {auto.count} times</span>
                  {auto.lastFired && <span>🕐 Last: {auto.lastFired}</span>}
                </div>

                {/* Actions */}
                <div style={{display:'flex',gap:'6px'}}>
                  <Btn size="xs" onClick={()=>editAutomation(auto)}>✏️ Edit Flow</Btn>
                  <Btn size="xs" variant="ghost" onClick={()=>alert('Running automation manually on test data...\n\nIn production this would execute all steps.')}>▶ Test Run</Btn>
                  <Btn size="xs" variant="danger" onClick={()=>deleteAuto(auto.id)}>🗑</Btn>
                </div>
              </div>
            </div>
          )
        })}

        {/* Add new card */}
        <div onClick={newAutomation} style={{background:'transparent',border:'2px dashed var(--border)',borderRadius:'14px',padding:'24px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',cursor:'pointer',minHeight:'200px',transition:'border-color .15s'}}
          onMouseEnter={e=>e.currentTarget.style.borderColor='#CC2200'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
          <div style={{fontSize:'32px',marginBottom:'10px'}}>+</div>
          <div style={{fontSize:'13px',fontWeight:700,color:'var(--muted)'}}>Create New Automation</div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'4px',textAlign:'center'}}>Visual drag-and-drop workflow builder</div>
        </div>
      </div>
    </div>
  )
}

// ── VISUAL AUTOMATION BUILDER ──────────────────────────────────
function AutomationBuilder({ automation, onSave, onCancel }) {
  const [auto, setAuto] = useState({...automation, nodes:[...automation.nodes], connections:[...automation.connections]})
  const [selectedNode, setSelectedNode] = useState(null)
  const [connecting, setConnecting] = useState(null) // node being connected from
  const [dragNode, setDragNode] = useState(null)
  const [dragOffset, setDragOffset] = useState({x:0,y:0})
  const [configNode, setConfigNode] = useState(null)
  const [showNameEdit, setShowNameEdit] = useState(false)
  const canvasRef = useRef()
  const { confirm, ConfirmDialog } = useConfirm()

  function addNode(nodeDef, x, y) {
    const id = 'n'+Date.now()
    const newNode = {
      id, type:nodeDef.type, label:nodeDef.label, icon:nodeDef.icon, color:nodeDef.color,
      x: x||300, y: (auto.nodes.length * 130) + 60,
      config: {}
    }
    setAuto(a=>({...a,nodes:[...a.nodes,newNode]}))
    setSelectedNode(id)
  }

  function deleteNode(id) {
    setAuto(a=>({
      ...a,
      nodes: a.nodes.filter(n=>n.id!==id),
      connections: a.connections.filter(c=>c.from!==id&&c.to!==id)
    }))
    setSelectedNode(null)
  }

  function connectNodes(fromId, toId, label) {
    if(fromId===toId) return
    const exists = auto.connections.find(c=>c.from===fromId&&c.to===toId)
    if(exists) return
    setAuto(a=>({...a,connections:[...a.connections,{from:fromId,to:toId,label:label||''}]}))
  }

  function removeConnection(fromId, toId) {
    setAuto(a=>({...a,connections:a.connections.filter(c=>!(c.from===fromId&&c.to===toId))}))
  }

  function startDrag(e, nodeId) {
    const node = auto.nodes.find(n=>n.id===nodeId)
    const rect = canvasRef.current.getBoundingClientRect()
    setDragNode(nodeId)
    setDragOffset({x:e.clientX-rect.left-node.x, y:e.clientY-rect.top-node.y})
    e.preventDefault()
  }

  function onMouseMove(e) {
    if(!dragNode) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - dragOffset.x
    const y = e.clientY - rect.top - dragOffset.y
    setAuto(a=>({...a,nodes:a.nodes.map(n=>n.id===dragNode?{...n,x:Math.max(10,x),y:Math.max(10,y)}:n)}))
  }

  function onMouseUp() { setDragNode(null) }

  const canvasH = Math.max(600, Math.max(...auto.nodes.map(n=>n.y+160), 0))

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 110px)'}}>
      <ConfirmDialog/>

      {/* Builder toolbar */}
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'12px 16px',marginBottom:'12px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button onClick={onCancel} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',fontWeight:600,display:'flex',alignItems:'center',gap:'5px'}}>← Back</button>
          <div style={{width:1,height:20,background:'var(--border)'}}/>
          {showNameEdit ? (
            <input value={auto.name} onChange={e=>setAuto(a=>({...a,name:e.target.value}))}
              onBlur={()=>setShowNameEdit(false)} onKeyDown={e=>e.key==='Enter'&&setShowNameEdit(false)}
              autoFocus style={{background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'8px',color:'var(--text)',fontSize:'15px',fontWeight:800,padding:'4px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
          ) : (
            <div onClick={()=>setShowNameEdit(true)} style={{fontSize:'15px',fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} title="Click to rename">
              {auto.name} <span style={{fontSize:'12px',color:'var(--muted)',fontWeight:400}}>✏</span>
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:'6px',background:auto.active?'rgba(16,185,129,.1)':'var(--dim)',borderRadius:'20px',padding:'4px 12px',cursor:'pointer'}} onClick={()=>setAuto(a=>({...a,active:!a.active}))}>
            <div style={{width:8,height:8,borderRadius:'50%',background:auto.active?'#10B981':'#94A3B8'}}/>
            <span style={{fontSize:'11px',fontWeight:700,color:auto.active?'#10B981':'#94A3B8'}}>{auto.active?'Active':'Paused'}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>{setAuto(a=>({...a,nodes:[],connections:[]}));setSelectedNode(null)}}>Clear</Btn>
          <Btn size="sm" onClick={()=>onSave(auto)}>Save Automation</Btn>
        </div>
      </div>

      <div style={{display:'flex',gap:'12px',flex:1,overflow:'hidden'}}>

        {/* Left panel — node library */}
        <div style={{width:'220px',flexShrink:0,overflowY:'auto',display:'flex',flexDirection:'column',gap:'10px'}}>
          {[['Triggers','trigger',TRIGGER_NODES],['Actions','action',ACTION_NODES],['Rules','rule',RULE_NODES]].map(([section,prefix,nodes])=>(
            <div key={section}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'6px',paddingLeft:'4px'}}>{section}</div>
              {nodes.map(node=>(
                <div key={node.type}
                  draggable
                  onDragStart={e=>{e.dataTransfer.setData('nodeType',JSON.stringify(node))}}
                  onClick={()=>addNode(node)}
                  style={{display:'flex',alignItems:'center',gap:'9px',padding:'9px 11px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'9px',marginBottom:'5px',cursor:'pointer',transition:'all .12s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=node.color;e.currentTarget.style.background=node.color+'08'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--panel)'}}>
                  <div style={{width:28,height:28,borderRadius:'7px',background:node.color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',flexShrink:0}}>{node.icon}</div>
                  <div>
                    <div style={{fontSize:'11px',fontWeight:600,lineHeight:1.3}}>{node.label}</div>
                    <div style={{fontSize:'9px',color:'var(--muted)'}}>{node.category}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{flex:1,overflow:'auto',background:'var(--dim)',borderRadius:'14px',border:'1px solid var(--border)',position:'relative'}}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{
            e.preventDefault()
            const nodeData = e.dataTransfer.getData('nodeType')
            if(nodeData) {
              const node = JSON.parse(nodeData)
              const rect = canvasRef.current.getBoundingClientRect()
              addNode(node, e.clientX-rect.left-70, e.clientY-rect.top-30)
            }
          }}>
          <div ref={canvasRef} style={{position:'relative',minHeight:canvasH+'px',minWidth:'600px'}}
            onMouseMove={onMouseMove} onMouseUp={onMouseUp}>

            {/* Grid dots background */}
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="var(--border)" opacity=".6"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)"/>

              {/* Connection arrows */}
              {auto.connections.map((conn,i)=>{
                const from = auto.nodes.find(n=>n.id===conn.from)
                const to   = auto.nodes.find(n=>n.id===conn.to)
                if(!from||!to) return null
                const fx = from.x + 80, fy = from.y + 50
                const tx = to.x + 80,   ty = to.y + 4
                const midY = (fy+ty)/2
                const path = `M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`
                const isYes = conn.label==='Yes'
                const isNo  = conn.label==='No'
                return (
                  <g key={i} onClick={()=>removeConnection(conn.from,conn.to)} style={{cursor:'pointer'}}>
                    <defs>
                      <marker id={`arrow${i}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                        <path d="M0,0 L0,6 L8,3 z" fill={isYes?'#16A34A':isNo?'#DC2626':'#CC2200'}/>
                      </marker>
                    </defs>
                    <path d={path} stroke={isYes?'#16A34A':isNo?'#DC2626':'#CC2200'} strokeWidth="2.5" fill="none" strokeDasharray={isNo?"6,3":undefined} markerEnd={`url(#arrow${i})`} opacity=".8"/>
                    {conn.label && (
                      <text x={(fx+tx)/2} y={midY-6} textAnchor="middle" fontSize="11" fontWeight="700" fill={isYes?'#16A34A':isNo?'#DC2626':'#94A3B8'} style={{fontFamily:'Inter,system-ui,sans-serif'}}>{conn.label}</text>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Nodes */}
            {auto.nodes.map(node=>(
              <div key={node.id}
                onMouseDown={e=>startDrag(e,node.id)}
                style={{
                  position:'absolute', left:node.x, top:node.y,
                  width:160, userSelect:'none',
                  filter: selectedNode===node.id ? 'drop-shadow(0 4px 12px rgba(204,34,0,.25))' : undefined,
                }}>
                <div
                  onClick={e=>{e.stopPropagation();setSelectedNode(node.id)}}
                  style={{
                    background:'var(--panel)',
                    border:'2px solid '+(selectedNode===node.id?node.color:'var(--border)'),
                    borderRadius:'12px', padding:'12px',
                    cursor:'grab', transition:'border-color .15s',
                    boxShadow: selectedNode===node.id?'0 4px 16px rgba(0,0,0,.12)':'0 2px 6px rgba(0,0,0,.06)',
                  }}>
                  {/* Node header */}
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                    <div style={{width:30,height:30,borderRadius:'8px',background:node.color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',flexShrink:0}}>{node.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'11px',fontWeight:700,lineHeight:1.3,color:'var(--text)'}}>{node.label}</div>
                      <div style={{fontSize:'9px',color:node.color,fontWeight:600,textTransform:'capitalize'}}>{node.type.split('_')[0]}</div>
                    </div>
                  </div>

                  {/* Config preview */}
                  {node.config && Object.keys(node.config).length > 0 && (
                    <div style={{fontSize:'9px',color:'var(--muted)',background:'var(--dim)',borderRadius:'6px',padding:'5px 7px',lineHeight:1.5,wordBreak:'break-word'}}>
                      {node.type==='rule_wait'?`Wait ${node.config.duration} ${node.config.unit||'days'}`:
                       node.type==='action_sms'||node.type==='action_email'?`"${(node.config.message||node.config.body||'').slice(0,40)}..."`:
                       node.config.stage||node.config.title||node.config.days&&`${node.config.days} days`||'Configured'}
                    </div>
                  )}
                </div>

                {/* Bottom connect dot */}
                <div title="Click to connect" onClick={e=>{e.stopPropagation();if(connecting&&connecting!==node.id){connectNodes(connecting,node.id);setConnecting(null)}else setConnecting(connecting===node.id?null:node.id)}}
                  style={{width:14,height:14,borderRadius:'50%',background:connecting===node.id?'#CC2200':'var(--panel)',border:'2px solid '+(connecting===node.id?'#CC2200':node.color),margin:'4px auto 0',cursor:'pointer',boxShadow:'0 2px 4px rgba(0,0,0,.15)',transition:'all .15s'}}/>
              </div>
            ))}

            {/* Empty state */}
            {auto.nodes.length === 0 && (
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                <div style={{fontSize:'48px',marginBottom:'14px',opacity:.3}}>⚡</div>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--muted)',marginBottom:'6px'}}>Drag nodes from the left panel</div>
                <div style={{fontSize:'12px',color:'var(--muted)'}}>Start with a Trigger, then add Actions</div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — node config */}
        {selectedNode && (() => {
          const node = auto.nodes.find(n=>n.id===selectedNode)
          if(!node) return null
          return (
            <div style={{width:'240px',flexShrink:0,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',overflowY:'auto'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
                <div style={{fontSize:'13px',fontWeight:700}}>Configure Node</div>
                <button onClick={()=>setSelectedNode(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px'}}>✕</button>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:'8px',background:node.color+'12',borderRadius:'9px',padding:'10px',marginBottom:'14px'}}>
                <div style={{width:32,height:32,borderRadius:'8px',background:node.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px'}}>{node.icon}</div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700}}>{node.label}</div>
                  <div style={{fontSize:'10px',color:node.color,fontWeight:600,textTransform:'capitalize'}}>{node.type.split('_')[0]}</div>
                </div>
              </div>

              {/* Config fields based on type */}
              <NodeConfig node={node} onChange={cfg=>setAuto(a=>({...a,nodes:a.nodes.map(n=>n.id===node.id?{...n,config:cfg}:n)}))}/>

              <div style={{marginTop:'16px',paddingTop:'14px',borderTop:'1px solid var(--border)'}}>
                <button onClick={()=>confirm({title:'Delete Node?',message:'Remove this step from the flow?',confirmLabel:'Delete',onConfirm:()=>deleteNode(selectedNode)})}
                  style={{width:'100%',background:'rgba(220,38,38,.07)',border:'1px solid rgba(220,38,38,.2)',borderRadius:'8px',color:'#DC2626',fontSize:'12px',fontWeight:700,padding:'9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                  🗑 Delete Node
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Connection hint */}
      {connecting && (
        <div style={{position:'fixed',bottom:'20px',left:'50%',transform:'translateX(-50%)',background:'#1B2B4B',color:'#fff',borderRadius:'10px',padding:'10px 20px',fontSize:'12px',fontWeight:600,zIndex:100,boxShadow:'0 8px 24px rgba(0,0,0,.3)'}}>
          🔗 Click the bottom dot of another node to connect · Press Esc to cancel
        </div>
      )}
    </div>
  )
}

// ── NODE CONFIG PANEL ──────────────────────────────────────────
function NodeConfig({ node, onChange }) {
  const cfg = node.config || {}
  const set = (k,v) => onChange({...cfg,[k]:v})

  const AGENTS_LIST = ['Lazer Farkas','Mendy Jankovits','Isaac Leibowitz','Yanky Lichtenstein','Gitty Fogel','Joel Rottenstein','Eli Hoffman','Avraham Weinberger']
  const STATUSES = ['New','Hot','Active','Nurturing','Cold']
  const STAGES = ['Offer Accepted','Under Shtar','Under Contract','Closed','Deal Fell Through']

  function field(label, key, type='text', options=null, placeholder='') {
    return (
      <div key={key} style={{marginBottom:'12px'}}>
        <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{label}</label>
        {options
          ? <select value={cfg[key]||''} onChange={e=>set(key,e.target.value)} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px',outline:'none'}}>
              <option value="">Select...</option>
              {options.map(o=><option key={o} value={o}>{o}</option>)}
            </select>
          : type==='textarea'
          ? <textarea value={cfg[key]||''} onChange={e=>set(key,e.target.value)} placeholder={placeholder} rows={3} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px',outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
          : <input type={type} value={cfg[key]||''} onChange={e=>set(key,e.target.value)} placeholder={placeholder} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px',outline:'none',boxSizing:'border-box'}}/>
        }
      </div>
    )
  }

  switch(node.type) {
    case 'trigger_status':    return <>{field('From Status','fromStatus','text',STATUSES)}{field('To Status','toStatus','text',STATUSES)}</>
    case 'trigger_deal':      return <>{field('Deal Stage','stage','text',STAGES)}</>
    case 'trigger_listing':   return <>{field('Listing Status','status','text',['Active','Accepted Offer','Under Contract','Sold'])}</>
    case 'trigger_no_activity': return <>{field('Days of Inactivity','days','number','',5)}</>
    case 'trigger_birthday':  return <>{field('Days Before Birthday','daysBefore','number','','3')}</>
    case 'trigger_closed':    return <div style={{fontSize:'12px',color:'var(--muted)'}}>Triggers when any deal stage changes to "Closed"</div>
    case 'trigger_offer':     return <div style={{fontSize:'12px',color:'var(--muted)'}}>Triggers when an offer is accepted on any listing</div>
    case 'action_sms':        return <>{field('SMS Message','message','textarea','','Hi {name}, this is Target Team...')}<div style={{fontSize:'10px',color:'var(--muted)',marginTop:'-8px',marginBottom:'12px'}}>Use {"{name}"} {"{agent}"} {"{addr}"} {"{price}"} as variables</div></>
    case 'action_email':      return <>{field('Subject','subject','text','','New listing just for you...')}{field('Email Body','body','textarea','','Hi {name}...')}</>
    case 'action_task':       return <>{field('Task Title','title','text','','Follow up with {name}')}{field('Priority','priority','text',['normal','high','urgent'])}{field('Assign To','assignTo','text',['assigned_agent',...AGENTS_LIST])}</>
    case 'action_assign':     return <>{field('Assign To Agent','agent','text',AGENTS_LIST)}</>
    case 'action_status':     return <>{field('New Status','status','text',STATUSES)}</>
    case 'action_tag':        return <>{field('Tag','tag','text','','{name} tagged')}{field('Action','action','text',['Add Tag','Remove Tag'])}</>
    case 'action_notify':     return <>{field('Message','message','textarea','','Heads up: {contact} needs attention')}</>
    case 'action_announce':   return <>{field('Title','title','text','','{agent} closed {addr}!')}{field('Message','body','textarea','','Congratulations!')}</>
    case 'action_celebrate':  return <>{field('Celebration Message','message','textarea','','🎉 {agent} closed {addr} at {price}!')}</>
    case 'rule_wait':         return <>{field('Duration','duration','number','','1')}{field('Unit','unit','text',['minutes','hours','days','weeks'])}</>
    case 'rule_condition':    return <>{field('Field','field','text',['status','stage','source','assigned_agent','budget_max'])}{field('Operator','operator','text',['equals','not equals','contains','in','greater than','less than'])}{field('Value','value','text','','Hot,Active')}</>
    case 'rule_split':        return <>{field('Group A %','pctA','number','','50')}{field('Group B %','pctB','number','','50')}</>
    case 'rule_exit':         return <div style={{fontSize:'12px',color:'var(--muted)'}}>Contact exits the automation at this point. No further steps are taken.</div>
    case 'action_webhook':    return <>{field('Webhook URL','url','text','','https://...')}{field('Method','method','text',['POST','GET'])}</>
    default:                  return <div style={{fontSize:'12px',color:'var(--muted)'}}>No configuration needed for this node type.</div>
  }
}
