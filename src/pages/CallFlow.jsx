// TargetOS V2 - Call Flow Builder
import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp }    from '../context/AppContext'
import { supabase }  from '../lib/supabase'
import { Btn }       from '../components/UI'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, sans-serif'
const NW = 200
const NH = 68

const NODE_DEFS = [
  { type:'incoming',  label:'Incoming Call', color:'#10B981', cat:'trigger' },
  { type:'greeting',  label:'Play Greeting', color:'#3B82F6', cat:'voice'   },
  { type:'menu',      label:'IVR Menu',      color:'#8B5CF6', cat:'voice'   },
  { type:'condition', label:'If/Condition',  color:'#F5A623', cat:'routing' },
  { type:'dial',      label:'Dial Agent',    color:'#CC2200', cat:'routing' },
  { type:'roundrobin',label:'Round Robin',   color:'#6366F1', cat:'routing' },
  { type:'ringall',   label:'Ring All',      color:'#EC4899', cat:'routing' },
  { type:'voicemail', label:'Voicemail',     color:'#EC4899', cat:'action'  },
  { type:'savelead',  label:'Save as Lead',  color:'#14B8A6', cat:'action'  },
  { type:'sms',       label:'Send SMS',      color:'#84CC16', cat:'action'  },
  { type:'hangup',    label:'Hang Up',       color:'#94A3B8', cat:'action'  },
]

const CATS = [
  { id:'trigger', label:'Triggers',  color:'#10B981' },
  { id:'voice',   label:'Voice',     color:'#3B82F6' },
  { id:'routing', label:'Routing',   color:'#CC2200' },
  { id:'action',  label:'Actions',   color:'#8B5CF6' },
]

const COLORS = ['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899','#14B8A6','#6366F1']

function nd(type) { return NODE_DEFS.find(n => n.type === type) || NODE_DEFS[0] }

function defCfg(type) {
  if (type === 'menu') return {
    text: 'For sales press 1. For any agent press 0. To leave a voicemail press 9.',
    timeout: 10,
    options: [
      { key:'1', label:'Sales',     say:'Connecting to sales...' },
      { key:'0', label:'Any Agent', say:'Connecting to next available agent...' },
      { key:'9', label:'Voicemail', say:'Please leave your message after the tone.' },
    ]
  }
  if (type === 'condition') return { condition:'known_contact', yesLabel:'Yes', noLabel:'No' }
  if (type === 'greeting')  return { text:'Thank you for calling Target Team.' }
  if (type === 'dial')      return { agent_id:'', timeout:30 }
  if (type === 'roundrobin')return { agent_ids:[], timeout:30 }
  if (type === 'ringall')   return { agent_ids:[], timeout:30 }
  if (type === 'voicemail') return { text:'Please leave your name and number after the tone.', transcribe:true, notify_agent:true }
  if (type === 'savelead')  return { source:'Inbound Call', assign:'round_robin' }
  if (type === 'sms')       return { text:'Thanks for calling! An agent will reach out shortly.' }
  return {}
}

function FlowNode({ node, selected, agents, onSelect, onMove, onDelete, onPort }) {
  const d = nd(node.type)
  const cfg = node.config || {}
  const safeAgents = agents || []

  function onMouseDown(e) {
    // Check data attribute instead of className (SVG closest() is unreliable)
    var cur = e.target
    while (cur && cur.tagName !== 'svg') {
      if (cur.dataset && (cur.dataset.port || cur.dataset.del)) return
      cur = cur.parentNode
    }
    e.preventDefault()
    e.stopPropagation()
    const ox = e.clientX - node.x
    const oy = e.clientY - node.y
    const mv = function(me) { onMove(node.id, me.clientX - ox, me.clientY - oy) }
    const up = function() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
    onSelect(node.id)
  }

  const ports = []
  if (node.type === 'condition') {
    ports.push({ id:'yes', label: cfg.yesLabel || 'YES', color:'#10B981', y: NH * 0.3 })
    ports.push({ id:'no',  label: cfg.noLabel  || 'NO',  color:'#DC2626', y: NH * 0.7 })
  } else if (node.type === 'menu') {
    var opts = cfg.options || []
    for (var oi = 0; oi < opts.length; oi++) {
      ports.push({ id:'key_'+opts[oi].key, label:opts[oi].key, color:COLORS[oi % COLORS.length], y:(NH/(opts.length+1))*(oi+1) })
    }
  } else if (node.type === 'dial' || node.type === 'roundrobin' || node.type === 'ringall') {
    ports.push({ id:'answered', label:'OK',  color:'#10B981', y: NH * 0.35 })
    ports.push({ id:'noanswer', label:'No',  color:'#DC2626', y: NH * 0.65 })
  } else if (node.type !== 'hangup') {
    ports.push({ id:'out', label:'', color:d.color, y: NH * 0.5 })
  }

  var agentName = null
  if (cfg.agent_id) {
    var ag = safeAgents.find(function(a) { return a.id === cfg.agent_id })
    if (ag) agentName = ag.name.split(' ')[0]
  }

  var subParts = []
  if (node.type === 'menu')       subParts = [(cfg.options ? cfg.options.length : 0) + ' options']
  else if (node.type === 'condition') subParts = [(cfg.condition || 'condition').split('_').join(' ')]
  else if (node.type === 'dial')  subParts = [agentName || 'tap to configure']
  else if (node.type === 'roundrobin') subParts = [(cfg.agent_ids ? cfg.agent_ids.length : 0) + ' agents']
  else if (node.type === 'greeting') subParts = [(cfg.text || '').slice(0, 22)]
  else subParts = [d.label.toLowerCase()]
  var sub = subParts[0]

  return (
    <g data-nid={node.id} transform={'translate(' + node.x + ',' + node.y + ')'}
      onMouseDown={onMouseDown} style={{cursor:'grab'}}>
      <rect x={2} y={3} width={NW} height={NH} rx={10} fill="rgba(0,0,0,.09)" />
      <rect x={0} y={0} width={NW} height={NH} rx={10}
        fill={selected ? d.color : '#ffffff'}
        stroke={selected ? d.color : '#E2E8F0'}
        strokeWidth={selected ? 2.5 : 1.5} />
      <rect x={0} y={0} width={6} height={NH} rx={3} fill={d.color} />
      <text x={18} y={31} fontSize={13} fill={selected ? '#fff' : '#1E293B'} fontWeight={700} fontFamily={ff}>{d.label}</text>
      <text x={18} y={50} fontSize={10} fill={selected ? 'rgba(255,255,255,.75)' : '#64748B'} fontFamily={ff}>{sub}</text>
      {node.type !== 'incoming' && (
        <circle cx={0} cy={NH / 2} r={6} fill="#fff" stroke={d.color} strokeWidth={2} />
      )}
      {selected && node.type !== 'incoming' && (
        <g data-del="1" onClick={function(e) { e.stopPropagation(); onDelete(node.id) }} style={{cursor:'pointer'}}>
          <circle cx={NW - 10} cy={10} r={8} fill="#DC2626" />
          <line x1={NW-14} y1={6} x2={NW-6} y2={14} stroke="#fff" strokeWidth={2} />
          <line x1={NW-6} y1={6} x2={NW-14} y2={14} stroke="#fff" strokeWidth={2} />
        </g>
      )}
      {ports.map(function(p) {
        return (
          <g key={p.id} data-port="1"
            onMouseDown={function(e) { e.stopPropagation(); e.preventDefault(); onPort(node.id, p.id) }}
            style={{cursor:'crosshair'}}>
            <circle cx={NW} cy={p.y} r={14} fill="transparent" />
            <circle cx={NW} cy={p.y} r={7} fill={p.color} stroke="#fff" strokeWidth={2} />
            {p.label ? <text x={NW-11} y={p.y+4} fontSize={8} textAnchor="end" fill={p.color} fontFamily={ff} fontWeight={700}>{p.label}</text> : null}
          </g>
        )
      })}
    </g>
  )
}

function ConfigPanel({ node, agents, onSave, onClose }) {
  const d = nd(node.type)
  const [cfg, setCfg] = useState(Object.assign({}, node.config || {}))
  const safeAgents = agents || []

  function set(k, v) { setCfg(function(p) { return Object.assign({}, p, { [k]: v }) }) }

  function setOpt(i, k, v) {
    var o = (cfg.options || []).slice()
    o[i] = Object.assign({}, o[i], { [k]: v })
    set('options', o)
  }
  function addOpt() {
    var o = (cfg.options || []).slice()
    o.push({ key: String(o.length + 1), label: '', say: '' })
    set('options', o)
  }
  function delOpt(i) {
    var o = (cfg.options || []).slice()
    o.splice(i, 1)
    set('options', o)
  }

  var inpStyle = { width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:10 }
  var taStyle  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }
  var selStyle = { width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }
  var lblStyle = { fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5, marginTop:0, display:'block' }
  var infoStyle= { padding:'8px 10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)', lineHeight:1.5, marginBottom:10 }

  return (
    <div style={{width:300, borderLeft:'1px solid var(--border)', background:'var(--panel)', display:'flex', flexDirection:'column', flexShrink:0, height:'100%', fontFamily:ff}}>
      <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexShrink:0, background:d.color}}>
        <div style={{flex:1, fontSize:13, fontWeight:800, color:'#fff'}}>{d.label}</div>
        <button onClick={onClose} style={{background:'rgba(255,255,255,.2)', border:'none', cursor:'pointer', color:'#fff', fontSize:14, borderRadius:6, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center'}}>x</button>
      </div>
      <div style={{flex:1, overflowY:'auto', padding:14}}>

        {(node.type === 'incoming' || node.type === 'hangup') && (
          <div style={infoStyle}>
            {node.type === 'incoming' ? 'Entry point for every call. Connect to the first step.' : 'Ends the call. No configuration needed.'}
          </div>
        )}

        {node.type === 'greeting' && (
          <div>
            <label style={lblStyle}>What the caller hears</label>
            <textarea value={cfg.text || ''} onChange={function(e) { set('text', e.target.value) }} placeholder="Thank you for calling Target Team." rows={4} style={taStyle} />
          </div>
        )}

        {node.type === 'menu' && (
          <div>
            <label style={lblStyle}>Menu prompt</label>
            <textarea value={cfg.text || ''} onChange={function(e) { set('text', e.target.value) }} placeholder="For sales press 1. For any agent press 0. To leave a voicemail press 9." rows={4} style={taStyle} />
            <label style={lblStyle}>Timeout (seconds)</label>
            <input type="number" value={cfg.timeout || 10} onChange={function(e) { set('timeout', e.target.value) }} style={inpStyle} />
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
              <label style={Object.assign({}, lblStyle, {marginBottom:0})}>Keypress options</label>
              <button onClick={addOpt} style={{padding:'3px 9px', borderRadius:6, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff}}>+ Add</button>
            </div>
            {(cfg.options || []).map(function(opt, i) {
              return (
                <div key={i} style={{background:'var(--dim)', borderRadius:9, border:'2px solid ' + COLORS[i % COLORS.length] + '33', padding:'10px 12px', marginBottom:8}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
                    <div style={{width:32, height:32, borderRadius:8, background:COLORS[i % COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                      <input value={opt.key || ''} onChange={function(e) { setOpt(i, 'key', e.target.value) }}
                        style={{width:24, textAlign:'center', background:'transparent', border:'none', color:'#fff', fontSize:16, fontWeight:900, fontFamily:ff, outline:'none'}} />
                    </div>
                    <input value={opt.label || ''} onChange={function(e) { setOpt(i, 'label', e.target.value) }} placeholder="Label (e.g. Sales)"
                      style={{flex:1, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff}} />
                    <button onClick={function() { delOpt(i) }} style={{background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:16}}>x</button>
                  </div>
                  <label style={Object.assign({}, lblStyle, {marginBottom:4})}>Say when pressed:</label>
                  <input value={opt.say || ''} onChange={function(e) { setOpt(i, 'say', e.target.value) }} placeholder={'Connecting to ' + (opt.label || 'agent') + '...'}
                    style={Object.assign({}, inpStyle, {marginBottom:4})} />
                  <div style={{fontSize:10, color:COLORS[i % COLORS.length], fontStyle:'italic'}}>Drag the &quot;{opt.key}&quot; port on the right to connect</div>
                </div>
              )
            })}
          </div>
        )}

        {node.type === 'condition' && (
          <div>
            <label style={lblStyle}>Check if...</label>
            <select value={cfg.condition || 'known_contact'} onChange={function(e) { set('condition', e.target.value) }} style={selStyle}>
              <option value="known_contact">Caller is a known contact</option>
              <option value="has_agent">Contact has assigned agent</option>
              <option value="business_hours">Currently business hours</option>
              <option value="after_hours">Currently after hours</option>
              <option value="repeat_caller">Caller has called before</option>
            </select>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10}}>
              <div>
                <label style={Object.assign({}, lblStyle, {color:'#10B981'})}>YES label</label>
                <input value={cfg.yesLabel || 'YES'} onChange={function(e) { set('yesLabel', e.target.value) }}
                  style={{width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #10B98155', background:'#10B98108', color:'#10B981', fontSize:12, fontFamily:ff, boxSizing:'border-box'}} />
              </div>
              <div>
                <label style={Object.assign({}, lblStyle, {color:'#DC2626'})}>NO label</label>
                <input value={cfg.noLabel || 'NO'} onChange={function(e) { set('noLabel', e.target.value) }}
                  style={{width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #DC262655', background:'#DC262608', color:'#DC2626', fontSize:12, fontFamily:ff, boxSizing:'border-box'}} />
              </div>
            </div>
            <div style={infoStyle}>Creates a green YES port and red NO port on the right.</div>
          </div>
        )}

        {node.type === 'dial' && (
          <div>
            <label style={lblStyle}>Ring this agent</label>
            <select value={cfg.agent_id || ''} onChange={function(e) { set('agent_id', e.target.value) }} style={selStyle}>
              <option value="">-- Select agent --</option>
              {safeAgents.map(function(a) { return <option key={a.id} value={a.id}>{a.name}</option> })}
            </select>
            <label style={lblStyle}>Ring timeout (seconds)</label>
            <input type="number" value={cfg.timeout || 30} onChange={function(e) { set('timeout', e.target.value) }} style={inpStyle} />
            <div style={infoStyle}>Two ports: Answered and No Answer. Connect both.</div>
          </div>
        )}

        {(node.type === 'roundrobin' || node.type === 'ringall') && (
          <div>
            <label style={lblStyle}>{node.type === 'ringall' ? 'Ring all simultaneously' : 'Agents in rotation'}</label>
            <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:10}}>
              {safeAgents.map(function(a) {
                var ids = cfg.agent_ids || []
                var on  = ids.indexOf(a.id) >= 0
                return (
                  <button key={a.id}
                    onClick={function() { set('agent_ids', on ? ids.filter(function(x) { return x !== a.id }) : ids.concat([a.id])) }}
                    style={{padding:'4px 10px', borderRadius:20, border:'1px solid ' + (on ? '#CC2200' : 'var(--border)'), background: on ? 'rgba(204,34,0,.1)' : 'transparent', color: on ? '#CC2200' : 'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff}}>
                    {on ? '+ ' : ''}{a.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
            <label style={lblStyle}>Timeout (seconds)</label>
            <input type="number" value={cfg.timeout || 30} onChange={function(e) { set('timeout', e.target.value) }} style={inpStyle} />
          </div>
        )}

        {node.type === 'voicemail' && (
          <div>
            <label style={lblStyle}>Greeting before the beep</label>
            <textarea value={cfg.text || ''} onChange={function(e) { set('text', e.target.value) }} placeholder="Please leave your name and number after the tone." rows={3} style={taStyle} />
            <label style={lblStyle}>Max length (seconds)</label>
            <input type="number" value={cfg.max_length || 120} onChange={function(e) { set('max_length', e.target.value) }} style={inpStyle} />
            <label style={{display:'flex', alignItems:'center', gap:7, marginBottom:8, cursor:'pointer', fontSize:13, color:'var(--text)', fontFamily:ff}}>
              <input type="checkbox" checked={!!cfg.transcribe} onChange={function(e) { set('transcribe', e.target.checked) }} />
              Transcribe voicemail to text
            </label>
            <label style={{display:'flex', alignItems:'center', gap:7, marginBottom:8, cursor:'pointer', fontSize:13, color:'var(--text)', fontFamily:ff}}>
              <input type="checkbox" checked={!!cfg.notify_agent} onChange={function(e) { set('notify_agent', e.target.checked) }} />
              Email agent when voicemail arrives
            </label>
          </div>
        )}

        {node.type === 'savelead' && (
          <div>
            <label style={lblStyle}>Source tag</label>
            <input value={cfg.source || 'Inbound Call'} onChange={function(e) { set('source', e.target.value) }} style={inpStyle} />
            <label style={lblStyle}>Assign to</label>
            <select value={cfg.assign || 'round_robin'} onChange={function(e) { set('assign', e.target.value) }} style={selStyle}>
              <option value="round_robin">Round robin</option>
              <option value="fewest_leads">Fewest leads</option>
              <option value="specific">Specific agent</option>
            </select>
            {cfg.assign === 'specific' && (
              <select value={cfg.agent_id || ''} onChange={function(e) { set('agent_id', e.target.value) }} style={selStyle}>
                <option value="">-- Select agent --</option>
                {safeAgents.map(function(a) { return <option key={a.id} value={a.id}>{a.name}</option> })}
              </select>
            )}
            <div style={infoStyle}>Creates or updates a Contact in TargetOS from the caller phone number.</div>
          </div>
        )}

        {node.type === 'sms' && (
          <div>
            <label style={lblStyle}>SMS message</label>
            <textarea value={cfg.text || ''} onChange={function(e) { set('text', e.target.value) }} placeholder="Thanks for calling! An agent will reach out shortly." rows={3} style={taStyle} />
            <label style={lblStyle}>Send to</label>
            <select value={cfg.send_to || 'caller'} onChange={function(e) { set('send_to', e.target.value) }} style={selStyle}>
              <option value="caller">Caller</option>
              <option value="agent">Assigned agent</option>
              <option value="both">Both</option>
            </select>
          </div>
        )}

      </div>
      <div style={{padding:'12px 14px', borderTop:'1px solid var(--border)', flexShrink:0}}>
        <Btn onClick={function() { onSave(node.id, cfg); onClose() }} style={{width:'100%'}}>Save</Btn>
      </div>
    </div>
  )
}

export function CallFlow() {
  var appCtx   = useApp()
  var toast    = appCtx.toast
  var agentsCtx = useAgents()
  var agents   = agentsCtx.agents || []
  var navigate = useNavigate()

  var initNodes = [{ id:'start', type:'incoming', x:60, y:200, config:{} }]
  var stateNodes     = useState(initNodes)
  var nodes          = stateNodes[0]
  var setNodes       = stateNodes[1]
  var stateEdges     = useState([])
  var edges          = stateEdges[0]
  var setEdges       = stateEdges[1]
  var stateSelected  = useState(null)
  var selected       = stateSelected[0]
  var setSelected    = stateSelected[1]
  var statePending   = useState(null)
  var pending        = statePending[0]
  var setPending     = statePending[1]
  var stateName      = useState('Main Call Flow')
  var flowName       = stateName[0]
  var setFlowName    = stateName[1]
  var stateSavedId   = useState(null)
  var savedId        = stateSavedId[0]
  var setSavedId     = stateSavedId[1]
  var stateSaving    = useState(false)
  var saving         = stateSaving[0]
  var setSaving      = stateSaving[1]
  var stateHelp      = useState(false)
  var help           = stateHelp[0]
  var setHelp        = stateHelp[1]
  var nextId = useRef(200)

  useEffect(function() { loadFlow() }, [])

  function loadFlow() {
    supabase.from('phone_ivr').select('*').order('updated_at', { ascending:false }).limit(1).maybeSingle()
      .then(function(result) {
        var data = result.data
        if (data && data.flow_nodes && data.flow_nodes.length) {
          setNodes(data.flow_nodes)
          setEdges(data.flow_edges || [])
          setFlowName(data.name || 'Main Call Flow')
          setSavedId(data.id)
        }
      })
      .catch(function(e) { console.warn('CallFlow load:', e.message) })
  }

  function saveFlow() {
    setSaving(true)
    var menuNode  = nodes.find(function(n) { return n.type === 'menu' })
    var greetNode = nodes.find(function(n) { return n.type === 'greeting' })
    var gText = (greetNode && greetNode.config && greetNode.config.text) || (menuNode && menuNode.config && menuNode.config.text) || ''
    var mOpts = menuNode && menuNode.config && menuNode.config.options ? menuNode.config.options.map(function(o) { return { key:o.key, label:o.label, say:o.say, action:'extension', value:'' } }) : []
    var payload = { name:flowName, flow_nodes:nodes, flow_edges:edges, greeting_text:gText, menu_options:mOpts, updated_at:new Date().toISOString() }
    var promise = savedId
      ? supabase.from('phone_ivr').update(payload).eq('id', savedId)
      : supabase.from('phone_ivr').insert(Object.assign({}, payload, { is_active:false, voicemail_extension:'9', created_at:new Date().toISOString() })).select().single()
    promise.then(function(result) {
      if (!savedId && result.data) setSavedId(result.data.id)
      toast('Flow saved')
    }).catch(function(e) { toast('Save failed: ' + e.message, '#DC2626') })
    .finally(function() { setSaving(false) })
  }

  function addNode(type) {
    var id = 'n' + (++nextId.current)
    setNodes(function(p) { return p.concat([{ id:id, type:type, x:200+Math.random()*200, y:80+Math.random()*280, config:defCfg(type) }]) })
  }

  function moveNode(id, x, y) {
    setNodes(function(p) { return p.map(function(n) { return n.id===id ? Object.assign({},n,{x:Math.max(0,x),y:Math.max(0,y)}) : n }) })
  }

  function deleteNode(id) {
    setNodes(function(p) { return p.filter(function(n) { return n.id !== id }) })
    setEdges(function(p) { return p.filter(function(e) { return e.from !== id && e.to !== id }) })
    if (selected === id) setSelected(null)
  }

  function updateCfg(id, cfg) {
    setNodes(function(p) { return p.map(function(n) { return n.id===id ? Object.assign({},n,{config:cfg}) : n }) })
  }

  function findNodeId(el) {
    var cur = el
    while (cur && cur !== document.body) {
      if (cur.dataset && cur.dataset.nid) return cur.dataset.nid
      cur = cur.parentElement || cur.parentNode
    }
    return null
  }

  function handlePort(fromId, port) { setPending({ fromId:fromId, port:port }) }

  function handleCanvas(e) {
    if (!pending) { setSelected(null); return }
    var toId = findNodeId(e.target)
    if (toId && toId !== pending.fromId) {
      var eid = 'e_' + pending.fromId + '_' + pending.port + '_' + toId + '_' + Date.now()
      setEdges(function(prev) { return prev.concat([{ id:eid, from:pending.fromId, port:pending.port, to:toId }]) })
      setPending(null)
    } else if (!toId) {
      // Clicked empty canvas - cancel pending
      setPending(null)
    }
    // If toId === fromId, keep pending so user can try again
  }

  function delEdge(id) { setEdges(function(p) { return p.filter(function(e) { return e.id !== id }) }) }

  function ePath(edge) {
    var from = nodes.find(function(n) { return n.id === edge.from })
    var to   = nodes.find(function(n) { return n.id === edge.to })
    if (!from || !to) return ''
    var opts = (from.config && from.config.options) ? from.config.options : []
    var sy = from.y + NH / 2
    if (edge.port === 'yes')       sy = from.y + NH * 0.3
    else if (edge.port === 'no')   sy = from.y + NH * 0.7
    else if (edge.port === 'answered')  sy = from.y + NH * 0.35
    else if (edge.port === 'noanswer')  sy = from.y + NH * 0.65
    else if (edge.port && edge.port.indexOf('key_') === 0) {
      var key = edge.port.slice(4)
      var ki  = -1
      for (var j = 0; j < opts.length; j++) { if (opts[j].key === key) { ki = j; break } }
      if (ki >= 0) sy = from.y + (NH / (opts.length + 1)) * (ki + 1)
    }
    var x1=from.x+NW, y1=sy, x2=to.x, y2=to.y+NH/2
    var cx=(x1+x2)/2
    return 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2
  }

  function eColor(edge) {
    if (edge.port === 'yes' || edge.port === 'answered') return '#10B981'
    if (edge.port === 'no'  || edge.port === 'noanswer') return '#DC2626'
    if (edge.port && edge.port.indexOf('key_') === 0) {
      var from = nodes.find(function(n) { return n.id === edge.from })
      var opts  = (from && from.config && from.config.options) ? from.config.options : []
      var key   = edge.port.slice(4)
      var ci    = -1
      for (var j = 0; j < opts.length; j++) { if (opts[j].key === key) { ci = j; break } }
      return COLORS[ci >= 0 ? ci % COLORS.length : 0]
    }
    return '#94A3B8'
  }

  function eLabel(edge) {
    if (edge.port === 'yes')       return 'YES'
    if (edge.port === 'no')        return 'NO'
    if (edge.port === 'answered')  return 'Answered'
    if (edge.port === 'noanswer')  return 'No Answer'
    if (edge.port && edge.port.indexOf('key_') === 0) {
      var key  = edge.port.slice(4)
      var from = nodes.find(function(n) { return n.id === edge.from })
      var opts  = (from && from.config && from.config.options) ? from.config.options : []
      var opt   = null
      for (var j = 0; j < opts.length; j++) { if (opts[j].key === key) { opt = opts[j]; break } }
      return 'Press ' + key + (opt && opt.label ? ' - ' + opt.label : '')
    }
    return ''
  }

  var selectedNode = nodes.find(function(n) { return n.id === selected })

  return (
    <div style={{fontFamily:ff, height:'calc(100vh - 48px)', display:'flex', flexDirection:'column', overflow:'hidden'}}>

      <div style={{display:'flex', alignItems:'center', gap:10, padding:'9px 14px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--panel)', flexWrap:'wrap'}}>
        <button onClick={function() { navigate('/calls') }}
          style={{background:'none', border:'none', cursor:'pointer', fontSize:12, color:'var(--muted)', fontFamily:ff}}>
          &lt; Phone System
        </button>
        <div style={{width:1, height:16, background:'var(--border)'}} />
        <div style={{fontSize:15, fontWeight:800, color:'var(--text)'}}>Call Flow Builder</div>
        <input value={flowName} onChange={function(e) { setFlowName(e.target.value) }}
          style={{padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, width:180}} />
        <div style={{flex:1}} />
        <button onClick={function() { setHelp(function(h) { return !h }) }}
          style={{padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff}}>
          {help ? 'Hide help' : '? Help'}
        </button>
        <button onClick={function() { if (window.confirm('Clear canvas?')) { setNodes([{ id:'start', type:'incoming', x:60, y:200, config:{} }]); setEdges([]); setSelected(null) } }}
          style={{padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff}}>
          Clear
        </button>
        <Btn onClick={saveFlow} loading={saving}>Save Flow</Btn>
      </div>

      {help && (
        <div style={{padding:'8px 14px', background:'#EFF6FF', borderBottom:'1px solid #BFDBFE', display:'flex', gap:20, flexWrap:'wrap', fontSize:11, color:'#1E40AF'}}>
          <span>1. Click a node in the palette to add it</span>
          <span>2. Click a node to configure it on the right</span>
          <span>3. Click the colored dot on the right of a node, then click another node to connect</span>
          <span>4. Click any arrow to delete it</span>
          <span>5. Click X on a selected node to delete it</span>
        </div>
      )}

      <div style={{flex:1, display:'flex', overflow:'hidden'}}>

        <div style={{width:155, borderRight:'1px solid var(--border)', background:'var(--dim)', overflowY:'auto', flexShrink:0, padding:'8px 6px'}}>
          {CATS.map(function(cat) {
            return (
              <div key={cat.id}>
                <div style={{fontSize:9, fontWeight:700, color:cat.color, textTransform:'uppercase', letterSpacing:'.07em', padding:'6px 6px 3px', marginTop:cat.id==='trigger'?0:8}}>
                  {cat.label}
                </div>
                {NODE_DEFS.filter(function(n) { return n.cat === cat.id && n.type !== 'incoming' }).map(function(t) {
                  return (
                    <div key={t.type} onClick={function() { addNode(t.type) }}
                      style={{display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:7, cursor:'pointer', marginBottom:2, border:'1px solid transparent', background:'var(--panel)', transition:'all .1s'}}
                      onMouseEnter={function(e) { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = t.color + '12' }}
                      onMouseLeave={function(e) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'var(--panel)' }}>
                      <div style={{width:8, height:8, borderRadius:'50%', background:t.color, flexShrink:0}} />
                      <span style={{fontSize:10, fontWeight:700, color:'var(--text)', lineHeight:1.3}}>{t.label}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        <div style={{flex:1, position:'relative', overflow:'hidden', cursor: pending ? 'crosshair' : 'default'}}>
          <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0}}>
            <defs>
              <pattern id="cfgrid" width={28} height={28} patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#E2E8F0" strokeWidth={0.8} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cfgrid)" />
          </svg>

          <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible', zIndex:1}} onMouseUp={handleCanvas}>
            <defs>
              <marker id="mG" markerWidth={7} markerHeight={7} refX={5} refY={3} orient="auto"><path d="M 0 0 L 5 3 L 0 6 z" fill="#10B981" /></marker>
              <marker id="mR" markerWidth={7} markerHeight={7} refX={5} refY={3} orient="auto"><path d="M 0 0 L 5 3 L 0 6 z" fill="#DC2626" /></marker>
              <marker id="mN" markerWidth={7} markerHeight={7} refX={5} refY={3} orient="auto"><path d="M 0 0 L 5 3 L 0 6 z" fill="#94A3B8" /></marker>
            </defs>

            {edges.map(function(edge) {
              var p    = ePath(edge)
              var c    = eColor(edge)
              var lbl  = eLabel(edge)
              var mid  = c === '#10B981' ? '#mG' : c === '#DC2626' ? '#mR' : '#mN'
              var from = nodes.find(function(n) { return n.id === edge.from })
              var to   = nodes.find(function(n) { return n.id === edge.to })
              var mx   = (from && to) ? (from.x + NW + to.x) / 2 : 0
              var my   = (from && to) ? (from.y + to.y) / 2 + 20  : 0
              return (
                <g key={edge.id}>
                  <path d={p} fill="none" stroke="transparent" strokeWidth={14} style={{cursor:'pointer'}}
                    onClick={function(e) { e.stopPropagation(); delEdge(edge.id) }} />
                  <path d={p} fill="none" stroke={c} strokeWidth={2.5} opacity={0.75} markerEnd={'url(' + mid + ')'} />
                  {lbl ? (
                    <g>
                      <rect x={mx-30} y={my-9} width={60} height={16} rx={8} fill={c} opacity={0.9} />
                      <text x={mx} y={my+4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily={ff}>{lbl}</text>
                    </g>
                  ) : null}
                </g>
              )
            })}

            {nodes.map(function(node) {
              return (
                <g key={node.id} data-nid={node.id}>
                  <FlowNode
                    node={node}
                    selected={selected === node.id}
                    agents={agents}
                    onSelect={function(id) { setSelected(id) }}
                    onMove={moveNode}
                    onDelete={deleteNode}
                    onPort={handlePort}
                  />
                </g>
              )
            })}
          </svg>

          {pending ? (
            <div style={{position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', padding:'7px 18px', borderRadius:20, background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, zIndex:10, pointerEvents:'none', boxShadow:'0 4px 16px rgba(0,0,0,.25)'}}>
              Now click another node to connect
            </div>
          ) : null}

          {nodes.length <= 1 ? (
            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
              <div style={{textAlign:'center', padding:32, opacity:0.4}}>
                <div style={{fontSize:14, fontWeight:700, color:'var(--text)'}}>Click any node in the palette to start building</div>
              </div>
            </div>
          ) : null}
        </div>

        {selectedNode ? (
          <ConfigPanel
            node={selectedNode}
            agents={agents}
            onSave={updateCfg}
            onClose={function() { setSelected(null) }}
          />
        ) : null}

      </div>
    </div>
  )
}
