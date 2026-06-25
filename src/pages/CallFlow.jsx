// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Visual Call Flow Builder
// Each node is configurable. IVR Menu nodes have per-key branches.
// Connect nodes with arrows. Save flows to Supabase.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Btn }      from '../components/UI'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const NODE_W = 200
const NODE_H = 72

const NODE_TYPES = [
  { type:'incoming',    label:'Incoming Call',    icon:'📞', color:'#10B981' },
  { type:'greeting',    label:'Play Greeting',    icon:'🔊', color:'#3B82F6' },
  { type:'menu',        label:'IVR Menu',         icon:'🎛', color:'#8B5CF6' },
  { type:'condition',   label:'If / Condition',   icon:'🔀', color:'#F5A623' },
  { type:'dial',        label:'Dial Agent',       icon:'📱', color:'#CC2200' },
  { type:'round_robin', label:'Round Robin',      icon:'🔄', color:'#6366F1' },
  { type:'voicemail',   label:'Voicemail',        icon:'📬', color:'#EC4899' },
  { type:'create_lead', label:'Create Lead',      icon:'👤', color:'#14B8A6' },
  { type:'sms',         label:'Send SMS',         icon:'💬', color:'#84CC16' },
  { type:'hangup',      label:'Hang Up',          icon:'📵', color:'#94A3B8' },
]

const COLORS = ['#CC2200','#10B981','#3B82F6','#F5A623','#8B5CF6','#EC4899','#14B8A6','#6366F1','#84CC16','#94A3B8']

// ── HELPERS ────────────────────────────────────────────────────
function def(type) { return NODE_TYPES.find(t => t.type === type) || NODE_TYPES[0] }
function defCfg(type) {
  if (type === 'menu')        return { text: '', options: [{ key:'1', label:'Sales', say:'' }, { key:'2', label:'Support', say:'' }, { key:'9', label:'Voicemail', say:'' }] }
  if (type === 'condition')   return { condition: 'known_contact', yesLabel: 'Yes', noLabel: 'No' }
  if (type === 'greeting')    return { text: '' }
  if (type === 'dial')        return { agent_id: '', timeout: 30 }
  if (type === 'round_robin') return { agent_ids: [], timeout: 30 }
  if (type === 'voicemail')   return { text: 'Please leave your name and number after the tone.', max_length: 120 }
  if (type === 'sms')         return { text: 'Thanks for calling Target Team! An agent will reach you shortly.' }
  if (type === 'create_lead') return { source: 'Inbound Call', agent_id: '' }
  return {}
}

// ── FLOW NODE SVG ─────────────────────────────────────────────
function FlowNode({ node, selected, onSelect, onMove, onDelete, onConnect, agents }) {
  const d = def(node.type)

  function onMouseDown(e) {
    if (e.target.classList.contains('port') || e.target.classList.contains('del')) return
    e.preventDefault()
    const sx = e.clientX - node.x, sy = e.clientY - node.y
    const mv = me => onMove(node.id, me.clientX - sx, me.clientY - sy)
    const up = ()  => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
    onSelect(node.id)
  }

  const agentName = node.config?.agent_id ? agents.find(a=>a.id===node.config.agent_id)?.name?.split(' ')[0] : null
  const subLabel  = node.type === 'menu'        ? (node.config?.options?.length || 0) + ' options'
                  : node.type === 'condition'   ? node.config?.condition?.replace(/_/g,' ')
                  : node.type === 'dial'        ? (agentName || 'pick agent')
                  : node.type === 'round_robin' ? (node.config?.agent_ids?.length || 0) + ' agents'
                  : node.type === 'greeting'    ? (node.config?.text?.slice(0,24) || 'set message')
                  : node.type === 'voicemail'   ? 'record voicemail'
                  : node.type === 'sms'         ? 'send text'
                  : node.type === 'create_lead' ? 'auto-create contact'
                  : node.type === 'hangup'      ? 'end call'
                  : 'incoming'

  // For condition and menu nodes, show multiple output ports
  const isPorts = node.type === 'condition'
  const menuOpts = node.type === 'menu' ? (node.config?.options || []) : []

  return (
    <g transform={`translate(${node.x},${node.y})`} style={{ cursor:'grab' }} onMouseDown={onMouseDown}>
      {/* Shadow */}
      <rect x={2} y={3} width={NODE_W} height={NODE_H} rx={10} fill="rgba(0,0,0,.10)" />
      {/* Card */}
      <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={10}
        fill={selected ? d.color : '#fff'}
        stroke={selected ? d.color : '#E2E8F0'}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      {/* Left stripe */}
      <rect x={0} y={0} width={7} height={NODE_H} rx={4} fill={d.color} />

      {/* Icon */}
      <text x={24} y={44} fontSize={22} textAnchor="middle">{d.icon}</text>

      {/* Label */}
      <text x={42} y={30} fontSize={12} fontWeight={700}
        fill={selected ? '#fff' : '#1E293B'} fontFamily={ff}>{d.label}</text>

      {/* Sub label */}
      <text x={42} y={48} fontSize={10}
        fill={selected ? 'rgba(255,255,255,.75)' : '#64748B'} fontFamily={ff}
        style={{ fontStyle: subLabel === 'set message' || subLabel === 'pick agent' ? 'italic' : 'normal' }}>
        {subLabel}
      </text>

      {/* Delete button (only when selected) */}
      {selected && node.type !== 'incoming' && (
        <g className="del" onClick={e => { e.stopPropagation(); onDelete(node.id) }} style={{ cursor:'pointer' }}>
          <circle cx={NODE_W - 10} cy={10} r={8} fill="#DC2626" />
          <text x={NODE_W - 10} y={14} fontSize={11} textAnchor="middle" fill="#fff" fontFamily={ff} style={{ pointerEvents:'none' }}>✕</text>
        </g>
      )}

      {/* Input port (left) */}
      {node.type !== 'incoming' && (
        <circle cx={0} cy={NODE_H/2} r={6} fill="#E2E8F0" stroke={d.color} strokeWidth={2} />
      )}

      {/* Output ports */}
      {isPorts ? (
        // Condition: Yes / No ports
        <>
          <g className="port" onClick={e => { e.stopPropagation(); onConnect(node.id, 'yes') }} style={{ cursor:'crosshair' }}>
            <circle cx={NODE_W} cy={NODE_H/3} r={7} fill="#10B981" stroke="#fff" strokeWidth={2} />
            <text x={NODE_W - 10} y={NODE_H/3 + 4} fontSize={9} textAnchor="end" fill="#10B981" fontFamily={ff} fontWeight={700}>YES</text>
          </g>
          <g className="port" onClick={e => { e.stopPropagation(); onConnect(node.id, 'no') }} style={{ cursor:'crosshair' }}>
            <circle cx={NODE_W} cy={2*NODE_H/3} r={7} fill="#DC2626" stroke="#fff" strokeWidth={2} />
            <text x={NODE_W - 10} y={2*NODE_H/3 + 4} fontSize={9} textAnchor="end" fill="#DC2626" fontFamily={ff} fontWeight={700}>NO</text>
          </g>
        </>
      ) : node.type === 'menu' && menuOpts.length > 0 ? (
        // Menu: one port per option
        menuOpts.map((opt, i) => {
          const cy = (NODE_H / (menuOpts.length + 1)) * (i + 1)
          return (
            <g key={i} className="port" onClick={e => { e.stopPropagation(); onConnect(node.id, 'key_' + opt.key) }} style={{ cursor:'crosshair' }}>
              <circle cx={NODE_W} cy={cy} r={7} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />
              <text x={NODE_W - 10} y={cy + 4} fontSize={9} textAnchor="end" fill={COLORS[i % COLORS.length]} fontFamily={ff} fontWeight={700}>
                {opt.key}
              </text>
            </g>
          )
        })
      ) : node.type !== 'hangup' ? (
        // Default: single output port
        <g className="port" onClick={e => { e.stopPropagation(); onConnect(node.id, 'default') }} style={{ cursor:'crosshair' }}>
          <circle cx={NODE_W} cy={NODE_H/2} r={7} fill={d.color} stroke="#fff" strokeWidth={2} />
        </g>
      ) : null}
    </g>
  )
}

// ── CONFIG PANEL ──────────────────────────────────────────────
function ConfigPanel({ node, agents, onChange, onClose }) {
  const d   = def(node.type)
  const [cfg, setCfg] = useState({ ...node.config })
  const set = (k, v)  => setCfg(p => ({ ...p, [k]: v }))

  // Menu options helpers
  function setOpt(i, k, v) {
    const opts = [...(cfg.options || [])]
    opts[i] = { ...opts[i], [k]: v }
    set('options', opts)
  }
  function addOpt() {
    const opts = [...(cfg.options || [])]
    opts.push({ key: String(opts.length + 1), label: '', say: '' })
    set('options', opts)
  }
  function removeOpt(i) {
    const opts = [...(cfg.options || [])]
    opts.splice(i, 1)
    set('options', opts)
  }

  const Lbl = ({ c }) => (
    <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{c}</div>
  )
  const TextArea = ({ k, placeholder, rows=3 }) => (
    <textarea value={cfg[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }} />
  )
  const Input = ({ k, placeholder, type='text' }) => (
    <input type={type} value={cfg[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:10 }} />
  )
  const AgentSelect = ({ k }) => (
    <select value={cfg[k]||''} onChange={e => set(k, e.target.value)}
      style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }}>
      <option value="">— Select agent —</option>
      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )

  return (
    <div style={{ width:300, borderLeft:'1px solid var(--border)', background:'var(--panel)', display:'flex', flexDirection:'column', flexShrink:0 }}>
      {/* Header */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:18 }}>{d.icon}</span>
        <div style={{ flex:1, fontSize:13, fontWeight:800, color:'var(--text)' }}>Configure: {d.label}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'var(--muted)' }}>✕</button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px' }}>

        {/* GREETING */}
        {node.type === 'greeting' && <>
          <Lbl c="What should the caller hear? (Text-to-Speech)" />
          <TextArea k="text" placeholder="Thank you for calling Target Team. Please hold while we connect you." rows={4} />
          <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>This will be spoken aloud by an automated voice when the caller connects.</div>
        </>}

        {/* IVR MENU */}
        {node.type === 'menu' && <>
          <Lbl c="Menu prompt (spoken to caller)" />
          <TextArea k="text" placeholder="For sales press 1. For Lazer press 2. To leave a voicemail press 9." rows={4} />

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <Lbl c="Keypress options" />
            <button onClick={addOpt}
              style={{ padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
              + Add option
            </button>
          </div>

          {(cfg.options || []).map((opt, i) => (
            <div key={i} style={{ background:'var(--dim)', borderRadius:9, border:'1px solid var(--border)', padding:'10px 12px', marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                {/* Key badge */}
                <div style={{ width:32, height:32, borderRadius:8, background:COLORS[i%COLORS.length], display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <input value={opt.key||''} onChange={e => setOpt(i,'key',e.target.value)}
                    style={{ width:24, textAlign:'center', background:'transparent', border:'none', color:'#fff', fontSize:16, fontWeight:900, fontFamily:ff, outline:'none' }} />
                </div>
                <input value={opt.label||''} onChange={e => setOpt(i,'label',e.target.value)}
                  placeholder="Option label (e.g. Sales)"
                  style={{ flex:1, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} />
                <button onClick={() => removeOpt(i)}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:14 }}>✕</button>
              </div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' }}>
                What to say when caller presses {opt.key}:
              </div>
              <input value={opt.say||''} onChange={e => setOpt(i,'say',e.target.value)}
                placeholder={`"Connecting you to ${opt.label || 'agent'}..."  (leave blank to connect silently)`}
                style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }} />
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4, fontStyle:'italic' }}>
                → Connect the arrow from the <strong style={{ color:COLORS[i%COLORS.length] }}>"{opt.key}"</strong> port on the right to the next step
              </div>
            </div>
          ))}
        </>}

        {/* CONDITION */}
        {node.type === 'condition' && <>
          <Lbl c="Check if..." />
          <select value={cfg.condition||'known_contact'} onChange={e => set('condition', e.target.value)}
            style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }}>
            <option value="known_contact">Caller is a known contact in CRM</option>
            <option value="has_agent">Caller has an assigned agent</option>
            <option value="business_hours">It is currently business hours (9am-6pm)</option>
            <option value="after_hours">It is currently after hours</option>
            <option value="voicemail_full">Voicemail box is full</option>
          </select>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            <div>
              <Lbl c="YES branch label" />
              <input value={cfg.yesLabel||'Yes'} onChange={e => set('yesLabel', e.target.value)}
                style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #10B98144', background:'#10B98108', color:'#10B981', fontSize:12, fontFamily:ff, boxSizing:'border-box' }} />
            </div>
            <div>
              <Lbl c="NO branch label" />
              <input value={cfg.noLabel||'No'} onChange={e => set('noLabel', e.target.value)}
                style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'1px solid #DC262644', background:'#DC262608', color:'#DC2626', fontSize:12, fontFamily:ff, boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ padding:'8px 10px', background:'#FFF7ED', borderRadius:8, border:'1px solid #F5A62344', fontSize:11, color:'#92400E' }}>
            This creates two output ports (green YES, red NO). Connect each to the next step for that branch.
          </div>
        </>}

        {/* DIAL AGENT */}
        {node.type === 'dial' && <>
          <Lbl c="Ring this agent" />
          <AgentSelect k="agent_id" />
          <Lbl c="Ring for how many seconds before giving up?" />
          <Input k="timeout" placeholder="30" type="number" />
          <div style={{ padding:'8px 10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
            If the agent doesn't answer, the call continues to the next connected node (e.g. Voicemail).
          </div>
        </>}

        {/* ROUND ROBIN */}
        {node.type === 'round_robin' && <>
          <Lbl c="Rotate calls between these agents" />
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            {agents.map(a => {
              const ids = cfg.agent_ids || []
              const on  = ids.includes(a.id)
              return (
                <button key={a.id}
                  onClick={() => set('agent_ids', on ? ids.filter(x=>x!==a.id) : [...ids, a.id])}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:20, border:`1px solid ${on?'#CC2200':'var(--border)'}`, background:on?'rgba(204,34,0,.1)':'transparent', color:on?'#CC2200':'var(--muted)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                  {on && '✓ '}{a.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
          <Lbl c="Ring each agent for (seconds)" />
          <Input k="timeout" placeholder="30" type="number" />
        </>}

        {/* VOICEMAIL */}
        {node.type === 'voicemail' && <>
          <Lbl c="What to say before the beep" />
          <TextArea k="text" placeholder="Please leave your name, number, and a brief message and we'll call you back shortly." />
          <Lbl c="Max recording length (seconds)" />
          <Input k="max_length" placeholder="120" type="number" />
        </>}

        {/* SMS */}
        {node.type === 'sms' && <>
          <Lbl c="SMS message to send caller" />
          <TextArea k="text" placeholder="Thanks for calling Target Team! An agent will reach out to you shortly." />
          <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>Sent automatically to the caller's phone number after this step.</div>
        </>}

        {/* CREATE LEAD */}
        {node.type === 'create_lead' && <>
          <Lbl c="Source label for new contact" />
          <Input k="source" placeholder="Inbound Call" />
          <Lbl c="Assign to agent (optional)" />
          <AgentSelect k="agent_id" />
          <div style={{ padding:'8px 10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
            Creates a new Contact in the CRM from the caller's phone number. If the contact already exists it will be skipped.
          </div>
        </>}

        {node.type === 'incoming' && (
          <div style={{ padding:'10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
            This is the starting node — it represents when a call comes in to your Twilio number. Connect it to the first step you want the caller to experience.
          </div>
        )}

        {node.type === 'hangup' && (
          <div style={{ padding:'10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
            Ends the call. No configuration needed. Connect this from any step that should terminate the call.
          </div>
        )}

      </div>

      <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)' }}>
        <Btn onClick={() => { onChange(node.id, cfg); onClose() }} style={{ width:'100%' }}>✅ Apply</Btn>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN FLOW BUILDER PAGE
// ══════════════════════════════════════════════════════════════
export function CallFlow() {
  const { isAdmin }     = useAuth()
  const { toast }       = useApp()
  const { agents }      = useAgents()
  const navigate        = useNavigate()

  const [nodes,      setNodes]      = useState([{ id:'start', type:'incoming', x:60, y:180, config:{} }])
  const [edges,      setEdges]      = useState([])
  const [selected,   setSelected]   = useState(null)
  const [connecting, setConnecting] = useState(null) // { fromId, port }
  const [flowName,   setFlowName]   = useState('Main Call Flow')
  const [activeFlow, setActiveFlow] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const nextId = useRef(100)
  const svgRef = useRef(null)

  useEffect(() => { loadFlow() }, [])

  async function loadFlow() {
    const { data } = await supabase.from('phone_ivr').select('*').order('created_at', { ascending:false }).limit(1).maybeSingle()
    if (data && data.flow_nodes && data.flow_nodes.length > 0) {
      setNodes(data.flow_nodes)
      setEdges(data.flow_edges || [])
      setFlowName(data.name || 'Main Call Flow')
      setActiveFlow(data.id)
    }
  }

  async function saveFlow() {
    setSaving(true)
    try {
      // Also build menu_options for the IVR webhook from the flow
      const menuNode  = nodes.find(n => n.type === 'menu')
      const menuOpts  = menuNode?.config?.options || []
      const ivrText   = nodes.find(n => n.type === 'greeting')?.config?.text ||
                        menuNode?.config?.text || ''

      const payload = {
        name:          flowName,
        flow_nodes:    nodes,
        flow_edges:    edges,
        greeting_text: ivrText,
        menu_options:  menuOpts.map(o => ({ key: o.key, label: o.label, say: o.say, action: 'extension', value: '' })),
        updated_at:    new Date().toISOString(),
      }

      if (activeFlow) {
        await supabase.from('phone_ivr').update(payload).eq('id', activeFlow)
        toast('✅ Flow saved')
      } else {
        const { data } = await supabase.from('phone_ivr')
          .insert({ ...payload, is_active: false, voicemail_extension:'9', created_at: new Date().toISOString() })
          .select().single()
        setActiveFlow(data.id)
        toast('✅ Flow saved')
      }
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  function addNode(type) {
    const id  = 'n' + (++nextId.current)
    const cfg = defCfg(type)
    setNodes(p => [...p, { id, type, x: 200 + Math.random()*200, y: 80 + Math.random()*300, config: cfg }])
  }

  function moveNode(id, x, y) {
    setNodes(p => p.map(n => n.id === id ? { ...n, x: Math.max(0,x), y: Math.max(0,y) } : n))
  }

  function deleteNode(id) {
    setNodes(p => p.filter(n => n.id !== id))
    setEdges(p => p.filter(e => e.from !== id && e.to !== id))
    if (selected === id) setSelected(null)
  }

  function updateCfg(id, cfg) {
    setNodes(p => p.map(n => n.id === id ? { ...n, config: cfg } : n))
    // After config change, re-render ports
  }

  function startConnect(fromId, port) {
    setConnecting({ fromId, port })
  }

  function handleSvgClick(e) {
    if (!connecting) { setSelected(null); return }
    const g = e.target.closest('[data-nid]')
    if (g) {
      const toId = g.dataset.nid
      if (toId !== connecting.fromId) {
        const edgeId = `e_${connecting.fromId}_${connecting.port}_${toId}_${Date.now()}`
        setEdges(p => [...p, { id: edgeId, from: connecting.fromId, port: connecting.port, to: toId }])
      }
    }
    setConnecting(null)
  }

  function deleteEdge(id) {
    setEdges(p => p.filter(e => e.id !== id))
  }

  // Build SVG path between two nodes
  function edgePath(edge) {
    const from = nodes.find(n => n.id === edge.from)
    const to   = nodes.find(n => n.id === edge.to)
    if (!from || !to) return ''

    // Determine source y based on port
    let sy = from.y + NODE_H/2
    if (edge.port === 'yes') sy = from.y + NODE_H/3
    else if (edge.port === 'no') sy = from.y + 2*NODE_H/3
    else if (edge.port && edge.port.startsWith('key_')) {
      const key  = edge.port.replace('key_','')
      const opts = from.config?.options || []
      const i    = opts.findIndex(o => o.key === key)
      if (i >= 0) sy = from.y + (NODE_H/(opts.length+1)) * (i+1)
    }

    const x1 = from.x + NODE_W
    const x2 = to.x
    const y2 = to.y + NODE_H/2
    const cx  = (x1 + x2) / 2

    return `M ${x1} ${sy} C ${cx} ${sy}, ${cx} ${y2}, ${x2} ${y2}`
  }

  function edgeColor(edge) {
    if (edge.port === 'yes') return '#10B981'
    if (edge.port === 'no')  return '#DC2626'
    if (edge.port && edge.port.startsWith('key_')) {
      const from = nodes.find(n => n.id === edge.from)
      const opts  = from?.config?.options || []
      const i     = opts.findIndex(o => o.key === edge.port.replace('key_',''))
      return COLORS[i >= 0 ? i % COLORS.length : 0]
    }
    return '#CC2200'
  }

  function edgeLabel(edge) {
    if (edge.port === 'yes') return 'YES'
    if (edge.port === 'no')  return 'NO'
    if (edge.port && edge.port.startsWith('key_')) {
      const key  = edge.port.replace('key_','')
      const from = nodes.find(n => n.id === edge.from)
      const opt  = from?.config?.options?.find(o => o.key === key)
      return 'Press ' + key + (opt?.label ? ' · ' + opt.label : '')
    }
    return ''
  }

  const selectedNode = nodes.find(n => n.id === selected)

  return (
    <div style={{ fontFamily:ff, height:'calc(100vh - 48px)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--panel)' }}>
        <button onClick={() => navigate('/calls')}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--muted)', fontFamily:ff, display:'flex', alignItems:'center', gap:4 }}>
          ← Back
        </button>
        <div style={{ width:1, height:18, background:'var(--border)' }} />
        <div style={{ fontSize:15, fontWeight:800, color:'var(--text)' }}>🔀 Call Flow Builder</div>
        <input value={flowName} onChange={e => setFlowName(e.target.value)}
          style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, width:200 }} />
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:'var(--muted)' }}>Click node to configure · Drag orange port → another node to connect</div>
        <button onClick={() => { if (window.confirm('Clear canvas?')) { setNodes([{ id:'start', type:'incoming', x:60, y:180, config:{} }]); setEdges([]) } }}
          style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
          Clear
        </button>
        <Btn onClick={saveFlow} loading={saving}>💾 Save Flow</Btn>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Node palette */}
        <div style={{ width:155, borderRight:'1px solid var(--border)', background:'var(--dim)', padding:'10px 6px', overflowY:'auto', flexShrink:0 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8, paddingLeft:6 }}>Click to add</div>
          {NODE_TYPES.filter(t => t.type !== 'incoming').map(t => (
            <div key={t.type} onClick={() => addNode(t.type)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 8px', borderRadius:8, cursor:'pointer', marginBottom:3, border:'1px solid var(--border)', background:'var(--panel)', transition:'all .1s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.boxShadow = `0 0 0 2px ${t.color}22` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
              <span style={{ fontSize:15 }}>{t.icon}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{t.label}</span>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
          {/* Grid */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0 }}>
            <defs>
              <pattern id="g" width={28} height={28} patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#E2E8F0" strokeWidth={.7} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)" />
          </svg>

          {/* Main canvas SVG */}
          <svg ref={svgRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible', zIndex:1 }}
            onClick={handleSvgClick}>

            <defs>
              <marker id="arr" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#CC2200" />
              </marker>
              {COLORS.map((c,i) => (
                <marker key={i} id={`arr${i}`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill={c} />
                </marker>
              ))}
              <marker id="arrGreen" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#10B981" />
              </marker>
              <marker id="arrRed" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#DC2626" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map(edge => {
              const p     = edgePath(edge)
              const c     = edgeColor(edge)
              const label = edgeLabel(edge)
              const markId = edge.port === 'yes' ? 'arrGreen' : edge.port === 'no' ? 'arrRed' : 'arr'
              // Midpoint for label
              const from  = nodes.find(n => n.id === edge.from)
              const to    = nodes.find(n => n.id === edge.to)
              const mx    = from && to ? (from.x + NODE_W + to.x) / 2 : 0
              const sy2   = from ? (edge.port === 'yes' ? from.y + NODE_H/3 : edge.port === 'no' ? from.y + 2*NODE_H/3 : from.y + NODE_H/2) : 0
              const ey    = to ? to.y + NODE_H/2 : 0
              const my    = (sy2 + ey) / 2

              return (
                <g key={edge.id}>
                  {/* Click-target for delete */}
                  <path d={p} fill="none" stroke="transparent" strokeWidth={12} style={{ cursor:'pointer' }}
                    onClick={e => { e.stopPropagation(); deleteEdge(edge.id) }} />
                  {/* Visible edge */}
                  <path d={p} fill="none" stroke={c} strokeWidth={2.5} opacity={.8}
                    markerEnd={`url(#${markId})`} />
                  {/* Label */}
                  {label && (
                    <g>
                      <rect x={mx-28} y={my-9} width={56} height={16} rx={8} fill={c} opacity={.9} />
                      <text x={mx} y={my+3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" fontFamily={ff}>{label}</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(node => (
              <g key={node.id} data-nid={node.id}>
                <FlowNode
                  node={node}
                  selected={selected === node.id}
                  agents={agents}
                  onSelect={id => { setSelected(id); setConnecting(null) }}
                  onMove={moveNode}
                  onDelete={deleteNode}
                  onConnect={startConnect}
                />
              </g>
            ))}
          </svg>

          {/* Connecting hint */}
          {connecting && (
            <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', padding:'6px 16px', borderRadius:20, background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, zIndex:10, pointerEvents:'none', boxShadow:'0 4px 12px rgba(0,0,0,.2)' }}>
              Now click another node to connect →
            </div>
          )}
        </div>

        {/* Config panel */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            agents={agents}
            onChange={updateCfg}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
