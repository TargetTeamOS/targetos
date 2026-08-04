// MyWidgetsSection — every agent's OWN widgets, scoped to their OWN data.
// Available to all authenticated agents (not admin-gated): the shared board above
// is admin-editable, but this row is each agent's personal space. All data comes
// from the self-scoped A9 RPCs (app_user_widgets_*), which never accept an agent
// id and always compute over the caller's own records — so an agent can only ever
// build cards from their own deals / performance, never another agent's.
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FONT, TYPE, CARD, INK, fmtCompactMoney, fmtCompactNum } from '../../lib/dashboardTheme'
import { DrillDown } from './DrillDown'
import {
  fetchUserWidgets, saveUserWidget, deleteUserWidget, fetchUserWidgetRecords,
  USER_METRICS, USER_RANGES, metricMeta,
} from '../../lib/userWidgets'

function fmtValue(v, kind) { return kind === 'money' ? fmtCompactMoney(v) : fmtCompactNum(v) }

function AddForm({ onSave, onCancel, saving }) {
  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState(USER_METRICS[0].key)
  const [range, setRange] = useState('ytd')
  const inp = { fontFamily: FONT, fontSize: 13, padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', minWidth: 0 }
  const chosen = metricMeta(metric)
  return (
    <div style={{ ...CARD, border: '1px dashed #cfe0fb', padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: TYPE.cardTitle, fontWeight: 700, color: INK.title }}>Add one of your widgets</div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={chosen.label} aria-label="Widget title" style={inp} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric" style={{ ...inp, flex: '1 1 160px' }}>
          {USER_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range" style={{ ...inp, flex: '0 0 130px' }}>
          {USER_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onSave({ title: title.trim() || chosen.label, metric, date_range: range, display_type: 'kpi' })}
          disabled={saving} style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0073EA', color: '#fff', cursor: 'pointer' }}>
          {saving ? 'Adding…' : 'Add widget'}
        </button>
        <button onClick={onCancel} style={{ fontFamily: FONT, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: INK.body, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

function KpiCard({ w, onOpen, onDelete }) {
  const meta = metricMeta(w.metric)
  const range = (USER_RANGES.find((r) => r.key === w.date_range) || {}).label || ''
  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ ...CARD, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: TYPE.meta, color: INK.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Remove widget" title="Remove"
          style={{ border: 'none', background: 'transparent', color: INK.faint, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <div style={{ fontSize: TYPE.kpi, fontWeight: 800, color: INK.title, lineHeight: 1.05 }}>{fmtValue(w.value, meta.kind)}</div>
      <div style={{ fontSize: TYPE.meta, color: INK.faint }}>{meta.label} · {range}</div>
    </div>
  )
}

export function MyWidgetsSection() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, deployed: null, widgets: [], error: null })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drill, setDrill] = useState({ open: false, loading: false, rows: null, title: '', metric: null, range: 'ytd' })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    try { const r = await fetchUserWidgets(); setState({ loading: false, deployed: r.deployed, widgets: r.widgets || [], error: r.error || null }) }
    catch (e) { setState({ loading: false, deployed: true, widgets: [], error: e.message || 'Could not load your widgets' }) }
  }, [])
  useEffect(() => { load() }, [load])

  const onSave = async (p) => {
    setSaving(true)
    try { const r = await saveUserWidget(p); if (r.ok) { setAdding(false); await load() } } finally { setSaving(false) }
  }
  const onDelete = async (id) => { await deleteUserWidget(id); await load() }

  const openDrill = async (w) => {
    const meta = metricMeta(w.metric)
    setDrill({ open: true, loading: true, rows: null, title: w.title, metric: w.metric, range: w.date_range })
    const r = await fetchUserWidgetRecords(w.metric, w.date_range)
    setDrill({ open: true, loading: false, rows: r.rows, title: w.title, metric: w.metric, range: w.date_range, kind: meta.kind })
  }

  const shell = (body) => (
    <section style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: TYPE.chartTitle, fontWeight: 700, color: INK.title }}>My widgets</h2>
        {state.deployed && !adding && <button onClick={() => setAdding(true)} style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: '1px solid #cfe0fb', background: '#fff', color: '#0073EA', cursor: 'pointer' }}>+ Add widget</button>}
      </div>
      {body}
    </section>
  )

  if (state.loading) return shell(<div style={{ ...CARD, padding: 16, color: INK.muted, fontSize: 13 }}>Loading your widgets…</div>)

  if (state.deployed === false) {
    return shell(
      <div style={{ ...CARD, padding: 16, color: INK.muted, fontSize: 13.5 }}>
        Personal widgets are coming with the next update. Once it's applied you'll be able to add cards built from <strong>your own</strong> deals and performance here.
      </div>
    )
  }

  const grid = { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }
  return shell(
    <>
      {adding && <div style={{ marginBottom: 14, maxWidth: 380 }}><AddForm onSave={onSave} onCancel={() => setAdding(false)} saving={saving} /></div>}
      {state.widgets.length === 0 && !adding ? (
        <div style={{ ...CARD, padding: 16, color: INK.muted, fontSize: 13.5 }}>
          You haven't added any widgets yet. Use <strong>Add widget</strong> to pin a number from your own deals or tasks.
        </div>
      ) : (
        <div style={grid}>
          {state.widgets.map((w) => (
            <KpiCard key={w.id} w={w} onOpen={() => openDrill(w)} onDelete={() => onDelete(w.id)} />
          ))}
        </div>
      )}
      <DrillDown
        open={drill.open} onClose={() => setDrill((d) => ({ ...d, open: false }))}
        title={drill.title} explanation="Your own records for this metric."
        sourceLabel="Your deals / tasks" dateRangeLabel={(USER_RANGES.find((r) => r.key === drill.range) || {}).label}
        loading={drill.loading} rows={drill.rows} recordCount={drill.rows ? drill.rows.length : undefined}
        onNavigate={(route) => { setDrill((d) => ({ ...d, open: false })); if (route) navigate(route) }}
      />
    </>
  )
}

export default MyWidgetsSection
