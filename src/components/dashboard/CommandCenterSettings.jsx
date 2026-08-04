// CommandCenterSettings — the single admin configuration drawer for the Command
// Center (section 10). Team goals and news sources persist through already-applied
// RPCs (app_goal_upsert / app_news_source_*). Front Runner styling, visible
// performance metrics and the default range persist through the A8 settings store;
// until A8 is applied those save to the session and the drawer says so. Calculated
// figures are never editable here.

import { useState, useEffect } from 'react'
import { saveGoal } from '../../lib/dashboardSettings'
import { supabase } from '../../lib/supabase'
import { NewsSourcesAdmin } from './NewsSourcesAdmin'
import { PERF_METRICS } from '../../lib/perfModel'
import { rangeDates } from '../../lib/perfModel'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

function todayISO() { return new Date().toISOString().slice(0, 10) }
function monthEndISO() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
function monthStartISO() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
function yearStartISO() { return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10) }
function yearEndISO() { return new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10) }

export function CommandCenterSettings({ open, onClose, ds }) {
  const [news, setNews] = useState(false)
  const [msg, setMsg] = useState(null)
  const settings = ds?.settings || {}
  const storeDeployed = ds?.deployed !== false
  if (!open) return null

  const fr = settings.front_runner || {}
  const metrics = settings.performance_metrics || PERF_METRICS.filter((m) => !m.financial).map((m) => m.key)
  const defRange = settings.default_range || 'mtd'

  const setFr = (patch) => ds?.save('front_runner', { ...fr, ...patch })
  const toggleMetric = (k) => {
    const next = metrics.includes(k) ? metrics.filter((x) => x !== k) : [...metrics, k]
    ds?.save('performance_metrics', next)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Command Center settings" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(560px,100%)', height: '100%', background: '#fff', overflowY: 'auto', fontFamily: FF, boxShadow: '-8px 0 40px rgba(15,23,42,0.2)' }}>
        <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #eef2f7', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 15 }}>Command Center settings</strong>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        {!storeDeployed && (
          <div role="status" style={{ margin: 16, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
            Settings store not deployed (A8) — Front Runner, metric visibility and default range are saved to this session only. Team goals and news sources below save for real.
          </div>
        )}
        {msg && <div role="status" style={{ margin: '0 16px', color: msg.ok ? '#037f4c' : '#b42318', fontSize: 12.5 }}>{msg.text}</div>}

        <div style={{ padding: '8px 16px 28px', display: 'grid', gap: 18 }}>
          <GoalForm title="Monthly team goal" basis="accepted_offers" period="monthly"
            start={monthStartISO()} end={monthEndISO()} onMsg={setMsg} unit="accepted offers" />
          <GoalForm title="Yearly team goal" basis="production_volume" period="yearly"
            start={yearStartISO()} end={yearEndISO()} onMsg={setMsg} unit="production volume ($)" />

          <IndividualGoalForm onMsg={setMsg} />

          <Section title="Front Runner of the Month">
            <input placeholder="Congratulatory message" value={fr.message || ''} onChange={(e) => setFr({ message: e.target.value })} style={inp} />
            <input placeholder="Image URL (blank = agent initials)" value={fr.image_url || ''} onChange={(e) => setFr({ image_url: e.target.value })} style={inp} />
            <label style={lbl}><input type="checkbox" checked={fr.visible !== false} onChange={(e) => setFr({ visible: e.target.checked })} /> Show the Front Runner widget</label>
            <Note>The winner and accepted-offer count are always calculated — not editable.</Note>
          </Section>

          <Section title="Visible performance metrics">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {PERF_METRICS.map((m) => (
                <label key={m.key} style={lbl}>
                  <input type="checkbox" checked={metrics.includes(m.key)} onChange={() => toggleMetric(m.key)} />
                  {m.label}{m.financial ? ' (admin)' : ''}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Default date range">
            <select value={defRange} onChange={(e) => ds?.save('default_range', e.target.value)} style={inp}>
              <option value="mtd">This month</option><option value="qtd">This quarter</option><option value="ytd">This year</option>
            </select>
          </Section>

          <Section title="News sources">
            <button onClick={() => setNews(true)} style={{ ...btn, background: '#fff', color: '#0073EA', border: '1px solid #cfe0fb' }}>Manage news sources</button>
          </Section>
        </div>
      </div>

      <NewsSourcesAdmin open={news} onClose={() => setNews(false)} onChanged={() => {}} />
    </div>
  )
}

function IndividualGoalForm({ onMsg }) {
  const [agents, setAgents] = useState([])
  const [f, setF] = useState({ agent_id: '', basis: 'accepted_offers', period: 'monthly', target: '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { from, to } = rangeDates('ytd')
        const { data } = await supabase.rpc('app_agent_performance', { p_from: from, p_to: to })
        if (alive && Array.isArray(data)) setAgents(data.map((r) => ({ id: r.agent_id, name: r.name })))
      } catch { /* agent list optional */ }
    })()
    return () => { alive = false }
  }, [])
  const submit = async () => {
    if (!f.agent_id) { onMsg?.({ ok: false, text: 'Individual goal: choose an agent.' }); return }
    if (!(Number(f.target) > 0)) { onMsg?.({ ok: false, text: 'Individual goal: enter a positive target.' }); return }
    const now = new Date(), y = now.getFullYear(), m = now.getMonth()
    const monthly = f.period === 'monthly'
    const start = monthly ? new Date(y, m, 1) : new Date(y, 0, 1)
    const end = monthly ? new Date(y, m + 1, 0) : new Date(y, 11, 31)
    setSaving(true)
    const r = await saveGoal({ title: null, goal_basis: f.basis, period: f.period, scope: 'individual', agent_id: f.agent_id,
      target: Number(f.target), start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10), visible: true, active: true })
    setSaving(false)
    onMsg?.(r.ok ? { ok: true, text: 'Individual goal saved.' } : { ok: false, text: 'Individual goal: ' + (r.error || 'save failed') })
  }
  return (
    <Section title="Individual agent goals">
      <select value={f.agent_id} onChange={(e) => setF({ ...f, agent_id: e.target.value })} aria-label="Agent" style={inp}>
        <option value="">Select an agent…</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} aria-label="Goal metric" style={inp}>
          <option value="accepted_offers">Accepted offers</option>
          <option value="closed_units">Closed units</option>
          <option value="production_volume">Production volume</option>
          <option value="gci">GCI</option>
        </select>
        <select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} aria-label="Goal period" style={inp}>
          <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
        </select>
      </div>
      <input type="number" placeholder="Target" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} style={inp} />
      <button onClick={submit} disabled={saving} style={btn}>{saving ? 'Saving…' : 'Save individual goal'}</button>
      <Note>Used by the Agent Performance leaderboard to rank by % of goal. Actuals are calculated automatically.</Note>
    </Section>
  )
}

function GoalForm({ title, basis, period, start, end, unit, onMsg }) {
  const [f, setF] = useState({ target: '', start_date: start, end_date: end, message: '' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!(Number(f.target) > 0)) { onMsg?.({ ok: false, text: title + ': enter a positive target.' }); return }
    setSaving(true)
    const r = await saveGoal({ title, goal_basis: basis, period, scope: 'team', target: Number(f.target), start_date: f.start_date, end_date: f.end_date, message: f.message || null, visible: true, active: true })
    setSaving(false)
    onMsg?.(r.ok ? { ok: true, text: title + ' saved. It appears on the dashboard on next load.' } : { ok: false, text: title + ': ' + (r.error || 'save failed') })
  }
  return (
    <Section title={title}>
      <label style={{ fontSize: 12, color: '#475569' }}>Target ({unit})
        <input type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} style={inp} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 12, color: '#475569' }}>Start<input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} style={inp} /></label>
        <label style={{ fontSize: 12, color: '#475569' }}>End<input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} style={inp} /></label>
      </div>
      <input placeholder="Optional message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} style={inp} />
      <button onClick={submit} disabled={saving} style={btn}>{saving ? 'Saving…' : 'Save ' + title.toLowerCase()}</button>
      <Note>Actual is calculated automatically from records — you only set the target.</Note>
    </Section>
  )
}

const inp = { width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 7, fontFamily: FF, fontSize: 13, boxSizing: 'border-box', marginTop: 4 }
const btn = { fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0073EA', color: '#fff', cursor: 'pointer', fontFamily: FF }
const lbl = { fontSize: 12.5, color: '#475569', display: 'inline-flex', gap: 6, alignItems: 'center' }
function Section({ title, children }) { return <div><div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{title}</div><div style={{ display: 'grid', gap: 8 }}>{children}</div></div> }
function Note({ children }) { return <p style={{ margin: 0, fontSize: 11.5, color: '#94a3b8' }}>{children}</p> }

export default CommandCenterSettings
