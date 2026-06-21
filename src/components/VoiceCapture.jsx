import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { logChange } from '../lib/activityLog'
import { parseVoice } from '../lib/voiceParser'

// ── SPEECH HOOK — uses continuous mode with manual stop + silence detection
function useSpeech() {
  const [stage, setStage]           = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim]       = useState('')
  const [secs, setSecs]             = useState(0)
  const [error, setError]           = useState('')
  const [audioURL, setAudioURL]     = useState(null)

  const srRef      = useRef(null)
  const mediaRef   = useRef(null)
  const chunksRef  = useRef([])
  const timerRef   = useRef(null)
  const silenceRef = useRef(null)
  const finalRef   = useRef('')
  const doneRef    = useRef(null)

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const recordingRef = useRef(false)  // track if we WANT to be recording

  async function start(onDone) {
    setError(''); setTranscript(''); setInterim('')
    setSecs(0); setAudioURL(null)
    finalRef.current = ''; chunksRef.current = []
    doneRef.current = onDone

    // Start audio recording for playback
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = e => { if(e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioURL(URL.createObjectURL(blob))
      }
      mr.start(100)
      mediaRef.current = mr
    } catch(e) {
      console.warn('Audio capture unavailable:', e.message)
    }

    // Speech recognition — continuous mode, manual stop
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if(!SR) { setError('Voice not supported. Use Chrome or Safari.'); return }

    const r = new SR()
    r.lang = 'en-US'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 3  // More alternatives = better accuracy

    // Add speech grammar for real estate terms if supported
    if(window.SpeechGrammarList || window.webkitSpeechGrammarList) {
      const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList
      const grammar = new SGL()
      // Real estate street types, NY cities, common names
      const words = ['avenue','road','street','drive','lane','boulevard','court','place','way','parkway',
        'monsey','suffern','spring valley','nanuet','new city','nyack','haverstraw','orangeburg','pearl river',
        'unit','apartment','floor','listing','contact','task','schedule','showing','open house','offer',
        'under contract','closing','GCI','commission','buyer','seller','landlord','tenant',
        'bedroom','bathroom','kitchen','garage','basement','backyard','sqft','acres']
      grammar.addFromString(`#JSGF V1.0; grammar realestate; public <term> = ${words.join(' | ')};`, 1)
      r.grammars = grammar
    }

    r.onstart = () => {
      setStage('recording')
      timerRef.current = setInterval(() => setSecs(s => s+1), 1000)
    }

    r.onresult = e => {
      // Reset silence timer every time we hear something
      clearTimeout(silenceRef.current)

      let interimText = ''
      for(let i = e.resultIndex; i < e.results.length; i++) {
        if(e.results[i].isFinal) {
          // Pick the alternative with highest confidence
          let bestTranscript = e.results[i][0].transcript
          let bestConf = e.results[i][0].confidence || 0
          for(let j = 1; j < e.results[i].length; j++) {
            if((e.results[i][j].confidence || 0) > bestConf) {
              bestConf = e.results[i][j].confidence
              bestTranscript = e.results[i][j].transcript
            }
          }
          finalRef.current += bestTranscript + ' '
          setTranscript(finalRef.current.trim())
          setInterim('')
        } else {
          interimText += e.results[i][0].transcript
        }
      }
      if(interimText) setInterim(interimText)

      // Auto-stop after 8 seconds of silence
      silenceRef.current = setTimeout(() => {
        if(srRef.current) srRef.current.stop()
      }, 12000)
    }

    r.onerror = e => {
      clearInterval(timerRef.current)
      clearTimeout(silenceRef.current)
      if(e.error === 'no-speech') {
        // Restart recognition to keep listening
        try { r.start() } catch(err) {}
        return
      }
      if(e.error !== 'aborted') {
        setError('Mic error: ' + e.error + '. Make sure mic access is allowed.')
      }
    }

    r.onend = () => {
      // On mobile, recognition fires onend unexpectedly
      // Restart it if we're still supposed to be recording
      if(recordingRef.current && srRef.current) {
        try {
          srRef.current = new SR()
          srRef.current.lang = 'en-US'
          srRef.current.continuous = false  // non-continuous works better on mobile
          srRef.current.interimResults = true
          srRef.current.maxAlternatives = 3
          srRef.current.onresult = r.onresult
          srRef.current.onerror = r.onerror
          srRef.current.onend = r.onend
          srRef.current.start()
          return
        } catch(e) {}
      }
      clearInterval(timerRef.current)
      clearTimeout(silenceRef.current)
      setInterim('')
      setStage('processing')
      if(mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
      const final = finalRef.current.trim()
      if(doneRef.current) doneRef.current(final)
    }

    srRef.current = r
    recordingRef.current = true
    r.start()
  }

  function manualStop() {
    recordingRef.current = false  // stop auto-restart
    clearInterval(timerRef.current)
    clearTimeout(silenceRef.current)
    setStage('processing')
    if(srRef.current) { try { srRef.current.stop() } catch(e) {}; srRef.current = null }
    if(mediaRef.current && mediaRef.current.state !== 'inactive') { try { mediaRef.current.stop() } catch(e) {} }
  }

  useEffect(() => () => {
    recordingRef.current = false
    clearInterval(timerRef.current)
    clearTimeout(silenceRef.current)
    if(srRef.current) { try { srRef.current.abort() } catch(e) {} }
    if(mediaRef.current && mediaRef.current.state !== 'inactive') { try { mediaRef.current.stop() } catch(e) {} }
  }, [])

  return { stage, setStage, transcript, interim, secs, error, setError, supported, audioURL, start, manualStop }
}

// ── AUDIO PLAYER ──────────────────────────────────────────────
function AudioPlayer({ url }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
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
      <button onClick={toggle} style={{width:34,height:34,borderRadius:'50%',background:'#0EA5E9',border:'none',color:'#fff',fontSize:'14px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{flex:1}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'#0EA5E9',marginBottom:'3px'}}>🎤 Voice Recording</div>
        <div style={{background:'rgba(14,165,233,.2)',borderRadius:'99px',height:3,overflow:'hidden'}}>
          <div style={{background:'#0EA5E9',height:3,width:progress+'%',transition:'width .1s'}}/>
        </div>
      </div>
      <audio ref={audioRef} src={url}
        onTimeUpdate={e=>setProgress(e.target.duration?e.target.currentTime/e.target.duration*100:0)}
        onEnded={()=>{setPlaying(false);setProgress(0)}}
        style={{display:'none'}}/>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────
export function VoiceCapture({ onClose, onSaved, contactId=null, contactName='' }) {
  const { agent } = useAuth()
  const { toast } = useApp()
  const speech = useSpeech()
  const [mode, setMode]         = useState(null)
  const [micAllowed, setMicAllowed] = useState(null) // null=unknown, true=granted, false=denied

  // Check mic permission on mount
  React.useEffect(() => {
    if(navigator.permissions) {
      navigator.permissions.query({ name:'microphone' }).then(result => {
        setMicAllowed(result.state === 'granted')
        result.onchange = () => setMicAllowed(result.state === 'granted')
      }).catch(() => setMicAllowed(null))
    }
  }, [])
  const [parsed, setParsed]     = useState(null)
  const [form, setForm]         = useState({ first:'',last:'',phone:'',note:'',taskTitle:'',taskDue:'',schedDate:'',schedTime:'',address:'' })
  const [actions, setActions]   = useState([])
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(null)
  const [savedAudioURL, setSavedAudioURL] = useState(null)

  function startCapture() {
    speech.start(text => {
      if(!text.trim()) {
        speech.setStage('idle')
        speech.setError('Nothing heard. Make sure microphone access is allowed in your browser, then try again.')
        return
      }
      const result = parseVoice(text)
      setParsed(result)
      setSavedAudioURL(speech.audioURL)
      setForm({
        first:     result.name.first,
        last:      result.name.last,
        phone:     result.phone,
        note:      text,
        taskTitle: result.isTask||result.isReminder ? cleanTaskText(text) : '',
        taskDue:   result.dateTime?.date  || '',
        schedDate: result.dateTime?.date  || '',
        schedTime: result.dateTime?.time  || '',
        address:   result.addresses?.[0]  || '',
      })
      const auto = []
      if(mode==='lead' && (result.name.first||result.phone)) auto.push('contact')
      if(result.isTask||result.isReminder) auto.push('task')
      if(result.isSchedule && !result.isTask) auto.push('schedule')
      if(mode==='note' && auto.length===0) auto.push('note')
      if(auto.length===0 && mode==='lead') auto.push('contact')
      setActions(auto)
      speech.setStage('review')
    })
  }

  function toggleAction(a) {
    setActions(prev => prev.includes(a) ? prev.filter(x=>x!==a) : [...prev,a])
  }

  async function saveAll() {
    setSaving(true)
    const saved = []

    if(actions.includes('contact') && mode==='lead') {
      const { data, error } = await supabase.from('contacts').insert([{
        first_name: form.first || 'Unknown',
        last_name:  form.last  || '',
        phone:      form.phone || '',
        source:     'Voice Capture',
        notes:      `Voice note: "${form.note}"`,
        agent_id:   agent?.id,
      }]).select()
      if(error) { speech.setError('Save failed: '+error.message); setSaving(false); return }
      await logChange({ recordType:'contact', recordId:data[0].id, recordName:(form.first+' '+form.last).trim()||'Voice Contact', action:'Created', agentName:agent?.name||'Agent', userId:agent?.id, extra:'Voice capture' })
      saved.push({ type:'contact', label:(form.first+' '+form.last).trim()||'New Contact' })
    }

    if(actions.includes('note')) {
      if(contactId) {
        await logChange({ recordType:'contact', recordId:contactId, recordName:contactName, action:'Note Added', agentName:agent?.name||'Agent', userId:agent?.id, extra:form.note })
        saved.push({ type:'note', label:'Note on '+contactName })
      } else {
        await supabase.from('tasks').insert([{ title:form.note.slice(0,120), priority:'normal', status:'pending', agent_id:agent?.id, created_by:agent?.id }])
        saved.push({ type:'note', label:'Note saved' })
      }
    }

    if(actions.includes('task') && form.taskTitle.trim()) {
      const ctx = form.address ? ` — ${form.address}` : (actions.includes('contact')&&form.first?` — ${form.first} ${form.last}`.trim():'')
      await supabase.from('tasks').insert([{ title:(form.taskTitle.trim()+ctx).slice(0,200), priority:'high', status:'pending', due_date:form.taskDue||null, agent_id:agent?.id, created_by:agent?.id }])
      saved.push({ type:'task', label:form.taskTitle.slice(0,50) })
    }

    if(actions.includes('schedule')) {
      await supabase.from('tasks').insert([{ title:form.note.replace(/\b(schedule|appointment|meeting|showing)\b/gi,'').trim().slice(0,120)||'Appointment', priority:'normal', status:'pending', due_date:form.schedDate||null, agent_id:agent?.id, created_by:agent?.id }])
      saved.push({ type:'schedule', label:`Appointment${form.schedDate?' on '+form.schedDate:''}` })
    }

    if(actions.includes('contact')) {
      await supabase.from('tasks').insert([{ title:`Complete profile — ${form.first||'Voice'} ${form.last||'Contact'}${form.phone?' ('+form.phone+')':''}`, priority:'high', status:'pending', due_date:new Date(Date.now()+86400000).toISOString().split('T')[0], agent_id:agent?.id, created_by:agent?.id }])
      saved.push({ type:'reminder', label:'Reminder to complete profile' })
    }

    setSaving(false)
    setDone({ saved })
    if(onSaved) onSaved(saved)
    toast(`✅ ${saved.length} item${saved.length>1?'s':''} saved!`)
  }

  function reset() {
    speech.setStage('idle'); speech.setError('')
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
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Speak clearly · Tap stop when done · Auto-stops after 8 seconds silence</div>
        </div>
        {onClose && <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1,padding:'4px'}}>✕</button>}
      </div>

      {/* MODE PICKER */}
      {!mode && speech.stage==='idle' && !done && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <ModeCard icon='👤' label='New Lead' desc='Name, phone, address' color='#CC2200' onClick={()=>setMode('lead')}/>
          <ModeCard icon='📝' label='Quick Note' desc={contactId?`Note on ${contactName||'contact'}`:'Note, task, or reminder'} color='#0EA5E9' onClick={()=>setMode('note')}/>
        </div>
      )}

      {/* RECORDING */}
      {mode && (speech.stage==='idle'||speech.stage==='recording') && !done && (
        <div style={{textAlign:'center'}}>
          <ModeBadge mode={mode} onClear={()=>{setMode(null);reset()}}/>

          {/* Examples */}
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 14px',marginBottom:'18px',textAlign:'left',fontSize:'12px',color:'var(--muted)',lineHeight:1.9}}>
            {mode==='lead' ? <>
              <div>👤 <em style={{color:'var(--text)'}}>"John Smith, 845-555-1234"</em></div>
              <div>🏠 <em style={{color:'var(--text)'}}>"Showing at 47 Prairie Ave Monday 2pm"</em></div>
              <div>✓ <em style={{color:'var(--text)'}}>"Call Sarah Cohen, remind me tomorrow"</em></div>
            </> : <>
              <div>📝 <em style={{color:'var(--text)'}}>"Client interested in 12 Cloverdale, Monsey"</em></div>
              <div>✓ <em style={{color:'var(--text)'}}>"Schedule inspection Wednesday at 10am"</em></div>
              <div>⏰ <em style={{color:'var(--text)'}}>"Remind me to order the closing gift"</em></div>
            </>}
          </div>

          {speech.stage==='idle' ? (
            <button onClick={startCapture} style={{width:84,height:84,borderRadius:'50%',background:`linear-gradient(135deg,${mode==='lead'?'#CC2200,#E8650A':'#0EA5E9,#2563EB'})`,border:'none',fontSize:'34px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',margin:'0 auto 12px',boxShadow:`0 6px 24px ${mode==='lead'?'rgba(204,34,0,.4)':'rgba(14,165,233,.4)'}`,transition:'transform .15s'}}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.07)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              🎤
            </button>
          ) : (
            <div style={{position:'relative',width:84,height:84,margin:'0 auto 10px'}}>
              <div style={{position:'absolute',inset:-10,borderRadius:'50%',border:`3px solid ${mode==='lead'?'rgba(204,34,0,.3)':'rgba(14,165,233,.3)'}`,animation:'vcpulse 1.2s ease-in-out infinite'}}/>
              <div style={{position:'absolute',inset:-22,borderRadius:'50%',border:`2px solid ${mode==='lead'?'rgba(204,34,0,.12)':'rgba(14,165,233,.12)'}`,animation:'vcpulse 1.2s ease-in-out infinite .4s'}}/>
              <button onClick={speech.manualStop} style={{width:'100%',height:'100%',borderRadius:'50%',background:`linear-gradient(135deg,${mode==='lead'?'#CC2200,#E8650A':'#0EA5E9,#2563EB'})`,border:'none',fontSize:'28px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:`0 4px 16px ${mode==='lead'?'rgba(204,34,0,.5)':'rgba(14,165,233,.5)'}`}}>
                ⏹
              </button>
            </div>
          )}

          {speech.stage==='recording' && (
            <div style={{fontSize:'13px',fontWeight:700,color:mode==='lead'?'#CC2200':'#0EA5E9',marginBottom:'4px'}}>🔴 Recording · {fmt(speech.secs)}</div>
          )}
          <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'12px'}}>
            {speech.stage==='idle'?'Tap to start recording':'Tap ⏹ to stop when done speaking'}
          </div>

          {/* Live transcript */}
          {(speech.transcript||speech.interim) && (
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'11px 13px',textAlign:'left',fontSize:'13px',lineHeight:1.8,minHeight:'50px'}}>
              <span style={{color:'var(--text)',fontWeight:500}}>{speech.transcript}</span>
              <span style={{color:'var(--muted)',fontStyle:'italic'}}>{speech.interim}</span>
            </div>
          )}
          {speech.error && <ErrBox msg={speech.error}/>}
        </div>
      )}

      {/* PROCESSING */}
      {speech.stage==='processing' && (
        <div style={{textAlign:'center',padding:'28px'}}>
          <div style={{fontSize:'32px',marginBottom:'10px'}}>⚙️</div>
          <div style={{fontSize:'13px',color:'var(--muted)'}}>Analyzing speech...</div>
        </div>
      )}

      {/* REVIEW */}
      {speech.stage==='review' && parsed && !done && (
        <div>
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 12px',marginBottom:'6px',fontSize:'12px',color:'var(--muted)',fontStyle:'italic',lineHeight:1.7}}>
            "{form.note.slice(0,200)}{form.note.length>200?'…':''}"
          </div>
          <AudioPlayer url={savedAudioURL||speech.audioURL}/>
          <div style={{height:'10px'}}/>

          {/* Action chips */}
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Detected — tap to select what to save:</div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px'}}>
            {[
              mode==='lead'&&(parsed.name?.first||parsed.phone) ? {id:'contact',label:'👤 Contact',color:'#CC2200'} : null,
              contactId ? {id:'note',label:'📝 Note on '+contactName,color:'#0EA5E9'} : null,
              parsed.isTask||parsed.isReminder ? {id:'task',label:'✓ Task',color:'#7C3AED'} : null,
              parsed.isSchedule ? {id:'schedule',label:'📅 Schedule',color:'#16A34A'} : null,
              !contactId&&mode==='note'&&!parsed.isTask&&!parsed.isSchedule ? {id:'note',label:'📝 Save Note',color:'#0EA5E9'} : null,
            ].filter(Boolean).map(a=>(
              <div key={a.id} onClick={()=>toggleAction(a.id)}
                style={{padding:'7px 14px',borderRadius:'20px',border:'1.5px solid '+(actions.includes(a.id)?a.color:'var(--border)'),background:actions.includes(a.id)?a.color+'12':'transparent',cursor:'pointer',fontSize:'12px',fontWeight:700,color:actions.includes(a.id)?a.color:'var(--muted)',display:'flex',alignItems:'center',gap:'5px',transition:'all .12s'}}>
                {actions.includes(a.id)&&<span style={{fontSize:'10px'}}>✓</span>}
                {a.label}
              </div>
            ))}
          </div>

          {/* CONTACT fields */}
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

          {/* NOTE fields */}
          {actions.includes('note') && (
            <Section title="📝 Note" color="#0EA5E9">
              <textarea value={form.note} onChange={e=>set('note',e.target.value)} rows={3} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.6}}/>
            </Section>
          )}

          {/* TASK fields */}
          {actions.includes('task') && (
            <Section title="✓ Task / Reminder" color="#7C3AED">
              <FI label="Task Title" value={form.taskTitle} onChange={v=>set('taskTitle',v)} ph="Follow up with client"/>
              <FI label="Due Date" value={form.taskDue} onChange={v=>set('taskDue',v)} type="date"/>
            </Section>
          )}

          {/* SCHEDULE fields */}
          {actions.includes('schedule') && (
            <Section title="📅 Appointment" color="#16A34A">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <FI label="Date" value={form.schedDate} onChange={v=>set('schedDate',v)} type="date"/>
                <FI label="Time" value={form.schedTime} onChange={v=>set('schedTime',v)} type="time"/>
              </div>
              {form.address && <FI label="Location" value={form.address} onChange={v=>set('address',v)}/>}
            </Section>
          )}

          {actions.includes('contact') && (
            <div style={{background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.22)',borderRadius:'9px',padding:'9px 12px',marginBottom:'10px',display:'flex',gap:'7px',fontSize:'11px',color:'#D97706'}}>
              <span>⏰</span><span>A reminder will be created to complete the full profile.</span>
            </div>
          )}

          {actions.length===0 && <div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:'9px',padding:'10px 12px',marginBottom:'10px',fontSize:'12px',color:'#92400E'}}>⚠️ Select at least one item above to save.</div>}
          {speech.error && <ErrBox msg={speech.error}/>}

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
        <div style={{textAlign:'center',padding:'16px 8px'}}>
          <div style={{fontSize:'40px',marginBottom:'12px'}}>🎉</div>
          <div style={{fontSize:'15px',fontWeight:800,marginBottom:'12px'}}>{done.saved.length} item{done.saved.length!==1?'s':''} saved!</div>
          <div style={{background:'var(--dim)',borderRadius:'12px',padding:'12px',marginBottom:'12px',textAlign:'left'}}>
            {done.saved.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 0',borderBottom:i<done.saved.length-1?'1px solid var(--border)':'none',fontSize:'12px',fontWeight:600}}>
                <span>{s.type==='contact'?'👤':s.type==='task'?'✓':s.type==='schedule'?'📅':s.type==='reminder'?'⏰':'📝'}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          {(savedAudioURL||speech.audioURL) && <AudioPlayer url={savedAudioURL||speech.audioURL}/>}
          <div style={{display:'flex',gap:'8px',justifyContent:'center',marginTop:'14px'}}>
            <button onClick={()=>{reset();setMode(null)}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>🎤 Add Another</button>
            {onClose && <button onClick={onClose} style={{background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 20px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Done</button>}
          </div>
        </div>
      )}

      <style>{`@keyframes vcpulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.1);opacity:1}}`}</style>
    </div>
  )
}

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
  const color = mode==='lead'?'#CC2200':'#0EA5E9'
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:'7px',background:color+'10',borderRadius:'20px',padding:'5px 14px',marginBottom:'14px',border:'1px solid '+color+'25'}}>
      <span style={{fontSize:'13px'}}>{mode==='lead'?'👤':'📝'}</span>
      <span style={{fontSize:'12px',fontWeight:700,color}}>{mode==='lead'?'New Lead':'Quick Note'}</span>
      <button onClick={onClear} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'11px',marginLeft:'4px'}}>change</button>
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

function cleanTaskText(text) {
  return text.replace(/\b(remind me to|remember to|task|create task|add task|don't forget to|need to|have to|remind me|reminder)\b/gi,'').replace(/\s+/g,' ').trim()
}
