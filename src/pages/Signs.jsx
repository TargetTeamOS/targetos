// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Signs Page
// Track For Sale signs, Under Contract signs, and Sold signs.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useSigns, useAgents, useListings } from '../lib/hooks'
import { fmtDate, matchSearch } from '../lib/utils'
import { SIGN_STATUSES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const SIGN_TYPES = ['For Sale','Under Contract','Sold','Open House','Coming Soon']
const BLANK = { addr: '', type: 'For Sale', installed: '', removed: '' }

export function Signs() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { signs, loading, add, update, remove } = useSigns(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [selected,setSelected] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && signs.length > 0 && urlId !== 'new') {
      const s = signs.find(x => x.id === urlId)
      if (s) { navigate('/signs/' + s.id, { replace: true }); setSelected(s); setForm({ ...BLANK, ...s }) }
    }
  }, [urlId, signs.length])

  function closePanel() {
    setSelected(null)
    navigate('/signs', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveSign() {
    if (!form.addr.trim()) { toast('Address required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Sign saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Sign added')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteSign() {
    try {
      await remove(selected.id)
      toast('Sign deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = signs.filter(s => {
    if (search && !matchSearch(s, search, ['addr'])) return false
    return true
  })

  const typeColor = (t) => {
    if (t === 'For Sale') return '#00c875'
    if (t === 'Under Contract') return '#007eb5'
    if (t === 'Sold') return '#225091'
    return '#fdab3d'
  }

  const active  = signs.filter(s => !s.removed).length
  const removed = signs.filter(s => s.removed).length

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Signs"
        sub={`${active} active · ${removed} removed`}
        actions={<Btn onClick={() => { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); navigate('/signs/new') }}>+ Add Sign</Btn>}
      />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address..." style={{ flex: 1 }} />
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="🪧" title="No signs tracked" sub="Track sign installations here." action={<Btn onClick={() => { setForm({ ...BLANK, agent_id: agent?.id }); navigate('/signs/new') }}>+ Add Sign</Btn>} />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--dim)' }}>
                {['Address','Type','Agent','Installed','Removed','Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} onClick={() => { navigate('/signs/' + s.id); setSelected(s); setForm({ ...BLANK, ...s }) }}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '11px 12px', fontWeight: 600 }}>{s.addr}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={s.type} color={typeColor(s.type)} /></td>
                  <td style={{ padding: '11px 12px' }}>{s.agents ? <Avatar agent={s.agents} size={22} /> : '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(s.installed)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(s.removed)}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={s.removed ? 'Removed' : 'Up'} color={s.removed ? '#94A3B8' : '#10B981'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected ? `Sign — ${selected.addr}` : 'Add Sign'} width={440}>
        <Field label="Address" required>
          <Input value={form.addr} onChange={v => set('addr', v)} placeholder="123 Main St" />
        </Field>
        <Field label="Sign Type">
          <Select value={form.type} onChange={v => set('type', v)} options={SIGN_TYPES} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Installed">
            <Input value={form.installed} onChange={v => set('installed', v)} type="date" />
          </Field>
          <Field label="Removed">
            <Input value={form.removed} onChange={v => set('removed', v)} type="date" />
          </Field>
        </div>
        {(isAdmin || canManage) && (
          <Field label="Agent">
            <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
          </Field>
        )}
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveSign} loading={saving}>{selected ? 'Save' : 'Add Sign'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this sign record?" onConfirm={deleteSign} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
