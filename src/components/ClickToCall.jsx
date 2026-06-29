// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Browser Softphone
// Uses Twilio Browser SDK (twilio.js) for TRUE in-browser calling.
// No phone app, no redirect — calls go directly through the browser.
// All calls recorded + logged to contact timeline.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── GLOBAL DEVICE STATE ───────────────────────────────────────────
const phone = {
  device:    null,
  call:      null,
  ready:     false,
  loading:   false,
  listeners: new Set(),
  state: {
    status:      'idle',   // idle | loading | ready | ringing | connected | error
    contactName: '',
    contactPhone:'',
    contactId:   null,
    callLogId:   null,
    startTime:   null,
    muted:       false,
    error:       null,
  },
  set(patch) {
    Object.assign(this.state, patch)
    this.listeners.forEach(fn => fn({ ...this.state }))
  }
}

function usePhoneState() {
  const [s, setS] = useState({ ...phone.state })
  useEffect(() => {
    const fn = s => setS(s)
    phone.listeners.add(fn)
    return () => phone.listeners.delete(fn)
  }, [])
  return s
}

// Load Twilio JS SDK from CDN (only once)
function loadTwilioSDK() {
  return new Promise((resolve, reject) => {
    if (window.Twilio && window.Twilio.Device) { resolve(window.Twilio.Device); return }
    const script = document.createElement('script')
    script.src = 'https://media.twiliocdn.com/sdk/js/client/v1.14/twilio.min.js'
    script.onload = () => {
      if (window.Twilio && window.Twilio.Device) resolve(window.Twilio.Device)
      else reject(new Error('Twilio SDK did not load'))
    }
    script.onerror = () => reject(new Error('Failed to load Twilio SDK'))
    document.head.appendChild(script)
  })
}

// Initialize the Twilio Device (browser microphone + WebRTC)
async function initDevice(agent, toast) {
  if (phone.loading || phone.ready) return
  phone.loading = true
  phone.set({ status: 'loading', error: null })

  try {
    // 1. Get access token from our server
    const agentName = (agent?.name || 'agent').replace(/[^a-zA-Z0-9_-]/g,'_')
    const res = await fetch('/api/twilio-token?agentId=' + (agent?.id||'') + '&agentName=' + agentName)
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error + (data.hint ? '\n\n' + data.hint : ''))
    }

    // 2. Load Twilio SDK
    const TwilioDevice = await loadTwilioSDK()

    // 3. Set up Device
    const device = new TwilioDevice(data.token, {
      codecPreferences: ['opus', 'pcmu'],
      enableRingingState: true,
      allowIncomingWhileBusy: false,
    })

    device.on('ready', () => {
      phone.ready = true
      phone.device = device
      phone.set({ status: 'ready', error: null })
    })

    device.on('error', err => {
      phone.set({ status: 'error', error: err.message })
      toast('Phone error: ' + err.message, '#DC2626')
    })

    device.on('disconnect', () => {
      phone.call = null
      phone.set({ status: 'ready', contactName:'', contactPhone:'', startTime: null, muted: false })
    })

    device.on('connect', conn => {
      phone.call = conn
      phone.set({ status: 'connected', startTime: Date.now() })
    })

    device.on('incoming', conn => {
      // Auto-accept incoming or show notification
      conn.accept()
    })

  } catch(e) {
    phone.set({ status: 'error', error: e.message })
    toast('Could not start phone: ' + e.message.split('\n')[0], '#DC2626')
    console.error('Twilio device init:', e)
  } finally {
    phone.loading = false
  }
}

// ── CLICK TO CALL BUTTON ─────────────────────────────────────────
export function ClickToCall({ phone: phoneNum, contactName, contactId, size = 'sm', showLabel = false }) {
  const { agent } = useAuth()
  const { toast  } = useApp()
  const ps = usePhoneState()

  if (!phoneNum) return null

  const clean = phoneNum.replace(/\D/g,'')
  const e164  = clean.startsWith('1') ? '+'+clean : '+1'+clean

  const isActive    = ps.status === 'connected' && ps.contactPhone === e164
  const isBusy      = ['ringing','connected'].includes(ps.status) && ps.contactPhone !== e164
  const isThisRinging = ps.status === 'ringing' && ps.contactPhone === e164

  async function call() {
    // Init device if not ready
    if (!phone.ready) {
      await initDevice(agent, toast)
      // Wait for ready
      await new Promise((resolve, reject) => {
        let tries = 0
        const check = setInterval(() => {
          if (phone.ready) { clearInterval(check); resolve() }
          if (++tries > 60 || phone.state.status === 'error') {
            clearInterval(check)
            reject(new Error(phone.state.error || 'Device not ready'))
          }
        }, 200)
      })
    }

    if (isBusy) { toast('Already on a call', '#F5A623'); return }

    phone.set({ status: 'ringing', contactName: contactName||e164, contactPhone: e164, contactId: contactId||null })

    try {
      // Log to DB
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

      phone.set({ callLogId: callLog?.id || null })

      // Make the call through Twilio Device SDK
      const conn = phone.device.connect({
        To:          e164,
        contactName: contactName || '',
        callLogId:   callLog?.id || '',
      })

      phone.call = conn

      conn.on('ringing', () => phone.set({ status: 'ringing' }))
      conn.on('accept',  () => phone.set({ status: 'connected', startTime: Date.now() }))
      conn.on('disconnect', () => {
        phone.call = null
        phone.set({ status: 'ready', contactName:'', contactPhone:'', startTime: null, muted: false })
      })
      conn.on('error', err => {
        toast('Call error: ' + err.message, '#DC2626')
        phone.call = null
        phone.set({ status: 'ready', contactName:'', contactPhone:'', startTime: null })
      })

    } catch(e) {
      toast('Call failed: ' + e.message, '#DC2626')
      phone.set({ status: 'ready', contactName:'', contactPhone:'', startTime: null })
    }
  }

  const sz = size === 'lg'
    ? { padding:'9px 18px', fontSize:13, gap:7, borderRadius:10 }
    : { padding:'5px 11px', fontSize:11, gap:4, borderRadius:20 }

  const bg = isActive ? '#10B981'
           : isThisRinging ? '#F5A623'
           : isBusy ? '#94A3B8'
           : '#10B981'

  return (
    <button onClick={call} disabled={isBusy}
      title={'Call ' + (contactName||e164) + ' — in-browser call, no phone needed'}
      style={{ display:'inline-flex', alignItems:'center', gap:sz.gap, padding:sz.padding, borderRadius:sz.borderRadius,
        border:'none', background:bg, color:'#fff', fontSize:sz.fontSize, fontWeight:700,
        cursor:isBusy?'not-allowed':'pointer', fontFamily:ff, transition:'all .15s',
        opacity:isBusy?.6:1 }}>
      {isThisRinging ? '📳' : isActive ? '🔴' : '📞'}
      {showLabel && <span>{isActive?'On call':isThisRinging?'Ringing...':(contactName||e164)}</span>}
    </button>
  )
}

// ── SOFTPHONE PANEL ───────────────────────────────────────────────
// Shows when a call is active — floating bottom-center
export function ActiveCallBar() {
  const ps      = usePhoneState()
  const { agent } = useAuth()
  const { toast } = useApp()
  const [elapsed,    setElapsed]    = useState(0)
  const [showKeypad, setShowKeypad] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (ps.status === 'connected' && ps.startTime) {
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now()-ps.startTime)/1000)), 1000)
    } else {
      clearInterval(timer.current)
      if (ps.status !== 'connected') setElapsed(0)
    }
    return () => clearInterval(timer.current)
  }, [ps.status, ps.startTime])

  if (!['ringing','connected','loading'].includes(ps.status)) return null

  function fmt(s) {
    const m = Math.floor(s/60), ss = s%60
    return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0')
  }

  function toggleMute() {
    if (!phone.call) return
    const newMuted = !ps.muted
    if (newMuted) phone.call.mute(); else phone.call.mute(false)
    phone.set({ muted: newMuted })
  }

  function sendDigit(d) {
    phone.call?.sendDigits(d)
  }

  async function hangup() {
    if (phone.call) phone.call.disconnect()
    phone.device?.disconnectAll()

    // Update call log
    if (ps.callLogId) {
      await supabase.from('calls').update({
        status:'completed', outcome:'Connected',
        duration_sec: elapsed, updated_at: new Date().toISOString(),
      }).eq('id', ps.callLogId)

      if (ps.contactId) {
        await supabase.from('activity_log').insert({
          table_name:'contacts', record_id:ps.contactId,
          action:'call_outbound', agent_id:agent?.id||null,
          metadata:JSON.stringify({ direction:'Outbound', duration_sec:elapsed, call_id:ps.callLogId }),
          created_at:new Date().toISOString(),
        })
      }
    }

    phone.call = null
    phone.set({ status:'ready', contactName:'', contactPhone:'', startTime:null, muted:false, callLogId:null })
    toast('📞 Call ended' + (elapsed>0?' — '+fmt(elapsed):'') + ' · Recorded ✓')
    setElapsed(0)
  }

  const statusLabel = ps.status==='loading'?'Starting phone...'
                    : ps.status==='ringing'?'Calling...'
                    : 'Connected'
  const dot = ps.status==='connected'?'#10B981':'#F5A623'

  return (
    <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', zIndex:9999, fontFamily:ff,
      background:'#0F1A2E', borderRadius:18, boxShadow:'0 12px 48px rgba(0,0,0,.55)',
      minWidth:320, maxWidth:380, overflow:'hidden', userSelect:'none' }}>

      {/* Header */}
      <div style={{ padding:'14px 18px 10px', display:'flex', alignItems:'center', gap:12 }}>
        {/* Pulse dot */}
        <div style={{ position:'relative', flexShrink:0, width:14, height:14 }}>
          <div style={{ width:14,height:14,borderRadius:'50%',background:dot }} />
          <div style={{ position:'absolute',inset:-5,borderRadius:'50%',background:dot,opacity:.25,animation:'ping 1.4s ease-in-out infinite' }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15,fontWeight:800,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
            {ps.contactName || 'Unknown'}
          </div>
          <div style={{ fontSize:11,color:'rgba(255,255,255,.45)',marginTop:1 }}>
            {statusLabel}
            {ps.status==='ringing' && <span style={{ marginLeft:6, color:'rgba(255,255,255,.35)' }}>· Browser call · no phone needed</span>}
          </div>
        </div>
        {ps.status==='connected' && elapsed>0 && (
          <div style={{ fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#10B981',flexShrink:0 }}>{fmt(elapsed)}</div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,.07)', margin:'0 0 0 0' }}>
        {/* Keypad toggle */}
        <button onClick={() => setShowKeypad(k=>!k)} disabled={ps.status!=='connected'}
          style={{ flex:1,padding:'11px 0',background:showKeypad?'rgba(255,255,255,.08)':'none',border:'none',
            color:showKeypad?'#fff':'rgba(255,255,255,.4)',fontSize:20,cursor:ps.status==='connected'?'pointer':'default',
            borderRight:'1px solid rgba(255,255,255,.07)' }} title="Keypad">
          ⌨️
        </button>

        {/* Mute */}
        <button onClick={toggleMute} disabled={ps.status!=='connected'}
          style={{ flex:1,padding:'11px 0',background:ps.muted?'rgba(220,38,38,.25)':'none',border:'none',
            color:ps.muted?'#F87171':'rgba(255,255,255,.4)',fontSize:20,cursor:ps.status==='connected'?'pointer':'default',
            borderRight:'1px solid rgba(255,255,255,.07)' }} title={ps.muted?'Unmute':'Mute'}>
          {ps.muted?'🔇':'🎤'}
        </button>

        {/* Speaker indicator */}
        <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',
          color:'rgba(255,255,255,.4)',fontSize:20,borderRight:'1px solid rgba(255,255,255,.07)' }}
          title="Browser speaker active">
          🔊
        </div>

        {/* Hang up */}
        <button onClick={hangup}
          style={{ flex:2,padding:'11px 0',background:'#DC2626',border:'none',color:'#fff',
            fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
          🔴 End Call
        </button>
      </div>

      {/* Keypad */}
      {showKeypad && ps.status==='connected' && (
        <div style={{ padding:'12px 16px 14px', borderTop:'1px solid rgba(255,255,255,.07)', background:'rgba(0,0,0,.2)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']].map(([d,sub]) => (
              <button key={d} onClick={() => sendDigit(d)}
                style={{ padding:'10px 0', borderRadius:8, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.12)',
                  color:'#fff', cursor:'pointer', fontFamily:ff, display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.2)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}>
                <span style={{ fontSize:18, fontWeight:700 }}>{d}</span>
                {sub && <span style={{ fontSize:8, color:'rgba(255,255,255,.4)', letterSpacing:'.1em' }}>{sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {ps.status === 'error' && (
        <div style={{ padding:'8px 18px 12px', fontSize:11, color:'#F87171', lineHeight:1.5 }}>
          ⚠️ {ps.error}
        </div>
      )}
    </div>
  )
}

// ── PHONE INITIALIZER ─────────────────────────────────────────────
// Mount this once in the app to pre-warm the device on first interaction
export function PhoneProvider({ children }) {
  return children
}
