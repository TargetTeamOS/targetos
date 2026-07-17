// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Listing Prep Page
// Pre-listing checklist tracker. Each listing gets its own
// prep checklist with checkable items.
// ═══════════════════════════════════════════════════════════════

import { AddressAutocomplete } from '../components/AddressAutocomplete'
import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useListingPrep, useListings, useAgents } from '../lib/hooks'
import { fmtDate } from '../lib/utils'
import { DEFAULT_PREP_CHECKLIST } from '../lib/constants'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  ModalActions, Loading, Empty, Confirm, ProgressBar, SectionTitle
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = { listing_addr: '', status: 'Active', checklist: DEFAULT_PREP_CHECKLIST, notes: '' }

export function ListingPrep() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { preps, loading, add, update, remove } = useListingPrep(filters)
  const { listings } = useListings()
  const { agents } = useAgents()

  const [selected,setSelected] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && preps.length > 0 && urlId !== 'new') {
      const p = preps.find(x => x.id === urlId)
      if (p) openPrep(p)
    }
    if (urlId === 'new') { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); }
  }, [urlId, preps.length])

  function openPrep(p) {
    navigate('/listingprep/' + p.id, { replace: true })
    setSelected(p)
    setForm({ ...BLANK, ...p, checklist: p.checklist?.length ? p.checklist : DEFAULT_PREP_CHECKLIST.map(i => ({...i})) })
  }

  function closePanel() {
    setSelected(null)
    navigate('/listingprep', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleItem(id) {
    setForm(f => ({
      ...f,
      checklist: f.checklist.map(item => item.id === id ? { ...item, done: !item.done } : item)
    }))
  }

  async function savePrep() {
    if (!form.listing_addr.trim()) { toast('Address required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form, agent?.id)
        setSelected(updated)
        toast('✅ Prep saved')
      } else {
        const created = await add({ ...form, agent_id: form.agent_id || agent?.id })
        toast('✅ Prep created')
        navigate('/listingprep/' + created.id)
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  // ── SIGNED → GO LIVE (July 2026) ────────────────────────────────
  // One click promotes a signed prep into a real row on the Listings
  // board (visible to the whole team) and links the two, so the prep
  // shows where it went and can't be promoted twice.
  const [goingLive, setGoingLive] = useState(false)
  async function goLive() {
    if (!selected) return
    if (selected.listing_id) { toast('Already live on the Listings board', '#F5A623'); return }
    if (!form.listing_addr?.trim()) { toast('Address required first', '#DC2626'); return }
    setGoingLive(true)
    try {
      const { data: newListing, error } = await supabase.from('listings').insert({
        addr:       form.listing_addr,
        agent_id:   form.agent_id || agent?.id || null,
        status:     'Active',
        source:     'Listing Prep',
        created_at: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      // Link back (column may not exist pre-migration — non-fatal)
      await supabase.from('listing_prep').update({ listing_id: newListing.id }).eq('id', selected.id).then(()=>{}).catch(()=>{})
      setSelected(p => ({ ...p, listing_id: newListing.id }))
      toast('🎉 Listing is LIVE — now on the Listings board for the whole team')
    } catch(e) { toast('Go live failed: ' + e.message, '#DC2626') }
    finally { setGoingLive(false) }
  }

  async function deletePrep() {
    try {
      await remove(selected.id)
      toast('Deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const checklist = form.checklist || []
  const done      = checklist.filter(i => i.done).length
  const pct       = checklist.length > 0 ? Math.round((done / checklist.length) * 100) : 0

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Listing Prep"
        sub={(preps.length) + " listings in prep"}
        actions={<Btn onClick={() => { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); navigate('/listingprep/new') }}>+ New Prep</Btn>}
      />

      {loading && <Loading />}
      {!loading && preps.length === 0 && (
        <Empty icon="🔧" title="No listing preps" sub="Create a prep checklist for your next listing." action={<Btn onClick={() => navigate('/listingprep/new')}>+ New Prep</Btn>} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {preps.map(p => {
          const cl   = p.checklist || DEFAULT_PREP_CHECKLIST
          const done = cl.filter(i => i.done).length
          const pct  = cl.length > 0 ? Math.round((done / cl.length) * 100) : 0
          return (
            <div key={p.id} onClick={() => openPrep(p)}
              style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: selected?.id === p.id ? '2px solid var(--brand)' : '1px solid var(--border)', padding: '16px', cursor: 'pointer', transition: 'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '12px' }}>{p.listing_addr}</div>
              <ProgressBar value={done} max={cl.length} label={done + '/' + cl.length + ' done'} color="#10B981" />
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>{pct}% complete</div>
            </div>
          )
        })}
      </div>

      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected?.listing_addr || 'New Listing Prep'} width={500}>
        <Field label="Listing Address" required>
          <AddressAutocomplete value={form.listing_addr||''} onChange={v => set('listing_addr', v)} onSelect={s => set('listing_addr', s.full || s.street)} placeholder="123 Main St, Monsey NY" />
        </Field>

        {(isAdmin || canManage) && (
          <Field label="Agent">
            <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
          </Field>
        )}

        <SectionTitle>Checklist</SectionTitle>
        <ProgressBar value={done} max={checklist.length} color="#10B981" style={{ marginBottom: '14px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {checklist.map(item => (
            <label key={item.id}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: item.done ? 'rgba(16,185,129,.08)' : 'var(--dim)', borderRadius: '8px', cursor: 'pointer', border: "1px solid " + (item.done ? '#BBF7D0' : 'var(--border)') }}>
              <input type="checkbox" checked={item.done} onChange={() => toggleItem(item.id)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#10B981' }} />
              <span style={{ fontSize: '13px', color: item.done ? '#059669' : 'var(--text)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
            </label>
          ))}
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Prep notes..." rows={3} />
        </Field>

        {selected?.id && <RecordActivityFeed table="listing_prep" recordId={selected.id} compact />}

        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
                    <button onClick={goLive} disabled={goingLive || !!selected?.listing_id}
            style={{ padding:'9px 14px', borderRadius:8, border:'none', background: selected?.listing_id ? 'var(--dim)' : '#10B981', color: selected?.listing_id ? 'var(--muted)' : '#fff', fontSize:12, fontWeight:800, cursor: selected?.listing_id ? 'default' : 'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
            {selected?.listing_id ? '✓ Live on Listings board' : goingLive ? '⏳ Going live…' : '✍️ Signed — Go Live'}
          </button>
<Btn onClick={savePrep} loading={saving}>{selected ? 'Save' : 'Create Prep'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this listing prep?" onConfirm={deletePrep} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
