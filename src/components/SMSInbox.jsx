// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Two-Way SMS Inbox
// Thread view of SMS conversations per contact.
// Uses Twilio webhooks to receive incoming messages.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function SMSThread({ contactId, contactPhone, contactName }) {
  const { agent } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [text,     setText]     = useState('')
  const [sending,  setSending]  = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { if (contactId) load() }, [contactId])

  // Real-time subscription for new incoming messages
  useEffect(() => {
    if (!contactId) return
    const ch = supabase.channel('sms_' + contactId)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'sms_messages', filter:'contact_id=eq.'+contactId },
        payload => setMessages(p => [...p, payload.new]))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [contactId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('sms_messages')
        .select('*').eq('contact_id', contactId)
        .order('created_at', { ascending: true }).limit(100)
      setMessages(data || [])
    } catch(e) { console.warn('sms load:', e.message) }
    finally { setLoading(false) }
  }

  async function send() {
    if (!text.trim() || sending) return
    const body = text.trim()
    setText('')
    setSending(true)
    try {
      // Optimistic insert
      const optimistic = { id:'opt_'+Date.now(), direction:'outbound', body, contact_id:contactId, agent_id:agent?.id, created_at:new Date().toISOString(), status:'sending' }
      setMessages(p => [...p, optimistic])

      const { data: { session } } = await supabase.auth.getSession()
      const res  = await fetch('/api/send-sms', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({ to: contactPhone, body, contactId, agentId: agent?.id })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Replace optimistic with real
      setMessages(p => p.map(m => m.id === optimistic.id ? { ...m, status:'sent', id: data.sid } : m))
    } catch(e) {
      setMessages(p => p.map(m => m.id?.startsWith('opt_') ? { ...m, status:'failed' } : m))
    } finally { setSending(false) }
  }

  if (loading) return <div style={{ padding:20, color:'var(--muted)', fontSize:12, textAlign:'center', fontFamily:ff }}>Loading messages...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', fontFamily:ff }}>
      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--muted)', fontSize:12, padding:24 }}>
            No messages yet. Send the first one below.
          </div>
        )}
        {messages.map(msg => {
          const out = msg.direction === 'outbound'
          return (
            <div key={msg.id} style={{ display:'flex', justifyContent: out ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'75%', padding:'9px 13px', borderRadius: out ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: out ? 'var(--brand)' : 'var(--dim)', color: out ? '#fff' : 'var(--text)',
                fontSize:13, lineHeight:1.5,
                opacity: msg.status === 'sending' ? .65 : 1,
                border: '1px solid '+(out ? 'transparent' : 'var(--border)'),
              }}>
                <div>{msg.body}</div>
                <div style={{ fontSize:9, opacity:.6, marginTop:3, textAlign: out ? 'right' : 'left' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                  {msg.status === 'failed' && ' ❌'}
                  {msg.status === 'sending' && ' ⏳'}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8, alignItems:'flex-end' }}>
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Type a message... (Enter to send)"
          rows={1}
          style={{ flex:1, padding:'8px 12px', borderRadius:20, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'none', maxHeight:120, outline:'none', overflowY:'auto' }}
        />
        <button onClick={send} disabled={!text.trim() || sending}
          style={{ padding:'9px 16px', borderRadius:20, border:'none', background: text.trim() ? 'var(--brand)' : 'var(--border)', color:'#fff', fontSize:13, fontWeight:700, cursor: text.trim() ? 'pointer' : 'default', fontFamily:ff, flexShrink:0 }}>
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

// ── FULL INBOX (all conversations) ───────────────────────────────
export function SMSInbox() {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [active,  setActive]  = useState(null)

  useEffect(() => { loadThreads() }, [])

  async function loadThreads() {
    setLoading(true)
    try {
      // Get latest message per contact
      const { data } = await supabase.from('sms_messages')
        .select('*, contacts(id,first_name,last_name,phone)')
        .order('created_at', { ascending:false })
        .limit(200)

      // Group by contact
      const byContact = {}
      ;(data||[]).forEach(msg => {
        if (!msg.contact_id) return
        if (!byContact[msg.contact_id]) byContact[msg.contact_id] = { contact: msg.contacts, messages: [], unread: 0 }
        byContact[msg.contact_id].messages.push(msg)
        if (msg.direction === 'inbound' && !msg.read_at) byContact[msg.contact_id].unread++
      })
      setThreads(Object.values(byContact).sort((a,b) => new Date(b.messages[0]?.created_at) - new Date(a.messages[0]?.created_at)))
    } catch(e) { console.warn('inbox:', e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display:'flex', height:'100%', fontFamily:ff }}>
      {/* Thread list */}
      <div style={{ width:280, borderRight:'1px solid var(--border)', overflowY:'auto', flexShrink:0 }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:800, color:'var(--text)' }}>
          💬 SMS Inbox
        </div>
        {loading && <div style={{ padding:20, fontSize:12, color:'var(--muted)', textAlign:'center' }}>Loading...</div>}
        {!loading && threads.length === 0 && (
          <div style={{ padding:20, fontSize:12, color:'var(--muted)', textAlign:'center' }}>
            No SMS conversations yet.<br/>Send a message to a contact to start.
          </div>
        )}
        {threads.map(t => {
          const c = t.contact
          const last = t.messages[0]
          const name = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : (last?.from_number || 'Unknown')
          const isActive = active?.contact?.id === c?.id
          return (
            <button key={c?.id||last?.id} onClick={() => setActive(t)}
              style={{ display:'block', width:'100%', padding:'12px 14px', background: isActive ? 'var(--dim)' : 'transparent', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', textAlign:'left', fontFamily:ff }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight: t.unread > 0 ? 800 : 600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                  {name}
                </div>
                {t.unread > 0 && (
                  <div style={{ width:18, height:18, borderRadius:'50%', background:'var(--brand)', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{t.unread}</div>
                )}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {last?.direction==='outbound' ? '→ ' : ''}{last?.body || ''}
              </div>
              <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>
                {last?.created_at ? new Date(last.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* Active thread */}
      <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
        {active ? (
          <>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, color:'var(--text)' }}>
              {active.contact ? [active.contact.first_name, active.contact.last_name].filter(Boolean).join(' ') : 'Unknown'}
              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:8 }}>{active.contact?.phone}</span>
            </div>
            <SMSThread contactId={active.contact?.id} contactPhone={active.contact?.phone} contactName={active.contact?.first_name} />
          </>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', flex:1, color:'var(--muted)', fontSize:13 }}>
            Select a conversation
          </div>
        )}
      </div>
    </div>
  )
}
