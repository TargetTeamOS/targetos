import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { AGENTS, SOURCES, PROPERTY_TYPES, CONTACT_TYPES } from '../lib/constants'
import { Badge, Btn, Input, Select, Grid2, Grid3 } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { nowISO, formatActivity, formatTime } from '../lib/time'
import { logChange, logFieldChanges } from '../lib/activityLog'
import { VoiceCapture } from '../components/VoiceCapture'
import { sendContactEmail } from '../lib/email'
import { RecordActivityFeed } from '../components/RecordActivityFeed'

const fmt$ = n => '$' + Number(n).toLocaleString()
const roleColor = r => ({buyer:'#0EA5E9',seller:'#10B981',investor:'#7C3AED',tenant:'#F59E0B'}[r]||'#64748B')

export function ContactDetail({ contactId, onBack }) {
  const { state, toast, log } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('NOTE')
  const [noteText, setNoteText] = useState('')
  const [activities, setActivities] = useState([
    { type:'note', icon:'📝', color:'#0EA5E9', title:'Contact created in TargetOS', time:'Today', detail:'' },
  ])
  const [editField, setEditField] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingAll, setEditingAll] = useState(false)
  const [localActivity, setLocalActivity] = useState([])
  const [showVoiceNote, setShowVoiceNote] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('contacts').select('*').eq('id', contactId).single()
      if(data) { setContact(data); setForm(data) }
      setLoading(false)
    }
    load()
  }, [contactId])

  async function saveField(key, val) {
    const oldVal = contact[key]
    const { data, error } = await supabase.from('contacts').update({[key]: val}).eq('id', contactId).select()
    if(error) { toast('Error: '+error.message, '#DC2626'); return }
    setContact(prev => ({...prev, [key]: val}))
    setEditField(null)
    toast('Saved!')
    // Log the change with before/after
    const agentName = agent?.name || 'Admin'
    await logChange({
      recordType: 'contact',
      recordId: contactId,
      recordName: contact.first_name+' '+(contact.last_name||''),
      action: 'Updated',
      field: key,
      oldValue: oldVal,
      newValue: val,
      agentName,
      userId: agent?.id,
    })
  }

  async function saveAll() {
    setSaving(true)
    const updates = { ...form, budget_max: form.budget_max ? parseFloat(form.budget_max) : null, budget_min: form.budget_min ? parseFloat(form.budget_min) : null }
    const { data, error } = await supabase.from('contacts').update(updates).eq('id', contactId).select()
    setSaving(false)
    if(error) { toast('Error: '+error.message, '#DC2626'); return }
    const agentName = agent?.name || 'Admin'
    await logFieldChanges({
      recordType: 'contact',
      recordId: contactId,
      recordName: contact.first_name+' '+(contact.last_name||''),
      before: contact,
      after: updates,
      agentName,
      userId: agent?.id,
    })
    setContact(data[0]); setForm(data[0]); setEditingAll(false)
    toast('Contact saved!')
  }

  function addActivity(type, icon, color, title, detail='') {
    const entry = { type, icon, color, title, detail, time: formatActivity(nowISO()), action: title.split(':')[0]||'Note Added', agent_name: agent?.name||'Admin', created_at: nowISO() }
    setActivities(prev => [entry, ...prev])
    setLocalActivity(prev => [entry, ...prev])
    // Log to DB
    const agentName = agent?.name || 'Admin'
    logChange({ recordType:'contact', recordId:contactId, recordName:contact?.first_name+' '+(contact?.last_name||''), action:title.split(':')[0]||'Note Added', field:null, agentName, userId:agent?.id, extra:title })
  }

  function saveNote() {
    if(!noteText.trim()) return
    addActivity('note','📝','#0EA5E9', noteText.trim())
    setNoteText('')
    toast('Note saved!')
  }

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{color:'var(--muted)',fontSize:'13px'}}>Loading...</div>
    </div>
  )
  if(!contact) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <Btn onClick={onBack}>← Back to Contacts</Btn>
    </div>
  )

  const ag = AGENTS.find(a => a.name === contact.assigned_agent)
  const initials = ((contact.first_name||'?')[0] + (contact.last_name||'?')[0]).toUpperCase()

  return (
    <div style={{height:'calc(100vh - 110px)', display:'flex', flexDirection:'column'}}>
      <ConfirmDialog/>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px',flexShrink:0}}>
        <button onClick={onBack} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'13px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',fontWeight:600,display:'flex',alignItems:'center',gap:'5px',padding:'6px 0'}}
          onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
          ← Contact Details
        </button>
      </div>

      {/* Three-column layout */}
      <div style={{display:'grid',gridTemplateColumns:'260px 1fr 280px',gap:'14px',flex:1,overflow:'hidden'}}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────── */}
        <div style={{overflowY:'auto',display:'flex',flexDirection:'column',gap:'12px'}}>

          {/* Profile card */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',position:'relative'}}>
            {/* Edit button */}
            <button onClick={()=>setEditingAll(e=>!e)} style={{position:'absolute',top:12,right:12,background:'none',border:'1px solid var(--border)',borderRadius:'7px',color:'var(--muted)',fontSize:'11px',padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              {editingAll ? '✕' : '✏️ Edit'}
            </button>

            {/* Photo */}
            <div style={{position:'relative',display:'inline-block',marginBottom:'12px'}}>
              <div style={{width:80,height:80,borderRadius:'50%',background:roleColor(contact.role),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'26px',fontWeight:900,color:'#fff',margin:'0 auto',boxShadow:'0 4px 16px rgba(0,0,0,.12)'}}>
                {contact.photo ? <img src={contact.photo} alt="" style={{width:80,height:80,borderRadius:'50%',objectFit:'cover'}}/> : initials}
              </div>
              <label style={{position:'absolute',bottom:0,right:0,width:24,height:24,borderRadius:'50%',background:'var(--red)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'13px',boxShadow:'0 2px 6px rgba(0,0,0,.2)'}}>
                📷
                <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                  const file=e.target.files[0]; if(!file)return
                  const r=new FileReader(); r.onload=ev=>{setContact(prev=>({...prev,photo:ev.target.result}));toast('Photo updated!')}; r.readAsDataURL(file)
                }}/>
              </label>
            </div>

            <div style={{fontSize:'17px',fontWeight:800,marginBottom:'3px'}}>{contact.first_name} {contact.last_name||''}</div>
            <div style={{fontSize:'11px',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'8px'}}>SOURCE: {contact.source||'—'}</div>
            <Badge label={contact.status||'New'}/>
            {contact.tag && <div style={{marginTop:'5px'}}><span style={{fontSize:'10px',background:'rgba(245,166,35,.15)',color:'#D97706',padding:'2px 9px',borderRadius:'20px',fontWeight:600}}>{contact.tag}</span></div>}
          </div>

          {/* Quick stats */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:'0'}}>
              {[
                ['Last Interaction','Today'],
                ['Stage', contact.status||'New'],
                ['Type', contact.role||'—'],
                ['Agent', ag ? ag.name.split(' ')[0] : 'Unassigned'],
                ['Budget', contact.budget_max ? fmt$(contact.budget_max) : '—'],
              ].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontSize:'11px',color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.5px'}}>{k}</span>
                  <span style={{fontSize:'12px',fontWeight:600,textAlign:'right',maxWidth:'130px',wordBreak:'break-word'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              Contact Info
            </div>
            {[
              ['📧','email','Email',contact.email,'email'],
              ['📧','email2','Email 2',contact.email2,'email'],
              ['📞','phone','Phone',contact.phone,'tel'],
              ['📞','phone2','Phone 2',contact.phone2,'tel'],
              ['🏙','city','City',contact.city,'text'],
            ].map(([icon,key,label,val,type])=>(
              <div key={key} style={{marginBottom:'8px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>{icon} {label}</div>
                {editField===key ? (
                  <div style={{display:'flex',gap:'5px'}}>
                    <input value={editVal} onChange={e=>setEditVal(e.target.value)} type={type}
                      style={{flex:1,background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'7px',color:'var(--text)',fontSize:'12px',padding:'6px 9px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}
                      onKeyDown={e=>{if(e.key==='Enter')saveField(key,editVal); if(e.key==='Escape')setEditField(null)}}
                      autoFocus/>
                    <button onClick={()=>saveField(key,editVal)} style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'5px 8px',cursor:'pointer'}}>✓</button>
                    <button onClick={()=>setEditField(null)} style={{background:'var(--dim)',border:'none',borderRadius:'6px',color:'var(--muted)',fontSize:'11px',padding:'5px 8px',cursor:'pointer'}}>✕</button>
                  </div>
                ) : (
                  <div onClick={()=>{setEditField(key);setEditVal(val||'')}} style={{fontSize:'13px',fontWeight:600,cursor:'pointer',padding:'5px 8px',borderRadius:'7px',display:'flex',justifyContent:'space-between',alignItems:'center',background:'transparent'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span>{val||<span style={{color:'var(--muted)',fontWeight:400,fontSize:'12px'}}>Click to add...</span>}</span>
                    <span style={{color:'var(--muted)',fontSize:'10px',opacity:.6}}>✏</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Property Criteria */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px'}}>Property Criteria</div>
            {[
              ['preferred_areas','Areas',contact.preferred_areas,'text'],
              ['property_type_interest','Type',contact.property_type_interest,'text'],
              ['budget_max','Max Budget ($)',contact.budget_max,'number'],
              ['budget_min','Min Budget ($)',contact.budget_min,'number'],
              ['min_beds','Min Beds',contact.min_beds,'number'],
            ].map(([key,label,val])=>(
              <div key={key} style={{marginBottom:'8px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>{label}</div>
                {editField===key ? (
                  <div style={{display:'flex',gap:'5px'}}>
                    <input value={editVal} onChange={e=>setEditVal(e.target.value)}
                      style={{flex:1,background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'7px',color:'var(--text)',fontSize:'12px',padding:'6px 9px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}
                      onKeyDown={e=>{if(e.key==='Enter')saveField(key,editVal); if(e.key==='Escape')setEditField(null)}} autoFocus/>
                    <button onClick={()=>saveField(key,editVal)} style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'5px 8px',cursor:'pointer'}}>✓</button>
                    <button onClick={()=>setEditField(null)} style={{background:'var(--dim)',border:'none',borderRadius:'6px',color:'var(--muted)',fontSize:'11px',padding:'5px 8px',cursor:'pointer'}}>✕</button>
                  </div>
                ) : (
                  <div onClick={()=>{setEditField(key);setEditVal(val||'')}} style={{fontSize:'13px',fontWeight:600,cursor:'pointer',padding:'5px 8px',borderRadius:'7px',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span>{val||<span style={{color:'var(--muted)',fontWeight:400,fontSize:'12px'}}>Click to add...</span>}</span>
                    <span style={{color:'var(--muted)',fontSize:'10px',opacity:.6}}>✏</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER — ACTIVITY FEED ────────────────────────────── */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* Action tabs */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'12px',flexShrink:0}}>
            {/* Tab bar */}
            <div style={{display:'flex',gap:'0',borderBottom:'1px solid var(--border)',marginBottom:'14px'}}>
              {['NOTE','EMAIL','CALL','TEXT','APPOINTMENT','OTHER'].map(t=>(
                <button key={t} onClick={()=>setActiveTab(t)}
                  style={{padding:'8px 14px',background:'transparent',border:'none',fontFamily:'Inter,system-ui,sans-serif',fontSize:'12px',fontWeight:700,cursor:'pointer',color:activeTab===t?'#CC2200':'var(--muted)',borderBottom:activeTab===t?'2px solid #CC2200':'2px solid transparent',letterSpacing:'.3px'}}>
                  {t}
                </button>
              ))}
            </div>

            {/* Note input */}
            {activeTab==='NOTE' && (
              <>
                <textarea value={noteText} onChange={e=>setNoteText(e.target.value)}
                  placeholder="Write a note or use @ to notify someone on your team"
                  style={{width:'100%',minHeight:'90px',background:'transparent',border:'none',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',resize:'none',outline:'none',lineHeight:1.6,boxSizing:'border-box'}}/>
                <div style={{display:'flex',justifyContent:'flex-end',marginTop:'8px'}}>
                  <Btn onClick={saveNote} disabled={!noteText.trim()}>SAVE</Btn>
              <Btn size="sm" variant="ghost" onClick={()=>setShowVoiceNote(v=>!v)}>🎤</Btn>
                </div>
              </>
            )}
            {/* Voice note capture */}
            {showVoiceNote && activeTab==='NOTE' && (
              <div style={{background:'var(--dim)',borderRadius:'12px',padding:'16px',marginBottom:'12px'}}>
                <VoiceCapture
                  contactId={contactId}
                  contactName={contact?.first_name+' '+(contact?.last_name||'')}
                  onClose={()=>setShowVoiceNote(false)}
                  onSaved={()=>{setShowVoiceNote(false);addActivity('note','📝','#0EA5E9','Voice note saved')}}
                />
              </div>
            )}

            {activeTab==='CALL' && (
              <div>
                <input placeholder="Call outcome / notes..." style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none',marginBottom:'10px',boxSizing:'border-box'}}
                  onKeyDown={e=>{ if(e.key==='Enter'&&e.target.value.trim()){ addActivity('call','📞','#10B981','Call logged: '+e.target.value.trim()); e.target.value=''; toast('Call logged!') }}}/>
                <div style={{display:'flex',gap:'8px'}}>
                  {contact.phone && <a href={'tel:'+contact.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}><Btn size="sm">📞 Call {contact.phone}</Btn></a>}
                  <Btn size="sm" variant="ghost" onClick={()=>{ addActivity('call','📞','#10B981','Call logged'); toast('Call logged!') }}>Log Call</Btn>
                </div>
              </div>
            )}
            {activeTab==='TEXT' && (
              <div>
                <textarea placeholder="Write a text message..." style={{width:'100%',minHeight:'70px',background:'transparent',border:'none',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',resize:'none',outline:'none',boxSizing:'border-box',marginBottom:'8px'}} id="textMsg"/>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  {contact.phone && <a href={'sms:'+contact.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}><Btn size="sm">💬 Send Text</Btn></a>}
                  <Btn size="sm" onClick={()=>{ const msg=document.getElementById('textMsg').value.trim(); if(msg){ addActivity('text','💬','#7C3AED','Text sent: '+msg); document.getElementById('textMsg').value=''; toast('Text logged!') }}}>Log Text</Btn>
                </div>
              </div>
            )}
            {activeTab==='EMAIL' && (
              <div>
                <input data-email-subject placeholder="Subject..." style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none',marginBottom:'8px',boxSizing:'border-box'}}/>
                <textarea data-email-body placeholder="Email body..." style={{width:'100%',minHeight:'70px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none',resize:'none',boxSizing:'border-box',marginBottom:'8px'}}/>
                <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                  {contact.email && <a href={'mailto:'+contact.email} style={{textDecoration:'none'}}><Btn size="sm">✉ Open Email</Btn></a>}
                  <Btn size="sm" onClick={async()=>{
              const subj = document.querySelector('[data-email-subject]')?.value || 'Message from Target Team'
              const body = document.querySelector('[data-email-body]')?.value || ''
              if(!contact.email) { toast('No email on file for this contact','#DC2626'); return }
              if(!body.trim()) { toast('Please write a message first','#DC2626'); return }
              const result = await sendContactEmail({ contactEmail:contact.email, contactName:contact.first_name+' '+(contact.last_name||''), subject:subj, body, agentName:agent?.name||'Agent' })
              if(result.success) { addActivity('email','✉','#E8650A','Email sent: '+subj); toast('✅ Email sent to '+contact.email+'!') }
              else toast('Send failed: '+result.error,'#DC2626')
            }}>✉ Send Email</Btn>
                </div>
              </div>
            )}
            {activeTab==='APPOINTMENT' && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <input type="text" placeholder="Appointment title..." style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}} id="apptTitle"/>
                <input type="date" style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}} id="apptDate"/>
                <input type="time" defaultValue="10:00" style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}} id="apptTime"/>
                <input type="text" placeholder="Location..." style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}} id="apptLoc"/>
                <Btn onClick={()=>{
                  const t=document.getElementById('apptTitle').value.trim()
                  const d=document.getElementById('apptDate').value
                  const ti=document.getElementById('apptTime').value
                  if(!t)return
                  addActivity('appt','📅','#F59E0B','Appointment: '+t+(d?' on '+d:'')+(ti?' at '+ti:''))
                  toast('Appointment scheduled!')
                  document.getElementById('apptTitle').value=''
                }}>Schedule</Btn>
              </div>
            )}
            {activeTab==='OTHER' && (
              <div>
                <textarea placeholder="Log any other activity..." style={{width:'100%',minHeight:'70px',background:'transparent',border:'none',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',resize:'none',outline:'none',boxSizing:'border-box'}} id="otherTxt"/>
                <div style={{display:'flex',justifyContent:'flex-end'}}>
                  <Btn size="sm" onClick={()=>{ const v=document.getElementById('otherTxt').value.trim(); if(v){ addActivity('other','⚡','#94A3B8',v); document.getElementById('otherTxt').value=''; toast('Activity logged!') }}}>Log Activity</Btn>
                </div>
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            {/* Filter bar */}
            <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',gap:'6px',flexShrink:0,overflowX:'auto'}}>
              {['ALL','📝','✉','📞','💬','📅'].map((f,i)=>(
                <button key={f} style={{padding:'5px 12px',borderRadius:'20px',border:'1.5px solid var(--border)',background:i===0?'#CC2200':'var(--dim)',color:i===0?'#fff':'var(--text)',fontSize:'11px',fontWeight:600,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',flexShrink:0}}>
                  {f === 'ALL' ? 'ALL' : f}
                  {i>0 && <span style={{marginLeft:'4px',fontSize:'10px',color:i===0?'rgba(255,255,255,.7)':'var(--muted)'}}>{activities.filter(a=>a.icon===f).length}</span>}
                </button>
              ))}
            </div>

            {/* Activity Feed — full audit trail */}
            <div style={{overflowY:'auto',flex:1,padding:'14px'}}>
              <RecordActivityFeed
                recordType="contact"
                recordId={contactId}
                localEntries={localActivity}
              />
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────── */}
        <div style={{overflowY:'auto',display:'flex',flexDirection:'column',gap:'12px'}}>

          {/* Assigned To */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              Assigned To
              <button onClick={()=>setEditField('assigned_agent')} style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'10px',fontWeight:700,padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>MANAGE</button>
            </div>
            {editField==='assigned_agent' ? (
              <div>
                <select value={editVal||contact.assigned_agent||''} onChange={e=>setEditVal(e.target.value)}
                  style={{width:'100%',background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px',outline:'none',marginBottom:'8px'}}>
                  <option value="">Unassigned</option>
                  {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                <div style={{display:'flex',gap:'6px'}}>
                  <Btn size="sm" onClick={()=>saveField('assigned_agent',editVal||contact.assigned_agent)}>Save</Btn>
                  <Btn size="sm" variant="ghost" onClick={()=>setEditField(null)}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px',borderRadius:'9px',background:'var(--dim)'}}>
                {ag
                  ? <div style={{width:36,height:36,borderRadius:'9px',background:ag.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:'#fff',flexShrink:0}}>{ag.ini}</div>
                  : <div style={{width:36,height:36,borderRadius:'9px',background:'var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',color:'var(--muted)',flexShrink:0}}>?</div>
                }
                <div>
                  <div style={{fontSize:'13px',fontWeight:700}}>{ag ? ag.name : 'Unassigned'}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{ag ? ag.role.charAt(0).toUpperCase()+ag.role.slice(1)+' · Ext '+ag.ext : 'No agent assigned'}</div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px'}}>Quick Actions</div>
            <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
              {contact.phone && (
                <a href={'tel:'+contact.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}>
                  <button style={{width:'100%',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:'8px'}}>📞 Call {contact.phone}</button>
                </a>
              )}
              {contact.phone && (
                <a href={'sms:'+contact.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}>
                  <button style={{width:'100%',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:'8px'}}>💬 Text {contact.phone}</button>
                </a>
              )}
              {contact.email && (
                <a href={'mailto:'+contact.email} style={{textDecoration:'none'}}>
                  <button style={{width:'100%',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:'8px'}}>✉ Email {contact.email}</button>
                </a>
              )}
              <button onClick={()=>{ window.open('https://calendar.google.com/calendar/r/eventedit?text='+encodeURIComponent('Meeting - '+contact.first_name+' '+(contact.last_name||'')),'_blank') }}
                style={{width:'100%',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:'8px'}}>📅 Schedule Appointment</button>
              <button onClick={()=>setActiveTab('NOTE')}
                style={{width:'100%',background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',textAlign:'left',display:'flex',alignItems:'center',gap:'8px'}}>📝 Add Note</button>
            </div>
          </div>

          {/* Agreements */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px'}}>Agreements</div>
            {[['+ BUYER','#CC2200'],['+ SELLER','#1B2B4B'],['+ REFERRAL','#7C3AED']].map(([l,c])=>(
              <button key={l} onClick={()=>addActivity('doc','📄','#64748B',l.slice(2)+' agreement added')}
                style={{width:'100%',background:'transparent',border:'1px solid var(--border)',borderRadius:'9px',color:c,fontSize:'12px',fontWeight:700,padding:'10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',textAlign:'center',marginBottom:'7px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                {l}
              </button>
            ))}
          </div>

          {/* Listing Alert */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              Listing Alert
              <button onClick={()=>{ const minp=contact.budget_min||0; const maxp=contact.budget_max||0; addActivity('alert','🔔','#F59E0B','Listing alert set: '+fmt$(minp)+' – '+fmt$(maxp)); toast('Alert set!') }}
                style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'10px',fontWeight:700,padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>+ SET</button>
            </div>
            <div style={{fontSize:'12px',color:'var(--muted)',lineHeight:1.6}}>
              Budget: {contact.budget_max ? fmt$(contact.budget_min||0)+' – '+fmt$(contact.budget_max) : 'Not set'}<br/>
              Area: {contact.preferred_areas || 'Not set'}<br/>
              Type: {contact.property_type_interest || 'Any'}
            </div>
          </div>

          {/* Tasks */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              Tasks
              <button onClick={()=>{ const t=prompt('New task:'); if(t){ addActivity('task','✓','#10B981','Task added: '+t) }}}
                style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'10px',fontWeight:700,padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>+ ADD</button>
            </div>
            <div style={{fontSize:'12px',color:'var(--muted)'}}>
              {activities.filter(a=>a.type==='task').length===0 ? 'No tasks yet' : activities.filter(a=>a.type==='task').map((t,i)=>(
                <div key={i} style={{padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:'12px',color:'var(--text)'}}>{t.title.replace('Task added: ','')}</div>
              ))}
            </div>
          </div>

          {/* Notes summary */}
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'8px'}}>All Notes</div>
            <div style={{fontSize:'11px',color:'var(--muted)',fontStyle:'italic',lineHeight:1.6}}>
              {contact.notes || 'No notes on file.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
