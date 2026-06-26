// FilterBar — tiny unified filter row, 26px tall controls
// All filters inline, secondary ones hidden behind "▾ More"

import React, { useState } from 'react'
const ff = 'Inter, system-ui, -apple-system, sans-serif'

const s = (active) => ({
  padding: '0 8px',
  height: 26,
  borderRadius: 5,
  border: `1px solid ${active ? '#CC2200' : 'var(--border)'}`,
  background: active ? 'rgba(204,34,0,.07)' : 'var(--inp)',
  color: active ? '#CC2200' : 'var(--text)',
  fontSize: 11,
  fontFamily: ff,
  fontWeight: active ? 700 : 400,
  cursor: 'pointer',
  outline: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  boxSizing: 'border-box',
})

export function FilterBar({
  search, onSearch, searchPlaceholder = '🔍 Search...',
  filters = [],   // { key, label, type, options, placeholder, minKey, maxKey, width, secondary }
  values  = {},
  onChange,
  total, filtered,
  right,          // extra slot far right (e.g. view toggle)
}) {
  const [open, setOpen] = useState(false)

  const primary   = filters.filter(f => !f.secondary)
  const secondary = filters.filter(f =>  f.secondary)

  const activePrimary   = primary.filter(f   => isActive(f, values))
  const activeSecondary = secondary.filter(f => isActive(f, values))
  const totalActive     = activePrimary.length + activeSecondary.length

  function isActive(f, vals) {
    if (f.type === 'range') return vals[f.minKey] || vals[f.maxKey]
    return vals[f.key] && vals[f.key] !== ''
  }

  function clearAll() {
    filters.forEach(f => {
      if (f.type === 'range') { onChange(f.minKey, ''); onChange(f.maxKey, '') }
      else onChange(f.key, '')
    })
    if (onSearch) onSearch('')
  }

  function ctrl(f) {
    const val    = values[f.key] ?? ''
    const active = isActive(f, values)

    if (f.type === 'range') {
      return (
        <div key={f.key} style={{ display:'flex', alignItems:'center', gap:2 }}>
          <input type="number" value={values[f.minKey]??''} onChange={e=>onChange(f.minKey,e.target.value)}
            placeholder={f.minLabel||'Min'}
            style={{ ...s(!!values[f.minKey]), width:f.width||70 }}/>
          <span style={{ fontSize:9, color:'var(--muted)' }}>–</span>
          <input type="number" value={values[f.maxKey]??''} onChange={e=>onChange(f.maxKey,e.target.value)}
            placeholder={f.maxLabel||'Max'}
            style={{ ...s(!!values[f.maxKey]), width:f.width||70 }}/>
        </div>
      )
    }

    if (f.type === 'text') {
      return (
        <input key={f.key} value={val} onChange={e=>onChange(f.key,e.target.value)}
          placeholder={f.placeholder||f.label}
          style={{ ...s(active), width: f.width || 110 }}/>
      )
    }

    // select (default)
    return (
      <select key={f.key} value={val} onChange={e=>onChange(f.key,e.target.value)} style={s(active)}>
        <option value="">{f.placeholder || f.label}</option>
        {(f.options||[]).map(o => {
          const v = typeof o === 'object' ? o.value : o
          const l = typeof o === 'object' ? o.label : o
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
    )
  }

  const hasAny = totalActive > 0 || (search && search.trim())

  return (
    <div style={{ fontFamily:ff, marginBottom:10 }}>

      {/* Main row */}
      <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>

        {/* Search */}
        {onSearch !== undefined && (
          <input value={search||''} onChange={e=>onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            style={{ ...s(search?.trim()), width:170 }}/>
        )}

        {/* Primary filters */}
        {primary.map(f => ctrl(f))}

        {/* More toggle */}
        {secondary.length > 0 && (
          <button onClick={()=>setOpen(o=>!o)}
            style={{ ...s(open||activeSecondary.length>0), display:'flex', alignItems:'center', gap:3 }}>
            ▾ More
            {activeSecondary.length > 0 && (
              <span style={{ background:'#CC2200', color:'#fff', borderRadius:8, padding:'0 4px', fontSize:9, fontWeight:900 }}>
                {activeSecondary.length}
              </span>
            )}
          </button>
        )}

        {/* Clear */}
        {hasAny && (
          <button onClick={clearAll}
            style={{ ...s(false), borderColor:'#DC262440', background:'#FEF2F2', color:'#DC2626', fontWeight:700 }}>
            ✕
          </button>
        )}

        {/* Count */}
        {total !== undefined && (
          <span style={{ fontSize:10, color:'var(--muted)', marginLeft:'auto', flexShrink:0 }}>
            {filtered !== undefined && filtered < total
              ? <><b style={{ color:'var(--text)' }}>{filtered}</b>/{total}</>
              : <b style={{ color:'var(--text)' }}>{total}</b>}
          </span>
        )}

        {right && <div style={{ marginLeft: total === undefined ? 'auto' : 0 }}>{right}</div>}
      </div>

      {/* Secondary row */}
      {open && secondary.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap', marginTop:5,
          padding:'6px 8px', background:'var(--dim)', borderRadius:7, border:'1px solid var(--border)' }}>
          <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>More:</span>
          {secondary.map(f => ctrl(f))}
        </div>
      )}
    </div>
  )
}
