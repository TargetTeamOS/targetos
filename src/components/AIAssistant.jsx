// TargetOS V2 — AI Assistant
// Floating button + chat panel powered by Claude Sonnet
// Has full CRM context: knows the team, can answer questions about deals, contacts, etc.

import React, { useState, useRef, useEffect } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useAgents } from '../lib/hooks'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const STARTERS = [
  'How many active listings do we have?',
  'What deals are closing this month?',
  'Who are the top performing agents this year?',
  'How do I set up the IVR phone menu?',
  'Show me how to add a showing to a listing',
  'What is the best way to follow up with a hot lead?',
]

function MsgBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
    }}>
      {!isUser && (
        <div style={{width:28,height:28,borderRadius:'50%',background:'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0,marginRight:8,marginTop:2}}>
          🤖
        </div>
      )}
      <div style={{
        maxWidth: '82%',
        padding: '9px 13px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? '#CC2200' : 'var(--panel)',
        color: isUser ? '#fff' : 'var(--text)',
        border: isUser ? 'none' : '1px solid var(--border)',
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: ff,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

export function AIAssistant() {
  const { agent } = useAuth()
  const { agents } = useAgents()
  const [open,     setOpen]     = useState(false)
  const [input,    setInput]    = useState('')
  const [messages, setMessages] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [context,  setContext]  = useState(null)
  const [pos,      setPos]      = useState({ x: 84, y: null }) // null y = bottom-anchored, offset from mic
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const endRef  = useRef(null)
  const inputRef = useRef(null)
  const btnRef  = useRef(null)

  function onDragStart(e) {
    e.preventDefault()
    const rect = btnRef.current?.getBoundingClientRect()
    dragStart.current = {
      mx: e.clientX, my: e.clientY,
      bx: pos.x,     by: pos.y ?? (window.innerHeight - 76),
    }
    setDragging(true)
  }

  React.useEffect(() => {
    if (!dragging) return
    function onMove(e) {
      const dx = e.clientX - dragStart.current.mx
      const dy = e.clientY - dragStart.current.my
      const nx = Math.max(12, Math.min(window.innerWidth  - 64, dragStart.current.bx + dx))
      const ny = Math.max(12, Math.min(window.innerHeight - 64, dragStart.current.by + dy))
      setPos({ x: nx, y: ny })
    }
    function onUp() { setDragging(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Hi ' + (agent?.name?.split(' ')[0] || 'there') + '! I\'m your TargetOS AI assistant. I can help you with CRM questions, data lookups, how-tos, and more. What can I help you with?'
      }])
      loadContext()
    }
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function loadContext() {
    try {
      const [dealsRes, contactsRes, listingsRes] = await Promise.all([
        supabase.from('deals').select('id,addr,stage,agent_id,production,close_date').order('created_at',{ascending:false}).limit(20),
        supabase.from('contacts').select('id,first_name,last_name,status,agent_id').order('created_at',{ascending:false}).limit(20),
        supabase.from('listings').select('id,addr,status,list_price,beds,baths').eq('status','Active').limit(15),
      ])
      setContext({
        agents: (agents||[]).map(a => ({ name:a.name, role:a.role, color:a.color })),
        recentDeals: (dealsRes.data||[]).slice(0,10),
        recentContacts: (contactsRes.data||[]).slice(0,10),
        activeListings: listingsRes.data||[],
        totalDeals: dealsRes.data?.length,
        totalContacts: contactsRes.data?.length,
      })
    } catch(e) { console.warn('AI context load failed:', e.message) }
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg = { role:'user', content:text }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setLoading(true)

    try {
      const systemPrompt = `You are an AI assistant built into TargetOS V2, a real estate CRM for Target Team at KW Valley Realty in Rockland County, New York.

You help agents, admins, and the secretary with:
- CRM questions (how to use features, where to find things)
- Data analysis (deal counts, listing stats, agent performance)
- Real estate guidance (follow-up strategies, listing tips, client management)
- System how-tos (phone system setup, call flows, automations)

TEAM CONTEXT:
${context ? JSON.stringify({
  agents: context.agents,
  activeListings: context.activeListings?.length + ' active listings',
  recentDealCount: context.totalDeals + ' recent deals loaded',
  recentContactCount: context.totalContacts + ' recent contacts loaded',
}) : 'Loading CRM data...'}

ACTIVE LISTINGS (${context?.activeListings?.length || 0}):
${(context?.activeListings || []).map(l => `- ${l.addr}: $${l.list_price?.toLocaleString()||'?'}, ${l.beds}bd/${l.baths}ba`).join('\n')}

Current user: ${agent?.name || 'Unknown'} (${agent?.role || 'agent'})

Keep responses concise and practical. Use bullet points for lists. Be direct and helpful.`

      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({
          system: systemPrompt,
          max_tokens: 1000,
          messages: newMsgs.map(m => ({ role:m.role, content:m.content })),
        })
      })

      const data = await response.json()
      if (!response.ok || data.error) {
        const errMsg = data.error || 'API error ' + response.status
        // Show helpful message if API key missing
        const friendly = errMsg.includes('ANTHROPIC_API_KEY')
          ? '⚙️ AI not configured yet. Ask your admin to add ANTHROPIC_API_KEY to Vercel environment variables.'
          : '❌ ' + errMsg
        setMessages(prev => [...prev, { role:'assistant', content:friendly }])
        return
      }
      const reply = data.content?.[0]?.text || 'Sorry, I had trouble with that. Please try again.'
      setMessages(prev => [...prev, { role:'assistant', content:reply }])
    } catch(e) {
      setMessages(prev => [...prev, { role:'assistant', content:'❌ Error: ' + e.message }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      {/* Floating button */}
      <button
        ref={btnRef}
        onClick={() => !dragging && setOpen(o => !o)}
        onMouseDown={onDragStart}
        title="AI Assistant — drag to move"
        style={{
          position: 'fixed',
          left:   pos.x,
          top:    pos.y !== null ? pos.y : undefined,
          bottom: pos.y === null ? 24 : undefined,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#CC2200',
          border: '2px solid rgba(255,255,255,.25)',
          cursor: dragging ? 'grabbing' : 'grab',
          fontSize: 20,
          boxShadow: '0 4px 16px rgba(204,34,0,.5)',
          zIndex: 9000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          left:   pos.x,
          top:    pos.y !== null ? pos.y - 440 : undefined,
          bottom: pos.y === null ? 80 : undefined,
          width: 380,
          maxWidth: 'calc(100vw - 40px)',
          height: 520,
          maxHeight: 'calc(100vh - 100px)',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          zIndex: 8999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: ff,
        }}>
          {/* Header */}
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,background:'#CC2200',flexShrink:0}}>
            <div style={{fontSize:18}}>🤖</div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:800,color:'#fff'}}>TargetOS AI</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,.7)'}}>Powered by Claude · Ask me anything</div>
            </div>
            <button onClick={() => { setMessages([]); setOpen(false) }}
              style={{background:'rgba(255,255,255,.15)',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:12,padding:'3px 8px',fontFamily:ff}}>
              Clear
            </button>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:'auto',padding:'14px 14px 8px'}}>
            {messages.map((msg, i) => <MsgBubble key={i} msg={msg} />)}
            {loading && (
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>🤖</div>
                <div style={{padding:'9px 13px',borderRadius:'14px 14px 14px 4px',background:'var(--dim)',border:'1px solid var(--border)'}}>
                  <div style={{display:'flex',gap:4,alignItems:'center'}}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{width:6,height:6,borderRadius:'50%',background:'var(--muted)',animation:'pulse 1.2s infinite',animationDelay:i*0.2+'s'}}/>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.length === 1 && !loading && (
              <div style={{marginTop:8}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Suggestions</div>
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  {STARTERS.slice(0,4).map(s => (
                    <button key={s} onClick={() => { setInput(s); setTimeout(() => send(), 50) }}
                      style={{textAlign:'left',padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:ff}}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',display:'flex',gap:8,flexShrink:0}}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask anything about TargetOS..."
              rows={1}
              style={{
                flex:1, padding:'8px 10px', borderRadius:8,
                border:'1px solid var(--border)', background:'var(--inp)',
                color:'var(--text)', fontSize:12, fontFamily:ff,
                resize:'none', outline:'none', lineHeight:1.4,
              }}
            />
            <button onClick={send} disabled={loading || !input.trim()}
              style={{
                padding:'0 14px', borderRadius:8,
                background: input.trim() ? '#CC2200' : 'var(--dim)',
                border:'none', color:'#fff', fontSize:14,
                cursor: input.trim() ? 'pointer' : 'default',
                flexShrink:0, fontFamily:ff, fontWeight:700,
              }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}
