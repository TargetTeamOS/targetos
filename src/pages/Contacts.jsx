import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { AGENTS, SOURCES, PROPERTY_TYPES, CONTACT_TYPES } from '../lib/constants'
import { Card, CardHeader, Badge, Avatar, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, SkeletonTable } from '../components/UI'
import { ContactDetail } from './ContactDetail'
import { BulkUpload } from '../components/BulkUpload'
import { VoiceCapture } from '../components/VoiceCapture'
import { useConfirm } from '../components/ConfirmDialog'

const fmt$ = n => '$' + Number(n).toLocaleString()
const roleColor = r => ({ buyer:'#0EA5E9', seller:'#10B981', investor:'#7C3AED', tenant:'#F59E0B' }[r] || '#64748B')

export function Contacts() {
  const { state, dispatch, toast, log } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [fullPageId, setFullPageId] = useState(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [showVoice, setShowVoice] = useState(false)

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
    confirm({
      title: 'Delete Contact?',
      message: 'This will permanently remove the contact and all their data. This cannot be undone.',
      confirmLabel: 'Yes, Delete',
      onConfirm: async () => {
        await supabase.from('contacts').delete().eq('id', id)
        setContacts(c => c.filter(x => x.id !== id))
        toast('Contact deleted')
        log({ cat:'contact', action:'Deleted', subject:'Contact', detail:'Permanently removed' })
      }
    })
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

  // Show full page contact detail
  if(fullPageId) return (
    <ContactDetail contactId={fullPageId} onBack={()=>setFullPageId(null)}/>
  )

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
          <Btn variant="ghost" size="sm" onClick={()=>setShowBulkUpload(true)}>⬆ Bulk Import</Btn>
          <Btn size="sm" variant="secondary" onClick={()=>setShowVoice(true)}>🎤 Voice</Btn>
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
            onSelect={id=>setFullPageId(id)}
            onDelete={deleteContact}
            onOpenFull={id=>setFullPageId(id)}/>
        ))}
      </Card>

      <ConfirmDialog/>

      {/* Voice capture modal */}
      {showVoice && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:999,backdropFilter:'blur(4px)'}} onClick={e=>{if(e.target===e.currentTarget)setShowVoice(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'20px 20px 0 0',padding:'20px',width:'100%',maxWidth:'480px',boxShadow:'0 -8px 40px rgba(0,0,0,.25)'}}>
            <VoiceCapture
              onSaved={contact=>{if(contact)loadContacts();setTimeout(()=>setShowVoice(false),2500)}}
              onClose={()=>setShowVoice(false)}
            />
          </div>
        </div>
      )}

      {/* Bulk Upload modal */}
      {showBulkUpload && (
        <BulkUpload
          board="contacts"
          onClose={()=>setShowBulkUpload(false)}
          onImport={async rows => {
            let imported = 0, errors = 0, errorDetails = []
            for(const row of rows) {
              try {
                const { error } = await supabase.from('contacts').insert([{
                  ...row,
                  agent_id: state.user?.id,
                  budget_max: row.budget_max ? parseFloat(row.budget_max.replace(/[^0-9.]/g,'')) : null,
                  budget_min: row.budget_min ? parseFloat(row.budget_min.replace(/[^0-9.]/g,'')) : null,
                }])
                if(error) { errors++; errorDetails.push({row:imported+errors, error:error.message}) }
                else imported++
              } catch(e) { errors++ }
            }
            await loadContacts()
            toast(imported + ' contacts imported!')
            return { imported, errors, updated:0, errorDetails }
          }}
        />
      )}

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

function ContactTableRow({ contact: c, onSelect, onDelete, onOpenFull }) {
  const ag = AGENTS.find(a => a.name === c.assigned_agent)
  return (
    <div onClick={()=>onSelect(c)}
      style={{display:'grid',gridTemplateColumns:'2.2fr 1fr 1fr 1fr 1fr 1fr 90px',padding:'12px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
        <Avatar name={c.first_name+' '+(c.last_name||'')} color={roleColor(c.role)} size={36}/>
        <div>
          <div onClick={e=>{e.stopPropagation();onOpenFull(c.id)}} style={{fontSize:'13px',fontWeight:700,color:'var(--red)',cursor:'pointer',textDecoration:'none',display:'inline'}} onMouseEnter={e=>e.currentTarget.style.textDecoration='underline'} onMouseLeave={e=>e.currentTarget.style.textDecoration='none'}>{c.first_name} {c.last_name||''}</div>
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
    if(!form.first_name.trim()){ toast('First name is required','#DC2626'); return }
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

