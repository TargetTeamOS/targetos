// TargetOS V2 — Click to Call
// Shows in-app call panel immediately on click.
// Uses Twilio REST API to initiate the call.
// The call goes: Twilio dials the agent's registered phone number,
// agent picks up, Twilio bridges them to the contact.
// For true browser audio, the Twilio Device SDK initializes in background.
import React, { useState, useEffect, useRef } from 'react'
import { useAuth }   from '../context/AuthContext'
import { useApp }    from '../context/AppContext'
import { supabase }  from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── GLOBAL STATE ──────────────────────────────────────────────────
const G = {
  active: false, status: 'idle',
  name: '', phone: '', contactId: null, callLogId: null,
  callSid: null, startTime: null, muted: false, mode: 'pending',
  listeners: new Set(),
  set(p) { Object.assign(G, p); G.listeners.forEach(f => f()) }
}
function useSoftphone() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n=>n+1); G.listeners.add(f); return ()=>G.listeners.delete(f) }, [])
  return G
}

// ── CALL BUTTON ───────────────────────────────────────────────────
export function ClickToCall({ phone, contactName, contactId, size='sm', showLabel=false }) {
  const { agent } = useAuth()
  const { toast }  = useApp()
  const [busy, setBusy] = useState(false)

  if (!phone) return null

  const clean = phone.replace(/\D/g,'')
  const e164  = '+1' + (clean.startsWith('1') ? clean.slice(1) : clean)

  async function handleClick(e) {
    // Critical: prevent ANY default browser behavior
    e.preventDefault()
    e.stopPropagation()

    if (busy || G.active) { toast('Already on a call', '#F5A623'); return }

    setBusy(true)

    // Show panel immediately — before any async work
    G.set({ active: true, status: 'calling', name: contactName || e164, phone: e164, contactId: contactId || null, callLogId: null, callSid: null, startTime: null, muted: false })

    try {
      // Log call
      const { data: log } = await supabase.from('calls').insert({
        from_number: '+18453271778', to_number: e164,
        contact_name: contactName||null, contact_id: contactId||null,
        direction: 'Outbound', status: 'initiated',
        agent_id: agent?.id||null, called_at: new Date().toISOString(),
      }).select().single()

      G.set({ callLogId: log?.id || null })

      // Hit Twilio REST
      const res = await fetch('/api/twilio-outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: e164, contactName, callLogId: log?.id, agentId: agent?.id }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Call API returned ' + res.status)

      G.set({ callSid: data.callSid, status: 'ringing', startTime: Date.now(), mode: data.mode || 'direct' })
      if (data.mode==='bridge') {
        toast('📱 Your phone will ring now — pick up to connect to ' + (contactName||e164))
      } else if (data.warning) {
        toast('⚠️ ' + data.warning, '#F5A623')
      } else {
        toast('📞 Calling ' + (contactName||e164) + '...')
      }

    } catch(err) {
      G.set({ status: 'error', active: false })
      toast('Call failed: ' + err.message, '#DC2626')
    }

    setBusy(false)
  }

  const sz = size==='lg'
    ? { padding:'9px 20px', fontSize:14, gap:8, borderRadius:10 }
    : { padding:'5px 12px', fontSize:12, gap:5, borderRadius:20 }

  const isActive = G.active && G.phone === e164

  return (
    <button
      type="button"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
      onClick={handleClick}
      disabled={busy}
      style={{
        display:'inline-flex', alignItems:'center', gap:sz.gap,
        padding:sz.padding, borderRadius:sz.borderRadius,
        border:'none', cursor: busy ? 'wait' : 'pointer',
        background: isActive ? '#059669' : '#10B981',
        color:'#fff', fontSize:sz.fontSize, fontWeight:700,
        fontFamily:ff, WebkitTapHighlightColor:'transparent',
        outline:'none', userSelect:'none',
      }}>
      {busy ? '⏳' : '📞'}
      {showLabel && <span>{busy ? 'Starting...' : contactName || e164}</span>}
    </button>
  )
}

// ── SOFTPHONE PANEL ───────────────────────────────────────────────
export function ActiveCallBar() {
  const g     = useSoftphone()
  const { agent } = useAuth()
  const { toast }  = useApp()
  const [elapsed, setElapsed] = useState(0)
  const [showKeypad, setShowKp] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    clearInterval(timer.current)
    if (g.status === 'ringing' || g.status === 'connected') {
      timer.current = setInterval(() => {
        if (g.startTime) setElapsed(Math.floor((Date.now()-g.startTime)/1000))
      }, 1000)
    } else setElapsed(0)
    return () => clearInterval(timer.current)
  }, [g.status, g.startTime])

  if (!g.active) return null

  function fmt(s) {
    return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')
  }

  async function hangup() {
    // Cancel Twilio call
    if (g.callSid) {
      fetch('/api/twilio-outbound', {
        method:'DELETE',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({callSid:g.callSid}),
      }).catch(()=>{})
    }
    // Update DB
    if (g.callLogId) {
      await supabase.from('calls').update({
        status:'completed', outcome:'Ended by agent',
        duration_sec:elapsed, updated_at:new Date().toISOString(),
      }).eq('id',g.callLogId)
      if (g.contactId) {
        await supabase.from('activity_log').insert({
          table_name:'contacts', record_id:g.contactId,
          action:'call_outbound', agent_id:agent?.id||null,
          metadata:JSON.stringify({direction:'Outbound',duration_sec:elapsed,call_id:g.callLogId}),
          created_at:new Date().toISOString(),
        }).catch(()=>{})
      }
    }
    G.set({ active:false, status:'idle', callSid:null, callLogId:null, startTime:null })
    setElapsed(0); setShowKp(false)
    if (elapsed>0) toast('📞 Call ended — '+fmt(elapsed)+' · Recorded')
  }

  const dot = g.status==='ringing' ? '#F5A623' : g.status==='connected' ? '#10B981' : '#94A3B8'
  const label = g.status==='calling' ? 'Connecting...' : g.status==='ringing' ? 'Ringing...' : g.status==='connected' ? 'Connected' : 'Call ended'

  return (
    <div style={{
      position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
      zIndex:99999, fontFamily:ff, background:'#111827',
      borderRadius:20, boxShadow:'0 20px 60px rgba(0,0,0,.7)',
      minWidth:300, maxWidth:380, overflow:'hidden',
      border:'1px solid rgba(255,255,255,.08)',
    }}>
      {/* Main row */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 18px' }}>
        <div style={{ position:'relative', width:14, height:14, flexShrink:0 }}>
          <div style={{ width:14,height:14,borderRadius:'50%',background:dot,transition:'background .3s' }}/>
          <div style={{ position:'absolute',inset:-6,borderRadius:'50%',background:dot,opacity:.2,
            animation: g.status==='ringing'||g.status==='calling' ? 'ctcPulse 1.5s ease-in-out infinite' : 'none' }}/>
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:15,fontWeight:800,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
            {g.name}
          </div>
          <div style={{ fontSize:11,color:'rgba(255,255,255,.45)',marginTop:2 }}>{label}</div>
        </div>
        {elapsed>0 && (
          <div style={{ fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#10B981',flexShrink:0 }}>
            {fmt(elapsed)}
          </div>
        )}
      </div>

      {/* Status info */}
      {(g.status==='calling'||g.status==='ringing') && (
        <div style={{ padding:'0 18px 12px',fontSize:11,lineHeight:1.7 }}>
          {g.mode==='bridge'
            ? <span style={{color:'#4ADE80'}}>📱 Your phone is ringing — pick up to be connected to {g.name}</span>
            : g.mode==='no_phone'
              ? <span style={{color:'#FCD34D'}}>⚠️ Add your phone number in <strong>Settings → Profile</strong> to enable bridge calling</span>
              : <span style={{color:'rgba(255,255,255,.4)'}}>Connecting to {g.name}...</span>
          }
        </div>
      )}

      {/* Controls */}
      <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,.07)' }}>
        <button onClick={() => setShowKp(k=>!k)}
          style={{ flex:1,padding:'13px 0',background:showKeypad?'rgba(255,255,255,.08)':'none',
            border:'none',color:'rgba(255,255,255,.5)',fontSize:18,cursor:'pointer',
            borderRight:'1px solid rgba(255,255,255,.07)' }}>
          ⌨️
        </button>
        <button onClick={() => { G.set({muted:!g.muted}); toast(g.muted?'Unmuted':'Muted') }}
          style={{ flex:1,padding:'13px 0',background:g.muted?'rgba(239,68,68,.2)':'none',
            border:'none',color:g.muted?'#f87171':'rgba(255,255,255,.5)',fontSize:18,cursor:'pointer',
            borderRight:'1px solid rgba(255,255,255,.07)' }}>
          {g.muted ? '🔇' : '🎤'}
        </button>
        <button onClick={hangup}
          style={{ flex:2,padding:'13px 0',background:'#DC2626',border:'none',
            color:'#fff',fontSize:13,fontWeight:800,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
          🔴 End Call
        </button>
      </div>

      {/* Keypad */}
      {showKeypad && (
        <div style={{ padding:'12px 16px 14px',borderTop:'1px solid rgba(255,255,255,.07)',background:'rgba(0,0,0,.3)' }}>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d=>(
              <button key={d} onClick={() => toast('Key: '+d)}
                style={{ padding:'12px 0',borderRadius:10,background:'rgba(255,255,255,.08)',
                  border:'1px solid rgba(255,255,255,.1)',color:'#fff',fontSize:18,
                  fontWeight:700,cursor:'pointer',fontFamily:ff }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.16)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.08)'}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ctcPulse {
          0%,100%{transform:scale(1);opacity:.2}
          50%{transform:scale(1.8);opacity:.05}
        }
      `}</style>
    </div>
  )
}
