// TargetOS V2 — Custom Fields Section
// Renders admin-defined custom fields (from Custom Fields admin page)
// in a detail/edit form context. Production.jsx has its own inline-
// cell rendering for deals (spreadsheet-style, not reusable here) --
// this is the form-style equivalent for Contacts and Listings, whose
// custom fields previously had nowhere to actually appear despite the
// admin page implying they'd work everywhere.
import React, { useState, useEffect } from 'react'
import { getFieldsForEntity } from '../lib/customFields'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--inp)',
  color: 'var(--text)', fontSize: 13, fontFamily: ff, boxSizing: 'border-box',
}

export function CustomFieldsSection({ entity, customData, onChange }) {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFieldsForEntity(entity).then(f => { setFields(f || []); setLoading(false) })
  }, [entity])

  if (loading || fields.length === 0) return null

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
    return (
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
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
