// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Calls Log Page
// Track all inbound/outbound calls with outcomes and notes.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useCalls, useAgents } from '../lib/hooks'
import { fmtDateTime, fmtPhone } from '../lib/utils'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const DIRECTIONS = ['Outbound','Inbound']
const OUTCOMES   = ['No Answer','Voicemail','Connected','Callback Requested','Not Interested','Hot Lead','Appointment Set']

const BLANK = {
  contact_name: '', phone: '', direction: 'Outbound', outcome: '',
  duration: '', notes: '', called_at: ''
}

export function Calls() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { calls, loading, add, update, remove } = useCalls(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [selected,setSelected] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && calls.length > 0 && urlId !== 'new') {
      const c = calls.find(x => x.id === urlId)
      if (c) openCall(c)
    }
  }, [urlId, calls.length])

  function openCall(c) {
    navigate('/calls/' + c.id, { replace: true })
    setSelected(c)
    setForm({ ...BLANK, ...c })
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id, called_at: new Date().toISOString() })
    navigate('/calls/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    navigate('/calls', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveCall() {
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Call saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id, called_at: new Date().toISOString() })
        toast('✅ Call logged')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteCall() {
    try {
      await remove(selected.id)
      toast('Call deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = calls.filter(c => {
    if (search && !c.contact_name?.toLowerCase().includes(search.toLowerCase()) && !c.phone?.includes(search)) return false
    return true
  })

  const outcomeColor = (o) => {
    if (o === 'Hot Lead' || o === 'Appointment Set') return '#00c875'
    if (o === 'No Answer' || o === 'Not Interested') return '#df2f4a'
    return '#9aadbd'
  }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader title="Call Log" sub={`${calls.length} calls logged`} actions={<Btn onClick={openAdd}>+ Log Call</Btn>} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone..." style={{ flex: 1 }} />
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="📞" title="No calls logged" sub="Log your first call." action={<Btn onClick={openAdd}>+ Log Call</Btn>} />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--dim)' }}>
                {['Contact','Phone','Direction','Outcome','Duration','Notes','Agent','Date'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => openCall(c)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '11px 12px', fontWeight: 600 }}>{c.contact_name || '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)' }}>{fmtPhone(c.phone)}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={c.direction} color={c.direction === 'Inbound' ? '#007eb5' : '#fdab3d'} /></td>
                  <td style={{ padding: '11px 12px' }}>{c.outcome ? <Pill label={c.outcome} color={outcomeColor(c.outcome)} /> : '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{c.duration || '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes || '—'}</td>
                  <td style={{ padding: '11px 12px' }}>{c.agents ? <Avatar agent={c.agents} size={22} /> : '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDateTime(c.called_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected ? 'Edit Call' : 'Log Call'} width={480}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Contact Name">
            <Input value={form.contact_name} onChange={v => set('contact_name', v)} placeholder="John Smith" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={v => set('phone', v)} placeholder="(845) 555-1234" type="tel" />
          </Field>
          <Field label="Direction">
            <Select value={form.direction} onChange={v => set('direction', v)} options={DIRECTIONS} />
          </Field>
          <Field label="Outcome">
            <Select value={form.outcome} onChange={v => set('outcome', v)} options={OUTCOMES} placeholder="How did it go?" />
          </Field>
          <Field label="Duration">
            <Input value={form.duration} onChange={v => set('duration', v)} placeholder="5 min" />
          </Field>
          {(isAdmin || canManage) && (
            <Field label="Agent">
              <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Agent" />
            </Field>
          )}
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="What was discussed?" rows={3} />
        </Field>
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveCall} loading={saving}>{selected ? 'Save' : 'Log Call'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this call log?" onConfirm={deleteCall} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
