// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Offers Page
// Private offer tracking per agent. Mirrors Agent Offers board.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useOffers, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { OFFER_SIDES, OFFER_STATUSES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm, StatCard
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = {
  listing_addr: '', buyer_name: '', production: '', gci: '',
  side: 'Buyer', status: 'Sent', submitted_at: '', expiry: '', notes: ''
}

export function Offers() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { offers, loading, add, update, remove } = useOffers(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [statusF, setStatusF] = useState('')
  const [agentF,  setAgentF]  = useState('')
  const [selected,setSelected] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && offers.length > 0 && urlId !== 'new') {
      const o = offers.find(x => x.id === urlId)
      if (o) openOffer(o)
    }
  }, [urlId, offers.length])

  function openOffer(o) {
    navigate('/offers/' + o.id, { replace: true })
    setSelected(o)
    setForm({ ...BLANK, ...o })
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id })
    navigate('/offers/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    navigate('/offers', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveOffer() {
    if (!form.listing_addr.trim()) { toast('Listing address is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Offer saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Offer added')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteOffer() {
    try {
      await remove(selected.id)
      toast('Offer deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = offers.filter(o => {
    if (statusF && o.status !== statusF) return false
    if (agentF  && o.agent_id !== agentF) return false
    if (search  && !matchSearch(o, search, ['listing_addr','buyer_name'])) return false
    return true
  })

  const statusColor = (s) => OFFER_STATUSES.find(x => x.value === s)?.hex || '#c4c4c4'

  const sent = offers.filter(o => o.status === 'Sent').length
  const ao   = offers.filter(o => o.status === 'AO').length

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader title="Offers" sub={(offers.length) + " total offers"} actions={<Btn onClick={openAdd}>+ Add Offer</Btn>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Total Offers" value={offers.length} icon="📝" />
        <StatCard label="Sent / Pending" value={sent} accent="#fdab3d" icon="📤" />
        <StatCard label="Accepted (AO)" value={ao} accent="#00c875" icon="✅" />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address, buyer..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Statuses</option>
          {OFFER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(isAdmin || canManage) && (
          <select value={agentF} onChange={e => setAgentF(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="📝" title="No offers" sub="Track submitted offers here." action={<Btn onClick={openAdd}>+ Add Offer</Btn>} />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--dim)' }}>
                {['Address','Buyer','Agent','Side','Status','Production','GCI','Submitted','Expiry'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} onClick={() => openOffer(o)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '11px 12px', fontWeight: 600, color: 'var(--text)' }}>{o.listing_addr}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)' }}>{o.buyer_name || '—'}</td>
                  <td style={{ padding: '11px 12px' }}>{o.agents ? <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Avatar agent={o.agents} size={20} /><span style={{ fontSize: '12px', color: 'var(--muted)' }}>{o.agents.name?.split(' ')[0]}</span></div> : '—'}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{o.side}</td>
                  <td style={{ padding: '11px 12px' }}><Pill label={o.status} color={statusColor(o.status)} /></td>
                  <td style={{ padding: '11px 12px', fontWeight: 600 }}>{fmt$(o.production)}</td>
                  <td style={{ padding: '11px 12px', fontWeight: 700, color: '#10B981' }}>{fmt$(o.gci)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(o.submitted_at)}</td>
                  <td style={{ padding: '11px 12px', color: 'var(--muted)', fontSize: '12px' }}>{fmtDate(o.expiry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected ? "Offer — " + (selected.listing_addr) : 'New Offer'} width={500}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Listing Address" required>
            <Input value={form.listing_addr} onChange={v => set('listing_addr', v)} placeholder="123 Main St" />
          </Field>
          <Field label="Buyer Name">
            <Input value={form.buyer_name} onChange={v => set('buyer_name', v)} placeholder="John Smith" />
          </Field>
          <Field label="Side">
            <Select value={form.side} onChange={v => set('side', v)} options={OFFER_SIDES} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={v => set('status', v)} options={OFFER_STATUSES} />
          </Field>
          <Field label="Production $">
            <Input value={form.production} onChange={v => set('production', v)} placeholder="500000" type="number" />
          </Field>
          <Field label="GCI $">
            <Input value={form.gci} onChange={v => set('gci', v)} placeholder="15000" type="number" />
          </Field>
          <Field label="Date Submitted">
            <Input value={form.submitted_at} onChange={v => set('submitted_at', v)} type="date" />
          </Field>
          <Field label="Offer Expiry">
            <Input value={form.expiry} onChange={v => set('expiry', v)} type="date" />
          </Field>
        </div>
        {(isAdmin || canManage) && (
          <Field label="Agent">
            <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
          </Field>
        )}
        <Field label="Notes">
          <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Offer notes..." rows={3} />
        </Field>
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveOffer} loading={saving}>{selected ? 'Save' : 'Add Offer'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this offer?" onConfirm={deleteOffer} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
