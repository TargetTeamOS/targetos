// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Listings Page
// Active listings management with full detail view.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useListings, useAgents } from '../lib/hooks'
import { fmt$, fmtDate, matchSearch } from '../lib/utils'
import { LISTING_STATUSES, LISTING_PROPERTY_TYPES, LISTING_DEAL_TYPES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Tabs,
  SectionTitle, StatCard, Confirm
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = {
  addr: '', city: '', state: 'NY', zip: '', status: 'Active',
  list_price: '', property_type: '', deal_type: 'MLS', beds: '', baths: '',
  sqft: '', tax: '', door_lock: '', mls_link: '', buyers_agent_pct: '',
  seller_name: '', list_date: '', ad_budget: '2000', notes: ''
}

export function Listings() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { listings, loading, add, update, remove } = useListings(filters)
  const { agents } = useAgents()

  const [search,  setSearch]  = useState('')
  const [statusF, setStatusF] = useState('Active')
  const [selected,setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [tab,     setTab]     = useState('info')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && listings.length > 0 && urlId !== 'new') {
      const l = listings.find(x => x.id === urlId)
      if (l) openListing(l)
    }
    if (urlId === 'new') { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); setShowAdd(true) }
  }, [urlId, listings.length])

  function openListing(l) {
    navigate('/listings/' + l.id, { replace: true })
    setSelected(l)
    setForm({ ...BLANK, ...l })
    setShowAdd(false)
    setTab('info')
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id })
    setShowAdd(true)
    navigate('/listings/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    setShowAdd(false)
    navigate('/listings', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveListing() {
    if (!form.addr.trim()) { toast('Address is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Listing saved')
      } else {
        const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Listing added')
        navigate('/listings/' + created.id)
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteListing() {
    try {
      await remove(selected.id)
      toast('Listing deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = listings.filter(l => {
    if (statusF && l.status !== statusF) return false
    if (search  && !matchSearch(l, search, ['addr','city','seller_name','notes'])) return false
    return true
  })

  const statusColor = (s) => LISTING_STATUSES.find(x => x.value === s)?.hex || '#c4c4c4'

  const active   = listings.filter(l => l.status === 'Active').length
  const uc       = listings.filter(l => l.status === 'Under Contract' || l.status === 'Accepted offer').length
  const totalVal = listings.filter(l => l.status === 'Active').reduce((s, l) => s + (parseFloat(l.list_price) || 0), 0)

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Listings"
        sub={`${active} active · ${uc} under contract`}
        actions={<Btn onClick={openAdd}>+ Add Listing</Btn>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label="Active Listings" value={active} accent="#00c875" icon="🏡" />
        <StatCard label="Under Contract" value={uc} accent="#784bd1" icon="📝" />
        <StatCard label="Active Volume" value={fmt$(totalVal)} accent="#F5A623" icon="💰" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search address, seller..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Statuses</option>
          {LISTING_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="🏡" title="No listings" sub="Add your first listing." action={<Btn onClick={openAdd}>+ Add Listing</Btn>} />
      )}

      {/* Listing Cards */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {filtered.map(l => (
            <div key={l.id} onClick={() => openListing(l)}
              style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: selected?.id === l.id ? '2px solid var(--brand)' : '1px solid var(--border)', padding: '16px', cursor: 'pointer', transition: 'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', flex: 1, paddingRight: '8px' }}>
                  {l.addr}
                  {l.city && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>, {l.city}</span>}
                </div>
                <Pill label={l.status} color={statusColor(l.status)} />
              </div>

              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand)', marginBottom: '8px' }}>
                {fmt$(l.list_price)}
              </div>

              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                {l.beds && <span>🛏 {l.beds} bed</span>}
                {l.baths && <span>🛁 {l.baths} bath</span>}
                {l.sqft && <span>📐 {l.sqft} sqft</span>}
              </div>

              {l.property_type && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>{l.property_type} · {l.deal_type}</div>}

              {l.agents && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '8px' }}>
                  <Avatar agent={l.agents} size={18} />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{l.agents.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!(selected || showAdd)} onClose={closePanel} title={selected ? selected.addr : 'New Listing'} width={620}>
        <Tabs tabs={[
          { id: 'info', label: 'Property Info' },
          { id: 'details', label: 'Details' },
          { id: 'notes', label: 'Notes' },
        ]} active={tab} onChange={setTab} />

        {tab === 'info' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Address" required>
                <Input value={form.addr} onChange={v => set('addr', v)} placeholder="123 Main St" />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={v => set('city', v)} placeholder="Monsey" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={v => set('status', v)} options={LISTING_STATUSES} />
              </Field>
              <Field label="List Price">
                <Input value={form.list_price} onChange={v => set('list_price', v)} placeholder="500000" type="number" />
              </Field>
              <Field label="Property Type">
                <Select value={form.property_type} onChange={v => set('property_type', v)} options={LISTING_PROPERTY_TYPES} placeholder="Type" />
              </Field>
              <Field label="Deal Type">
                <Select value={form.deal_type} onChange={v => set('deal_type', v)} options={LISTING_DEAL_TYPES} />
              </Field>
              <Field label="Seller Name">
                <Input value={form.seller_name} onChange={v => set('seller_name', v)} placeholder="John Smith" />
              </Field>
              <Field label="List Date">
                <Input value={form.list_date} onChange={v => set('list_date', v)} type="date" />
              </Field>
            </div>
            {(isAdmin || canManage) && (
              <Field label="Agent">
                <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
              </Field>
            )}
          </div>
        )}

        {tab === 'details' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Bedrooms">
                <Input value={form.beds} onChange={v => set('beds', v)} placeholder="4" />
              </Field>
              <Field label="Bathrooms">
                <Input value={form.baths} onChange={v => set('baths', v)} placeholder="2" />
              </Field>
              <Field label="Sqft">
                <Input value={form.sqft} onChange={v => set('sqft', v)} placeholder="2000" />
              </Field>
              <Field label="Tax">
                <Input value={form.tax} onChange={v => set('tax', v)} placeholder="Annual tax" />
              </Field>
              <Field label="Buyers Agent %">
                <Input value={form.buyers_agent_pct} onChange={v => set('buyers_agent_pct', v)} placeholder="2.5%" />
              </Field>
              <Field label="Ad Budget">
                <Input value={form.ad_budget} onChange={v => set('ad_budget', v)} placeholder="2000" type="number" />
              </Field>
              <Field label="Door Lock Code">
                <Input value={form.door_lock} onChange={v => set('door_lock', v)} placeholder="Lock code" />
              </Field>
              <Field label="MLS Link">
                <Input value={form.mls_link} onChange={v => set('mls_link', v)} placeholder="https://..." />
              </Field>
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <Field label="Notes">
            <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Listing notes..." rows={8} />
          </Field>
        )}

        <ModalActions>
          {selected && (
            <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>
          )}
          {selected?.mls_link && (
            <Btn variant="secondary" onClick={() => window.open(selected.mls_link, '_blank')}>🔗 MLS</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveListing} loading={saving}>{selected ? 'Save Changes' : 'Add Listing'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm
        open={confirmDelete}
        message={`Delete ${selected?.addr}? This cannot be undone.`}
        onConfirm={deleteListing}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
