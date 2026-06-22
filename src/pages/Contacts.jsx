import React, { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useContacts } from '../lib/hooks'
import { useAgents } from '../lib/hooks'
import { validateContact, hasErrors } from '../lib/utils/validate'
import { fmtDate, getDaysAgo, initials, fmtPhone } from '../lib/utils'
import { useApp } from '../context/AppContext'

const STATUSES   = ['New','Hot','Warm','Cold','Active','Nurturing','Under Contract','Closed','Unresponsive']
const SOURCES    = ['Past Client Repeat','Past Client Referral','SOI','Referral','System Call','Social Media','Sign Call','Farm','Cold Calls','Zillow','Israel','Office Referral','Approached','Other']
const STATUS_COLORS = { New:'#0EA5E9',Hot:'#DC2626',Warm:'#D97706',Cold:'#94A3B8',Active:'#16A34A',Nurturing:'#7C3AED','Under Contract':'#2563EB',Closed:'#225091',Unresponsive:'#64748B' }

const EMPTY_FORM = { first_name:'', last_name:'', phone:'', email:'', address:'', city:'', state:'NY', zip:'', status:'New', source:'', tags:'', notes:'' }

export function Contacts() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const [search, setSearch]       = useState('')
  const [filterStatus, setFilter] = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [selected, setSelected]   = useState(null)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)

  // Auto-open contact from URL param
  useEffect(() => {
    if (urlId && contacts.length > 0) {
      const c = contacts.find(x => x.id === urlId)
      if (c) openEdit(c)
    }
  }, [urlId, contacts.length])

  const { contacts, loading, add, update, remove } = useContacts({
    search: search.length > 1 ? search : undefined,
    status: filterStatus || undefined,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    const payload = {
      ...form,
      agent_id: form.agent_id || agent?.id,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      last_activity: new Date().toISOString(),
    }
    const errs = validateContact(payload)
    if (hasErrors(errs)) { setErrors(errs); return }
    setSaving(true)
    try {
      if (selected) {
        await update(selected.id, payload)
        toast('✅ Contact updated!')
        setSelected(null)
      } else {
        await add(payload)
        toast('✅ Contact added!')
        setShowAdd(false)
      }
      setForm(EMPTY_FORM)
      setErrors({})
    } catch(e) {
      toast('Error: ' + e.message, '#DC2626')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this contact?')) return
    try {
      await remove(id)
      toast('Contact deleted')
      if (selected?.id === id) setSelected(null)
    } catch(e) {
      toast('Error: ' + e.message, '#DC2626')
    }
  }

  function openEdit(contact) {
    navigate('/contacts/' + contact.id)
    setForm({
      ...EMPTY_FORM,
      ...contact,
      tags: (contact.tags || []).join(', '),
    })
    setSelected(contact)
    setShowAdd(false)
    setErrors({})
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:'14px', height:'calc(100vh - 120px)' }}>
      {/* Left — contact list */}
      <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
        {/* Toolbar */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'12px', flexWrap:'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, email..."
            style={inputStyle}
          />
          <select value={filterStatus} onChange={e => setFilter(e.target.value)} style={selStyle}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => { setShowAdd(true); setSelected(null); setForm(EMPTY_FORM); setErrors({}) }} style={btnStyle}>
            + Add Contact
          </button>
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:'8px', marginBottom:'12px', flexWrap:'wrap' }}>
          {['Hot','Warm','New'].map(s => (
            <div key={s} onClick={() => setFilter(f => f===s?'':s)}
              style={{ fontSize:'11px', fontWeight:700, padding:'5px 12px', borderRadius:'20px', cursor:'pointer',
                background:filterStatus===s?(STATUS_COLORS[s]+'20'):'var(--dim)',
                border:`1.5px solid ${filterStatus===s?STATUS_COLORS[s]:'var(--border)'}`,
                color:filterStatus===s?STATUS_COLORS[s]:'var(--muted)' }}>
              {s} ({contacts.filter(c=>c.status===s).length})
            </div>
          ))}
          <div style={{ fontSize:'11px', color:'var(--muted)', padding:'5px 12px' }}>
            {contacts.length} total
          </div>
        </div>

        {/* List */}
        <div style={{ flex:1, overflowY:'auto', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px' }}>
          {loading && <div style={{ padding:'28px', textAlign:'center', color:'var(--muted)', fontSize:'13px' }}>Loading...</div>}
          {!loading && contacts.length === 0 && (
            <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)', fontSize:'13px' }}>
              <div style={{ fontSize:'28px', marginBottom:'10px' }}>👥</div>
              No contacts yet
            </div>
          )}
          {contacts.map(c => (
            <div key={c.id} onClick={() => openEdit(c)}
              style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                background: selected?.id===c.id ? 'rgba(204,34,0,.04)' : 'transparent' }}
              onMouseEnter={e => { if(selected?.id!==c.id) e.currentTarget.style.background='var(--hov)' }}
              onMouseLeave={e => { if(selected?.id!==c.id) e.currentTarget.style.background='transparent' }}>
              {/* Avatar */}
              <div style={{ width:38, height:38, borderRadius:'50%', background:(STATUS_COLORS[c.status]||'#94A3B8')+'18',
                border:`2px solid ${STATUS_COLORS[c.status]||'#94A3B8'}`, display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:'13px', fontWeight:800, color:STATUS_COLORS[c.status]||'#94A3B8', flexShrink:0 }}>
                {initials((c.first_name||'') + ' ' + (c.last_name||''))}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {c.first_name} {c.last_name}
                </div>
                <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>
                  {c.phone && <span>{c.phone} · </span>}
                  {c.email && <span>{c.email}</span>}
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px', flexShrink:0 }}>
                <StatusPill status={c.status} />
                <div style={{ fontSize:'10px', color:'var(--muted)' }}>{getDaysAgo(c.last_activity)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — add/edit form */}
      {(showAdd || selected) && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px', padding:'18px', overflowY:'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <div style={{ fontSize:'15px', fontWeight:800 }}>{selected ? 'Edit Contact' : 'New Contact'}</div>
            <button onClick={() => { setSelected(null); setShowAdd(false); navigate('/contacts') }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:'18px' }}>✕</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
            <Field label="First Name *" value={form.first_name} onChange={v=>set('first_name',v)} error={errors.first_name} ph="John"/>
            <Field label="Last Name"    value={form.last_name}  onChange={v=>set('last_name',v)}  ph="Smith"/>
          </div>
          <Field label="Phone" value={form.phone} onChange={v=>set('phone',v)} type="tel" ph="(845) 555-1234"/>
          <Field label="Email" value={form.email} onChange={v=>set('email',v)} type="email" error={errors.email} ph="john@email.com"/>
          <Field label="Address" value={form.address} onChange={v=>set('address',v)} ph="47 Prairie Ave"/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px', gap:'6px' }}>
            <Field label="City"  value={form.city}  onChange={v=>set('city',v)}  ph="Suffern"/>
            <Field label="State" value={form.state} onChange={v=>set('state',v)} ph="NY"/>
            <Field label="Zip"   value={form.zip}   onChange={v=>set('zip',v)}   ph="10901"/>
          </div>
          <div style={{ marginBottom:'10px' }}>
            <label style={lblStyle}>Status</label>
            <select value={form.status} onChange={e=>set('status',e.target.value)} style={{ ...selStyle, width:'100%' }}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:'10px' }}>
            <label style={lblStyle}>Source</label>
            <select value={form.source} onChange={e=>set('source',e.target.value)} style={{ ...selStyle, width:'100%' }}>
              <option value="">Select source...</option>
              {SOURCES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <Field label="Tags (comma separated)" value={form.tags} onChange={v=>set('tags',v)} ph="buyer, referral, hot"/>
          <Field label="Notes" value={form.notes} onChange={v=>set('notes',v)} rows={3} ph="Any notes..."/>

          <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
            {selected && (
              <button onClick={() => handleDelete(selected.id)}
                style={{ ...btnStyle, background:'rgba(220,38,38,.08)', color:'#DC2626', border:'1px solid rgba(220,38,38,.2)', flex:1 }}>
                Delete
              </button>
            )}
            <button onClick={handleSave} disabled={saving}
              style={{ ...btnStyle, flex:2, opacity:saving?.7:1 }}>
              {saving ? 'Saving…' : selected ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, ph='', type='text', rows, error }) {
  return (
    <div style={{ marginBottom:'10px' }}>
      <label style={lblStyle}>{label}</label>
      {rows
        ? <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows}
            style={{ ...inputStyle, resize:'vertical', lineHeight:1.6 }}/>
        : <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inputStyle}/>
      }
      {error && <div style={{ fontSize:'10px', color:'#DC2626', marginTop:'3px' }}>{error}</div>}
    </div>
  )
}

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || '#94A3B8'
  return (
    <span style={{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'20px',
      background:c+'18', color:c, border:`1px solid ${c}30`, whiteSpace:'nowrap' }}>
      {status}
    </span>
  )
}

const inputStyle = { width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none', boxSizing:'border-box' }
const selStyle   = { background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'8px 10px', outline:'none' }
const btnStyle   = { background:'#CC2200', border:'none', borderRadius:'9px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'10px 16px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }
const lblStyle   = { display:'block', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }
