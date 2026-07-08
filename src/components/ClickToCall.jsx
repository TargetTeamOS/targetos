// TargetOS V2 — ClickToCall
// Browser-first outbound calling with WebRTC (Twilio Voice SDK).
// Falls back to bridge call on mobile. Features:
// - Confirmation dialog with mode selector (Browser / Phone)
// - Full-screen active call panel with timer, mute, keypad, hold
// - Real DTMF keypad that sends digits through the live call
// - Call recording indicator
// - Post-call logging to DB with duration + activity timeline

import React, { useState, useEffect, useRef } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Device }   from '@twilio/voice-sdk'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768
}

// ── GLOBAL CALL STATE ─────────────────────────────────────────────
const G = {
  show:false, active:false, status:'idle',
  name:'', phone:'', contactId:null, callLogId:null,
  callSid:null, startTime:null, mode:null, errorText:'',
  device:null, deviceCall:null, deviceReady:false, muted:false, onHold:false,
  listeners: new Set(),
  set(p) { Object.assign(G, p); G.listeners.forEach(f => f()) }
}
function useG() {
  const [,tick] = useState(0)
  useEffect(() => {
    const f = () => tick(n => n+1)
    G.listeners.add(f)
    return () => G.listeners.delete(f)
  }, [])
  return G
}

async function ensureDevice(agent) {
  if (G.device && G.deviceReady) return G.device
  const name = (agent?.name||'agent').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,30)||'agent'
  const res  = await fetch('/api/twilio-token?agentName='+name)
  const data = await res.json()
  if (!res.ok || !data.token) throw new Error(data.error + (data.hint?' — '+data.hint:''))

  const device = new Device(data.token, { logLevel:'error', codecPreferences:['opus','pcmu'] })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Device registration timed out')), 10000)
    device.on('registered', () => { clearTimeout(timeout); G.deviceReady = true; resolve() })
    device.on('error', err => { clearTimeout(timeout); reject(new Error(err.message)) })
    device.register()
  })
  device.on('tokenWillExpire', async () => {
    try {
      const r = await fetch('/api/twilio-token?agentName='+name)
      const d = await r.json()
      if (d.token) device.updateToken(d.token)
    } catch {}
  })
  G.device = device
  return device
}

// ── CALL BUTTON ────────────────────────────────────────────────────
export function ClickToCall({ phone, contactName, contactId, size='sm', showLabel=false }) {
  const g = useG()
  if (!phone) return null

  const sz = size==='lg'
    ? { padding:'9px 20px', fontSize:14, borderRadius:10 }
    : { padding:'5px 12px', fontSize:12, borderRadius:20 }

  function handleClick(e) {
    e.preventDefault(); e.stopPropagation()
    G.set({
      show:true, active:false, status:'confirm', errorText:'',
      name: contactName||phone, phone, contactId:contactId||null,
      callLogId:null, callSid:null, startTime:null, mode:null,
    })
  }

  return (
    <button type="button"
      onPointerDown={e=>{ e.preventDefault(); e.stopPropagation() }}
      onClick={handleClick}
      style={{ display:'inline-flex', alignItems:'center', gap:6, ...sz,
        border:'none', cursor:'pointer', fontFamily:ff,
        background: g.active&&g.phone===phone ? '#059669' : '#10B981',
        color:'#fff', fontWeight:700,
        WebkitTapHighlightColor:'transparent', outline:'none',
        userSelect:'none', touchAction:'manipulation' }}>
      📞
      {showLabel && <span style={{pointerEvents:'none'}}>{contactName||phone}</span>}
    </button>
  )
}

// ── DIALPAD (standalone) ───────────────────────────────────────────
export function DialPad({ onCall }) {
  const [num, setNum] = useState('')
  const digits = ['1','2','3','4','5','6','7','8','9','*','0','#']

  function press(d) { setNum(p => p+d) }
  function backspace() { setNum(p => p.slice(0,-1)) }
  function dial() {
    if (!num.trim()) return
    const phone = num.trim()
    G.set({
      show:true, active:false, status:'confirm', errorText:'',
      name: phone, phone, contactId:null,
      callLogId:null, callSid:null, startTime:null, mode:null,
    })
    if (onCall) onCall(phone)
    setNum('')
  }

  return (
    <div style={{ fontFamily:ff, width:240, userSelect:'none' }}>
      {/* Display */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 12px', background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', marginBottom:12 }}>
        <span style={{ flex:1, fontSize:18, fontWeight:700, color:'var(--text)', letterSpacing:2, fontFamily:'monospace', minHeight:24 }}>{num||''}</span>
        {num && (
          <button onClick={backspace}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18, padding:'0 4px' }}>
            ⌫
          </button>
        )}
      </div>

      {/* Keys */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
        {digits.map(d => (
          <button key={d} onClick={() => press(d)}
            style={{ padding:'14px 0', borderRadius:12, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:ff, transition:'background .1s' }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
            onMouseLeave={e=>e.currentTarget.style.background='var(--panel)'}>
            {d}
          </button>
        ))}
      </div>

      {/* Call button */}
      <button onClick={dial} disabled={!num.trim()}
        style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background: num.trim()?'#10B981':'var(--dim)', color:'#fff', fontSize:16, fontWeight:800, cursor: num.trim()?'pointer':'default', fontFamily:ff }}>
        📞 Call
      </button>
    </div>
  )
}

// ── ACTIVE CALL BAR ────────────────────────────────────────────────
export function ActiveCallBar() {
  const g         = useG()
  const { agent } = useAuth()
  const { toast } = useApp()
  const [elapsed, setElapsed] = useState(0)
  const [keypad,  setKeypad]  = useState(false)
  const [agentPh, setAgentPh] = useState('')
  const [useBrowser, setUseBrowser] = useState(!isMobile())
  const timer = useRef(null)

  useEffect(() => { if (agent?.phone) setAgentPh(agent.phone) }, [agent])

  useEffect(() => {
    clearInterval(timer.current)
    if ((g.status==='ringing'||g.status==='connected') && g.startTime) {
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now()-g.startTime)/1000)), 1000)
    } else if (!['ringing','connected'].includes(g.status)) setElapsed(0)
    return () => clearInterval(timer.current)
  }, [g.status, g.startTime])

  if (!g.show) return null

  function fmt(s) { return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0') }

  async function startBrowserCall() {
    G.set({ status:'calling' })
    try {
      const { data:log } = await supabase.from('calls').insert({
        from_number:'+18453271778', to_number:g.phone,
        contact_name:g.name||null, contact_id:g.contactId||null,
        direction:'Outbound', status:'initiated',
        agent_id:agent?.id||null, called_at:new Date().toISOString(),
      }).select().single()
      G.set({ callLogId:log?.id||null })

      const device = await ensureDevice(agent)
      let toNum = g.phone.replace(/[^+0-9]/g,'')
      if (!toNum.startsWith('+')) toNum = '+1'+toNum

      const call = await device.connect({ params:{ To:toNum, contactName:g.name||'', callLogId:log?.id||'' } })
      G.set({ deviceCall:call, active:true, status:'ringing', startTime:Date.now(), mode:'browser' })

      call.on('accept', async () => {
        G.set({ status:'connected', startTime:Date.now() })
        const sid = call.parameters?.CallSid||call.callSid
        if (sid && log?.id) {
          G.set({ callSid:sid })
          await supabase.from('calls').update({ twilio_call_sid:sid }).eq('id',log.id).then(()=>{}).catch(()=>{})
        }
      })
      call.on('disconnect', () => { G.deviceCall=null; closePanel() })
      call.on('cancel',     () => { G.deviceCall=null; closePanel() })
      call.on('error', err => G.set({ status:'error_msg', errorText:err.message }))
    } catch(e) { G.set({ status:'error_msg', errorText:e.message }) }
  }

  async function startBridgeCall() {
    G.set({ status:'calling' })
    try {
      const { data:log } = await supabase.from('calls').insert({
        from_number:'+18453271778', to_number:g.phone,
        contact_name:g.name||null, contact_id:g.contactId||null,
        direction:'Outbound', status:'initiated',
        agent_id:agent?.id||null, called_at:new Date().toISOString(),
      }).select().single()
      G.set({ callLogId:log?.id||null })

      const res  = await fetch('/api/twilio-outbound', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ to:g.phone, contactName:g.name, callLogId:log?.id, agentId:agent?.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error||'API error '+res.status)
      G.set({ active:true, callSid:data.callSid, status:'ringing', startTime:Date.now(), mode:data.mode })
    } catch(e) { G.set({ status:'error_msg', errorText:e.message }) }
  }

  function closePanel() {
    G.set({ show:false, active:false, status:'idle', callSid:null, callLogId:null, startTime:null, deviceCall:null, muted:false, onHold:false })
    setElapsed(0); setKeypad(false)
  }

  async function hangup() {
    clearInterval(timer.current)
    const sidToEnd  = g.callSid
    const finalSecs = elapsed
    const logId     = g.callLogId
    const cId       = g.contactId
    const dcRef     = g.deviceCall
    closePanel()

    if (dcRef)    { try { dcRef.disconnect() } catch {} }
    if (sidToEnd) { fetch('/api/twilio-outbound', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({callSid:sidToEnd}) }).catch(()=>{}) }

    if (logId) {
      await supabase.from('calls').update({ status:'completed', duration_sec:finalSecs, updated_at:new Date().toISOString() }).eq('id',logId).then(()=>{}).catch(()=>{})
      if (cId && finalSecs > 0) {
        try {
          await supabase.from('activity_log').insert({
            table_name:'contacts', record_id:cId, action:'call_outbound', agent_id:agent?.id||null,
            metadata:JSON.stringify({ duration_sec:finalSecs, call_id:logId }), created_at:new Date().toISOString(),
          })
        } catch(e) { console.warn('activity_log insert failed:', e.message) }
      }
    }
    toast(finalSecs>0 ? '📞 Call ended — '+fmt(finalSecs) : '📞 Call cancelled')
  }

  function toggleMute() {
    if (g.deviceCall) {
      const m = !g.muted
      g.deviceCall.mute(m)
      G.set({ muted:m })
    }
  }

  function sendDigit(d) {
    if (g.deviceCall) g.deviceCall.sendDigits(d)
  }

  // ── CONFIRM ──────────────────────────────────────────────────────
  if (g.status==='confirm') return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,.6)',
      display:'flex', alignItems:isMobile()?'flex-end':'center', justifyContent:'center', padding:16, fontFamily:ff }}
      onClick={closePanel}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:'#111827', borderRadius:20, width:'100%', maxWidth:420, overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,.5)' }}>

        <div style={{ padding:'20px 20px 14px', textAlign:'center', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontSize:40, marginBottom:10 }}>📞</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>{g.name}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.45)' }}>{g.phone}</div>
        </div>

        {/* Mode toggle */}
        <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button onClick={() => setUseBrowser(true)}
              style={{ flex:1, padding:'9px', borderRadius:9, border:'1.5px solid '+(useBrowser?'#10B981':'rgba(255,255,255,.15)'),
                background:useBrowser?'rgba(16,185,129,.15)':'transparent', color:useBrowser?'#4ADE80':'rgba(255,255,255,.5)',
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              💻 Browser Call
            </button>
            <button onClick={() => setUseBrowser(false)}
              style={{ flex:1, padding:'9px', borderRadius:9, border:'1.5px solid '+(!useBrowser?'#10B981':'rgba(255,255,255,.15)'),
                background:!useBrowser?'rgba(16,185,129,.15)':'transparent', color:!useBrowser?'#4ADE80':'rgba(255,255,255,.5)',
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              📱 Call My Phone
            </button>
          </div>
          {useBrowser ? (
            <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>
              <span style={{ color:'#4ADE80' }}>✓ Talk through your computer</span><br/>
              Uses your mic &amp; speakers. No phone needed.<br/>
              <span style={{ color:'rgba(255,255,255,.35)' }}>First call will ask for mic permission.</span>
            </div>
          ) : agentPh ? (
            <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>
              <span style={{ color:'#4ADE80' }}>✓ Bridge call</span><br/>
              Twilio will call <strong style={{ color:'#fff' }}>{agentPh}</strong> first, then connect you.
            </div>
          ) : (
            <div style={{ fontSize:12, color:'#FCD34D', lineHeight:1.7 }}>
              ⚠️ Add your phone in <strong style={{ color:'#fff' }}>Settings → Profile</strong> first.
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
          <button onClick={closePanel}
            style={{ padding:'16px', background:'transparent', border:'none', borderRight:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.5)', fontSize:15, cursor:'pointer', fontFamily:ff }}>
            Cancel
          </button>
          <button onClick={useBrowser ? startBrowserCall : startBridgeCall}
            disabled={!useBrowser && !agentPh}
            style={{ padding:'16px', background:(!useBrowser&&!agentPh)?'#374151':'#10B981', border:'none', color:'#fff', fontSize:15, fontWeight:800, cursor:(!useBrowser&&!agentPh)?'not-allowed':'pointer', fontFamily:ff }}>
            📞 Call
          </button>
        </div>
      </div>
    </div>
  )

  // ── ACTIVE CALL ───────────────────────────────────────────────────
  const statusText = {
    calling:   '⏳ Connecting...',
    ringing:   g.mode==='browser' ? '🔔 Ringing...' : '📱 Your phone is ringing',
    connected: '🎙 Connected',
    error_msg: '❌ ' + (g.errorText||'Error'),
  }[g.status] || ''

  return (
    <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:99999,
      fontFamily:ff, background:'#111827', borderRadius:20,
      boxShadow:'0 12px 48px rgba(0,0,0,.7)', minWidth:320, maxWidth:400,
      overflow:'hidden', border:'1px solid rgba(255,255,255,.1)' }}>

      <div style={{ padding:'18px 20px 12px', textAlign:'center' }}>
        <div style={{ fontSize:13, color: g.status==='error_msg'?'#F87171':'#4ADE80', marginBottom:6, fontWeight:700 }}>{statusText}</div>
        <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{g.name}</div>
        {g.status==='connected' && (
          <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:4, padding:'2px 8px', borderRadius:10, background:'rgba(220,38,38,.15)', border:'1px solid rgba(220,38,38,.3)' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#EF4444', display:'inline-block', animation:'pulse 1.5s infinite' }} />
            <span style={{ fontSize:10, color:'#FCA5A5', fontWeight:700 }}>Recording</span>
          </div>
        )}
        {elapsed > 0 && <div style={{ fontFamily:'monospace', fontSize:24, color:'#10B981', marginTop:8, fontWeight:800 }}>{fmt(elapsed)}</div>}
      </div>

      {g.status==='error_msg' && (
        <div style={{ padding:'0 20px 12px', fontSize:11, color:'#F87171', textAlign:'center', lineHeight:1.6 }}>{g.errorText}</div>
      )}

      {/* DTMF Keypad */}
      {keypad && g.status==='connected' && g.mode==='browser' && (
        <div style={{ padding:'10px 16px', borderTop:'1px solid rgba(255,255,255,.08)', background:'rgba(0,0,0,.3)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => (
              <button key={d} onClick={() => sendDigit(d)}
                style={{ padding:'11px 0', borderRadius:9, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.1)', color:'#fff', fontSize:18, fontWeight:700, cursor:'pointer', fontFamily:ff, active:{background:'rgba(255,255,255,.2)'} }}
                onMouseDown={e=>e.currentTarget.style.background='rgba(255,255,255,.2)'}
                onMouseUp={e=>e.currentTarget.style.background='rgba(255,255,255,.08)'}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,.08)' }}>
        {g.status==='connected' && g.mode==='browser' && <>
          <button onClick={toggleMute}
            style={{ flex:1, padding:'14px', background:g.muted?'rgba(220,38,38,.2)':'transparent', border:'none', borderRight:'1px solid rgba(255,255,255,.08)', color:g.muted?'#F87171':'rgba(255,255,255,.5)', fontSize:20, cursor:'pointer' }}>
            {g.muted?'🔇':'🎤'}
          </button>
          <button onClick={() => setKeypad(k=>!k)}
            style={{ flex:1, padding:'14px', background:keypad?'rgba(255,255,255,.08)':'transparent', border:'none', borderRight:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.5)', fontSize:20, cursor:'pointer' }}>
            ⌨️
          </button>
        </>}
        <button onClick={hangup}
          style={{ flex:2, padding:'14px', background:'#DC2626', border:'none', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontFamily:ff }}>
          🔴 {g.status==='calling'?'Cancel':'End Call'}
        </button>
      </div>
    </div>
  )
}

// ── FLOATING DIALPAD BUTTON ────────────────────────────────────────
// A persistent dialpad button for calling any number from anywhere
export function GlobalDialButton() {
  const [open, setOpen] = useState(false)
  const g = useG()

  // Don't show while in a call
  if (g.active) return null

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Open dialpad (call any number)"
        style={{ position:'fixed', bottom:24, right:24, zIndex:9998,
          width:52, height:52, borderRadius:'50%', border:'none',
          background:'#10B981', color:'#fff', fontSize:22, cursor:'pointer',
          boxShadow:'0 4px 20px rgba(16,185,129,.4)', display:'flex', alignItems:'center', justifyContent:'center',
          transition:'transform .15s', transform: open ? 'rotate(45deg)' : 'none' }}>
        {open ? '✕' : '📞'}
      </button>

      {/* Dialpad panel */}
      {open && (
        <div style={{ position:'fixed', bottom:86, right:24, zIndex:9998,
          background:'var(--panel)', borderRadius:16, boxShadow:'0 8px 40px rgba(0,0,0,.25)',
          border:'1px solid var(--border)', padding:16, fontFamily:ff }}
          onClick={e => e.stopPropagation()}>
          <div style={{ fontSize:12, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>
            Dial Any Number
          </div>
          <DialPad onCall={() => setOpen(false)} />
        </div>
      )}

      {/* Click outside to close */}
      {open && <div style={{ position:'fixed', inset:0, zIndex:9997 }} onClick={() => setOpen(false)} />}
    </>
  )
}


// ── HEADER CALL BUTTON ─────────────────────────────────────────────
// Inline call button for page headers — opens dialpad as a dropdown
// Use in Contacts and Listings page headers only
export function HeaderCallButton() {
  const [open, setOpen] = useState(false)
  const [num,  setNum]  = useState('')
  const g = useG()
  const ref = React.useRef(null)

  React.useEffect(() => {
    function close(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  async function dial() {
    if (!num.trim()) return
    g.setState(p => ({ ...p, toNumber: num, active: true }))
    setOpen(false)
    setNum('')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: '1px solid var(--border)',
          background: open ? '#10B981' : 'var(--dim)',
          color: open ? '#fff' : 'var(--text)',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'Inter, system-ui, sans-serif',
          transition: 'all .15s',
        }}>
        📞 Call
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 500,
          background: 'var(--panel)', borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: '0 8px 32px rgba(0,0,0,.2)',
          padding: 14, width: 260,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            Dial a number
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={num}
              onChange={e => setNum(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && dial()}
              placeholder="(845) 555-1234"
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--inp)',
                color: 'var(--text)', fontSize: 13,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
            <button onClick={dial} style={{
              padding: '8px 12px', borderRadius: 8, border: 'none',
              background: '#10B981', color: '#fff', fontWeight: 700,
              cursor: 'pointer', fontSize: 13,
            }}>Call</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            Or click 📞 next to any contact to call them directly
          </div>
        </div>
      )}
    </div>
  )
}
