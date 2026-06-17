import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { AGENTS, SOURCES, PROPERTY_TYPES, CONTACT_TYPES } from '../lib/constants'
import { Card, CardHeader, Badge, Avatar, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, SkeletonTable } from '../components/UI'

const fmt$ = n => '$' + Number(n).toLocaleString()
const roleColor = r => ({ buyer:'#0EA5E9', seller:'#10B981', investor:'#7C3AED', tenant:'#F59E0B' }[r] || '#64748B')

export function Contacts() {
  const { state, dispatch, toast, log } = useApp()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editMode, setEditMode] = useState(false)

  useEffect(() => { loadContacts() }, [])

  async function loadContacts() {
    setLoading(true)
    const { data } = await supabase.from('contacts').select('*').order('created_at', { ascending: false })
    setContacts(data || [])
    dispatch({ type: 'SET_CONTACTS', payload: data || [] })
    setLoading(false)
  }

  const filtered = contacts.filter(c => {
    if(search && !(c.first_name+' '+(c.last_name||'')+' '+(c.email||'')+' '+(c.phone||'')+' '+(c.source||'')+' '+(c.city||'')).toLowerCase().includes(search.toLowerCase())) return false
    if(filterRole && c.role !== filterRole) return false
    if(filterStatus && c.status !== filterStatus) return false
    if(filterAgent && c.assigned_agent !== filterAgent) return false
    return true
  })

  async function deleteContact(id) {
    if(!window.confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    setContacts(c => c.filter(x => x.id !== id))
    toast('Contact deleted')
  }

  async function saveContact(id, updates) {
    const { data, error } = await supabase.from('contacts').update(updates).eq('id', id).select()
    if(error) { toast('Error saving: ' + error.message, '#DC2626'); return false }
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...data[0] } : c))
    if(selected?.id === id) setSelected(prev => ({ ...prev, ...data[0] }))
    toast('Contact saved!')
    log({ cat:'contact', action:'Updated', subject: updates.first_name || 'Contact', detail: Object.keys(updates).join(', ') + ' updated' })
    return true
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search contacts..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',padding:'8px 13px',outline:'none',width:'220px',fontFamily:'Inter,system-ui,sans-serif'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          <FilterSelect value={filterRole} onChange={setFilterRole} placeholder="All Types" options={CONTACT_TYPES.map(t=>({value:t.toLowerCase(),label:t}))}/>
          <FilterSelect value={filterStatus} onChange={setFilterStatus} placeholder="All Status" options={['Hot','Active','New','Nurturing','Cold'].map(s=>({value:s,label:s}))}/>
          <FilterSelect value={filterAgent} onChange={setFilterAgent} placeholder="All Agents" options={AGENTS.map(a=>({value:a.name,label:a.name}))}/>
          {(search||filterRole||filterStatus||filterAgent) && (
            <button onClick={()=>{setSearch('');setFilterRole('');setFilterStatus('');setFilterAgent('')}} style={{background:'none',border:'none',color:'var(--muted)',fontSize:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Clear</button>
          )}
          <span style={{color:'var(--muted)',fontSize:'12px'}}>{filtered.length} contacts</span>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <Btn variant="ghost" size="sm" onClick={()=>exportCSV(contacts)}>Export CSV</Btn>
          <Btn size="sm" onClick={()=>setShowAdd(true)}>+ New Contact</Btn>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'2.2fr 1fr 1fr 1fr 1fr 1fr 90px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
          <div>Contact</div><div>Type</div><div>Source</div><div>Budget</div><div>Status</div><div>Agent</div><div>Actions</div>
        </div>
        {loading ? <SkeletonTable rows={8}/> : filtered.length === 0 ? (
          <div style={{padding:'36px',textAlign:'center',color:'var(--muted)'}}>
            No contacts found. <button onClick={()=>setShowAdd(true)} style={{color:'#CC2200',background:'none',border:'none',cursor:'pointer',fontSize:'13px'}}>Add first</button>
          </div>
        ) : filtered.map(c => (
          <ContactTableRow key={c.id} contact={c}
            onSelect={c=>{setSelected(c);setEditMode(false)}}
            onDelete={deleteContact}/>
        ))}
      </Card>

      {/* Add modal */}
      {showAdd && (
        <ContactFormModal
          title="New Contact"
          onClose={()=>setShowAdd(false)}
          onSave={async form => {
            const { data, error } = await supabase.from('contacts').insert([{...form, agent_id: state.user?.id}]).select()
            if(error){ toast('Error: '+error.message,'#DC2626'); return }
            setContacts(prev=>[data[0],...prev])
            setShowAdd(false)
            toast('Contact saved!')
            log({cat:'contact',action:'Added',subject:form.first_name+' '+(form.last_name||''),detail:'New '+(form.role||'contact')})
          }}
        />
      )}

      {/* Detail / Edit panel */}
      {selected && (
        <ContactDetail
          contact={selected}
          editMode={editMode}
          onEdit={()=>setEditMode(true)}
          onClose={()=>{setSelected(null);setEditMode(false)}}
          onDelete={id=>{deleteContact(id);setSelected(null)}}
          onSave={async updates => {
            const ok = await saveContact(selected.id, updates)
            if(ok) setEditMode(false)
          }}
        />
      )}
    </div>
  )
}

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'7px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  )
}

function ContactTableRow({ contact: c, onSelect, onDelete }) {
  const ag = AGENTS.find(a => a.name === c.assigned_agent)
  return (
    <div onClick={()=>onSelect(c)}
      style={{display:'grid',gridTemplateColumns:'2.2fr 1fr 1fr 1fr 1fr 1fr 90px',padding:'12px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
        <Avatar name={c.first_name+' '+(c.last_name||'')} color={roleColor(c.role)} size={36}/>
        <div>
          <div style={{fontSize:'13px',fontWeight:600}}>{c.first_name} {c.last_name||''}</div>
          <div style={{fontSize:'11px',color:'var(--muted)'}}>{c.phone||c.email||'No contact info'}</div>
        </div>
      </div>
      <div style={{fontSize:'12px',color:'var(--muted)',textTransform:'capitalize'}}>{c.role||'—'}</div>
      <div><span style={{fontSize:'11px',background:'var(--dim)',padding:'3px 9px',borderRadius:'20px',color:'var(--muted)'}}>{c.source||'—'}</span></div>
      <div style={{fontSize:'12px',fontWeight:600}}>{c.budget_max?fmt$(c.budget_max):'—'}</div>
      <div><Badge label={c.status||'New'}/></div>
      <div style={{fontSize:'11px',color:'var(--muted)'}}>{ag?ag.name.split(' ')[0]:'—'}</div>
      <div style={{display:'flex',gap:'4px'}} onClick={e=>e.stopPropagation()}>
        {c.phone && <button onClick={()=>window.location.href='tel:'+c.phone.replace(/\D/g,'')} style={{background:'none',border:'none',fontSize:'15px',cursor:'pointer',color:'var(--muted)',padding:'3px'}}>📞</button>}
        <button onClick={()=>onDelete(c.id)} style={{background:'none',border:'none',fontSize:'15px',cursor:'pointer',color:'var(--muted)',padding:'3px'}}>🗑</button>
      </div>
    </div>
  )
}

// ─── CONTACT FORM (used for both Add and Edit) ─────────────────────
function ContactFormModal({ title, initial={}, onClose, onSave }) {
  const [form, setForm] = useState({
    first_name:'', last_name:'', phone:'', phone2:'', email:'', email2:'',
    role:'buyer', status:'New', assigned_agent:'', source:'', tag:'',
    budget_max:'', budget_min:'', preferred_areas:'', property_type_interest:'',
    min_beds:'', birthday:'', closing_anniversary:'', city:'', tax_info:'', notes:'',
    ...initial
  })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    if(!form.first_name.trim()){ alert('First name required'); return }
    setSaving(true)
    await onSave({
      ...form,
      budget_max: form.budget_max ? parseFloat(form.budget_max) : null,
      budget_min: form.budget_min ? parseFloat(form.budget_min) : null,
      min_beds:   form.min_beds   ? parseInt(form.min_beds)      : null,
    })
    setSaving(false)
  }

  return (
    <Modal onClose={onClose} maxWidth={600}>
      <ModalTitle onClose={onClose}>{title}</ModalTitle>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Basic Information</div>
      <Grid2 gap={10}>
        <Input label="First Name *" value={form.first_name} onChange={e=>set('first_name',e.target.value)} placeholder="John"/>
        <Input label="Last Name"    value={form.last_name}  onChange={e=>set('last_name', e.target.value)} placeholder="Smith"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Phone"            value={form.phone}  onChange={e=>set('phone', e.target.value)} placeholder="845-555-1234" type="tel"/>
        <Input label="Additional Phone" value={form.phone2} onChange={e=>set('phone2',e.target.value)} placeholder="845-555-5678" type="tel"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Email"            value={form.email}  onChange={e=>set('email', e.target.value)} placeholder="john@email.com" type="email"/>
        <Input label="Additional Email" value={form.email2} onChange={e=>set('email2',e.target.value)} placeholder="john2@email.com" type="email"/>
      </Grid2>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'10px 0 8px'}}>Classification</div>
      <Grid3 gap={10}>
        <Select label="Type" value={form.role} onChange={e=>set('role',e.target.value)}
          options={CONTACT_TYPES.map(t=>({value:t.toLowerCase(),label:t}))}/>
        <Select label="Status" value={form.status} onChange={e=>set('status',e.target.value)}
          options={['New','Hot','Active','Nurturing','Cold']}/>
        <Select label="Assigned Agent" value={form.assigned_agent||''} onChange={e=>set('assigned_agent',e.target.value)}
          options={[{value:'',label:'Unassigned'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
      </Grid3>
      <Grid2 gap={10}>
        <Select label="Lead Source" value={form.source||''} onChange={e=>set('source',e.target.value)}
          options={[{value:'',label:'Select source...'},...SOURCES.map(s=>({value:s,label:s}))]}/>
        <Select label="Tag" value={form.tag||''} onChange={e=>set('tag',e.target.value)}
          options={[{value:'',label:'None'},...['VIP','Hot Lead','Past Client','Referral Partner','Professional'].map(t=>({value:t,label:t}))]}/>
      </Grid2>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'10px 0 8px'}}>Property Criteria</div>
      <Grid2 gap={10}>
        <Input label="Max Budget ($)" value={form.budget_max||''} onChange={e=>set('budget_max',e.target.value)} type="number" placeholder="500000"/>
        <Input label="Min Budget ($)" value={form.budget_min||''} onChange={e=>set('budget_min',e.target.value)} type="number" placeholder="300000"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Preferred Areas"  value={form.preferred_areas||''} onChange={e=>set('preferred_areas',e.target.value)} placeholder="Suffern, Monsey, Spring Valley"/>
        <Select label="Property Type"  value={form.property_type_interest||''} onChange={e=>set('property_type_interest',e.target.value)}
          options={[{value:'',label:'Any'},...PROPERTY_TYPES.map(p=>({value:p,label:p}))]}/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Min Bedrooms" value={form.min_beds||''} onChange={e=>set('min_beds',e.target.value)} type="number" placeholder="3"/>
        <Input label="Tax Info"     value={form.tax_info||''} onChange={e=>set('tax_info',e.target.value)} placeholder="$12,000/yr"/>
      </Grid2>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'10px 0 8px'}}>Personal Info</div>
      <Grid2 gap={10}>
        <Input label="Birthday"           value={form.birthday||''}            onChange={e=>set('birthday',e.target.value)} type="date"/>
        <Input label="Closing Anniversary" value={form.closing_anniversary||''} onChange={e=>set('closing_anniversary',e.target.value)} type="date"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="City / Area" value={form.city||''} onChange={e=>set('city',e.target.value)} placeholder="Suffern"/>
        <Input label="Notes"       value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Notes..."/>
      </Grid2>

      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'12px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?'Saving...':'Save Contact'}</Btn>
      </div>
    </Modal>
  )
}

// ─── CONTACT DETAIL with inline edit ───────────────────────────────
const TABS = ['Overview','Activity','Tasks','Appointments','Documents','Listing Alert','Deals']

function ContactDetail({ contact, editMode, onEdit, onClose, onDelete, onSave }) {
  const [tab, setTab] = useState('Overview')
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')

  // If edit mode open the full form modal
  if(editMode) {
    return (
      <ContactFormModal
        title={'Edit — ' + contact.first_name + ' ' + (contact.last_name||'')}
        initial={contact}
        onClose={onClose}
        onSave={onSave}
      />
    )
  }

  function addNote() {
    if(!newNote.trim()) return
    setNotes(n=>[{text:newNote.trim(),time:new Date().toLocaleString()},...n])
    setNewNote('')
  }

  return (
    <Modal onClose={onClose} maxWidth={700}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:'16px',borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <Avatar name={contact.first_name+' '+(contact.last_name||'')} color={roleColor(contact.role)} size={48}/>
          <div>
            <div style={{fontSize:'20px',fontWeight:900}}>{contact.first_name} {contact.last_name||''}</div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
              <Badge label={contact.status||'New'}/>
              <span style={{fontSize:'12px',color:'var(--muted)',textTransform:'capitalize'}}>{contact.role||'contact'}</span>
              {contact.tag && <span style={{fontSize:'11px',background:'rgba(204,34,0,.1)',color:'#CC2200',padding:'2px 9px',borderRadius:'20px'}}>{contact.tag}</span>}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {/* EDIT BUTTON */}
          <Btn size="sm" variant="ghost" onClick={onEdit}>✏️ Edit</Btn>
          {contact.phone && <Btn size="sm" onClick={()=>window.location.href='tel:'+contact.phone.replace(/\D/g,'')}>Call</Btn>}
          {contact.phone && <Btn size="sm" variant="secondary" onClick={()=>window.location.href='sms:'+contact.phone.replace(/\D/g,'')}>Text</Btn>}
          {contact.email && <Btn size="sm" variant="purple" onClick={()=>window.location.href='mailto:'+contact.email}>Email</Btn>}
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'var(--muted)'}}>✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:'16px',overflowX:'auto'}}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:'10px 14px',background:'transparent',border:'none',fontFamily:'Inter,system-ui,sans-serif',fontSize:'12px',fontWeight:600,cursor:'pointer',color:tab===t?'#CC2200':'var(--muted)',borderBottom:tab===t?'2px solid #CC2200':'2px solid transparent',whiteSpace:'nowrap'}}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{maxHeight:'460px',overflowY:'auto'}}>
        {tab==='Overview' && <ContactOverviewTab c={contact}/>}
        {tab==='Activity' && (
          <>
            <div style={{display:'flex',gap:'7px',marginBottom:'14px'}}>
              <input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addNote()}
                placeholder="Add a note..." style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',padding:'10px 13px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}
                onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <Btn onClick={addNote}>Save Note</Btn>
            </div>
            {notes.length===0
              ? <div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'20px'}}>No activity yet — add a note above</div>
              : notes.map((n,i)=>(
                <div key={i} style={{display:'flex',gap:'10px',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                  <span style={{fontSize:'18px'}}>📝</span>
                  <div><div style={{fontSize:'12px'}}>{n.text}</div><div style={{fontSize:'10px',color:'var(--muted)'}}>{n.time}</div></div>
                </div>
              ))
            }
          </>
        )}
        {tab==='Tasks'        && <ContactTasksTab contact={contact}/>}
        {tab==='Appointments' && <ContactApptsTab contact={contact}/>}
        {tab==='Documents'    && <ContactDocsTab  contact={contact}/>}
        {tab==='Listing Alert'&& <ContactAlertsTab contact={contact}/>}
        {tab==='Deals'        && <ContactDealsTab  contact={contact}/>}
      </div>

      {/* Footer */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'16px',paddingTop:'14px',borderTop:'1px solid var(--border)'}}>
        <button onClick={()=>onDelete(contact.id)} style={{background:'none',border:'1px solid #FECACA',borderRadius:'8px',color:'#DC2626',fontSize:'12px',padding:'7px 14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Delete Contact</button>
        <Btn onClick={onEdit}>✏️ Edit Contact</Btn>
      </div>
    </Modal>
  )
}

function Field({ label, value }) {
  return (
    <div style={{background:'var(--dim)',borderRadius:'9px',padding:'11px'}}>
      <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'3px'}}>{label}</div>
      <div style={{fontSize:'13px',fontWeight:600,wordBreak:'break-word'}}>{value||'—'}</div>
    </div>
  )
}

function ContactOverviewTab({ c }) {
  const ag = AGENTS.find(a=>a.name===c.assigned_agent)
  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
        <Field label="Phone"       value={c.phone}/>
        <Field label="Phone 2"     value={c.phone2}/>
        <Field label="Email"       value={c.email}/>
        <Field label="Email 2"     value={c.email2}/>
        <Field label="Source"      value={c.source}/>
        <Field label="Agent"       value={ag?ag.name:'Unassigned'}/>
        <Field label="Budget"      value={c.budget_min&&c.budget_max?fmt$(c.budget_min)+' – '+fmt$(c.budget_max):c.budget_max?fmt$(c.budget_max):null}/>
        <Field label="Areas"       value={c.preferred_areas}/>
        <Field label="Prop. Type"  value={c.property_type_interest||'Any'}/>
        <Field label="Min Beds"    value={c.min_beds}/>
        <Field label="Birthday"    value={c.birthday}/>
        <Field label="Anniversary" value={c.closing_anniversary}/>
        <Field label="Tax Info"    value={c.tax_info}/>
        <Field label="Tag"         value={c.tag||'None'}/>
        <Field label="City"        value={c.city}/>
      </div>
      {c.notes && (
        <div style={{background:'var(--dim)',borderRadius:'9px',padding:'12px'}}>
          <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',marginBottom:'5px'}}>Notes</div>
          <div style={{fontSize:'13px',lineHeight:1.7}}>{c.notes}</div>
        </div>
      )}
    </>
  )
}

function ContactTasksTab({ contact }) {
  const [tasks, setTasks] = useState([])
  const [val, setVal] = useState('')
  return (
    <>
      <div style={{display:'flex',gap:'7px',marginBottom:'14px'}}>
        <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&val.trim()&&(setTasks(t=>[{title:val.trim(),done:false},...t]),setVal(''))}
          placeholder="Add a task..." style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',padding:'10px 13px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
        <Btn onClick={()=>val.trim()&&(setTasks(t=>[{title:val.trim(),done:false},...t]),setVal(''))}>Add</Btn>
      </div>
      {tasks.map((t,i)=>(
        <div key={i} style={{display:'flex',alignItems:'center',gap:'9px',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
          <div onClick={()=>setTasks(prev=>prev.map((x,j)=>j===i?{...x,done:!x.done}:x))} style={{width:18,height:18,borderRadius:'5px',border:'2px solid '+(t.done?'#16A34A':'var(--border)'),background:t.done?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff',fontSize:'10px'}}>{t.done&&'✓'}</div>
          <span style={{fontSize:'13px',textDecoration:t.done?'line-through':'none',opacity:t.done?.5:1}}>{t.title}</span>
        </div>
      ))}
      {tasks.length===0&&<div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'20px'}}>No tasks yet</div>}
    </>
  )
}

function ContactApptsTab({ contact }) {
  const [appts, setAppts] = useState([])
  const [form, setForm] = useState({title:'',date:'',time:'10:00',location:''})
  const [showForm, setShowForm] = useState(false)
  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'12px'}}>
        <span style={{fontSize:'12px',fontWeight:600}}>{appts.length} appointments</span>
        <Btn size="sm" onClick={()=>setShowForm(true)}>+ Schedule</Btn>
      </div>
      {showForm&&(
        <div style={{background:'var(--dim)',borderRadius:'10px',padding:'13px',marginBottom:'13px'}}>
          <Input label="Title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Property showing..."/>
          <Grid2 gap={10}><Input label="Date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} type="date"/><Input label="Time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} type="time"/></Grid2>
          <Input label="Location" value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="Address or office"/>
          <div style={{display:'flex',gap:'7px',justifyContent:'flex-end'}}><Btn variant="ghost" size="sm" onClick={()=>setShowForm(false)}>Cancel</Btn><Btn size="sm" onClick={()=>{if(form.title){setAppts(a=>[{...form},...a]);setShowForm(false);setForm({title:'',date:'',time:'10:00',location:''})}}}>Schedule</Btn></div>
        </div>
      )}
      {appts.map((a,i)=>(
        <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'11px',marginBottom:'8px'}}>
          <div style={{fontSize:'13px',fontWeight:700,marginBottom:'3px'}}>{a.title}</div>
          <div style={{fontSize:'11px',color:'var(--muted)'}}>{a.date} at {a.time}{a.location?' · '+a.location:''}</div>
          <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
            {contact.email&&<Btn size="xs" variant="ghost" onClick={()=>window.location.href='mailto:'+contact.email+'?subject=Appointment+Reminder'}>Send Invite</Btn>}
            <Btn size="xs" variant="ghost" onClick={()=>window.open('https://calendar.google.com/calendar/r/eventedit?text='+encodeURIComponent(a.title),'_blank')}>Google Cal</Btn>
          </div>
        </div>
      ))}
      {appts.length===0&&!showForm&&<div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'20px'}}>No appointments scheduled</div>}
    </>
  )
}

function ContactDocsTab({ contact }) {
  const [docs, setDocs] = useState([])
  const [name, setName] = useState(''); const [type, setType] = useState('Pre-Approval Letter')
  return (
    <>
      <div style={{display:'flex',gap:'7px',marginBottom:'13px',flexWrap:'wrap'}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Document name..." style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif',minWidth:'120px'}}/>
        <select value={type} onChange={e=>setType(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',padding:'8px',outline:'none'}}>
          {['Pre-Approval Letter','Proof of Funds','ID','Contract','Offer Sheet','Inspection Report','Other'].map(t=><option key={t}>{t}</option>)}
        </select>
        <Btn size="sm" onClick={()=>{if(name.trim()){setDocs(d=>[{name:name.trim(),type,date:new Date().toLocaleDateString()},...d]);setName('')}}}>Upload</Btn>
      </div>
      {docs.map((d,i)=>(
        <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px',marginBottom:'7px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{fontSize:'13px',fontWeight:600}}>📄 {d.name}</div><div style={{fontSize:'10px',color:'var(--muted)'}}>{d.date} · {d.type}</div></div>
          <button onClick={()=>setDocs(prev=>prev.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px'}}>🗑</button>
        </div>
      ))}
      {docs.length===0&&<div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'20px'}}>No documents uploaded</div>}
    </>
  )
}

function ContactAlertsTab({ contact }) {
  const [alerts, setAlerts] = useState([])
  const [form, setForm] = useState({minp:contact.budget_min||'',maxp:contact.budget_max||'',area:contact.preferred_areas||'',type:'',freq:'Instant'})
  return (
    <>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'14px',marginBottom:'14px'}}>
        <div style={{fontSize:'13px',fontWeight:700,marginBottom:'4px'}}>Listing Alert</div>
        <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'12px'}}>Client gets emailed when a matching listing hits the market.</div>
        <Grid2 gap={10}><Input label="Min Price ($)" value={form.minp} onChange={e=>setForm(f=>({...f,minp:e.target.value}))} type="number"/><Input label="Max Price ($)" value={form.maxp} onChange={e=>setForm(f=>({...f,maxp:e.target.value}))} type="number"/></Grid2>
        <Grid2 gap={10}><Input label="Area" value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))} placeholder="Suffern, Monsey..."/><Select label="Frequency" value={form.freq} onChange={e=>setForm(f=>({...f,freq:e.target.value}))} options={['Instant','Daily Digest','Weekly']}/></Grid2>
        <Btn style={{width:'100%'}} onClick={()=>{setAlerts(a=>[{...form,minp:parseFloat(form.minp)||0,maxp:parseFloat(form.maxp)||0},...a]);alert('Listing alert set!')}}>Set Alert</Btn>
      </div>
      {alerts.map((a,i)=>(
        <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px',marginBottom:'7px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{fontSize:'12px',fontWeight:600}}>${a.minp.toLocaleString()} – ${a.maxp.toLocaleString()} · {a.area}</div><div style={{fontSize:'11px',color:'var(--muted)'}}>{a.freq}</div></div>
          <Badge label="Active"/>
        </div>
      ))}
    </>
  )
}

function ContactDealsTab({ contact }) {
  return <div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'30px'}}>No deals linked yet.<br/><span style={{fontSize:'11px'}}>Deals link automatically once connected in Production board.</span></div>
}

function exportCSV(contacts) {
  const h = 'Name,Email,Phone,Role,Status,Source,Budget\n'
  const r = contacts.map(c=>`"${c.first_name} ${c.last_name||''}","${c.email||''}","${c.phone||''}","${c.role||''}","${c.status||''}","${c.source||''}","${c.budget_max||''}"`)
  const b = new Blob([h+r.join('\n')],{type:'text/csv'})
  const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='contacts.csv'; a.click()
}
