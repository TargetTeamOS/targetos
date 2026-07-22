import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Matches the Production Board's Monday-inspired tokens (kept consistent, not a new identity).
const ff = 'Inter, system-ui, -apple-system, sans-serif'
const C = {
  blue:'#0073EA', green:'#00C875', purple:'#A25DDC', orange:'#FDAB3D', pink:'#E2445C',
  teal:'#00D2D2', darkGreen:'#037f4c', text:'#323338', sub:'#676879', page:'#F5F6F8',
  border:'#D0D4E4', hover:'#F0F3FF',
}
const COLORS = [C.blue, C.green, C.darkGreen, C.orange, C.pink, C.purple, C.teal]

const METRICS = [
  { value:'count',    label:'Count of deals' },
  { value:'sum',      label:'Sum of a field' },
  { value:'avg',      label:'Average of a field' },
  { value:'progress', label:'Deal-count goal progress' },
]
const FIELDS = [
  { value:'production',    label:'Production' },
  { value:'gci',           label:'GCI' },
  { value:'expected_gci',  label:'Expected GCI' },
  { value:'collected_gci', label:'Collected GCI' },
  { value:'pipeline_gci',  label:'Pipeline GCI' },
]
const DATE_MODES = [
  { value:'board_range',   label:'Production Board date range', needsYear:true },
  { value:'current_year',  label:'Current year',                needsYear:false },
  { value:'ytd',           label:'Year to date',                needsYear:false },
  { value:'current_month', label:'Current month',               needsYear:false },
  { value:'all_time',      label:'All time',                    needsYear:true },
  { value:'custom',        label:'Custom range',                needsYear:true },
]
const DATE_FIELDS = [
  { value:'ao_date',             label:'Accepted-offer date' },
  { value:'contract_date',       label:'Contract date' },
  { value:'expected_close_date', label:'Expected-close date' },
  { value:'close_date',          label:'Close date' },
]
const FORMATS = [
  { value:'whole',            label:'Whole number' },
  { value:'currency',         label:'Currency' },
  { value:'full_currency',    label:'Full currency' },
  { value:'compact_currency', label:'Compact currency ($1.4M)' },
  { value:'percent',          label:'Percent' },
]
const BOOL_FILTERS = [
  { key:'official_closed', label:'Official Closed' },
  { key:'active_pipeline', label:'Active Pipeline' },
]
const TEXT_FILTERS = [
  { key:'stage',         label:'Stage' },
  { key:'deal_status',   label:'Deal Status' },
  { key:'side',          label:'Side' },
  { key:'sale_type',     label:'Sale Type' },
  { key:'property_type', label:'Property Type' },
]

let nextTmp = 1
function blankWidget(position) {
  return {
    id: null, _tmp: 'tmp_' + (nextTmp++), position,
    title: 'New Widget', subtitle: '', metric: 'count', field: null,
    filters: {}, date_mode: 'current_year', date_field: 'close_date',
    custom_from: null, custom_to: null, format: 'whole', color: C.blue,
    goal_type: null, goal_value: null, goal_year: null, visible: true, scope: 'team',
  }
}

export function ProductionWidgetEditor({ boardFrom, boardTo, onClose, onSaved }) {
  const [items, setItems] = useState(null)   // null=loading
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState({})  // keyed by _tmp/id → computed value/error
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setErr('')
    try {
      const { data, error } = await supabase.rpc('app_get_production_widgets')
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      const arr = (Array.isArray(data) ? data : []).map((w, i) => ({ ...blankWidget(i), ...w, _tmp: 'srv_' + (w.id || i) }))
      arr.sort((a, b) => a.position - b.position)
      setItems(arr)
    } catch (e) { setErr(e.message || 'Failed to load widgets'); setItems([]) }
  }

  function keyOf(w) { return w.id || w._tmp }
  function update(idx, patch) {
    setItems(prev => prev.map((w, i) => i === idx ? { ...w, ...patch } : w))
  }
  function setFilter(idx, key, on, value) {
    setItems(prev => prev.map((w, i) => {
      if (i !== idx) return w
      const f = { ...(w.filters || {}) }
      if (!on) delete f[key]
      else f[key] = value === undefined ? true : value
      return { ...w, filters: f }
    }))
  }
  function addWidget()   { setItems(prev => [...prev, blankWidget(prev.length)]) }
  function duplicate(idx){ setItems(prev => { const c = { ...prev[idx], id: null, _tmp: 'tmp_' + (nextTmp++), title: prev[idx].title + ' (copy)' }; const n = [...prev]; n.splice(idx + 1, 0, c); return n.map((w, i) => ({ ...w, position: i })) }) }
  function remove(idx)   { setItems(prev => prev.filter((_, i) => i !== idx).map((w, i) => ({ ...w, position: i }))) }
  function move(idx, dir){ setItems(prev => { const n = [...prev]; const j = idx + dir; if (j < 0 || j >= n.length) return prev;[n[idx], n[j]] = [n[j], n[idx]]; return n.map((w, i) => ({ ...w, position: i })) }) }

  // Build the config array the RPCs accept (strip UI-only keys, normalize).
  function toConfig() {
    return items.map((w, i) => {
      const out = {
        position: i, title: (w.title || '').trim(), metric: w.metric,
        date_mode: w.date_mode, date_field: w.date_field, format: w.format,
        color: w.color, visible: w.visible !== false, scope: 'team',
        filters: w.filters || {},
      }
      if (w.id) out.id = w.id
      if (w.subtitle) out.subtitle = w.subtitle
      if (w.metric === 'sum' || w.metric === 'avg') out.field = w.field || null
      if (w.metric === 'progress') {
        out.goal_type = w.goal_type || 'team_goal'
        if (out.goal_type === 'custom') out.goal_value = Number(w.goal_value) || null
        if (w.goal_year) out.goal_year = Number(w.goal_year)
      }
      if (w.date_mode === 'custom') { out.custom_from = w.custom_from; out.custom_to = w.custom_to }
      return out
    })
  }

  async function doPreview() {
    setPreviewing(true); setErr('')
    try {
      const { data, error } = await supabase.rpc('app_preview_production_widgets', { config: toConfig(), board_from: boardFrom, board_to: boardTo })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      const map = {}
      ;(data || []).forEach(r => { map[r.position] = r })
      setPreview(map)
    } catch (e) { setErr('Preview: ' + (e.message || 'failed')) }
    finally { setPreviewing(false) }
  }

  async function save() {
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.rpc('app_save_production_widgets', { config: toConfig() })
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      onSaved?.()
    } catch (e) { setErr('Save: ' + (e.message || 'failed')) }
    finally { setBusy(false) }
  }

  async function reset() {
    if (!window.confirm('Reset to the default widgets? This replaces the current shared configuration.')) return
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.rpc('app_reset_production_widgets')
      if (error) throw error
      if (data && data.error) throw new Error(data.error)
      await load()
    } catch (e) { setErr('Reset: ' + (e.message || 'failed')) }
    finally { setBusy(false) }
  }

  const lbl = { fontSize: 11, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3, display: 'block' }
  const inp = { width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid ' + C.border, fontSize: 13, fontFamily: ff, color: C.text, boxSizing: 'border-box', background: '#fff' }
  const chip = on => ({ padding: '5px 10px', borderRadius: 7, border: '1px solid ' + (on ? C.blue : C.border), background: on ? C.hover : '#fff', color: on ? C.blue : C.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: ff })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.28)' }} />
      <div style={{ position: 'relative', width: 'min(560px, 100%)', height: '100%', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.14)', display: 'flex', flexDirection: 'column', fontFamily: ff }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Edit Widgets</div>
          <div style={{ fontSize: 12, color: C.sub }}>Shared team overview — everyone sees these</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.sub, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {err && <div style={{ background: '#FEF2F2', border: '1px solid #E2445C55', color: '#B42318', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>{err}</div>}
          {items === null ? (
            <div style={{ color: C.sub, fontSize: 13, padding: 20, textAlign: 'center' }}>Loading widgets…</div>
          ) : items.length === 0 ? (
            <div style={{ color: C.sub, fontSize: 13, padding: 20, textAlign: 'center' }}>No widgets yet. Add one to get started.</div>
          ) : items.map((w, idx) => {
            const dm = DATE_MODES.find(d => d.value === w.date_mode)
            const needsField = w.metric === 'sum' || w.metric === 'avg'
            const isProgress = w.metric === 'progress'
            const pv = preview[idx]
            return (
              <div key={keyOf(w)} style={{ border: '1px solid ' + C.border, borderRadius: 10, padding: 12, marginBottom: 12, borderLeft: '4px solid ' + (w.color || C.blue), opacity: w.visible === false ? .6 : 1 }}>
                {/* Row header: reorder + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>#{idx + 1}</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up" style={{ ...chip(false), padding: '3px 7px', opacity: idx === 0 ? .4 : 1 }}>↑</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} title="Move down" style={{ ...chip(false), padding: '3px 7px', opacity: idx === items.length - 1 ? .4 : 1 }}>↓</button>
                  <button onClick={() => update(idx, { visible: w.visible === false })} title={w.visible === false ? 'Show' : 'Hide'} style={chip(false)}>{w.visible === false ? '🙈 Hidden' : '👁 Visible'}</button>
                  <button onClick={() => duplicate(idx)} title="Duplicate" style={chip(false)}>⧉</button>
                  <button onClick={() => remove(idx)} title="Delete" style={{ ...chip(false), color: C.pink, borderColor: C.pink + '55' }}>🗑</button>
                </div>

                {/* Title + subtitle */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div><label style={lbl}>Title</label><input value={w.title} maxLength={40} onChange={e => update(idx, { title: e.target.value })} style={inp} /></div>
                  <div><label style={lbl}>Subtitle</label><input value={w.subtitle || ''} maxLength={60} onChange={e => update(idx, { subtitle: e.target.value })} style={inp} /></div>
                </div>

                {/* Metric + field */}
                <div style={{ display: 'grid', gridTemplateColumns: needsField ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={lbl}>Metric</label>
                    <select value={w.metric} onChange={e => {
                      const m = e.target.value
                      const patch = { metric: m }
                      if (m === 'count' || m === 'progress') patch.field = null
                      if (m === 'progress' && !w.goal_type) patch.goal_type = 'team_goal'
                      update(idx, patch)
                    }} style={inp}>
                      {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  {needsField && (
                    <div>
                      <label style={lbl}>Field</label>
                      <select value={w.field || ''} onChange={e => {
                        const f = e.target.value
                        const patch = { field: f }
                        if (f === 'pipeline_gci') patch.filters = { ...(w.filters || {}), active_pipeline: true }  // auto-require
                        update(idx, patch)
                      }} style={inp}>
                        <option value="">Select…</option>
                        {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                {needsField && w.field === 'pipeline_gci' && (
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>Pipeline GCI automatically requires Active Pipeline = true.</div>
                )}

                {/* Goal progress */}
                {isProgress && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={lbl}>Goal source</label>
                      <select value={w.goal_type || 'team_goal'} onChange={e => update(idx, { goal_type: e.target.value })} style={inp}>
                        <option value="team_goal">Official team goal</option>
                        <option value="custom">Custom target</option>
                      </select>
                    </div>
                    {w.goal_type === 'custom' ? (
                      <div><label style={lbl}>Target</label><input type="number" min="1" value={w.goal_value || ''} onChange={e => update(idx, { goal_value: e.target.value })} style={inp} /></div>
                    ) : (
                      <div><label style={lbl}>Goal year {dm?.needsYear ? '(required)' : '(auto)'}</label><input type="number" min="2000" max="2100" placeholder={dm?.needsYear ? 'e.g. 2026' : 'auto'} value={w.goal_year || ''} onChange={e => update(idx, { goal_year: e.target.value })} style={inp} /></div>
                    )}
                  </div>
                )}

                {/* Date mode + field */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={lbl}>Date mode</label>
                    <select value={w.date_mode} onChange={e => update(idx, { date_mode: e.target.value })} style={inp}>
                      {DATE_MODES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Date field</label>
                    <select value={w.date_field} onChange={e => update(idx, { date_field: e.target.value })} style={inp}>
                      {DATE_FIELDS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                </div>
                {w.date_mode === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div><label style={lbl}>From</label><input type="date" value={w.custom_from || ''} onChange={e => update(idx, { custom_from: e.target.value })} style={inp} /></div>
                    <div><label style={lbl}>To (inclusive)</label><input type="date" value={w.custom_to || ''} onChange={e => update(idx, { custom_to: e.target.value })} style={inp} /></div>
                  </div>
                )}

                {/* Filters */}
                <label style={lbl}>Filters</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {BOOL_FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(idx, f.key, !(w.filters || {})[f.key], true)}
                      disabled={f.key === 'active_pipeline' && w.field === 'pipeline_gci'}
                      style={chip(!!(w.filters || {})[f.key])}>{f.label}</button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  {TEXT_FILTERS.map(f => (
                    <div key={f.key}>
                      <input placeholder={f.label} value={(w.filters || {})[f.key] || ''}
                        onChange={e => setFilter(idx, f.key, !!e.target.value, e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} />
                    </div>
                  ))}
                </div>

                {/* Format + color */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <label style={lbl}>Number format</label>
                    <select value={w.format} onChange={e => update(idx, { format: e.target.value })} style={inp}>
                      {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Color</label>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {COLORS.map(c => (
                        <button key={c} onClick={() => update(idx, { color: c })} title={c}
                          style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: w.color === c ? '2px solid ' + C.text : '2px solid #fff', boxShadow: '0 0 0 1px ' + C.border, cursor: 'pointer' }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Preview value */}
                {pv && (
                  <div style={{ marginTop: 8, fontSize: 12, color: pv.error ? C.pink : C.sub }}>
                    Preview: <strong style={{ color: pv.error ? C.pink : C.text }}>{pv.error ? 'unavailable' : String(pv.value)}</strong>
                    {pv.goal != null && !pv.error && <span> / {String(pv.goal)} ({pv.progress_pct ?? 0}%)</span>}
                  </div>
                )}
              </div>
            )
          })}

          {items !== null && (
            <button onClick={addWidget} style={{ width: '100%', padding: '9px', borderRadius: 8, border: '1px dashed ' + C.blue, background: C.hover, color: C.blue, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>+ Add Widget</button>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid ' + C.border, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={reset} disabled={busy} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: '#fff', color: C.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>Reset to defaults</button>
          <button onClick={doPreview} disabled={previewing || !items?.length} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: '#fff', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>{previewing ? 'Previewing…' : 'Preview'}</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.sub, fontSize: 13, cursor: 'pointer', fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
