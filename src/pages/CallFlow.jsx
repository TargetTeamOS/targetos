// TargetOS V2 — Call Flow Builder
// Full drag-to-connect visual flow editor
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp }    from '../context/AppContext'
import { supabase }  from '../lib/supabase'
import { Btn }       from '../components/UI'
import { useAgents } from '../lib/hooks'

const ff  = 'Inter, system-ui, sans-serif'
const NW  = 210  // node width
const NH  = 72   // node height
const PR  = 8    // port radius
const PHZ = 20   // port hit zone radius

const NODE_DEFS = [
  { type:'incoming',   label:'Incoming Call',  color:'#10B981', icon:'📞', cat:'trigger' },
  { type:'greeting',   label:'Play Greeting',  color:'#3B82F6', icon:'🔊', cat:'voice'   },
  { type:'menu',       label:'IVR Menu',       color:'#8B5CF6', icon:'🎛', cat:'voice'   },
  { type:'condition',  label:'If / Condition', color:'#F5A623', icon:'🔀', cat:'routing' },
  { type:'dial',       label:'Dial Agent',     color:'#CC2200', icon:'📲', cat:'routing' },
  { type:'roundrobin', label:'Round Robin',    color:'#6366F1', icon:'🔄', cat:'routing' },
  { type:'ringall',    label:'Ring All',       color:'#EC4899', icon:'📣', cat:'routing' },
  { type:'voicemail',  label:'Voicemail',      color:'#F97316', icon:'📬', cat:'action'  },
  { type:'savelead',   label:'Save as Lead',   color:'#14B8A6', icon:'💾', cat:'action'  },
  { type:'sms',        label:'Send SMS',       color:'#84CC16', icon:'💬', cat:'action'  },
  { type:'hangup',     label:'Hang Up',        color:'#94A3B8', icon:'🔴', cat:'action'  },
]

const CATS = [
  { id:'trigger', label:'Trigger',  color:'#10B981' },
  { id:'voice',   label:'Voice',    color:'#3B82F6' },
  { id:'routing', label:'Routing',  color:'#CC2200' },
  { id:'action',  label:'Actions',  color:'#8B5CF6' },
]

const PORT_COLORS = ['#CC2200','#3B82F6','#10B981','#F5A623','#8B5CF6','#EC4899','#14B8A6','#6366F1']

function nd(type) { return NODE_DEFS.find(n => n.type === type) || NODE_DEFS[0] }

function defCfg(type) {
  if (type === 'menu')       return { text:'For sales press 1. For any agent press 0. To leave a voicemail press 9.', timeout:10, options:[{key:'1',label:'Sales',say:'Connecting to sales...'},{key:'0',label:'Any Agent',say:'Connecting to next available agent...'},{key:'9',label:'Voicemail',say:'Please leave your message after the tone.'}] }
  if (type === 'condition')  return { condition:'known_contact', yesLabel:'Yes', noLabel:'No' }
  if (type === 'greeting')   return { text:'Thank you for calling Target Team. Please hold while we connect you.' }
  if (type === 'dial')       return { agent_id:'', timeout:30 }
  if (type === 'roundrobin') return { agent_ids:[], timeout:30 }
  if (type === 'ringall')    return { agent_ids:[], timeout:30 }
  if (type === 'voicemail')  return { text:'Please leave your name and number after the tone.', transcribe:true, notify_agent:true, max_length:120 }
  if (type === 'savelead')   return { source:'Inbound Call', assign:'round_robin' }
  if (type === 'sms')        return { text:'Thanks for calling Target Team! An agent will reach out shortly.', send_to:'caller' }
  return {}
}

// Get output ports for a node type
function getPorts(node) {
  const cfg  = node.config || {}
  const opts = cfg.options || []
  if (node.type === 'condition') return [
    { id:'yes', label: cfg.yesLabel || 'YES', color:'#10B981', y: NH * 0.33 },
    { id:'no',  label: cfg.noLabel  || 'NO',  color:'#DC2626', y: NH * 0.67 },
  ]
  if (node.type === 'menu') return opts.map(function(o, i) {
    return { id:'key_' + o.key, label:'Press ' + o.key, color: PORT_COLORS[i % PORT_COLORS.length], y: (NH / (opts.length + 1)) * (i + 1) }
  })
  if (node.type === 'dial' || node.type === 'roundrobin' || node.type === 'ringall') return [
    { id:'answered', label:'Answered', color:'#10B981', y: NH * 0.33 },
    { id:'noanswer', label:'No Answer', color:'#DC2626', y: NH * 0.67 },
  ]
  if (node.type === 'hangup') return []
  return [{ id:'out', label:'Next', color: nd(node.type).color, y: NH * 0.5 }]
}

// ── SVG NODE ────────────────────────────────────────────────────
function FlowNode({ node, selected, agents, connectedPorts, dragPort, onMouseDownNode, onMouseDownPort, onClickNode }) {
  const def    = nd(node.type)
  const cfg    = node.config || {}
  const ports  = getPorts(node)

  // Subtitle
  let sub = ''
  if (node.type === 'menu')        sub = (cfg.options || []).length + ' options'
  else if (node.type === 'condition') sub = (cfg.condition || '').split('_').join(' ')
  else if (node.type === 'dial')    sub = agents && cfg.agent_id ? (agents.find(a => a.id === cfg.agent_id) || {}).name || 'tap to configure' : 'tap to configure'
  else if (node.type === 'roundrobin' || node.type === 'ringall') sub = (cfg.agent_ids || []).length + ' agents'
  else if (node.type === 'greeting') sub = (cfg.text || '').slice(0, 28)
  else if (node.type === 'sms')     sub = (cfg.text || '').slice(0, 28)
  else if (node.type === 'voicemail') sub = cfg.transcribe ? 'with transcription' : 'no transcription'
  else sub = def.label.toLowerCase()

  const fill   = selected ? def.color : 'var(--panel)'
  const stroke = selected ? def.color : 'var(--border)'
  const sw     = selected ? 2.5 : 1.5
  const tFill  = selected ? '#fff' : 'var(--text)'
  const sFill  = selected ? 'rgba(255,255,255,.7)' : 'var(--muted)'

  return (
    <g transform={'translate(' + node.x + ',' + node.y + ')'}>
      {/* Shadow */}
      <rect x={3} y={4} width={NW} height={NH} rx={11} fill="rgba(0,0,0,.08)" />
      {/* Body — drag handle */}
      <rect x={0} y={0} width={NW} height={NH} rx={11} fill={fill} stroke={stroke} strokeWidth={sw}
        style={{cursor:'grab'}}
        onMouseDown={function(e) { onMouseDownNode(e, node.id) }}
        onClick={function(e) { e.stopPropagation(); onClickNode(node.id) }}
      />
      {/* Color bar */}
      <rect x={0} y={0} width={7} height={NH} rx={5} fill={def.color} />
      {/* Icon */}
      <text x={20} y={NH/2 - 6} fontSize={18} dominantBaseline="middle">{def.icon}</text>
      {/* Label */}
      <text x={46} y={NH/2 - 6} fontSize={13} fontWeight={700} fill={tFill} fontFamily={ff} dominantBaseline="middle">{def.label}</text>
      {/* Sub */}
      <text x={46} y={NH/2 + 12} fontSize={10} fill={sFill} fontFamily={ff} dominantBaseline="middle"
        style={{overflow:'hidden'}}>{sub.length > 30 ? sub.slice(0,28) + '…' : sub}</text>

      {/* Input port (left) — all nodes except incoming */}
      {node.type !== 'incoming' && (
        <circle cx={0} cy={NH/2} r={PR} fill="var(--panel)" stroke={def.color} strokeWidth={2} />
      )}

      {/* Delete button when selected */}
      {selected && node.type !== 'incoming' && (
        <g style={{cursor:'pointer'}} onMouseDown={function(e) { e.stopPropagation() }}
          onClick={function(e) { e.stopPropagation(); onClickNode('__delete__' + node.id) }}>
          <circle cx={NW - 11} cy={11} r={9} fill="#DC2626" />
          <text x={NW - 11} y={11} textAnchor="middle" dominantBaseline="middle" fontSize={14} fill="#fff" fontFamily={ff} fontWeight={700}>×</text>
        </g>
      )}

      {/* Output ports (right) */}
      {ports.map(function(p) {
        const isConnected = connectedPorts && connectedPorts.has(node.id + ':' + p.id)
        const isActive    = dragPort && dragPort.fromId === node.id && dragPort.portId === p.id
        return (
          <g key={p.id}>
            {/* Port hit zone */}
            <circle cx={NW} cy={p.y} r={PHZ} fill="transparent" style={{cursor:'crosshair'}}
              onMouseDown={function(e) { e.stopPropagation(); e.preventDefault(); onMouseDownPort(e, node.id, p.id) }} />
            {/* Port visual */}
            <circle cx={NW} cy={p.y} r={isActive ? PR + 3 : PR}
              fill={isConnected ? p.color : 'var(--panel)'}
              stroke={p.color} strokeWidth={isActive ? 3 : 2}
              style={{cursor:'crosshair', transition:'r .1s'}}
              onMouseDown={function(e) { e.stopPropagation(); e.preventDefault(); onMouseDownPort(e, node.id, p.id) }}
            />
            {/* Port label */}
            {p.label && (
              <text x={NW - PR - 5} y={p.y} textAnchor="end" dominantBaseline="middle"
                fontSize={9} fontWeight={700} fill={p.color} fontFamily={ff}
                style={{pointerEvents:'none', userSelect:'none'}}>
                {p.label}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

// ── CONFIG PANEL ─────────────────────────────────────────────────
function ConfigPanel({ node, agents, onSave, onClose }) {
  const def = nd(node.type)
  const [cfg, setCfg] = useState(Object.assign({}, node.config || {}))
  const safeAgents = agents || []

  function set(k, v) { setCfg(function(p) { return Object.assign({}, p, {[k]: v}) }) }

  function setOpt(i, k, v) {
    const o = (cfg.options || []).slice()
    o[i] = Object.assign({}, o[i], {[k]: v})
    set('options', o)
  }
  function addOpt() {
    const o = (cfg.options || []).slice()
    const nextKey = o.length < 9 ? String(o.length + 1) : '#'
    o.push({ key: nextKey, label: '', say: '' })
    set('options', o)
  }
  function delOpt(i) {
    const o = (cfg.options || []).slice()
    o.splice(i, 1)
    set('options', o)
  }

  const inp = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }
  const ta  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }
  const sel = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }
  const lbl = { fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }
  const info = { padding:'9px 12px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)', lineHeight:1.6 }
  const row  = { marginBottom:14 }

  return (
    <div style={{width:310, borderLeft:'1px solid var(--border)', background:'var(--panel)', display:'flex', flexDirection:'column', flexShrink:0, fontFamily:ff, overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'13px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, background:def.color, flexShrink:0}}>
        <span style={{fontSize:20}}>{def.icon}</span>
        <div style={{flex:1, fontSize:14, fontWeight:800, color:'#fff'}}>{def.label}</div>
        <button onClick={onClose} style={{background:'rgba(255,255,255,.2)', border:'none', cursor:'pointer', color:'#fff', fontSize:16, borderRadius:6, width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:ff}}>×</button>
      </div>

      <div style={{flex:1, overflowY:'auto', padding:16}}>

        {(node.type === 'incoming' || node.type === 'hangup') && (
          <div style={info}>{node.type === 'incoming' ? '📞 Entry point for every inbound call. Drag the port on the right to connect to your first step.' : '🔴 Ends the call. No configuration needed.'}</div>
        )}

        {node.type === 'greeting' && (
          <div style={row}>
            <label style={lbl}>Message spoken to caller (Text-to-Speech)</label>
            <textarea value={cfg.text || ''} onChange={function(e){set('text',e.target.value)}} rows={4} style={ta} placeholder="Thank you for calling Target Team..." />
          </div>
        )}

        {node.type === 'menu' && (
          <div>
            <div style={row}>
              <label style={lbl}>Menu prompt (spoken to caller)</label>
              <textarea value={cfg.text || ''} onChange={function(e){set('text',e.target.value)}} rows={4} style={ta} placeholder="For sales press 1. For any agent press 0..." />
            </div>
            <div style={row}>
              <label style={lbl}>Input timeout (seconds)</label>
              <input type="number" value={cfg.timeout || 10} onChange={function(e){set('timeout',parseInt(e.target.value)||10)}} style={inp} />
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
              <label style={Object.assign({},lbl,{marginBottom:0})}>Keypress options</label>
              <button onClick={addOpt} style={{padding:'3px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff}}>+ Add</button>
            </div>
            {(cfg.options || []).map(function(opt, i) {
              const color = PORT_COLORS[i % PORT_COLORS.length]
              return (
                <div key={i} style={{background:'var(--dim)', borderRadius:9, border:'2px solid ' + color + '44', padding:'10px 12px', marginBottom:8}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
                    <div style={{width:34, height:34, borderRadius:8, background:color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <input value={opt.key || ''} onChange={function(e){setOpt(i,'key',e.target.value)}}
                        style={{width:26, textAlign:'center', background:'transparent', border:'none', color:'#fff', fontSize:16, fontWeight:900, fontFamily:ff, outline:'none'}} />
                    </div>
                    <input value={opt.label || ''} onChange={function(e){setOpt(i,'label',e.target.value)}} placeholder="Label (e.g. Sales)"
                      style={{flex:1, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff}} />
                    <button onClick={function(){delOpt(i)}} style={{background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18, lineHeight:1}}>×</button>
                  </div>
                  <label style={Object.assign({},lbl,{marginBottom:4})}>Say when pressed</label>
                  <input value={opt.say || ''} onChange={function(e){setOpt(i,'say',e.target.value)}} placeholder={'Connecting to ' + (opt.label||'agent') + '...'}
                    style={Object.assign({},inp,{marginBottom:4})} />
                  <div style={{fontSize:10, color:color, marginTop:4}}>→ Drag the "{opt.key}" port on the node to connect</div>
                </div>
              )
            })}
          </div>
        )}

        {node.type === 'condition' && (
          <div>
            <div style={row}>
              <label style={lbl}>Check if...</label>
              <select value={cfg.condition || 'known_contact'} onChange={function(e){set('condition',e.target.value)}} style={sel}>
                <option value="known_contact">Caller is a known contact</option>
                <option value="has_agent">Contact has an assigned agent</option>
                <option value="business_hours">Currently business hours (9am–6pm ET)</option>
                <option value="after_hours">Currently after hours</option>
                <option value="repeat_caller">Caller has called before</option>
              </select>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14}}>
              <div>
                <label style={Object.assign({},lbl,{color:'#10B981'})}>YES label</label>
                <input value={cfg.yesLabel || 'YES'} onChange={function(e){set('yesLabel',e.target.value)}}
                  style={{width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid #10B98155', background:'#10B98108', color:'#10B981', fontSize:12, fontFamily:ff, boxSizing:'border-box'}} />
              </div>
              <div>
                <label style={Object.assign({},lbl,{color:'#DC2626'})}>NO label</label>
                <input value={cfg.noLabel || 'NO'} onChange={function(e){set('noLabel',e.target.value)}}
                  style={{width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid #DC262655', background:'#DC262608', color:'#DC2626', fontSize:12, fontFamily:ff, boxSizing:'border-box'}} />
              </div>
            </div>
            <div style={info}>Two output ports are created: green YES and red NO. Drag each to its destination node.</div>
          </div>
        )}

        {node.type === 'dial' && (
          <div>
            <div style={row}>
              <label style={lbl}>Ring this agent</label>
              <select value={cfg.agent_id || ''} onChange={function(e){set('agent_id',e.target.value)}} style={sel}>
                <option value="">— Select agent —</option>
                {safeAgents.map(function(a){return <option key={a.id} value={a.id}>{a.name}</option>})}
              </select>
            </div>
            <div style={row}>
              <label style={lbl}>Ring timeout (seconds)</label>
              <input type="number" value={cfg.timeout || 30} onChange={function(e){set('timeout',parseInt(e.target.value)||30)}} style={inp} />
            </div>
            <div style={info}>Two ports: <strong style={{color:'#10B981'}}>Answered</strong> — call was picked up. <strong style={{color:'#DC2626'}}>No Answer</strong> — connect to voicemail or another step.</div>
          </div>
        )}

        {(node.type === 'roundrobin' || node.type === 'ringall') && (
          <div>
            <div style={row}>
              <label style={lbl}>{node.type === 'ringall' ? 'Ring all simultaneously' : 'Agents in rotation (least-recent first)'}</label>
              <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
                {safeAgents.map(function(a) {
                  const ids = cfg.agent_ids || []
                  const on  = ids.indexOf(a.id) >= 0
                  return (
                    <button key={a.id}
                      onClick={function(){set('agent_ids', on ? ids.filter(function(x){return x!==a.id}) : ids.concat([a.id]))}}
                      style={{padding:'5px 12px', borderRadius:20, border:'1px solid ' + (on?'#CC2200':'var(--border)'), background:on?'rgba(204,34,0,.1)':'transparent', color:on?'#CC2200':'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff}}>
                      {on ? '✓ ' : ''}{a.name.split(' ')[0]}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={row}>
              <label style={lbl}>Timeout (seconds)</label>
              <input type="number" value={cfg.timeout || 30} onChange={function(e){set('timeout',parseInt(e.target.value)||30)}} style={inp} />
            </div>
          </div>
        )}

        {node.type === 'voicemail' && (
          <div>
            <div style={row}>
              <label style={lbl}>Greeting before the beep</label>
              <textarea value={cfg.text || ''} onChange={function(e){set('text',e.target.value)}} rows={3} style={ta} placeholder="Please leave your name and number after the tone." />
            </div>
            <div style={row}>
              <label style={lbl}>Max recording length (seconds)</label>
              <input type="number" value={cfg.max_length || 120} onChange={function(e){set('max_length',parseInt(e.target.value)||120)}} style={inp} />
            </div>
            <label style={{display:'flex', alignItems:'center', gap:8, marginBottom:10, cursor:'pointer', fontSize:13, color:'var(--text)', fontFamily:ff}}>
              <input type="checkbox" checked={!!cfg.transcribe} onChange={function(e){set('transcribe',e.target.checked)}} />
              Transcribe voicemail to text
            </label>
            <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text)', fontFamily:ff}}>
              <input type="checkbox" checked={!!cfg.notify_agent} onChange={function(e){set('notify_agent',e.target.checked)}} />
              Notify assigned agent by email
            </label>
          </div>
        )}

        {node.type === 'savelead' && (
          <div>
            <div style={row}>
              <label style={lbl}>Source tag</label>
              <input value={cfg.source || 'Inbound Call'} onChange={function(e){set('source',e.target.value)}} style={inp} />
            </div>
            <div style={row}>
              <label style={lbl}>Assign to</label>
              <select value={cfg.assign || 'round_robin'} onChange={function(e){set('assign',e.target.value)}} style={sel}>
                <option value="round_robin">Round robin</option>
                <option value="fewest_leads">Agent with fewest leads</option>
                <option value="specific">Specific agent</option>
              </select>
            </div>
            {cfg.assign === 'specific' && (
              <div style={row}>
                <label style={lbl}>Agent</label>
                <select value={cfg.agent_id || ''} onChange={function(e){set('agent_id',e.target.value)}} style={sel}>
                  <option value="">— Select agent —</option>
                  {safeAgents.map(function(a){return <option key={a.id} value={a.id}>{a.name}</option>})}
                </select>
              </div>
            )}
            <div style={info}>Creates or updates a Contact record in TargetOS from the caller's phone number.</div>
          </div>
        )}

        {node.type === 'sms' && (
          <div>
            <div style={row}>
              <label style={lbl}>SMS message text</label>
              <textarea value={cfg.text || ''} onChange={function(e){set('text',e.target.value)}} rows={3} style={ta} placeholder="Thanks for calling! An agent will reach out shortly." />
            </div>
            <div style={row}>
              <label style={lbl}>Send to</label>
              <select value={cfg.send_to || 'caller'} onChange={function(e){set('send_to',e.target.value)}} style={sel}>
                <option value="caller">Caller</option>
                <option value="agent">Assigned agent</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
        )}

      </div>

      <div style={{padding:'12px 16px', borderTop:'1px solid var(--border)', flexShrink:0}}>
        <Btn onClick={function(){onSave(node.id, cfg); onClose()}} style={{width:'100%'}}>✓ Save Changes</Btn>
      </div>
    </div>
  )
}

// ── EDGE PATH ────────────────────────────────────────────────────
function edgePath(from, portId, to, nodes) {
  const fromNode = nodes.find(function(n){return n.id === from})
  const toNode   = nodes.find(function(n){return n.id === to})
  if (!fromNode || !toNode) return ''
  const ports  = getPorts(fromNode)
  const port   = ports.find(function(p){return p.id === portId})
  const sy     = port ? port.y : NH / 2
  const x1 = fromNode.x + NW
  const y1 = fromNode.y + sy
  const x2 = toNode.x
  const y2 = toNode.y + NH / 2
  const cx = x1 + Math.max(60, (x2 - x1) * 0.5)
  const cy = y2
  return 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + cy + ', ' + x2 + ' ' + y2
}

function edgeColor(portId, fromNode) {
  if (!portId) return '#94A3B8'
  if (portId === 'yes' || portId === 'answered') return '#10B981'
  if (portId === 'no'  || portId === 'noanswer') return '#DC2626'
  if (portId.indexOf('key_') === 0) {
    if (!fromNode) return '#94A3B8'
    const opts = (fromNode.config && fromNode.config.options) || []
    const key  = portId.slice(4)
    const idx  = opts.findIndex(function(o){return o.key === key})
    return PORT_COLORS[idx >= 0 ? idx % PORT_COLORS.length : 0]
  }
  if (fromNode) return nd(fromNode.type).color
  return '#94A3B8'
}

function edgeLabel(portId, fromNode) {
  if (!portId || portId === 'out') return ''
  if (portId === 'yes')       return 'YES'
  if (portId === 'no')        return 'NO'
  if (portId === 'answered')  return 'Answered'
  if (portId === 'noanswer')  return 'No Answer'
  if (portId.indexOf('key_') === 0) {
    const key = portId.slice(4)
    if (!fromNode) return 'Press ' + key
    const opts = (fromNode.config && fromNode.config.options) || []
    const opt  = opts.find(function(o){return o.key === key})
    return 'Press ' + key + (opt && opt.label ? ' · ' + opt.label : '')
  }
  return ''
}

// ── MAIN COMPONENT ───────────────────────────────────────────────
export function CallFlow() {
  const { toast } = useApp()
  const { agents } = useAgents()
  const navigate   = useNavigate()
  const svgRef     = useRef(null)
  const nextId     = useRef(200)

  const [nodes,     setNodes]     = useState([{ id:'start', type:'incoming', x:80, y:220, config:{} }])
  const [edges,     setEdges]     = useState([])
  const [selected,  setSelected]  = useState(null)   // nodeId
  const [flowName,  setFlowName]  = useState('Main Call Flow')
  const [savedId,   setSavedId]   = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [showHelp,  setShowHelp]  = useState(false)

  // Drag-node state
  const dragNode   = useRef(null)  // { id, ox, oy }
  // Drag-wire state
  const dragWire   = useRef(null)  // { fromId, portId, x, y }
  const [wirePos,   setWirePos]   = useState(null)  // live wire preview end point
  const [activeDragPort, setActiveDragPort] = useState(null)

  // ── LOAD ─────────────────────────────────────────────────────
  useEffect(function() {
    supabase.from('phone_ivr').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle()
      .then(function(r) {
        const d = r.data
        if (d && d.flow_nodes && d.flow_nodes.length) {
          setNodes(d.flow_nodes)
          setEdges(d.flow_edges || [])
          setFlowName(d.name || 'Main Call Flow')
          setSavedId(d.id)
        }
      }).catch(function(e) { console.warn('load:', e.message) })
  }, [])

  // ── SAVE ─────────────────────────────────────────────────────
  function saveFlow() {
    setSaving(true)
    const menuNode  = nodes.find(function(n){return n.type==='menu'})
    const greetNode = nodes.find(function(n){return n.type==='greeting'})
    const gText = (greetNode && greetNode.config && greetNode.config.text) || (menuNode && menuNode.config && menuNode.config.text) || ''
    const mOpts = (menuNode && menuNode.config && menuNode.config.options) ? menuNode.config.options.map(function(o){return{key:o.key,label:o.label,say:o.say,action:'extension',value:''}}) : []
    const payload = { name:flowName, flow_nodes:nodes, flow_edges:edges, greeting_text:gText, menu_options:mOpts, updated_at:new Date().toISOString() }
    const p = savedId
      ? supabase.from('phone_ivr').update(payload).eq('id',savedId)
      : supabase.from('phone_ivr').insert(Object.assign({},payload,{is_active:false,voicemail_extension:'9',created_at:new Date().toISOString()})).select().single()
    p.then(function(r){
      if (!savedId && r.data) setSavedId(r.data.id)
      toast('✅ Flow saved')
    }).catch(function(e){toast('Save failed: '+e.message,'#DC2626')}).finally(function(){setSaving(false)})
  }

  function addNode(type) {
    const id = 'n' + (++nextId.current)
    setNodes(function(p){return p.concat([{id,type,x:260+Math.random()*220,y:80+Math.random()*300,config:defCfg(type)}])})
  }

  function deleteNode(id) {
    setNodes(function(p){return p.filter(function(n){return n.id!==id})})
    setEdges(function(p){return p.filter(function(e){return e.from!==id && e.to!==id})})
    setSelected(null)
  }

  function updateCfg(id, cfg) {
    setNodes(function(p){return p.map(function(n){return n.id===id ? Object.assign({},n,{config:cfg}) : n})})
    // When menu options change, remove edges for ports that no longer exist
    setEdges(function(prev) {
      const node = nodes.find(function(n){return n.id===id})
      if (!node || node.type !== 'menu') return prev
      const newOpts = (cfg.options || []).map(function(o){return 'key_'+o.key})
      return prev.filter(function(e){
        if (e.from !== id) return true
        if (e.port.indexOf('key_') !== 0) return true
        return newOpts.indexOf(e.port) >= 0
      })
    })
  }

  // ── NODE DRAG ────────────────────────────────────────────────
  function onMouseDownNode(e, id) {
    if (dragWire.current) return  // wire dragging takes priority
    e.preventDefault()
    e.stopPropagation()
    const node = nodes.find(function(n){return n.id===id})
    if (!node) return
    const svgRect = svgRef.current.getBoundingClientRect()
    dragNode.current = { id, ox: e.clientX - svgRect.left - node.x, oy: e.clientY - svgRect.top - node.y }
    setSelected(id)
  }

  // ── PORT DRAG (wire drawing) ─────────────────────────────────
  function onMouseDownPort(e, fromId, portId) {
    e.preventDefault()
    e.stopPropagation()
    dragNode.current = null  // cancel any node drag
    const svgRect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - svgRect.left
    const y = e.clientY - svgRect.top
    dragWire.current = { fromId, portId, x, y }
    setActiveDragPort({ fromId, portId })
    setWirePos({ x, y })
  }

  // ── SVG MOUSE MOVE ───────────────────────────────────────────
  function onSvgMouseMove(e) {
    const svgRect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - svgRect.left
    const y = e.clientY - svgRect.top

    if (dragNode.current) {
      const { id, ox, oy } = dragNode.current
      setNodes(function(p){return p.map(function(n){return n.id===id ? Object.assign({},n,{x:Math.max(0,x-ox),y:Math.max(0,y-oy)}) : n})})
    }
    if (dragWire.current) {
      setWirePos({ x, y })
    }
  }

  // ── SVG MOUSE UP ─────────────────────────────────────────────
  function onSvgMouseUp(e) {
    const svgRect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - svgRect.left
    const y = e.clientY - svgRect.top

    if (dragWire.current) {
      const { fromId, portId } = dragWire.current
      // Find which node was released on
      const toNode = nodes.find(function(n) {
        return n.id !== fromId &&
          x >= n.x - PR && x <= n.x + NW + PR &&
          y >= n.y - PR && y <= n.y + NH + PR
      })
      if (toNode) {
        // Remove existing edge from this port (one connection per port)
        const eid = 'e_' + fromId + '_' + portId + '_' + toNode.id
        setEdges(function(prev) {
          const filtered = prev.filter(function(e){return !(e.from===fromId && e.port===portId)})
          return filtered.concat([{id:eid, from:fromId, port:portId, to:toNode.id}])
        })
      }
      dragWire.current = null
      setWirePos(null)
      setActiveDragPort(null)
    }

    dragNode.current = null
  }

  // ── CLICK CANVAS (deselect) ───────────────────────────────────
  function onSvgClick(e) {
    if (e.target === svgRef.current || e.target.tagName === 'rect' && e.target.getAttribute('fill') === 'url(#cfgrid)') {
      setSelected(null)
    }
  }

  // Handle delete from node click
  function onClickNode(id) {
    if (id.indexOf('__delete__') === 0) {
      deleteNode(id.slice(10))
      return
    }
    setSelected(function(prev){return prev === id ? null : id})
  }

  function deleteEdge(id) {
    setEdges(function(p){return p.filter(function(e){return e.id!==id})})
  }

  // Build set of connected port keys for visual feedback
  const connectedPorts = new Set(edges.map(function(e){return e.from + ':' + e.port}))

  // Live wire path
  function livePath() {
    if (!dragWire.current || !wirePos) return ''
    const fromNode = nodes.find(function(n){return n.id===dragWire.current.fromId})
    if (!fromNode) return ''
    const ports  = getPorts(fromNode)
    const port   = ports.find(function(p){return p.id===dragWire.current.portId})
    const sy     = port ? port.y : NH/2
    const x1 = fromNode.x + NW
    const y1 = fromNode.y + sy
    const x2 = wirePos.x
    const y2 = wirePos.y
    const cx = x1 + Math.max(40, (x2-x1)*0.5)
    return 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2
  }

  const selectedNode = nodes.find(function(n){return n.id===selected})

  // ── VALIDATE FLOW ─────────────────────────────────────────────
  function validateFlow() {
    const issues = []
    const startNode = nodes.find(function(n){return n.type==='incoming'})
    if (!startNode) { issues.push('No Incoming Call node found.'); return issues }
    // Check start has an outbound connection
    const startEdge = edges.find(function(e){return e.from===startNode.id})
    if (!startEdge) issues.push('Incoming Call has no connection — nothing will happen when a call arrives.')
    // Check every non-terminal node has all ports connected
    nodes.forEach(function(node) {
      if (node.type === 'incoming' || node.type === 'hangup') return
      const ports = getPorts(node)
      ports.forEach(function(p) {
        const hasEdge = edges.some(function(e){return e.from===node.id && e.port===p.id})
        if (!hasEdge) issues.push(nd(node.type).label + ' node: "' + (p.label||p.id) + '" port is not connected.')
      })
    })
    return issues
  }

  const flowIssues = validateFlow()

  return (
    <div style={{fontFamily:ff, height:'calc(100vh - 56px)', display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)'}}>

      {/* ── TOOLBAR ─────────────────────────────────────────── */}
      <div style={{display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--panel)', flexWrap:'wrap'}}>
        <button onClick={function(){navigate('/calls')}}
          style={{background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--muted)', fontFamily:ff, display:'flex', alignItems:'center', gap:4}}>
          ← Phone System
        </button>
        <div style={{width:1, height:16, background:'var(--border)'}} />
        <div style={{fontSize:15, fontWeight:800, color:'var(--text)'}}>📞 Call Flow Builder</div>
        <input value={flowName} onChange={function(e){setFlowName(e.target.value)}}
          style={{padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, width:200}} />
        {flowIssues.length > 0 && (
          <div style={{display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:20, background:'#FEF2F2', border:'1px solid #FECACA', fontSize:11, color:'#DC2626', fontWeight:700}}>
            ⚠ {flowIssues.length} issue{flowIssues.length>1?'s':''}
          </div>
        )}
        <div style={{flex:1}} />
        <button onClick={function(){setShowHelp(function(h){return !h})}}
          style={{padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff}}>
          {showHelp ? 'Hide help' : '? Help'}
        </button>
        <button onClick={function(){if(window.confirm('Clear canvas? This cannot be undone.')){setNodes([{id:'start',type:'incoming',x:80,y:220,config:{}}]);setEdges([]);setSelected(null)}}}
          style={{padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff}}>
          Clear
        </button>
        <Btn onClick={saveFlow} loading={saving}>💾 Save Flow</Btn>
      </div>

      {/* ── HELP BAR ────────────────────────────────────────── */}
      {showHelp && (
        <div style={{padding:'10px 16px', background:'#EFF6FF', borderBottom:'1px solid #BFDBFE', flexShrink:0}}>
          <div style={{display:'flex', gap:24, flexWrap:'wrap', fontSize:12, color:'#1E40AF'}}>
            <span><strong>1.</strong> Click nodes in the palette to add them to the canvas</span>
            <span><strong>2.</strong> Click a node to configure it in the right panel</span>
            <span><strong>3.</strong> <strong>Drag from a colored port</strong> on the right side of a node to another node to connect them</span>
            <span><strong>4.</strong> Click an arrow/connection to delete it</span>
            <span><strong>5.</strong> Click × on a selected node to delete it</span>
          </div>
          {flowIssues.length > 0 && (
            <div style={{marginTop:8, padding:'6px 10px', background:'#FEF2F2', borderRadius:6, border:'1px solid #FECACA'}}>
              {flowIssues.map(function(issue, i){return <div key={i} style={{fontSize:11, color:'#DC2626'}}>⚠ {issue}</div>})}
            </div>
          )}
        </div>
      )}

      <div style={{flex:1, display:'flex', overflow:'hidden'}}>

        {/* ── PALETTE ─────────────────────────────────────── */}
        <div style={{width:158, borderRight:'1px solid var(--border)', background:'var(--dim)', overflowY:'auto', flexShrink:0, padding:'8px 6px'}}>
          {CATS.map(function(cat) {
            const catNodes = NODE_DEFS.filter(function(n){return n.cat===cat.id && n.type!=='incoming'})
            return (
              <div key={cat.id} style={{marginBottom:6}}>
                <div style={{fontSize:9, fontWeight:700, color:cat.color, textTransform:'uppercase', letterSpacing:'.08em', padding:'6px 8px 4px'}}>
                  {cat.label}
                </div>
                {catNodes.map(function(t) {
                  return (
                    <div key={t.type} onClick={function(){addNode(t.type)}}
                      style={{display:'flex', alignItems:'center', gap:7, padding:'7px 9px', borderRadius:8, cursor:'pointer', marginBottom:2, border:'1px solid transparent', background:'var(--panel)', transition:'all .12s'}}
                      onMouseEnter={function(e){e.currentTarget.style.borderColor=t.color; e.currentTarget.style.background=t.color+'14'}}
                      onMouseLeave={function(e){e.currentTarget.style.borderColor='transparent'; e.currentTarget.style.background='var(--panel)'}}>
                      <span style={{fontSize:15}}>{t.icon}</span>
                      <span style={{fontSize:11, fontWeight:700, color:'var(--text)', lineHeight:1.3}}>{t.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* ── CANVAS ──────────────────────────────────────── */}
        <div style={{flex:1, position:'relative', overflow:'hidden', cursor: dragWire.current ? 'crosshair' : 'default'}}>

          {/* Grid background */}
          <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0}}>
            <defs>
              <pattern id="cfgrid" width={30} height={30} patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--border)" strokeWidth={0.6} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cfgrid)" />
          </svg>

          {/* Main SVG canvas */}
          <svg
            ref={svgRef}
            style={{position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible', zIndex:1, userSelect:'none'}}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
            onClick={onSvgClick}
          >
            <defs>
              <marker id="arrowG" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#10B981" />
              </marker>
              <marker id="arrowR" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#DC2626" />
              </marker>
              <marker id="arrowB" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#3B82F6" />
              </marker>
              <marker id="arrowN" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#94A3B8" />
              </marker>
              <marker id="arrowP" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#8B5CF6" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map(function(edge) {
              const fromNode = nodes.find(function(n){return n.id===edge.from})
              const toNode   = nodes.find(function(n){return n.id===edge.to})
              const path = edgePath(edge.from, edge.port, edge.to, nodes)
              if (!path) return null
              const color = edgeColor(edge.port, fromNode)
              const label = edgeLabel(edge.port, fromNode)
              const markerColor = color === '#10B981' ? '#arrowG' : color === '#DC2626' ? '#arrowR' : color === '#3B82F6' ? '#arrowB' : color === '#8B5CF6' ? '#arrowP' : '#arrowN'
              // Midpoint for label
              const mx = fromNode && toNode ? (fromNode.x + NW + toNode.x) / 2 : 0
              const my = fromNode && toNode ? (fromNode.y + toNode.y) / 2 + NH / 2 : 0
              return (
                <g key={edge.id}>
                  {/* Fat invisible hit zone */}
                  <path d={path} fill="none" stroke="transparent" strokeWidth={16} style={{cursor:'pointer'}}
                    onClick={function(e){e.stopPropagation(); deleteEdge(edge.id)}} />
                  {/* Visible path */}
                  <path d={path} fill="none" stroke={color} strokeWidth={2.5} opacity={0.85} markerEnd={'url(' + markerColor + ')'} />
                  {/* Label pill */}
                  {label && (
                    <g>
                      <rect x={mx-36} y={my-9} width={72} height={18} rx={9} fill={color} opacity={0.92} />
                      <text x={mx} y={my+4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily={ff}>{label}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Live wire preview while dragging */}
            {dragWire.current && wirePos && (
              <path d={livePath()} fill="none" stroke="#CC2200" strokeWidth={2.5} strokeDasharray="8 4" opacity={0.7} />
            )}

            {/* Nodes */}
            {nodes.map(function(node) {
              return (
                <g key={node.id} data-nid={node.id}>
                  <FlowNode
                    node={node}
                    selected={selected === node.id}
                    agents={agents || []}
                    connectedPorts={connectedPorts}
                    dragPort={activeDragPort}
                    onMouseDownNode={onMouseDownNode}
                    onMouseDownPort={onMouseDownPort}
                    onClickNode={onClickNode}
                  />
                </g>
              )
            })}
          </svg>

          {/* Wire hint */}
          {dragWire.current && wirePos && (
            <div style={{position:'absolute', top:14, left:'50%', transform:'translateX(-50%)', padding:'7px 18px', borderRadius:20, background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, zIndex:10, pointerEvents:'none', boxShadow:'0 4px 16px rgba(0,0,0,.25)', whiteSpace:'nowrap'}}>
              Release over a node to connect
            </div>
          )}

          {/* Empty state */}
          {nodes.length <= 1 && (
            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
              <div style={{textAlign:'center', padding:40, opacity:0.35}}>
                <div style={{fontSize:40, marginBottom:12}}>🔀</div>
                <div style={{fontSize:15, fontWeight:800, color:'var(--text)', marginBottom:6}}>Start building your call flow</div>
                <div style={{fontSize:13, color:'var(--muted)'}}>Click any node in the palette on the left to add it</div>
              </div>
            </div>
          )}
        </div>

        {/* ── CONFIG PANEL ────────────────────────────────── */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            agents={agents || []}
            onSave={updateCfg}
            onClose={function(){setSelected(null)}}
          />
        )}
      </div>
    </div>
  )
}
