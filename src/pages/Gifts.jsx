// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Gifts Page
// UC Gift Sheet tracking. Mirrors the Monday.com UC Gift Sheet
// exactly — all status labels, colors, and fields.
// ═══════════════════════════════════════════════════════════════

import { AddressAutocomplete } from '../components/AddressAutocomplete'
import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useGifts, useAgents } from '../lib/hooks'
import { fmtDate, matchSearch } from '../lib/utils'
import { GIFT_STATUSES, GIFT_LABELS, CLOSING_GIFT_STATUSES } from '../lib/constants'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm, StatCard
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = {
  type: 'Under Contract', client_name: '', address: '', unit: '', phone: '',
  status: 'Under Contract', label: '', contract_date: '', sending_date: '',
  closing_gift_status: '', tracking_number: '', amount: '', vendor: '', notes: ''
}

export function Gifts() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { gifts, loading, add, update, remove } = useGifts(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [statusF, setStatusF] = useState('')
  const [selected,setSelected] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && gifts.length > 0 && urlId !== 'new') {
      const g = gifts.find(x => x.id === urlId)
      if (g) openGift(g)
    }
  }, [urlId, gifts.length])

  function openGift(g) {
    navigate('/gifts/' + g.id, { replace: true })
    setSelected(g)
    setForm({ ...BLANK, ...g })
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id })
    navigate('/gifts/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    navigate('/gifts', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveGift() {
    if (!form.client_name.trim()) { toast('Client name is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Gift saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Gift added')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteGift() {
    try {
      await remove(selected.id)
      toast('Gift deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = gifts.filter(g => {
    if (statusF && g.status !== statusF) return false
    if (search  && !matchSearch(g, search, ['client_name','address','tracking_number'])) return false
    return true
  })

  const statusColor = (s) => GIFT_STATUSES.find(x => x.value === s)?.hex || '#c4c4c4'

  const pending   = gifts.filter(g => !['Delivered'].includes(g.status)).length
  const delivered = gifts.filter(g => g.status === 'Delivered').length

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Gift Sheet"
        sub="Under Contract & Closing gifts"
        actions={<Btn onClick={openAdd}>+ Add Gift</Btn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Total Gifts" value={gifts.length} icon="🎁" />
        <StatCard label="Pending Delivery" value={pending} accent="#fdab3d" icon="⏳" />
        <StatCard label="Delivered" value={delivered} accent="#00c875" icon="✅" />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search client, address..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Statuses</option>
          {GIFT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="🎁" title="No gifts" sub="Track UC and closing gifts here." action={<Btn onClick={openAdd}>+ Add Gift</Btn>} />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--dim)' }}>
                {['Client','Address','Phone','Status','Label','Contract Date','Sending Date','Tracking'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <tr key={g.id} onClick={() => openGift(g)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '11px 12px', fontWeight: 600, color: 'var(--text)' }}>{g.client_name}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{g.address}{g.unit ? " #" + (g.unit) : ''}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{g.phone || '—'}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={g.status} color={statusColor(g.status)} /></td>
                  <td style={{ padding: '11px 12px' }}>{g.label ? <Pill label={g.label} color="#9d99b9" /> : '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(g.contract_date)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(g.sending_date)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{g.tracking_number || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!(selected || (urlId === 'new'))} onClose={closePanel} title={selected ? "Gift — " + (selected.client_name) : 'New Gift'} width={540}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Client Name" required>
            <Input value={form.client_name} onChange={v => set('client_name', v)} placeholder="John Smith" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={v => set('phone', v)} placeholder="(845) 555-1234" type="tel" />
          </Field>
          <Field label="Address">
            <AddressAutocomplete value={form.address||''} onChange={v => set('address', v)} placeholder="123 Main St, Monsey NY" />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={v => set('unit', v)} placeholder="Apt 2B" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={v => set('status', v)} options={GIFT_STATUSES} />
          </Field>
          <Field label="Label">
            <Select value={form.label} onChange={v => set('label', v)} options={GIFT_LABELS} placeholder="Client type" />
          </Field>
          <Field label="Contract Date">
            <Input value={form.contract_date} onChange={v => set('contract_date', v)} type="date" />
          </Field>
          <Field label="Sending Date">
            <Input value={form.sending_date} onChange={v => set('sending_date', v)} type="date" />
          </Field>
          <Field label="Closing Gift">
            <Select value={form.closing_gift_status} onChange={v => set('closing_gift_status', v)} options={CLOSING_GIFT_STATUSES} placeholder="Status" />
          </Field>
          <Field label="Tracking #">
            <Input value={form.tracking_number} onChange={v => set('tracking_number', v)} placeholder="Tracking number" />
          </Field>
        </div>
        {(isAdmin || canManage) && (
          <Field label="Agent">
            <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
          </Field>
        )}
        <Field label="Notes">
          <Input value={form.notes} onChange={v => set('notes', v)} placeholder="Notes..." />
        </Field>
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveGift} loading={saving}>{selected ? 'Save' : 'Add Gift'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this gift record?" onConfirm={deleteGift} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
