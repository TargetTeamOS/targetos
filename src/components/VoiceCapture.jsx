import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { parseVoice } from '../lib/voice'
import * as db from '../lib/db'

// ── SPEECH RECOGNITION HOOK ────────────────────────────────────────
function useSpeech() {
  const [listening,   setListening]   = useState(false)
  const [transcript,  setTranscript]  = useState('')
  const [error,       setError]       = useState('')
  const srRef    = useRef(null)
  const finalRef = useRef('')
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Voice not supported. Use Chrome on Android or Safari on iPhone.'); return }
    finalRef.current = ''; setTranscript(''); setError('')

    const r = new SR()
    r.lang           = 'en-US'
    r.continuous     = false
    r.interimResults = true
    r.maxAlternatives = 1

    r.onstart  = () => setListening(true)

    r.onresult = e => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setTranscript(text)
      if (e.results[e.results.length - 1].isFinal) finalRef.current = text
    }

    r.onerror = e => {
      setListening(false)
      srRef.current = null
      if (e.error === 'not-allowed') setError('Microphone blocked. Go to browser settings → allow microphone → try again.')
      else if (e.error === 'no-speech') setError('Nothing heard. Tap Start, then speak clearly.')
      else if (e.error !== 'aborted') setError('Mic error: ' + e.error + '. Try again.')
    }

    r.onend = () => { setListening(false); srRef.current = null }

    srRef.current = r
    try { r.start() } catch(e) { setError('Could not start mic: ' + e.message) }
  }

  function stop() {
    const sr = srRef.current; srRef.current = null
    if (sr) { try { sr.stop() } catch(e) {} }
    setListening(false)
  }

  function reset() {
    stop(); setTranscript(''); setError(''); finalRef.current = ''
  }

  useEffect(() => () => { const sr = srRef.current; if(sr) try { sr.abort() } catch(e) {} }, [])

  return { listening, transcript, error, supported, start, stop, reset, getFinal: () => finalRef.current || transcript }
}

// ── VOICE CAPTURE COMPONENT ────────────────────────────────────────
export function VoiceCapture() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const speech    = useSpeech()

  const [open,    setOpen]    = useState(false)
  const [step,    setStep]    = useState('idle') // idle | recording | review | done
  const [parsed,  setParsed]  = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [pos,     setPos]     = useState({ x: null, y: null })
  const dragging   = useRef(false)
  const didDrag    = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const btnRef     = useRef()

  // When listening stops naturally, process result
  useEffect(() => {
    if (!speech.listening && step === 'recording') {
      const text = speech.getFinal()
      if (text.trim()) {
        setParsed(parseVoice(text))
        setStep('review')
      } else {
        if (speech.error) { /* already shown */ }
        else              { speech.setError?.('Nothing detected. Try again.'); setStep('idle') }
      }
    }
  }, [speech.listening])

  function toggleMic() {
    if (step === 'recording') {
      speech.stop()
      // useEffect handles transition to review
    } else {
      speech.reset()
      setParsed(null)
      setStep('recording')
      speech.start()
    }
  }

  function handleBtnClick() {
    if (didDrag.current) { didDrag.current = false; return }
    setOpen(o => !o)
  }

  // ── SAVE FUNCTIONS ───────────────────────────────────────────────
  async function saveContact() {
    if (!agent?.id) { toast('Not linked to agent account — contact admin', '#DC2626'); return }
    setSaving(true)
    try {
      const data = {
        first_name:    parsed.name?.first  || 'Voice',
        last_name:     parsed.name?.last   || 'Lead',
        phone:         parsed.phone        || '',
        source:        parsed.source       || 'Voice Capture',
        agent_id:      agent.id,
      }
      await db.contacts.create(data)
      toast('✅ Contact saved!')
      setStep('done')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function saveTask() {
    if (!agent?.id) { toast('Not linked to agent account', '#DC2626'); return }
    setSaving(true)
    try {
      await db.tasks.create({
        title:      parsed.rawText.slice(0, 200),
        priority:   'normal',
        status:     'pending',
        due_date:   parsed.dateTime?.date || null,
        agent_id:   agent.id,
        created_by: agent.id,
      })
      toast('✅ Task saved!')
      setStep('done')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function saveNote() {
    if (!agent?.id) { toast('Not linked to agent account', '#DC2626'); return }
    setSaving(true)
    try {
      await db.tasks.create({
        title:      parsed.rawText.slice(0, 200),
        priority:   'note',
        status:     'pinned',
        agent_id:   agent.id,
        created_by: agent.id,
      })
      toast('✅ Note saved!')
      setStep('done')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function saveSchedule() {
    if (!agent?.id) { toast('Not linked to agent account', '#DC2626'); return }
    setSaving(true)
    try {
      await db.tasks.create({
        title:      parsed.rawText.slice(0, 200),
        priority:   'high',
        status:     'pending',
        due_date:   parsed.dateTime?.date || null,
        agent_id:   agent.id,
        created_by: agent.id,
      })
      toast('✅ Appointment saved as task!')
      setStep('done')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  function tryAgain() { speech.reset(); setParsed(null); setStep('idle') }

  // ── DRAG ─────────────────────────────────────────────────────────
  function onDragStart(e) {
    dragging.current = true; didDrag.current = false
    const touch = e.touches ? e.touches[0] : e
    const rect  = btnRef.current.getBoundingClientRect()
    dragOffset.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    e.preventDefault?.()
  }

  useEffect(() => {
    function move(e) {
      if (!dragging.current) return
      didDrag.current = true
      const touch = e.touches ? e.touches[0] : e
      const x = Math.max(0, Math.min(touch.clientX - dragOffset.current.x, window.innerWidth  - 64))
      const y = Math.max(0, Math.min(touch.clientY - dragOffset.current.y, window.innerHeight - 64))
      setPos({ x, y })
      e.preventDefault?.()
    }
    function end() { dragging.current = false }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup',   end)
    window.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend',  end)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup',   end)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend',  end)
    }
  }, [])

  const isRecording = step === 'recording'
  const btnPos = pos.x !== null
    ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' }
    : { right: '20px', bottom: '76px' }

  return (
    <>
      {/* Floating button */}
      <button ref={btnRef}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        onClick={handleBtnClick}
        title="Voice Capture"
        style={{
          position: 'fixed', ...btnPos,
          width: '58px', height: '58px', borderRadius: '50%',
          background: isRecording
            ? 'linear-gradient(135deg,#DC2626,#991B1B)'
            : 'linear-gradient(135deg,#CC2200,#E8650A)',
          border: 'none', cursor: 'pointer', zIndex: 9990,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', boxShadow: isRecording
            ? '0 0 0 6px rgba(220,38,38,.2), 0 6px 20px rgba(220,38,38,.4)'
            : '0 4px 18px rgba(204,34,0,.4)',
          animation: isRecording ? 'pulse 1.2s infinite' : 'none',
          touchAction: 'none', userSelect: 'none',
        }}>
        {isRecording ? '⏹' : '🎙'}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed', zIndex: 9989,
            ...pos.x !== null
              ? { left: Math.max(0, pos.x - 330) + 'px', top: pos.y + 'px' }
              : { right: '86px', bottom: '76px' },
            width: '320px', background: 'var(--panel)',
            border: '1px solid var(--border)', borderRadius: '18px',
            boxShadow: '0 8px 40px rgba(0,0,0,.2)',
            overflow: 'hidden', fontFamily: 'Inter,system-ui,sans-serif',
            animation: 'slideUp .2s ease',
          }}>

          {/* Header */}
          <div style={{ padding:'12px 16px', background:'linear-gradient(135deg,#CC2200,#E8650A)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ color:'#fff', fontSize:'13px', fontWeight:700 }}>🎙 Voice Capture</div>
            <button onClick={() => { setOpen(false); if(step==='recording') speech.stop() }}
              style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:'50%', width:'26px', height:'26px', cursor:'pointer', color:'#fff', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>

          <div style={{ padding:'16px' }}>

            {/* IDLE */}
            {(step === 'idle' || step === 'done') && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:'44px', marginBottom:'10px' }}>{step === 'done' ? '✅' : '🎙'}</div>
                <div style={{ fontSize:'14px', fontWeight:800, marginBottom:'6px' }}>
                  {step === 'done' ? 'Saved!' : 'Ready to record'}
                </div>
                <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'14px', lineHeight:1.7 }}>
                  {step === 'done' ? 'Tap record again to add more.' : 'Tap below and speak naturally'}
                </div>
                {step === 'idle' && (
                  <div style={{ background:'var(--dim)', borderRadius:'10px', padding:'11px 14px', marginBottom:'14px', fontSize:'11px', color:'var(--muted)', textAlign:'left', lineHeight:1.9 }}>
                    <strong style={{ color:'var(--text)' }}>Try saying:</strong><br/>
                    "John Smith 845-555-1234 from Monsey"<br/>
                    "Remind me to follow up with Lazer tomorrow"<br/>
                    "Schedule showing at 47 Prairie Ave Friday 2pm"<br/>
                    "Note: client wants 4 beds under 800k"
                  </div>
                )}
                <button onClick={() => { speech.reset(); setStep('recording'); speech.start() }}
                  style={{ width:'100%', background:'linear-gradient(135deg,#CC2200,#E8650A)', border:'none', borderRadius:'11px', color:'#fff', fontSize:'13px', fontWeight:700, padding:'13px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                  🎙 Start Recording
                </button>
              </div>
            )}

            {/* RECORDING */}
            {step === 'recording' && (
              <div style={{ textAlign:'center' }}>
                <div style={{ width:'68px', height:'68px', borderRadius:'50%', background:'rgba(220,38,38,.1)', border:'3px solid #DC2626', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:'28px', animation:'pulse 1.2s infinite' }}>
                  🎙
                </div>
                <div style={{ fontSize:'13px', fontWeight:800, color:'#DC2626', marginBottom:'8px' }}>Listening...</div>

                <div style={{ background:'var(--dim)', borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', fontSize:'13px', color:'var(--text)', textAlign:'left', lineHeight:1.6, minHeight:'48px', wordBreak:'break-word' }}>
                  {speech.transcript || <span style={{ color:'var(--muted)' }}>Speak now — words appear here in real time</span>}
                </div>

                {speech.error && (
                  <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'8px', padding:'8px 12px', marginBottom:'10px', fontSize:'12px', color:'#DC2626', textAlign:'left' }}>
                    {speech.error}
                  </div>
                )}

                <button onClick={toggleMic}
                  style={{ width:'100%', background:'#1B2B4B', border:'none', borderRadius:'11px', color:'#fff', fontSize:'13px', fontWeight:700, padding:'12px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                  ⏹ Stop Recording
                </button>
              </div>
            )}

            {/* REVIEW */}
            {step === 'review' && parsed && (
              <div>
                <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:'6px' }}>You said:</div>
                <div style={{ background:'var(--dim)', borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', fontSize:'13px', color:'var(--text)', lineHeight:1.6, wordBreak:'break-word' }}>
                  "{parsed.rawText}"
                </div>

                {/* What was detected */}
                {(parsed.name || parsed.phone || parsed.address || parsed.dateTime || parsed.city) && (
                  <div style={{ background:'rgba(22,163,74,.06)', border:'1px solid rgba(22,163,74,.2)', borderRadius:'10px', padding:'10px 12px', marginBottom:'12px', fontSize:'12px', lineHeight:1.9 }}>
                    <div style={{ fontWeight:700, color:'#16A34A', marginBottom:'3px' }}>Detected:</div>
                    {parsed.name        && <div>👤 {parsed.name.first} {parsed.name.last}</div>}
                    {parsed.phone       && <div>📞 {parsed.phone}</div>}
                    {parsed.address     && <div>🏠 {parsed.address}</div>}
                    {parsed.city        && <div>📍 {parsed.city}</div>}
                    {parsed.dateTime?.dateLabel && <div>📅 {parsed.dateTime.dateLabel}{parsed.dateTime.time ? ' at ' + parsed.dateTime.time : ''}</div>}
                  </div>
                )}

                {/* Save options */}
                <div style={{ fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:'8px' }}>Save as:</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginBottom:'10px' }}>
                  {parsed.name && (
                    <button onClick={saveContact} disabled={saving}
                      style={saveOptBtn('#0EA5E9')}>
                      👤 Save as Contact{parsed.name.first ? ` — ${parsed.name.first}` : ''}
                      {parsed.phone ? ` · ${parsed.phone}` : ''}
                    </button>
                  )}
                  {(parsed.dateTime || parsed.intent === 'schedule') && (
                    <button onClick={saveSchedule} disabled={saving}
                      style={saveOptBtn('#16A34A')}>
                      📅 Save as Appointment{parsed.dateTime?.dateLabel ? ` — ${parsed.dateTime.dateLabel}` : ''}
                    </button>
                  )}
                  <button onClick={saveTask} disabled={saving}
                    style={saveOptBtn('#CC2200')}>
                    ✓ Save as Task{parsed.dateTime?.dateLabel ? ` — due ${parsed.dateTime.dateLabel}` : ''}
                  </button>
                  <button onClick={saveNote} disabled={saving}
                    style={saveOptBtn('#7C3AED')}>
                    📌 Save as Note
                  </button>
                </div>

                <button onClick={tryAgain}
                  style={{ width:'100%', background:'transparent', border:'1px solid var(--border)', borderRadius:'9px', color:'var(--muted)', fontSize:'12px', padding:'9px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                  🔄 Record Again
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(220,38,38,.5); }
          70%  { box-shadow: 0 0 0 14px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
      `}</style>
    </>
  )
}

function saveOptBtn(color) {
  return {
    width:'100%', background:color+'12', border:`1.5px solid ${color}30`,
    borderRadius:'9px', color, fontSize:'12px', fontWeight:700, padding:'10px 12px',
    cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', textAlign:'left',
  }
}
