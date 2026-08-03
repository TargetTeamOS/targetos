// CustomWidgetsSection — renders the admin-built production widgets. Values come
// from app_production_widget_values (live) once the engine migration is applied.
// Admins manage the collection through the validated, audited full-replace save
// RPC (app_save_production_widgets) — the frontend only ever uses the user
// session, never a service key. Until the engine is deployed the section shows a
// clearly-labelled sample gallery and every persist action is disabled.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { WidgetBuilder } from './WidgetBuilder'
import { newWidgetForm, toEngineConfig, formatValue, MAX_WIDGETS, METRICS, FIELDS, DATE_MODES } from '../../lib/widgetModel'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i
const SETUP = 'Secure widget engine setup required'

function boardRange() { const now = new Date(); return { from: `${now.getFullYear()}-01-01`, to: now.toISOString().slice(0, 10) } }

function defToForm(d) {
  return { ...newWidgetForm(d.position || 0), ...d, field: d.field || '', subtitle: d.subtitle || '',
    goal_type: d.goal_type || '', goal_value: d.goal_value ?? '', goal_year: d.goal_year ?? '',
    display_type: d.metric === 'progress' ? 'progress' : 'number' }
}

function describe(f) {
  const metric = (METRICS.find((m) => m.key === f.metric) || {}).label || f.metric
  const field = f.field ? (FIELDS.find((x) => x.key === f.field) || {}).label : null
  const range = (DATE_MODES.find((d) => d.key === f.date_mode) || {}).label || f.date_mode
  const filt = Object.entries(f.filters || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k.replace('_', ' ')}=${v}`)
  return `${metric}${field ? ' of ' + field : ''} · ${range}${filt.length ? ' · ' + filt.join(', ') : ''}. Record-level drill-down arrives with the engine extension.`
}

const SAMPLES = [
  { title: 'Closed deals', subtitle: 'This year', value: 128, color: '#0073EA', format: 'whole' },
  { title: 'Closed production', subtitle: 'This year', value: 42000000, color: '#037f4c', format: 'compact_currency' },
  { title: 'Pipeline production', subtitle: 'Active', value: 18500000, color: '#FDAB3D', format: 'compact_currency' },
]

export function CustomWidgetsSection() {
  const navigate = useNavigate()
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const [engineReady, setEngineReady] = useState(null) // null=loading
  const [list, setList] = useState([])                 // admin working forms
  const [values, setValues] = useState([])             // computed values (all users)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [builder, setBuilder] = useState(null)         // form being edited/created
  const [drill, setDrill] = useState(null)             // {title, explanation}

  const load = useCallback(async () => {
    setLoading(true); setSaveErr(null)
    const { from, to } = boardRange()
    try {
      const { data, error } = await supabase.rpc('app_production_widget_values', { board_from: from, board_to: to })
      if (error) { if (NOT_DEPLOYED.test(error.message || '')) { setEngineReady(false); return } throw error }
      setEngineReady(true)
      const vals = Array.isArray(data) ? data : []
      setValues(vals)
      if (isAdmin) {
        const d = await supabase.rpc('app_get_production_widgets')
        if (!d.error && Array.isArray(d.data)) setList(d.data.map(defToForm))
      } else {
        setList(vals.map((v) => ({ ...newWidgetForm(v.position || 0), id: v.id, title: v.title, subtitle: v.subtitle, color: v.color, format: v.display_format, metric: v.metric })))
      }
    } catch { setEngineReady(true); setSaveErr('Couldn’t load widgets.') } finally { setLoading(false) }
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  const valueFor = (id) => { const v = values.find((x) => x.id === id); return v && !v.error ? (v.value != null ? v.value : v.pct) : null }

  const persist = useCallback(async (newList) => {
    if (!engineReady) return
    setSaving(true); setSaveErr(null)
    try {
      const { data, error } = await supabase.rpc('app_save_production_widgets', { config: toEngineConfig(newList) })
      if (error || (data && data.error)) { setSaveErr((data && data.error) || error.message || 'Save failed.'); return }
      setBuilder(null); await load()
    } catch (e) { setSaveErr(e.message || 'Save failed.') } finally { setSaving(false) }
  }, [engineReady, load])

  const onSave = (form) => {
    const exists = form.id && list.some((w) => w.id === form.id)
    const newList = exists ? list.map((w) => (w.id === form.id ? form : w)) : [...list, form]
    persist(newList)
  }
  const duplicate = (w) => persist([...list, { ...w, id: null, title: (w.title + ' copy').slice(0, 40) }])
  const toggleHide = (w) => persist(list.map((x) => (x.id === w.id ? { ...x, visible: !(x.visible !== false) } : x)))
  const remove = (w) => persist(list.filter((x) => x.id !== w.id))
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= list.length) return; const nl = [...list]; const t = nl[i]; nl[i] = nl[j]; nl[j] = t; persist(nl) }

  const { from, to } = boardRange()
  const headerRight = isAdmin && engineReady ? (
    <button onClick={() => setBuilder(newWidgetForm(list.length))} disabled={list.length >= MAX_WIDGETS}
      style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, border: 'none', background: list.length >= MAX_WIDGETS ? '#cbd5e1' : '#0073EA', color: '#fff', cursor: list.length >= MAX_WIDGETS ? 'not-allowed' : 'pointer', fontFamily: FF }}>
      + New widget
    </button>
  ) : null

  const openDrill = (w) => setDrill({ title: w.title, explanation: describe(w) })

  return (
    <>
      <WidgetCard title="Custom widgets" accent="#579BFC" sourceLabel="Production board" dateRangeLabel="Board range"
        loading={loading && engineReady === null} error={null} headerRight={headerRight}>
        {engineReady === false ? (
          <div>
            <div role="status" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
              {SETUP} — apply <strong>production_widgets_migration</strong> to save and run custom widgets. The gallery below is a sample layout.
            </div>
            <Grid>
              {SAMPLES.map((s, i) => <StatCard key={i} title={s.title} subtitle={s.subtitle} value={s.value} color={s.color} format={s.format} sample onClick={() => {}} />)}
            </Grid>
            {isAdmin && (
              <button onClick={() => setBuilder(newWidgetForm(0))} style={{ marginTop: 12, fontSize: 12.5, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: 0 }}>
                Design a widget (preview only) →
              </button>
            )}
          </div>
        ) : list.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748b' }}>{isAdmin ? 'No custom widgets yet — add your first from “+ New widget”.' : 'No custom widgets have been published yet.'}</p>
        ) : (
          <>
            {saveErr && <p role="alert" style={{ fontSize: 12.5, color: '#b42318', margin: '0 0 8px' }}>{saveErr}</p>}
            <Grid>
              {list.map((w, i) => {
                const hidden = w.visible === false
                return (
                  <div key={w.id || i} style={{ position: 'relative', opacity: hidden ? 0.5 : 1 }}>
                    <StatCard title={w.title} subtitle={w.subtitle} value={valueFor(w.id)} color={w.color} format={w.format}
                      progress={w.metric === 'progress'} onClick={() => openDrill(w)} />
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {mini('Edit', () => setBuilder(w), saving)}
                        {mini('Duplicate', () => duplicate(w), saving || list.length >= MAX_WIDGETS)}
                        {mini(hidden ? 'Show' : 'Hide', () => toggleHide(w), saving)}
                        {mini('Delete', () => remove(w), saving)}
                        {mini('↑', () => move(i, -1), saving || i === 0)}
                        {mini('↓', () => move(i, 1), saving || i === list.length - 1)}
                      </div>
                    )}
                    {hidden && <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: '#e2e8f0', color: '#475569', borderRadius: 4, padding: '1px 5px' }}>Hidden</span>}
                  </div>
                )
              })}
            </Grid>
          </>
        )}
      </WidgetCard>

      <WidgetBuilder open={!!builder} initial={builder} engineReady={engineReady === true}
        boardFrom={from} boardTo={to} onCancel={() => setBuilder(null)} onSave={onSave} />

      <DrillDown open={!!drill} onClose={() => setDrill(null)} title={drill?.title || 'Widget'}
        explanation={drill?.explanation} sourceLabel="Production board" dateRangeLabel="Board range"
        rows={[]} recordCount={0} onNavigate={navigate} />
    </>
  )
}

function StatCard({ title, subtitle, value, color, format, sample, progress, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: 'left', width: '100%', background: '#fff', border: '1px solid #eef2f7', borderRadius: 12, padding: 14, cursor: 'pointer', fontFamily: FF, position: 'relative' }}>
      {sample && <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: '#fff4e6', color: '#9a3412', borderRadius: 4, padding: '1px 5px' }}>Sample</span>}
      {progress ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ height: 10, borderRadius: 999, background: '#eef2f7', marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: Math.max(0, Math.min(100, Number(value) || 0)) + '%', height: '100%', background: color }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{value == null ? '—' : Math.round(Number(value)) + '% to goal'}</div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 24, fontWeight: 800, color: color || '#0f172a' }}>{formatValue(value, format)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div> : null}
        </>
      )}
    </button>
  )
}

function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 4 }}>{children}</div> }
function mini(label, onClick, disabled) {
  return <button onClick={onClick} disabled={disabled} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: disabled ? '#cbd5e1' : '#475569', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FF }}>{label}</button>
}

export default CustomWidgetsSection
