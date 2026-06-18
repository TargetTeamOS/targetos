import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { logChange } from '../lib/activityLog'
import { parseVoice } from '../lib/voiceParser'
import { nowISO } from '../lib/time'

// ── SPEECH + AUDIO RECORDER ───────────────────────────────────
// Records BOTH transcript (speech-to-text) AND raw audio (for playback)
function useVoiceRecorder() {
  const [stage, setStage]           = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim]       = useState('')
  const [secs, setSecs]             = useState(0)
  const [error, setError]           = useState('')
  const [audioURL, setAudioURL]     = useState(null) // blob URL for playback

  const srRef       = useRef(null) // SpeechRecognition
  const mediaRef    = useRef(null) // MediaRecorder
  const chunksRef   = useRef([])
  const timerRef    = useRef(null)
  const doneRef     = useRef(null)
  const finalRef    = useRef('')
  const silenceRef  = useRef(null) // silence timer

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  async function start(onDone) {
    setError(''); setTranscript(''); setInterim('')
    setSecs(0); setAudioURL(null)
    finalRef.current = ''; chunksRef.current = []
    doneRef.current = onDone

    // ── Start MediaRecorder for audio capture ──
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = e => { if(e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url  = URL.createObjectURL(blob)
        setAudioURL(url)
      }
      mr.start(100)
      mediaRef.current = mr
    } catch(e) {
      // Audio capture failed (permissions), continue with transcript only
      console.warn('Audio capture unavailable:', e.message)
    }

    // ── Start SpeechRecognition ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if(!SR) { setError('Voice not supported. Use Chrome or Safari.'); return }

    const r = new SR()
    r.lang = 'en-US'
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1

    r.onstart = () => {
      setStage('recording')
      timerRef.current = setInterval(() => setSecs(s => s+1), 1000)
    }

    r.onresult = e => {
      // Clear any existing silence timer - user is still speaking
      clearTimeout(silenceRef.current)

      let interimText = ''
      for(let i = 0; i < e.results.length; i++) {
        if(e.results[i].isFinal) {
          finalRef.current += e.results[i][0].transcript + ' '
          setTranscript(finalRef.current.trim())
          setInterim('')
        } else {
          interimText += e.results[i][0].transcript
        }
      }
      setInterim(interimText)

      // Extended silence detection — wait 8 seconds after last speech before auto-stop
      silenceRef.current = setTimeout(() => {
        if(srRef.current) srRef.current.stop()
      }, 8000)
    }

    r.onerror = e => {
      clearInterval(timerRef.current)
      clearTimeout(silenceRef.current)
      if(e.error !== 'no-speech' && e.error !== 'aborted')
        setError('Mic error: ' + e.error)
    }

    r.onend = () => {
      clearInterval(timerRef.current)
      clearTimeout(silenceRef.current)
      setInterim('')
      setStage('processing')
      if(mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
      const final = finalRef.current.trim()
      if(doneRef.current) doneRef.current(final)
    }

    srRef.current = r
    r.start()
  }

  function manualStop() {
    clearInterval(timerRef.current)
    clearTimeout(silenceRef.current)
    setStage('processing')
    if(srRef.current) { srRef.current.stop(); srRef.current = null }
    if(mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
  }

  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearTimeout(silenceRef.current)
    if(srRef.current) { try { srRef.current.abort() } catch(e) {} }
    if(mediaRef.current && mediaRef.current.state !== 'inactive') { try { mediaRef.current.stop() } catch(e) {} }
  }, [])

  return { stage, setStage, transcript, interim, secs, error, setError, supported, audioURL, start, manualStop }
}

// ── AUDIO PLAYER ──────────────────────────────────────────────
function AudioPlayer({ url, label = 'Listen to recording' }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  if(!url) return null

  function toggle() {
    const a = audioRef.current
    if(!a) return
    if(playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  return (
    <div style={{display:'flex',alignItems:'center',gap:'10px',background:'rgba(14,165,233,.07)',border:'1px solid rgba(14,165,233,.2)',borderRadius:'10px',padding:'10px 13px',marginTop:'8px'}}>
      <button onClick={toggle}
        style={{width:36,height:36,borderRadius:'50%',background:'#0EA5E9',border:'none',color:'#fff',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{flex:1}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'#0EA5E9'}}>{label}</div>
        <div style={{fontSize:'10px',color:'var(--muted)'}}>Tap to listen back</div>
      </div>
      <audio ref={audioRef} src={url} onEnded={()=>setPlaying(false)} style={{display:'none'}}/>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────
export function VoiceCapture({ onClose, onSaved, contactId=null, contactName='' }) {
  const { state, toast } = useApp()
  const rec = useVoiceRecorder()
  const [mode, setMode]       = useState(null)
  const [parsed, setParsed]   = useState(null)
  const [form, setForm]       = useState({ first:'',last:'',phone:'',note:'',taskTitle:'',taskDue:'',schedDate:'',schedTime:'',address:'' })
  const [actions, setActions] = useState([])
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(null)
  const [savedAudioURL, setSavedAudioURL] = useState(null) // persisted for playback after save

  function startCapture() {
    rec.start(text => {
      if(!text) { rec.setStage('idle'); rec.setError('Nothing heard — tap mic and speak clearly.'); return }
      const result = parseVoice(text)
      setParsed(result)
      setSavedAudioURL(rec.audioURL)
      setForm({
        first:     result.name.first,
        last:      result.name.last,
        phone:     result.phone,
        note:      text,
        taskTitle: result.isTask||result.isReminder ? cleanTaskText(text) : '',
        taskDue:   result.dateTime.date  || '',
        schedDate: result.dateTime.date  || '',
        schedTime: result.dateTime.time  || '',
        address:   result.addresses[0]   || '',
      })
      const auto = []
      if(mode==='lead' && (result.name.first||result.phone)) auto.push('contact')
      if(result.isTask||result.isReminder) auto.push('task')
      if(result.isSchedule && !result.isTask) auto.push('schedule')
      if(mode==='note' && auto.length===0) auto.push('note')
      if(auto.length===0 && mode==='lead') auto.push('contact')
      setActions(auto)
      rec.setStage('review')
    })
  }

  function toggleAction(a) {
    setActions(prev => prev.includes(a) ? prev.filter(x=>x!==a) : [...prev,a])
  }

  async function saveAll() {
    setSaving(true)
    const saved = []
    const audioNote = savedAudioURL ? `[Voice recording attached]` : ''

    if(actions.includes('contact') && mode==='lead') {
      const { data, error } = await supabase.from('contacts').insert([{
        first_name: form.first || 'Unknown',
        last_name:  form.last  || '',
        phone:      form.phone || '',
        source:     'Voice Capture',
        notes:      `${form.note}${audioNote ? '\n'+audioNote : ''}`,
        agent_id:   state.user?.id,
      }]).select()
      if(error) { rec.setError('Contact save failed: '+error.message); setSaving(false); return }
      await logChange({ recordType:'contact', recordId:data[0].id, recordName:(form.first+' '+form.last).trim()||'Voice Contact', action:'Created', agentName:state.currentAgent?.name||'Agent', userId:state.user?.id, extra:'Voice capture'+audioNote })
      saved.push({ type:'contact', label:(form.first+' '+form.last).trim()||'New Contact' })
    }

    if(actions.includes('note')) {
      if(contactId) {
        await logChange({ recordType:'contact', recordId:contactId, recordName:contactName, action:'Note Added', agentName:state.currentAgent?.name||'Agent', userId:state.user?.id, extra:`${form.note}${audioNote?'\n'+audioNote:''}` })
        saved.push({ type:'note', label:'Note on '+contactName })
      } else {
        await supabase.from('tasks').insert([{ title:form.note.slice(0,120), priority:'normal', status:'pending', assigned_to:state.user?.id, created_by:state.user?.id }])
        saved.push({ type:'note', label:'Note saved' })
      }
    }

    if(actions.includes('task') && form.taskTitle.trim()) {
      await supabase.from('tasks').insert([{ title:form.taskTitle.trim(), priority:'high', status:'pending', due_date:form.taskDue||null, assigned_to:state.user?.id, created_by:state.user?.id }])
      saved.push({ type:'task', label:form.taskTitle.slice(0,50) })
    }

    if(actions.includes('schedule')) {
      const apptTitle = form.note.replace(/\b(schedule|appointment|meeting|showing)\b/gi,'').trim()||'Appointment'
      await supabase.from('tasks').insert([{ title:apptTitle.slice(0,120), priority:'normal', status:'pending', due_date:form.schedDate||null, assigned_to:state.user?.id, created_by:state.user?.id }])
      saved.push({ type:'schedule', label:`${form.schedDate||'Appointment'}${form.schedTime?' at '+fmtTime(form.schedTime):''}` })
    }

    if(actions.includes('contact')) {
      await supabase.from('tasks').insert([{ title:`Complete profile — ${form.first||'Voice'} ${form.last||'Contact'}${form.phone?' ('+form.phone+')':''}`, priority:'high', status:'pending', due_date:new Date(Date.now()+86400000).toISOString().split('T')[0], assigned_to:state.user?.id, created_by:state.user?.id }])
      saved.push({ type:'reminder', label:'Reminder to complete profile' })
    }

    setSaving(false)
    setDone({ saved, message:`${saved.length} item${saved.length>1?'s':''} saved!` })
    if(onSaved) onSaved(saved)
  }

  function reset() {
    rec.setStage('idle'); rec.setError('')
    setParsed(null); setSavedAudioURL(null)
    setForm({first:'',last:'',phone:'',note:'',taskTitle:'',taskDue:'',schedDate:'',schedTime:'',address:''})
    setActions([]); setDone(null); setSaving(false)
  }

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
        <div>
          <div style={{fontSize:'16px',fontWeight:800}}>🎤 Voice Capture</div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Names · Addresses · Tasks · Reminders · Schedules</div>
        </div>
        {onClose && <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1,padding:'4px'}}>✕</button>}
      </div>

      {/* MODE PICKER */}
      {!mode && rec.stage==='idle' && !done && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <ModeCard icon='👤' label='New Lead' desc='Name, phone, address' color='#CC2200' onClick={()=>setMode('lead')}/>
          <ModeCard icon='📝' label='Quick Note' desc={contactId?`Note on ${contactName||'contact'}`:'Note, task, or reminder'} color='#0EA5E9' onClick={()=>setMode('note')}/>
        </div>
      )}

      {/* RECORDING */}
      {mode && (rec.stage==='idle'||rec.stage==='recording') && !done && (
        <div style={{textAlign:'center'}}>
          <ModeBadge mode={mode} onClear={()=>{setMode(null);reset()}}/>

          {/* Example prompts */}
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 12px',marginBottom:'16px',textAlign:'left',fontSize:'12px',color:'var(--muted)',lineHeight:1.8}}>
            {mode==='lead' ? <>
              <div>👤 <em>"John Smith, 845-555-1234"</em></div>
              <div>🏠 <em>"Showing at 47 Prairie Ave Monday at 2pm"</em></div>
              <div>✓ <em>"Sarah Cohen called, remind me to follow up tomorrow"</em></div>
            </> : <>
              <div>📝 <em>"Client interested in 12 Cloverdale Lane, Monsey"</em></div>
              <div>✓ <em>"Schedule inspection for 352 Blauvelt Rd Wednesday"</em></div>
              <div>⏰ <em>"Don't forget to order the closing gift"</em></div>
            </>}
          </div>

          {rec.stage==='idle' ? (
            <MicBtn color={mode==='lead'?'#CC2200':'#0EA5E9'} onClick={startCapture}/>
          ) : (
            <PulsingMicBtn color={mode==='lead'?'#CC2200':'#0EA5E9'} onClick={rec.manualStop} secs={rec.secs} fmt={fmt}/>
          )}

          {rec.stage==='recording' && (
            <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'28px'}}>
              Tap ⏹ to stop early · Auto-stops after 8 seconds of silence
            </div>
          )}

          {(rec.transcript||rec.interim) && (
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 13px',marginTop:'12px',textAlign:'left',fontSize:'12px',lineHeight:1.8}}>
              <span>{rec.transcript}</span>
              <span style={{color:'var(--muted)',fontStyle:'italic'}}>{rec.interim}</span>
            </div>
          )}
          {rec.error && <ErrBox msg={rec.error}/>}
        </div>
      )}

      {/* PROCESSING */}
      {rec.stage==='processing' && (
        <div style={{textAlign:'center',padding:'24px'}}>
          <div style={{fontSize:'28px',marginBottom:'8px'}}>⚙️</div>
          <div style={{fontSize:'12px',color:'var(--muted)'}}>Analyzing speech...</div>
        </div>
      )}

      {/* REVIEW */}
      {rec.stage==='review' && parsed && !done && (
        <div>
          {/* Transcript box */}
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'9px 12px',marginBottom:'4px',fontSize:'11px',color:'var(--muted)',fontStyle:'italic',lineHeight:1.7}}>
            "{form.note.slice(0,200)}{form.note.length>200?'…':''}"
          </div>

          {/* Audio playback */}
          {(savedAudioURL||rec.audioURL) && (
            <AudioPlayer url={savedAudioURL||rec.audioURL} label="Listen to your recording"/>
          )}

          <div style={{height:'8px'}}/>

          {/* Action chips */}
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>
            Detected — select what to save:
          </div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px'}}>
            {[
              mode==='lead'&&(parsed.name.first||parsed.phone) ? {id:'contact',label:'👤 Contact',color:'#CC2200'} : null,
              contactId ? {id:'note',label:'📝 Note on '+contactName,color:'#0EA5E9'} : null,
              parsed.isTask||parsed.isReminder ? {id:'task',label:'✓ Task',color:'#7C3AED'} : null,
              parsed.isSchedule ? {id:'schedule',label:'📅 Schedule',color:'#16A34A'} : null,
              !contactId&&mode==='note'&&!parsed.isTask&&!parsed.isSchedule ? {id:'note',label:'📝 Save Note',color:'#0EA5E9'} : null,
            ].filter(Boolean).map(a=>(
              <div key={a.id} onClick={()=>toggleAction(a.id)}
                style={{padding:'6px 13px',borderRadius:'20px',border:'1.5px solid '+(actions.includes(a.id)?a.color:'var(--border)'),background:actions.includes(a.id)?a.color+'12':'transparent',cursor:'pointer',fontSize:'12px',fontWeight:700,color:actions.includes(a.id)?a.color:'var(--muted)',display:'flex',alignItems:'center',gap:'5px',transition:'all .12s'}}>
                {actions.includes(a.id)&&<span style={{fontSize:'10px'}}>✓</span>}
                {a.label}
              </div>
            ))}
          </div>

          {/* CONTACT */}
          {actions.includes('contact') && mode==='lead' && (
            <Section title="👤 Contact Info" color="#CC2200">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <FI label="First Name" value={form.first} onChange={v=>set('first',v)} ph="John"/>
                <FI label="Last Name"  value={form.last}  onChange={v=>set('last',v)}  ph="Smith"/>
              </div>
              <FI label="Phone" value={form.phone} onChange={v=>set('phone',v)} ph="(845) 555-1234" type="tel"/>
              {form.address && <FI label="Address" value={form.address} onChange={v=>set('address',v)}/>}
            </Section>
          )}

          {/* NOTE */}
          {actions.includes('note') && (
            <Section title="📝 Note" color="#0EA5E9">
              <textarea value={form.note} onChange={e=>set('note',e.target.value)} rows={3}
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.6}}/>
              {(savedAudioURL||rec.audioURL) && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'4px'}}>🎤 Voice recording will be attached to this note</div>}
            </Section>
          )}

          {/* TASK */}
          {actions.includes('task') && (
            <Section title="✓ Task / Reminder" color="#7C3AED">
              <FI label="Task Title" value={form.taskTitle} onChange={v=>set('taskTitle',v)} ph="Follow up with client"/>
              <FI label="Due Date" value={form.taskDue} onChange={v=>set('taskDue',v)} type="date"/>
            </Section>
          )}

          {/* SCHEDULE */}
          {actions.includes('schedule') && (
            <Section title="📅 Appointment" color="#16A34A">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:form.address?'8px':'0'}}>
                <FI label="Date" value={form.schedDate} onChange={v=>set('schedDate',v)} type="date"/>
                <FI label="Time" value={form.schedTime} onChange={v=>set('schedTime',v)} type="time"/>
              </div>
              {form.address && <FI label="Location / Address" value={form.address} onChange={v=>set('address',v)}/>}
            </Section>
          )}

          {/* Reminder notice */}
          {actions.includes('contact') && (
            <div style={{background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.22)',borderRadius:'9px',padding:'9px 12px',marginBottom:'10px',display:'flex',gap:'7px',fontSize:'11px',color:'#D97706'}}>
              <span>⏰</span><span>A reminder will be created to complete the full profile — email, source, budget, areas.</span>
            </div>
          )}

          {actions.length===0 && (
            <div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:'9px',padding:'10px 12px',marginBottom:'10px',fontSize:'12px',color:'#92400E'}}>
              ⚠️ Select at least one item above to save.
            </div>
          )}

          {rec.error && <ErrBox msg={rec.error}/>}

          <div style={{display:'flex',gap:'8px'}}>
            <button onClick={()=>{reset();setMode(mode)}} style={{flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--muted)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              🎤 Re-record
            </button>
            <button onClick={saveAll} disabled={saving||actions.length===0}
              style={{flex:2,background:'linear-gradient(135deg,#CC2200,#E8650A)',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:saving||actions.length===0?'not-allowed':'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:saving||actions.length===0?.5:1,boxShadow:'0 3px 12px rgba(204,34,0,.3)'}}>
              {saving ? 'Saving…' : `✅ Save ${actions.length} item${actions.length!==1?'s':''}`}
            </button>
          </div>
        </div>
      )}

      {/* DONE */}
      {done && (
        <div style={{textAlign:'center',padding:'12px 8px'}}>
          <div style={{fontSize:'40px',marginBottom:'10px'}}>🎉</div>
          <div style={{fontSize:'15px',fontWeight:800,marginBottom:'12px'}}>{done.message}</div>
          <div style={{background:'var(--dim)',borderRadius:'12px',padding:'12px',marginBottom:'12px',textAlign:'left'}}>
            {done.saved.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 0',borderBottom:i<done.saved.length-1?'1px solid var(--border)':'none',fontSize:'12px',fontWeight:600}}>
                <span>{s.type==='contact'?'👤':s.type==='task'?'✓':s.type==='schedule'?'📅':s.type==='reminder'?'⏰':'📝'}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          {/* Audio playback after save */}
          {savedAudioURL && <AudioPlayer url={savedAudioURL} label="Listen to original recording"/>}
          <div style={{display:'flex',gap:'8px',justifyContent:'center',marginTop:'12px'}}>
            <button onClick={()=>{reset();setMode(null)}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              🎤 Add Another
            </button>
            {onClose && <button onClick={onClose} style={{background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 20px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Done</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── HELPERS ───────────────────────────────────────────────────
function ModeCard({ icon, label, desc, color, onClick }) {
  return (
    <div onClick={onClick} style={{background:'var(--dim)',border:'2px solid var(--border)',borderRadius:'14px',padding:'18px 14px',textAlign:'center',cursor:'pointer',transition:'all .15s'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.background=color+'10'}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--dim)'}}>
      <div style={{fontSize:'30px',marginBottom:'8px'}}>{icon}</div>
      <div style={{fontSize:'14px',fontWeight:800,color,marginBottom:'3px'}}>{label}</div>
      <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.5}}>{desc}</div>
    </div>
  )
}

function ModeBadge({ mode, onClear }) {
  const color = mode==='lead' ? '#CC2200' : '#0EA5E9'
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:'7px',background:color+'10',borderRadius:'20px',padding:'5px 14px',marginBottom:'14px',border:'1px solid '+color+'25'}}>
      <span style={{fontSize:'13px'}}>{mode==='lead'?'👤':'📝'}</span>
      <span style={{fontSize:'12px',fontWeight:700,color}}>{mode==='lead'?'New Lead':'Quick Note'}</span>
      <button onClick={onClear} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'11px',marginLeft:'4px'}}>change</button>
    </div>
  )
}

function MicBtn({ color, onClick }) {
  return (
    <button onClick={onClick}
      style={{width:80,height:80,borderRadius:'50%',background:`linear-gradient(135deg,${color},${color}CC)`,border:'none',fontSize:'34px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',margin:'0 auto 8px',boxShadow:`0 6px 24px ${color}44`,transition:'transform .15s'}}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.07)'}
      onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
      🎤
    </button>
  )
}

function PulsingMicBtn({ color, onClick, secs, fmt }) {
  return (
    <div style={{position:'relative',width:84,height:84,margin:'0 auto 6px'}}>
      <div style={{position:'absolute',inset:-10,borderRadius:'50%',border:`3px solid ${color}44`,animation:'vcpulse 1.2s ease-in-out infinite'}}/>
      <div style={{position:'absolute',inset:-22,borderRadius:'50%',border:`2px solid ${color}22`,animation:'vcpulse 1.2s ease-in-out infinite .4s'}}/>
      <button onClick={onClick}
        style={{width:'100%',height:'100%',borderRadius:'50%',background:`linear-gradient(135deg,${color},${color}CC)`,border:'none',fontSize:'28px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:`0 4px 16px ${color}55`}}>
        ⏹
      </button>
      <div style={{position:'absolute',bottom:-22,left:'50%',transform:'translateX(-50%)',fontSize:'11px',fontWeight:700,color,whiteSpace:'nowrap'}}>
        🔴 {fmt(secs)}
      </div>
      <style>{`@keyframes vcpulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.1);opacity:1}}`}</style>
    </div>
  )
}

function Section({ title, color, children }) {
  return (
    <div style={{background:'var(--dim)',borderRadius:'10px',padding:'12px',marginBottom:'10px',borderLeft:'3px solid '+color}}>
      <div style={{fontSize:'10px',fontWeight:700,color,textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>{title}</div>
      {children}
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{marginBottom:'8px'}}>
      <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph}
        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box'}}
        onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
    </div>
  )
}

function ErrBox({ msg }) {
  return <div style={{margin:'8px 0',fontSize:'11px',color:'#DC2626',background:'#FEF2F2',borderRadius:'8px',padding:'8px 10px',lineHeight:1.5}}>{msg}</div>
}

function fmtTime(t) {
  const [h,m] = t.split(':').map(Number)
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
}

function cleanTaskText(text) {
  return text
    .replace(/\b(remind me to|remember to|task|create task|add task|don't forget to|need to|have to|remind me|reminder)\b/gi,'')
    .replace(/\s+/g,' ').trim()
}
