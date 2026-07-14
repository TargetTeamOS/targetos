// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Open House Page
// Manage open houses and track every visitor.
// ═══════════════════════════════════════════════════════════════

import { AddressAutocomplete } from '../components/AddressAutocomplete'
import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useOpenHouses, useAgents } from '../lib/hooks'
import { db } from '../lib/db'
import { fmtDate, fmtPhone } from '../lib/utils'
import { OH_INTEREST_LEVELS } from '../lib/constants'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import { usePageView, LastVisited } from '../components/PageViewTracking'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Confirm,
  SectionTitle, Divider
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK_OH = { listing_addr: '', date: '', start_time: '', end_time: '', notes: '' }
const BLANK_V  = { first_name: '', last_name: '', phone: '', email: '', interest_level: 'Warm', notes: '' }

export function OpenHouse() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  usePageView('openhouse')
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { openHouses, loading, add, update, remove } = useOpenHouses(filters)
  const { agents } = useAgents()

  const [selected,    setSelected]    = useState(null)
  const [visitors,    setVisitors]    = useState([])
  const [loadingV,    setLoadingV]    = useState(false)
  const [form,        setForm]        = useState(BLANK_OH)
  const [vForm,       setVForm]       = useState(BLANK_V)
  const [saving,      setSaving]      = useState(false)
  const [savingV,     setSavingV]     = useState(false)
  const [showOHForm,  setShowOHForm]  = useState(false)
  const [showVForm,   setShowVForm]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && openHouses.length > 0 && urlId !== 'new') {
      const oh = openHouses.find(x => x.id === urlId)
      if (oh) openOH(oh)
    }
    if (urlId === 'new') { setForm({ ...BLANK_OH, agent_id: agent?.id }); setShowOHForm(true) }
  }, [urlId, openHouses.length])

  async function openOH(oh) {
    navigate('/openhouse/' + oh.id, { replace: true })
    setSelected(oh)
    setForm({ ...BLANK_OH, ...oh })
    setShowVForm(false)
    setLoadingV(true)
    try {
      const v = await db.visitors.list(oh.id)
      setVisitors(v || [])
    } catch { setVisitors([]) }
    finally { setLoadingV(false) }
  }

  function closePanel() {
    setSelected(null)
    setShowOHForm(false)
    setVisitors([])
    navigate('/openhouse', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setV(k, v) { setVForm(f => ({ ...f, [k]: v })) }

  async function saveOH() {
    if (!form.listing_addr.trim()) { toast('Address required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form, agent?.id)
        setSelected(updated)
        toast('✅ Open house saved')
      } else {
        const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Open house created')
        navigate('/openhouse/' + created.id)
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function saveVisitor() {
    if (!form.first_name && !vForm.first_name.trim()) { toast('Name required', '#DC2626'); return }
    setSavingV(true)
    try {
      const v = await db.visitors.create({
        ...vForm,
        open_house_id: selected.id,
        listing_addr: selected.listing_addr,
      })
      setVisitors(vis => [v, ...vis])
      setVForm(BLANK_V)
      setShowVForm(false)
      toast('✅ Visitor added')
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSavingV(false) }
  }

  async function deleteOH() {
    try {
      await remove(selected.id)
      toast('Open house deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const interestColor = (l) => {
    if (l === 'Hot') return '#DC2626'
    if (l === 'Warm') return '#F97316'
    if (l === 'Cold') return '#94A3B8'
    return '#9aadbd'
  }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Open Houses"
        sub={(openHouses.length) + " open houses"}
        actions={<div style={{display:'flex',gap:8,alignItems:'center'}}><LastVisited page="openhouse" /><Btn onClick={() => { setForm({ ...BLANK_OH, agent_id: agent?.id }); setShowOHForm(true); navigate('/openhouse/new') }}>+ Add Open House</Btn></div>}
      />

      {loading && <Loading />}
      {!loading && openHouses.length === 0 && (
        <Empty icon="🚪" title="No open houses" sub="Schedule your first open house." action={<Btn onClick={() => { setForm({ ...BLANK_OH, agent_id: agent?.id }); setShowOHForm(true) }}>+ Add Open House</Btn>} />
      )}

      {/* Open Houses Grid */}
      {!loading && openHouses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
          {openHouses.map(oh => (
            <div key={oh.id} onClick={() => openOH(oh)}
              style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: selected?.id === oh.id ? '2px solid var(--brand)' : '1px solid var(--border)', padding: '16px', cursor: 'pointer', transition: 'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '6px' }}>{oh.listing_addr}</div>
              <div style={{ fontSize: '13px', color: 'var(--brand)', fontWeight: 600, marginBottom: '4px' }}>📅 {fmtDate(oh.date)}</div>
              {oh.start_time && <div style={{ fontSize: '12px', color: 'var(--muted)' }}>🕐 {oh.start_time} — {oh.end_time || '?'}</div>}
              {oh.agents && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px' }}>
                  <Avatar agent={oh.agents} size={18} />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{oh.agents.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected OH Detail Modal */}
      <Modal open={!!(selected)} onClose={closePanel} title={"Open House — " + (selected?.listing_addr || '')} width={600}>
        {/* OH Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <Field label="Address">
            <AddressAutocomplete value={form.listing_addr||''} onChange={v => set('listing_addr', v)} onSelect={s => set('listing_addr', s.full || s.street)} placeholder="123 Main St, Monsey NY" />
          </Field>
          <Field label="Date">
            <Input value={form.date} onChange={v => set('date', v)} type="date" />
          </Field>
          <Field label="Start Time">
            <Input value={form.start_time} onChange={v => set('start_time', v)} type="time" />
          </Field>
          <Field label="End Time">
            <Input value={form.end_time} onChange={v => set('end_time', v)} type="time" />
          </Field>
        </div>

        {selected?.id && <RecordActivityFeed table="open_houses" recordId={selected.id} compact />}

        <ModalActions>
          <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>
          <Btn variant="secondary" onClick={() => setShowVForm(v => !v)}>+ Add Visitor</Btn>
          <Btn onClick={saveOH} loading={saving}>Save</Btn>
        </ModalActions>

        <Divider />

        {/* Add Visitor Form */}
        {showVForm && (
          <div style={{ background: 'var(--dim)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '12px' }}>Add Visitor</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="First Name">
                <Input value={vForm.first_name} onChange={v => setV('first_name', v)} placeholder="John" />
              </Field>
              <Field label="Last Name">
                <Input value={vForm.last_name} onChange={v => setV('last_name', v)} placeholder="Smith" />
              </Field>
              <Field label="Phone">
                <Input value={vForm.phone} onChange={v => setV('phone', v)} placeholder="(845) 555-1234" type="tel" />
              </Field>
              <Field label="Interest">
                <Select value={vForm.interest_level} onChange={v => setV('interest_level', v)} options={OH_INTEREST_LEVELS} />
              </Field>
            </div>
            <Field label="Notes">
              <Input value={vForm.notes} onChange={v => setV('notes', v)} placeholder="Visitor notes..." />
            </Field>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <Btn onClick={saveVisitor} loading={savingV}>Save Visitor</Btn>
              <Btn variant="secondary" onClick={() => setShowVForm(false)}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Visitors List */}
        <SectionTitle>Visitors ({visitors.length})</SectionTitle>
        {loadingV && <Loading />}
        {!loadingV && visitors.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '13px' }}>No visitors yet</div>
        )}
        {visitors.map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: interestColor(v.interest_level), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
              {(v.first_name?.[0] || '') + (v.last_name?.[0] || '')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{v.first_name} {v.last_name}</div>
              {v.phone && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtPhone(v.phone)}</div>}
              {v.notes && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{v.notes}</div>}
            </div>
            <Pill label={v.interest_level} color={interestColor(v.interest_level)} />
          </div>
        ))}
      </Modal>

      {/* Add OH Modal */}
      <Modal open={showOHForm && !selected} onClose={() => { setShowOHForm(false); navigate('/openhouse') }} title="New Open House" width={460}>
        <Field label="Address" required>
          <AddressAutocomplete value={form.listing_addr||''} onChange={v => set('listing_addr', v)} onSelect={s => set('listing_addr', s.full || s.street)} placeholder="123 Main St, Monsey NY" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Date">
            <Input value={form.date} onChange={v => set('date', v)} type="date" />
          </Field>
          <Field label="Start Time">
            <Input value={form.start_time} onChange={v => set('start_time', v)} type="time" />
          </Field>
          <Field label="End Time">
            <Input value={form.end_time} onChange={v => set('end_time', v)} type="time" />
          </Field>
          {(isAdmin || canManage) && (
            <Field label="Agent">
              <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
            </Field>
          )}
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={() => { setShowOHForm(false); navigate('/openhouse') }}>Cancel</Btn>
          <Btn onClick={saveOH} loading={saving}>Create Open House</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this open house?" onConfirm={deleteOH} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
