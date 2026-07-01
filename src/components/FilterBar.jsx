// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — FilterBar Component
// Reusable horizontal filter bar with:
//   - Search input
//   - Multi-select dropdowns
//   - Date range picker
//   - Saved filter presets (per-page, per-agent)
//   - Active filter chips with clear
//   - Sort control
// Props:
//   page         — 'contacts'|'listings'|'tasks'|'calls'|'production'
//   filters      — current filter object
//   onChange     — fn(newFilters)
//   definitions  — array of filter defs (see below)
//   onSortChange — fn(key, dir)
//   sortKey / sortDir
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── FILTER CHIPS ──────────────────────────────────────────────────
function Chip({ label, onRemove, color = 'var(--brand)' }) {
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px 3px 10px', borderRadius:99, background:color+'18', border:'1px solid '+color+'44', fontSize:11, fontWeight:700, color, flexShrink:0 }}>
      {label}
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color, fontSize:13, lineHeight:1, padding:0, marginLeft:2, opacity:.7 }}>×</button>
    </div>
  )
}

// ── DROPDOWN FILTER ───────────────────────────────────────────────
function DropFilter({ def, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = Array.isArray(value) ? value : (value ? [value] : [])
  const label    = selected.length === 0
    ? def.label
    : selected.length === 1
      ? (def.options.find(o => o.value === selected[0])?.label || selected[0])
      : selected.length + ' ' + def.label + 's'

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1px solid '+(selected.length?'var(--brand)':'var(--border)'), background:selected.length?'rgba(204,34,0,.06)':'var(--inp)', color:selected.length?'var(--brand)':'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap' }}>
        {def.icon && <span style={{ fontSize:14 }}>{def.icon}</span>}
        {label}
        {selected.length > 0 && <span style={{ background:'var(--brand)', color:'#fff', borderRadius:'50%', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800 }}>{selected.length}</span>}
        <span style={{ fontSize:10, opacity:.5 }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, zIndex:100, marginTop:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,.15)', minWidth:180, maxHeight:280, overflowY:'auto' }}>
          {def.multiSelect && selected.length > 0 && (
            <button onClick={() => { onChange(def.key, []); setOpen(false) }}
              style={{ width:'100%', textAlign:'left', padding:'8px 14px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', fontSize:11, color:'#DC2626', fontWeight:700, fontFamily:ff }}>
              Clear all
            </button>
          )}
          {def.options.map(opt => {
            const isSelected = selected.includes(opt.value)
            return (
              <button key={opt.value}
                onClick={() => {
                  if (def.multiSelect) {
                    const next = isSelected ? selected.filter(v => v !== opt.value) : [...selected, opt.value]
                    onChange(def.key, next)
                  } else {
                    onChange(def.key, isSelected ? '' : opt.value)
                    setOpen(false)
                  }
                }}
                style={{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', padding:'9px 14px', background:isSelected?'rgba(204,34,0,.06)':'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:isSelected?700:400, color:isSelected?'var(--brand)':'var(--text)', fontFamily:ff }}>
                {def.multiSelect && (
                  <div style={{ width:14, height:14, borderRadius:3, border:'1.5px solid '+(isSelected?'var(--brand)':'var(--border)'), background:isSelected?'var(--brand)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {isSelected && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                  </div>
                )}
                {opt.icon && <span style={{ fontSize:14 }}>{opt.icon}</span>}
                {opt.color && <div style={{ width:10, height:10, borderRadius:'50%', background:opt.color, flexShrink:0 }} />}
                <span style={{ flex:1 }}>{opt.label}</span>
                {opt.count !== undefined && <span style={{ fontSize:10, color:'var(--muted)' }}>{opt.count}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DATE RANGE FILTER ─────────────────────────────────────────────
function DateFilter({ def, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const PRESETS = [
    { label:'Today',        fn:() => { const t=new Date().toISOString().slice(0,10); return [t,t] } },
    { label:'This week',    fn:() => { const n=new Date(); const d=n.getDay(); const mon=new Date(n); mon.setDate(n.getDate()-d+1); const sun=new Date(mon); sun.setDate(mon.getDate()+6); return [mon.toISOString().slice(0,10),sun.toISOString().slice(0,10)] } },
    { label:'This month',   fn:() => { const n=new Date(); return [n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-01', n.toISOString().slice(0,10)] } },
    { label:'Last 30 days', fn:() => { const e=new Date(); const s=new Date(e); s.setDate(s.getDate()-30); return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)] } },
    { label:'Last 90 days', fn:() => { const e=new Date(); const s=new Date(e); s.setDate(s.getDate()-90); return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)] } },
    { label:'This year',    fn:() => { const n=new Date(); return [n.getFullYear()+'-01-01', n.toISOString().slice(0,10)] } },
    { label:'Last year',    fn:() => { const y=new Date().getFullYear()-1; return [y+'-01-01', y+'-12-31'] } },
  ]

  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const from = value?.from || '', to = value?.to || ''
  const hasVal = from || to
  const label = hasVal ? (from === to ? from : from + ' – ' + to) : def.label

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1px solid '+(hasVal?'var(--brand)':'var(--border)'), background:hasVal?'rgba(204,34,0,.06)':'var(--inp)', color:hasVal?'var(--brand)':'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff, whiteSpace:'nowrap' }}>
        📅 {label}
        {hasVal && <span style={{ fontSize:10, opacity:.6, marginLeft:2 }}>▼</span>}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, zIndex:100, marginTop:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,.15)', minWidth:260 }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Custom Range</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="date" value={from} onChange={e => onChange(def.key, { from:e.target.value, to })}
                style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} />
              <span style={{ color:'var(--muted)', fontSize:11 }}>to</span>
              <input type="date" value={to} onChange={e => onChange(def.key, { from, to:e.target.value })}
                style={{ flex:1, padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} />
            </div>
          </div>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { const [f,t]=p.fn(); onChange(def.key,{from:f,to:t}); setOpen(false) }}
              style={{ display:'block', width:'100%', textAlign:'left', padding:'9px 14px', background:'none', border:'none', borderBottom:'1px solid var(--border)', cursor:'pointer', fontSize:12, color:'var(--text)', fontFamily:ff }}>
              {p.label}
            </button>
          ))}
          {hasVal && (
            <button onClick={() => { onChange(def.key, {}); setOpen(false) }}
              style={{ display:'block', width:'100%', textAlign:'left', padding:'9px 14px', background:'none', border:'none', cursor:'pointer', fontSize:11, color:'#DC2626', fontWeight:700, fontFamily:ff }}>
              Clear date filter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── SAVED VIEWS ───────────────────────────────────────────────────
function SavedViews({ page, currentFilters, onApply }) {
  const { agent } = useAuth()
  const [views, setViews] = useState([])
  const [open, setOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => { load() }, [agent?.id, page])
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function load() {
    if (!agent?.id) return
    try {
      const { data } = await supabase.from('briefing_prefs').select('saved_views').eq('agent_id', agent.id).maybeSingle()
      const all = data?.saved_views || {}
      setViews(all[page] || [])
    } catch {}
  }

  async function saveView() {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      const { data: existing } = await supabase.from('briefing_prefs').select('saved_views').eq('agent_id', agent.id).maybeSingle()
      const all = existing?.saved_views || {}
      const pageViews = all[page] || []
      const newView = { id: Date.now().toString(), name: saveName.trim(), filters: currentFilters, created: new Date().toISOString() }
      all[page] = [...pageViews.filter(v => v.name !== saveName.trim()), newView]
      await supabase.from('briefing_prefs').upsert({ agent_id: agent.id, saved_views: all, updated_at: new Date().toISOString() }, { onConflict:'agent_id' })
      setViews(all[page])
      setSaveName('')
    } catch(e) { console.warn('saveView:', e.message) }
    finally { setSaving(false) }
  }

  async function deleteView(id) {
    try {
      const { data: existing } = await supabase.from('briefing_prefs').select('saved_views').eq('agent_id', agent.id).maybeSingle()
      const all = existing?.saved_views || {}
      all[page] = (all[page] || []).filter(v => v.id !== id)
      await supabase.from('briefing_prefs').update({ saved_views: all }).eq('agent_id', agent.id)
      setViews(all[page])
    } catch {}
  }

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
        🔖 {views.length > 0 ? 'Saved ('+views.length+')' : 'Save View'}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', right:0, zIndex:100, marginTop:4, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 32px rgba(0,0,0,.15)', minWidth:240 }}>
          {views.length > 0 && (
            <div style={{ padding:'8px 0' }}>
              {views.map(v => (
                <div key={v.id} style={{ display:'flex', alignItems:'center', padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>
                  <button onClick={() => { onApply(v.filters); setOpen(false) }}
                    style={{ flex:1, textAlign:'left', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, color:'var(--text)', fontFamily:ff }}>
                    {v.name}
                  </button>
                  <button onClick={() => deleteView(v.id)}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:14 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding:'10px 12px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Save current filters</div>
            <div style={{ display:'flex', gap:6 }}>
              <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="View name..." onKeyDown={e => e.key==='Enter'&&saveView()}
                style={{ flex:1, padding:'6px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }} />
              <button onClick={saveView} disabled={saving||!saveName.trim()}
                style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'var(--brand)', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity:saveName.trim()?1:.5 }}>
                {saving?'…':'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MAIN FILTERBAR ────────────────────────────────────────────────
export function FilterBar({ page, definitions = [], filters = {}, onChange, searchKey = 'search', placeholder = 'Search...', extra = null, sortDefs = [], sortKey, sortDir, onSortChange, totalCount, filteredCount }) {
  const activeFilters = []
  for (const def of definitions) {
    const val = filters[def.key]
    if (!val || (Array.isArray(val) && val.length === 0)) continue
    if (typeof val === 'object' && !Array.isArray(val) && !val.from && !val.to) continue
    const label = typeof val === 'string'
      ? (def.options?.find(o => o.value === val)?.label || val)
      : Array.isArray(val)
        ? val.map(v => def.options?.find(o => o.value === v)?.label || v).join(', ')
        : (val.from === val.to ? val.from : val.from + '–' + val.to)
    activeFilters.push({ key: def.key, label: def.label + ': ' + label, color: def.color || 'var(--brand)' })
  }

  const hasActiveFilters = activeFilters.length > 0 || filters[searchKey]

  function clearAll() {
    const cleared = { [searchKey]: '' }
    definitions.forEach(d => {
      cleared[d.key] = d.type === 'date' ? {} : d.multiSelect ? [] : ''
    })
    onChange(cleared)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
      {/* Main filter row */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* Search */}
        <div style={{ display:'flex', alignItems:'center', flex:1, minWidth:200, maxWidth:320, gap:8, padding:'6px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--inp)' }}>
          <span style={{ fontSize:14, color:'var(--muted)', flexShrink:0 }}>🔍</span>
          <input
            value={filters[searchKey] || ''}
            onChange={e => onChange({ ...filters, [searchKey]: e.target.value })}
            placeholder={placeholder}
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:13, color:'var(--text)', fontFamily:ff }}
          />
          {filters[searchKey] && (
            <button onClick={() => onChange({ ...filters, [searchKey]:'' })} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:16, padding:0 }}>×</button>
          )}
        </div>

        {/* Filter dropdowns */}
        {definitions.filter(d => d.type !== 'date').map(def => (
          <DropFilter key={def.key} def={def} value={filters[def.key]} onChange={(k,v) => onChange({ ...filters, [k]:v })} />
        ))}

        {/* Date filters */}
        {definitions.filter(d => d.type === 'date').map(def => (
          <DateFilter key={def.key} def={def} value={filters[def.key]} onChange={(k,v) => onChange({ ...filters, [k]:v })} />
        ))}

        {/* Sort */}
        {sortDefs.length > 0 && onSortChange && (
          <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
            <select value={sortKey||''} onChange={e => onSortChange(e.target.value, sortDir)}
              style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
              {sortDefs.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={() => onSortChange(sortKey, sortDir==='asc'?'desc':'asc')}
              style={{ padding:'6px 9px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, cursor:'pointer' }}>
              {sortDir==='asc'?'↑':'↓'}
            </button>
          </div>
        )}

        {extra}

        <div style={{ flex:1 }} />

        {/* Saved views */}
        {page && <SavedViews page={page} currentFilters={filters} onApply={onChange} />}

        {/* Count */}
        {totalCount !== undefined && (
          <div style={{ fontSize:11, color:'var(--muted)', flexShrink:0, whiteSpace:'nowrap' }}>
            {filteredCount !== undefined && filteredCount !== totalCount
              ? filteredCount + ' of ' + totalCount
              : totalCount
            } result{totalCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Clear all */}
        {hasActiveFilters && (
          <button onClick={clearAll}
            style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #DC2626', background:'rgba(220,38,38,.06)', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', flexShrink:0 }}>Active:</span>
          {activeFilters.map(f => (
            <Chip key={f.key} label={f.label} color={f.color}
              onRemove={() => {
                const def = definitions.find(d => d.key === f.key)
                onChange({ ...filters, [f.key]: def?.type==='date'?{}:def?.multiSelect?[]:"" })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FilterBar
