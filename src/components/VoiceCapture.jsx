// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Voice Capture Component
// Floating draggable microphone button, accessible from every page.
// Records speech, parses it, and saves as contact/task/note.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { startRecording, parseVoiceWithAI } from '../lib/voice'
import { authFetch } from '../lib/apiAuth'
import { db } from '../lib/db'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function VoiceCapture() {
  const { agent } = useAuth()
  const { toast }  = useApp()

  const [open,    setOpen]    = useState(false)
  const [recording, setRecording] = useState(false)
  const [parsed,  setParsed]  = useState(null)
  const [step,    setStep]    = useState('idle') // idle | parsing | reviewing | done
  const [saving,  setSaving]  = useState(false)
  const [pos,     setPos]     = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('micPos') || 'null'); if (s && typeof s.x === 'number') return s } catch {}
    return { x: (typeof window !== 'undefined' ? window.innerWidth - 76 : 300), y: null }
  }) // default RIGHT side, saved per-user
  const recRef = useRef(null)
  const audioRec = useRef(null)
  const audioChunks = useRef([])
  const audioStream = useRef(null)
  const [audioBlob, setAudioBlob] = useState(null)
  const [liveText, setLiveText] = useState('')
  const dragging = useRef(false)
  const dragStart = useRef(null)
  const lastTouch = useRef(0)

  // ── DRAG (mouse + touch) ──────────────────────────────────────
  function getPoint(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }
  function onMouseDown(e) {
    // On touch, the browser also fires synthetic mouse events ~300ms
    // later — ignore those so we don't toggle twice (open then close).
    if (e.type === 'touchstart') lastTouch.current = Date.now()
    else if (Date.now() - (lastTouch.current || 0) < 700) return
    dragging.current = false
    const p = getPoint(e)
    dragStart.current = { x: p.x, y: p.y, px: pos.x ?? 24, py: pos.y ?? (window.innerHeight - 70) }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onMouseMove, { passive: false })
    window.addEventListener('touchend', onMouseUp)
  }

  function onMouseMove(e) {
    const p = getPoint(e)
    const dx = p.x - dragStart.current.x
    const dy = p.y - dragStart.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging.current = true
    if (dragging.current) {
      if (e.cancelable) e.preventDefault()   // stop page scroll while dragging on touch
      setPos({ x: Math.max(20, Math.min(window.innerWidth - 60, dragStart.current.px + dx)), y: Math.max(20, Math.min(window.innerHeight - 60, dragStart.current.py + dy)) })
    }
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('touchmove', onMouseMove)
    window.removeEventListener('touchend', onMouseUp)
    if (!dragging.current) { toggleOpen(); return }
    // Snap to whichever side is nearest, then persist per-user.
    setPos(p => {
      const snapped = { x: (p.x + 30) < window.innerWidth / 2 ? 24 : window.innerWidth - 76, y: p.y }
      try { localStorage.setItem('micPos', JSON.stringify(snapped)) } catch {}
      return snapped
    })
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
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  }

  function startRecord() {
    setRecording(true)
    setParsed(null)
    setStep('idle')
    setAudioBlob(null)
    setLiveText('')
    audioChunks.current = []
    let browserTranscript = ''

    // Primary path: record real audio → Whisper (reliable, handles
    // Yiddish/English). Browser speech is used only for live on-screen
    // feedback and as a fallback if Whisper is unavailable.
    navigator.mediaDevices?.getUserMedia?.({ audio: true }).then(stream => {
      audioStream.current = stream
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = e => { if (e.data.size) audioChunks.current.push(e.data) }
      mr.onstop = async () => {
        audioStream.current?.getTracks().forEach(t => t.stop())
        const blob = audioChunks.current.length ? new Blob(audioChunks.current, { type: 'audio/webm' }) : null
        if (blob) setAudioBlob(blob)
        setRecording(false)
        setStep('parsing')
        try {
          let transcript = ''
          // Whisper first
          if (blob) {
            try {
              const b64 = await blobToBase64(blob)
              const r = await authFetch('/api/transcribe', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBase64: b64, mimeType: 'audio/webm' }),
              })
              const j = await r.json()
              if (r.ok && j.text) transcript = j.text
            } catch (e) { /* fall back to browser transcript */ }
          }
          if (!transcript) transcript = browserTranscript
          if (!transcript || !transcript.trim()) {
            toast('Didn\'t catch anything — try again', '#F59E0B'); setStep('idle'); return
          }
          setLiveText(transcript)
          const { data: { session } } = await supabase.auth.getSession()
          const authHeaders = session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}
          const result = await parseVoiceWithAI(transcript, authHeaders)
          setParsed(result)
          setStep('reviewing')
        } catch (e) {
          toast('Could not process — please try again', '#DC2626')
          setStep('idle')
        }
      }
      mr.start(); audioRec.current = mr
    }).catch(() => {
      toast('Microphone access needed — allow it in your browser settings', '#DC2626')
      setRecording(false)
    })

    // Browser speech recognition — live feedback + fallback text only.
    recRef.current = startRecording(
      (transcript) => { browserTranscript = transcript; try { audioRec.current?.stop() } catch {} },
      (err) => { /* browser engine failing is OK — Whisper is primary. Just stop audio. */
        if (audioRec.current && audioRec.current.state !== 'inactive') { try { audioRec.current.stop() } catch {} }
      },
      {
        silenceMs: 6000,
        onInterim: (txt) => setLiveText(txt),
      }
    )
  }

  function stopRecord() {
    // Stopping the audio recorder triggers transcription in mr.onstop
    try { recRef.current?.stop?.() } catch {}
    try { audioRec.current?.stop() } catch {}
  }

  // Upload the captured audio and attach it to a record via the notes
  // table pattern (audio_url). Returns { audio_url, audio_path } or {}.
  async function uploadAudioFor(recordType, recordId) {
    if (!audioBlob || !recordId) return {}
    try {
      const { uploadFile } = await import('../lib/storage')
      const file = new File([audioBlob], recordType + '-' + recordId + '.webm', { type: 'audio/webm' })
      const up = await uploadFile(file, recordType, recordId)
      return { audio_url: up.url, audio_path: up.path }
    } catch (e) { console.warn('audio upload:', e.message); return {} }
  }

  // ── SAVE AS CONTACT ───────────────────────────────────────────
  async function saveAsContact() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as an agent', '#DC2626'); return }
    setSaving(true)
    try {
      const interest = parsed.address || parsed.interest || ''
      const created = await db.contacts.create({
        first_name: parsed.name?.first || 'Voice Lead',
        last_name:  parsed.name?.last  || '',
        phone:      parsed.phone       || '',
        email:      parsed.email       || '',
        address:    parsed.address     || '',
        // Capture the property they were interested in on the contact
        property_interest: interest || null,
        notes:      (parsed.aiParsed ? parsed.notes : parsed.rawText)
                    + (interest ? '\n\nInterested in: ' + interest : '')
                    + '\n\n⚠️ Needs full profile — added by voice capture.',
        source:     'Voice Capture',
        status:     'New',
        agent_id:   agent.id,
      })
      const contactId = created?.id || created?.[0]?.id
      const leadName = ((parsed.name?.first || 'Voice') + ' ' + (parsed.name?.last || 'Lead')).trim()

      // Save the actual recording + transcript, linked to this contact
      try {
        const au = await uploadAudioFor('contact', contactId)
        if (au.audio_url || parsed.rawText) {
          await supabase.from('notes').insert({
            agent_id: agent.id, title: '🎤 Voice capture — ' + leadName,
            body: parsed.aiParsed ? parsed.notes : parsed.rawText,
            transcript: parsed.rawText || null,
            audio_url: au.audio_url || null, audio_path: au.audio_path || null,
            linked_type: 'contact', linked_id: contactId,
          })
        }
      } catch (e) { console.warn('voice note attach:', e.message) }

      // Follow-up task LINKED to the contact (clicking it opens the contact)
      try {
        await db.tasks.create({
          title: 'Complete new lead profile — ' + leadName + (parsed.phone ? ' (' + parsed.phone + ')' : ''),
          agent_id: agent.id, created_by: agent.id, contact_id: contactId,
          due_date: new Date(Date.now() + 86400000).toISOString().slice(0,10),
          priority: 'high', status: 'pending',
          notes: 'Add email, phone, and details.' + (interest ? ' Interested in: ' + interest : ''),
        })
      } catch (e) { console.warn('task link:', e.message) }

      // Email the agent about the new lead + what to finish
      try {
        if (agent.email) {
          await authFetch('/api/send-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: agent.email,
              subject: '🎤 New voice lead: ' + leadName,
              html: '<div style="font-family:Arial,sans-serif;max-width:520px">' +
                '<h2 style="color:#0F172A">New lead captured by voice</h2>' +
                '<p><b>' + leadName + '</b>' + (parsed.phone ? ' · ' + parsed.phone : '') + '</p>' +
                (interest ? '<p>Interested in: <b>' + interest + '</b></p>' : '') +
                '<p style="color:#64748B">Please add their email, phone, and full details.</p>' +
                '<p><a href="https://app.targetreteam.com/contacts/' + contactId + '/detail" style="background:#CC2200;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open contact to finish →</a></p>' +
                '</div>',
            }),
          })
        }
      } catch (e) { console.warn('agent email:', e.message) }

      toast('✅ Lead saved — task + email sent to finish the profile', '#10B981')
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
      const t = await db.tasks.create({
        title:         parsed.title || parsed.rawText.slice(0, 100),
        agent_id:      agent.id,
        created_by:    agent.id,
        due_date:      parsed.date || null,
        reminder_days: parsed.reminderDays || null,
        priority:      'normal',
        status:        'pending',
        notes:         parsed.aiParsed ? parsed.notes : parsed.rawText,
      })
      const taskId = t?.id || t?.[0]?.id
      try {
        const au = await uploadAudioFor('task', taskId)
        if (au.audio_url) await supabase.from('notes').insert({
          agent_id: agent.id, title: '🎤 Voice recording for task',
          body: parsed.aiParsed ? parsed.notes : parsed.rawText, transcript: parsed.rawText || null,
          audio_url: au.audio_url, audio_path: au.audio_path, linked_type: 'task', linked_id: taskId,
        })
      } catch (e) { console.warn('task audio:', e.message) }
      toast('✅ Task saved' + (parsed.reminderDays ? ' — reminder set for ' + parsed.reminderDays + ' day' + (parsed.reminderDays > 1 ? 's' : '') + ' before' : ''), '#10B981')
      setStep('done')
    } catch(e) {
      toast('Save failed: ' + (e.message || JSON.stringify(e)), '#DC2626')
    } finally { setSaving(false) }
  }

  // ── SAVE AS NOTE ───────────────────────────────────────────────
  // Saved to the real notes table (Notepad) with the audio recording
  // + transcript, so the agent can replay it later.
  async function saveAsNote() {
    if (!parsed) return
    if (!agent?.id) { toast('Not logged in as an agent', '#DC2626'); return }
    setSaving(true)
    try {
      const { data: n, error } = await supabase.from('notes').insert({
        agent_id: agent.id,
        title: parsed.title || '🎤 Voice note',
        body: parsed.aiParsed ? parsed.notes : parsed.rawText,
        transcript: parsed.rawText || null,
      }).select().single()
      if (error) throw error
      try {
        const au = await uploadAudioFor('note', n.id)
        if (au.audio_url) await supabase.from('notes').update({ audio_url: au.audio_url, audio_path: au.audio_path }).eq('id', n.id)
      } catch (e) { console.warn('note audio:', e.message) }
      toast('✅ Note saved to your Notepad', '#10B981')
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
      const ev = await db.calendar.create({
        title:      parsed.title || parsed.rawText.slice(0, 100),
        agent_id:   agent.id,
        start_date: parsed.date || new Date().toISOString().slice(0, 10),
        start_time: parsed.eventTime || null,
        type:       'event',
      })
      const evId = ev?.id || ev?.[0]?.id
      try {
        const au = await uploadAudioFor('event', evId)
        if (au.audio_url) await supabase.from('notes').insert({
          agent_id: agent.id, title: '🎤 Voice recording for event',
          body: parsed.aiParsed ? parsed.notes : parsed.rawText, transcript: parsed.rawText || null,
          audio_url: au.audio_url, audio_path: au.audio_path, linked_type: 'event', linked_id: evId,
        })
      } catch (e) { console.warn('event audio:', e.message) }
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
    left:   pos.x,
    bottom: pos.y === null ? 24 : undefined,
    top:    pos.y !== null ? pos.y : undefined,
    width:     64, height: 64,
    borderRadius: '50%',
    background:  recording ? '#DC2626' : '#CC2200',
    border:      'none',
    color:       '#fff',
    fontSize:    '28px',
    cursor:      'grab',
    zIndex:      900,
    boxShadow:   '0 4px 16px rgba(204,34,0,.4)',
    display:     'flex',
    alignItems:  'center',
    justifyContent: 'center',
    userSelect:  'none',
    touchAction: 'none',
    animation:   recording ? 'pulse 1s infinite' : 'none',
  }

  return (
    <>
      {/* Floating Button */}
      <div onMouseDown={onMouseDown} onTouchStart={onMouseDown} style={btnStyle} title="Voice Capture">
        {recording ? '⏹' : '🎙'}
      </div>

      {/* Panel — always positioned fully on-screen. Opens leftward if the
          button is on the right half so it never overflows off-screen. */}
      {open && (() => {
        const PANEL_W = 340
        const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024
        const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768
        const bx = pos.x !== null && pos.x !== undefined ? pos.x : 24
        const openLeft = (bx + PANEL_W + 20) > vw
        const panelLeft = openLeft
          ? Math.max(12, bx + 52 - PANEL_W)
          : Math.min(bx, vw - PANEL_W - 12)
        const panelTop = (pos.y !== null && pos.y !== undefined)
          ? Math.max(12, Math.min(pos.y - 360, vh - 420))
          : undefined
        return (
        <div style={{ position: 'fixed', left: panelLeft, bottom: pos.y !== null ? undefined : 86, top: panelTop, width: PANEL_W, background: 'var(--panel)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)', zIndex: 899, fontFamily: ff, overflow: 'hidden' }}>

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
                  Tap the mic to record a lead, task, note, or reminder.
                </div>
                <button onClick={recording ? stopRecord : startRecord}
                  style={{ width: '70px', height: '70px', borderRadius: '50%', background: recording ? '#DC2626' : '#CC2200', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(204,34,0,.3)', animation: recording ? 'pulse 1s infinite' : 'none' }}>
                  {recording ? '⏹' : '🎙'}
                </button>
                {recording && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ color: '#DC2626', fontSize: '12px', fontWeight: 700 }}>● Listening… <span style={{ color:'var(--muted)', fontWeight:400 }}>(auto-stops after a pause, or tap ⏹)</span></div>
                    {liveText
                      ? <div style={{ marginTop:8, padding:'8px 10px', background:'var(--dim)', borderRadius:8, fontSize:13, color:'var(--text)', textAlign:'left' }}>{liveText}</div>
                      : <div style={{ marginTop:8, fontSize:12, color:'var(--muted)' }}>Say something…</div>}
                  </div>
                )}
              </div>
            )}

            {/* Step: parsing (waiting on AI) */}
            {step === 'parsing' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>🤔</div>
                <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Understanding what you said...</div>
              </div>
            )}

            {/* Step: reviewing */}
            {step === 'reviewing' && parsed && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>You Said:</div>
                <div style={{ background: 'var(--dim)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text)', marginBottom: '12px', fontStyle: 'italic' }}>
                  "{parsed.rawText}"
                </div>

                {(parsed.hasName || parsed.hasPhone || parsed.hasAddress || parsed.hasDate || parsed.email || parsed.reminderDays) && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', marginBottom: '6px' }}>Detected:</div>
                    {parsed.hasName && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>👤 {parsed.name.first} {parsed.name.last}</div>}
                    {parsed.hasPhone && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>📞 {parsed.phone}</div>}
                    {parsed.email && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>✉️ {parsed.email}</div>}
                    {parsed.hasAddress && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>📍 {parsed.address}</div>}
                    {parsed.hasDate && <div style={{ fontSize: '12px', color: '#166534', marginBottom: '3px' }}>📅 {parsed.date}{parsed.eventTime ? ' at ' + parsed.eventTime : ''}</div>}
                    {parsed.reminderDays && <div style={{ fontSize: '12px', color: '#166534' }}>⏰ Remind {parsed.reminderDays} day{parsed.reminderDays > 1 ? 's' : ''} before</div>}
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
                    ✅ Save as Task{parsed.hasDate ? ' — due ' + parsed.date : ''}
                  </button>
                  {parsed.hasDate && (
                    <button onClick={saveAsEvent} disabled={saving}
                      style={{ padding: '10px 14px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', color: '#6D28D9', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: ff }}>
                      📅 Save as Calendar Event — {parsed.date}{parsed.eventTime ? ' ' + parsed.eventTime : ''}
                    </button>
                  )}
                  <button onClick={saveAsNote} disabled={saving}
                    style={{ padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: ff }}>
                    📝 Save as Note
                  </button>
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
        )
      })()}
    </>
  )
}
