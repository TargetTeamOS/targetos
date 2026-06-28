// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Click to Call
// Renders a phone button anywhere in the app.
// On click: initiates outbound call via Twilio API + logs it.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// Global active call state
let activeCallId = null

export function ClickToCall({ phone, contactName, contactId, dealId, size = 'sm', showLabel = false }) {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [calling, setCalling] = useState(false)
  const [callActive, setCallActive] = useState(false)

  if (!phone) return null

  const clean = phone.replace(/\D/g, '')
  const e164  = clean.startsWith('1') ? '+' + clean : '+1' + clean

  async function initiateCall() {
    if (calling) return
    setCalling(true)
    try {
      // 1. Log the call immediately
      const { data: callLog } = await supabase.from('calls').insert({
        from_number:  process.env.VITE_TWILIO_PHONE || '+18453271778',
        to_number:    e164,
        contact_name: contactName || null,
        contact_id:   contactId   || null,
        direction:    'Outbound',
        status:       'initiated',
        agent_id:     agent?.id,
        called_at:    new Date().toISOString(),
      }).select().single()

      activeCallId = callLog?.id

      // 2. Call the Twilio outbound API endpoint
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
        toast("📞 Calling " + (contactName || e164) + "...")
        setCallActive(true)

        // Update call log with Twilio SID
        if (data.callSid && callLog?.id) {
          await supabase.from('calls').update({ twilio_call_sid: data.callSid, status: 'in-progress' }).eq('id', callLog.id)
        }
      } else {
        // Fallback: open phone dialer if Twilio not configured
        window.location.href = "tel:" + (e164)
        toast('Opening phone dialer...')
      }
    } catch(e) {
      // Fallback to device phone dialer
      window.location.href = "tel:" + (e164)
      toast('Opening phone dialer')
    } finally {
      setCalling(false)
    }
  }

  const btnSize = size === 'lg'
    ? { padding:'8px 16px', fontSize:13, gap:6 }
    : { padding:'4px 9px', fontSize:11, gap:4 }

  return (
    <a
      href={"tel:" + (e164)}
      onClick={e => { e.preventDefault(); initiateCall() }}
      title={"Call " + (contactName || e164)}
      style={{
        display:'inline-flex', alignItems:'center', gap:btnSize.gap,
        padding:btnSize.padding,
        borderRadius:20,
        background: callActive ? '#10B981' : '#10B98118',
        color: callActive ? '#fff' : '#10B981',
        border:"1px solid " + (callActive ? '#10B981' : '#10B98144'),
        fontSize:btnSize.fontSize, fontWeight:700,
        cursor:'pointer', textDecoration:'none', fontFamily:ff,
        transition:'all .15s',
        opacity: calling ? 0.7 : 1,
      }}
      onMouseEnter={e => { if (!callActive) e.currentTarget.style.background = '#10B981'; e.currentTarget.style.color = '#fff' }}
      onMouseLeave={e => { if (!callActive) { e.currentTarget.style.background = '#10B98118'; e.currentTarget.style.color = '#10B981' } }}>
      {calling ? '⏳' : '📞'}
      {showLabel && <span>{calling ? 'Calling...' : (contactName || e164)}</span>}
    </a>
  )
}

// ── ACTIVE CALL BAR ───────────────────────────────────────────
// Floating bar at the bottom of the screen showing active call
export function ActiveCallBar() {
  const [callInfo, setCallInfo] = useState(null)
  // This would be populated by a real-time Twilio status update
  // For now it's a stub ready to be wired
  if (!callInfo) return null
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, height:52, background:'#1B2B4B', display:'flex', alignItems:'center', gap:12, padding:'0 20px', zIndex:9999, fontFamily:ff }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:'#10B981', animation:'pulse 1s infinite' }} />
      <span style={{ color:'#fff', fontSize:13, fontWeight:700 }}>Active call: {callInfo?.name}</span>
      <span style={{ color:'rgba(255,255,255,.6)', fontSize:12 }}>{callInfo?.duration}</span>
      <div style={{ flex:1 }} />
      <button style={{ padding:'6px 14px', borderRadius:8, background:'#DC2626', border:'none', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
        🔴 End Call
      </button>
    </div>
  )
}
