// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automations Page
// Rule-based automations: when X happens → do Y.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAutomations } from '../lib/hooks'
import { fmtDate } from '../lib/utils'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  ModalActions, Loading, Empty, Confirm, Toggle, SectionTitle
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const TRIGGER_TYPES = [
  { value: 'new_contact',       label: '👤 New contact added' },
  { value: 'deal_stage_change', label: '📊 Deal stage changes' },
  { value: 'task_overdue',      label: '⚠️ Task becomes overdue' },
  { value: 'listing_status',    label: '🏡 Listing status changes' },
  { value: 'closing_soon',      label: '📅 Closing within X days' },
  { value: 'no_activity',       label: '💤 No activity on contact for X days' },
]

const ACTION_TYPES = [
  { value: 'create_task',     label: '✅ Create a task' },
  { value: 'send_email',      label: '📧 Send an email' },
  { value: 'notify_agent',    label: '🔔 Notify agent' },
  { value: 'update_status',   label: '🔄 Update status' },
]

const BLANK = { name: '', description: '', trigger_type: '', action_nodes: [], active: false }

const PRESET_AUTOMATIONS = [
  {
    name: 'New Lead Follow-Up',
    description: 'When a new contact is added, create a follow-up task for the assigned agent within 24 hours.',
    trigger_type: 'new_contact',
    active: false,
    icon: '👤',
  },
  {
    name: 'Closing Reminder',
    description: 'When a deal has a closing date within 7 days, notify the agent and create a checklist task.',
    trigger_type: 'closing_soon',
    active: false,
    icon: '📅',
  },
  {
    name: 'Overdue Task Alert',
    description: 'When a task becomes overdue, send a notification to the assigned agent and their manager.',
    trigger_type: 'task_overdue',
    active: false,
    icon: '⚠️',
  },
  {
    name: 'Deal Won Notification',
    description: 'When a deal moves to Closed stage, notify the whole team with the GCI amount.',
    trigger_type: 'deal_stage_change',
    active: false,
    icon: '🎉',
  },
  {
    name: 'Cold Lead Re-engagement',
    description: 'When a contact has no activity for 30 days, create a task to follow up.',
    trigger_type: 'no_activity',
    active: false,
    icon: '💤',
  },
]

export function Automations() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const { automations, loading, add, update, remove } = useAutomations()

  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveAutomation() {
    if (!form.name.trim()) { toast('Name required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Automation saved')
      } else {
        await add({ ...form, created_by: agent?.id })
        toast('✅ Automation created')
        setSelected(null)
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function toggleActive(automation) {
    try {
      await update(automation.id, { active: !automation.active })
      toast(automation.active ? 'Automation paused' : '✅ Automation activated')
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    }
  }

  async function addPreset(preset) {
    try {
      await add({ ...preset, created_by: agent?.id })
      toast('✅ Automation added — configure and activate it')
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    }
  }

  async function deleteAutomation() {
    try {
      await remove(selected.id)
      toast('Deleted')
      setSelected(null)
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const active   = automations.filter(a => a.active).length
  const inactive = automations.filter(a => !a.active).length

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Automations"
        sub={`${active} active · ${inactive} inactive`}
        actions={isAdmin && <Btn onClick={() => { setSelected(null); setForm(BLANK) }}>+ New Automation</Btn>}
      />

      {loading && <Loading />}

      {/* Your Automations */}
      {automations.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <SectionTitle>Your Automations</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {automations.map(a => (
              <div key={a.id} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: `1px solid ${a.active ? '#10B98133' : 'var(--border)'}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.active ? '#10B981' : '#94A3B8', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{a.name}</div>
                  {a.description && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{a.description}</div>}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {a.trigger_type && <Pill label={TRIGGER_TYPES.find(t => t.value === a.trigger_type)?.label || a.trigger_type} color="#3B82F6" />}
                    <Pill label={a.active ? 'Active' : 'Inactive'} color={a.active ? '#10B981' : '#94A3B8'} />
                    {a.fire_count > 0 && <Pill label={`Fired ${a.fire_count}×`} color="#F5A623" />}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <Toggle value={a.active} onChange={() => toggleActive(a)} />
                    <Btn size="sm" variant="secondary" onClick={() => { setSelected(a); setForm({ ...BLANK, ...a }) }}>Edit</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preset Templates */}
      {isAdmin && (
        <div>
          <SectionTitle>Automation Templates</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {PRESET_AUTOMATIONS.map((preset, i) => (
              <div key={i} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '24px' }}>{preset.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{preset.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', flex: 1, lineHeight: 1.5 }}>{preset.description}</div>
                <Btn size="sm" variant="secondary" onClick={() => addPreset(preset)}>+ Add This</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isAdmin && automations.length === 0 && (
        <Empty icon="⚡" title="No automations yet" sub="Ask your admin to set up automations for the team." />
      )}

      {/* Edit Modal */}
      <Modal open={!!selected || (form.name !== '' && !selected)} onClose={() => { setSelected(null); setForm(BLANK) }} title={selected ? 'Edit Automation' : 'New Automation'} width={520}>
        <Field label="Automation Name" required>
          <Input value={form.name} onChange={v => set('name', v)} placeholder="e.g. New Lead Follow-Up" />
        </Field>
        <Field label="Trigger">
          <Select value={form.trigger_type} onChange={v => set('trigger_type', v)} options={TRIGGER_TYPES} placeholder="When this happens..." />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={v => set('description', v)} placeholder="Describe what this automation does..." rows={3} />
        </Field>
        <Field label="">
          <Toggle value={form.active} onChange={v => set('active', v)} label="Active — runs automatically" />
        </Field>
        <div style={{ background: 'var(--dim)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
          💡 Full automation actions (send email, create task, notify agent) will be wired up in the next build phase when background job processing is set up.
        </div>
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={() => { setSelected(null); setForm(BLANK) }}>Cancel</Btn>
          <Btn onClick={saveAutomation} loading={saving}>{selected ? 'Save' : 'Create'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this automation?" onConfirm={deleteAutomation} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
