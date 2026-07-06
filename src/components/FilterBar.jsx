// TargetOS V2 — FilterBar
// Compact single-line filter bar with:
// - Quick filters: click any value chip to filter instantly
// - Advanced mode: AND/OR builder (opens in dropdown panel)
// - Saved views: name and save any filter combination
// - Active filter chips inline, count badge on filter button

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── UTILS ─────────────────────────────────────────────────────────
function useClickOutside(ref, onClose) {
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
}

// ── ACTIVE CHIP ───────────────────────────────────────────────────
function ActiveChip({ label, color = '#CC2200', onRemove }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3,
      padding:'2px 8px 2px 10px', borderRadius:99,
      background: color + '18', border:'1px solid ' + color + '44',
      fontSize:11, fontWeight:700, color, flexShrink:0, whiteSpace:'nowrap' }}>
      {label}
      <button onClick={onRemove}
        style={{ background:'none', border:'none', cursor:'pointer',
          color, fontSize:14, lineHeight:1, padding:0, opacity:.6, marginLeft:1 }}>
        ×
      </button>
    </span>
  )
}

// ── QUICK FILTER DROPDOWN ─────────────────────────────────────────
// Single dropdown for one field — shows all options as clickable pills
function QuickDrop({ def, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false))

  const selected = Array.isArray(value) ? value : (value ? [value] : [])
  const hasValue = selected.length > 0

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:4,
          padding:'5px 10px', borderRadius:7, cursor:'pointer', fontFamily:ff,
          border:'1px solid ' + (hasValue ? '#CC2200' : 'var(--border)'),
          background: hasValue ? 'rgba(204,34,0,.07)' : 'var(--inp)',
          color: hasValue ? '#CC2200' : 'var(--muted)',
          fontSize:12, fontWeight: hasValue ? 700 : 400,
          whiteSpace:'nowrap' }}>
        {def.icon && <span style={{ fontSize:13 }}>{def.icon}</span>}
        {hasValue
          ? selected.length === 1
            ? (def.options.find(o => o.value === selected[0])?.label || selected[0])
            : selected.length + ' ' + def.label
          : def.label}
        {hasValue
          ? <span onClick={e=>{e.stopPropagation();onChange(def.key,[])}}
              style={{ fontSize:13, opacity:.7, marginLeft:1 }}>×</span>
          : <span style={{ fontSize:9, opacity:.4, marginLeft:2 }}>▾</span>
        }
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:300,
          background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10,
          boxShadow:'0 8px 28px rgba(0,0,0,.18)', minWidth:160, maxHeight:260,
          overflowY:'auto', padding:'6px 0' }}>
          <div style={{ padding:'4px 12px 6px', fontSize:10, fontWeight:800,
            color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em',
            borderBottom:'1px solid var(--border)', marginBottom:4 }}>
            {def.label}
          </div>
          {def.options.map(opt => {
            const isSel = selected.includes(opt.value)
            return (
              <button key={opt.value} onClick={() => {
                  const next = def.multiSelect
                    ? (isSel ? selected.filter(v=>v!==opt.value) : [...selected, opt.value])
                    : (isSel ? [] : [opt.value])
                  onChange(def.key, def.multiSelect ? next : (next[0] || ''))
                  if (!def.multiSelect) setOpen(false)
                }}
                style={{ display:'flex', alignItems:'center', gap:8,
                  width:'100%', textAlign:'left', padding:'6px 14px',
                  background: isSel ? 'rgba(204,34,0,.06)' : 'transparent',
                  border:'none', cursor:'pointer', fontFamily:ff,
                  fontSize:12, fontWeight: isSel ? 700 : 400,
                  color: isSel ? '#CC2200' : 'var(--text)' }}>
                <span style={{ width:14, height:14, borderRadius:4, flexShrink:0,
                  border:'1.5px solid ' + (isSel ? '#CC2200' : 'var(--border)'),
                  background: isSel ? '#CC2200' : 'transparent',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {isSel && <span style={{ color:'#fff', fontSize:9, fontWeight:900 }}>✓</span>}
                </span>
                {opt.color && (
                  <span style={{ width:8, height:8, borderRadius:'50%', background:opt.color, flexShrink:0 }} />
                )}
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ADVANCED FILTER BUILDER ───────────────────────────────────────
// AND/OR multi-condition builder
function AdvancedBuilder({ definitions, rules, onChange }) {
  const [mode, setMode] = useState('AND') // AND | OR

  function addRule() {
    onChange({ mode, rules: [...rules, { key: definitions[0]?.key || '', op:'is', value:'' }] })
  }
  function removeRule(i) {
    const next = rules.filter((_, idx) => idx !== i)
    onChange({ mode, rules: next })
  }
  function updateRule(i, patch) {
    const next = rules.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    onChange({ mode, rules: next })
  }

  return (
    <div style={{ padding:'12px 14px', minWidth:340 }}>
      {/* AND / OR toggle */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>Match</span>
        {['AND','OR'].map(m => (
          <button key={m} onClick={() => { setMode(m); onChange({ mode:m, rules }) }}
            style={{ padding:'4px 12px', borderRadius:7, border:'1.5px solid ' + (mode===m?'#CC2200':'var(--border)'),
              background: mode===m ? 'rgba(204,34,0,.08)' : 'transparent',
              color: mode===m ? '#CC2200' : 'var(--muted)',
              fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            {m === 'AND' ? 'ALL conditions' : 'ANY condition'}
          </button>
        ))}
      </div>

      {/* Rules */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
        {rules.map((rule, i) => {
          const def = definitions.find(d => d.key === rule.key) || definitions[0]
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              {i > 0 && (
                <span style={{ fontSize:10, fontWeight:800, color:'var(--muted)',
                  width:28, textAlign:'center', flexShrink:0 }}>{mode}</span>
              )}
              {i === 0 && <span style={{ width:28, flexShrink:0 }} />}

              {/* Field picker */}
              <select value={rule.key} onChange={e => updateRule(i, { key:e.target.value, value:'' })}
                style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)',
                  background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff, flex:1 }}>
                {definitions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>

              {/* Op picker */}
              <select value={rule.op} onChange={e => updateRule(i, { op:e.target.value })}
                style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)',
                  background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff, width:70 }}>
                <option value="is">is</option>
                <option value="is_not">is not</option>
                <option value="contains">contains</option>
                <option value="starts">starts with</option>
              </select>

              {/* Value */}
              {def?.options?.length > 0 ? (
                <select value={rule.value} onChange={e => updateRule(i, { value:e.target.value })}
                  style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)',
                    background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff, flex:1 }}>
                  <option value="">Select...</option>
                  {def.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input value={rule.value} onChange={e => updateRule(i, { value:e.target.value })}
                  placeholder="Value..."
                  style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)',
                    background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff, flex:1 }} />
              )}

              <button onClick={() => removeRule(i)}
                style={{ background:'none', border:'none', cursor:'pointer',
                  color:'#DC2626', fontSize:16, padding:'0 2px', lineHeight:1, flexShrink:0 }}>
                ×
              </button>
            </div>
          )
        })}
      </div>

      <button onClick={addRule}
        style={{ padding:'5px 12px', borderRadius:7, border:'1px dashed var(--border)',
          background:'transparent', color:'var(--muted)', fontSize:11,
          cursor:'pointer', fontFamily:ff, width:'100%' }}>
        + Add condition
      </button>
    </div>
  )
}

// ── SAVED VIEWS ───────────────────────────────────────────────────
function SavedViewsPanel({ page, currentFilters, onApply }) {
  const { agent } = useAuth()
  const [views,   setViews]   = useState([])
  const [newName, setNewName] = useState('')
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (!agent?.id) return
    supabase.from('briefing_prefs').select('saved_views').eq('agent_id', agent.id).maybeSingle()
      .then(({ data }) => setViews(Object.entries(data?.saved_views?.[page] || {}).map(([name, filters]) => ({ name, filters }))))
  }, [agent?.id, page])

  async function save() {
    if (!newName.trim() || !agent?.id) return
    setSaving(true)
    try {
      const { data } = await supabase.from('briefing_prefs').select('saved_views').eq('agent_id', agent.id).maybeSingle()
      const all = data?.saved_views || {}
      if (!all[page]) all[page] = {}
      all[page][newName.trim()] = currentFilters
      await supabase.from('briefing_prefs').upsert({ agent_id:agent.id, saved_views:all, updated_at:new Date().toISOString() }, { onConflict:'agent_id' })
      setViews(Object.entries(all[page]).map(([name, filters]) => ({ name, filters })))
      setNewName('')
    } finally { setSaving(false) }
  }

  async function deleteView(name) {
    const { data } = await supabase.from('briefing_prefs').select('saved_views').eq('agent_id', agent.id).maybeSingle()
    const all = data?.saved_views || {}
    if (all[page]) { delete all[page][name] }
    await supabase.from('briefing_prefs').update({ saved_views:all }).eq('agent_id', agent.id)
    setViews(prev => prev.filter(v => v.name !== name))
  }

  return (
    <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', minWidth:240 }}>
      <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase',
        letterSpacing:'.06em', marginBottom:8 }}>Saved Views</div>
      {views.length === 0 && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8, fontStyle:'italic' }}>No saved views yet</div>}
      {views.map(v => (
        <div key={v.name} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
          <button onClick={() => onApply(v.filters)}
            style={{ flex:1, textAlign:'left', padding:'5px 10px', borderRadius:7,
              border:'1px solid var(--border)', background:'var(--dim)',
              color:'var(--text)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
            📌 {v.name}
          </button>
          <button onClick={() => deleteView(v.name)}
            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:14, padding:'0 3px' }}>
            ×
          </button>
        </div>
      ))}
      <div style={{ display:'flex', gap:6, marginTop:8 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          placeholder="Save current as..."
          style={{ flex:1, padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)',
            background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff }} />
        <button onClick={save} disabled={saving || !newName.trim()}
          style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--brand)',
            background:'rgba(204,34,0,.08)', color:'var(--brand)',
            fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
          Save
        </button>
      </div>
    </div>
  )
}

// ── MAIN FILTERBAR ────────────────────────────────────────────────
export function FilterBar({
  // Data
  filters = {}, onChange,
  definitions = [],
  // Search
  searchKey = 'search', placeholder = 'Search...',
  // Sort
  sortDefs = [], sortKey, sortDir = 'desc', onSortChange,
  // Saved views
  page,
  // Count
  totalCount, filteredCount,
  // Extra buttons
  extra,
}) {
  const [panelOpen,    setPanelOpen]    = useState(false) // advanced panel
  const [panelTab,     setPanelTab]     = useState('quick') // 'quick' | 'advanced' | 'saved'
  const [advancedRules,setAdvancedRules]= useState({ mode:'AND', rules:[] })
  const panelRef = useRef(null)
  useClickOutside(panelRef, () => setPanelOpen(false))

  // Count active filters (excluding search)
  const activeCount = definitions.filter(def => {
    const v = filters[def.key]
    return Array.isArray(v) ? v.length > 0 : (v !== '' && v !== null && v !== undefined)
  }).length

  // Active chips for display
  const activeChips = definitions.flatMap(def => {
    const v = filters[def.key]
    const vals = Array.isArray(v) ? v : (v ? [v] : [])
    return vals.map(val => ({
      key: def.key,
      label: def.label + ': ' + (def.options?.find(o=>o.value===val)?.label || val),
      color: def.options?.find(o=>o.value===val)?.color || '#CC2200',
    }))
  })

  function clearAll() {
    const reset = { [searchKey]: '' }
    definitions.forEach(d => { reset[d.key] = d.multiSelect ? [] : '' })
    onChange(reset)
    setAdvancedRules({ mode:'AND', rules:[] })
  }

  function applyAdvanced() {
    // Convert advanced rules to filters object
    const next = { ...filters }
    advancedRules.rules.forEach(rule => {
      const def = definitions.find(d => d.key === rule.key)
      if (!rule.value) return
      if (def?.multiSelect) {
        next[rule.key] = [rule.value]
      } else if (rule.op === 'contains' || rule.op === 'starts') {
        next[searchKey] = rule.value // fallback to search
      } else {
        next[rule.key] = rule.op === 'is_not' ? ('!' + rule.value) : rule.value
      }
    })
    onChange(next)
    setPanelOpen(false)
  }

  const hasSearch = !!filters[searchKey]
  const hasFilters = activeCount > 0 || hasSearch

  return (
    <div style={{ marginBottom:12 }}>
      {/* ── SINGLE COMPACT ROW ── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'nowrap' }}>

        {/* Search */}
        <div style={{ display:'flex', alignItems:'center', flex:1, minWidth:0,
          maxWidth:280, gap:6, padding:'6px 10px', borderRadius:8,
          border:'1px solid var(--border)', background:'var(--inp)' }}>
          <span style={{ fontSize:13, color:'var(--muted)', flexShrink:0 }}>🔍</span>
          <input value={filters[searchKey] || ''}
            onChange={e => onChange({ ...filters, [searchKey]: e.target.value })}
            placeholder={placeholder}
            style={{ flex:1, background:'transparent', border:'none', outline:'none',
              fontSize:12, color:'var(--text)', fontFamily:ff, minWidth:0 }} />
          {hasSearch && (
            <button onClick={() => onChange({ ...filters, [searchKey]:'' })}
              style={{ background:'none', border:'none', cursor:'pointer',
                color:'var(--muted)', fontSize:15, padding:0, lineHeight:1, flexShrink:0 }}>
              ×
            </button>
          )}
        </div>

        {/* Quick filter pills — top 3 most common */}
        {definitions.slice(0, 3).map(def => (
          <QuickDrop key={def.key} def={def}
            value={filters[def.key]}
            onChange={(k,v) => onChange({ ...filters, [k]:v })} />
        ))}

        {/* Filter button — opens panel for more */}
        <div ref={panelRef} style={{ position:'relative', flexShrink:0 }}>
          <button onClick={() => setPanelOpen(o => !o)}
            style={{ display:'flex', alignItems:'center', gap:5,
              padding:'5px 11px', borderRadius:7, cursor:'pointer', fontFamily:ff,
              border:'1.5px solid ' + (activeCount > 0 ? '#CC2200' : 'var(--border)'),
              background: activeCount > 0 ? 'rgba(204,34,0,.07)' : 'var(--inp)',
              color: activeCount > 0 ? '#CC2200' : 'var(--text)',
              fontSize:12, fontWeight: activeCount > 0 ? 700 : 400 }}>
            <span style={{ fontSize:13 }}>⚡</span>
            Filter
            {activeCount > 0 && (
              <span style={{ background:'#CC2200', color:'#fff', borderRadius:99,
                padding:'1px 6px', fontSize:10, fontWeight:800 }}>
                {activeCount}
              </span>
            )}
            <span style={{ fontSize:9, opacity:.4 }}>{panelOpen ? '▲' : '▼'}</span>
          </button>

          {/* Panel */}
          {panelOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:400,
              background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12,
              boxShadow:'0 12px 40px rgba(0,0,0,.2)', minWidth:360, maxWidth:440 }}>

              {/* Panel tabs */}
              <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
                {[['quick','⚡ Quick'],['advanced','🔧 Advanced'],['saved','📌 Saved']].map(([id,label]) => (
                  <button key={id} onClick={() => setPanelTab(id)}
                    style={{ flex:1, padding:'9px', border:'none', background:'none',
                      cursor:'pointer', fontFamily:ff, fontSize:11, fontWeight:panelTab===id?700:400,
                      color:panelTab===id?'var(--text)':'var(--muted)',
                      borderBottom:panelTab===id?'2px solid #CC2200':'2px solid transparent',
                      marginBottom:'-1px' }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* QUICK TAB — all remaining fields as quick-select */}
              {panelTab === 'quick' && (
                <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                  {definitions.map(def => (
                    <div key={def.key}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)',
                        textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>
                        {def.label}
                      </div>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        {def.options?.map(opt => {
                          const selected = Array.isArray(filters[def.key])
                            ? filters[def.key].includes(opt.value)
                            : filters[def.key] === opt.value
                          return (
                            <button key={opt.value}
                              onClick={() => {
                                const cur = Array.isArray(filters[def.key]) ? filters[def.key] : (filters[def.key] ? [filters[def.key]] : [])
                                const next = selected ? cur.filter(v=>v!==opt.value) : [...cur, opt.value]
                                onChange({ ...filters, [def.key]: def.multiSelect ? next : (selected ? '' : opt.value) })
                              }}
                              style={{ padding:'4px 11px', borderRadius:99, cursor:'pointer', fontFamily:ff,
                                border:'1px solid ' + (selected ? (opt.color||'#CC2200') : 'var(--border)'),
                                background: selected ? (opt.color||'#CC2200') + '18' : 'var(--dim)',
                                color: selected ? (opt.color||'#CC2200') : 'var(--muted)',
                                fontSize:11, fontWeight: selected ? 700 : 400 }}>
                              {opt.color && (
                                <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%',
                                  background:opt.color, marginRight:4, verticalAlign:'middle' }} />
                              )}
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {hasFilters && (
                    <button onClick={clearAll}
                      style={{ padding:'6px', borderRadius:7, border:'1px solid #DC2626',
                        background:'rgba(220,38,38,.06)', color:'#DC2626',
                        fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              {/* ADVANCED TAB — AND/OR builder */}
              {panelTab === 'advanced' && (
                <div>
                  <AdvancedBuilder definitions={definitions} rules={advancedRules.rules}
                    onChange={setAdvancedRules} />
                  <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)',
                    display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button onClick={() => setAdvancedRules({ mode:'AND', rules:[] })}
                      style={{ padding:'6px 14px', borderRadius:7, border:'1px solid var(--border)',
                        background:'transparent', color:'var(--muted)', fontSize:11,
                        cursor:'pointer', fontFamily:ff }}>
                      Reset
                    </button>
                    <button onClick={applyAdvanced}
                      style={{ padding:'6px 16px', borderRadius:7, border:'none',
                        background:'#CC2200', color:'#fff', fontSize:11,
                        fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                      Apply
                    </button>
                  </div>
                </div>
              )}

              {/* SAVED VIEWS TAB */}
              {panelTab === 'saved' && page && (
                <SavedViewsPanel page={page} currentFilters={filters}
                  onApply={f => { onChange(f); setPanelOpen(false) }} />
              )}
            </div>
          )}
        </div>

        {/* Sort */}
        {sortDefs.length > 0 && onSortChange && (
          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
            <select value={sortKey||''} onChange={e => onSortChange(e.target.value, sortDir)}
              style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)',
                background:'var(--inp)', color:'var(--text)', fontSize:11, fontFamily:ff }}>
              {sortDefs.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => onSortChange(sortKey, sortDir==='asc'?'desc':'asc')}
              style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)',
                background:'var(--inp)', color:'var(--text)', fontSize:13, cursor:'pointer' }}>
              {sortDir==='asc'?'↑':'↓'}
            </button>
          </div>
        )}

        {extra}

        <div style={{ flex:1, minWidth:0 }} />

        {/* Count */}
        {totalCount !== undefined && (
          <span style={{ fontSize:11, color:'var(--muted)', flexShrink:0, whiteSpace:'nowrap' }}>
            {filteredCount !== undefined && filteredCount !== totalCount
              ? filteredCount.toLocaleString() + ' / ' + totalCount.toLocaleString()
              : totalCount.toLocaleString()}
          </span>
        )}

        {/* Clear all — only when active */}
        {hasFilters && (
          <button onClick={clearAll}
            style={{ padding:'4px 9px', borderRadius:7,
              border:'1px solid #DC2626', background:'rgba(220,38,38,.06)',
              color:'#DC2626', fontSize:11, fontWeight:700,
              cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
            Clear
          </button>
        )}
      </div>

      {/* Active chips — shown below bar, compact */}
      {activeChips.length > 0 && (
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:6, alignItems:'center' }}>
          {activeChips.map(chip => (
            <ActiveChip key={chip.key + chip.label} label={chip.label} color={chip.color}
              onRemove={() => {
                const def = definitions.find(d => d.key === chip.key)
                const cur = filters[chip.key]
                const val = chip.label.split(': ')[1]
                const optVal = def?.options?.find(o => o.label === val)?.value || val
                const next = Array.isArray(cur)
                  ? cur.filter(v => v !== optVal)
                  : ''
                onChange({ ...filters, [chip.key]: next })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FilterBar
