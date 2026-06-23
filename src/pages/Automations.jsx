// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automations Page
// Full visual rule builder. Trigger → Conditions → Actions.
// ZERO imports from automationEngine or automationDispatcher.
// All data defined locally to prevent any import chain issues.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmtDateTime, fmtDate } from '../lib/utils'
import { Btn, Loading, Empty, Confirm, Pill, Avatar } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── ALL DATA DEFINED LOCALLY — NO EXTERNAL IMPORTS ───────────────
const TRIGGER_LIST = [
  { id: 'new_contact',          label: 'New contact added',            icon: '👤', category: 'Contacts' },
  { id: 'contact_status_change',label: 'Contact status changes',       icon: '🔄', category: 'Contacts' },
  { id: 'no_activity',          label: 'No contact activity for X days',icon: '💤', category: 'Contacts' },
  { id: 'deal_stage_change',    label: 'Deal stage changes',           icon: '📊', category: 'Deals'    },
  { id: 'deal_created',         label: 'New deal added',               icon: '✨', category: 'Deals'    },
  { id: 'closing_soon',         label: 'Deal closing within X days',   icon: '📅', category: 'Deals'    },
  { id: 'offer_accepted',       label: 'Offer accepted (AO)',          icon: '🤝', category: 'Deals'    },
  { id: 'deal_closed',          label: 'Deal closes',                  icon: '🏁', category: 'Deals'    },
  { id: 'task_overdue',         label: 'Task becomes overdue',         icon: '⚠️', category: 'Tasks'    },
  { id: 'task_completed',       label: 'Task is completed',            icon: '✅', category: 'Tasks'    },
  { id: 'listing_status_change',label: 'Listing status changes',       icon: '🏡', category: 'Listings' },
  { id: 'open_house_created',   label: 'Open house scheduled',         icon: '🚪', category: 'Listings' },
]

const ACTION_LIST = [
  { id: 'create_task',           label: 'Create a task',               icon: '✅' },
  { id: 'send_notification',     label: 'Send in-app notification',    icon: '🔔' },
  { id: 'update_contact_status', label: 'Update contact status',       icon: '🔄' },
  { id: 'update_deal_stage',     label: 'Update deal stage',           icon: '📊' },
  { id: 'assign_agent',          label: 'Assign to agent',             icon: '👤' },
  { id: 'send_email',            label: 'Send email notification',     icon: '📧' },
  { id: 'add_tag',               label: 'Add tag to contact',          icon: '🏷' },
]

const BLANK = {
  name:           '',
  description:    '',
  active:         false,
  trigger_type:   '',
  trigger_config: {},
  conditions:     [],
  action_nodes:   [],
}

// ── SIMPLE INLINE STYLE COMPONENTS ───────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', ...style }}>
      {children}
    </div>
  )
}

function Label({ children }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, boxSizing: 'border-box', outline: 'none' }}
    />
  )
}

function TextareaInput({ value, onChange, placeholder, rows = 2 }) {
  return (
    <textarea
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }}
    />
  )
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none' }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
          {typeof o === 'string' ? o : o.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{ width: 36, height: 20, borderRadius: '99px', background: value ? '#10B981' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </div>
  )
}

// ── STEP HEADER ───────────────────────────────────────────────────
function StepHeader({ number, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>
        {number}
      </div>
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{label}</span>
    </div>
  )
}

// ── TRIGGER STEP ──────────────────────────────────────────────────
function TriggerStep({ form, onChange }) {
  const trigger = TRIGGER_LIST.find(t => t.id === form.trigger_type)
  const needsDays = ['no_activity', 'closing_soon'].includes(form.trigger_type)

  return (
    <div style={{ marginBottom: '24px' }}>
      <StepHeader number="1" label="When this happens... (Trigger)" color="#CC2200" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {TRIGGER_LIST.map(t => (
          <div
            key={t.id}
            onClick={() => onChange({ ...form, trigger_type: t.id, trigger_config: {} })}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              border: `2px solid ${form.trigger_type === t.id ? '#CC2200' : 'var(--border)'}`,
              background: form.trigger_type === t.id ? 'rgba(204,34,0,.06)' : 'var(--dim)',
              cursor: 'pointer',
              transition: 'all .12s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
              <span style={{ fontSize: '14px' }}>{t.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: form.trigger_type === t.id ? '#CC2200' : 'var(--text)' }}>{t.label}</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', paddingLeft: '21px' }}>{t.category}</div>
          </div>
        ))}
      </div>
      {needsDays && (
        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--dim)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <Label>Number of Days</Label>
          <TextInput
            type="number"
            value={form.trigger_config?.days ?? (form.trigger_type === 'no_activity' ? 14 : 7)}
            onChange={v => onChange({ ...form, trigger_config: { ...form.trigger_config, days: v } })}
            placeholder={form.trigger_type === 'no_activity' ? '14' : '7'}
          />
        </div>
      )}
    </div>
  )
}

// ── CONDITIONS STEP ───────────────────────────────────────────────
function ConditionsStep({ form, onChange }) {
  const conditions = form.conditions || []

  function addCondition() {
    const newCond = { id: Date.now(), field: 'status', operator: 'equals', value: '' }
    onChange({ ...form, conditions: [...conditions, newCond] })
  }

  function updateCond(idx, updates) {
    const next = conditions.map((c, i) => i === idx ? { ...c, ...updates } : c)
    onChange({ ...form, conditions: next })
  }

  function removeCond(idx) {
    onChange({ ...form, conditions: conditions.filter((_, i) => i !== idx) })
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <StepHeader number="2" label="Only if... (Conditions — optional)" color="#3B82F6" />
      {conditions.map((cond, idx) => (
        <div key={cond.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '8px', background: 'var(--dim)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <Label>Field</Label>
              <SelectInput
                value={cond.field}
                onChange={v => updateCond(idx, { field: v })}
                options={[
                  { value: 'status',      label: 'Contact Status' },
                  { value: 'source',      label: 'Contact Source' },
                  { value: 'stage',       label: 'Deal Stage' },
                  { value: 'side',        label: 'Deal Side' },
                  { value: 'pre_approved',label: 'Pre-Approved' },
                ]}
                placeholder="Select field..."
              />
            </div>
            <div>
              <Label>Operator</Label>
              <SelectInput
                value={cond.operator}
                onChange={v => updateCond(idx, { operator: v })}
                options={[
                  { value: 'equals',       label: 'Equals' },
                  { value: 'not_equals',   label: 'Not equals' },
                  { value: 'is_empty',     label: 'Is empty' },
                  { value: 'is_not_empty', label: 'Is not empty' },
                ]}
              />
            </div>
            <div>
              <Label>Value</Label>
              <TextInput
                value={cond.value}
                onChange={v => updateCond(idx, { value: v })}
                placeholder="Value..."
              />
            </div>
          </div>
          <button
            onClick={() => removeCond(idx)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '16px', padding: '4px', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={addCondition}
        style={{ padding: '7px 14px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}
      >
        + Add Condition
      </button>
    </div>
  )
}

// ── ACTIONS STEP ──────────────────────────────────────────────────
function ActionsStep({ form, onChange, agents }) {
  const nodes = form.action_nodes || []

  function addAction(type) {
    const newAction = { id: Date.now(), type, config: { assign_to: 'trigger_agent', priority: 'normal', due_days: 1, notify: 'trigger_agent', to: 'trigger_agent' } }
    onChange({ ...form, action_nodes: [...nodes, newAction] })
  }

  function updateAction(idx, key, val) {
    const next = nodes.map((n, i) => i === idx ? { ...n, config: { ...n.config, [key]: val } } : n)
    onChange({ ...form, action_nodes: next })
  }

  function removeAction(idx) {
    onChange({ ...form, action_nodes: nodes.filter((_, i) => i !== idx) })
  }

  const agentOptions = [
    { value: 'trigger_agent', label: '👤 Assigned Agent' },
    ...agents.map(a => ({ value: a.id, label: a.name })),
  ]

  return (
    <div>
      <StepHeader number="3" label="Then do this... (Actions)" color="#10B981" />

      {nodes.map((action, idx) => {
        const def = ACTION_LIST.find(a => a.id === action.type)
        if (!def) return null
        const cfg = action.config || {}

        return (
          <div key={action.id} style={{ background: 'var(--dim)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>{def.icon}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{def.label}</span>
              </div>
              <button onClick={() => removeAction(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '16px' }}>✕</button>
            </div>

            {/* Action-specific fields */}
            {action.type === 'create_task' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div><Label>Task Title</Label><TextInput value={cfg.title} onChange={v => updateAction(idx, 'title', v)} placeholder="Follow up with {{contact_name}}" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <Label>Priority</Label>
                    <SelectInput value={cfg.priority} onChange={v => updateAction(idx, 'priority', v)} options={[{ value:'urgent',label:'Urgent' },{ value:'high',label:'High' },{ value:'normal',label:'Normal' },{ value:'low',label:'Low' }]} />
                  </div>
                  <div>
                    <Label>Due in (days)</Label>
                    <TextInput type="number" value={cfg.due_days} onChange={v => updateAction(idx, 'due_days', v)} placeholder="1" />
                  </div>
                </div>
                <div><Label>Assign To</Label><SelectInput value={cfg.assign_to} onChange={v => updateAction(idx, 'assign_to', v)} options={agentOptions} /></div>
                <div><Label>Notes (optional)</Label><TextareaInput value={cfg.notes} onChange={v => updateAction(idx, 'notes', v)} placeholder="Task notes..." /></div>
              </div>
            )}

            {action.type === 'send_notification' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div><Label>Notify</Label><SelectInput value={cfg.notify} onChange={v => updateAction(idx, 'notify', v)} options={agentOptions} /></div>
                <div><Label>Title</Label><TextInput value={cfg.title} onChange={v => updateAction(idx, 'title', v)} placeholder="New lead assigned" /></div>
                <div><Label>Message</Label><TextareaInput value={cfg.body} onChange={v => updateAction(idx, 'body', v)} placeholder="{{contact_name}} needs follow up" /></div>
              </div>
            )}

            {action.type === 'update_contact_status' && (
              <div>
                <Label>Set Status To</Label>
                <SelectInput value={cfg.status} onChange={v => updateAction(idx, 'status', v)} options={['Hot','Warm','Cold','Active','Nurturing','Closed','Unresponsive']} placeholder="Select status..." />
              </div>
            )}

            {action.type === 'update_deal_stage' && (
              <div>
                <Label>Set Stage To</Label>
                <SelectInput value={cfg.stage} onChange={v => updateAction(idx, 'stage', v)} options={['Negotiations','Offer Accapted','Under Shtar','Under Contract','Closed','Deal Fell Through']} placeholder="Select stage..." />
              </div>
            )}

            {action.type === 'assign_agent' && (
              <div>
                <Label>Assign To Agent</Label>
                <SelectInput value={cfg.agent_id} onChange={v => updateAction(idx, 'agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Select agent..." />
              </div>
            )}

            {action.type === 'send_email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div><Label>Send To</Label><SelectInput value={cfg.to} onChange={v => updateAction(idx, 'to', v)} options={agentOptions} /></div>
                <div><Label>Subject</Label><TextInput value={cfg.subject} onChange={v => updateAction(idx, 'subject', v)} placeholder="Follow up needed" /></div>
                <div><Label>Message</Label><TextareaInput value={cfg.body} onChange={v => updateAction(idx, 'body', v)} placeholder="This is an automated reminder..." /></div>
              </div>
            )}

            {action.type === 'add_tag' && (
              <div>
                <Label>Tag</Label>
                <TextInput value={cfg.tag} onChange={v => updateAction(idx, 'tag', v)} placeholder="hot-lead" />
              </div>
            )}
          </div>
        )
      })}

      {/* Add action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '8px' }}>
        {ACTION_LIST.map(a => (
          <button
            key={a.id}
            onClick={() => addAction(a.id)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: ff, fontSize: '12px', color: 'var(--text)', fontWeight: 500 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--panel)'}
          >
            <span>{a.icon}</span> {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── AUTOMATION CARD ───────────────────────────────────────────────
function AutomationCard({ automation, onEdit, onToggle, onDelete, onViewRuns }) {
  const trigger = TRIGGER_LIST.find(t => t.id === automation.trigger_type)
  const actionCount = (automation.action_nodes || []).length
  const isActive = automation.active === true

  return (
    <div style={{ background: 'var(--panel)', borderRadius: '12px', border: `1px solid ${isActive ? '#10B98133' : 'var(--border)'}`, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: isActive ? '#10B98118' : 'var(--dim)', border: `1px solid ${isActive ? '#10B98144' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
          {trigger?.icon || '⚡'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{automation.name}</div>
          {automation.description && <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{automation.description}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <Toggle value={isActive} onChange={() => onToggle(automation)} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? '#10B981' : '#94A3B8' }}>{isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {trigger && (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>
            {trigger.icon} {trigger.label}
          </span>
        )}
        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>→</span>
        <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#F0FDF4', color: '#166534', fontWeight: 600 }}>
          {actionCount} action{actionCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{automation.fire_count || 0}</span> runs
          {automation.last_fired && <span style={{ marginLeft: '10px' }}>Last: {fmtDate(automation.last_fired)}</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onViewRuns(automation)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', fontFamily: ff }}>📋 History</button>
          <button onClick={() => onEdit(automation)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: 'var(--text)', fontFamily: ff }}>✏️ Edit</button>
          <button onClick={() => onDelete(automation)} style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: '#DC2626', fontFamily: ff }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── RUN HISTORY ───────────────────────────────────────────────────
function RunHistory({ automation, onClose }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!automation?.id) return
    supabase
      .from('automation_runs')
      .select('*')
      .eq('automation_id', automation.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setRuns(data || []); setLoading(false) })
      .catch(() => { setRuns([]); setLoading(false) })
  }, [automation?.id])

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>📋 Run History — {automation.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          {loading && <Loading />}
          {!loading && runs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '13px' }}>
              No runs yet — activate this automation to start tracking.
            </div>
          )}
          {runs.map(run => (
            <div key={run.id} style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${run.status === 'error' ? '#FECACA' : 'var(--border)'}`, background: run.status === 'error' ? '#FEF2F2' : 'var(--dim)', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{run.status === 'error' ? '❌' : '✅'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: run.status === 'error' ? '#DC2626' : '#10B981' }}>{run.status === 'error' ? 'Failed' : 'Success'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{run.records_affected || 0} actions</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDateTime(run.created_at)}</span>
              </div>
              {run.error && <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'monospace', marginTop: '4px' }}>{run.error}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN AUTOMATIONS PAGE
// ════════════════════════════════════════════════════════════════
export function Automations() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()

  const [automations, setAutomations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [agents,      setAgents]      = useState([])
  const [selected,    setSelected]    = useState(null)
  const [form,        setForm]        = useState({ ...BLANK })
  const [showBuilder, setShowBuilder] = useState(false)
  const [viewRuns,    setViewRuns]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)

  useEffect(() => {
    loadAutomations()
    supabase.from('agents').select('id, name, color').eq('active', true).order('name')
      .then(({ data }) => setAgents(data || []))
      .catch(() => setAgents([]))
  }, [])

  async function loadAutomations() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('automations')
        .select('id, name, description, active, trigger_type, action_nodes, conditions, fire_count, last_fired, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      setAutomations((data || []).filter(Boolean))
    } catch(e) {
      toast('Could not load automations: ' + e.message, '#DC2626')
      setAutomations([])
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setSelected(null)
    setForm({ ...BLANK })
    setShowBuilder(true)
  }

  function openEdit(automation) {
    setSelected(automation)
    setForm({
      name:           automation.name           || '',
      description:    automation.description    || '',
      active:         automation.active         === true,
      trigger_type:   automation.trigger_type   || '',
      trigger_config: automation.trigger_config || {},
      conditions:     automation.conditions     || [],
      action_nodes:   automation.action_nodes   || [],
    })
    setShowBuilder(true)
  }

  function closeBuilder() {
    setShowBuilder(false)
    setSelected(null)
    setForm({ ...BLANK })
  }

  async function save() {
    if (!form.name.trim())            { toast('Give this automation a name', '#DC2626'); return }
    if (!form.trigger_type)           { toast('Select a trigger', '#DC2626'); return }
    if (!form.action_nodes?.length)   { toast('Add at least one action', '#DC2626'); return }
    setSaving(true)
    try {
      const payload = {
        name:           form.name.trim(),
        description:    form.description || '',
        active:         form.active === true,
        trigger_type:   form.trigger_type,
        trigger_config: form.trigger_config || {},
        conditions:     form.conditions     || [],
        action_nodes:   form.action_nodes   || [],
        updated_at:     new Date().toISOString(),
      }
      if (selected) {
        const { data, error } = await supabase.from('automations').update(payload).eq('id', selected.id).select().single()
        if (error) throw error
        setAutomations(prev => prev.map(a => a.id === selected.id ? data : a))
        toast('✅ Automation saved')
      } else {
        const { data, error } = await supabase.from('automations').insert({ ...payload, created_by: agent?.id, created_at: new Date().toISOString() }).select().single()
        if (error) throw error
        setAutomations(prev => [data, ...prev])
        toast('✅ Automation created')
      }
      closeBuilder()
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(automation) {
    const nowActive = automation.active === true
    try {
      const { data, error } = await supabase.from('automations').update({ active: !nowActive, updated_at: new Date().toISOString() }).eq('id', automation.id).select().single()
      if (error) throw error
      setAutomations(prev => prev.map(a => a.id === automation.id ? data : a))
      toast(!nowActive ? '✅ Automation activated' : 'Automation paused')
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    }
  }

  async function deleteAutomation() {
    if (!confirmDel) return
    try {
      const { error } = await supabase.from('automations').delete().eq('id', confirmDel.id)
      if (error) throw error
      setAutomations(prev => prev.filter(a => a.id !== confirmDel.id))
      toast('Automation deleted')
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally {
      setConfirmDel(null)
    }
  }

  const activeCount = automations.filter(a => a.active === true).length
  const totalRuns   = automations.reduce((s, a) => s + (a.fire_count || 0), 0)

  return (
    <div style={{ fontFamily: ff }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>Automations</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>
            {activeCount} active · {totalRuns} total runs
          </div>
        </div>
        {isAdmin && (
          <Btn onClick={openNew}>+ New Automation</Btn>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total',    value: automations.length,              color: '#3B82F6' },
          { label: 'Active',   value: activeCount,                     color: '#10B981' },
          { label: 'Inactive', value: automations.length - activeCount,color: '#94A3B8' },
          { label: 'Runs',     value: totalRuns,                       color: '#F5A623' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px 16px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading && <Loading />}

      {!loading && automations.length === 0 && (
        <Empty
          icon="⚡"
          title="No automations yet"
          sub={isAdmin ? 'Create your first automation to start automating your workflow.' : 'Ask your admin to set up automations for the team.'}
          action={isAdmin && <Btn onClick={openNew}>+ Create Automation</Btn>}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {automations.map(a => (
          <AutomationCard
            key={a.id}
            automation={a}
            onEdit={openEdit}
            onToggle={toggleActive}
            onDelete={setConfirmDel}
            onViewRuns={setViewRuns}
          />
        ))}
      </div>

      {/* ── BUILDER MODAL ── */}
      {showBuilder && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeBuilder() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: ff }}
        >
          <div style={{ background: 'var(--panel)', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>

            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Automation name..."
                  style={{ fontSize: '18px', fontWeight: 700, background: 'none', border: 'none', color: 'var(--text)', fontFamily: ff, outline: 'none', width: '100%' }}
                />
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description (optional)"
                  style={{ fontSize: '12px', background: 'none', border: 'none', color: 'var(--muted)', fontFamily: ff, outline: 'none', width: '100%', marginTop: '2px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <Toggle value={form.active === true} onChange={v => setForm(f => ({ ...f, active: v }))} />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{form.active ? 'Active' : 'Inactive'}</span>
                <button onClick={closeBuilder} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <TriggerStep form={form} onChange={setForm} />
              <ConditionsStep form={form} onChange={setForm} />
              <ActionsStep form={form} onChange={setForm} agents={agents} />
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <Btn variant="secondary" onClick={closeBuilder}>Cancel</Btn>
              <Btn onClick={save} loading={saving}>
                {selected ? 'Save Changes' : 'Create Automation'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Run history modal */}
      {viewRuns && <RunHistory automation={viewRuns} onClose={() => setViewRuns(null)} />}

      {/* Delete confirm */}
      <Confirm
        open={!!confirmDel}
        message={`Delete "${confirmDel?.name}"? This cannot be undone.`}
        onConfirm={deleteAutomation}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
