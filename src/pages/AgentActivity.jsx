import { useState, useEffect } from 'react'
import { PageHeader } from '../components/UI'
import { authFetch } from '../lib/apiAuth'
import { useAuth } from '../context/AuthContext'

const ff = 'Inter, system-ui, sans-serif'

function fmtDur(s) {
  s = Number(s) || 0
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (h) return h + 'h ' + m + 'm'
  if (m) return m + 'm'
  return s + 's'
}
function money(n) {
  const v = Number(n) || 0
  if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M'
  if (v >= 1000) return '$' + Math.round(v / 1000) + 'K'
  return '$' + v
}
function ago(iso) {
  if (!iso) return 'never'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return d + 'd ago'
}

const RANGES = [{ d: 7, l: '7 days' }, { d: 30, l: '30 days' }, { d: 90, l: '90 days' }, { d: 365, l: '1 year' }]

// columns: key, label, formatter, whether higher-is-better for the bar
const COLS = [
  { k: 'sign_ins', label: 'Sign-ins' },
  { k: 'new_contacts', label: 'New Clients' },
  { k: 'contact_conv_rate', label: 'Client Conv%', suffix: '%' },
  { k: 'new_deals', label: 'New Deals' },
  { k: 'closed_deals', label: 'Closed' },
  { k: 'production', label: 'Production', fmt: money },
  { k: 'calls', label: 'Calls' },
  { k: 'call_conn_rate', label: 'Call Conn%', suffix: '%' },
  { k: 'talk_seconds', label: 'Talk Time', fmt: fmtDur },
  { k: 'offers', label: 'Offers' },
  { k: 'offer_conv_rate', label: 'Offer Conv%', suffix: '%' },
  { k: 'emails_sent', label: 'Emails' },
  { k: 'edits', label: 'Productivity' },
]

export function AgentActivity() {
  const { can, isAdmin } = useAuth()
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('production')

  async function load() {
    setLoading(true)
    try {
      const r = await authFetch('/api/agent-activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'load failed')
      setData(j); setErr('')
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [days])

  if (!isAdmin && !(can && can('admin.audit_log'))) {
    return <div style={{ padding: 24, fontFamily: ff, color: 'var(--muted)' }}>Admin access required.</div>
  }

  const rows = data ? [...data.agents].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)) : []
  const t = data ? data.totals : {}

  const card = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
  const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'right', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: ff }
  const td = { padding: '8px 10px', fontSize: 13, color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: ff }

  return (
    <div>
      <PageHeader title="Agent Activity" sub="Team-wide productivity & conversion — who's doing what" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {RANGES.map(r => (
          <button key={r.d} onClick={() => setDays(r.d)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid ' + (days === r.d ? 'var(--brand)' : 'var(--border)'), background: days === r.d ? 'var(--brand)' : 'var(--dim)', color: days === r.d ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
            {r.l}
          </button>
        ))}
      </div>

      {err && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 12, fontFamily: ff }}>{err}</div>}
      {loading && <div style={{ padding: 24, color: 'var(--muted)', fontFamily: ff }}>Loading activity…</div>}

      {data && !loading && (
        <>
          {/* team totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
            {[
              { l: 'New Clients', v: t.new_contacts, c: '#3B82F6' },
              { l: 'Closed Deals', v: t.closed_deals, c: '#00c875' },
              { l: 'Production', v: money(t.production), c: '#FACC15' },
              { l: 'Calls', v: t.calls, c: '#0EA5E9' },
              { l: 'Talk Time', v: fmtDur(t.talk_seconds), c: '#8B5CF6' },
              { l: 'Offers Accepted', v: t.offers_accepted + '/' + t.offers, c: '#EC4899' },
              { l: 'Emails Sent', v: t.emails_sent, c: '#14B8A6' },
              { l: 'Sign-ins', v: t.sign_ins, c: '#64748B' },
            ].map(s => (
              <div key={s.l} style={card}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', fontFamily: ff }}>{s.l}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.c, fontFamily: ff, marginTop: 3 }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* per-agent table */}
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Agent</th>
                  {COLS.map(c => (
                    <th key={c.k} style={{ ...th, color: sortKey === c.k ? 'var(--brand)' : 'var(--muted)' }} onClick={() => setSortKey(c.k)}>
                      {c.label}{sortKey === c.k ? ' ↓' : ''}
                    </th>
                  ))}
                  <th style={th}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.agent_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color }} />
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </span>
                    </td>
                    {COLS.map(c => (
                      <td key={c.k} style={{ ...td, fontWeight: sortKey === c.k ? 800 : 400, color: sortKey === c.k ? 'var(--text)' : 'var(--muted)' }}>
                        {c.fmt ? c.fmt(r[c.k]) : (r[c.k] + (c.suffix || ''))}
                      </td>
                    ))}
                    <td style={{ ...td, color: 'var(--muted)', fontSize: 11 }}>{ago(r.last_active)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={COLS.length + 2} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No activity in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, fontFamily: ff, lineHeight: 1.6 }}>
            Click any column header to sort. "Productivity" counts record edits (field changes) made by the agent.
            Talk time and call-connect rate depend on call logging capturing duration/outcome. Emails sent reflect emails logged through the CRM.
          </div>
        </>
      )}
    </div>
  )
}
