import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { parseVoice } from '../lib/voiceParser'
import { createContact } from '../lib/db/contacts'
import { createTask } from '../lib/db/tasks'

// ── SIMPLE RELIABLE SPEECH HOOK ───────────────────────────────
function useSpeech() {
  const [listening, setListening]   = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError]           = useState('')
  const srRef = useRef(null)
  const finalRef = useRef('')

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Voice not supported — use Chrome or Safari'); return }

    finalRef.current = ''
    setTranscript('')
    setError('')

    const r = new SR()
    r.lang            = 'en-US'
    r.continuous      = false   // single utterance — most reliable on mobile
    r.interimResults  = true
    r.maxAlternatives = 1

    r.onstart  = () => setListening(true)

    r.onresult = e => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
      }
      setTranscript(text)
      if (e.results[e.results.length - 1].isFinal) {
        finalRef.current = text
      }
    }

    r.onerror = e => {
      setListening(false)
      if (e.error === 'not-allowed') setError('Microphone blocked. Allow mic access in browser settings and try again.')
      else if (e.error === 'no-speech') setError('Nothing heard. Speak louder and try again.')
      else if (e.error !== 'aborted') setError('Error: ' + e.error)
    }

    r.onend = () => {
      setListening(false)
      srRef.current = null
    }

    srRef.current = r
    try { r.start() } catch(e) { setError('Could not start microphone: ' + e.message) }
  }

  function stop() {
    if (srRef.current) {
      try { srRef.current.stop() } catch(e) {}
      srRef.current = null
    }
    setListening(false)
  }

  function reset() {
    stop()
    setTranscript('')
    setError('')
    finalRef.current = ''
  }

  return { listening, transcript, error, supported, start, stop, reset, getFinal: () => finalRef.current || transcript }
}

// ── FLOATING VOICE BUTTON + PANEL ─────────────────────────────
export function VoiceCapture() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const speech = useSpeech()

  const [open, setOpen]       = useState(false)
  const [step, setStep]       = useState('idle') // idle | recording | review | done
  const [parsed, setParsed]   = useState(null)
  const [saving, setSaving]   = useState(false)

  // Draggable position
  const [pos, setPos]         = useState({ x: null, y: null }) // null = use default CSS
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const btnRef = useRef()

  // When recognition ends naturally, process result
  useEffect(() => {
    if (!speech.listening && step === 'recording') {
      const text = speech.getFinal()
      if (text.trim()) {
        const result = parseVoice(text)
        setParsed({ ...result, rawText: text })
        setStep('review')
      } else {
        setStep('idle')
      }
    }
  }, [speech.listening])

  function handleMicPress() {
    if (!speech.supported) {
      toast('Voice not supported in this browser. Use Chrome on Android or Safari on iPhone.', '#DC2626')
      return
    }
    if (step === 'idle' || step === 'done') {
      setParsed(null)
      setStep('recording')
      speech.start()
    } else if (step === 'recording') {
      speech.stop()
      // useEffect above will handle processing
    }
  }

  async function saveAsContact() {
    if (!parsed) return
    if (!agent?.id) {
      toast('Not logged in as an agent. Please log out and log back in.', '#DC2626')
      return
    }
    setSaving(true)
    try {
      await createContact({
        first_name:   parsed.name.first || 'Voice Lead',
        last_name:    parsed.name.last  || '',
        phone:        parsed.phone      || '',
        source:       'Voice Capture',
        agent_id:     agent.id,
      })
      toast('✅ Contact saved!')
      setStep('done')
    } catch(e) {
      const msg = e?.message || e?.error_description || JSON.stringify(e) || 'Unknown error'
      toast('Contact save failed: ' + msg, '#DC2626')
      console.error('Voice save error:', e)
    } finally { setSaving(false) }
  }

  async function saveAsTask() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as agent','#DC2626'); return }
    setSaving(true)
    try {
      await createTask({
        title:      parsed.rawText.slice(0, 200),
        priority:   'normal',
        status:     'pending',
        due_date:   parsed.dateTime?.date || null,
        agent_id:   agent?.id,
        created_by: agent?.id,
      })
      toast('✅ Task saved!')
      setStep('done')
    } catch(e) { toast('Error: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function saveAsNote() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as agent','#DC2626'); return }
    setSaving(true)
    try {
      await createTask({
        title:      parsed.rawText.slice(0, 200),
        priority:   'note',
        status:     'pinned',
        agent_id:   agent?.id,
        created_by: agent?.id,
      })
      toast('✅ Note saved!')
      setStep('done')
    } catch(e) { toast('Error: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  function tryAgain() {
    speech.reset()
    setParsed(null)
    setStep('idle')
  }

  // Drag handlers
  function onDragStart(e) {
    dragging.current = true
    const touch = e.touches ? e.touches[0] : e
    const rect = btnRef.current.getBoundingClientRect()
    dragOffset.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    e.preventDefault()
  }
  function onDragMove(e) {
    if (!dragging.current) return
    const touch = e.touches ? e.touches[0] : e
    const newX = touch.clientX - dragOffset.current.x
    const newY = touch.clientY - dragOffset.current.y
    // Keep within viewport
    const maxX = window.innerWidth  - 64
    const maxY = window.innerHeight - 64
    setPos({ x: Math.max(0, Math.min(newX, maxX)), y: Math.max(0, Math.min(newY, maxY)) })
    e.preventDefault()
  }
  function onDragEnd() { dragging.current = false }

  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup',  onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive: false })
    window.addEventListener('touchend',  onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup',  onDragEnd)
      window.removeEventListener('touchmove', onDragMove)
      window.removeEventListener('touchend',  onDragEnd)
    }
  }, [])

  const btnStyle = {
    position:   'fixed',
    right:      pos.x !== null ? 'auto' : '20px',
    bottom:     pos.y !== null ? 'auto' : '80px',
    left:       pos.x !== null ? pos.x + 'px' : 'auto',
    top:        pos.y !== null ? pos.y + 'px' : 'auto',
    width:      '60px',
    height:     '60px',
    borderRadius: '50%',
    background: step === 'recording'
      ? 'linear-gradient(135deg,#DC2626,#991B1B)'
      : 'linear-gradient(135deg,#CC2200,#E8650A)',
    border:     'none',
    boxShadow:  step === 'recording'
      ? '0 0 0 8px rgba(220,38,38,.2), 0 8px 24px rgba(220,38,38,.4)'
      : '0 4px 20px rgba(204,34,0,.4)',
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor:     'grab',
    zIndex:     9998,
    transition: 'box-shadow .3s',
    animation:  step === 'recording' ? 'pulse 1.2s infinite' : 'none',
    touchAction: 'none',
  }

  return (
    <>
      {/* Floating mic button */}
      <button
        ref={btnRef}
        style={btnStyle}
        onClick={e => { if (!dragging.current) { setOpen(o => !o); if (step === 'recording') speech.stop() } }}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        title="Voice capture — tap to record"
      >
        <span style={{ fontSize: '26px', userSelect: 'none' }}>
          {step === 'recording' ? '⏹' : '🎙'}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          right: pos.x !== null ? 'auto' : '90px',
          bottom: pos.y !== null ? 'auto' : '80px',
          left: pos.x !== null ? Math.max(0, pos.x - 320) + 'px' : 'auto',
          top: pos.y !== null ? pos.y + 'px' : 'auto',
          width: '320px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 8px 40px rgba(0,0,0,.2)',
          zIndex: 9997,
          overflow: 'hidden',
          fontFamily: 'Inter,system-ui,sans-serif',
        }}>
          {/* Header */}
          <div style={{ padding: '13px 16px', background: 'linear-gradient(135deg,#CC2200,#E8650A)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>🎙 Voice Capture</div>
            <button onClick={() => { setOpen(false); if (step === 'recording') speech.stop() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.7)', fontSize: '18px' }}>✕</button>
          </div>

          <div style={{ padding: '16px' }}>

            {/* IDLE — ready to record */}
            {(step === 'idle' || step === 'done') && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎙</div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
                  {step === 'done' ? '✅ Saved!' : 'Ready to record'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                  Tap the red mic button and say anything —<br/>
                  a name, address, task, or note
                </div>
                <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '11px', color: 'var(--muted)', textAlign: 'left', lineHeight: 1.8 }}>
                  <strong style={{ color: 'var(--text)' }}>Examples:</strong><br/>
                  "John Smith 845-555-1234 from Monsey"<br/>
                  "Follow up with Lazer tomorrow"<br/>
                  "Schedule showing at 47 Prairie Ave Friday 2pm"<br/>
                  "Note: client wants 4 beds under 800k"
                </div>
                <button onClick={handleMicPress}
                  style={{ width: '100%', background: 'linear-gradient(135deg,#CC2200,#E8650A)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, padding: '13px', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
                  🎙 Start Recording
                </button>
              </div>
            )}

            {/* RECORDING */}
            {step === 'recording' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(220,38,38,.1)', border: '3px solid #DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '32px', animation: 'pulse 1.2s infinite' }}>
                  🎙
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#DC2626', marginBottom: '8px' }}>
                  Listening...
                </div>
                {speech.transcript && (
                  <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '13px', color: 'var(--text)', textAlign: 'left', lineHeight: 1.6, minHeight: '40px' }}>
                    {speech.transcript}
                  </div>
                )}
                {!speech.transcript && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                    Speak clearly — it will appear here
                  </div>
                )}
                {speech.error && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#DC2626' }}>
                    {speech.error}
                  </div>
                )}
                <button onClick={handleMicPress}
                  style={{ width: '100%', background: '#1B2B4B', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '12px', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
                  ⏹ Stop Recording
                </button>
              </div>
            )}

            {/* REVIEW */}
            {step === 'review' && parsed && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '8px' }}>You said:</div>
                <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                  "{parsed.rawText}"
                </div>

                {/* Detected info */}
                {(parsed.name.first || parsed.phone || parsed.addresses?.[0] || parsed.dateTime?.date) && (
                  <div style={{ background: 'rgba(22,163,74,.06)', border: '1px solid rgba(22,163,74,.2)', borderRadius: '10px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px', lineHeight: 1.8 }}>
                    <div style={{ fontWeight: 700, color: '#16A34A', marginBottom: '4px' }}>Detected:</div>
                    {parsed.name.first && <div>👤 {parsed.name.first} {parsed.name.last}</div>}
                    {parsed.phone      && <div>📞 {parsed.phone}</div>}
                    {parsed.addresses?.[0] && <div>🏠 {parsed.addresses[0]}</div>}
                    {parsed.dateTime?.dateLabel && <div>📅 {parsed.dateTime.dateLabel}{parsed.dateTime.time ? ' at ' + parsed.dateTime.time : ''}</div>}
                  </div>
                )}

                {/* Save options */}
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '8px' }}>Save as:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '10px' }}>
                  {parsed.name.first && (
                    <button onClick={saveAsContact} disabled={saving}
                      style={actionBtn('#0EA5E9')}>
                      👤 Save as Contact {parsed.name.first && `— ${parsed.name.first} ${parsed.name.last}`}
                    </button>
                  )}
                  <button onClick={saveAsTask} disabled={saving}
                    style={actionBtn('#CC2200')}>
                    ✓ Save as Task{parsed.dateTime?.dateLabel ? ` — due ${parsed.dateTime.dateLabel}` : ''}
                  </button>
                  <button onClick={saveAsNote} disabled={saving}
                    style={actionBtn('#7C3AED')}>
                    📌 Save as Note
                  </button>
                </div>
                <button onClick={tryAgain}
                  style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: '9px', color: 'var(--muted)', fontSize: '12px', padding: '9px', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
                  🔄 Record Again
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(220,38,38,.4), 0 8px 24px rgba(220,38,38,.4) }
          70%  { box-shadow: 0 0 0 14px rgba(220,38,38,0), 0 8px 24px rgba(220,38,38,.2) }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0), 0 8px 24px rgba(220,38,38,.4) }
        }
      `}</style>
    </>
  )
}

function actionBtn(color) {
  return {
    width: '100%',
    background: color + '12',
    border: `1.5px solid ${color}30`,
    borderRadius: '9px',
    color: color,
    fontSize: '12px',
    fontWeight: 700,
    padding: '10px 12px',
    cursor: 'pointer',
    fontFamily: 'Inter,system-ui,sans-serif',
    textAlign: 'left',
  }
}
