import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { nowISO } from '../lib/time'
import { logChange } from '../lib/activityLog'

// ── HELPERS ────────────────────────────────────────────────────
function extractPhone(text) {
  const m = text.match(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}|\d{10,11})/g)
  if(!m) return null
  const digits = m[0].replace(/\D/g,'')
  if(digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if(digits.length === 11 && digits[0]==='1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return m[0]
}

const FILLER_RE = /\b(my|name|is|i|am|this|call|me|its|it's|hi|hey|hello|the|a|an|and|or|with|number|phone|at|also|new|lead|contact|note|adding|add)\b/gi

function extractName(text) {
  const noPhone = text.replace(/\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g,'').replace(/\d{10,11}/g,'')
  const cleaned = noPhone.replace(FILLER_RE,' ').replace(/[^a-zA-Z\s]/g,' ').replace(/\s+/g,' ').trim()
  const words = cleaned.split(' ').filter(w => w.length > 1 && !/^(call|hi|hey|hello|am|is|my|the|a|at|or|and|new|add|note|lead)$/i.test(w))
  if(words.length === 0) return { first:'', last:'' }
  if(words.length === 1) return { first: cap(words[0]), last:'' }
  return { first: cap(words[0]), last: cap(words[words.length-1]) }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '' }

// ── SPEECH HOOK ────────────────────────────────────────────────
function useSpeech() {
  const [stage, setStage] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [secs, setSecs] = useState(0)
  const [error, setError] = useState('')
  const recRef = useRef(null)
  const timerRef = useRef(null)

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  function start(onDone) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if(!SR) { setError('Voice not supported. Use Chrome or Safari.'); return }
    setError(''); setTranscript(''); setInterim(''); setSecs(0)
    const r = new SR()
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true
    let final = ''
    r.onstart = () => { setStage('recording'); timerRef.current = setInterval(()=>setSecs(s=>s+1),1000) }
    r.onresult = e => {
      let tmp = ''
      for(let i=e.resultIndex;i<e.results.length;i++) {
        if(e.results[i].isFinal) final += e.results[i][0].transcript+' '
        else tmp += e.results[i][0].transcript
      }
      setTranscript(final); setInterim(tmp)
    }
    r.onerror = e => { if(e.error!=='no-speech') setError('Mic error: '+e.error); stop(onDone, final) }
    r.onend = () => { clearInterval(timerRef.current); onDone(final.trim()||transcript.trim()) }
    recRef.current = r
    r.start()
  }

  function stop(onDone, override) {
    clearInterval(timerRef.current)
    if(recRef.current) { recRef.current.stop(); recRef.current = null }
    setStage('processing')
    if(override !== undefined) onDone(override)
  }

  function manualStop() {
    if(recRef.current) recRef.current.stop()
    clearInterval(timerRef.current)
    setStage('processing')
  }

  useEffect(() => () => { clearInterval(timerRef.current); if(recRef.current) recRef.current.stop() }, [])

  return { stage, setStage, transcript, interim, secs, error, setError, supported, start, manualStop }
}

// ── MAIN COMPONENT ─────────────────────────────────────────────
export function VoiceCapture({ onClose, onSaved, contactId=null, contactName='' }) {
  const { state, toast } = useApp()
  const [mode, setMode] = useState(null) // null | 'lead' | 'note'
  const speech = useSpeech()
  const [extracted, setExtracted] = useState({ first:'', last:'', phone:'' })
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  function startCapture() {
    speech.start(text => {
      if(!text) { speech.setStage('idle'); speech.setError('Nothing heard — try again.'); return }
      if(mode==='lead') {
        const phone = extractPhone(text)
        const name = extractName(text)
        setExtracted({ first: name.first, last: name.last, phone: phone||'' })
        speech.setStage('review')
      } else {
        setNoteText(text.trim())
        speech.setStage('review')
      }
    })
  }

  async function saveLead() {
    if(!extracted.first && !extracted.phone) { speech.setError('Need a name or phone number.'); return }
    setSaving(true)
    const { data, error } = await supabase.from('contacts').insert([{
      first_name: extracted.first || 'Unknown',
      last_name:  extracted.last  || '',
      phone:      extracted.phone || '',
      status:     'New',
      source:     'Voice Capture',
      notes:      `Voice note recorded — needs full profile completion`,
      agent_id:   state.user?.id,
    }]).select()
    if(error) { speech.setError('Save failed: '+error.message); setSaving(false); return }
    await logChange({ recordType:'contact', recordId:data[0].id, recordName:(extracted.first+' '+extracted.last).trim()||'Voice Contact', action:'Created', agentName:state.currentAgent?.name||'Agent', userId:state.user?.id, extra:'Voice capture' })
    await supabase.from('tasks').insert([{
      title: `Complete profile — ${extracted.first||'Voice'} ${extracted.last||'Contact'}${extracted.phone?' ('+extracted.phone+')':''}`,
      priority: 'high', status: 'pending',
      due_date: new Date(Date.now()+86400000).toISOString().split('T')[0],
      assigned_to: state.user?.id, created_by: state.user?.id,
    }])
    setSaving(false); setDone(true)
    toast('✅ Contact saved + reminder created!')
    if(onSaved) onSaved(data[0])
  }

  async function saveNote() {
    if(!noteText.trim()) { speech.setError('No note to save.'); return }
    setSaving(true)
    if(contactId) {
      // Save note on existing contact via activity log
      await logChange({ recordType:'contact', recordId:contactId, recordName:contactName, action:'Note Added', agentName:state.currentAgent?.name||'Agent', userId:state.user?.id, extra:noteText.trim() })
    } else {
      // Save as a general task/note (no contact linked)
      await supabase.from('tasks').insert([{
        title: noteText.trim().slice(0,120),
        priority: 'normal', status: 'pending',
        assigned_to: state.user?.id, created_by: state.user?.id,
      }])
    }
    setSaving(false); setDone(true)
    toast(contactId ? '📝 Note saved on contact!' : '📝 Note saved as task!')
    if(onSaved) onSaved(null)
  }

  function reset() { speech.setStage('idle'); speech.setError(''); setExtracted({first:'',last:'',phone:''}); setNoteText(''); setDone(false); setSaving(false) }

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

  return (
    <div style={{fontFamily:'Inter,system-ui,sans-serif'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
        <div>
          <div style={{fontSize:'16px',fontWeight:800}}>🎤 Voice Capture</div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Speak to add a lead or save a note</div>
        </div>
        {onClose && <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1,padding:'4px'}}>✕</button>}
      </div>

      {/* MODE PICKER — shown first */}
      {!mode && speech.stage==='idle' && !done && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
            <ModeCard
              icon='👤'
              label='New Lead'
              desc='Say a name and phone number'
              color='#CC2200'
              onClick={()=>setMode('lead')}
            />
            <ModeCard
              icon='📝'
              label='Voice Note'
              desc={contactId ? `Add note on ${contactName||'contact'}` : 'Save a quick note or reminder'}
              color='#0EA5E9'
              onClick={()=>setMode('note')}
            />
          </div>
          {speech.error && <ErrBox msg={speech.error}/>}
        </div>
      )}

      {/* RECORDING UI */}
      {mode && (speech.stage==='idle'||speech.stage==='recording') && !done && (
        <div style={{textAlign:'center'}}>
          {/* Mode label */}
          <div style={{display:'inline-flex',alignItems:'center',gap:'7px',background:mode==='lead'?'rgba(204,34,0,.08)':'rgba(14,165,233,.08)',borderRadius:'20px',padding:'5px 14px',marginBottom:'16px',border:'1px solid '+(mode==='lead'?'rgba(204,34,0,.2)':'rgba(14,165,233,.2)')}}>
            <span style={{fontSize:'14px'}}>{mode==='lead'?'👤':'📝'}</span>
            <span style={{fontSize:'12px',fontWeight:700,color:mode==='lead'?'#CC2200':'#0EA5E9'}}>{mode==='lead'?'New Lead':'Voice Note'}</span>
            <button onClick={()=>{setMode(null);reset()}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'11px',marginLeft:'4px'}}>change</button>
          </div>

          {/* Prompt */}
          <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'20px',lineHeight:1.7}}>
            {mode==='lead'
              ? <>Say: <em style={{color:'var(--text)',fontWeight:600}}>"John Smith, 845-555-1234"</em></>
              : contactId
                ? <>Speak your note about <strong>{contactName}</strong></>
                : <>Speak a reminder or note</>
            }
          </div>

          {/* Mic button */}
          {speech.stage==='idle' ? (
            <button onClick={startCapture} style={{
              width:84,height:84,borderRadius:'50%',
              background:`linear-gradient(135deg,${mode==='lead'?'#CC2200,#E8650A':'#0EA5E9,#2563EB'})`,
              border:'none',fontSize:'36px',display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',margin:'0 auto 14px',boxShadow:`0 6px 24px ${mode==='lead'?'rgba(204,34,0,.35)':'rgba(14,165,233,.35)'}`,
              transition:'transform .15s'
            }}
              onMouseEnter={e=>e.currentTarget.style.transform='scale(1.07)'}
              onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
              🎤
            </button>
          ) : (
            <div style={{position:'relative',width:84,height:84,margin:'0 auto 14px'}}>
              <div style={{position:'absolute',inset:-10,borderRadius:'50%',border:`3px solid ${mode==='lead'?'rgba(204,34,0,.3)':'rgba(14,165,233,.3)'}`,animation:'vcpulse 1.2s ease-in-out infinite'}}/>
              <div style={{position:'absolute',inset:-22,borderRadius:'50%',border:`2px solid ${mode==='lead'?'rgba(204,34,0,.12)':'rgba(14,165,233,.12)'}`,animation:'vcpulse 1.2s ease-in-out infinite .4s'}}/>
              <button onClick={speech.manualStop} style={{
                width:'100%',height:'100%',borderRadius:'50%',
                background:`linear-gradient(135deg,${mode==='lead'?'#CC2200,#E8650A':'#0EA5E9,#2563EB'})`,
                border:'none',fontSize:'28px',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
                boxShadow:`0 4px 16px ${mode==='lead'?'rgba(204,34,0,.4)':'rgba(14,165,233,.4)'}`
              }}>⏹</button>
            </div>
          )}

          {speech.stage==='recording' && (
            <div style={{fontSize:'12px',fontWeight:700,color:mode==='lead'?'#CC2200':'#0EA5E9',marginBottom:'6px'}}>
              🔴 Recording · {fmt(speech.secs)}
            </div>
          )}
          <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'10px'}}>
            {speech.stage==='idle'?'Tap to start':'Tap to stop when done'}
          </div>

          {/* Live transcript */}
          {(speech.transcript||speech.interim) && (
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 13px',textAlign:'left',fontSize:'12px',lineHeight:1.8,maxHeight:'80px',overflowY:'auto'}}>
              <span>{speech.transcript}</span>
              <span style={{color:'var(--muted)',fontStyle:'italic'}}>{speech.interim}</span>
            </div>
          )}

          {speech.error && <ErrBox msg={speech.error}/>}
        </div>
      )}

      {/* PROCESSING */}
      {speech.stage==='processing' && (
        <div style={{textAlign:'center',padding:'24px'}}>
          <div style={{fontSize:'28px',marginBottom:'8px'}}>⚙️</div>
          <div style={{fontSize:'12px',color:'var(--muted)'}}>Processing speech...</div>
        </div>
      )}

      {/* REVIEW — LEAD */}
      {mode==='lead' && speech.stage==='review' && !done && (
        <div>
          <TranscriptBox text={speech.transcript}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
            <FI label="First Name" value={extracted.first} onChange={v=>setExtracted(e=>({...e,first:v}))} ph="John"/>
            <FI label="Last Name"  value={extracted.last}  onChange={v=>setExtracted(e=>({...e,last:v}))}  ph="Smith"/>
          </div>
          <FI label="Phone" value={extracted.phone} onChange={v=>setExtracted(e=>({...e,phone:v}))} ph="(845) 555-1234" type="tel"/>
          <ReminderBox text="A follow-up task will be created automatically to complete this contact's profile."/>
          {speech.error && <ErrBox msg={speech.error}/>}
          <ActionRow onRerecord={()=>{reset();setMode('lead')}} onSave={saveLead} saving={saving} saveLabel="Save Lead" color="#CC2200"/>
        </div>
      )}

      {/* REVIEW — NOTE */}
      {mode==='note' && speech.stage==='review' && !done && (
        <div>
          <TranscriptBox text={speech.transcript}/>
          <div style={{marginBottom:'12px'}}>
            <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Note Content</label>
            <textarea value={noteText} onChange={e=>setNoteText(e.target.value)} rows={4}
              style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 12px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.6}}
              onFocus={e=>e.target.style.borderColor='#0EA5E9'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          </div>
          {contactId && <div style={{background:'rgba(14,165,233,.07)',border:'1px solid rgba(14,165,233,.2)',borderRadius:'9px',padding:'9px 12px',marginBottom:'12px',fontSize:'11px',color:'#0EA5E9',display:'flex',gap:'7px'}}>
            <span>📌</span><span>This note will be saved on <strong>{contactName}</strong>'s activity log</span>
          </div>}
          {!contactId && <ReminderBox text="This note will be saved as a task in your Tasks board."/>}
          {speech.error && <ErrBox msg={speech.error}/>}
          <ActionRow onRerecord={()=>{reset();setMode('note')}} onSave={saveNote} saving={saving} saveLabel="Save Note" color="#0EA5E9"/>
        </div>
      )}

      {/* DONE */}
      {done && (
        <div style={{textAlign:'center',padding:'16px 10px'}}>
          <div style={{fontSize:'44px',marginBottom:'12px'}}>{mode==='lead'?'🎉':'✅'}</div>
          <div style={{fontSize:'15px',fontWeight:800,marginBottom:'5px'}}>{mode==='lead'?'Lead Saved!':'Note Saved!'}</div>
          {mode==='lead' && <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'4px'}}>{extracted.first} {extracted.last}{extracted.phone?' · '+extracted.phone:''}</div>}
          {mode==='lead' && <ReminderBox text="Task created to complete the full profile — check Tasks board."/>}
          {mode==='note' && contactId && <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'12px'}}>Note added to {contactName}'s activity log</div>}
          <div style={{display:'flex',gap:'8px',justifyContent:'center',marginTop:'4px'}}>
            <button onClick={()=>{reset();setMode(null)}} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              🎤 Add Another
            </button>
            {onClose && <button onClick={onClose} style={{background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 20px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Done</button>}
          </div>
        </div>
      )}

      <style>{`
        @keyframes vcpulse { 0%,100%{transform:scale(1);opacity:.5} 50%{transform:scale(1.1);opacity:1} }
      `}</style>
    </div>
  )
}

// ── SMALL HELPERS ──────────────────────────────────────────────
function ModeCard({ icon, label, desc, color, onClick }) {
  return (
    <div onClick={onClick} style={{background:'var(--dim)',border:'2px solid var(--border)',borderRadius:'14px',padding:'18px 14px',textAlign:'center',cursor:'pointer',transition:'all .15s'}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=color;e.currentTarget.style.background=color+'10'}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--dim)'}}>
      <div style={{fontSize:'32px',marginBottom:'8px'}}>{icon}</div>
      <div style={{fontSize:'14px',fontWeight:800,marginBottom:'4px',color}}>{label}</div>
      <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.5}}>{desc}</div>
    </div>
  )
}

function TranscriptBox({ text }) {
  if(!text) return null
  return (
    <div style={{background:'var(--dim)',borderRadius:'10px',padding:'10px 12px',marginBottom:'12px',fontSize:'12px',color:'var(--muted)',fontStyle:'italic',lineHeight:1.7}}>
      "{text.slice(0,200)}{text.length>200?'…':''}"
    </div>
  )
}

function ReminderBox({ text }) {
  return (
    <div style={{background:'rgba(245,158,11,.07)',border:'1px solid rgba(245,158,11,.22)',borderRadius:'9px',padding:'9px 12px',marginBottom:'12px',display:'flex',gap:'8px',alignItems:'flex-start'}}>
      <span style={{fontSize:'15px',flexShrink:0}}>⏰</span>
      <span style={{fontSize:'11px',color:'#D97706',lineHeight:1.6}}>{text}</span>
    </div>
  )
}

function ErrBox({ msg }) {
  return <div style={{marginBottom:'10px',fontSize:'11px',color:'#DC2626',background:'#FEF2F2',borderRadius:'8px',padding:'8px 10px',lineHeight:1.5}}>{msg}</div>
}

function FI({ label, value, onChange, ph, type='text' }) {
  return (
    <div style={{marginBottom:'10px'}}>
      <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph}
        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box'}}
        onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
    </div>
  )
}

function ActionRow({ onRerecord, onSave, saving, saveLabel, color }) {
  return (
    <div style={{display:'flex',gap:'8px',marginTop:'4px'}}>
      <button onClick={onRerecord} style={{flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--muted)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
        🎤 Re-record
      </button>
      <button onClick={onSave} disabled={saving} style={{flex:2,background:`linear-gradient(135deg,${color},${color+'CC'})`,border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:saving?'not-allowed':'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:saving?.7:1,boxShadow:`0 3px 12px ${color}44`}}>
        {saving?'Saving…':'✅ '+saveLabel}
      </button>
    </div>
  )
}
