// ═══════════════════════════════════════════════════════════════
// TargetOS — Analytics (July 2026)
// One hub, two lenses:
//   • Business — how the company is doing: deals sent, accepted,
//     under contract, closed, production totals, GCI/commissions,
//     conversion — this period vs the comparison period.
//   • Agents — per-agent performance: deals, calls, contacts added,
//     interactions, conversion — this period vs comparison, ranked.
// Replaces the separate Performance / Agent Activity / Reports pages.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAgents } from '../lib/hooks'
import { fmt$, parseNum } from '../lib/utils'
import { Loading } from '../components/UI'

const ff = 'Inter,system-ui,sans-serif'

// ── Period helpers ──────────────────────────────────────────────
function periodRange(kind, ref = new Date()) {
  const d = new Date(ref)
  if (kind === 'week') {
    const day = d.getDay(); const start = new Date(d); start.setDate(d.getDate() - day); start.setHours(0,0,0,0)
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999)
    return { start, end }
  }
  if (kind === 'month') return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999) }
  if (kind === 'quarter') { const q = Math.floor(d.getMonth()/3); return { start: new Date(d.getFullYear(), q*3, 1), end: new Date(d.getFullYear(), q*3+3, 0, 23,59,59,999) } }
  // year
  return { start: new Date(d.getFullYear(), 0, 1), end: new Date(d.getFullYear(), 11, 31, 23,59,59,999) }
}
function prevRange(kind, ref = new Date()) {
  const d = new Date(ref)
  if (kind === 'week')    { const p = new Date(d); p.setDate(d.getDate() - 7);  return periodRange('week', p) }
  if (kind === 'month')   { const p = new Date(d.getFullYear(), d.getMonth()-1, 15); return periodRange('month', p) }
  if (kind === 'quarter') { const p = new Date(d.getFullYear(), d.getMonth()-3, 15); return periodRange('quarter', p) }
  return periodRange('year', new Date(d.getFullYear()-1, 6, 1))
}
const inRange = (dateStr, r) => { if (!dateStr) return false; const t = new Date(dateStr).getTime(); return t >= r.start.getTime() && t <= r.end.getTime() }
const label = { week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year' }
const prevLabel = { week: 'last week', month: 'last month', quarter: 'last quarter', year: 'last year' }

// ── Trend chip ──────────────────────────────────────────────────
function Trend({ now, prev, money, invert }) {
  if (prev == null) return null
  const diff = now - prev
  const pct = prev !== 0 ? Math.round((diff / Math.abs(prev)) * 100) : (now > 0 ? 100 : 0)
  if (diff === 0) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
  const good = invert ? diff < 0 : diff > 0
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: good ? '#0B7A45' : '#DC2626' }}>
      {diff > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span style={{ color: 'var(--muted)', fontWeight: 500 }}>vs {money ? fmt$(prev) : prev}</span>
    </span>
  )
}

function StatCard({ label: lbl, value, now, prev, money, invert, accent }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', borderTop: '3px solid ' + (accent || 'var(--brand)') }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{lbl}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6 }}><Trend now={now} prev={prev} money={money} invert={invert} /></div>
    </div>
  )
}

export function Analytics() {
  const { isAdmin, canManage } = useAuth()
  const { agents } = useAgents()
  const [tab, setTab]       = useState('business')  // business | agents
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [deals, setDeals]     = useState([])
  const [calls, setCalls]     = useState([])
  const [contacts, setContacts] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [dRes, cRes, ctRes] = await Promise.all([
          supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,created_at,agent_id,side,source').order('created_at',{ascending:false}).range(0,4999),
          supabase.from('calls').select('id,agent_id,outcome,created_at').order('created_at',{ascending:false}).range(0,9999),
          supabase.from('contacts').select('id,agent_id,created_at,status').order('created_at',{ascending:false}).range(0,9999),
        ])
        if (!alive) return
        setDeals(dRes.data || []); setCalls(cRes.data || []); setContacts(ctRes.data || [])
      } catch (e) { /* show empty */ }
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const cur  = useMemo(() => periodRange(period), [period])
  const prev = useMemo(() => prevRange(period), [period])

  // Deal "sent out" date: created_at (when it entered the pipeline)
  const sentDate = d => d.created_at
  const acceptDate = d => d.ao_date || d.created_at

  // ── Business metrics ──────────────────────────────────────────
  const biz = useMemo(() => {
    const calc = (r) => {
      const sent     = deals.filter(d => inRange(sentDate(d), r))
      const accepted = deals.filter(d => (d.stage === 'Offer Accapted' || d.ao_date) && inRange(acceptDate(d), r))
      const uc       = deals.filter(d => d.stage === 'Under Contract' && inRange(d.ao_date || d.created_at, r))
      const closed   = deals.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, r))
      const fell     = deals.filter(d => d.stage === 'Deal Fell Through' && inRange(d.created_at, r))
      const gci      = closed.reduce((s,d) => s + parseNum(d.gci), 0)
      const prod     = closed.reduce((s,d) => s + parseNum(d.production), 0)
      return {
        sent: sent.length, accepted: accepted.length, uc: uc.length,
        closed: closed.length, fell: fell.length, gci, prod,
        avgGci: closed.length ? gci / closed.length : 0,
        convRate: sent.length ? Math.round((closed.length / sent.length) * 100) : 0,
      }
    }
    return { now: calc(cur), prev: calc(prev) }
  }, [deals, cur, prev])

  // ── Agent metrics ─────────────────────────────────────────────
  const agentRows = useMemo(() => {
    const calc = (agentId, r) => {
      const ad = deals.filter(d => d.agent_id === agentId)
      const closed = ad.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, r))
      const sent   = ad.filter(d => inRange(sentDate(d), r))
      const ac     = calls.filter(c => c.agent_id === agentId && inRange(c.created_at, r))
      const newCt  = contacts.filter(c => c.agent_id === agentId && inRange(c.created_at, r))
      return {
        deals: closed.length,
        sent: sent.length,
        gci: closed.reduce((s,d) => s + parseNum(d.gci), 0),
        prod: closed.reduce((s,d) => s + parseNum(d.production), 0),
        calls: ac.length,
        contacts: newCt.length,
        conv: sent.length ? Math.round((closed.length / sent.length) * 100) : 0,
      }
    }
    return (agents || []).map(a => ({ agent: a, now: calc(a.id, cur), prev: calc(a.id, prev) }))
      .sort((x, y) => y.now.gci - x.now.gci)
  }, [agents, deals, calls, contacts, cur, prev])

  if (!isAdmin && !canManage) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: ff }}>Analytics is available to admins and office staff.</div>
  if (loading) return <Loading />

  const n = biz.now, p = biz.prev

  return (
    <div style={{ padding: '20px 24px', fontFamily: ff, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📈 Reports &amp; Analytics</h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{label[period]} vs {prevLabel[period]}</div>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--dim)', padding: 4, borderRadius: 10 }}>
          {['week','month','quarter','year'].map(pk => (
            <button key={pk} onClick={() => setPeriod(pk)}
              style={{ padding: '6px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: ff, fontSize: 12.5, fontWeight: 700,
                background: period === pk ? 'var(--panel)' : 'transparent', color: period === pk ? 'var(--brand)' : 'var(--muted)',
                boxShadow: period === pk ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
              {pk === 'week' ? 'Week' : pk === 'month' ? 'Month' : pk === 'quarter' ? 'Quarter' : 'Year'}
            </button>
          ))}
        </div>
      </div>

      {/* Business / Agents switch */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {[{ id:'business', label:'🏢 Business' }, { id:'agents', label:'👤 Agents' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--brand)' : '2px solid transparent',
              background: 'transparent', color: tab === t.id ? 'var(--brand)' : 'var(--muted)', fontSize: 14, fontWeight: tab === t.id ? 800 : 600,
              cursor: 'pointer', fontFamily: ff, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BUSINESS ── */}
      {tab === 'business' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="Deals Sent Out" value={n.sent} now={n.sent} prev={p.sent} accent="#0EA5E9" />
            <StatCard label="Offers Accepted" value={n.accepted} now={n.accepted} prev={p.accepted} accent="#00c875" />
            <StatCard label="Under Contract" value={n.uc} now={n.uc} prev={p.uc} accent="#757575" />
            <StatCard label="Closed Deals" value={n.closed} now={n.closed} prev={p.closed} accent="#225091" />
            <StatCard label="Production Volume" value={fmt$(n.prod)} now={n.prod} prev={p.prod} money accent="#037f4c" />
            <StatCard label="GCI / Commissions" value={fmt$(n.gci)} now={n.gci} prev={p.gci} money accent="#CC2200" />
            <StatCard label="Avg GCI / Deal" value={fmt$(n.avgGci)} now={n.avgGci} prev={p.avgGci} money accent="#8B5CF6" />
            <StatCard label="Deals Fell Through" value={n.fell} now={n.fell} prev={p.fell} invert accent="#ff007f" />
            <StatCard label="Sent → Closed Rate" value={n.convRate + '%'} now={n.convRate} prev={p.convRate} accent="#F5A623" />
          </div>

          {/* Pipeline funnel */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Pipeline — {label[period]}</div>
            {[
              { k:'Sent Out', v:n.sent, c:'#0EA5E9' },
              { k:'Accepted', v:n.accepted, c:'#00c875' },
              { k:'Under Contract', v:n.uc, c:'#757575' },
              { k:'Closed', v:n.closed, c:'#225091' },
            ].map((s, i, arr) => {
              const max = arr[0].v || 1
              const pctPrev = i > 0 && arr[i-1].v > 0 ? Math.round((s.v / arr[i-1].v) * 100) : null
              return (
                <div key={s.k} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.k}</span>
                    <span style={{ color: 'var(--muted)' }}>{s.v}{pctPrev != null ? ' · ' + pctPrev + '% of prior step' : ''}</span>
                  </div>
                  <div style={{ height: 22, background: 'var(--dim)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ width: Math.max(2, (s.v / max) * 100) + '%', height: '100%', background: s.c, borderRadius: 6, transition: 'width .3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── AGENTS ── */}
      {tab === 'agents' && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: 'var(--dim)' }}>
                  {['Agent','Closed','Sent','GCI / Commission','Production','Calls','New Contacts','Conv %'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentRows.map(({ agent, now, prev }) => (
                  <tr key={agent.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: agent.color || '#CC2200', marginRight: 8 }} />
                      {agent.name}
                    </td>
                    {[
                      { now: now.deals, prev: prev.deals },
                      { now: now.sent, prev: prev.sent },
                      { now: now.gci, prev: prev.gci, money: true },
                      { now: now.prod, prev: prev.prod, money: true },
                      { now: now.calls, prev: prev.calls },
                      { now: now.contacts, prev: prev.contacts },
                      { now: now.conv, prev: prev.conv, suffix: '%' },
                    ].map((cell, ci) => (
                      <td key={ci} style={{ padding: '11px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cell.money ? fmt$(cell.now) : cell.now}{cell.suffix || ''}</div>
                        <div style={{ fontSize: 10 }}><Trend now={cell.now} prev={cell.prev} money={cell.money} /></div>
                      </td>
                    ))}
                  </tr>
                ))}
                {agentRows.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No agent data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default Analytics
