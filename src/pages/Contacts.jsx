// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Contacts Page
// Full lead/contact management. Every contact has its own URL.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { FileAttachments } from '../components/FileAttachments'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useContacts, useAgents } from '../lib/hooks'
import { db } from '../lib/db'
import { ImportExport } from '../components/ImportExport'
import { fmt$, fmtDate, fmtPhone, initials, matchSearch } from '../lib/utils'
import { CONTACT_STATUSES, CONTACT_SOURCES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Tabs, SectionTitle,
  Card, Confirm, Divider
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const CONTACT_EXPORT_COLS = [
  { key:'first_name', label:'First Name', example:'John' },
  { key:'last_name',  label:'Last Name',  example:'Smith' },
  { key:'phone',      label:'Phone',      example:'8455551234' },
  { key:'email',      label:'Email',      example:'john@email.com' },
  { key:'status',     label:'Status',     example:'Hot' },
  { key:'source',     label:'Source',     example:'SOI' },
  { key:'type',       label:'Type',       example:'Buyer' },
  { key:'budget_max', label:'Budget Max', example:'500000', type:'number' },
  { key:'notes',      label:'Notes',      example:'' },
]

const BLANK = {
  first_name: '', last_name: '', phone: '', email: '', address: '',
  city: '', state: 'NY', zip: '', status: 'New', source: '', tags: [], notes: ''
}

export function Contacts() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  // Admins/secretaries see all; agents see their own
  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { contacts, loading, add, update, remove, refetch } = useContacts(filters)
  const { agents } = useAgents()

  const [search,      setSearch]      = useState('')
  const [statusF,     setStatusF]     = useState('')
  const [agentF,      setAgentF]      = useState('')
  const [selected,    setSelected]    = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)
  const [form,        setForm]        = useState(BLANK)
  const [saving,      setSaving]      = useState(false)
  const [tab,         setTab]         = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDel,     setBulkDel]     = useState(false)

  // Auto-open from URL param
  useEffect(() => {
    if (urlId && contacts.length > 0 && urlId !== 'new') {
      const c = contacts.find(x => x.id === urlId)
      if (c) openContact(c)
    }
    if (urlId === 'new') openAdd()
  }, [urlId, contacts.length])

  function openContact(c) {
    navigate('/contacts/' + c.id, { replace: true })
    setSelected(c)
    setForm({ ...BLANK, ...c })
    setShowAdd(false)
    setTab('info')
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id })
    setShowAdd(true)
    navigate('/contacts/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    setShowAdd(false)
    navigate('/contacts', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveContact() {
    if (!form.first_name.trim()) { toast('First name is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Contact saved')
      } else {
        const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Contact added')
        closePanel()
        navigate('/contacts/' + created.id)
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteContact() {
    try {
      await remove(selected.id)
      toast('Contact deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  // ── FILTER ────────────────────────────────────────────────────
  const filtered = contacts.filter(c => {
    if (statusF && c.status !== statusF) return false
    if (agentF  && c.agent_id !== agentF) return false
    if (search  && !matchSearch(c, search, ['first_name','last_name','phone','email','address','notes'])) return false
    return true
  })

  const statusColor = (s) => CONTACT_STATUSES.find(x => x.value === s)?.color || '#94A3B8'

  async function bulkDelete() {
    if (!selectedIds.length) return
    if (!window.confirm(`Delete ${selectedIds.length} contact${selectedIds.length !== 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkDel(true)
    try {
      await supabase.from('contacts').delete().in('id', selectedIds)
      setSelectedIds([])
      toast(`✅ Deleted ${selectedIds.length} contact${selectedIds.length !== 1 ? 's' : ''}`)
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setBulkDel(false) }
  }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Contacts"
        sub={`${filtered.length} contacts`}
        actions={
          <Btn onClick={openAdd}>+ Add Contact</Btn>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, email..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Statuses</option>
          {CONTACT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(isAdmin || canManage) && (
          <select value={agentF} onChange={e => setAgentF(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'#1B2B4B', borderRadius:'10px', marginBottom:'10px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', fontWeight:700, color:'#fff' }}>{selectedIds.length} selected</span>
          <div style={{ flex:1 }} />
          <button onClick={bulkDelete} disabled={bulkDel}
            style={{ padding:'5px 12px', borderRadius:'6px', border:'1px solid rgba(220,38,38,.5)', background:'rgba(220,38,38,.2)', color:'#FCA5A5', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            {bulkDel ? '⏳' : '🗑️'} Delete {selectedIds.length}
          </button>
          <button onClick={() => setSelectedIds([])}
            style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'rgba(255,255,255,.7)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
            ✕ Clear
          </button>
        </div>
      )}

      {loading && <Loading />}

      {!loading && filtered.length === 0 && (
        <Empty icon="👥" title="No contacts yet" sub="Add your first lead using the button above or voice capture." action={<Btn onClick={openAdd}>+ Add Contact</Btn>} />
      )}

      {/* Contact Grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {filtered.map(c => (
            <div key={c.id} onClick={() => navigate('/contacts/' + c.id + '/detail')}
              style={{ background: selectedIds.includes(c.id) ? 'rgba(204,34,0,.04)' : 'var(--panel)', borderRadius: 'var(--radius)', border: selectedIds.includes(c.id) ? '2px solid #CC220044' : selected?.id === c.id ? '2px solid var(--brand)' : '1px solid var(--border)', padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow .15s', position: 'relative' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              {/* Selection checkbox */}
              <div
                onClick={e => { e.stopPropagation(); setSelectedIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]) }}
                style={{ position:'absolute', top:10, left:10, width:16, height:16, borderRadius:'4px', border:`2px solid ${selectedIds.includes(c.id) ? '#CC2200' : 'var(--border)'}`, background: selectedIds.includes(c.id) ? '#CC2200' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, transition:'all .12s' }}>
                {selectedIds.includes(c.id) && <span style={{ color:'#fff', fontSize:'9px', fontWeight:900, lineHeight:1 }}>✓</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: statusColor(c.status), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                  {initials(c.first_name + ' ' + (c.last_name || ''))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={'/contacts/' + c.id + '/detail'} onClick={e => { e.preventDefault(); navigate('/contacts/' + c.id + '/detail') }}
                    style={{ fontWeight: 700, fontSize: '14px', color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textDecoration: 'none' }}>
                    {c.first_name} {c.last_name}
                  </a>
                  {c.phone && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{fmtPhone(c.phone)}</div>}
                  {c.email && <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                </div>
                <Pill label={c.status} color={statusColor(c.status)} />
              </div>
              {c.address && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {c.address}</div>}
              {c.source && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>📌 {c.source}</div>}
              {c.agents && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px' }}>
                  <Avatar agent={c.agents} size={18} />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.agents.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail / Add Panel */}
      <Modal open={!!(selected || showAdd)} onClose={closePanel} title={selected ? `${selected.first_name} ${selected.last_name || ''}` : 'New Contact'} width={560}>

        {selected && (
          <Tabs tabs={['info','notes','files','activity']} active={tab} onChange={setTab} />
        )}

        {(!selected || tab === 'info') && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="First Name" required>
                <Input value={form.first_name} onChange={v => set('first_name', v)} placeholder="John" />
              </Field>
              <Field label="Last Name">
                <Input value={form.last_name} onChange={v => set('last_name', v)} placeholder="Smith" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={v => set('phone', v)} placeholder="(845) 555-1234" type="tel" />
              </Field>
              <Field label="Email">
                <Input value={form.email} onChange={v => set('email', v)} placeholder="john@email.com" type="email" />
              </Field>
            </div>

            <Field label="Address">
              <Input value={form.address} onChange={v => set('address', v)} placeholder="123 Main St" />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <Field label="City">
                <Input value={form.city} onChange={v => set('city', v)} placeholder="Monsey" />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={v => set('state', v)} placeholder="NY" />
              </Field>
              <Field label="Zip">
                <Input value={form.zip} onChange={v => set('zip', v)} placeholder="10952" />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Status">
                <Select value={form.status} onChange={v => set('status', v)} options={CONTACT_STATUSES} />
              </Field>
              <Field label="Source">
                <Select value={form.source} onChange={v => set('source', v)} options={CONTACT_SOURCES} placeholder="How did they find you?" />
              </Field>
            </div>

            {(isAdmin || canManage) && (
              <Field label="Assigned Agent">
                <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign to agent" />
              </Field>
            )}
          </div>
        )}

        {selected && tab === 'notes' && (
          <Field label="Notes">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Add notes about this contact..." rows={8} />
          </Field>
        )}
        {selected && tab === 'files' && (
          <FileAttachments tableName="contacts" recordId={selected.id} />
        )}
        {selected && tab === 'activity' && (
          <RecordActivity recordId={selected.id} tableName="contacts" />
        )}

        <ModalActions>
          {selected && (
            <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>
          )}
          {selected?.phone && (
            <Btn variant="secondary" onClick={() => window.open('tel:' + selected.phone.replace(/\D/g,''))}>📞 Call</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveContact} loading={saving}>{selected ? 'Save Changes' : 'Add Contact'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm
        open={confirmDelete}
        message={`Delete ${selected?.first_name} ${selected?.last_name || ''}? This cannot be undone.`}
        onConfirm={deleteContact}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
