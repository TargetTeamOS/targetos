import { useState, useEffect } from 'react'
import { useViewing } from '../context/ViewingContext'

// Minimal secure viewing bar (Phase 1, Part 5/13) — NOT the final visual
// design. Shows the viewing label, an agent selector for authorized users
// only, and the secure server-aggregated summary with explicit states.
const ff = 'Inter, system-ui, -apple-system, sans-serif'
const money = n => { const v = Number(n)||0; if (v>=1e6) return '$'+(v/1e6).toFixed(2)+'M'; if (v>=1e3) return '$'+Math.round(v/1e3)+'K'; return '$'+Math.round(v) }

export function ViewingBar() {
  const { mode, setMode, selectedAgentId, setSelectedAgentId, allowedAgents,
    canSelectAgents, canViewTeam, label, fetchSummary, dateRange } = useViewing()
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
  useEffect(() => { refresh() }, [mode, selectedAgentId, dateRange])

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
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px,1fr))', gap:10 }}>
          <Stat label="Closed Deals" value={summary.closed_deals} color="#059669" />
          <Stat label="Closed GCI" value={money(summary.closed_gci)} color="#059669" />
          <Stat label="Production" value={money(summary.closed_production)} color="#2563EB" />
          <Stat label="Active Deals" value={summary.active_deals} color="#2563EB" />
          <Stat label="Under Contract" value={summary.under_contract} color="#D97706" />
          <Stat label="Accepted Offers" value={summary.accepted_offers} color="#DB2777" />
          {summary.closed_missing_close_date > 0 && (
            <Stat label="⚠ Missing close date" value={summary.closed_missing_close_date} color="#DC2626" />
          )}
        </div>
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
