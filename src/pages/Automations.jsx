// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automations Page (Full Build)
// Full visual automation rule builder.
// Trigger → Conditions → Actions
// Execution history, per-run logs, live toggle.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmtDateTime, fmtDate } from '../lib/utils'
import { TRIGGERS, CONDITIONS, ACTIONS } from '../lib/automationConstants'
import { DEAL_STAGES, CONTACT_STATUSES, CONTACT_SOURCES, DEAL_SIDES, LISTING_STATUSES, TASK_PRIORITIES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea,
  Pill, Avatar, Loading, Empty, Confirm, Toggle, Tabs, SectionTitle
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── BLANK AUTOMATION ─────────────────────────────────────────────
const BLANK = {
  name:         '',
  description:  '',
  active:       false,
  trigger_type: '',
  trigger_config: {},
  conditions:   [],
  action_nodes: [],
}

// ── OPTION MAPS ──────────────────────────────────────────────────
const STATUS_OPTIONS    = CONTACT_STATUSES.map(s => ({ value: s.value, label: s.label }))
const STAGE_OPTIONS     = DEAL_STAGES.map(s => ({ value: s.value, label: s.label }))
const PRIORITY_OPTIONS  = TASK_PRIORITIES.map(p => ({ value: p.value, label: p.label }))
const LISTING_OPTIONS   = LISTING_STATUSES.map(s => ({ value: s.value, label: s.label }))
const SIDE_OPTIONS      = DEAL_SIDES.map(s => ({ value: s, label: s }))

// ── CATEGORIES ───────────────────────────────────────────────────
const CATEGORIES = ['All', 'Contacts', 'Deals', 'Tasks', 'Listings']

// ── FIELD RENDERER ────────────────────────────────────────────────
function ConfigField({ fieldDef, value, onChange, agents }) {
  const { type, label, placeholder, default: def, required } = fieldDef

  function val() { return value ?? def ?? '' }

  if (type === 'text') return (
    <Field label={label}>
      <Input value={val()} onChange={onChange} placeholder={placeholder || label} />
    </Field>
  )

  if (type === 'textarea') return (
    <Field label={label}>
      <Textarea value={val()} onChange={onChange} placeholder={placeholder || label} rows={2} />
    </Field>
  )

  if (type === 'number') return (
    <Field label={label}>
      <Input value={val()} onChange={onChange} type="number" placeholder={placeholder || '1'} />
    </Field>
  )

  if (type === 'status_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={STATUS_OPTIONS} placeholder="Any status" />
    </Field>
  )

  if (type === 'stage_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={STAGE_OPTIONS} placeholder="Any stage" />
    </Field>
  )

  if (type === 'listing_status_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={LISTING_OPTIONS} placeholder="Any status" />
    </Field>
  )

  if (type === 'priority_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={PRIORITY_OPTIONS} />
    </Field>
  )

  if (type === 'side_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={SIDE_OPTIONS} placeholder="Any side" />
    </Field>
  )

  if (type === 'agent_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Select agent" />
    </Field>
  )

  if (type === 'agent_or_trigger') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={[
        { value: 'trigger_agent', label: '👤 Assigned Agent (from trigger)' },
        { value: 'all_admins',    label: '👑 All Admins' },
        ...agents.map(a => ({ value: a.id, label: a.name })),
      ]} />
    </Field>
  )

  if (type === 'boolean') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]} />
    </Field>
  )

  if (type === 'source_select') return (
    <Field label={label}>
      <Select value={val()} onChange={onChange} options={CONTACT_SOURCES.map(s => ({ value: s, label: s }))} placeholder="Any source" />
    </Field>
  )

  return <Field label={label}><Input value={val()} onChange={onChange} placeholder={label} /></Field>
}

// ── AUTOMATION RULE BUILDER ───────────────────────────────────────
function RuleBuilder({ form, onChange, agents }) {
  const trigger = TRIGGERS.find(t => t.id === form.trigger_type)

  function setTrigger(type) {
    onChange({ ...form, trigger_type: type, trigger_config: {}, conditions: [], action_nodes: form.trigger_type !== type ? [] : form.action_nodes })
  }

  function setTriggerConfig(key, val) {
    onChange({ ...form, trigger_config: { ...form.trigger_config, [key]: val } })
  }

  function addCondition() {
    onChange({ ...form, conditions: [...(form.conditions || []), { id: Date.now(), field: 'contact_status', operator: 'equals', value: '' }] })
  }

  function updateCondition(idx, updates) {
    const c = [...(form.conditions || [])]
    c[idx] = { ...c[idx], ...updates }
    onChange({ ...form, conditions: c })
  }

  function removeCondition(idx) {
    const c = [...(form.conditions || [])]
    c.splice(idx, 1)
    onChange({ ...form, conditions: c })
  }

  function addAction(type) {
    const def = ACTIONS.find(a => a.id === type)
    if (!def) return
    const config = {}
    def.fields.forEach(f => { if (f.default !== undefined) config[f.key] = f.default })
    onChange({ ...form, action_nodes: [...(form.action_nodes || []), { id: Date.now(), type, config }] })
  }

  function updateAction(idx, key, val) {
    const nodes = [...(form.action_nodes || [])]
    nodes[idx] = { ...nodes[idx], config: { ...nodes[idx].config, [key]: val } }
    onChange({ ...form, action_nodes: nodes })
  }

  function removeAction(idx) {
    const nodes = [...(form.action_nodes || [])]
    nodes.splice(idx, 1)
    onChange({ ...form, action_nodes: nodes })
  }

  return (
    <div>
      {/* ── STEP 1: TRIGGER ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#CC2200', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>1</div>
          When this happens... (Trigger)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
          {TRIGGERS.map(t => (
            <div key={t.id} onClick={() => setTrigger(t.id)}
              style={{ padding: '10px 12px', borderRadius: '8px', border: `2px solid ${form.trigger_type === t.id ? '#CC2200' : 'var(--border)'}`, background: form.trigger_type === t.id ? 'rgba(204,34,0,.06)' : 'var(--dim)', cursor: 'pointer', transition: 'all .12s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <span style={{ fontSize: '14px' }}>{t.icon}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: form.trigger_type === t.id ? '#CC2200' : 'var(--text)' }}>{t.label}</span>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', paddingLeft: '21px' }}>{t.category}</div>
            </div>
          ))}
        </div>

        {/* Trigger config fields */}
        {trigger?.config?.length > 0 && (
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--dim)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Trigger Settings</div>
            {trigger.config.map(f => (
              <ConfigField key={f.key} fieldDef={f} value={form.trigger_config?.[f.key]}
                onChange={v => setTriggerConfig(f.key, v)} agents={agents} />
            ))}
          </div>
        )}
      </div>

      {/* ── STEP 2: CONDITIONS ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#3B82F6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
          Only if... (Conditions — optional)
        </div>

        {(form.conditions || []).map((cond, idx) => (
          <div key={cond.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px', background: 'var(--dim)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Field</div>
                <select value={cond.field} onChange={e => updateCondition(idx, { field: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                  <option value="">Select field...</option>
                  <optgroup label="Contact">
                    <option value="status">Status</option>
                    <option value="source">Source</option>
                    <option value="pre_approved">Pre-Approved</option>
                    <option value="buyer_type">Buyer Type</option>
                    <option value="agent_id">Assigned Agent</option>
                  </optgroup>
                  <optgroup label="Deal">
                    <option value="stage">Stage</option>
                    <option value="side">Side</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Is</div>
                <select value={cond.operator} onChange={e => updateCondition(idx, { operator: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not equals</option>
                  <option value="contains">Contains</option>
                  <option value="is_empty">Is empty</option>
                  <option value="is_not_empty">Is not empty</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Value</div>
                {['status'].includes(cond.field) ? (
                  <select value={cond.value} onChange={e => updateCondition(idx, { value: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                    <option value="">Any</option>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : ['stage'].includes(cond.field) ? (
                  <select value={cond.value} onChange={e => updateCondition(idx, { value: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                    <option value="">Any</option>
                    {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input value={cond.value} onChange={e => updateCondition(idx, { value: e.target.value })} placeholder="Value..."
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, boxSizing: 'border-box' }} />
                )}
              </div>
            </div>
            <button onClick={() => removeCondition(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '14px', marginTop: '22px', flexShrink: 0 }}>✕</button>
          </div>
        ))}

        <Btn variant="secondary" size="sm" onClick={addCondition}>+ Add Condition</Btn>
      </div>

      {/* ── STEP 3: ACTIONS ── */}
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#10B981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
          Then do this... (Actions)
        </div>

        {(form.action_nodes || []).map((action, idx) => {
          const def = ACTIONS.find(a => a.id === action.type)
          if (!def) return null
          return (
            <div key={action.id} style={{ background: 'var(--dim)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>{def.icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{def.label}</span>
                </div>
                <button onClick={() => removeAction(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '14px' }}>✕</button>
              </div>
              {def.fields.map(f => (
                <ConfigField key={f.key} fieldDef={f} value={action.config?.[f.key]}
                  onChange={v => updateAction(idx, f.key, v)} agents={agents} />
              ))}
            </div>
          )
        })}

        {/* Add action picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {ACTIONS.map(a => (
            <button key={a.id} onClick={() => addAction(a.id)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: ff, fontSize: '12px', color: 'var(--text)', fontWeight: 500, transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--panel)'}>
              <span>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── AUTOMATION CARD ───────────────────────────────────────────────
function AutomationCard({ automation, agents, onEdit, onToggle, onDelete, onViewRuns }) {
  const trigger = TRIGGERS.find(t => t.id === automation.trigger_type)
  const actionCount = automation.action_nodes?.length || 0
  const condCount   = automation.conditions?.length || 0

  return (
    <div style={{ background: 'var(--panel)', borderRadius: '12px', border: `1px solid ${automation.active ? '#10B98133' : 'var(--border)'}`, padding: '16px 20px', transition: 'box-shadow .15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', background: automation.active ? '#10B98118' : 'var(--dim)', border: `1px solid ${automation.active ? '#10B98144' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
          {trigger?.icon || '⚡'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{automation.name}</div>
          {automation.description && <div style={{ fontSize: '12px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{automation.description}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div onClick={() => onToggle(automation)}
            style={{ width: 38, height: 20, borderRadius: '99px', background: automation.active ? '#10B981' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
            <div style={{ position: 'absolute', top: 2, left: automation.active ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </div>
          <Pill label={automation.active ? 'Active' : 'Inactive'} color={automation.active ? '#10B981' : '#94A3B8'} />
        </div>
      </div>

      {/* Flow summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {trigger && (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>
            {trigger.icon} {trigger.label}
          </span>
        )}
        {condCount > 0 && (
          <>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>→</span>
            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#F5F3FF', color: '#6D28D9', fontWeight: 600 }}>
              {condCount} condition{condCount > 1 ? 's' : ''}
            </span>
          </>
        )}
        {actionCount > 0 && (
          <>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>→</span>
            {automation.action_nodes?.map(a => {
              const def = ACTIONS.find(x => x.id === a.type)
              return def ? (
                <span key={a.id} style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', background: '#F0FDF4', color: '#166534', fontWeight: 600 }}>
                  {def.icon} {def.label}
                </span>
              ) : null
            })}
          </>
        )}
      </div>

      {/* Stats + Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
        <div style={{ display: 'flex', gap: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{automation.fire_count || 0}</span> runs
          </div>
          {automation.last_fired && (
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Last: {fmtDate(automation.last_fired)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <Btn variant="ghost" size="sm" onClick={() => onViewRuns(automation)}>📋 History</Btn>
          <Btn variant="secondary" size="sm" onClick={() => onEdit(automation)}>✏️ Edit</Btn>
          <Btn variant="ghost" size="sm" style={{ color: '#DC2626' }} onClick={() => onDelete(automation)}>Delete</Btn>
        </div>
      </div>
    </div>
  )
}

// ── RUN HISTORY PANEL ─────────────────────────────────────────────
function RunHistory({ automation, onClose }) {
  const [runs,    setRuns]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('automation_runs')
      .select('*')
      .eq('automation_id', automation.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        setRuns(error ? [] : (data || []))
        setLoading(false)
      })
      .catch(() => { setRuns([]); setLoading(false) })
  }, [automation.id])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: '14px', width: '100%', maxWidth: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>📋 Run History — {automation.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {loading && <Loading />}
          {!loading && runs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: '13px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
              No runs yet — activate this automation to start tracking.
            </div>
          )}
          {runs.map(run => (
            <div key={run.id} style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${run.status === 'error' ? '#FECACA' : 'var(--border)'}`, background: run.status === 'error' ? '#FEF2F2' : 'var(--dim)', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>{run.status === 'error' ? '❌' : '✅'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: run.status === 'error' ? '#DC2626' : '#10B981' }}>
                    {run.status === 'error' ? 'Failed' : 'Success'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{run.records_affected} action{run.records_affected !== 1 ? 's' : ''} taken</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDateTime(run.created_at)}</span>
              </div>
              {run.error && <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px', fontFamily: 'monospace' }}>{run.error}</div>}
              {run.trigger_data && Object.keys(run.trigger_data).length > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                  Trigger: {JSON.stringify(run.trigger_data).slice(0, 100)}...
                </div>
              )}
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
  const { toast }           = useApp()

  const [automations, setAutomations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [agents,      setAgents]      = useState([])
  const [category,    setCategory]    = useState('All')
  const [tab,         setTab]         = useState('rules')
  const [selected,    setSelected]    = useState(null)
  const [form,        setForm]        = useState(BLANK)
  const [showBuilder, setShowBuilder] = useState(false)
  const [viewRuns,    setViewRuns]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(null)

  useEffect(() => {
    load()
    db.agents.list().then(setAgents)
  }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('automations').select('*, agents(id,name,color)').order('created_at', { ascending: false })
      setAutomations(data || [])
    } catch(e) { toast('Error: ' + e.message, '#DC2626') }
    finally { setLoading(false) }
  }

  function openNew() {
    setSelected(null)
    setForm({ ...BLANK })
    setShowBuilder(true)
  }

  function openEdit(automation) {
    setSelected(automation)
    setForm({ ...BLANK, ...automation })
    setShowBuilder(true)
  }

  async function save() {
    if (!form.name.trim())         { toast('Name required', '#DC2626'); return }
    if (!form.trigger_type)        { toast('Select a trigger', '#DC2626'); return }
    if (!form.action_nodes?.length){ toast('Add at least one action', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const { data } = await supabase.from('automations').update({ ...form, updated_at: new Date().toISOString() }).eq('id', selected.id).select().single()
        setAutomations(prev => prev.map(a => a.id === selected.id ? data : a))
        toast('✅ Automation saved')
      } else {
        const { data } = await supabase.from('automations').insert({ ...form, created_by: agent?.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single()
        setAutomations(prev => [data, ...prev])
        toast('✅ Automation created')
      }
      setShowBuilder(false)
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggleActive(automation) {
    try {
      const { data } = await supabase.from('automations').update({ active: !automation.active, updated_at: new Date().toISOString() }).eq('id', automation.id).select().single()
      setAutomations(prev => prev.map(a => a.id === automation.id ? data : a))
      toast(automation.active ? 'Automation paused' : '✅ Automation activated')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function deleteAutomation() {
    try {
      await supabase.from('automations').delete().eq('id', confirmDel.id)
      setAutomations(prev => prev.filter(a => a.id !== confirmDel.id))
      toast('Automation deleted')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setConfirmDel(null) }
  }

  // Filter by category
  const filtered = automations.filter(a => {
    if (category === 'All') return true
    const trigger = TRIGGERS.find(t => t.id === a.trigger_type)
    return trigger?.category === category
  })

  const activeCount   = automations.filter(a => a.active).length
  const totalRuns     = automations.reduce((s, a) => s + (a.fire_count || 0), 0)

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Automations"
        sub={`${activeCount} active · ${totalRuns} total runs`}
        actions={isAdmin && <Btn onClick={openNew}>+ New Automation</Btn>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Automations', value: automations.length,       color: '#3B82F6' },
          { label: 'Active',            value: activeCount,               color: '#10B981' },
          { label: 'Inactive',          value: automations.length - activeCount, color: '#94A3B8' },
          { label: 'Total Runs',        value: totalRuns,                 color: '#F5A623' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategory(c)}
            style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${category === c ? 'var(--brand)' : 'var(--border)'}`, background: category === c ? 'rgba(204,34,0,.08)' : 'var(--dim)', color: category === c ? 'var(--brand)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
            {c}
          </button>
        ))}
      </div>

      {loading && <Loading />}

      {!loading && filtered.length === 0 && (
        <Empty icon="⚡" title="No automations yet"
          sub={isAdmin ? "Create your first automation to automate repetitive tasks." : "No automations configured. Ask your admin to set these up."}
          action={isAdmin && <Btn onClick={openNew}>+ Create Automation</Btn>} />
      )}

      {/* Automation Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map(a => (
          <AutomationCard key={a.id} automation={a} agents={agents}
            onEdit={openEdit}
            onToggle={toggleActive}
            onDelete={setConfirmDel}
            onViewRuns={setViewRuns} />
        ))}
      </div>

      {/* ── BUILDER MODAL ── */}
      {showBuilder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: ff }}>
          <div style={{ background: 'var(--panel)', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.35)' }}>

            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <div style={{ flex: 1 }}>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Automation name..."
                  style={{ fontSize: '18px', fontWeight: 700, background: 'none', border: 'none', color: 'var(--text)', fontFamily: ff, outline: 'none', width: '100%' }} />
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description (optional)"
                  style={{ fontSize: '12px', background: 'none', border: 'none', color: 'var(--muted)', fontFamily: ff, outline: 'none', width: '100%', marginTop: '2px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>
                  <div onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                    style={{ width: 34, height: 18, borderRadius: '99px', background: form.active ? '#10B981' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: 1, left: form.active ? 17 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                  {form.active ? 'Active' : 'Inactive'}
                </label>
                <button onClick={() => setShowBuilder(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <RuleBuilder form={form} onChange={setForm} agents={agents} />
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <Btn variant="secondary" onClick={() => setShowBuilder(false)}>Cancel</Btn>
              <Btn onClick={save} loading={saving}>{selected ? 'Save Changes' : 'Create Automation'}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Run History Modal */}
      {viewRuns && <RunHistory automation={viewRuns} onClose={() => setViewRuns(null)} />}

      <Confirm open={!!confirmDel} message={`Delete "${confirmDel?.name}"? All run history will also be deleted.`} onConfirm={deleteAutomation} onCancel={() => setConfirmDel(null)} />
    </div>
  )
}
