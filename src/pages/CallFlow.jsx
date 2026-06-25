// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Visual Call Flow Builder
// Creatio-style visual automation for call routing
// Drag nodes onto canvas, connect them, configure each step
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Btn } from '../components/UI'
import { useAgents } from '../lib/hooks'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── NODE TYPES ────────────────────────────────────────────────
const NODE_TYPES = [
  { type: 'incoming',    label: 'Incoming Call',     icon: '📞', color: '#10B981', desc: 'Call received on your number' },
  { type: 'greeting',    label: 'Play Greeting',     icon: '🔊', color: '#3B82F6', desc: 'Say a message to the caller' },
  { type: 'menu',        label: 'IVR Menu',          icon: '🎛', color: '#8B5CF6', desc: 'Press 1 for... Press 2 for...' },
  { type: 'condition',   label: 'Check Condition',   icon: '🔀', color: '#F5A623', desc: 'Branch based on caller data' },
  { type: 'dial',        label: 'Dial Agent',        icon: '📱', color: '#CC2200', desc: 'Forward to an agent\'s phone' },
  { type: 'round_robin', label: 'Round Robin',       icon: '🔄', color: '#6366F1', desc: 'Rotate between agents' },
  { type: 'voicemail',   label: 'Voicemail',         icon: '📬', color: '#EC4899', desc: 'Record a voicemail message' },
  { type: 'create_lead', label: 'Create Lead',       icon: '👤', color: '#14B8A6', desc: 'Auto-create contact in CRM' },
  { type: 'sms',         label: 'Send SMS',          icon: '💬', color: '#84CC16', desc: 'Send an SMS to the caller' },
  { type: 'hangup',      label: 'Hang Up',           icon: '📵', color: '#94A3B8', desc: 'End the call' },
]

const NODE_W = 180
const NODE_H = 70

// ── NODE COMPONENT ────────────────────────────────────────────
function FlowNode({ node, selected, onSelect, onMove, onDelete, onStartConnect, agents }) {
  const def    = NODE_TYPES.find(t => t.type === node.type) || NODE_TYPES[0]
  const dragRef = useRef(null)

  function onMouseDown(e) {
    if (e.target.closest('.node-action')) return
    e.preventDefault()
    const startX = e.clientX - node.x
    const startY = e.clientY - node.y
    const onMove_ = (me) => onMove(node.id, me.clientX - startX, me.clientY - startY)
    const onUp    = ()   => { document.removeEventListener('mousemove', onMove_); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove_)
    document.addEventListener('mouseup', onUp)
    onSelect(node.id)
  }

  const agentName = node.config?.agent_id
    ? (agents.find(a => a.id === node.config.agent_id)?.name?.split(' ')[0] || 'Agent')
    : null

  return (
    <g transform={`translate(${node.x},${node.y})`} onMouseDown={onMouseDown} style={{ cursor:'grab' }}>
      {/* Shadow */}
      <rect x={3} y={3} width={NODE_W} height={NODE_H} rx={10} fill="rgba(0,0,0,.12)" />
      {/* Card */}
      <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={10}
        fill={selected ? def.color : 'var(--panel,#fff)'}
        stroke={selected ? def.color : '#E2E8F0'}
        strokeWidth={selected ? 2 : 1.5} />
      {/* Left color strip */}
      <rect x={0} y={0} width={6} height={NODE_H} rx={3} fill={def.color} />
      {/* Icon */}
      <text x={22} y={42} fontSize={22} textAnchor="middle">{def.icon}</text>
      {/* Label */}
      <text x={40} y={28} fontSize={12} fontWeight={700} fill={selected ? '#fff' : '#1E293B'} fontFamily={ff}>{def.label}</text>
      {/* Sub label */}
      <text x={40} y={45} fontSize={10} fill={selected ? 'rgba(255,255,255,.8)' : '#64748B'} fontFamily={ff}>
        {agentName || node.config?.key || node.config?.text?.slice(0,22) || def.desc.slice(0,22)}
      </text>
      {/* Delete button */}
      {selected && (
        <g className="node-action" onClick={e => { e.stopPropagation(); onDelete(node.id) }}>
          <circle cx={NODE_W - 10} cy={10} r={9} fill="#DC2626" />
          <text x={NODE_W - 10} y={14} fontSize={12} textAnchor="middle" fill="#fff" fontFamily={ff}>✕</text>
        </g>
      )}
      {/* Output port */}
      <circle cx={NODE_W} cy={NODE_H/2} r={7} fill={def.color} stroke="#fff" strokeWidth={2}
        className="node-action" style={{ cursor:'crosshair' }}
        onMouseDown={e => { e.stopPropagation(); onStartConnect(node.id) }} />
      {/* Input port */}
      <circle cx={0} cy={NODE_H/2} r={7} fill="#E2E8F0" stroke={def.color} strokeWidth={2} />
    </g>
  )
}

// ── NODE CONFIG PANEL ─────────────────────────────────────────
function NodeConfig({ node, agents, onChange, onClose }) {
  const def = NODE_TYPES.find(t => t.type === node.type)
  const [cfg, setCfg] = useState({ ...node.config })
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))

  const Lbl = ({ c }) => <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{c}</div>
  const Inp = ({ k, placeholder, type='text' }) => (
    <input type={type} value={cfg[k]||''} onChange={e => set(k, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box', marginBottom:10 }} />
  )

  return (
    <div style={{ position:'absolute', right:0, top:0, bottom:0, width:280, background:'var(--panel)', borderLeft:'1px solid var(--border)', padding:16, overflowY:'auto', zIndex:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <span style={{ fontSize:20 }}>{def?.icon}</span>
        <div style={{ flex:1, fontSize:14, fontWeight:800, color:'var(--text)' }}>{def?.label}</div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'var(--muted)' }}>✕</button>
      </div>

      {node.type === 'greeting' && <>
        <Lbl c="Message (spoken by TTS)" />
        <textarea value={cfg.text||''} onChange={e => set('text', e.target.value)}
          placeholder="Thank you for calling Target Team..."
          rows={4} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }} />
      </>}

      {node.type === 'menu' && <>
        <Lbl c="Menu Prompt" />
        <textarea value={cfg.text||''} onChange={e => set('text', e.target.value)}
          placeholder="For sales press 1. For support press 2."
          rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }} />
        <Lbl c="Key to press" />
        <Inp k="key" placeholder="1, 2, 3..." />
      </>}

      {node.type === 'dial' && <>
        <Lbl c="Agent to call" />
        <select value={cfg.agent_id||''} onChange={e => set('agent_id', e.target.value)}
          style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }}>
          <option value="">— Select agent —</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Lbl c="Ring timeout (seconds)" />
        <Inp k="timeout" placeholder="30" type="number" />
      </>}

      {node.type === 'round_robin' && <>
        <Lbl c="Agents in rotation" />
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
          {agents.map(a => {
            const ids = cfg.agent_ids || []
            const on  = ids.includes(a.id)
            return (
              <button key={a.id} onClick={() => set('agent_ids', on ? ids.filter(x=>x!==a.id) : [...ids, a.id])}
                style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${on?'#CC2200':'var(--border)'}`, background:on?'rgba(204,34,0,.1)':'transparent', color:on?'#CC2200':'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                {on && '✓ '}{a.name.split(' ')[0]}
              </button>
            )
          })}
        </div>
      </>}

      {node.type === 'condition' && <>
        <Lbl c="Condition" />
        <select value={cfg.condition||''} onChange={e => set('condition', e.target.value)}
          style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }}>
          <option value="">— Select condition —</option>
          <option value="known_contact">Caller is a known contact</option>
          <option value="has_agent">Contact has assigned agent</option>
          <option value="business_hours">During business hours</option>
          <option value="after_hours">After hours</option>
        </select>
      </>}

      {node.type === 'voicemail' && <>
        <Lbl c="Greeting before recording" />
        <textarea value={cfg.text||''} onChange={e => set('text', e.target.value)}
          placeholder="Please leave your name and number and we will call you back..."
          rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }} />
        <Lbl c="Max duration (seconds)" />
        <Inp k="max_length" placeholder="120" type="number" />
      </>}

      {node.type === 'sms' && <>
        <Lbl c="SMS Message" />
        <textarea value={cfg.text||''} onChange={e => set('text', e.target.value)}
          placeholder="Thanks for calling Target Team! An agent will call you back shortly."
          rows={3} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:10 }} />
      </>}

      {node.type === 'create_lead' && <>
        <Lbl c="Lead source tag" />
        <Inp k="source" placeholder="Inbound Call" />
        <Lbl c="Assign to agent" />
        <select value={cfg.agent_id||''} onChange={e => set('agent_id', e.target.value)}
          style={{ width:'100%', padding:'7px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, marginBottom:10 }}>
          <option value="">— Round robin —</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </>}

      <Btn onClick={() => { onChange(node.id, cfg); onClose() }}>✅ Apply</Btn>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN FLOW BUILDER
// ════════════════════════════════════════════════════════════════
export function CallFlow() {
  const { isAdmin } = useAuth()
  const { toast }   = useApp()
  const { agents }  = useAgents()

  const [nodes,      setNodes]      = useState([{ id:'start', type:'incoming', x:60, y:200, config:{} }])
  const [edges,      setEdges]      = useState([])
  const [selected,   setSelected]   = useState(null)
  const [connecting, setConnecting] = useState(null) // source node id
  const [flowName,   setFlowName]   = useState('Main Call Flow')
  const [flows,      setFlows]      = useState([])
  const [activeFlow, setActiveFlow] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const svgRef = useRef(null)
  const nextId = useRef(100)

  useEffect(() => { loadFlows() }, [])

  async function loadFlows() {
    const { data } = await supabase.from('phone_ivr').select('*').order('created_at')
    setFlows(data || [])
    // Load last saved flow into canvas
    const saved = data?.find(f => f.flow_nodes)
    if (saved?.flow_nodes) {
      setNodes(saved.flow_nodes)
      setEdges(saved.flow_edges || [])
      setFlowName(saved.name)
      setActiveFlow(saved.id)
    }
  }

  async function saveFlow() {
    setSaving(true)
    try {
      const payload = { name: flowName, flow_nodes: nodes, flow_edges: edges, updated_at: new Date().toISOString() }
      if (activeFlow) {
        await supabase.from('phone_ivr').update(payload).eq('id', activeFlow)
      } else {
        const { data } = await supabase.from('phone_ivr').insert({ ...payload, is_active: false, menu_options: [], created_at: new Date().toISOString() }).select().single()
        setActiveFlow(data.id)
      }
      toast('✅ Flow saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  function addNode(type) {
    const id = 'node_' + (++nextId.current)
    setNodes(prev => [...prev, { id, type, x: 300 + Math.random()*100, y: 100 + Math.random()*200, config:{} }])
  }

  function moveNode(id, x, y) {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: Math.max(0,x), y: Math.max(0,y) } : n))
  }

  function deleteNode(id) {
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id))
    if (selected === id) setSelected(null)
  }

  function updateNodeConfig(id, cfg) {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, config: cfg } : n))
  }

  function startConnect(fromId) {
    setConnecting(fromId)
  }

  function handleSvgMouseUp(e) {
    if (!connecting) return
    // Find which node was clicked
    const target = e.target.closest('[data-nodeid]')
    if (target) {
      const toId = target.dataset.nodeid
      if (toId !== connecting && !edges.find(e => e.from === connecting && e.to === toId)) {
        setEdges(prev => [...prev, { id: `e_${connecting}_${toId}`, from: connecting, to: toId }])
      }
    }
    setConnecting(null)
  }

  const selectedNode = nodes.find(n => n.id === selected)

  // Build edge paths
  function edgePath(edge) {
    const from = nodes.find(n => n.id === edge.from)
    const to   = nodes.find(n => n.id === edge.to)
    if (!from || !to) return ''
    const x1 = from.x + NODE_W, y1 = from.y + NODE_H/2
    const x2 = to.x,            y2 = to.y + NODE_H/2
    const cx  = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
  }

  return (
    <div style={{ fontFamily:ff, height:'calc(100vh - 48px)', display:'flex', flexDirection:'column' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap' }}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>📞 Call Flow Builder</div>
        <input value={flowName} onChange={e => setFlowName(e.target.value)}
          style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, width:200 }} />
        <div style={{ flex:1 }} />
        <button onClick={() => { setNodes([{ id:'start', type:'incoming', x:60, y:200, config:{} }]); setEdges([]); setSelected(null) }}
          style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
          🗑 Clear
        </button>
        <Btn onClick={saveFlow} loading={saving}>💾 Save Flow</Btn>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Node palette */}
        <div style={{ width:160, borderRight:'1px solid var(--border)', background:'var(--dim)', padding:'12px 8px', overflowY:'auto', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8, paddingLeft:4 }}>Drag to add</div>
          {NODE_TYPES.filter(t => t.type !== 'incoming').map(t => (
            <div key={t.type}
              onClick={() => addNode(t.type)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 10px', borderRadius:8, cursor:'pointer', marginBottom:4, border:'1px solid var(--border)', background:'var(--panel)', transition:'all .1s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = t.color + '10' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--panel)' }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--text)', lineHeight:1.2 }}>{t.label}</span>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:'var(--dim)' }}>
          {/* Grid background */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--border)" strokeWidth=".5" opacity=".5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Flow SVG */}
          <svg ref={svgRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', overflow:'visible' }}
            onClick={() => { setSelected(null); if (connecting) setConnecting(null) }}
            onMouseUp={handleSvgMouseUp}>
            {/* Edges */}
            {edges.map(edge => (
              <g key={edge.id}>
                <path d={edgePath(edge)} fill="none" stroke="#CC2200" strokeWidth={2.5} markerEnd="url(#arrow)" opacity={0.7} />
                <path d={edgePath(edge)} fill="none" stroke="transparent" strokeWidth={12}
                  style={{ cursor:'pointer' }}
                  onClick={e => { e.stopPropagation(); setEdges(prev => prev.filter(x => x.id !== edge.id)) }} />
              </g>
            ))}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="#CC2200" />
              </marker>
            </defs>
            {/* Nodes */}
            {nodes.map(node => (
              <g key={node.id} data-nodeid={node.id}>
                <FlowNode
                  node={node}
                  selected={selected === node.id}
                  agents={agents}
                  onSelect={setSelected}
                  onMove={moveNode}
                  onDelete={deleteNode}
                  onStartConnect={startConnect}
                />
              </g>
            ))}
          </svg>

          {/* Connecting indicator */}
          {connecting && (
            <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', padding:'6px 14px', borderRadius:20, background:'#CC2200', color:'#fff', fontSize:12, fontWeight:700, pointerEvents:'none', zIndex:10 }}>
              Click another node to connect →
            </div>
          )}
        </div>

        {/* Config panel */}
        {selectedNode && (
          <div style={{ position:'relative', flexShrink:0, width:280 }}>
            <NodeConfig
              node={selectedNode}
              agents={agents}
              onChange={updateNodeConfig}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
