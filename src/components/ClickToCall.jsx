// TargetOS V2 — Browser Softphone (Twilio Voice SDK v2)
import React, { useState, useEffect, useRef } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── GLOBAL PHONE STATE ────────────────────────────────────────────
const phone = {
  device: null, call: null, ready: false, initializing: false,
  listeners: new Set(),
  state: { status: 'idle', contactName: '', contactPhone: '', contactId: null, callLogId: null, startTime: null, muted: false, error: null },
  set(patch) { Object.assign(this.state, patch); this.listeners.forEach(fn => fn({ ...this.state })) }
}
function usePhoneState() {
  const [s, setS] = useState({ ...phone.state })
  useEffect(() => { const fn = s => setS(s); phone.listeners.add(fn); return () => phone.listeners.delete(fn) }, [])
  return s
}

// Load Twilio Voice SDK v2 from CDN
function loadSDK() {
  return new Promise((resolve, reject) => {
    if (window.Twilio?.Device) { resolve(); return }
    const s = document.createElement('script')
    // Use the stable v2 SDK
    s.src = 'https://sdk.twilio.com/js/voice/releases/2.3.0/twilio.min.js'
    s.onload  = () => window.Twilio?.Device ? resolve() : reject(new Error('SDK loaded but Twilio.Device not found'))
    s.onerror = () => reject(new Error('Failed to load Twilio Voice SDK'))
    document.head.appendChild(s)
  })
}

async function initDevice(agent, toast) {
  if (phone.ready || phone.initializing) return
  phone.initializing = true
  phone.set({ status: 'loading', error: null })

  try {
    // Get token
    const name = (agent?.name || 'agent').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
    const res  = await fetch('/api/twilio-token?agentId=' + (agent?.id||'') + '&agentName=' + name)
    const data = await res.json()

    if (!res.ok || !data.token) {
      const msg = data.error || 'Token fetch failed'
      const hint = data.hint ? '\n\nSetup: ' + data.hint : ''
      throw new Error(msg + hint)
    }

    // Load SDK
    await loadSDK()

    // Create device with v2 API
    const device = new window.Twilio.Device(data.token, {
      logLevel: 1,
      codecPreferences: ['opus', 'pcmu'],
      enableImprovedSignalingErrorPrecision: true,
    })

    await device.register()

    device.on('registered',   ()  => { phone.ready = true; phone.device = device; phone.set({ status: 'ready', error: null }) })
    device.on('error',        err => { phone.set({ status: 'error', error: err.message }); toast('Phone error: ' + err.message, '#DC2626') })
    device.on('incoming',     call => call.accept())
    device.on('tokenWillExpire', async () => {
      // Refresh token before it expires
      const r = await fetch('/api/twilio-token?agentName=' + name)
      const d = await r.json()
      if (d.token) device.updateToken(d.token)
    })

  } catch(e) {
    phone.set({ status: 'error', error: e.message })
    toast('Could not start browser phone: ' + e.message.split('\n')[0], '#DC2626')
    console.error('initDevice:', e)
  } finally {
    phone.initializing = false
  }
}

// ── CLICK TO CALL BUTTON ─────────────────────────────────────────
export function ClickToCall({ phone: phoneNum, contactName, contactId, size = 'sm', showLabel = false }) {
  const { agent } = useAuth()
  const { toast  } = useApp()
  const [status, setStatus] = useState('idle') // idle | loading | calling
  const ps = usePhoneState()

  if (!phoneNum) return null
  const clean = phoneNum.replace(/\D/g, '')
  const e164  = clean.startsWith('1') ? '+' + clean : '+1' + clean

  const isBusy     = ['ringing','connected'].includes(ps.status) && ps.contactPhone !== e164
  const isThisCall = ['ringing','connected'].includes(ps.status) && ps.contactPhone === e164

  async function call() {
    if (isBusy) { toast('Already on a call', '#F5A623'); return }
    if (isThisCall) return

    setStatus('loading')

    try {
      // Init device if needed
      if (!phone.ready) {
        await initDevice(agent, toast)
        // Wait up to 8s for device to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Phone took too long to start. Check TWILIO_TWIML_APP_SID in Vercel.')), 8000)
          const interval = setInterval(() => {
            if (phone.ready)              { clearTimeout(timeout); clearInterval(interval); resolve() }
            if (phone.state.status === 'error') { clearTimeout(timeout); clearInterval(interval); reject(new Error(phone.state.error)) }
          }, 200)
        })
      }

      phone.set({ status: 'ringing', contactName: contactName || e164, contactPhone: e164, contactId: contactId || null })
      setStatus('calling')

      // Log call
      const { data: callLog } = await supabase.from('calls').insert({
        from_number: '+18453271778', to_number: e164,
        contact_name: contactName || null, contact_id: contactId || null,
        direction: 'Outbound', status: 'initiated',
        agent_id: agent?.id || null, called_at: new Date().toISOString(),
      }).select().single()

      phone.set({ callLogId: callLog?.id || null })

      // Connect — v2 API uses device.connect() with params object
      const call = await phone.device.connect({
        params: {
          To:          e164,
          contactName: contactName || '',
          callLogId:   callLog?.id || '',
        }
      })

      phone.call = call

      call.on('ringing',    ()  => phone.set({ status: 'ringing' }))
      call.on('accept',     ()  => phone.set({ status: 'connected', startTime: Date.now() }))
      call.on('disconnect', ()  => { phone.call = null; phone.set({ status: 'ready', contactName:'', contactPhone:'', startTime:null, muted:false }) })
      call.on('error',      err => { toast('Call error: ' + err.message, '#DC2626'); phone.call = null; phone.set({ status: 'ready', contactName:'', contactPhone:'', startTime:null }) })

    } catch(e) {
      toast(e.message, '#DC2626')
      phone.set({ status: phone.ready ? 'ready' : 'idle', contactName:'', contactPhone:'', startTime:null })
    } finally {
      setStatus('idle')
    }
  }

  const sz = size === 'lg'
    ? { padding:'9px 18px', fontSize:13, gap:7, borderRadius:10 }
    : { padding:'5px 11px', fontSize:11, gap:4, borderRadius:20 }

  const bg = isThisCall ? '#059669' : isBusy ? '#94A3B8' : '#10B981'
  const label = status==='loading' ? '⏳' : isThisCall ? 'On Call' : showLabel ? (contactName||e164) : ''

  return (
    <button onClick={call} disabled={isBusy || status==='loading'}
      title={isBusy ? 'Already on a call' : 'Call ' + (contactName||e164) + ' from browser — no phone app needed'}
      style={{ display:'inline-flex', alignItems:'center', gap:sz.gap, padding:sz.padding,
        borderRadius:sz.borderRadius, border:'none', background:bg, color:'#fff',
        fontSize:sz.fontSize, fontWeight:700, cursor:isBusy?'not-allowed':'pointer',
        fontFamily:ff, transition:'all .15s', opacity:(isBusy||status==='loading')?.6:1 }}>
      {status==='loading' ? '⏳' : isThisCall ? '🔴' : '📞'}
      {(showLabel || status==='loading') && <span>{label}</span>}
    </button>
  )
}

// ── ACTIVE CALL PANEL ─────────────────────────────────────────────
export function ActiveCallBar() {
  const ps    = usePhoneState()
  const { agent } = useAuth()
  const { toast  } = useApp()
  const [elapsed,    setElapsed]    = useState(0)
  const [showKeypad, setShowKeypad] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (ps.status === 'connected' && ps.startTime) {
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now()-ps.startTime)/1000)), 1000)
    } else { clearInterval(timer.current); if (ps.status!=='connected') setElapsed(0) }
    return () => clearInterval(timer.current)
  }, [ps.status, ps.startTime])

  const show = ['loading','ringing','connected','error'].includes(ps.status)
  if (!show) return null

  function fmt(s) { const m=Math.floor(s/60),ss=s%60; return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0') }

  function toggleMute() {
    if (!phone.call) return
    const m = !ps.muted
    phone.call.mute(m)
    phone.set({ muted: m })
    toast(m ? '🔇 Muted' : '🎤 Unmuted')
  }

  function sendDigit(d) { phone.call?.sendDigits(d) }

  async function hangup() {
    phone.call?.disconnect()
    phone.device?.disconnectAll()

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
        }).catch(()=>{})
      }
    }

    phone.call = null
    phone.set({ status:'ready', contactName:'', contactPhone:'', startTime:null, muted:false, callLogId:null, error:null })
    setElapsed(0); setShowKeypad(false)
    if (elapsed > 0) toast('📞 Call ended — ' + fmt(elapsed) + ' · Recorded ✓')
  }

  function dismiss() { phone.set({ status:'idle', error:null }) }

  const dot = ps.status==='connected' ? '#10B981' : ps.status==='error' ? '#DC2626' : '#F5A623'

  return (
    <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
      zIndex:9999, fontFamily:ff, background:'#0F1A2E', borderRadius:18,
      boxShadow:'0 12px 48px rgba(0,0,0,.6)', minWidth:320, maxWidth:400, overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'14px 18px 12px', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ position:'relative', width:14, height:14, flexShrink:0 }}>
          <div style={{ width:14,height:14,borderRadius:'50%',background:dot }} />
          {ps.status!=='error' && <div style={{ position:'absolute',inset:-5,borderRadius:'50%',background:dot,opacity:.22,animation:'ping 1.4s ease-in-out infinite' }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15,fontWeight:800,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
            {ps.contactName || 'Connecting...'}
          </div>
          <div style={{ fontSize:11,color:'rgba(255,255,255,.45)',marginTop:1 }}>
            {ps.status==='loading'    ? '⏳ Starting browser phone...' :
             ps.status==='ringing'   ? '🔔 Ringing...' :
             ps.status==='connected' ? '🎙 Connected' :
             ps.status==='error'     ? '❌ ' + (ps.error||'Error') : ''}
          </div>
        </div>
        {ps.status==='connected' && elapsed>0 && (
          <div style={{ fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#10B981',flexShrink:0 }}>{fmt(elapsed)}</div>
        )}
        {ps.status==='error' && (
          <button onClick={dismiss} style={{ background:'rgba(255,255,255,.1)',border:'none',cursor:'pointer',color:'rgba(255,255,255,.6)',fontSize:16,borderRadius:6,padding:'2px 8px' }}>×</button>
        )}
      </div>

      {/* Error detail */}
      {ps.status==='error' && ps.error && (
        <div style={{ padding:'0 18px 12px', fontSize:11, color:'#F87171', lineHeight:1.6 }}>
          {ps.error.includes('TWILIO_TWIML_APP_SID') ?
            'Add TWILIO_TWIML_APP_SID to Vercel env vars then redeploy. Visit /api/twilio-setup to get the SID.' :
            ps.error
          }
        </div>
      )}

      {/* Controls — only show when active */}
      {['ringing','connected'].includes(ps.status) && (
        <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,.07)' }}>
          <button onClick={() => setShowKeypad(k=>!k)} disabled={ps.status!=='connected'}
            style={{ flex:1,padding:'12px 0',background:showKeypad?'rgba(255,255,255,.1)':'none',border:'none',
              color:ps.status==='connected'?'rgba(255,255,255,.7)':'rgba(255,255,255,.25)',fontSize:20,cursor:'pointer',
              borderRight:'1px solid rgba(255,255,255,.07)' }}>
            ⌨️
          </button>
          <button onClick={toggleMute} disabled={ps.status!=='connected'}
            style={{ flex:1,padding:'12px 0',background:ps.muted?'rgba(220,38,38,.25)':'none',border:'none',
              color:ps.muted?'#F87171':ps.status==='connected'?'rgba(255,255,255,.7)':'rgba(255,255,255,.25)',fontSize:20,cursor:'pointer',
              borderRight:'1px solid rgba(255,255,255,.07)' }}>
            {ps.muted?'🔇':'🎤'}
          </button>
          <button onClick={hangup}
            style={{ flex:2,padding:'12px 0',background:'#DC2626',border:'none',color:'#fff',
              fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
            🔴 End Call
          </button>
        </div>
      )}

      {/* Keypad */}
      {showKeypad && ps.status==='connected' && (
        <div style={{ padding:'12px 16px 14px', borderTop:'1px solid rgba(255,255,255,.07)', background:'rgba(0,0,0,.2)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
              <button key={d} onClick={() => sendDigit(d)}
                style={{ padding:'11px 0', borderRadius:8, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.12)',
                  color:'#fff', cursor:'pointer', fontFamily:ff, fontSize:18, fontWeight:700 }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.2)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
