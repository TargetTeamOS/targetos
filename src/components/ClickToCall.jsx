// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Click to Call + Softphone Panel
// - Initiates outbound calls via Twilio
// - Twilio calls agent's phone first, then bridges to contact
// - All calls recorded, logged to contact timeline
// - Floating call panel shows active call status + controls
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp  } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── GLOBAL CALL STATE ─────────────────────────────────────────────
// Shared across all ClickToCall instances so only one call runs at a time
const callState = {
  active:      false,
  contactName: '',
  contactPhone:'',
  contactId:   null,
  callSid:     null,
  callLogId:   null,
  startTime:   null,
  status:      'idle', // idle | ringing | connected | ended
  listeners:   new Set(),
}

function notifyListeners() {
  callState.listeners.forEach(fn => fn({ ...callState }))
}

function useCallState() {
  const [state, setState] = useState({ ...callState })
  useEffect(() => {
    const fn = s => setState(s)
    callState.listeners.add(fn)
    return () => callState.listeners.delete(fn)
  }, [])
  return state
}

// ── CLICK TO CALL BUTTON ─────────────────────────────────────────
export function ClickToCall({ phone, contactName, contactId, dealId, size = 'sm', showLabel = false }) {
  const { agent } = useAuth()
  const { toast  } = useApp()
  const [calling, setCalling] = useState(false)
  const cs = useCallState()

  if (!phone) return null

  const clean = phone.replace(/\D/g, '')
  const e164  = clean.startsWith('1') ? '+' + clean : '+1' + clean

  async function initiateCall() {
    if (calling || cs.active) {
      toast('A call is already in progress', '#F5A623')
      return
    }
    setCalling(true)

    try {
      // 1. Log call to DB immediately
      const { data: callLog } = await supabase.from('calls').insert({
        from_number:  '+18453271778',
        to_number:    e164,
        contact_name: contactName || null,
        contact_id:   contactId   || null,
        direction:    'Outbound',
        status:       'initiated',
        agent_id:     agent?.id || null,
        called_at:    new Date().toISOString(),
      }).select().single()

      // 2. Update global call state
      callState.active       = true
      callState.contactName  = contactName || e164
      callState.contactPhone = e164
      callState.contactId    = contactId || null
      callState.callLogId    = callLog?.id || null
      callState.startTime    = Date.now()
      callState.status       = 'ringing'
      callState.callSid      = null
      notifyListeners()

      // 3. Hit Twilio API
      const res = await fetch('/api/twilio-outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:          e164,
          contactName: contactName,
          callLogId:   callLog?.id,
          agentId:     agent?.id,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        callState.callSid = data.callSid
        callState.status  = 'ringing'
        notifyListeners()

        // Update DB with Twilio SID
        if (data.callSid && callLog?.id) {
          await supabase.from('calls').update({
            twilio_call_sid: data.callSid,
            status: 'in-progress',
          }).eq('id', callLog.id)
        }

        toast('📞 Calling ' + (contactName || e164) + ' — your phone will ring first, then bridge to contact')
      } else {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Call failed (status ' + res.status + ')')
      }
    } catch(e) {
      // Reset call state
      callState.active = false
      callState.status = 'idle'
      notifyListeners()
      toast('Call failed: ' + e.message + '. Check TWILIO_ACCOUNT_SID is set in Vercel env vars.', '#DC2626')
    } finally {
      setCalling(false)
    }
  }

  const isThisCallActive = cs.active && cs.contactPhone === e164
  const btnSize = size === 'lg'
    ? { padding:'9px 18px', fontSize:13, gap:7 }
    : { padding:'4px 10px', fontSize:11, gap:4 }

  return (
    <button
      onClick={initiateCall}
      title={'Call ' + (contactName || e164)}
      disabled={calling}
      style={{
        display:'inline-flex', alignItems:'center', gap:btnSize.gap,
        padding:btnSize.padding, borderRadius:20, border:'none',
        background: isThisCallActive ? '#10B981' : cs.active ? '#94A3B8' : '#10B981',
        color:'#fff', fontSize:btnSize.fontSize, fontWeight:700,
        cursor: calling || (cs.active && !isThisCallActive) ? 'not-allowed' : 'pointer',
        fontFamily:ff, transition:'all .15s',
        opacity: calling ? 0.7 : 1,
      }}>
      {calling ? '⏳' : isThisCallActive ? '📞' : '📞'}
      {showLabel && (
        <span>{calling ? 'Calling...' : contactName || e164}</span>
      )}
    </button>
  )
}

// ── ACTIVE CALL PANEL ─────────────────────────────────────────────
// Floating panel — shown when a call is active
export function ActiveCallBar() {
  const cs = useCallState()
  const { agent } = useAuth()
  const { toast  } = useApp()
  const [elapsed,   setElapsed]   = useState(0)
  const [muted,     setMuted]     = useState(false)
  const [showKeypad,setShowKeypad]= useState(false)
  const [ending,    setEnding]    = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (cs.active && cs.startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - cs.startTime) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
      setElapsed(0)
    }
    return () => clearInterval(timerRef.current)
  }, [cs.active, cs.startTime])

  if (!cs.active) return null

  function fmt(s) {
    const m = Math.floor(s / 60), ss = s % 60
    return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0')
  }

  async function endCall() {
    if (ending) return
    setEnding(true)
    try {
      if (cs.callSid) {
        await fetch('/api/twilio-outbound', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callSid: cs.callSid }),
        })
      }
      if (cs.callLogId) {
        await supabase.from('calls').update({
          status:       'completed',
          outcome:      'Connected',
          duration_sec: elapsed,
          updated_at:   new Date().toISOString(),
        }).eq('id', cs.callLogId)
        // Add to contact timeline
        if (cs.contactId) {
          await supabase.from('activity_log').insert({
            table_name: 'contacts',
            record_id:  cs.contactId,
            action:     'call_outbound',
            agent_id:   agent?.id || null,
            metadata:   JSON.stringify({
              direction:    'Outbound',
              duration_sec: elapsed,
              call_id:      cs.callLogId,
            }),
            created_at: new Date().toISOString(),
          })
        }
      }
    } catch(e) { console.warn('endCall:', e.message) }

    callState.active    = false
    callState.status    = 'ended'
    callState.callSid   = null
    callState.callLogId = null
    notifyListeners()

    toast('📞 Call ended — ' + fmt(elapsed) + ' · Recorded')
    setEnding(false)
    setMuted(false)
    setShowKeypad(false)
  }

  const statusColor = cs.status === 'connected' ? '#10B981' : '#F5A623'

  return (
    <div style={{
      position:'fixed', bottom:16, left:'50%', transform:'translateX(-50%)',
      zIndex:9999, fontFamily:ff,
      background:'#1B2B4B', borderRadius:16,
      boxShadow:'0 8px 40px rgba(0,0,0,.45)',
      minWidth:340, maxWidth:400,
      overflow:'hidden',
    }}>
      {/* Main bar */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px' }}>
        {/* Pulse dot */}
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:statusColor }} />
          <div style={{ position:'absolute', inset:-4, borderRadius:'50%', background:statusColor, opacity:.3, animation:'ping 1.2s infinite' }} />
        </div>

        {/* Contact info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {cs.contactName}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:1 }}>
            {cs.status === 'ringing' ? '🔔 Ringing your phone...' : cs.status === 'connected' ? '🎙 Connected' : 'Calling...'}
            {elapsed > 0 && cs.status !== 'ringing' && <span style={{ marginLeft:8, fontFamily:'monospace' }}>{fmt(elapsed)}</span>}
          </div>
        </div>

        {/* Timer */}
        {elapsed > 0 && (
          <div style={{ fontFamily:'monospace', fontSize:15, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {fmt(elapsed)}
          </div>
        )}
      </div>

      {/* How it works hint */}
      {cs.status === 'ringing' && (
        <div style={{ padding:'6px 16px 10px', fontSize:11, color:'rgba(255,255,255,.4)', lineHeight:1.5 }}>
          Your phone (or browser) will ring first. Pick up — then you'll be connected to {cs.contactName}.
        </div>
      )}

      {/* Controls */}
      <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,.08)', background:'rgba(0,0,0,.2)' }}>
        {/* Keypad */}
        <button onClick={() => setShowKeypad(k=>!k)}
          style={{ flex:1, padding:'10px 0', background:'none', border:'none', color: showKeypad ? '#fff' : 'rgba(255,255,255,.5)', fontSize:18, cursor:'pointer', borderRight:'1px solid rgba(255,255,255,.08)' }}
          title="Keypad">
          🔢
        </button>

        {/* Mute */}
        <button onClick={() => setMuted(m=>!m)}
          style={{ flex:1, padding:'10px 0', background: muted ? 'rgba(220,38,38,.3)' : 'none', border:'none', color: muted ? '#F87171' : 'rgba(255,255,255,.5)', fontSize:18, cursor:'pointer', borderRight:'1px solid rgba(255,255,255,.08)' }}
          title={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🎤'}
        </button>

        {/* End Call */}
        <button onClick={endCall} disabled={ending}
          style={{ flex:2, padding:'10px 0', background:'#DC2626', border:'none', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          {ending ? '⏳' : '🔴'} {ending ? 'Ending...' : 'End Call'}
        </button>
      </div>

      {/* Keypad */}
      {showKeypad && (
        <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,.08)', background:'rgba(0,0,0,.15)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
              <button key={k}
                style={{ padding:'10px', borderRadius:8, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)', color:'#fff', fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:ff }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.2)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
