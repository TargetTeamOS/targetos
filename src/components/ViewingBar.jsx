import { useState, useEffect } from 'react'
import { useViewing } from '../context/ViewingContext'

// Minimal secure viewing bar (Phase 1, Part 5/13) — NOT the final visual
// design. Shows the viewing label, an agent selector for authorized users
// only, and the secure server-aggregated summary with explicit states.
const ff = 'Inter, system-ui, -apple-system, sans-serif'
// currency: proper $ formatting for GCI/production. counts: whole numbers.
const money = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const count = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const percent = n => (n === null || n === undefined) ? '—' : (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'

export function ViewingBar() {
  const { mode, setMode, selectedAgentId, setSelectedAgentId, allowedAgents,
    canSelectAgents, canViewTeam, label, fetchSummary, dateRange, isAdmin } = useViewing()
  const [state, setState] = useState('loading')   // loading|ok|empty|forbidden|nolink|error
  const [summary, setSummary] = useState(null)
  const [err, setErr] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)

  async function refresh() {
    setState('loading')
    const r = await fetchSummary()
    if (r?.error === 'forbidden') { setState('forbidden'); return }
    if (r?.error === 'no_agent_link') { setState('nolink'); return }
    if (r?.error) { setErr(r.error); setState('error'); return }
    if (!r || Object.keys(r).length === 0) { setState('empty'); return }
    setSummary(r); setUpdatedAt(new Date()); setState('ok')
  }
  useEffect(() => { if (isAdmin) refresh() }, [mode, selectedAgentId, dateRange, isAdmin])

  // Admin-only for now. Agent/secretary dashboards handled in a later step.
  if (!isAdmin) return null

  return (
    <div style={{ marginBottom: 16, fontFamily: ff }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Viewing:</span>
        <span style={{ fontSize:13, padding:'4px 12px', borderRadius:99, background:'var(--dim)', color:'var(--text)', fontWeight:600 }}>{label}</span>

        {canViewTeam && (
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={()=>setMode('self')} style={tab(mode==='self')}>My Dashboard</button>
            <button onClick={()=>setMode('team')} style={tab(mode==='team')}>All Agents</button>
          </div>
        )}
        {canSelectAgents && (
          <select value={selectedAgentId||''} onChange={e=>{ setSelectedAgentId(e.target.value||null); setMode(e.target.value?'agent':'self') }}
            style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:13, background:'var(--panel)', color:'var(--text)', fontFamily:ff }}>
            <option value="">— select an agent —</option>
            {allowedAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button onClick={refresh} style={{ marginLeft:'auto', padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, cursor:'pointer', fontFamily:ff }}>↻ Refresh</button>
        {updatedAt && <span style={{ fontSize:11, color:'var(--muted)' }}>updated {updatedAt.toLocaleTimeString()}</span>}
      </div>

      {/* Secure server-aggregated summary — explicit states, never zero-on-error */}
      {state==='loading' && <Bar text="Loading secure summary…" />}
      {state==='forbidden' && <Bar text="You don't have permission to view this scope." tone="warn" />}
      {state==='nolink' && <Bar text="Your login isn't linked to an agent record yet — ask an admin to link your account." tone="warn" />}
      {state==='error' && <Bar text={'Summary failed to load: ' + err + ' (this is an error, not zero).'} tone="err" />}
      {state==='empty' && <Bar text="No data in this range." />}
      {state==='ok' && summary && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:10 }}>
            <Stat label="Closed in Selected Period" value={count(summary.filtered_closed_deals)} color="#059669" />
            <Stat label="Closed Toward 2026 Goal" value={count(summary.team_goal_closed_deals)} color="#059669" />
            <Stat label="2026 Team Goal" value={count(summary.team_goal_target)} color="#2563EB" />
            <Stat label="Remaining to Goal" value={count(summary.team_goal_remaining)} color="#D97706" />
            <Stat label="Goal Progress" value={percent(summary.team_goal_progress_pct)} color="#2563EB" />
            <Stat label="Closed GCI" value={money(summary.closed_gci)} color="#059669" />
            <Stat label="Closed Production" value={money(summary.closed_production)} color="#2563EB" />
            <Stat label="Pipeline GCI" value={money(summary.pipeline_gci)} color="#7C3AED" />
            <Stat label="Active Pipeline" value={count(summary.active_deals)} color="#2563EB" />
            <Stat label="Under Contract Now" value={count(summary.under_contract_now)} color="#D97706" />
            <Stat label="Contracts During Selected Period" value={count(summary.under_contract_period)} color="#0891B2" />
          </div>
          {summary.closed_missing_close_date > 0 && (
            <div style={{ marginTop:10 }}>
              <Bar tone="warn" text={'⚠ Data quality: ' + count(summary.closed_missing_close_date) + ' closed deal(s) missing a close date — excluded from period totals.'} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

const tab = on => ({ padding:'6px 12px', borderRadius:8, border:'1px solid '+(on?'var(--brand)':'var(--border)'), background:on?'var(--brand)':'var(--dim)', color:on?'#fff':'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff })
function Bar({ text, tone }) {
  const c = tone==='err' ? '#DC2626' : tone==='warn' ? '#D97706' : 'var(--muted)'
  return <div style={{ fontSize:13, color:c, padding:'10px 14px', background:'var(--dim)', borderRadius:10, fontFamily:ff }}>{text}</div>
}
function Stat({ label, value, color }) {
  return (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.03em' }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color, marginTop:3 }}>{value}</div>
    </div>
  )
}
