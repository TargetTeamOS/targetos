// MyDayWidget — the signed-in agent's day. Reads app_my_day() (auth-scoped;
// strict owner-only privacy enforced server-side). The full layout always
// renders: when app_my_day isn't deployed we show a complete "Secure My Day
// setup required" scaffold with the quick-action UI disabled — never simulated
// data, never a fake successful write. Rows deep-link to their exact CRM record.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMetric } from '../../lib/useDashboardData'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { rowRoute } from '../../lib/dashboardRoutes'
import { MYDAY_SECTIONS, bucket, totalCount, sectionMeta } from '../../lib/myDayModel'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i

async function myDayFetcher() {
  const { data, error } = await supabase.rpc('app_my_day')
  if (error) {
    if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false, data: null }
    throw error
  }
  if (data && data.error === 'no_agent_link') return { deployed: true, noAgent: true, data: null }
  return { deployed: true, data: data || {} }
}

const SETUP_MSG = 'Secure action setup required'

export function MyDayWidget() {
  const navigate = useNavigate()
  const { data, loading, error, refresh } = useMyDay()
  const payload = data?.data || {}
  const deployed = !!data?.deployed && !data?.noAgent
  const caps = payload.capabilities || null
  const writable = deployed && (!caps || caps.complete !== false)

  const [drillKey, setDrillKey] = useState(null)
  const [editor, setEditor] = useState(null) // { rowId, mode:'reschedule'|'note'|'followup', value, note }
  const [acting, setActing] = useState(false)

  const go = useCallback((row) => { const r = rowRoute(row); if (r) navigate(r) }, [navigate])

  const doAction = useCallback(async (fn) => {
    if (!writable || acting) return
    setActing(true)
    try {
      const { data: res, error: e } = await fn()
      if (!e && !(res && res.error)) { setEditor(null); refresh() }
    } finally { setActing(false) }
  }, [writable, acting, refresh])

  const complete = (row) => doAction(() => supabase.rpc('app_task_complete', { p_task_id: row.id }))
  const reschedule = (row, due) => doAction(() => supabase.rpc('app_task_reschedule', { p_task_id: row.id, p_due: due }))
  const rescheduleEvent = (row, start) => doAction(() => supabase.rpc('app_event_reschedule', { p_event_id: row.id, p_start: start, p_end: null }))
  const addNote = (row, note) => doAction(() => supabase.rpc('app_task_add_note', { p_task_id: row.id, p_note: note }))
  const createFollowup = (row, when, note) => doAction(() => supabase.rpc('app_create_followup', { p_contact_id: row.id, p_when: when, p_note: note }))

  const actionBtn = (label, onClick, key) => (
    <button key={key} disabled={!writable || acting} title={writable ? '' : SETUP_MSG}
      onClick={onClick}
      style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: writable ? 'pointer' : 'not-allowed', color: writable ? '#334155' : '#a3adba', fontFamily: FF }}>
      {label}
    </button>
  )

  const Row = ({ row, section }) => {
    const route = rowRoute(row)
    const isEditing = editor && editor.rowId === row.id
    return (
      <li style={{ padding: '8px 0', borderTop: '1px solid #f4f6f9' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <button onClick={() => go(row)} disabled={!route}
            style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: route ? 'pointer' : 'default', fontFamily: FF, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: route ? '#0f172a' : '#334155' }}>{row.label}</span>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{row.secondary}</span>
          </button>
        </div>
        {section.actions && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {section.actions === true && <>
              {actionBtn('Complete', () => complete(row), 'c')}
              {actionBtn('Reschedule', () => setEditor({ rowId: row.id, mode: 'reschedule', value: '' }), 'r')}
              {actionBtn('Note', () => setEditor({ rowId: row.id, mode: 'note', note: '' }), 'n')}
            </>}
            {section.actions === 'event' && actionBtn('Reschedule', () => setEditor({ rowId: row.id, mode: 'event', value: '' }), 're')}
            {section.actions === 'followup' && actionBtn('New follow-up', () => setEditor({ rowId: row.id, mode: 'followup', value: '', note: '' }), 'f')}
          </div>
        )}
        {isEditing && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {(editor.mode === 'reschedule' || editor.mode === 'event' || editor.mode === 'followup') && (
              <input type={editor.mode === 'event' ? 'datetime-local' : 'date'} value={editor.value}
                onChange={(e) => setEditor({ ...editor, value: e.target.value })} aria-label="New date" style={inp} />
            )}
            {(editor.mode === 'note' || editor.mode === 'followup') && (
              <input placeholder="Note" value={editor.note || ''} aria-label="Note"
                onChange={(e) => setEditor({ ...editor, note: e.target.value })} style={{ ...inp, minWidth: 140 }} />
            )}
            {actionBtn('Save', () => {
              if (editor.mode === 'reschedule') reschedule(row, editor.value)
              else if (editor.mode === 'event') rescheduleEvent(row, editor.value)
              else if (editor.mode === 'note') addNote(row, editor.note)
              else if (editor.mode === 'followup') createFollowup(row, editor.value, editor.note)
            }, 's')}
            <button onClick={() => setEditor(null)} style={{ ...inp, cursor: 'pointer', border: 'none', background: 'transparent', color: '#94a3b8' }}>Cancel</button>
          </div>
        )}
      </li>
    )
  }

  // buckets shown inline (actionable + today); the rest are reachable via the summary grid
  const inlineKeys = ['tasks_due_today', 'tasks_overdue', 'appointments_today', 'followups_due_today']
  const total = totalCount(payload)

  const body = (
    <div>
      {!deployed && (
        <div role="status" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, marginBottom: 12 }}>
          Secure My Day setup required — apply <strong>A6_my_day</strong> to load your tasks, appointments and follow-ups. The layout below is live; quick actions are disabled until then.
        </div>
      )}
      {data?.noAgent && (
        <div role="status" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, marginBottom: 12 }}>
          Your login isn’t linked to an agent record yet, so there’s nothing personal to show.
        </div>
      )}

      {/* bucket summary grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {MYDAY_SECTIONS.map((s) => {
          const n = bucket(payload, s.key).length
          return (
            <button key={s.key} onClick={() => setDrillKey(s.key)}
              style={{ textAlign: 'left', background: '#fff', border: '1px solid #eef2f7', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', fontFamily: FF }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: n ? '#0f172a' : '#cbd5e1' }}>{n}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: s.accent, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.2 }}>{s.title}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* inline actionable rows */}
      {inlineKeys.map((key) => {
        const rows = bucket(payload, key)
        if (!rows.length) return null
        const meta = sectionMeta(key)
        return (
          <div key={key} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: meta.accent }} />
              <button onClick={() => setDrillKey(key)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                {meta.title} ({rows.length})
              </button>
            </div>
            <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0 }}>
              {rows.slice(0, 3).map((row) => <Row key={(row.related?.id || row.id) + key} row={row} section={meta} />)}
            </ul>
            {rows.length > 3 && (
              <button onClick={() => setDrillKey(key)} style={{ fontSize: 12, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: '4px 0 0' }}>
                View all {rows.length}
              </button>
            )}
          </div>
        )
      })}

      {deployed && total === 0 && (
        <p style={{ marginTop: 14, fontSize: 13, color: '#64748b' }}>You’re all clear — no tasks, appointments or follow-ups need attention right now.</p>
      )}
    </div>
  )

  const drillMeta = drillKey ? sectionMeta(drillKey) : null
  const drillRows = drillKey ? bucket(payload, drillKey) : null

  return (
    <>
      <WidgetCard title="My day" accent="#0073EA" sourceLabel="Your TargetOS records" dateRangeLabel="Today"
        loading={loading} error={error} onRetry={refresh}>
        {body}
      </WidgetCard>

      <DrillDown
        open={!!drillKey} onClose={() => setDrillKey(null)}
        title={drillMeta ? drillMeta.title : 'My day'}
        explanation="Only your own records are shown."
        sourceLabel="Your TargetOS records" dateRangeLabel="Today"
        recordCount={drillRows ? drillRows.length : undefined}
        rows={drillRows} onNavigate={navigate}
      />
    </>
  )
}

// small hook wrapper so the fetcher stays out of the component body
function useMyDay() { return useMetric('myday', myDayFetcher, { ttlMs: 60 * 1000 }) }

const inp = { padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: FF, fontSize: 12 }

export default MyDayWidget
