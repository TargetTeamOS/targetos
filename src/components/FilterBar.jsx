// ═══════════════════════════════════════════════════════════════
// FilterBar — compact, collapsible filter row for any board
// Features:
//   • Small pill-style selects (28px tall)  
//   • Collapsible "More filters" for extra fields
//   • Active filter count badge
//   • One-click clear all
//   • Works on any page — just pass filters config
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// Shared micro-style for all filter controls
const micro = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--inp)',
  color: 'var(--text)',
  fontSize: 11,
  fontFamily: ff,
  height: 28,
  cursor: 'pointer',
  outline: 'none',
  whiteSpace: 'nowrap',
}
const microActive = (active) => ({
  ...micro,
  borderColor: active ? '#CC2200' : 'var(--border)',
  background:  active ? 'rgba(204,34,0,.06)' : 'var(--inp)',
  color:       active ? '#CC2200' : 'var(--text)',
  fontWeight:  active ? 700 : 400,
})

/**
 * FilterBar
 *
 * @param {Object[]} filters  - Array of filter definitions:
 *   { key, label, type, options, placeholder, primary }
 *   type: 'select' | 'text' | 'number'
 *   primary: true = always visible, false/undefined = in "More" panel
 *
 * @param {Object}   values   - Current filter values { key: value }
 * @param {Function} onChange - Called with (key, value) when a filter changes
 * @param {Number}   total    - Total record count (for "showing X of Y" display)
 * @param {Number}   filtered - Filtered record count
 */
export function FilterBar({ filters = [], values = {}, onChange, total, filtered, extraLeft, extraRight }) {
  const [expanded, setExpanded] = useState(false)

  const primary   = filters.filter(f => f.primary !== false)
  const secondary = filters.filter(f => f.primary === false)

  const activeCount = Object.entries(values).filter(([k, v]) => {
    const f = filters.find(x => x.key === k)
    return f && v && v !== '' && v !== f.defaultValue
  }).length

  function clearAll() {
    filters.forEach(f => onChange(f.key, f.defaultValue || ''))
  }

  function renderControl(f) {
    const val = values[f.key] ?? ''
    const active = val !== '' && val !== (f.defaultValue || '')

    if (f.type === 'text') {
      return (
        <input
          key={f.key}
          value={val}
          onChange={e => onChange(f.key, e.target.value)}
          placeholder={f.placeholder || f.label}
          style={{ ...microActive(active), minWidth: f.width || 140, flex: f.flex || undefined }}
        />
      )
    }

    if (f.type === 'number-range') {
      return (
        <div key={f.key} style={{ display:'flex', alignItems:'center', gap:3 }}>
          <input type="number" value={values[f.minKey]??''} onChange={e=>onChange(f.minKey,e.target.value)}
            placeholder={f.minPlaceholder || 'Min'}
            style={{ ...micro, width: 72 }} />
          <span style={{ fontSize:10, color:'var(--muted)' }}>–</span>
          <input type="number" value={values[f.maxKey]??''} onChange={e=>onChange(f.maxKey,e.target.value)}
            placeholder={f.maxPlaceholder || 'Max'}
            style={{ ...micro, width: 72 }} />
        </div>
      )
    }

    // Default: select
    return (
      <select
        key={f.key}
        value={val}
        onChange={e => onChange(f.key, e.target.value)}
        style={microActive(active)}
      >
        <option value="">{f.placeholder || f.label}</option>
        {(f.options || []).map(o => {
          const optVal   = typeof o === 'object' ? o.value : o
          const optLabel = typeof o === 'object' ? o.label : o
          return <option key={optVal} value={optVal}>{optLabel}</option>
        })}
      </select>
    )
  }

  const hasActive = activeCount > 0

  return (
    <div style={{ fontFamily: ff, marginBottom: 12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
        {/* Extra left slot (e.g. search box) */}
        {extraLeft}

        {/* Primary filters */}
        {primary.map(f => renderControl(f))}

        {/* More filters toggle */}
        {secondary.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ ...micro, display:'flex', alignItems:'center', gap:4, borderColor: expanded ? '#CC2200' : 'var(--border)', background: expanded ? 'rgba(204,34,0,.06)' : 'var(--inp)', color: expanded ? '#CC2200' : 'var(--muted)', fontWeight: expanded ? 700 : 400 }}>
            ⚙ Filters
            {activeCount > 0 && (
              <span style={{ background:'#CC2200', color:'#fff', borderRadius:10, padding:'1px 5px', fontSize:9, fontWeight:900 }}>
                {activeCount}
              </span>
            )}
          </button>
        )}

        {/* Clear all */}
        {hasActive && (
          <button onClick={clearAll}
            style={{ ...micro, borderColor:'#DC262444', background:'#FEF2F2', color:'#DC2626', fontWeight:700 }}>
            ✕ Clear
          </button>
        )}

        {/* Record count */}
        {total !== undefined && (
          <span style={{ fontSize:10, color:'var(--muted)', marginLeft:'auto', whiteSpace:'nowrap' }}>
            {filtered !== undefined && filtered !== total
              ? <><strong style={{ color:'var(--text)' }}>{filtered}</strong> of {total}</>
              : <strong style={{ color:'var(--text)' }}>{total}</strong>
            } results
          </span>
        )}

        {/* Extra right slot */}
        {extraRight}
      </div>

      {/* Expanded secondary filters */}
      {expanded && secondary.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginTop:6, padding:'8px 10px', background:'var(--dim)', borderRadius:8, border:'1px solid var(--border)' }}>
          <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginRight:4 }}>More:</span>
          {secondary.map(f => renderControl(f))}
        </div>
      )}
    </div>
  )
}
