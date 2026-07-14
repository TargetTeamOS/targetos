// ═══════════════════════════════════════════════════════════════
// TC Settings — everything on the TC Board a person might want to
// change, editable in the CRM with no code involved:
//   • Photography services & prices
//   • Document statuses
//   • Photo-readiness checklist
//   • Participant roles
//   • Per-phase task templates (title, priority, due offset,
//     calendar, agent notification)
// Saved to system_settings key 'tc_settings'. "Reset section" puts
// a section back to the built-in defaults.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Btn, Loading } from '../components/UI'
import { useApp } from '../context/AppContext'
import { DEFAULT_TC_SETTINGS, loadTcSettings, saveTcSettings } from '../lib/tcSettings'

const inp = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }
const card = { border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16, background: 'var(--bg)' }
const cardTitle = { fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const hint = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }

const PHASES = [
  { id: 'pre_listing',    label: 'Pre-Listing' },
  { id: 'active',         label: 'Active' },
  { id: 'offer',          label: 'Offer' },
  { id: 'under_contract', label: 'Under Contract' },
  { id: 'closed',         label: 'Closed' },
]
const PRIORITIES = ['urgent', 'high', 'normal', 'low']

// simple string-list editor
function ListEditor({ items, onChange, placeholder }) {
  const [draft, setDraft] = useState('')
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <input style={{ ...inp, flex: 1 }} value={it}
                 onChange={e => onChange(items.map((x, j) => j === i ? e.target.value : x))} />
          <Btn variant="secondary" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</Btn>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={{ ...inp, flex: 1 }} value={draft} placeholder={placeholder}
               onChange={e => setDraft(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { onChange([...items, draft.trim()]); setDraft('') } }} />
        <Btn variant="secondary" onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft('') } }}>Add</Btn>
      </div>
    </div>
  )
}

export default function TCSettings() {
  const { toast } = useApp()
  const navigate = useNavigate()
  const [cfg, setCfg]       = useState(null)
  const [saving, setSaving] = useState(false)
  const [phase, setPhase]   = useState('pre_listing')

  useEffect(() => { loadTcSettings(true).then(setCfg) }, [])

  if (!cfg) return <Loading />

  const set = (key, value) => setCfg(c => ({ ...c, [key]: value }))
  const resetSection = key => set(key, JSON.parse(JSON.stringify(DEFAULT_TC_SETTINGS[key])))

  async function save() {
    setSaving(true)
    try {
      await saveTcSettings(cfg)
      toast('TC settings saved — changes apply to new tasks and orders')
    } catch (e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  // task template editors
  const templates = cfg.task_templates?.[phase] || []
  const setTemplates = rows => set('task_templates', { ...cfg.task_templates, [phase]: rows })
  const patchRow = (i, patch) => setTemplates(templates.map((r, j) => j === i ? { ...r, ...patch } : r))
  const moveRow  = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= templates.length) return
    const next = [...templates]
    ;[next[i], next[j]] = [next[j], next[i]]
    setTemplates(next)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="⚙️ TC Settings"
        sub="Prices, statuses, checklists, and task templates — all editable here, no code"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={() => navigate('/tc')}>← TC Board</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save All Changes'}</Btn>
          </div>
        }
      />

      {/* Photography services */}
      <div style={card}>
        <div style={cardTitle}><span>📸 Photography services & prices</span>
          <Btn variant="secondary" onClick={() => resetSection('photo_services')}>Reset section</Btn></div>
        <div style={hint}>These appear as the service picker on every deal's Photography panel.</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {cfg.photo_services.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 6 }}>
              <input style={inp} value={s.label}
                     onChange={e => set('photo_services', cfg.photo_services.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <input style={inp} type="number" value={s.price}
                     onChange={e => set('photo_services', cfg.photo_services.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} />
              <Btn variant="secondary" onClick={() => set('photo_services', cfg.photo_services.filter((_, j) => j !== i))}>✕</Btn>
            </div>
          ))}
          <Btn variant="secondary" onClick={() => set('photo_services', [...cfg.photo_services, { id: 'svc_' + Date.now(), label: 'New service', price: 0 }])}>+ Add service</Btn>
        </div>
      </div>

      {/* Document statuses */}
      <div style={card}>
        <div style={cardTitle}><span>📄 Document statuses</span>
          <Btn variant="secondary" onClick={() => resetSection('doc_statuses')}>Reset section</Btn></div>
        <div style={hint}>The status dropdown on every tracked document (KW Command links etc.).</div>
        <ListEditor items={cfg.doc_statuses} onChange={v => set('doc_statuses', v)} placeholder="New status…" />
      </div>

      {/* Readiness checklist */}
      <div style={card}>
        <div style={cardTitle}><span>✅ Photo-readiness checklist</span>
          <Btn variant="secondary" onClick={() => resetSection('readiness_checklist')}>Reset section</Btn></div>
        <div style={hint}>Checked off per deal before scheduling photography. When every item is done, the order flips to “Ready” automatically.</div>
        <ListEditor items={cfg.readiness_checklist} onChange={v => set('readiness_checklist', v)} placeholder="New checklist item…" />
      </div>

      {/* Participant roles */}
      <div style={card}>
        <div style={cardTitle}><span>👥 People roles</span>
          <Btn variant="secondary" onClick={() => resetSection('participant_roles')}>Reset section</Btn></div>
        <div style={hint}>The role options when adding a person to a deal (Seller, Mortgage Broker, Attorney…).</div>
        <ListEditor items={cfg.participant_roles} onChange={v => set('participant_roles', v)} placeholder="New role…" />
      </div>

      {/* Commission */}
      <div style={card}>
        <div style={cardTitle}><span>🧾 Commission bill default rate (%)</span></div>
        <div style={hint}>Pre-fills the rate on every commission bill — editable per bill before sending.</div>
        <input style={{ ...inp, width: 120 }} type="number" step="0.05" value={cfg.commission_rate_percent ?? 1.5}
               onChange={e => set('commission_rate_percent', Number(e.target.value))} />
      </div>

      {/* Task templates */}
      <div style={card}>
        <div style={cardTitle}><span>📋 Task templates per phase</span>
          <Btn variant="secondary" onClick={() => resetSection('task_templates')}>Reset ALL phases</Btn></div>
        <div style={hint}>
          Auto-generated when a deal enters a phase. “Due +days” counts from the day the phase starts.
          “📅” also creates a calendar event; “🔔” also emails the agent. Changes affect future deals only — existing tasks stay as they are.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {PHASES.map(p => (
            <button key={p.id} onClick={() => setPhase(p.id)}
              style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                       border: '1px solid ' + (phase === p.id ? 'var(--brand)' : 'var(--border)'),
                       background: phase === p.id ? 'var(--brand)' : 'var(--bg)',
                       color: phase === p.id ? '#fff' : 'var(--text)' }}>
              {p.label} ({(cfg.task_templates?.[p.id] || []).length})
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {templates.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 90px 34px 34px auto auto auto', gap: 6, alignItems: 'center' }}>
              <input style={inp} value={t.label} onChange={e => patchRow(i, { label: e.target.value })} />
              <select style={inp} value={t.priority || 'normal'} onChange={e => patchRow(i, { priority: e.target.value })}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input style={inp} type="number" title="Due +days" value={t.days ?? 0} onChange={e => patchRow(i, { days: Number(e.target.value) })} />
              <button title="Create calendar event" onClick={() => patchRow(i, { cal: !t.cal })}
                style={{ ...inp, padding: '6px 0', cursor: 'pointer', textAlign: 'center', opacity: t.cal ? 1 : 0.3 }}>📅</button>
              <button title="Email the agent" onClick={() => patchRow(i, { notify_agent: !t.notify_agent })}
                style={{ ...inp, padding: '6px 0', cursor: 'pointer', textAlign: 'center', opacity: t.notify_agent ? 1 : 0.3 }}>🔔</button>
              <Btn variant="secondary" onClick={() => moveRow(i, -1)}>↑</Btn>
              <Btn variant="secondary" onClick={() => moveRow(i, 1)}>↓</Btn>
              <Btn variant="secondary" onClick={() => setTemplates(templates.filter((_, j) => j !== i))}>✕</Btn>
            </div>
          ))}
          <Btn variant="secondary" onClick={() => setTemplates([...templates, { key: 'custom_' + Date.now(), label: 'New task', priority: 'normal', days: 0 }])}>+ Add task</Btn>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save All Changes'}</Btn>
      </div>
    </div>
  )
}
