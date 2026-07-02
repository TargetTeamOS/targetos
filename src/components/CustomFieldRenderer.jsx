// TargetOS V2 — Custom Field Renderer
// Renders any custom field definition as an editable input.
// Used in ContactDetail, ListingDetail, Production deal drawer.
// Props:
//   field    — field definition object
//   value    — current value
//   onChange — fn(newValue)
//   readOnly — show as text only

import React from 'react'
const ff = 'Inter, system-ui, -apple-system, sans-serif'
const S  = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }

export function CustomFieldRenderer({ field, value, onChange, readOnly = false }) {
  if (!field) return null

  const fmtCurrency = v => {
    const n = parseFloat(String(v||'').replace(/[$,]/g,''))
    return isNaN(n) ? '' : '$' + n.toLocaleString()
  }

  if (readOnly) {
    let display = value ?? '—'
    if (field.type === 'checkbox') display = value ? '✅ Yes' : '❌ No'
    if (field.type === 'currency' && value) display = fmtCurrency(value)
    if (field.type === 'url' && value) return <a href={value} target="_blank" rel="noopener noreferrer" style={{ color:'var(--brand)', fontSize:13 }}>{value}</a>
    return <span style={{ fontSize:13, color:'var(--text)' }}>{String(display)}</span>
  }

  switch(field.type) {
    case 'textarea':
      return <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={field.label} rows={3} style={{...S,resize:'vertical'}} />

    case 'select':
      return (
        <select value={value||''} onChange={e=>onChange(e.target.value)} style={S}>
          <option value="">— Select —</option>
          {(field.options||[]).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )

    case 'checkbox':
      return (
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text)', fontFamily:ff }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e=>onChange(e.target.checked)}
            style={{ width:16, height:16, accentColor:'var(--brand)', cursor:'pointer' }}
          />
          {value ? 'Yes' : 'No'}
        </label>
      )

    case 'date':
      return <input type="date" value={value||''} onChange={e=>onChange(e.target.value)} style={S} />

    case 'number':
      return <input type="number" value={value||''} onChange={e=>onChange(e.target.value)} placeholder="0" style={S} />

    case 'currency':
      return (
        <div style={{ position:'relative' }}>
          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', fontSize:13 }}>$</span>
          <input type="number" value={value||''} onChange={e=>onChange(e.target.value)} placeholder="0" style={{...S, paddingLeft:22}} />
        </div>
      )

    case 'url':
      return <input type="url" value={value||''} onChange={e=>onChange(e.target.value)} placeholder="https://" style={S} />

    case 'phone':
      return <input type="tel" value={value||''} onChange={e=>onChange(e.target.value)} placeholder="(845) 555-1234" style={S} />

    case 'email':
      return <input type="email" value={value||''} onChange={e=>onChange(e.target.value)} placeholder="email@example.com" style={S} />

    default: // text
      return <input type="text" value={value||''} onChange={e=>onChange(e.target.value)} placeholder={field.label} style={S} />
  }
}

// ── CUSTOM FIELDS SECTION ─────────────────────────────────────────
// Drop this into any detail page to show all custom fields for an entity
export function CustomFieldsSection({ entity, data, onChange, readOnly = false }) {
  const [fields, setFields] = React.useState([])
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    import('../lib/customFields').then(({ getFieldsForEntity }) => {
      getFieldsForEntity(entity).then(f => { setFields(f); setLoaded(true) })
    })
  }, [entity])

  if (!loaded || fields.length === 0) return null

  // Group by section
  const sections = {}
  fields.forEach(f => {
    const sec = f.section || 'Custom Fields'
    if (!sections[sec]) sections[sec] = []
    sections[sec].push(f)
  })

  const customData = data?.custom_data || {}

  return (
    <>
      {Object.entries(sections).map(([section, sFields]) => (
        <div key={section}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', margin:'20px 0 10px', borderTop:'1px solid var(--border)', paddingTop:14 }}>
            {section}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {sFields.map(field => (
              <div key={field.id} style={{ gridColumn: field.type === 'textarea' ? 'span 2' : 'span 1' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:4 }}>
                  {field.label}{field.required && <span style={{ color:'#DC2626', marginLeft:2 }}>*</span>}
                </div>
                <CustomFieldRenderer
                  field={field}
                  value={customData[field.key]}
                  onChange={v => onChange?.({ ...customData, [field.key]: v })}
                  readOnly={readOnly}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
