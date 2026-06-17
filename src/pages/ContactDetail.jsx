import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { AGENTS, SOURCES, PROPERTY_TYPES, CONTACT_TYPES } from '../lib/constants'
import { Card, CardHeader, Badge, Avatar, Btn, Input, Select, Grid2, Grid3 } from '../components/UI'

const fmt$ = n => '$' + Number(n).toLocaleString()
const roleColor = r => ({buyer:'#0EA5E9',seller:'#10B981',investor:'#7C3AED',tenant:'#F59E0B'}[r]||'#64748B')

const TABS = ['Overview','Activity','Tasks','Appointments','Documents','Listing Alert','Deals']

export function ContactDetail({ contactId, onBack }) {
  const { state, toast, log } = useApp()
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Overview')
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [appts, setAppts] = useState([])
  const [docs, setDocs] = useState([])
  const [alerts, setAlerts] = useState([])
  const [showApptForm, setShowApptForm] = useState(false)
  const [apptForm, setApptForm] = useState({title:'',date:'',time:'10:00',location:''})

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('contacts').select('*').eq('id', contactId).single()
      if(data) { setContact(data); setForm(data) }
      setLoading(false)
    }
    load()
  }, [contactId])

  async function save() {
    setSaving(true)
    const updates = {
      ...form,
      budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
      budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
      min_beds:   form.min_beds   ? parseInt(form.min_beds)      : null,
    }
    const { data, error } = await supabase.from('contacts').update(updates).eq('id', contactId).select()
    setSaving(false)
    if(error) { toast('Error: '+error.message, '#DC2626'); return }
    setContact(data[0])
    setForm(data[0])
    setEditMode(false)
    toast('Contact saved!')
    log({ cat:'contact', action:'Updated', subject: form.first_name+' '+(form.last_name||''), detail:'Contact details updated' })
  }

  function set(k,v) { setForm(f=>({...f,[k]:v})) }

  if(loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{color:'var(--muted)',fontSize:'13px'}}>Loading contact...</div>
    </div>
  )
  if(!contact) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'32px',marginBottom:'12px'}}>👤</div>
        <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px'}}>Contact not found</div>
        <Btn onClick={onBack}>← Back to Contacts</Btn>
      </div>
    </div>
  )

  const ag = AGENTS.find(a=>a.name===contact.assigned_agent)

  return (
    <div style={{maxWidth:'900px',margin:'0 auto'}}>
      {/* Back button */}
      <button onClick={onBack} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'13px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',fontWeight:600,marginBottom:'16px',display:'flex',alignItems:'center',gap:'6px',padding:'6px 0'}}
        onMouseEnter={e=>e.currentTarget.style.color='var(--text)'} onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
        ← Back to Contacts
      </button>

      {/* Hero header */}
      <Card style={{marginBottom:'16px',overflow:'hidden'}}>
        <div style={{background:'linear-gradient(135deg, #1B2B4B, #0F1A2E)',padding:'28px 28px 22px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
              <div style={{width:64,height:64,borderRadius:'16px',background:roleColor(contact.role),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',fontWeight:900,color:'#fff',flexShrink:0,boxShadow:'0 4px 16px rgba(0,0,0,.3)'}}>
                {(contact.first_name||'?')[0]}{(contact.last_name||'?')[0]}
              </div>
              <div>
                <div style={{fontSize:'24px',fontWeight:900,color:'#fff',marginBottom:'6px'}}>
                  {contact.first_name} {contact.last_name||''}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                  <span style={{fontSize:'11px',fontWeight:600,padding:'3px 10px',borderRadius:'20px',background:contact.status==='Hot'?'rgba(220,38,38,.2)':contact.status==='Active'?'rgba(22,163,74,.2)':'rgba(255,255,255,.15)',color:contact.status==='Hot'?'#FCA5A5':contact.status==='Active'?'#86EFAC':'rgba(255,255,255,.8)'}}>{contact.status||'New'}</span>
                  <span style={{fontSize:'12px',color:'rgba(255,255,255,.6)',textTransform:'capitalize'}}>{contact.role||'contact'}</span>
                  {contact.tag && <span style={{fontSize:'11px',background:'rgba(245,166,35,.2)',color:'#F5A623',padding:'3px 10px',borderRadius:'20px'}}>{contact.tag}</span>}
                  {contact.source && <span style={{fontSize:'11px',background:'rgba(255,255,255,.1)',color:'rgba(255,255,255,.7)',padding:'3px 10px',borderRadius:'20px'}}>{contact.source}</span>}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {contact.phone && (
                <a href={'tel:'+contact.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}>
                  <button style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',display:'flex',alignItems:'center',gap:'6px'}}>
                    📞 Call
                  </button>
                </a>
              )}
              {contact.phone && (
                <a href={'sms:'+contact.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}>
                  <button style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',display:'flex',alignItems:'center',gap:'6px'}}>
                    💬 Text
                  </button>
                </a>
              )}
              {contact.email && (
                <a href={'mailto:'+contact.email} style={{textDecoration:'none'}}>
                  <button style={{background:'rgba(124,58,237,.4)',border:'1px solid rgba(124,58,237,.5)',borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',display:'flex',alignItems:'center',gap:'6px'}}>
                    ✉ Email
                  </button>
                </a>
              )}
              <button onClick={()=>setEditMode(e=>!e)} style={{background:editMode?'#CC2200':'rgba(255,255,255,.15)',border:'1px solid '+(editMode?'#CC2200':'rgba(255,255,255,.2)'),borderRadius:'10px',color:'#fff',fontSize:'12px',fontWeight:600,padding:'9px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                {editMode ? '✕ Cancel Edit' : '✏️ Edit'}
              </button>
            </div>
          </div>

          {/* Quick stats bar */}
          <div style={{display:'flex',gap:'20px',marginTop:'20px',paddingTop:'18px',borderTop:'1px solid rgba(255,255,255,.1)',flexWrap:'wrap'}}>
            {[
              ['Phone',    contact.phone||'—'],
              ['Email',    contact.email||'—'],
              ['Budget',   contact.budget_max?fmt$(contact.budget_max):'—'],
              ['Areas',    contact.preferred_areas||'—'],
              ['Agent',    ag?ag.name:'Unassigned'],
            ].map(([k,v])=>(
              <div key={k}>
                <div style={{fontSize:'9px',fontWeight:700,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'2px'}}>{k}</div>
                <div style={{fontSize:'12px',fontWeight:600,color:'rgba(255,255,255,.9)'}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--panel)',overflowX:'auto'}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>{setTab(t);setEditMode(false)}}
              style={{padding:'13px 18px',background:'transparent',border:'none',fontFamily:'Inter,system-ui,sans-serif',fontSize:'13px',fontWeight:600,cursor:'pointer',color:tab===t?'#CC2200':'var(--muted)',borderBottom:tab===t?'2px solid #CC2200':'2px solid transparent',whiteSpace:'nowrap',transition:'color .12s'}}>
              {t}
            </button>
          ))}
        </div>
      </Card>

      {/* Tab content */}
      {tab==='Overview' && (
        editMode ? (
          // EDIT FORM
          <Card style={{padding:'24px'}}>
            <div style={{fontSize:'14px',fontWeight:800,marginBottom:'18px'}}>Edit Contact</div>

            <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Basic Information</div>
            <Grid2 gap={12}><Input label="First Name *" value={form.first_name||''} onChange={e=>set('first_name',e.target.value)}/><Input label="Last Name" value={form.last_name||''} onChange={e=>set('last_name',e.target.value)}/></Grid2>
            <Grid2 gap={12}><Input label="Phone" value={form.phone||''} onChange={e=>set('phone',e.target.value)} type="tel"/><Input label="Additional Phone" value={form.phone2||''} onChange={e=>set('phone2',e.target.value)} type="tel"/></Grid2>
            <Grid2 gap={12}><Input label="Email" value={form.email||''} onChange={e=>set('email',e.target.value)} type="email"/><Input label="Additional Email" value={form.email2||''} onChange={e=>set('email2',e.target.value)} type="email"/></Grid2>

            <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'14px 0 10px'}}>Classification</div>
            <Grid3 gap={12}>
              <Select label="Type" value={form.role||'buyer'} onChange={e=>set('role',e.target.value)} options={CONTACT_TYPES.map(t=>({value:t.toLowerCase(),label:t}))}/>
              <Select label="Status" value={form.status||'New'} onChange={e=>set('status',e.target.value)} options={['New','Hot','Active','Nurturing','Cold']}/>
              <Select label="Assigned Agent" value={form.assigned_agent||''} onChange={e=>set('assigned_agent',e.target.value)} options={[{value:'',label:'Unassigned'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
            </Grid3>
            <Grid2 gap={12}>
              <Select label="Lead Source" value={form.source||''} onChange={e=>set('source',e.target.value)} options={[{value:'',label:'Select...'},...SOURCES.map(s=>({value:s,label:s}))]}/>
              <Select label="Tag" value={form.tag||''} onChange={e=>set('tag',e.target.value)} options={[{value:'',label:'None'},...['VIP','Hot Lead','Past Client','Referral Partner','Professional'].map(t=>({value:t,label:t}))]}/>
            </Grid2>

            <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'14px 0 10px'}}>Property Criteria</div>
            <Grid2 gap={12}><Input label="Max Budget ($)" value={form.budget_max||''} onChange={e=>set('budget_max',e.target.value)} type="number"/><Input label="Min Budget ($)" value={form.budget_min||''} onChange={e=>set('budget_min',e.target.value)} type="number"/></Grid2>
            <Grid2 gap={12}>
              <Input label="Preferred Areas" value={form.preferred_areas||''} onChange={e=>set('preferred_areas',e.target.value)} placeholder="Suffern, Monsey..."/>
              <Select label="Property Type" value={form.property_type_interest||''} onChange={e=>set('property_type_interest',e.target.value)} options={[{value:'',label:'Any'},...PROPERTY_TYPES.map(p=>({value:p,label:p}))]}/>
            </Grid2>
            <Grid2 gap={12}><Input label="Min Bedrooms" value={form.min_beds||''} onChange={e=>set('min_beds',e.target.value)} type="number"/><Input label="Tax Info" value={form.tax_info||''} onChange={e=>set('tax_info',e.target.value)}/></Grid2>

            <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'14px 0 10px'}}>Personal Info</div>
            <Grid2 gap={12}><Input label="Birthday" value={form.birthday||''} onChange={e=>set('birthday',e.target.value)} type="date"/><Input label="Closing Anniversary" value={form.closing_anniversary||''} onChange={e=>set('closing_anniversary',e.target.value)} type="date"/></Grid2>
            <Grid2 gap={12}><Input label="City / Area" value={form.city||''} onChange={e=>set('city',e.target.value)}/><Input label="Notes" value={form.notes||''} onChange={e=>set('notes',e.target.value)} rows={2}/></Grid2>

            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'16px'}}>
              <Btn variant="ghost" onClick={()=>setEditMode(false)}>Cancel</Btn>
              <Btn onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</Btn>
            </div>
          </Card>
        ) : (
          // VIEW MODE
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'16px'}}>
              {/* Contact Info */}
              <Card>
                <CardHeader>Contact Information</CardHeader>
                <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
                  {[
                    ['📞 Phone',    contact.phone],
                    ['📞 Phone 2',  contact.phone2],
                    ['✉ Email',     contact.email],
                    ['✉ Email 2',   contact.email2],
                    ['🏙 City',      contact.city],
                  ].filter(f=>f[1]).map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:'12px',color:'var(--muted)',fontWeight:600}}>{k}</span>
                      <span style={{fontSize:'13px',fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Property Criteria */}
              <Card>
                <CardHeader>Property Criteria</CardHeader>
                <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
                  {[
                    ['Budget',       contact.budget_min&&contact.budget_max?fmt$(contact.budget_min)+' – '+fmt$(contact.budget_max):contact.budget_max?fmt$(contact.budget_max):null],
                    ['Areas',        contact.preferred_areas],
                    ['Property Type',contact.property_type_interest||'Any'],
                    ['Min Beds',     contact.min_beds],
                    ['Tax Info',     contact.tax_info],
                  ].filter(f=>f[1]).map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:'12px',color:'var(--muted)',fontWeight:600}}>{k}</span>
                      <span style={{fontSize:'13px',fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Classification */}
              <Card>
                <CardHeader>Classification</CardHeader>
                <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
                  {[
                    ['Type',        contact.role],
                    ['Status',      contact.status],
                    ['Source',      contact.source],
                    ['Tag',         contact.tag||'None'],
                    ['Agent',       ag?ag.name:'Unassigned'],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:'12px',color:'var(--muted)',fontWeight:600}}>{k}</span>
                      <span style={{fontSize:'13px',fontWeight:600,textTransform:k==='Type'?'capitalize':'none'}}>{v||'—'}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Personal */}
              <Card>
                <CardHeader>Personal Info</CardHeader>
                <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:'12px'}}>
                  {[
                    ['Birthday',     contact.birthday],
                    ['Anniversary',  contact.closing_anniversary],
                  ].filter(f=>f[1]).map(([k,v])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                      <span style={{fontSize:'12px',color:'var(--muted)',fontWeight:600}}>{k}</span>
                      <span style={{fontSize:'13px',fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                  {contact.notes && (
                    <div style={{padding:'9px 0'}}>
                      <div style={{fontSize:'12px',color:'var(--muted)',fontWeight:600,marginBottom:'6px'}}>Notes</div>
                      <div style={{fontSize:'13px',lineHeight:1.7,color:'var(--text)'}}>{contact.notes}</div>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Quick share listing */}
            <Card>
              <CardHeader>Quick Share Listing</CardHeader>
              <div style={{padding:'16px',display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                <select style={{flex:1,minWidth:'200px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}} id="qsl">
                  <option>Select listing to share...</option>
                  {['47 Prairie Ave, Suffern — $599,000','12 Sherman Drive #202, Spring Valley — $1,499,000','20 Singer Ave, Spring Valley — $1,649,000','352 Blauvelt Rd Unit 201, Monsey — $1,149,000'].map(l=><option key={l}>{l}</option>)}
                </select>
                {contact.phone && <Btn size="sm" onClick={()=>{ const s=document.getElementById('qsl').value; if(s.includes('Select'))return; window.location.href='sms:'+contact.phone.replace(/\D/g,'')+'?body='+encodeURIComponent('New Listing from Target Team:\n'+s+'\nCall: 845.424.1014') }}>Text</Btn>}
                {contact.email && <Btn size="sm" variant="purple" onClick={()=>{ const s=document.getElementById('qsl').value; if(s.includes('Select'))return; window.location.href='mailto:'+contact.email+'?subject=New Listing from Target Team&body='+encodeURIComponent('New Listing:\n'+s+'\nCall: 845.424.1014') }}>Email</Btn>}
              </div>
            </Card>
          </div>
        )
      )}

      {tab==='Activity' && (
        <Card>
          <CardHeader>Activity Log</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              <input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&newNote.trim()&&(setNotes(n=>[{text:newNote.trim(),time:new Date().toLocaleString()},...n]),setNewNote(''))}
                placeholder="Add a note..."
                style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}
                onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <Btn onClick={()=>{ if(!newNote.trim()) return; setNotes(n=>[{text:newNote.trim(),time:new Date().toLocaleString()},...n]); setNewNote('') }}>Save Note</Btn>
            </div>
            {notes.length===0
              ? <div style={{textAlign:'center',padding:'32px',color:'var(--muted)'}}>No activity yet — add a note above</div>
              : notes.map((n,i)=>(
                <div key={i} style={{display:'flex',gap:'12px',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{width:36,height:36,borderRadius:'9px',background:'var(--dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>📝</div>
                  <div><div style={{fontSize:'13px',marginBottom:'3px'}}>{n.text}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{n.time}</div></div>
                </div>
              ))
            }
          </div>
        </Card>
      )}

      {tab==='Tasks' && (
        <Card>
          <CardHeader>Tasks ({tasks.length})</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==='Enter'&&newTask.trim()&&(setTasks(t=>[{title:newTask.trim(),done:false,created:new Date().toLocaleString()},...t]),setNewTask(''))}
                placeholder="Add a task..."
                style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}
                onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <Btn onClick={()=>{ if(!newTask.trim()) return; setTasks(t=>[{title:newTask.trim(),done:false},...t]); setNewTask('') }}>Add</Btn>
            </div>
            {tasks.length===0
              ? <div style={{textAlign:'center',padding:'32px',color:'var(--muted)'}}>No tasks yet</div>
              : tasks.map((t,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                  <div onClick={()=>setTasks(prev=>prev.map((x,j)=>j===i?{...x,done:!x.done}:x))} style={{width:22,height:22,borderRadius:'6px',border:'2px solid '+(t.done?'#16A34A':'var(--border)'),background:t.done?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff',fontSize:'12px',flexShrink:0}}>
                    {t.done&&'✓'}
                  </div>
                  <span style={{fontSize:'13px',flex:1,textDecoration:t.done?'line-through':'none',opacity:t.done?.5:1}}>{t.title}</span>
                  <button onClick={()=>setTasks(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px'}}>🗑</button>
                </div>
              ))
            }
          </div>
        </Card>
      )}

      {tab==='Appointments' && (
        <Card>
          <CardHeader>
            Appointments ({appts.length})
            <Btn size="sm" onClick={()=>setShowApptForm(true)}>+ Schedule</Btn>
          </CardHeader>
          <div style={{padding:'16px'}}>
            {showApptForm && (
              <div style={{background:'var(--dim)',borderRadius:'12px',padding:'16px',marginBottom:'16px'}}>
                <Input label="Title *" value={apptForm.title} onChange={e=>setApptForm(f=>({...f,title:e.target.value}))} placeholder="Property showing, consultation..."/>
                <Grid2 gap={12}><Input label="Date" value={apptForm.date} onChange={e=>setApptForm(f=>({...f,date:e.target.value}))} type="date"/><Input label="Time" value={apptForm.time} onChange={e=>setApptForm(f=>({...f,time:e.target.value}))} type="time"/></Grid2>
                <Input label="Location" value={apptForm.location} onChange={e=>setApptForm(f=>({...f,location:e.target.value}))} placeholder="Address or office"/>
                <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                  <Btn variant="ghost" size="sm" onClick={()=>setShowApptForm(false)}>Cancel</Btn>
                  <Btn size="sm" onClick={()=>{ if(!apptForm.title) return; setAppts(a=>[{...apptForm},...a]); setShowApptForm(false); setApptForm({title:'',date:'',time:'10:00',location:''}) }}>Schedule</Btn>
                </div>
              </div>
            )}
            {appts.length===0&&!showApptForm
              ? <div style={{textAlign:'center',padding:'32px',color:'var(--muted)'}}>No appointments scheduled</div>
              : appts.map((a,i)=>(
                <div key={i} style={{background:'var(--dim)',borderRadius:'10px',padding:'14px',marginBottom:'10px'}}>
                  <div style={{fontSize:'14px',fontWeight:700,marginBottom:'4px'}}>{a.title}</div>
                  <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'10px'}}>{a.date} at {a.time}{a.location?' · '+a.location:''}</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    {contact.email&&<Btn size="xs" variant="ghost" onClick={()=>window.location.href='mailto:'+contact.email+'?subject=Appointment: '+encodeURIComponent(a.title)}>Send Invite</Btn>}
                    <Btn size="xs" variant="ghost" onClick={()=>window.open('https://calendar.google.com/calendar/r/eventedit?text='+encodeURIComponent(a.title),'_blank')}>Google Cal</Btn>
                  </div>
                </div>
              ))
            }
          </div>
        </Card>
      )}

      {tab==='Documents' && (
        <Card>
          <CardHeader>Documents ({docs.length})</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
              <input id="docName" placeholder="Document name..." style={{flex:1,minWidth:'140px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}/>
              <select id="docType" style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}>
                {['Pre-Approval Letter','Proof of Funds','ID','Contract','Offer Sheet','Inspection Report','Other'].map(t=><option key={t}>{t}</option>)}
              </select>
              <Btn onClick={()=>{ const n=document.getElementById('docName').value.trim(); const t=document.getElementById('docType').value; if(!n)return; setDocs(d=>[{name:n,type:t,date:new Date().toLocaleDateString()},...d]); document.getElementById('docName').value=''; }}>Upload</Btn>
            </div>
            {docs.length===0
              ? <div style={{textAlign:'center',padding:'32px',color:'var(--muted)'}}>No documents uploaded</div>
              : docs.map((d,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--dim)',borderRadius:'10px',padding:'13px',marginBottom:'8px'}}>
                  <div><div style={{fontSize:'13px',fontWeight:600}}>📄 {d.name}</div><div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{d.date} · {d.type}</div></div>
                  <button onClick={()=>setDocs(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px'}}>🗑</button>
                </div>
              ))
            }
          </div>
        </Card>
      )}

      {tab==='Listing Alert' && (
        <Card>
          <CardHeader>Listing Alert</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'16px'}}>Client gets notified by email when a matching listing hits the market.</div>
            <Grid2 gap={12}><Input label="Min Price ($)" value={contact.budget_min||''} onChange={()=>{}}/><Input label="Max Price ($)" value={contact.budget_max||''} onChange={()=>{}}/></Grid2>
            <Grid2 gap={12}><Input label="Area" value={contact.preferred_areas||''} onChange={()=>{}}/><Select label="Frequency" value="Instant" onChange={()=>{}} options={['Instant','Daily Digest','Weekly']}/></Grid2>
            <Btn style={{width:'100%'}} onClick={()=>{ setAlerts(a=>[{minp:contact.budget_min,maxp:contact.budget_max,area:contact.preferred_areas,freq:'Instant'},...a]); toast('Listing alert saved!') }}>Set Alert</Btn>
            {alerts.map((a,i)=>(
              <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'12px',marginTop:'10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div><div style={{fontSize:'13px',fontWeight:600}}>${(a.minp||0).toLocaleString()} – ${(a.maxp||0).toLocaleString()}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{a.area} · {a.freq}</div></div>
                <Badge label="Active"/>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab==='Deals' && (
        <Card>
          <CardHeader>Deals</CardHeader>
          <div style={{padding:'24px',textAlign:'center',color:'var(--muted)'}}>
            No deals linked yet.<br/><span style={{fontSize:'12px'}}>Deals link automatically once connected in Production board.</span>
          </div>
        </Card>
      )}
    </div>
  )
}
