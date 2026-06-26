// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Visual Call Flow Builder
// Full phone routing system with all real-world scenarios
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp }    from '../context/AppContext'
import { supabase }  from '../lib/supabase'
import { Btn }       from '../components/UI'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const NW = 210
const NH = 76

// ── ALL NODE TYPES ─────────────────────────────────────────────
const NODES = [
  // Triggers
  { type:'incoming',      label:'Incoming Call',        icon:'📞', color:'#10B981', cat:'trigger',  desc:'Every inbound call starts here' },
  { type:'after_hours',   label:'After Hours',          icon:'🌙', color:'#6366F1', cat:'trigger',  desc:'Trigger only outside business hours' },
  { type:'repeat_caller', label:'Repeat Caller',        icon:'🔁', color:'#14B8A6', cat:'trigger',  desc:'Caller has called before' },
  // Voice
  { type:'greeting',      label:'Play Greeting',        icon:'🔊', color:'#3B82F6', cat:'voice',    desc:'Speak a message to the caller (TTS)' },
  { type:'menu',          label:'IVR Menu',             icon:'🎛',  color:'#8B5CF6', cat:'voice',    desc:'Caller presses 1, 2, 3... to choose' },
  { type:'whisper',       label:'Agent Whisper',        icon:'🗣',  color:'#0EA5E9', cat:'voice',    desc:'Whisper info to agent before connecting' },
  // Routing
  { type:'condition',     label:'If / Condition',       icon:'🔀', color:'#F5A623', cat:'routing',  desc:'Branch YES/NO based on any condition' },
  { type:'dial',          label:'Dial Agent',           icon:'📱', color:'#CC2200', cat:'routing',  desc:'Ring a specific agent\'s cell' },
  { type:'round_robin',   label:'Round Robin',          icon:'🔄', color:'#6366F1', cat:'routing',  desc:'Rotate through a group of agents' },
  { type:'simultaneous',  label:'Ring All Agents',      icon:'📣', color:'#EC4899', cat:'routing',  desc:'Ring everyone at once, first to answer wins' },
  { type:'queue',         label:'Call Queue',           icon:'⏳', color:'#F97316', cat:'routing',  desc:'Hold caller in queue with music/updates' },
  { type:'forward',       label:'Forward to Number',   icon:'➡️',  color:'#84CC16', cat:'routing',  desc:'Forward to any external phone number' },
  // Actions
  { type:'voicemail',     label:'Voicemail',            icon:'📬', color:'#EC4899', cat:'action',   desc:'Record voicemail, transcribe, notify agent' },
  { type:'create_lead',   label:'Save as Lead',         icon:'👤', color:'#14B8A6', cat:'action',   desc:'Create/update contact in CRM automatically' },
  { type:'sms',           label:'Send SMS',             icon:'💬', color:'#84CC16', cat:'action',   desc:'Auto-text the caller' },
  { type:'email_notify',  label:'Email Agent',          icon:'📧', color:'#3B82F6', cat:'action',   desc:'Email the assigned agent about this call' },
  { type:'tag_contact',   label:'Tag Contact',          icon:'🏷',  color:'#8B5CF6', cat:'action',   desc:'Add a tag to the contact record' },
  { type:'create_task',   label:'Create Task',          icon:'✅', color:'#10B981', cat:'action',   desc:'Create a follow-up task for the agent' },
  { type:'record',        label:'Record Call',          icon:'⏺',  color:'#DC2626', cat:'action',   desc:'Start recording the call' },
  { type:'hangup',        label:'Hang Up',              icon:'📵', color:'#94A3B8', cat:'action',   desc:'End the call gracefully' },
]

const CATS = [
  { id:'trigger', label:'Triggers',  color:'#10B981' },
  { id:'voice',   label:'Voice',     color:'#3B82F6' },
  { id:'routing', label:'Routing',   color:'#CC2200' },
  { id:'action',  label:'Actions',   color:'#8B5CF6' },
]

const COLORS10 = ['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899','#14B8A6','#6366F1','#84CC16','#F97316']

function nodeDef(type) { return NODES.find(n => n.type === type) || NODES[0] }

function defaultCfg(type) {
  switch(type) {
    case 'menu':        return { text:'For sales press 1. For any agent press 0. To leave a voicemail press 9.', timeout:10, options:[
      { key:'1', label:'Sales',           say:'Connecting you to sales...', action:'dial' },
      { key:'2', label:'Specific Agent',  say:'One moment...', action:'dial' },
      { key:'0', label:'Any Agent',       say:'Connecting you to the next available agent...', action:'round_robin' },
      { key:'9', label:'Voicemail',       say:'Please leave your message after the tone.', action:'voicemail' },
    ]}
    case 'condition':   return { condition:'known_contact', yesLabel:'Known Contact', noLabel:'New Caller' }
    case 'greeting':    return { text:'Thank you for calling Target Team. Please hold while we connect you.', voice:'Polly.Joanna' }
    case 'dial':        return { agent_id:'', timeout:30, no_answer:'voicemail', record:true }
    case 'round_robin': return { agent_ids:[], timeout:30, no_answer:'voicemail', strategy:'fewest_calls', record:true }
    case 'simultaneous':return { agent_ids:[], timeout:30, no_answer:'voicemail', record:true }
    case 'queue':       return { music:true, announce_position:true, max_wait:300, check_interval:60 }
    case 'voicemail':   return { text:'Please leave your name, number, and a brief message.', max_length:120, transcribe:true, notify_agent:true, notify_sms:false }
    case 'create_lead': return { source:'Inbound Call', agent_assignment:'round_robin', notify_agent:true, skip_if_exists:true }
    case 'sms':         return { text:'Thanks for calling Target Team! An agent will call you back shortly.', send_to:'caller' }
    case 'email_notify':return { to:'assigned_agent', subject:'New inbound call', body:'{{caller_name}} called at {{time}}. {{voicemail_transcript}}' }
    case 'tag_contact': return { tag:'Called In', color:'blue' }
    case 'create_task': return { title:'Follow up with {{caller_name}}', priority:'high', assign_to:'assigned_agent', due:'today' }
    case 'whisper':     return { text:'Inbound call from {{caller_name}}. They are a {{contact_status}} lead.' }
    case 'forward':     return { number:'', record:true }
    case 'record':      return { notify_on_complete:true }
    case 'after_hours': return { start:'18:00', end:'09:00', days:['Mon','Tue','Wed','Thu','Fri'] }
    case 'repeat_caller':return { min_calls:2 }
    default:            return {}
  }
}

// ── NODE SVG COMPONENT ────────────────────────────────────────
function FlowNode({ node, selected, agents, onSelect, onMove, onDelete, onPortClick }) {
  const d = nodeDef(node.type)

  function onMouseDown(e) {
    if (e.target.closest('.port') || e.target.closest('.delbtn')) return
    e.preventDefault()
    e.stopPropagation()
    const ox = e.clientX - node.x, oy = e.clientY - node.y
    const mv = me => onMove(node.id, me.clientX - ox, me.clientY - oy)
    const up = ()  => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
    onSelect(node.id)
  }

  // Build output ports
  const ports = []
  if (node.type === 'condition') {
    ports.push({ id:'yes', label:node.config?.yesLabel||'YES', color:'#10B981', y: NH*0.3 })
    ports.push({ id:'no',  label:node.config?.noLabel||'NO',   color:'#DC2626', y: NH*0.7 })
  } else if (node.type === 'menu') {
    const opts = node.config?.options || []
    opts.forEach((o, i) => {
      ports.push({ id:'key_'+o.key, label:o.key, color:COLORS10[i%10], y: (NH/(opts.length+1))*(i+1) })
    })
  } else if (node.type === 'dial' || node.type === 'round_robin' || node.type === 'simultaneous') {
    ports.push({ id:'answered',   label:'Answered', color:'#10B981', y: NH*0.35 })
    ports.push({ id:'no_answer',  label:'No Answer', color:'#DC2626', y: NH*0.65 })
  } else if (node.type !== 'hangup' && d.cat !== 'trigger' || node.type === 'incoming') {
    ports.push({ id:'default', label:'', color:d.color, y: NH*0.5 })
  }

  const agentName = node.config?.agent_id ? agents.find(a=>a.id===node.config.agent_id)?.name?.split(' ')[0] : null
  const sub = node.type==='menu'         ? (node.config?.options?.length||0)+' options'
            : node.type==='condition'    ? (node.config?.condition||'').replace(/_/g,' ')
            : node.type==='dial'         ? (agentName||'tap to configure')
            : node.type==='round_robin'  ? (node.config?.agent_ids?.length||0)+' agents'
            : node.type==='simultaneous' ? (node.config?.agent_ids?.length||0)+' agents'
            : node.type==='greeting'     ? (node.config?.text||'').slice(0,26)+'...'
            : node.type==='voicemail'    ? (node.config?.transcribe?'transcribe + ':'')+'notify agent'
            : node.type==='create_lead'  ? (node.config?.source||'Inbound Call')
            : node.type==='forward'      ? (node.config?.number||'tap to set number')
            : node.type==='sms'          ? 'auto-text caller'
            : node.type==='create_task'  ? 'follow-up task'
            : node.type==='queue'        ? 'hold with music'
            : node.type==='record'       ? 'record call'
            : d.desc.slice(0,26)

  return (
    <g data-nid={node.id} transform={`translate(${node.x},${node.y})`} onMouseDown={onMouseDown} style={{cursor:'grab'}}>
      {/* Drop shadow */}
      <rect x={2} y={3} width={NW} height={NH} rx={10} fill="rgba(0,0,0,.10)" />
      {/* Card */}
      <rect x={0} y={0} width={NW} height={NH} rx={10}
        fill={selected ? d.color : '#ffffff'}
        stroke={selected ? d.color : '#E2E8F0'}
        strokeWidth={selected ? 2.5 : 1.5} />
      {/* Left stripe */}
      <rect x={0} y={0} width={6} height={NH} rx={3} fill={d.color} />
      {/* Icon */}
      <text x={26} y={47} fontSize={22} textAnchor="middle">{d.icon}</text>
      {/* Label */}
      <text x={44} y={32} fontSize={12} fontWeight={700}
        fill={selected?'#fff':'#1E293B'} fontFamily={ff}>{d.label}</text>
      {/* Sub */}
      <text x={44} y={50} fontSize={10}
        fill={selected?'rgba(255,255,255,.75)':'#64748B'} fontFamily={ff}
        fontStyle={sub==='tap to configure'?'italic':'normal'}>{sub}</text>

      {/* Delete btn (selected only, not on incoming) */}
      {selected && node.type !== 'incoming' && (
        <g className="delbtn" onClick={e=>{e.stopPropagation();onDelete(node.id)}} style={{cursor:'pointer'}}>
          <circle cx={NW-10} cy={10} r={8} fill="#DC2626"/>
          <text x={NW-10} y={14} fontSize={11} textAnchor="middle" fill="#fff" fontFamily={ff} style={{pointerEvents:'none'}}>✕</text>
        </g>
      )}

      {/* Input port */}
      {node.type !== 'incoming' && (
        <circle cx={0} cy={NH/2} r={6} fill="#fff" stroke={d.color} strokeWidth={2}/>
      )}

      {/* Output ports */}
      {ports.map(p => (
        <g key={p.id} className="port"
          onClick={e=>{e.stopPropagation(); onPortClick(node.id, p.id)}}
          style={{cursor:'crosshair'}}>
          <circle cx={NW} cy={p.y} r={7} fill={p.color} stroke="#fff" strokeWidth={2}/>
          {p.label && (
            <text x={NW-11} y={p.y+4} fontSize={8} textAnchor="end"
              fill={p.color} fontFamily={ff} fontWeight={700}>{p.label}</text>
          )}
        </g>
      ))}
    </g>
  )
}

// ── CONFIG PANEL ──────────────────────────────────────────────
function ConfigPanel({ node, agents, onSave, onClose }) {
  const d   = nodeDef(node.type)
  const [cfg, setCfg] = useState({...node.config})
  const set = (k,v) => setCfg(p=>({...p,[k]:v}))

  const F  = {fontFamily:ff}
  const Lbl = ({c,sub}) => (
    <div style={{marginBottom:4}}>
      <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em'}}>{c}</div>
      {sub && <div style={{fontSize:10,color:'var(--muted)',marginTop:1,fontStyle:'italic'}}>{sub}</div>}
    </div>
  )
  const TA = ({k,ph,rows=3,mb=10}) => (
    <textarea value={cfg[k]||''} onChange={e=>set(k,e.target.value)} placeholder={ph} rows={rows}
      style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,resize:'vertical',boxSizing:'border-box',marginBottom:mb}}/>
  )
  const Inp = ({k,ph,type='text',mb=10}) => (
    <input type={type} value={cfg[k]||''} onChange={e=>set(k,e.target.value)} placeholder={ph}
      style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,boxSizing:'border-box',marginBottom:mb}}/>
  )
  const AgSel = ({k,placeholder='— Select agent —'}) => (
    <select value={cfg[k]||''} onChange={e=>set(k,e.target.value)}
      style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
      <option value="">{placeholder}</option>
      {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
  const Chk = ({k,label}) => (
    <label style={{display:'flex',alignItems:'center',gap:7,marginBottom:8,cursor:'pointer',fontSize:13,color:'var(--text)',...F}}>
      <input type="checkbox" checked={!!cfg[k]} onChange={e=>set(k,e.target.checked)} style={{width:15,height:15,cursor:'pointer'}}/>
      {label}
    </label>
  )
  const AgentMulti = ({k}) => (
    <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:10}}>
      {agents.map(a=>{
        const ids=cfg[k]||[]
        const on=ids.includes(a.id)
        return (
          <button key={a.id} onClick={()=>set(k,on?ids.filter(x=>x!==a.id):[...ids,a.id])}
            style={{padding:'4px 10px',borderRadius:20,border:`1px solid ${on?'#CC2200':'var(--border)'}`,background:on?'rgba(204,34,0,.1)':'transparent',color:on?'#CC2200':'var(--muted)',fontSize:11,fontWeight:700,cursor:'pointer',...F}}>
            {on?'✓ ':''}{a.name.split(' ')[0]}
          </button>
        )
      })}
    </div>
  )

  // Menu option helpers
  const setOpt=(i,k,v)=>{const o=[...(cfg.options||[])];o[i]={...o[i],[k]:v};set('options',o)}
  const addOpt=()=>set('options',[...(cfg.options||[]),{key:String((cfg.options||[]).length+1),label:'',say:'',action:'dial'}])
  const delOpt=(i)=>{const o=[...(cfg.options||[])];o.splice(i,1);set('options',o)}

  const infoBox = (text, color='#FFF7ED', border='#F5A62344', textColor='#92400E') => (
    <div style={{padding:'8px 10px',background:color,borderRadius:8,border:`1px solid ${border}`,fontSize:11,color:textColor,lineHeight:1.5,marginBottom:10}}>{text}</div>
  )

  return (
    <div style={{width:320,borderLeft:'1px solid var(--border)',background:'var(--panel)',display:'flex',flexDirection:'column',flexShrink:0,height:'100%'}}>
      {/* Header */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <div style={{width:28,height:28,borderRadius:8,background:d.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{d.icon}</div>
        <div style={{flex:1,fontSize:13,fontWeight:800,color:'var(--text)'}}>{d.label}</div>
        <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'var(--muted)'}}>✕</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'14px'}}>

        {/* ── INCOMING ── */}
        {node.type==='incoming' && <>
          {infoBox('This is the entry point for every call. Connect it to the first step you want callers to experience — usually a Greeting or Condition check.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── AFTER HOURS ── */}
        {node.type==='after_hours' && <>
          {infoBox('This node triggers ONLY during after-hours times. Connect the YES port to what happens after hours, NO port to normal business hours flow.')}
          <Lbl c="Business hours start"/>
          <Inp k="end" ph="09:00" mb={10}/>
          <Lbl c="Business hours end"/>
          <Inp k="start" ph="18:00" mb={10}/>
        </>}

        {/* ── REPEAT CALLER ── */}
        {node.type==='repeat_caller' && <>
          {infoBox('Checks if this phone number has called before. YES = returning caller, NO = new caller.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
          <Lbl c="Minimum prior calls to qualify as repeat"/>
          <Inp k="min_calls" ph="2" type="number"/>
        </>}

        {/* ── GREETING ── */}
        {node.type==='greeting' && <>
          <Lbl c="What the caller hears" sub="Spoken by Amazon Polly text-to-speech"/>
          <TA k="text" ph="Thank you for calling Target Team. Please hold while we connect you." rows={4}/>
          <Lbl c="Voice"/>
          <select value={cfg.voice||'Polly.Joanna'} onChange={e=>set('voice',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="Polly.Joanna">Joanna (Female, US)</option>
            <option value="Polly.Matthew">Matthew (Male, US)</option>
            <option value="Polly.Amy">Amy (Female, UK)</option>
            <option value="Polly.Brian">Brian (Male, UK)</option>
          </select>
        </>}

        {/* ── IVR MENU ── */}
        {node.type==='menu' && <>
          <Lbl c="Menu prompt" sub="Exactly what the caller hears — mention each option"/>
          <TA k="text" ph="For sales press 1. For Mendy press 2. To leave a voicemail press 9." rows={4}/>
          <Lbl c="Timeout — seconds to wait for keypress"/>
          <Inp k="timeout" ph="10" type="number"/>

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,marginTop:4}}>
            <Lbl c="Keypress options"/>
            <button onClick={addOpt}
              style={{padding:'3px 9px',borderRadius:6,border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',fontSize:11,cursor:'pointer',...F}}>
              + Add key
            </button>
          </div>

          {(cfg.options||[]).map((opt,i)=>(
            <div key={i} style={{background:'var(--dim)',borderRadius:9,border:`2px solid ${COLORS10[i%10]}33`,padding:'10px 12px',marginBottom:8}}>
              {/* Key + Label row */}
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:34,height:34,borderRadius:8,background:COLORS10[i%10],display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <input value={opt.key||''} onChange={e=>setOpt(i,'key',e.target.value)}
                    style={{width:26,textAlign:'center',background:'transparent',border:'none',color:'#fff',fontSize:16,fontWeight:900,...F,outline:'none'}}/>
                </div>
                <input value={opt.label||''} onChange={e=>setOpt(i,'label',e.target.value)}
                  placeholder="Label (e.g. Sales, Lazer, Voicemail)"
                  style={{flex:1,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:12,...F}}/>
                <button onClick={()=>delOpt(i)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:14}}>✕</button>
              </div>

              {/* What to say */}
              <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em'}}>
                Say when pressed:
              </div>
              <input value={opt.say||''} onChange={e=>setOpt(i,'say',e.target.value)}
                placeholder={`"Connecting you to ${opt.label||'agent'}..." (leave blank for silence)`}
                style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:11,...F,boxSizing:'border-box',marginBottom:8}}/>

              {/* Hint */}
              <div style={{fontSize:10,color:COLORS10[i%10],fontStyle:'italic'}}>
                → Drag the <strong style={{color:COLORS10[i%10]}}>"{opt.key}"</strong> port → connect to the next node for this option
              </div>
            </div>
          ))}

          {infoBox('Each key gets its own arrow on the right side of this node. Connect each arrow to the step for that option — e.g. press 1 → Dial Agent, press 9 → Voicemail.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── CONDITION ── */}
        {node.type==='condition' && <>
          <Lbl c="Check if..."/>
          <select value={cfg.condition||'known_contact'} onChange={e=>set('condition',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="known_contact">Caller is a known contact in CRM</option>
            <option value="has_agent">Contact has an assigned agent</option>
            <option value="business_hours">Currently business hours (Mon-Fri 9am-6pm)</option>
            <option value="after_hours">Currently after hours</option>
            <option value="repeat_caller">Caller has called before</option>
            <option value="voicemail_only">Send directly to voicemail</option>
            <option value="hot_lead">Caller is tagged as Hot lead</option>
          </select>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#10B981',marginBottom:4,textTransform:'uppercase'}}>YES label</div>
              <input value={cfg.yesLabel||'YES'} onChange={e=>set('yesLabel',e.target.value)}
                style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #10B98155',background:'#10B98108',color:'#10B981',fontSize:12,...F,boxSizing:'border-box'}}/>
            </div>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:'#DC2626',marginBottom:4,textTransform:'uppercase'}}>NO label</div>
              <input value={cfg.noLabel||'NO'} onChange={e=>set('noLabel',e.target.value)}
                style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #DC262655',background:'#DC262608',color:'#DC2626',fontSize:12,...F,boxSizing:'border-box'}}/>
            </div>
          </div>
          {infoBox('Creates a ✅ YES port (green) and ❌ NO port (red) on the right. Connect each to a different next step.')}
        </>}

        {/* ── DIAL AGENT ── */}
        {node.type==='dial' && <>
          <Lbl c="Ring this agent's cell"/>
          <AgSel k="agent_id"/>
          <Lbl c="Ring for (seconds) before giving up"/>
          <Inp k="timeout" ph="30" type="number"/>
          <Lbl c="If no answer, go to..." sub="Connect the 'No Answer' port on this node"/>
          <select value={cfg.no_answer||'voicemail'} onChange={e=>set('no_answer',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="voicemail">Voicemail</option>
            <option value="next_agent">Try next agent</option>
            <option value="round_robin">Round Robin fallback</option>
            <option value="hangup">Hang up</option>
          </select>
          <Chk k="record" label="Record this call"/>
          <Chk k="whisper" label="Whisper caller info to agent before connecting"/>
          {infoBox('Two output ports: ✅ Answered (call connected) and ❌ No Answer (agent didn\'t pick up). Connect both.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── ROUND ROBIN ── */}
        {node.type==='round_robin' && <>
          <Lbl c="Agents in rotation"/>
          <AgentMulti k="agent_ids"/>
          <Lbl c="Strategy"/>
          <select value={cfg.strategy||'fewest_calls'} onChange={e=>set('strategy',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="fewest_calls">Fewest calls today (most fair)</option>
            <option value="sequential">Sequential order</option>
            <option value="random">Random</option>
          </select>
          <Lbl c="Ring each agent (seconds)"/>
          <Inp k="timeout" ph="30" type="number"/>
          <Chk k="record" label="Record calls"/>
          <Chk k="skip_busy" label="Skip agents who are on another call"/>
          {infoBox('Distributes calls evenly. Two output ports: ✅ Answered and ❌ No Answer (all agents unavailable).', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── RING ALL ── */}
        {node.type==='simultaneous' && <>
          <Lbl c="Ring all of these agents at once"/>
          <AgentMulti k="agent_ids"/>
          <Lbl c="Ring for (seconds) before giving up"/>
          <Inp k="timeout" ph="30" type="number"/>
          <Chk k="record" label="Record calls"/>
          {infoBox('Rings everyone simultaneously. First to answer wins. Good for urgent leads.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── QUEUE ── */}
        {node.type==='queue' && <>
          <Lbl c="Hold music"/>
          <Chk k="music" label="Play hold music"/>
          <Chk k="announce_position" label="Tell caller their position in queue"/>
          <Lbl c="Max hold time (seconds)"/>
          <Inp k="max_wait" ph="300" type="number"/>
          <Lbl c="How often to give caller an option to leave voicemail (seconds)"/>
          <Inp k="check_interval" ph="60" type="number"/>
        </>}

        {/* ── FORWARD ── */}
        {node.type==='forward' && <>
          <Lbl c="Forward to this phone number"/>
          <Inp k="number" ph="+18455551234"/>
          <Chk k="record" label="Record the forwarded call"/>
        </>}

        {/* ── WHISPER ── */}
        {node.type==='whisper' && <>
          <Lbl c="What to whisper to the agent (before connecting)" sub="Agent hears this before the caller is connected"/>
          <TA k="text" ph="Inbound call from {{caller_name}}. They are a {{contact_status}} lead."/>
          {infoBox('Available variables: {{caller_name}}, {{caller_number}}, {{contact_status}}, {{time}}, {{date}}', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── VOICEMAIL ── */}
        {node.type==='voicemail' && <>
          <Lbl c="Greeting before the beep"/>
          <TA k="text" ph="Please leave your name, number, and a brief message and we'll call you back."/>
          <Lbl c="Max recording length (seconds)"/>
          <Inp k="max_length" ph="120" type="number"/>
          <Chk k="transcribe"     label="Transcribe voicemail to text (Twilio AI)"/>
          <Chk k="notify_agent"   label="Send voicemail to assigned agent's email"/>
          <Chk k="notify_sms"     label="SMS the assigned agent when voicemail arrives"/>
          <Chk k="save_as_lead"   label="Auto-create contact if caller not in CRM"/>
        </>}

        {/* ── CREATE LEAD ── */}
        {node.type==='create_lead' && <>
          <Lbl c="Source tag for new contact"/>
          <Inp k="source" ph="Inbound Call"/>
          <Lbl c="Assign to agent"/>
          <select value={cfg.agent_assignment||'round_robin'} onChange={e=>set('agent_assignment',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="round_robin">Round robin (most fair)</option>
            <option value="fewest_leads">Agent with fewest leads</option>
            <option value="specific">Specific agent below</option>
          </select>
          {cfg.agent_assignment==='specific' && <AgSel k="agent_id" placeholder="— Choose agent —"/>}
          <Chk k="notify_agent"   label="Email agent about new lead"/>
          <Chk k="skip_if_exists" label="Skip if contact already in CRM"/>
          <Chk k="create_task"    label="Create follow-up task for assigned agent"/>
          {infoBox('Creates a Contact record in TargetOS from the caller\'s phone number. If the caller is already in your CRM, it will update their record instead of creating a duplicate.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── SMS ── */}
        {node.type==='sms' && <>
          <Lbl c="Message to send"/>
          <TA k="text" ph="Thanks for calling Target Team! An agent will call you back shortly."/>
          <Lbl c="Send to"/>
          <select value={cfg.send_to||'caller'} onChange={e=>set('send_to',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="caller">Caller's number</option>
            <option value="agent">Assigned agent</option>
            <option value="both">Both</option>
          </select>
          {infoBox('Variables: {{caller_name}}, {{caller_number}}, {{agent_name}}, {{time}}', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── EMAIL NOTIFY ── */}
        {node.type==='email_notify' && <>
          <Lbl c="Send email to"/>
          <select value={cfg.to||'assigned_agent'} onChange={e=>set('to',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="assigned_agent">Assigned agent</option>
            <option value="all_agents">All agents</option>
            <option value="admin">Admin (Yanky)</option>
          </select>
          <Lbl c="Subject"/>
          <Inp k="subject" ph="New inbound call"/>
          <Lbl c="Message body"/>
          <TA k="body" ph="{{caller_name}} called at {{time}}.\n\n{{voicemail_transcript}}"/>
          {infoBox('Variables: {{caller_name}}, {{caller_number}}, {{time}}, {{voicemail_transcript}}, {{agent_name}}', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── TAG CONTACT ── */}
        {node.type==='tag_contact' && <>
          <Lbl c="Tag to add"/>
          <Inp k="tag" ph="Called In"/>
          <Lbl c="Tag color"/>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
            {['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#94A3B8'].map(c=>(
              <div key={c} onClick={()=>set('color',c)}
                style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',border:cfg.color===c?'3px solid var(--text)':'2px solid transparent'}}/>
            ))}
          </div>
        </>}

        {/* ── CREATE TASK ── */}
        {node.type==='create_task' && <>
          <Lbl c="Task title"/>
          <Inp k="title" ph="Follow up with {{caller_name}}"/>
          <Lbl c="Priority"/>
          <select value={cfg.priority||'high'} onChange={e=>set('priority',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="normal">🟡 Normal</option>
            <option value="low">🟢 Low</option>
          </select>
          <Lbl c="Assign to"/>
          <select value={cfg.assign_to||'assigned_agent'} onChange={e=>set('assign_to',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="assigned_agent">Contact's assigned agent</option>
            <option value="round_robin">Round robin</option>
            <option value="specific">Specific agent</option>
          </select>
          {cfg.assign_to==='specific' && <AgSel k="agent_id"/>}
          <Lbl c="Due"/>
          <select value={cfg.due||'today'} onChange={e=>set('due',e.target.value)}
            style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,marginBottom:10}}>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="3days">In 3 days</option>
            <option value="1week">In 1 week</option>
          </select>
        </>}

        {/* ── RECORD ── */}
        {node.type==='record' && <>
          <Chk k="notify_on_complete" label="Notify agent when recording is ready"/>
          {infoBox('Starts recording from this point in the call. Recording will be saved to the Call Log and playable in TargetOS.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

        {/* ── HANGUP ── */}
        {node.type==='hangup' && <>
          {infoBox('Ends the call. No configuration needed. Connect this from any step that should terminate the call — e.g. after voicemail, or after a no-answer timeout.', 'var(--dim)', 'var(--border)', 'var(--muted)')}
        </>}

      </div>

      <div style={{padding:'12px 14px',borderTop:'1px solid var(--border)',flexShrink:0}}>
        <Btn onClick={()=>{onSave(node.id,cfg);onClose()}} style={{width:'100%'}}>✅ Apply</Btn>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export function CallFlow() {
  const { toast }  = useApp()
  const { agents } = useAgents()
  const navigate   = useNavigate()

  const [nodes,     setNodes]     = useState([{id:'start',type:'incoming',x:60,y:220,config:{}}])
  const [edges,     setEdges]     = useState([])
  const [selected,  setSelected]  = useState(null)
  const [pendingConnect, setPending] = useState(null) // {fromId, port}
  const [flowName,  setFlowName]  = useState('Main Call Flow')
  const [savedId,   setSavedId]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [showHelp,  setShowHelp]  = useState(false)
  const nextId = useRef(200)

  useEffect(()=>{ loadFlow() },[])

  async function loadFlow() {
    const {data} = await supabase.from('phone_ivr').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle()
    if (data?.flow_nodes?.length) {
      setNodes(data.flow_nodes)
      setEdges(data.flow_edges||[])
      setFlowName(data.name||'Main Call Flow')
      setSavedId(data.id)
    }
  }

  async function saveFlow() {
    setSaving(true)
    try {
      // Sync IVR menu_options from the menu node config
      const menuNode = nodes.find(n=>n.type==='menu')
      const greetNode = nodes.find(n=>n.type==='greeting')
      const payload = {
        name:          flowName,
        flow_nodes:    nodes,
        flow_edges:    edges,
        greeting_text: greetNode?.config?.text || menuNode?.config?.text || '',
        menu_options:  (menuNode?.config?.options||[]).map(o=>({key:o.key,label:o.label,say:o.say,action:'extension',value:''})),
        updated_at:    new Date().toISOString(),
      }
      if (savedId) {
        await supabase.from('phone_ivr').update(payload).eq('id',savedId)
      } else {
        const {data} = await supabase.from('phone_ivr').insert({...payload,is_active:false,voicemail_extension:'9',created_at:new Date().toISOString()}).select().single()
        setSavedId(data.id)
      }
      toast('✅ Flow saved')
    } catch(e) { toast('Save failed: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  function addNode(type) {
    const id = 'n'+(++nextId.current)
    setNodes(p=>[...p,{id,type,x:250+Math.random()*180,y:80+Math.random()*280,config:defaultCfg(type)}])
  }

  function moveNode(id,x,y) {
    setNodes(p=>p.map(n=>n.id===id?{...n,x:Math.max(0,x),y:Math.max(0,y)}:n))
  }

  function deleteNode(id) {
    setNodes(p=>p.filter(n=>n.id!==id))
    setEdges(p=>p.filter(e=>e.from!==id&&e.to!==id))
    if (selected===id) setSelected(null)
  }

  function updateCfg(id,cfg) {
    setNodes(p=>p.map(n=>n.id===id?{...n,config:cfg}:n))
  }

  function handlePortClick(fromId, port) {
    setPending({fromId, port})
  }

  // SVG elements don't support .closest('[data-nid]') reliably
  // Walk up the DOM tree manually to find the parent <g data-nid>
  function findNodeId(el) {
    let cur = el
    while (cur && cur !== document.body) {
      if (cur.dataset && cur.dataset.nid) return cur.dataset.nid
      cur = cur.parentElement || cur.parentNode
    }
    return null
  }

  function handleCanvasClick(e) {
    if (!pendingConnect) { setSelected(null); return }
    const toId = findNodeId(e.target)
    if (toId && toId !== pendingConnect.fromId) {
      const eid = `e_${pendingConnect.fromId}_${pendingConnect.port}_${toId}_${Date.now()}`
      setEdges(p => [...p, { id:eid, from:pendingConnect.fromId, port:pendingConnect.port, to:toId }])
    }
    setPending(null)
  }

  function deleteEdge(id) {
    setEdges(p=>p.filter(e=>e.id!==id))
  }

  function edgePath(edge) {
    const from=nodes.find(n=>n.id===edge.from)
    const to=nodes.find(n=>n.id===edge.to)
    if (!from||!to) return ''
    const opts = from.config?.options||[]
    let sy = from.y+NH/2
    if (edge.port==='yes')          sy = from.y+NH*0.3
    else if (edge.port==='no')      sy = from.y+NH*0.7
    else if (edge.port==='answered')  sy = from.y+NH*0.35
    else if (edge.port==='no_answer') sy = from.y+NH*0.65
    else if (edge.port?.startsWith('key_')) {
      const key = edge.port.replace('key_','')
      const i = opts.findIndex(o=>o.key===key)
      if (i>=0) sy = from.y+(NH/(opts.length+1))*(i+1)
    }
    const x1=from.x+NW, y1=sy, x2=to.x, y2=to.y+NH/2
    const cx=(x1+x2)/2
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
  }

  function edgeColor(edge) {
    if (edge.port==='yes'||edge.port==='answered') return '#10B981'
    if (edge.port==='no'||edge.port==='no_answer') return '#DC2626'
    if (edge.port?.startsWith('key_')) {
      const from=nodes.find(n=>n.id===edge.from)
      const opts=from?.config?.options||[]
      const i=opts.findIndex(o=>o.key===edge.port.replace('key_',''))
      return COLORS10[i>=0?i%10:0]
    }
    return '#94A3B8'
  }

  function edgeLabel(edge) {
    if (edge.port==='yes')       return '✅ YES'
    if (edge.port==='no')        return '❌ NO'
    if (edge.port==='answered')  return '✅ Answered'
    if (edge.port==='no_answer') return '❌ No Answer'
    if (edge.port?.startsWith('key_')) {
      const key=edge.port.replace('key_','')
      const from=nodes.find(n=>n.id===edge.from)
      const opt=from?.config?.options?.find(o=>o.key===key)
      return `Press ${key}${opt?.label?' · '+opt.label:''}`
    }
    return ''
  }

  const selectedNode = nodes.find(n=>n.id===selected)
  const catNodes = (cat) => NODES.filter(n=>n.cat===cat && n.type!=='incoming')

  return (
    <div style={{fontFamily:ff,height:'calc(100vh - 48px)',display:'flex',flexDirection:'column',overflow:'hidden'}}>

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderBottom:'1px solid var(--border)',flexShrink:0,background:'var(--panel)',flexWrap:'wrap'}}>
        <button onClick={()=>navigate('/calls')}
          style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--muted)',...F,display:'flex',alignItems:'center',gap:3}}>
          ← Phone System
        </button>
        <div style={{width:1,height:16,background:'var(--border)'}}/>
        <div style={{fontSize:15,fontWeight:800,color:'var(--text)'}}>🔀 Call Flow Builder</div>
        <input value={flowName} onChange={e=>setFlowName(e.target.value)}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,...F,width:180}}/>
        <div style={{flex:1}}/>
        <div style={{fontSize:11,color:'var(--muted)',display:'none'}}>Click palette → node appears. Click node to configure. Drag port (circle) → another node to connect.</div>
        <button onClick={()=>setShowHelp(h=>!h)}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',...F}}>
          {showHelp?'Hide help':'? Help'}
        </button>
        <button onClick={()=>{if(window.confirm('Clear canvas?')){setNodes([{id:'start',type:'incoming',x:60,y:220,config:{}}]);setEdges([]);setSelected(null)}}}
          style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',...F}}>
          Clear
        </button>
        <Btn onClick={saveFlow} loading={saving}>💾 Save Flow</Btn>
      </div>

      {/* Help bar */}
      {showHelp && (
        <div style={{padding:'8px 14px',background:'#EFF6FF',borderBottom:'1px solid #BFDBFE',display:'flex',gap:20,flexWrap:'wrap'}}>
          {[
            ['1️⃣','Click any node in the palette to add it to the canvas'],
            ['2️⃣','Click a node on the canvas to open its config panel on the right'],
            ['3️⃣','Drag from the colored circle (port) on the right of a node → click another node to connect them'],
            ['4️⃣','Click any arrow to delete it · Click ✕ on a node to delete it'],
            ['5️⃣','Hit Save Flow when done'],
          ].map(([n,t])=>(
            <div key={n} style={{display:'flex',gap:5,alignItems:'center',fontSize:11,color:'#1E40AF'}}>
              <span style={{fontSize:14}}>{n}</span><span>{t}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* Left palette */}
        <div style={{width:160,borderRight:'1px solid var(--border)',background:'var(--dim)',overflowY:'auto',flexShrink:0,padding:'8px 6px'}}>
          {CATS.map(cat=>(
            <div key={cat.id}>
              <div style={{fontSize:9,fontWeight:700,color:cat.color,textTransform:'uppercase',letterSpacing:'.07em',padding:'6px 6px 3px',marginTop:cat.id==='trigger'?0:8}}>
                {cat.label}
              </div>
              {catNodes(cat.id).map(t=>(
                <div key={t.type} onClick={()=>addNode(t.type)}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderRadius:7,cursor:'pointer',marginBottom:2,border:'1px solid transparent',background:'var(--panel)',transition:'all .1s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color;e.currentTarget.style.background=t.color+'12'}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='transparent';e.currentTarget.style.background='var(--panel)'}}>
                  <span style={{fontSize:14,flexShrink:0}}>{t.icon}</span>
                  <span style={{fontSize:10,fontWeight:700,color:'var(--text)',lineHeight:1.3}}>{t.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{flex:1,position:'relative',overflow:'hidden',background:'var(--dim)',cursor:pendingConnect?'crosshair':'default'}}>
          {/* Grid */}
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0}}>
            <defs>
              <pattern id="grid" width={28} height={28} patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#E2E8F0" strokeWidth={.8}/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)"/>
          </svg>

          {/* Flow SVG */}
          <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',zIndex:1}}
            onClick={handleCanvasClick}>
            <defs>
              {['#94A3B8','#10B981','#DC2626',...COLORS10].map((c,i)=>(
                <marker key={i} id={`arr${i}`} markerWidth={7} markerHeight={7} refX={5} refY={3} orient="auto">
                  <path d="M 0 0 L 5 3 L 0 6 z" fill={c}/>
                </marker>
              ))}
            </defs>

            {/* Edges */}
            {edges.map(edge=>{
              const p=edgePath(edge)
              const c=edgeColor(edge)
              const lbl=edgeLabel(edge)
              const mi = c==='#10B981'?1:c==='#DC2626'?2:0
              const from=nodes.find(n=>n.id===edge.from)
              const to=nodes.find(n=>n.id===edge.to)
              const mx=from&&to?(from.x+NW+to.x)/2:0
              const my=from&&to?(from.y+to.y)/2+20:0
              return (
                <g key={edge.id}>
                  <path d={p} fill="none" stroke="transparent" strokeWidth={14} style={{cursor:'pointer'}}
                    onClick={e=>{e.stopPropagation();deleteEdge(edge.id)}}/>
                  <path d={p} fill="none" stroke={c} strokeWidth={2.5} opacity={.75} markerEnd={`url(#arr${mi})`}/>
                  {lbl&&(
                    <g>
                      <rect x={mx-32} y={my-9} width={64} height={16} rx={8} fill={c} opacity={.9}/>
                      <text x={mx} y={my+4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily={ff}>{lbl}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(node=>(
              <g key={node.id} data-nid={node.id}>
                <FlowNode
                  node={node}
                  selected={selected===node.id}
                  agents={agents}
                  onSelect={id=>{setSelected(id);setPending(null)}}
                  onMove={moveNode}
                  onDelete={deleteNode}
                  onPortClick={handlePortClick}
                />
              </g>
            ))}
          </svg>

          {/* Connect hint */}
          {pendingConnect && (
            <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',padding:'7px 18px',borderRadius:20,background:'#CC2200',color:'#fff',fontSize:12,fontWeight:700,zIndex:10,pointerEvents:'none',boxShadow:'0 4px 16px rgba(0,0,0,.25)'}}>
              Now click any node to connect the arrow →
            </div>
          )}

          {/* Empty state */}
          {nodes.length<=1 && (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
              <div style={{textAlign:'center',padding:32,opacity:.4}}>
                <div style={{fontSize:40,marginBottom:8}}>🔀</div>
                <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>Click any node in the palette to start building your call flow</div>
              </div>
            </div>
          )}
        </div>

        {/* Config panel */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            agents={agents}
            onSave={updateCfg}
            onClose={()=>setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
