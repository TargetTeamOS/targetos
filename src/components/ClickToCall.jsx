// TargetOS V2 — Click to Call
// Shows confirmation dialog first, then initiates bridge call via Twilio REST API
import React, { useState, useEffect, useRef } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── GLOBAL CALL STATE ─────────────────────────────────────────────
const G = {
  show: false, active: false, status: 'idle',
  name: '', phone: '', contactId: null, callLogId: null,
  callSid: null, startTime: null, mode: null,
  listeners: new Set(),
  set(p) { Object.assign(G, p); G.listeners.forEach(f => f()) }
}
function useG() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick(n => n + 1)
    G.listeners.add(f)
    return () => G.listeners.delete(f)
  }, [])
  return G
}

// ── BUTTON ────────────────────────────────────────────────────────
export function ClickToCall({ phone, contactName, contactId, size = 'sm', showLabel = false }) {
  const g = useG()

  if (!phone) return null

  const sz = size === 'lg'
    ? { padding: '9px 20px', fontSize: 14, borderRadius: 10 }
    : { padding: '5px 12px', fontSize: 12, borderRadius: 20 }

  function handleClick(e) {
    e.preventDefault()
    e.stopPropagation()
    // Just open the panel — no async, no network, instant
    G.set({
      show: true, active: false, status: 'confirm',
      name: contactName || phone, phone: phone,
      contactId: contactId || null, callLogId: null,
      callSid: null, startTime: null, mode: null,
    })
  }

  return (
    <button
      type="button"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
      onClick={handleClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: sz.padding, borderRadius: sz.borderRadius,
        border: 'none', cursor: 'pointer', fontFamily: ff,
        background: g.active && g.phone === phone ? '#059669' : '#10B981',
        color: '#fff', fontSize: sz.fontSize, fontWeight: 700,
        WebkitTapHighlightColor: 'transparent', outline: 'none',
        userSelect: 'none', touchAction: 'manipulation',
      }}>
      📞
      {showLabel && <span style={{ pointerEvents: 'none' }}>{contactName || phone}</span>}
    </button>
  )
}

// ── CALL PANEL ────────────────────────────────────────────────────
export function ActiveCallBar() {
  const g      = useG()
  const { agent } = useAuth()
  const { toast  } = useApp()
  const [elapsed,  setElapsed]  = useState(0)
  const [keypad,   setKeypad]   = useState(false)
  const [agentPh,  setAgentPh]  = useState('')
  const timer = useRef(null)

  // Load agent phone
  useEffect(() => {
    if (agent?.phone) setAgentPh(agent.phone)
  }, [agent])

  // Timer
  useEffect(() => {
    clearInterval(timer.current)
    if (g.status === 'ringing' && g.startTime) {
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - g.startTime) / 1000)), 1000)
    } else if (g.status !== 'ringing') {
      setElapsed(0)
    }
    return () => clearInterval(timer.current)
  }, [g.status, g.startTime])

  if (!g.show) return null

  function fmt(s) {
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  }

  async function startCall() {
    G.set({ status: 'calling' })
    try {
      // Log to DB
      const { data: log } = await supabase.from('calls').insert({
        from_number:  '+18453271778',
        to_number:    g.phone.replace(/\D/g, '').replace(/^([^+])/, '+1$1'),
        contact_name: g.name || null,
        contact_id:   g.contactId || null,
        direction:    'Outbound',
        status:       'initiated',
        agent_id:     agent?.id || null,
        called_at:    new Date().toISOString(),
      }).select().single()

      G.set({ callLogId: log?.id || null })

      // Call API
      const res = await fetch('/api/twilio-outbound', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:          g.phone,
          contactName: g.name,
          callLogId:   log?.id,
          agentId:     agent?.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'API error ' + res.status)

      G.set({
        active:   true,
        callSid:  data.callSid,
        status:   'ringing',
        startTime:Date.now(),
        mode:     data.mode,
      })

    } catch(err) {
      G.set({ status: 'error_msg', errorText: err.message })
    }
  }

  async function hangup() {
    clearInterval(timer.current)
    if (g.callSid) {
      fetch('/api/twilio-outbound', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ callSid: g.callSid }),
      }).catch(() => {})
    }
    if (g.callLogId) {
      await supabase.from('calls').update({
        status: 'completed', duration_sec: elapsed,
        updated_at: new Date().toISOString(),
      }).eq('id', g.callLogId).catch(() => {})
      if (g.contactId && elapsed > 0) {
        await supabase.from('activity_log').insert({
          table_name: 'contacts', record_id: g.contactId,
          action: 'call_outbound', agent_id: agent?.id || null,
          metadata: JSON.stringify({ duration_sec: elapsed, call_id: g.callLogId }),
          created_at: new Date().toISOString(),
        }).catch(() => {})
      }
    }
    G.set({ show: false, active: false, status: 'idle', callSid: null, callLogId: null, startTime: null })
    setElapsed(0); setKeypad(false)
    if (elapsed > 0) toast('📞 Call ended — ' + fmt(elapsed))
  }

  function dismiss() {
    G.set({ show: false, active: false, status: 'idle' })
    setElapsed(0); setKeypad(false)
  }

  // ── CONFIRM SCREEN ─────────────────────────────────────────────
  if (g.status === 'confirm') return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,.6)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
      padding: 16, fontFamily: ff,
    }} onClick={dismiss}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#111827', borderRadius: 20, width: '100%',
        maxWidth: 420, overflow: 'hidden',
        boxShadow: '0 -8px 40px rgba(0,0,0,.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 14px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📞</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{g.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)' }}>{g.phone}</div>
        </div>

        {/* Agent phone info */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          {agentPh ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.7 }}>
              <span style={{ color: '#4ADE80' }}>✓ Bridge call ready</span><br/>
              Twilio will call <strong style={{ color: '#fff' }}>{agentPh}</strong> first.<br/>
              Pick up → you'll be connected to {g.name}.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#FCD34D', lineHeight: 1.7 }}>
              ⚠️ <strong>Your phone number is not set.</strong><br/>
              Go to <strong style={{ color: '#fff' }}>Settings → Profile → Phone</strong> and save your cell number to enable bridge calling.<br/>
              <span style={{ color: 'rgba(255,255,255,.4)' }}>Without it, the call will be attempted but you won't be able to hear it.</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          <button onClick={dismiss}
            style={{ padding: '16px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)', fontSize: 15, cursor: 'pointer', fontFamily: ff }}>
            Cancel
          </button>
          <button onClick={startCall}
            style={{ padding: '16px', background: '#10B981', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: ff }}>
            📞 Call
          </button>
        </div>
      </div>
    </div>
  )

  // ── CALLING / RINGING SCREEN ───────────────────────────────────
  const statusText = {
    calling:   '⏳ Connecting...',
    ringing:   g.mode === 'bridge' ? '📱 Your phone is ringing — pick up!' : '🔔 Ringing...',
    error_msg: '❌ ' + (g.errorText || 'Error'),
  }[g.status] || ''

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, fontFamily: ff, background: '#111827',
      borderRadius: 20, boxShadow: '0 12px 48px rgba(0,0,0,.7)',
      minWidth: 300, maxWidth: 380, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,.1)',
    }}>
      {/* Status */}
      <div style={{ padding: '18px 20px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: g.status === 'error_msg' ? '#F87171' : '#4ADE80', marginBottom: 6, fontWeight: 700 }}>
          {statusText}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{g.name}</div>
        {elapsed > 0 && (
          <div style={{ fontFamily: 'monospace', fontSize: 22, color: '#10B981', marginTop: 6 }}>{fmt(elapsed)}</div>
        )}
      </div>

      {g.status === 'error_msg' && (
        <div style={{ padding: '0 20px 12px', fontSize: 11, color: '#F87171', textAlign: 'center', lineHeight: 1.6 }}>
          {g.errorText}
          {!agentPh && <><br/><strong style={{ color: '#FCD34D' }}>Fix: Add your phone in Settings → Profile</strong></>}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        {g.status === 'ringing' && (
          <button onClick={() => setKeypad(k => !k)}
            style={{ flex: 1, padding: '14px', background: keypad ? 'rgba(255,255,255,.08)' : 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)', fontSize: 20, cursor: 'pointer' }}>
            ⌨️
          </button>
        )}
        <button onClick={hangup}
          style={{ flex: g.status === 'ringing' ? 2 : 1, padding: '14px', background: '#DC2626', border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          🔴 {g.status === 'calling' ? 'Cancel' : 'End Call'}
        </button>
      </div>

      {/* Keypad */}
      {keypad && g.status === 'ringing' && (
        <div style={{ padding: '12px 16px 14px', borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(0,0,0,.3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
              <button key={d} onClick={() => toast('Key pressed: ' + d)}
                style={{ padding: '12px 0', borderRadius: 10, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
