// WidgetBuilder — the full admin builder form. Every input is constrained to the
// server allowlist (widgetModel) so a saved config validates server-side. Preview
// is live (app_preview_production_widgets) when the engine is deployed and the
// display type is engine-supported; otherwise a clearly-labelled sample. Save is
// disabled with "Secure widget engine setup required" until the engine is applied.

import { useState, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  METRICS, FIELDS, DATE_MODES, DATE_FIELDS, FORMATS, BOOL_FILTERS, TEXT_FILTERS,
  DISPLAY_TYPES, displayDef, newWidgetForm, validateForm, toEngineConfig, formatValue, sampleValue,
} from '../../lib/widgetModel'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i
const SETUP = 'Secure widget engine setup required'

const SOURCES = [
  { key: 'deals', label: 'Production deals', enabled: true },
  { key: 'contacts', label: 'Contacts', enabled: false },
  { key: 'listings', label: 'Listings', enabled: false },
  { key: 'tasks', label: 'Tasks', enabled: false },
]

export function WidgetBuilder({ open, initial, engineReady, boardFrom, boardTo, onCancel, onSave }) {
  const [f, setF] = useState(() => initial || newWidgetForm(0))
  const [preview, setPreview] = useState(null) // { live, value }
  const [previewing, setPreviewing] = useState(false)
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }))
  const errors = useMemo(() => validateForm(f), [f])
  const disp = displayDef(f.display_type)
  const canSave = engineReady && errors.length === 0

  const toggleBool = (key) => set({ filters: { ...f.filters, [key]: f.filters?.[key] === 'true' ? undefined : 'true' } })
  const setText = (key, val) => set({ filters: { ...f.filters, [key]: val || undefined } })

  const runPreview = useCallback(async () => {
    if (errors.length) return
    if (!engineReady || !disp.engineSupported) { setPreview({ live: false, value: sampleValue(f) }); return }
    setPreviewing(true)
    try {
      const cfg = toEngineConfig([f])
      const { data, error } = await supabase.rpc('app_preview_production_widgets', { config: cfg, board_from: boardFrom, board_to: boardTo })
      if (error || (data && data.error)) { setPreview({ live: false, value: sampleValue(f) }); return }
      const first = Array.isArray(data) ? data[0] : null
      const val = first && (first.value != null ? first.value : first.pct)
      setPreview({ live: true, value: val != null ? val : sampleValue(f) })
    } catch { setPreview({ live: false, value: sampleValue(f) }) } finally { setPreviewing(false) }
  }, [f, errors.length, engineReady, disp.engineSupported, boardFrom, boardTo])

  if (!open) return null

  const previewValue = preview ? preview.value : sampleValue(f)
  const previewLive = !!(preview && preview.live)

  return (
    <div role="dialog" aria-modal="true" aria-label="Widget builder"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'flex-end' }}
      onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', height: '100%', background: '#fff', overflowY: 'auto', fontFamily: FF, boxShadow: '-8px 0 40px rgba(15,23,42,0.2)' }}>
        <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #eef2f7', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
          <strong style={{ fontSize: 15, color: '#0f172a' }}>{f.id ? 'Edit widget' : 'New widget'}</strong>
          <button onClick={onCancel} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        {!engineReady && (
          <div role="status" style={{ margin: 16, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
            {SETUP} — design freely and preview a sample below. Saving is disabled until the widget engine migration is applied.
          </div>
        )}

        {/* Live preview */}
        <div style={{ margin: 16, padding: 14, border: '1px solid #eef2f7', borderRadius: 12, background: '#fbfcfe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Preview</span>
            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: previewLive ? '#e6f7ee' : '#fff4e6', color: previewLive ? '#037f4c' : '#9a3412' }}>
              {previewLive ? 'Live' : 'Sample — not live data'}
            </span>
          </div>
          <PreviewCard form={f} value={previewValue} live={previewLive} disp={disp} />
          <button onClick={runPreview} disabled={previewing || errors.length > 0}
            style={{ marginTop: 10, fontSize: 12, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: errors.length ? 'not-allowed' : 'pointer', color: '#334155' }}>
            {previewing ? 'Loading…' : 'Refresh preview'}
          </button>
          {!disp.engineSupported && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#9a3412' }}>“{disp.label}” is shown as a sample layout — live rendering needs the widget-engine extension.</p>
          )}
        </div>

        <div style={{ padding: '0 16px 24px', display: 'grid', gap: 14 }}>
          <Section title="Basics">
            <Field label="Title"><input value={f.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} style={inp} placeholder="Closed deals" /></Field>
            <Field label="Subtitle"><input value={f.subtitle} maxLength={60} onChange={(e) => set({ subtitle: e.target.value })} style={inp} placeholder="This year" /></Field>
            <Row>
              <Field label="Colour"><input type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} style={{ ...inp, padding: 2, height: 34, width: 54 }} /></Field>
              <Field label="Display type"><select value={f.display_type} onChange={(e) => set({ display_type: e.target.value })} style={inp}>
                {DISPLAY_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}{d.engineSupported ? '' : ' (extension)'}</option>)}
              </select></Field>
            </Row>
          </Section>

          <Section title="Data">
            <Field label="Source"><select value="deals" onChange={() => {}} style={inp}>
              {SOURCES.map((s) => <option key={s.key} value={s.key} disabled={!s.enabled}>{s.label}{s.enabled ? '' : ' (coming soon)'}</option>)}
            </select></Field>
            <Row>
              <Field label="Metric"><select value={f.metric} onChange={(e) => set({ metric: e.target.value, field: e.target.value === 'count' ? '' : f.field })} style={inp}>
                {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select></Field>
              <Field label="Field">
                <select value={f.field} disabled={f.metric === 'count'} onChange={(e) => set({ field: e.target.value })} style={inp}>
                  <option value="">—</option>
                  {FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </Field>
            </Row>
            <Field label="Status & filters">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BOOL_FILTERS.map((b) => (
                  <label key={b.key} style={chip(f.filters?.[b.key] === 'true')}>
                    <input type="checkbox" checked={f.filters?.[b.key] === 'true'} onChange={() => toggleBool(b.key)} style={{ marginRight: 5 }} />{b.label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                {TEXT_FILTERS.map((k) => (
                  <input key={k} value={f.filters?.[k] || ''} placeholder={k.replace('_', ' ')} onChange={(e) => setText(k, e.target.value)} style={inp} />
                ))}
              </div>
            </Field>
            <Note>Agent filtering is team-scoped in v1 — per-agent widgets arrive with the engine extension.</Note>
          </Section>

          <Section title="Timeframe">
            <Row>
              <Field label="Date field"><select value={f.date_field} onChange={(e) => set({ date_field: e.target.value })} style={inp}>
                {DATE_FIELDS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select></Field>
              <Field label="Range"><select value={f.date_mode} onChange={(e) => set({ date_mode: e.target.value })} style={inp}>
                {DATE_MODES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select></Field>
            </Row>
            {f.date_mode === 'custom' && (
              <Row>
                <Field label="From"><input type="date" value={f.custom_from} onChange={(e) => set({ custom_from: e.target.value })} style={inp} /></Field>
                <Field label="To"><input type="date" value={f.custom_to} onChange={(e) => set({ custom_to: e.target.value })} style={inp} /></Field>
              </Row>
            )}
            <Field label="Number format"><select value={f.format} onChange={(e) => set({ format: e.target.value })} style={inp}>
              {FORMATS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select></Field>
          </Section>

          <Section title="Goal (optional)">
            <Row>
              <Field label="Goal type"><select value={f.goal_type} onChange={(e) => set({ goal_type: e.target.value })} style={inp}>
                <option value="">None</option><option value="team_goal">Team goal</option><option value="custom">Custom</option>
              </select></Field>
              <Field label="Goal value"><input type="number" value={f.goal_value} disabled={f.goal_type !== 'custom'} onChange={(e) => set({ goal_value: e.target.value })} style={inp} /></Field>
            </Row>
          </Section>

          <Section title="Visibility">
            <label style={{ fontSize: 13, color: '#475569', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={f.visible !== false} onChange={(e) => set({ visible: e.target.checked })} /> Visible on the board (team-wide)
            </label>
            <Note>Per-role and per-user visibility, icon, image and link destination are part of the engine extension.</Note>
          </Section>

          {errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, color: '#b42318', fontSize: 12.5 }}>{errors.map((x, i) => <li key={i}>{x}</li>)}</ul>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onCancel} style={{ ...btn, background: '#fff', color: '#475569', border: '1px solid #e2e8f0' }}>Cancel</button>
            <button onClick={() => onSave(f)} disabled={!canSave} title={engineReady ? '' : SETUP}
              style={{ ...btn, background: canSave ? '#0073EA' : '#cbd5e1', color: '#fff', cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {f.id ? 'Save changes' : 'Add widget'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewCard({ form, value, disp }) {
  const color = form.color || '#0073EA'
  if (form.display_type === 'progress' || disp.key === 'progress') {
    const pct = Math.max(0, Math.min(100, Number(value) || 0))
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{form.title || 'Untitled widget'}</div>
        <div style={{ height: 10, borderRadius: 999, background: '#eef2f7', marginTop: 8, overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: color }} />
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{pct}% to goal</div>
      </div>
    )
  }
  if (['bar_chart', 'line_chart', 'donut_chart', 'compact_list', 'leaderboard', 'status_breakdown', 'image_progress'].includes(form.display_type)) {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{form.title || 'Untitled widget'}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46, marginTop: 8 }}>
          {[40, 70, 30, 90, 55].map((h, i) => <div key={i} style={{ width: 16, height: h + '%', background: color, opacity: 0.35 + i * 0.12, borderRadius: 3 }} />)}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{formatValue(value, form.format)}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{form.title || 'Untitled widget'}</div>
      {form.subtitle ? <div style={{ fontSize: 12, color: '#94a3b8' }}>{form.subtitle}</div> : null}
    </div>
  )
}

const inp = { width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 7, fontFamily: FF, fontSize: 13, boxSizing: 'border-box' }
const btn = { fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none' }
const chip = (on) => ({ fontSize: 12, padding: '5px 9px', borderRadius: 999, border: '1px solid ' + (on ? '#0073EA' : '#e2e8f0'), color: on ? '#0073EA' : '#475569', background: on ? '#eff6ff' : '#fff', cursor: 'pointer' })
function Section({ title, children }) { return <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{title}</div><div style={{ display: 'grid', gap: 10 }}>{children}</div></div> }
function Field({ label, children }) { return <label style={{ display: 'block', fontSize: 12, color: '#475569' }}><span style={{ display: 'block', marginBottom: 4 }}>{label}</span>{children}</label> }
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div> }
function Note({ children }) { return <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>{children}</p> }

export default WidgetBuilder
