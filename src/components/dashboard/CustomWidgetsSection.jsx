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
import { fmtCompactMoney, fmtExactMoney } from '../../lib/dashboardTheme'

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
                const menu = isAdmin ? [
                  { label: 'Edit', onClick: () => setBuilder(w), disabled: saving },
                  { label: 'Duplicate', onClick: () => duplicate(w), disabled: saving || list.length >= MAX_WIDGETS },
                  { label: hidden ? 'Show' : 'Hide', onClick: () => toggleHide(w), disabled: saving },
                  { label: 'Move left', onClick: () => move(i, -1), disabled: saving || i === 0 },
                  { label: 'Move right', onClick: () => move(i, 1), disabled: saving || i === list.length - 1 },
                  { label: 'Delete', onClick: () => remove(w), disabled: saving, danger: true },
                ] : null
                return (
                  <StatCard key={w.id || i} title={w.title} subtitle={w.subtitle} value={valueFor(w.id)} color={w.color} format={w.format}
                    progress={w.metric === 'progress'} hidden={hidden} menu={menu} onClick={() => openDrill(w)} />
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

function StatCard({ title, subtitle, value, color, format, sample, progress, hidden, menu, onClick }) {
  const [open, setOpen] = useState(false)
  const isMoney = /currency/.test(format || '')
  const display = progress ? (value == null ? '—' : Math.round(Number(value)) + '%')
    : isMoney ? fmtCompactMoney(value) : formatValue(value, format)
  const exact = isMoney ? fmtExactMoney(value) : (value == null ? '' : String(value))
  return (
    <div style={{ position: 'relative', background: '#fff', border: '1px solid #eef2f7', borderRadius: 12, padding: 14, opacity: hidden ? 0.55 : 1, minWidth: 0 }}>
      {sample && <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: '#fff4e6', color: '#9a3412', borderRadius: 4, padding: '1px 5px' }}>Sample</span>}
      {hidden && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, background: '#e2e8f0', color: '#475569', borderRadius: 4, padding: '1px 5px' }}>Hidden</span>}
      {menu && menu.length > 0 && (
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }} aria-label="Widget actions" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 16, lineHeight: 1, padding: 4 }}>⋯</button>
          {open && (
            <>
              <div onClick={(e) => { e.stopPropagation(); setOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 41, background: '#fff', border: '1px solid #e6eaf0', borderRadius: 10, boxShadow: '0 12px 30px rgba(16,24,40,0.16)', minWidth: 140, padding: 4 }}>
                {menu.map((m, i) => (
                  <button key={i} role="menuitem" disabled={m.disabled} onClick={(e) => { e.stopPropagation(); setOpen(false); m.onClick && m.onClick() }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'transparent', cursor: m.disabled ? 'not-allowed' : 'pointer', fontFamily: FF, fontSize: 13, color: m.danger ? '#b42318' : (m.disabled ? '#cbd5e1' : '#334155'), borderRadius: 7 }}>{m.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <button onClick={onClick} title={exact} style={{ textAlign: 'left', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: 0 }}>
        {progress ? (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', paddingRight: 20 }}>{title}</div>
            <div style={{ height: 10, borderRadius: 999, background: '#eef2f7', marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: Math.max(0, Math.min(100, Number(value) || 0)) + '%', height: '100%', background: color || '#0073EA' }} />
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{display} to goal</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 800, color: color || '#0f172a', paddingRight: 20, overflow: 'hidden', textOverflow: 'ellipsis' }}>{display}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 12, color: '#94a3b8' }}>{subtitle}</div> : null}
          </>
        )}
      </button>
    </div>
  )
}

function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 4 }}>{children}</div> }

export default CustomWidgetsSection
