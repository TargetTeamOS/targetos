// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Voice Capture Component
// Floating draggable microphone button, accessible from every page.
// Records speech, parses it, and saves as contact/task/note.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { startRecording, parseVoice } from '../lib/voice'
import { db } from '../lib/db'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function VoiceCapture() {
  const { agent } = useAuth()
  const { toast }  = useApp()

  const [open,    setOpen]    = useState(false)
  const [recording, setRecording] = useState(false)
  const [parsed,  setParsed]  = useState(null)
  const [step,    setStep]    = useState('idle') // idle | reviewing | done
  const [saving,  setSaving]  = useState(false)
  const [pos,     setPos]     = useState({ x: null, y: null }) // null = bottom-right default
  const recRef = useRef(null)
  const dragging = useRef(false)
  const dragStart = useRef(null)

  // ── DRAG ──────────────────────────────────────────────────────
  function onMouseDown(e) {
    dragging.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x || window.innerWidth - 70, py: pos.y || window.innerHeight - 70 }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e) {
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging.current = true
    if (dragging.current) {
      setPos({ x: Math.max(20, Math.min(window.innerWidth - 60, dragStart.current.px + dx)), y: Math.max(20, Math.min(window.innerHeight - 60, dragStart.current.py + dy)) })
    }
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    if (!dragging.current) toggleOpen()
  }

  function toggleOpen() {
    if (open) { setOpen(false); setStep('idle'); setParsed(null); return }
    // Check browser support before opening
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      toast('Voice capture requires Chrome or Edge browser with microphone permission.', '#F5A623')
      return
    }
    setOpen(true)
  }

  // ── RECORD ────────────────────────────────────────────────────
  function startRecord() {
    setRecording(true)
    setParsed(null)
    setStep('idle')
    recRef.current = startRecording(
      (transcript, result) => {
        setRecording(false)
        setParsed(result)
        setStep('reviewing')
      },
      (err) => {
        setRecording(false)
        toast('Mic error: ' + err, '#DC2626')
      }
    )
  }

  function stopRecord() {
    recRef.current?.stop?.()
    setRecording(false)
  }

  // ── SAVE AS CONTACT ───────────────────────────────────────────
  async function saveAsContact() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as an agent', '#DC2626'); return }
    setSaving(true)
    try {
      await db.contacts.create({
        first_name: parsed.name?.first || 'Voice Lead',
        last_name:  parsed.name?.last  || '',
        phone:      parsed.phone       || '',
        source:     'Voice Capture',
        agent_id:   agent.id,
      })
      toast('✅ Contact saved — ' + (parsed.name?.first || 'Lead'), '#10B981')
      setStep('done')
    } catch(e) {
      toast('Save failed: ' + (e.message || JSON.stringify(e)), '#DC2626')
    } finally { setSaving(false) }
  }

  // ── SAVE AS TASK ──────────────────────────────────────────────
  async function saveAsTask() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as an agent', '#DC2626'); return }
    setSaving(true)
    try {
      await db.tasks.create({
        title:      parsed.rawText.slice(0, 100),
        agent_id:   agent.id,
        created_by: agent.id,
        due_date:   parsed.date || null,
        priority:   'normal',
        status:     'pending',
        notes:      parsed.rawText,
      })
      toast('✅ Task saved', '#10B981')
      setStep('done')
    } catch(e) {
      toast('Save failed: ' + (e.message || JSON.stringify(e)), '#DC2626')
    } finally { setSaving(false) }
  }

  // ── SAVE AS CALENDAR EVENT ────────────────────────────────────
  async function saveAsEvent() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as an agent', '#DC2626'); return }
    setSaving(true)
    try {
      await db.calendar.create({
        title:      parsed.rawText.slice(0, 100),
        agent_id:   agent.id,
        start_date: parsed.date || new Date().toISOString().slice(0, 10),
        type:       'event',
      })
      toast('✅ Event saved', '#10B981')
      setStep('done')
    } catch(e) {
      toast('Save failed: ' + (e.message || JSON.stringify(e)), '#DC2626')
    } finally { setSaving(false) }
  }

  const btnX = pos.x !== null ? pos.x : undefined
  const btnY = pos.y !== null ? pos.y : undefined
  const btnStyle = {
    position:  'fixed',
    right:     btnX !== undefined ? undefined : '24px',
    bottom:    btnY !== undefined ? undefined : '88px',
    left:      btnX !== undefined ? (btnX) + "px" : undefined,
    top:       btnY !== undefined ? (btnY) + "px" : undefined,
    width:     52, height: 52,
    borderRadius: '50%',
    background:  recording ? '#DC2626' : '#CC2200',
    border:      'none',
    color:       '#fff',
    fontSize:    '22px',
    cursor:      'grab',
    zIndex:      900,
    boxShadow:   '0 4px 16px rgba(204,34,0,.4)',
    display:     'flex',
    alignItems:  'center',
    justifyContent: 'center',
    userSelect:  'none',
    animation:   recording ? 'pulse 1s infinite' : 'none',
  }

  return (
    <>
      {/* Floating Button */}
      <div onMouseDown={onMouseDown} style={btnStyle} title="Voice Capture">
        {recording ? '⏹' : '🎙'}
      </div>

      {/* Panel */}
      {open && (
        <div style={{ position: 'fixed', right: 24, bottom: 88, width: 340, background: 'var(--panel)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)', zIndex: 899, fontFamily: ff, overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ background: '#CC2200', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>🎙 Voice Capture</div>
            <button onClick={toggleOpen} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
          </div>

          <div style={{ padding: '16px' }}>

            {/* Step: idle */}
            {step === 'idle' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                  Tap the mic to record a lead, task, or note.
                </div>
                <button onClick={recording ? stopRecord : startRecord}
                  style={{ width: '70px', height: '70px', borderRadius: '50%', background: recording ? '#DC2626' : '#CC2200', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(204,34,0,.3)', animation: recording ? 'pulse 1s infinite' : 'none' }}>
                  {recording ? '⏹' : '🎙'}
                </button>
                {recording && <div style={{ marginTop: '12px', color: '#DC2626', fontSize: '12px', fontWeight: 600 }}>Listening...</div>}
              </div>
            )}

            {/* Step: reviewing */}
            {step === 'reviewing' && parsed && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>You Said:</div>
                <div style={{ background: 'var(--dim)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text)', marginBottom: '12px', fontStyle: 'italic' }}>
                  "{parsed.rawText}"
                </div>

                {(parsed.hasName || parsed.hasPhone || parsed.hasAddress || parsed.hasDate) && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', marginBottom: '6px' }}>Detected:</div>
                    {parsed.hasName && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>👤 {parsed.name.first} {parsed.name.last}</div>}
                    {parsed.hasPhone && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>📞 {parsed.phone}</div>}
                    {parsed.hasAddress && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>📍 {parsed.address}</div>}
                    {parsed.hasDate && <div style={{ fontSize: '12px', color: '#166534' }}>📅 {parsed.date}</div>}
                  </div>
                )}

                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Save As:</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={saveAsContact} disabled={saving}
                    style={{ padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', color: '#1D4ED8', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: ff }}>
                    👤 Save as Contact{parsed.hasName ? ` — ${parsed.name.first} ${parsed.name.last}` : ''}
                  </button>
                  <button onClick={saveAsTask} disabled={saving}
                    style={{ padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', color: '#C2410C', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: ff }}>
                    ✅ Save as Task
                  </button>
                  {parsed.hasDate && (
                    <button onClick={saveAsEvent} disabled={saving}
                      style={{ padding: '10px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', color: '#6D28D9', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: ff }}>
                      📅 Save as Calendar Event — {parsed.date}
                    </button>
                  )}
                </div>

                <button onClick={() => { setStep('idle'); setParsed(null) }}
                  style={{ width: '100%', marginTop: '10px', padding: '9px', background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontFamily: ff }}>
                  🔄 Record Again
                </button>
              </div>
            )}

            {/* Step: done */}
            {step === 'done' && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>Saved!</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>Record another or close.</div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button onClick={() => { setStep('idle'); setParsed(null) }}
                    style={{ padding: '8px 16px', background: '#CC2200', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                    🎙 Record Again
                  </button>
                  <button onClick={toggleOpen}
                    style={{ padding: '8px 16px', background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', fontFamily: ff }}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
