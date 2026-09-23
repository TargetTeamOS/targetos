// TargetOS V2 — Custom Fields Section
// Renders admin-defined custom fields (from Custom Fields admin page)
// in a detail/edit form context. Production.jsx has its own inline-
// cell rendering for deals (spreadsheet-style, not reusable here) --
// this is the form-style equivalent for every other board.
//
// Also lets a manager/admin define a NEW field right here, on the
// board's own add/edit form, instead of having to go to the separate
// Custom Fields admin page first. It's the exact same no-code system
// underneath (same system_settings row, same saveFieldDefs()) — this
// is just a second, in-context entry point into it. The admin page
// remains the place to reorder, hide, edit, or delete fields; this
// panel only adds.
import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import {
  getFieldsForEntity, normalizeOption, normalizeOptions,
  loadFieldDefs, saveFieldDefs, invalidateFieldCache,
  labelToKey, FIELD_TYPES, ENTITY_LABELS,
} from '../lib/customFields'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--inp)',
  color: 'var(--text)', fontSize: 13, fontFamily: ff, boxSizing: 'border-box',
}
const smallLabel = {
  fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
  letterSpacing: '.05em', marginBottom: 4, display: 'block',
}

const BLANK_NEW_FIELD = { label: '', key: '', type: 'text', section: '', required: false, options: [] }

export function CustomFieldsSection({ entity, customData, onChange }) {
  const { can } = useAuth()
  const { toast } = useApp()
  const [fields, setFields]   = useState([])
  const [loading, setLoading] = useState(true)
  const canManageFields = can('admin.customize')

  const [showAddField, setShowAddField] = useState(false)
  const [newField, setNewField]         = useState(BLANK_NEW_FIELD)
  const [savingField, setSavingField]   = useState(false)

  useEffect(() => {
    getFieldsForEntity(entity).then(f => { setFields(f || []); setLoading(false) })
  }, [entity])

  function openAddField() {
    setNewField(BLANK_NEW_FIELD)
    setShowAddField(true)
  }

  function setNewFieldProp(k, v) {
    setNewField(p => {
      const updated = { ...p, [k]: v }
      // Auto-generate the storage key from the label, same as the admin page,
      // unless the key has already diverged from what auto-generation would give.
      if (k === 'label' && (!p.key || p.key === labelToKey(p.label))) {
        updated.key = labelToKey(v)
      }
      return updated
    })
  }

  async function saveNewField() {
    if (!newField.label.trim()) { toast('Field name is required', '#DC2626'); return }
    if (!newField.key.trim())   { toast('Field name is required', '#DC2626'); return }
    if (newField.type === 'select' && (!newField.options || newField.options.length === 0)) {
      toast('Add at least one dropdown option', '#DC2626'); return
    }

    setSavingField(true)
    try {
      const all = (await loadFieldDefs()) || []
      if (all.some(f => f.entity === entity && f.key === newField.key)) {
        toast('A field with this name already exists here', '#DC2626')
        setSavingField(false); return
      }
      const order = all.filter(f => f.entity === entity).length
      const fieldDef = {
        id: (crypto?.randomUUID?.() || 'cf_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
        entity, label: newField.label.trim(), key: newField.key,
        type: newField.type, options: newField.options || [],
        required: !!newField.required, section: newField.section || '',
        order, active: true,
      }
      await saveFieldDefs([...all, fieldDef])
      invalidateFieldCache()
      // Show it immediately, right here, without waiting on a refetch —
      // this is the whole point of adding it in-page rather than via the
      // separate admin page.
      setFields(prev => [...prev, fieldDef].sort((a, b) => (a.order || 0) - (b.order || 0)))
      setShowAddField(false)
      toast('✅ "' + fieldDef.label + '" added to ' + (ENTITY_LABELS[entity] || entity) + ' for everyone')
    } catch (e) {
      toast('Failed to add field: ' + e.message, '#DC2626')
    } finally {
      setSavingField(false)
    }
  }

  if (loading) return null
  // Nothing defined yet and this person can't define one either — same
  // as before, render nothing rather than an empty section.
  if (fields.length === 0 && !canManageFields) return null

  const data = customData || {}
  const sections = {}
  fields.forEach(f => {
    const s = f.section || 'Custom Fields'
    if (!sections[s]) sections[s] = []
    sections[s].push(f)
  })

  return (
    <div style={{ marginTop: 16 }}>
      {Object.entries(sections).map(([sectionName, sectionFields]) => (
        <div key={sectionName} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
            {sectionName}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {sectionFields.map(f => (
              <div key={f.key} style={f.type === 'textarea' ? { gridColumn: 'span 2' } : undefined}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  {f.label}{f.required && <span style={{ color: '#DC2626' }}> *</span>}
                </div>
                <CustomFieldInput field={f} value={data[f.key]} onChange={v => onChange(f.key, v)} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {canManageFields && (
        !showAddField ? (
          <button type="button" onClick={openAddField}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1.5px dashed var(--border)',
              background: 'transparent', color: 'var(--muted)', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: ff, width: '100%', textAlign: 'left',
            }}>
            + Add a custom field to {ENTITY_LABELS[entity] || entity}
          </button>
        ) : (
          <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--dim)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              New field on {ENTITY_LABELS[entity] || entity}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <span style={smallLabel}>Field Name</span>
                <input value={newField.label} onChange={e => setNewFieldProp('label', e.target.value)}
                  placeholder="e.g. HOA Amount" style={inputStyle} autoFocus />
              </div>
              <div>
                <span style={smallLabel}>Field Type</span>
                <select value={newField.type} onChange={e => setNewFieldProp('type', e.target.value)} style={inputStyle}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <span style={smallLabel}>Section (optional)</span>
                <input value={newField.section} onChange={e => setNewFieldProp('section', e.target.value)}
                  placeholder="e.g. Financial Info" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 9 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={!!newField.required}
                    onChange={e => setNewFieldProp('required', e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: 'var(--brand)' }} />
                  Required field
                </label>
              </div>
            </div>

            {newField.type === 'select' && (
              <div style={{ marginBottom: 10 }}>
                <FieldOptionsEditor options={newField.options} onChange={opts => setNewFieldProp('options', opts)} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddField(false)}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                Cancel
              </button>
              <button type="button" onClick={saveNewField} disabled={savingField}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: savingField ? 'default' : 'pointer', fontFamily: ff, opacity: savingField ? .7 : 1 }}>
                {savingField ? 'Adding...' : 'Add Field'}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ── DROPDOWN OPTIONS EDITOR ─────────────────────────────────────────
// Shared with the Custom Fields admin page (src/pages/CustomFields.jsx)
// so the two "add a field" entry points — here, in-page, and there,
// the admin list — stay pixel-for-pixel and behavior-for-behavior
// identical, with one implementation to maintain.
export function FieldOptionsEditor({ options, onChange }) {
  const [optionText, setOptionText] = useState('')
  const opts = options || []

  function addOption() {
    const label = optionText.trim()
    if (!label) return
    onChange([...opts, { label, value: label, color: null }])
    setOptionText('')
  }
  function updateOption(i, patch) {
    const o = normalizeOption(opts[i])
    onChange(opts.map((x, j) => (j === i ? { ...o, ...patch } : x)))
  }
  function removeOption(i) {
    onChange(opts.filter((_, j) => j !== i))
  }

  return (
    <div>
      <span style={smallLabel}>Dropdown Options</span>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={optionText} onChange={e => setOptionText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption() } }}
          placeholder="Type option, press Enter" style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={addOption}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: ff }}>
          Add
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {opts.map((opt, i) => {
          const o = normalizeOption(opt)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--border)' }}>
              <input type="color" value={o.color || '#cccccc'} onChange={e => updateOption(i, { color: e.target.value })}
                title="Option color" style={{ width: 30, height: 26, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: '#fff' }} />
              <input value={o.label} onChange={e => updateOption(i, { label: e.target.value, value: e.target.value })}
                style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: 12 }} />
              <input value={o.color || ''} onChange={e => updateOption(i, { color: e.target.value })} placeholder="#RRGGBB"
                style={{ ...inputStyle, width: 96, padding: '5px 8px', fontSize: 12 }} />
              <button type="button" onClick={() => removeOption(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 16, padding: 0 }}>×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CustomFieldInput({ field, value, onChange }) {
  if (field.type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        <span style={{ fontSize: 13, color: 'var(--text)' }}>Yes</span>
      </label>
    )
  }
  if (field.type === 'select') {
    // Options may be legacy plain strings or the newer {label,value,color}
    // shape the admin UI now saves (see customFields.js normalizeOption) —
    // normalize both to the same rendering so colored dropdowns defined on
    // any board don't render as "[object Object]".
    return (
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {normalizeOptions(field.options).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (field.type === 'textarea') {
    return <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
  }
  if (field.type === 'date') {
    return <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
  }
  if (field.type === 'number' || field.type === 'currency') {
    return (
      <div style={{ position: 'relative' }}>
        {field.type === 'currency' && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>$</span>}
        <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={field.type === 'currency' ? { ...inputStyle, paddingLeft: 22 } : inputStyle} />
      </div>
    )
  }
  const htmlType = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'
  return <input type={htmlType} value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
}
