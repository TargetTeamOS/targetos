import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { nowISO } from '../lib/time'
import { logChange } from '../lib/activityLog'

// ── HELPERS ────────────────────────────────────────────────────
function extractPhone(text) {
  const clean = text.replace(/\s+/g,' ')
  // Match various phone patterns
  const m = clean.match(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}|\d{10,11})/g)
  if(!m) return null
  const digits = m[0].replace(/\D/g,'')
  if(digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if(digits.length === 11 && digits[0]==='1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return m[0]
}

function extractName(text, phone) {
  // Remove phone from text
  const noPhone = text.replace(/\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g,'').replace(/\d{10,11}/g,'')
  // Remove common filler words
  const cleaned = noPhone
    .replace(/\b(my name is|i am|this is|name|phone|number|number is|call me|it's|its|hi|hey|hello|the|a|and|or|with)\b/gi,'')
    .replace(/[^a-zA-Z\s]/g,'')
    .trim()
    .replace(/\s+/g,' ')

  const words = cleaned.split(' ').filter(w=>w.length>1)
  if(words.length === 0) return { first:'', last:'' }
  if(words.length === 1) return { first: cap(words[0]), last:'' }
  // Try to find first + last
  return { first: cap(words[0]), last: cap(words[words.length-1]) }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }

// ── COMPONENT ──────────────────────────────────────────────────
export function VoiceContactCapture({ onSaved, onClose, compact=false }) {
  const { state, toast } = useApp()
  const [stage, setStage] = useState('idle') // idle | recording | processing | review | saving | done
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [extracted, setExtracted] = useState({ first:'', last:'', phone:'', notes:'' })
  const [error, setError] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if(!SR) setSupported(false)
    return () => {
      if(recognitionRef.current) recognitionRef.current.stop()
      clearInterval(timerRef.current)
    }
  }, [])

  function startRecording() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if(!SR) { setError('Voice recognition not supported on this browser. Try Chrome.'); return }

    setError(''); setTranscript(''); setInterimText(''); setRecordingTime(0)
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    let finalTranscript = ''

    recognition.onstart = () => {
      setStage('recording')
      timerRef.current = setInterval(() => setRecordingTime(t => t+1), 1000)
    }

    recognition.onresult = (e) => {
      let interim = ''
      for(let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if(result.isFinal) finalTranscript += result[0].transcript + ' '
        else interim += result[0].transcript
      }
      setTranscript(finalTranscript)
      setInterimText(interim)
    }

    recognition.onerror = (e) => {
      if(e.error !== 'no-speech') setError('Mic error: ' + e.error + '. Try Chrome or allow mic access.')
      stopRecording()
    }

    recognition.onend = () => {
      clearInterval(timerRef.current)
      if(finalTranscript.trim()) {
        processTranscript(finalTranscript.trim())
      } else if(transcript.trim()) {
        processTranscript(transcript.trim())
      } else {
        setStage('idle')
        setError('No speech detected. Tap the mic and speak clearly.')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  function stopRecording() {
    if(recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    clearInterval(timerRef.current)
    setStage('processing')
  }

  function processTranscript(text) {
    setStage('processing')
    const phone = extractPhone(text)
    const name = extractName(text, phone)
    setExtracted({ first: name.first, last: name.last, phone: phone||'', notes: text })
    setTimeout(() => setStage('review'), 600)
  }

  async function saveContact() {
    if(!extracted.first && !extracted.phone) {
      setError('Need at least a name or phone number to save.')
      return
    }
    setStage('saving')
    const { data, error: err } = await supabase.from('contacts').insert([{
      first_name:  extracted.first || 'Unknown',
      last_name:   extracted.last  || '',
      phone:       extracted.phone || '',
      status:      'New',
      source:      'Voice Capture',
      notes:       `Voice note: "${extracted.notes}" — Needs full profile completion`,
      agent_id:    state.user?.id,
      assigned_agent: state.currentAgent?.name || '',
    }]).select()

    if(err) { setError('Save failed: '+err.message); setStage('review'); return }

    // Log activity
    await logChange({
      recordType: 'contact', recordId: data[0].id,
      recordName: (extracted.first+' '+extracted.last).trim()||'Voice Contact',
      action: 'Created', agentName: state.currentAgent?.name||'Agent',
      userId: state.user?.id, extra:'Created via voice capture'
    })

    // Create a follow-up task to complete the profile
    await supabase.from('tasks').insert([{
      title: `Complete profile — ${extracted.first||'Voice'} ${extracted.last||'Contact'} (${extracted.phone||'No phone'})`,
      priority: 'high',
      status: 'pending',
      due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      assigned_to: state.user?.id,
      created_by:  state.user?.id,
    }])

    setStage('done')
    toast(`✅ Contact saved! Reminder created to fill out ${extracted.first || 'the profile'}'s details.`)
    if(onSaved) onSaved(data[0])
  }

  function reset() { setStage('idle'); setTranscript(''); setInterimText(''); setExtracted({first:'',last:'',phone:'',notes:''}); setError('') }

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  // ── RENDER ──────────────────────────────────────────────────
  if(!supported) return (
    <div style={compact?{}:{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'16px',padding:'20px'}}>
      <div style={{textAlign:'center',color:'#DC2626',fontSize:'13px'}}>
        ⚠️ Voice not supported on this browser.<br/>
        <span style={{fontSize:'11px',color:'var(--muted)'}}>Use Chrome on Android or Safari on iPhone.</span>
      </div>
    </div>
  )

  return (
    <div style={compact?{padding:'4px'}:{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'16px',padding:'20px'}}>

      {/* Header */}
      {!compact && (
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
          <div>
            <div style={{fontSize:'15px',fontWeight:800}}>🎤 Voice Contact Capture</div>
            <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Say a name and phone number — we'll create the contact</div>
          </div>
          {onClose && <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'18px',lineHeight:1}}>✕</button>}
        </div>
      )}

      {/* IDLE STATE */}
      {stage==='idle' && (
        <div style={{textAlign:'center',padding:compact?'10px':'20px 10px'}}>
          <div style={{fontSize:compact?'11px':'13px',color:'var(--muted)',marginBottom:'14px',lineHeight:1.7}}>
            Tap the mic and say something like:<br/>
            <span style={{fontStyle:'italic',color:'var(--text)',fontWeight:600}}>"John Smith, 845-555-1234"</span>
          </div>
          <button onClick={startRecording} style={{
            width: compact?64:80, height:compact?64:80, borderRadius:'50%',
            background:'linear-gradient(135deg,#CC2200,#E8650A)', border:'none',
            display:'flex',alignItems:'center',justifyContent:'center',
            cursor:'pointer',margin:'0 auto',fontSize:compact?28:34,
            boxShadow:'0 6px 20px rgba(204,34,0,.35)', transition:'transform .15s'
          }}
            onMouseEnter={e=>e.currentTarget.style.transform='scale(1.08)'}
            onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
            🎤
          </button>
          {!compact && <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'12px'}}>Tap to start recording</div>}
          {error && <div style={{marginTop:'10px',fontSize:'11px',color:'#DC2626',background:'#FEF2F2',borderRadius:'8px',padding:'8px 10px'}}>{error}</div>}
        </div>
      )}

      {/* RECORDING STATE */}
      {stage==='recording' && (
        <div style={{textAlign:'center',padding:compact?'8px':'16px 8px'}}>
          {/* Pulsing ring */}
          <div style={{position:'relative',width:compact?72:90,height:compact?72:90,margin:'0 auto 12px'}}>
            <div style={{position:'absolute',inset:-8,borderRadius:'50%',border:'3px solid rgba(204,34,0,.3)',animation:'pulse 1.2s ease-in-out infinite'}}/>
            <div style={{position:'absolute',inset:-16,borderRadius:'50%',border:'2px solid rgba(204,34,0,.15)',animation:'pulse 1.2s ease-in-out infinite .3s'}}/>
            <button onClick={stopRecording} style={{
              width:'100%',height:'100%',borderRadius:'50%',
              background:'linear-gradient(135deg,#CC2200,#E8650A)',border:'none',
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',fontSize:compact?28:34,boxShadow:'0 4px 16px rgba(204,34,0,.4)'
            }}>⏹</button>
          </div>
          <div style={{fontSize:'11px',fontWeight:700,color:'#CC2200',marginBottom:'4px'}}>🔴 Recording · {fmt(recordingTime)}</div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'8px'}}>Tap the button to stop</div>

          {/* Live transcript */}
          {(transcript||interimText) && (
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 13px',textAlign:'left',fontSize:'12px',lineHeight:1.7,maxHeight:'80px',overflowY:'auto'}}>
              <span style={{color:'var(--text)'}}>{transcript}</span>
              <span style={{color:'var(--muted)',fontStyle:'italic'}}>{interimText}</span>
            </div>
          )}
        </div>
      )}

      {/* PROCESSING */}
      {stage==='processing' && (
        <div style={{textAlign:'center',padding:'24px'}}>
          <div style={{fontSize:'32px',marginBottom:'10px',animation:'spin 1s linear infinite',display:'inline-block'}}>⚙️</div>
          <div style={{fontSize:'12px',color:'var(--muted)'}}>Analyzing speech...</div>
        </div>
      )}

      {/* REVIEW STATE */}
      {stage==='review' && (
        <div>
          <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'.7px'}}>
            Review & Confirm
          </div>

          {/* Transcript */}
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 12px',marginBottom:'12px',fontSize:'12px',color:'var(--muted)',lineHeight:1.6,fontStyle:'italic'}}>
            "{extracted.notes}"
          </div>

          {/* Extracted fields */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'}}>
            <FieldInput label="First Name" value={extracted.first} onChange={v=>setExtracted(e=>({...e,first:v}))} placeholder="e.g. John"/>
            <FieldInput label="Last Name"  value={extracted.last}  onChange={v=>setExtracted(e=>({...e,last:v}))} placeholder="e.g. Smith"/>
          </div>
          <FieldInput label="Phone Number" value={extracted.phone} onChange={v=>setExtracted(e=>({...e,phone:v}))} placeholder="e.g. (845) 555-1234" type="tel"/>

          {/* Reminder notice */}
          <div style={{background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.25)',borderRadius:'10px',padding:'10px 12px',marginBottom:'12px',display:'flex',gap:'8px',alignItems:'flex-start'}}>
            <span style={{fontSize:'16px',flexShrink:0}}>⏰</span>
            <div style={{fontSize:'11px',color:'#D97706',lineHeight:1.6}}>
              <strong>Reminder will be created automatically</strong> to fill out this contact's full profile — email, source, budget, areas, and more.
            </div>
          </div>

          {error && <div style={{marginBottom:'10px',fontSize:'11px',color:'#DC2626',background:'#FEF2F2',borderRadius:'8px',padding:'8px 10px'}}>{error}</div>}

          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={reset} style={{flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--muted)',fontSize:'12px',fontWeight:600,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              🎤 Re-record
            </button>
            <button onClick={saveContact} style={{flex:2,background:'linear-gradient(135deg,#CC2200,#E8650A)',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',boxShadow:'0 3px 12px rgba(204,34,0,.3)'}}>
              ✅ Save Contact
            </button>
          </div>
        </div>
      )}

      {/* SAVING */}
      {stage==='saving' && (
        <div style={{textAlign:'center',padding:'24px'}}>
          <div style={{fontSize:'32px',marginBottom:'10px'}}>💾</div>
          <div style={{fontSize:'12px',color:'var(--muted)'}}>Saving contact...</div>
        </div>
      )}

      {/* DONE */}
      {stage==='done' && (
        <div style={{textAlign:'center',padding:'16px 10px'}}>
          <div style={{fontSize:'40px',marginBottom:'10px'}}>🎉</div>
          <div style={{fontSize:'14px',fontWeight:800,marginBottom:'5px'}}>Contact Saved!</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'3px'}}>
            {extracted.first||'Contact'} {extracted.last||''} added
          </div>
          {extracted.phone && <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'12px'}}>{extracted.phone}</div>}
          <div style={{background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.25)',borderRadius:'10px',padding:'9px 12px',marginBottom:'14px',fontSize:'11px',color:'#D97706',textAlign:'left',display:'flex',gap:'8px'}}>
            <span>⏰</span>
            <span>A high-priority task was created to fill out the full profile. Check your Tasks board.</span>
          </div>
          <div style={{display:'flex',gap:'7px',justifyContent:'center'}}>
            <button onClick={reset} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              🎤 Add Another
            </button>
            {onClose && <button onClick={onClose} style={{background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 20px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Done</button>}
          </div>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.12);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

function FieldInput({ label, value, onChange, placeholder, type='text' }) {
  return (
    <div>
      <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box'}}
        onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
    </div>
  )
}
