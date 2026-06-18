import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { logChange } from '../lib/activityLog'
import { parseVoice } from '../lib/voiceParser'

// ── SPEECH HOOK ────────────────────────────────────────────────
function useSpeech() {
  const [stage, setStage]         = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim]     = useState('')
  const [secs, setSecs]           = useState(0)
  const [error, setError]         = useState('')
  const recRef   = useRef(null)
  const timerRef = useRef(null)
  const doneRef  = useRef(null)
  const finalRef = useRef('')

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function start(onDone) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if(!SR) { setError('Voice not supported. Please use Chrome or Safari.'); return }
    setError(''); setTranscript(''); setInterim(''); setSecs(0); finalRef.current = ''
    doneRef.current = onDone

    const r = new SR()
    r.lang = 'en-US'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1

    r.onstart  = () => { setStage('recording'); timerRef.current = setInterval(()=>setSecs(s=>s+1),1000) }

    r.onresult = e => {
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
    }

    r.onerror = e => {
      clearInterval(timerRef.current)
      if(e.error !== 'no-speech' && e.error !== 'aborted')
        setError('Mic error: ' + e.error + '. Make sure microphone access is allowed.')
    }

    r.onend = () => {
      clearInterval(timerRef.current)
      setInterim('')
      const final = finalRef.current.trim()
      if(doneRef.current) doneRef.current(final)
    }

    recRef.current = r
    r.start()
  }

  function manualStop() {
    clearInterval(timerRef.current)
    if(recRef.current) { recRef.current.stop(); recRef.current = null }
    setStage('processing')
  }

  useEffect(() => () => {
    clearInterval(timerRef.current)
    if(recRef.current) { try { recRef.current.abort() } catch(e) {} }
  }, [])

  return { stage, setStage, transcript, interim, secs, error, setError, supported, start, manualStop }
}

// ── MAIN COMPONENT ─────────────────────────────────────────────
export function VoiceCapture({ onClose, onSaved, contactId=null, contactName='' }) {
  const { state, toast } = useApp()
  const speech = useSpeech()
  const [mode, setMode]         = useState(null) // null | 'lead' | 'note'
  const [parsed, setParsed]     = useState(null)
  const [form, setForm]         = useState({ first:'', last:'', phone:'', note:'', taskTitle:'', taskDue:'', schedDate:'', schedTime:'', address:'' })
  const [actions, setActions]   = useState([]) // which actions to take: ['contact','task','schedule','note']
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(null) // { saved: [], message: '' }

  function startCapture() {
    speech.start(text => {
      if(!text) { speech.setStage('idle'); speech.setError('Nothing heard — try again.'); return }
      const result = parseVoice(text)
      setParsed(result)

      // Pre-fill form
      setForm({
        first:     result.name.first,
        last:      result.name.last,
        phone:     result.phone,
        note:      text,
        taskTitle: result.isTask||result.isReminder ? cleanTaskText(text) : '',
        taskDue:   result.dateTime.date || '',
        schedDate: result.dateTime.date || '',
        schedTime: result.dateTime.time || '',
        address:   result.addresses[0] || '',
      })

      // Auto-select actions based on detected intents
      const autoActions = []
      if(mode==='lead' && (result.name.first || result.phone)) autoActions.push('contact')
      if(result.isTask || result.isReminder) autoActions.push('task')
      if(result.isSchedule && !result.isTask) autoActions.push('schedule')
      if(mode==='note' && autoActions.length === 0) autoActions.push('note')
      if(autoActions.length === 0 && mode === 'lead') autoActions.push('contact')
      setActions(autoActions)

      speech.setStage('review')
    })
  }

  function toggleAction(a) {
    setActions(prev => prev.includes(a) ? prev.filter(x=>x!==a) : [...prev,a])
  }

  async function saveAll() {
    setSaving(true)
    const saved = []

    // 1. Save contact
    if(actions.includes('contact') && mode==='lead') {
      const { data, error } = await supabase.from('contacts').insert([{
        first_name: form.first || 'Unknown',
        last_name:  form.last  || '',
        phone:      form.phone || '',
        source:     'Voice Capture',
        notes:      `Voice note: "${form.note}" — needs full profile completion`,
        agent_id:   state.user?.id,
      }]).select()
      if(error) { speech.setError('Contact save failed: '+error.message); setSaving(false); return }
      await logChange({ recordType:'contact', recordId:data[0].id, recordName:(form.first+' '+form.last).trim()||'Voice Contact', action:'Created', agentName:state.currentAgent?.name||'Agent', userId:state.user?.id, extra:'Voice capture' })
      saved.push({ type:'contact', label: form.first+' '+form.last })
    }

    // 2. Save note on existing contact
    if(actions.includes('note') && contactId) {
      await logChange({ recordType:'contact', recordId:contactId, recordName:contactName, action:'Note Added', agentName:state.currentAgent?.name||'Agent', userId:state.user?.id, extra:form.note })
      saved.push({ type:'note', label:'Note saved on '+contactName })
    }

    // 3. Create task
    if(actions.includes('task') && form.taskTitle.trim()) {
      await supabase.from('tasks').insert([{
        title:       form.taskTitle.trim(),
        priority:    'high',
        status:      'pending',
        due_date:    form.taskDue || null,
        assigned_to: state.user?.id,
        created_by:  state.user?.id,
      }])
      saved.push({ type:'task', label:'Task: '+form.taskTitle.slice(0,40) })
    }

    // 4. Create schedule / appointment task
    if(actions.includes('schedule')) {
      const apptTitle = form.note.replace(/\b(schedule|appointment|meeting|showing)\b/gi,'').trim() || 'Appointment'
      await supabase.from('tasks').insert([{
        title:       apptTitle.slice(0,120),
        priority:    'normal',
        status:      'pending',
        due_date:    form.schedDate || null,
        assigned_to: state.user?.id,
        created_by:  state.user?.id,
      }])
      saved.push({ type:'schedule', label:`Appointment: ${form.schedDate||''}${form.schedTime?' at '+fmtTime(form.schedTime):''}` })
    }

    // 5. Always create reminder to complete contact profile
    if(actions.includes('contact')) {
      await supabase.from('tasks').insert([{
        title:       `Complete profile — ${form.first||'Voice'} ${form.last||'Contact'}${form.phone?' ('+form.phone+')':''}`,
        priority:    'high',
        status:      'pending',
        due_date:    new Date(Date.now()+86400000).toISOString().split('T')[0],
        assigned_to: state.user?.id,
        created_by:  state.user?.id,
      }])
      saved.push({ type:'reminder', label:'Reminder to complete profile' })
    }

    setSaving(false)
    setDone({ saved, message: `${saved.length} item${saved.length>1?'s':''} saved!` })
    if(onSaved) onSaved(saved)
  }

  function reset() {
    speech.setStage('idle'); speech.setError(''); setParsed(null)
    setForm({ first:'',last:'',phone:'',note:'',taskTitle:'',taskDue:'',schedDate:'',schedTime:'',address:'' })
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
      {!mode && speech.stage==='idle' && !done && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <ModeCard icon='👤' label='New Lead' desc='Name, phone, address, tasks' color='#CC2200' onClick={()=>setMode('lead')}/>
          <ModeCard icon='📝' label='Quick Note' desc={contactId?`Note on ${contactName||'contact'}`:'Note, task, or reminder'} color='#0EA5E9' onClick={()=>setMode('note')}/>
        </div>
      )}

      {/* RECORDING */}
      {mode && (speech.stage==='idle'||speech.stage==='recording') && !done && (
        <div style={{textAlign:'center'}}>
          <ModeBadge mode={mode} onClear={()=>{setMode(null);reset()}}/>
          <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'16px',lineHeight:1.8}}>
            {mode==='lead'
              ? <>Say name, phone, address, or any task/reminder<br/><em style={{color:'var(--text)',fontWeight:600,fontSize:'12px'}}>"John Smith 845-555-1234 — remind me to follow up tomorrow"</em></>
              : contactId
                ? <><em style={{color:'var(--text)',fontWeight:600}}>Speak a note or task for {contactName}</em></>
                : <>Say a note, task, or reminder<br/><em style={{color:'var(--text)',fontWeight:600,fontSize:'12px'}}>"Schedule showing at 47 Prairie Ave Wednesday at 2pm"</em></>
            }
          </div>

          {/* Mic button */}
          {speech.stage==='idle' ? (
            <MicBtn color={mode==='lead'?'#CC2200':'#0EA5E9'} onClick={startCapture} icon="🎤"/>
          ) : (
            <PulsingMicBtn color={mode==='lead'?'#CC2200':'#0EA5E9'} onClick={speech.manualStop} secs={speech.secs} fmt={fmt}/>
          )}

          {(speech.transcript||speech.interim) && (
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 13px',marginTop:'12px',textAlign:'left',fontSize:'12px',lineHeight:1.8}}>
              <span>{speech.transcript}</span>
              <span style={{color:'var(--muted)',fontStyle:'italic'}}>{speech.interim}</span>
            </div>
          )}
          {speech.error && <ErrBox msg={speech.error}/>}
        </div>
      )}

      {/* PROCESSING */}
      {speech.stage==='processing' && <Processing/>}

      {/* REVIEW */}
      {speech.stage==='review' && parsed && !done && (
        <div>
          {/* Transcript */}
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'9px 12px',marginBottom:'12px',fontSize:'11px',color:'var(--muted)',fontStyle:'italic',lineHeight:1.7}}>
            "{form.note.slice(0,180)}{form.note.length>180?'…':''}"
          </div>

          {/* What was detected */}
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Detected — select what to save:</div>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'14px'}}>
            {[
              mode==='lead' && (parsed.name.first||parsed.phone) ? { id:'contact', label:'👤 Contact', color:'#CC2200' } : null,
              contactId ? { id:'note', label:'📝 Note', color:'#0EA5E9' } : null,
              parsed.isTask||parsed.isReminder ? { id:'task', label:'✓ Task', color:'#7C3AED' } : null,
              parsed.isSchedule ? { id:'schedule', label:'📅 Schedule', color:'#16A34A' } : null,
              !contactId && !parsed.isTask && !parsed.isSchedule && mode==='note' ? { id:'note', label:'📝 Note', color:'#0EA5E9' } : null,
            ].filter(Boolean).map(a => (
              <div key={a.id} onClick={()=>toggleAction(a.id)}
                style={{padding:'6px 13px',borderRadius:'20px',border:'1.5px solid '+(actions.includes(a.id)?a.color:'var(--border)'),background:actions.includes(a.id)?a.color+'12':'transparent',cursor:'pointer',fontSize:'12px',fontWeight:700,color:actions.includes(a.id)?a.color:'var(--muted)',display:'flex',alignItems:'center',gap:'5px',transition:'all .12s'}}>
                {actions.includes(a.id) && <span style={{fontSize:'10px'}}>✓</span>}
                {a.label}
              </div>
            ))}
          </div>

          {/* CONTACT fields */}
          {actions.includes('contact') && mode==='lead' && (
            <Section title="👤 Contact" color="#CC2200">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <FI label="First Name" value={form.first} onChange={v=>set('first',v)} ph="John"/>
                <FI label="Last Name"  value={form.last}  onChange={v=>set('last',v)}  ph="Smith"/>
              </div>
              <FI label="Phone" value={form.phone} onChange={v=>set('phone',v)} ph="(845) 555-1234" type="tel"/>
              {parsed.addresses.length > 0 && (
                <FI label="Address detected" value={form.address} onChange={v=>set('address',v)} ph="Address"/>
              )}
            </Section>
          )}

          {/* NOTE fields */}
          {actions.includes('note') && (
            <Section title="📝 Note" color="#0EA5E9">
              <div>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Note Content</label>
                <textarea value={form.note} onChange={e=>set('note',e.target.value)} rows={3}
                  style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.6}}/>
              </div>
            </Section>
          )}

          {/* TASK fields */}
          {actions.includes('task') && (
            <Section title="✓ Task / Reminder" color="#7C3AED">
              <FI label="Task Title" value={form.taskTitle} onChange={v=>set('taskTitle',v)} ph="Follow up with John Smith"/>
              <FI label="Due Date" value={form.taskDue} onChange={v=>set('taskDue',v)} type="date"/>
            </Section>
          )}

          {/* SCHEDULE fields */}
          {actions.includes('schedule') && (
            <Section title="📅 Schedule / Appointment" color="#16A34A">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <FI label="Date" value={form.schedDate} onChange={v=>set('schedDate',v)} type="date"/>
                <FI label="Time" value={form.schedTime} onChange={v=>set('schedTime',v)} type="time"/>
              </div>
              {form.address && <FI label="Address / Location" value={form.address} onChange={v=>set('address',v)}/>}
            </Section>
          )}

          {speech.error && <ErrBox msg={speech.error}/>}

          {actions.length === 0 && (
            <div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:'9px',padding:'10px 12px',fontSize:'12px',color:'#92400E',marginBottom:'12px'}}>
              ⚠️ Select at least one action above to save something.
            </div>
          )}

          {/* Reminder notice if saving contact */}
          {actions.includes('contact') && (
            <div style={{background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.22)',borderRadius:'9px',padding:'9px 12px',marginBottom:'12px',display:'flex',gap:'7px',fontSize:'11px',color:'#D97706'}}>
              <span>⏰</span><span>A reminder task will be created automatically to complete the full profile.</span>
            </div>
          )}

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
          <div style={{fontSize:'15px',fontWeight:800,marginBottom:'12px'}}>{done.message}</div>
          <div style={{background:'var(--dim)',borderRadius:'12px',padding:'12px',marginBottom:'16px',textAlign:'left'}}>
            {done.saved.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 0',borderBottom:i<done.saved.length-1?'1px solid var(--border)':'none',fontSize:'12px',fontWeight:600}}>
                <span>{s.type==='contact'?'👤':s.type==='task'?'✓':s.type==='schedule'?'📅':s.type==='reminder'?'⏰':'📝'}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'center'}}>
            <button onClick={()=>{reset();setMode(null)}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>🎤 Add Another</button>
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
  const color = mode==='lead'?'#CC2200':'#0EA5E9'
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:'7px',background:color+'10',borderRadius:'20px',padding:'5px 14px',marginBottom:'16px',border:'1px solid '+color+'25'}}>
      <span style={{fontSize:'13px'}}>{mode==='lead'?'👤':'📝'}</span>
      <span style={{fontSize:'12px',fontWeight:700,color}}>{mode==='lead'?'New Lead':'Quick Note'}</span>
      <button onClick={onClear} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'11px'}}>change</button>
    </div>
  )
}
function MicBtn({ color, onClick, icon }) {
  return (
    <button onClick={onClick} style={{width:80,height:80,borderRadius:'50%',background:`linear-gradient(135deg,${color},${color}CC)`,border:'none',fontSize:'34px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',margin:'0 auto 14px',boxShadow:`0 6px 24px ${color}44`,transition:'transform .15s'}}
      onMouseEnter={e=>e.currentTarget.style.transform='scale(1.07)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
      {icon}
    </button>
  )
}
function PulsingMicBtn({ color, onClick, secs, fmt }) {
  return (
    <div style={{position:'relative',width:84,height:84,margin:'0 auto 12px'}}>
      <div style={{position:'absolute',inset:-10,borderRadius:'50%',border:`3px solid ${color}44`,animation:'vcpulse 1.2s ease-in-out infinite'}}/>
      <div style={{position:'absolute',inset:-22,borderRadius:'50%',border:`2px solid ${color}22`,animation:'vcpulse 1.2s ease-in-out infinite .4s'}}/>
      <button onClick={onClick} style={{width:'100%',height:'100%',borderRadius:'50%',background:`linear-gradient(135deg,${color},${color}CC)`,border:'none',fontSize:'28px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',boxShadow:`0 4px 16px ${color}55`}}>⏹</button>
      <div style={{position:'absolute',bottom:-22,left:'50%',transform:'translateX(-50%)',fontSize:'11px',fontWeight:700,color,whiteSpace:'nowrap'}}>🔴 {fmt(secs)}</div>
      <style>{`@keyframes vcpulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.1);opacity:1}}`}</style>
    </div>
  )
}
function Processing() {
  return <div style={{textAlign:'center',padding:'24px'}}><div style={{fontSize:'28px',marginBottom:'8px'}}>⚙️</div><div style={{fontSize:'12px',color:'var(--muted)'}}>Analyzing speech...</div></div>
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
function ErrBox({ msg }) { return <div style={{margin:'10px 0',fontSize:'11px',color:'#DC2626',background:'#FEF2F2',borderRadius:'8px',padding:'8px 10px',lineHeight:1.5}}>{msg}</div> }
function fmtTime(t) { const [h,m]=t.split(':').map(Number);const ap=h>=12?'PM':'AM';const h12=h%12||12;return `${h12}:${String(m).padStart(2,'0')} ${ap}` }
function cleanTaskText(text) { return text.replace(/\b(remind me to|remember to|task|create task|add task|don't forget to|need to|have to|remind me|reminder)\b/gi,'').replace(/\s+/g,' ').trim() }
