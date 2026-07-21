// ═══════════════════════════════════════════════════════════════
// TargetOS — Reports & Analytics (July 2026)
// One hub, two lenses (Business + Agents), rich graphs, custom date
// ranges, and comparison against the SAME period prior (same length,
// immediately before — e.g. this 30 days vs the previous 30 days).
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useAgents } from '../lib/hooks'
import { fmt$, parseNum } from '../lib/utils'
import { Loading } from '../components/UI'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts'

const ff = 'Inter,system-ui,sans-serif'
const PALETTE = ['#CC2200', '#225091', '#00c875', '#F5A623', '#8B5CF6', '#0EA5E9', '#EC4899', '#65A30D', '#B45309', '#6B7280']

const iso = d => d.toISOString().slice(0, 10)
function presetRange(kind) {
  const end = new Date(); end.setHours(23,59,59,999)
  const start = new Date()
  if (kind === 'week')    start.setDate(start.getDate() - 6)
  if (kind === 'month')   start.setDate(start.getDate() - 29)
  if (kind === 'quarter') start.setDate(start.getDate() - 89)
  if (kind === 'year')    start.setDate(start.getDate() - 364)
  start.setHours(0,0,0,0)
  return { start, end }
}
function priorSamePeriod(r) {
  const len = r.end.getTime() - r.start.getTime()
  const end = new Date(r.start.getTime() - 1)
  const start = new Date(end.getTime() - len)
  return { start, end }
}
const inRange = (dateStr, r) => { if (!dateStr) return false; const t = new Date(dateStr).getTime(); return t >= r.start.getTime() && t <= r.end.getTime() }
const daysBetween = r => Math.max(1, Math.round((r.end - r.start) / 86400000) + 1)

function Trend({ now, prev, money, invert }) {
  if (prev == null) return null
  const diff = now - prev
  const pct = prev !== 0 ? Math.round((diff / Math.abs(prev)) * 100) : (now > 0 ? 100 : 0)
  if (diff === 0) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>— no change</span>
  const good = invert ? diff < 0 : diff > 0
  return (
    <span style={{ fontSize: 11.5, fontWeight: 700, color: good ? '#0B7A45' : '#DC2626' }}>
      {diff > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span style={{ color: 'var(--muted)', fontWeight: 500 }}>vs {money ? fmt$(prev) : prev} prior</span>
    </span>
  )
}
function StatCard({ label, value, now, prev, money, invert, accent }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', borderTop: '3px solid ' + (accent || 'var(--brand)') }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6 }}><Trend now={now} prev={prev} money={money} invert={invert} /></div>
    </div>
  )
}
function Panel({ title, children, height = 300 }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>{title}</div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}
const axis = { fontSize: 11, fontFamily: ff }

export function Analytics() {
  const { isAdmin, canManage } = useAuth()
  const { agents } = useAgents()
  const [tab, setTab]       = useState('business')
  const [preset, setPreset] = useState('month')
  const [customOn, setCustomOn] = useState(false)
  const [cStart, setCStart] = useState(iso(presetRange('month').start))
  const [cEnd, setCEnd]     = useState(iso(new Date()))
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ deals: [], offers: [], calls: [], contacts: [], showings: [], tasks: [], activity: [] })

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const safe = async (p) => { try { const r = await p; return r.data || [] } catch { return [] } }
      const [deals, offers, calls, contacts, showings, tasks, activity] = await Promise.all([
        safe(supabase.from('deals').select('id,stage,gci,production,ao_date,close_date,created_at,agent_id,side,source').range(0,4999)),
        safe(supabase.from('offers').select('id,status,offer_date,created_at,agent_id,buyers_agent_id,listing_addr,purchase_price').range(0,4999)),
        safe(supabase.from('calls').select('id,agent_id,direction,outcome,is_sms,kind,created_at').range(0,19999)),
        safe(supabase.from('contacts').select('id,agent_id,created_at,status,source').range(0,19999)),
        safe(supabase.from('showings').select('id,agent_id,showing_date,created_at,listing_id').range(0,9999)),
        safe(supabase.from('tasks').select('id,agent_id,status,completed,created_at,completed_at').range(0,9999)),
        safe(supabase.from('record_activity').select('id,agent_name,action,created_at').range(0,19999)),
      ])
      if (alive) { setData({ deals, offers, calls, contacts, showings, tasks, activity }); setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  const cur = useMemo(() => {
    if (customOn) { const s = new Date(cStart); s.setHours(0,0,0,0); const e = new Date(cEnd); e.setHours(23,59,59,999); return { start: s, end: e } }
    return presetRange(preset)
  }, [customOn, cStart, cEnd, preset])
  const prev = useMemo(() => priorSamePeriod(cur), [cur])

  const { deals, offers, calls, contacts, showings, tasks, activity } = data
  const isSms = c => c.is_sms === true || c.kind === 'sms' || String(c.direction||'').toLowerCase().includes('sms')

  const biz = useMemo(() => {
    const calc = (r) => {
      const sent     = offers.filter(o => inRange(o.offer_date || o.created_at, r))
      const accepted = offers.filter(o => ['AO','Accepted','Closed'].includes(o.status) && inRange(o.offer_date || o.created_at, r))
      const uc       = deals.filter(d => d.stage === 'Under Contract' && inRange(d.ao_date || d.created_at, r))
      const closed   = deals.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, r))
      const fell     = deals.filter(d => d.stage === 'Deal Fell Through' && inRange(d.created_at, r))
      const gci      = closed.reduce((s,d) => s + parseNum(d.gci), 0)
      const prod     = closed.reduce((s,d) => s + parseNum(d.production), 0)
      return {
        sent: sent.length, accepted: accepted.length, uc: uc.length, closed: closed.length, fell: fell.length,
        gci, prod, avgGci: closed.length ? gci/closed.length : 0,
        convRate: sent.length ? Math.round((closed.length/sent.length)*100) : 0,
        acceptRate: sent.length ? Math.round((accepted.length/sent.length)*100) : 0,
      }
    }
    return { now: calc(cur), prev: calc(prev) }
  }, [offers, deals, cur, prev])

  const interactions = useMemo(() => {
    const calc = (r) => ({
      calls: calls.filter(c => !isSms(c) && inRange(c.created_at, r)).length,
      sms:   calls.filter(c => isSms(c) && inRange(c.created_at, r)).length,
      showings: showings.filter(s => inRange(s.showing_date || s.created_at, r)).length,
      contacts: contacts.filter(c => inRange(c.created_at, r)).length,
      tasksDone: tasks.filter(t => (t.status === 'done' || t.completed) && inRange(t.completed_at || t.created_at, r)).length,
      notes: activity.filter(a => inRange(a.created_at, r)).length,
    })
    return { now: calc(cur), prev: calc(prev) }
  }, [calls, showings, contacts, tasks, activity, cur, prev])

  const series = useMemo(() => {
    const days = daysBetween(cur)
    const buckets = days <= 31 ? days : (days <= 92 ? Math.ceil(days/7) : 12)
    const bucketMs = (cur.end - cur.start) / buckets
    return Array.from({ length: buckets }, (_, i) => {
      const bs = new Date(cur.start.getTime() + i*bucketMs)
      const be = new Date(cur.start.getTime() + (i+1)*bucketMs)
      const lbl = days <= 31 ? (bs.getMonth()+1)+'/'+bs.getDate() : days <= 92 ? 'Wk '+(i+1) : bs.toLocaleString('en',{month:'short'})
      const within = (ds) => { if (!ds) return false; const t = new Date(ds).getTime(); return t >= bs.getTime() && t < be.getTime() }
      return {
        name: lbl,
        'Offers Sent': offers.filter(o => within(o.offer_date || o.created_at)).length,
        'Closed': deals.filter(d => d.stage === 'Closed' && within(d.close_date || d.created_at)).length,
        'GCI': Math.round(deals.filter(d => d.stage === 'Closed' && within(d.close_date || d.created_at)).reduce((s,d)=>s+parseNum(d.gci),0)),
        'Calls': calls.filter(c => !isSms(c) && within(c.created_at)).length,
        'SMS': calls.filter(c => isSms(c) && within(c.created_at)).length,
      }
    })
  }, [offers, deals, calls, cur])

  const sourceData = useMemo(() => {
    const closed = deals.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, cur))
    const m = {}
    closed.forEach(d => { const k = d.source || 'Unknown'; m[k] = (m[k]||0)+1 })
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value)
  }, [deals, cur])

  const agentRows = useMemo(() => {
    const calc = (id, r) => {
      const closed = deals.filter(d => d.agent_id === id && d.stage === 'Closed' && inRange(d.close_date || d.created_at, r))
      const sent   = offers.filter(o => (o.agent_id === id || o.buyers_agent_id === id) && inRange(o.offer_date || o.created_at, r))
      return {
        deals: closed.length, sent: sent.length,
        gci: closed.reduce((s,d)=>s+parseNum(d.gci),0),
        prod: closed.reduce((s,d)=>s+parseNum(d.production),0),
        calls: calls.filter(c => c.agent_id === id && !isSms(c) && inRange(c.created_at, r)).length,
        sms: calls.filter(c => c.agent_id === id && isSms(c) && inRange(c.created_at, r)).length,
        showings: showings.filter(s => s.agent_id === id && inRange(s.showing_date || s.created_at, r)).length,
        contacts: contacts.filter(c => c.agent_id === id && inRange(c.created_at, r)).length,
        conv: sent.length ? Math.round((closed.length/sent.length)*100) : 0,
      }
    }
    return (agents||[]).map(a => ({ agent: a, now: calc(a.id, cur), prev: calc(a.id, prev) })).sort((x,y) => y.now.gci - x.now.gci)
  }, [agents, deals, offers, calls, showings, contacts, cur, prev])

  if (!isAdmin && !canManage) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: ff }}>Analytics is available to admins and office staff.</div>
  if (loading) return <Loading />

  const n = biz.now, p = biz.prev, ix = interactions.now, ixp = interactions.prev
  const rangeLabel = customOn ? (cStart + ' → ' + cEnd) : ({ week:'Last 7 days', month:'Last 30 days', quarter:'Last 90 days', year:'Last 12 months' }[preset])

  return (
    <div style={{ padding: '20px 24px', fontFamily: ff, maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>📈 Reports &amp; Analytics</h1>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{rangeLabel} · compared to the same period just before</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!customOn && (
            <div style={{ display: 'flex', gap: 4, background: 'var(--dim)', padding: 4, borderRadius: 10 }}>
              {['week','month','quarter','year'].map(pk => (
                <button key={pk} onClick={() => setPreset(pk)}
                  style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: ff, fontSize: 12, fontWeight: 700,
                    background: preset === pk ? 'var(--panel)' : 'transparent', color: preset === pk ? 'var(--brand)' : 'var(--muted)',
                    boxShadow: preset === pk ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>
                  {pk === 'week' ? '7d' : pk === 'month' ? '30d' : pk === 'quarter' ? '90d' : '1yr'}
                </button>
              ))}
            </div>
          )}
          {customOn && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={cStart} onChange={e => setCStart(e.target.value)} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12, fontFamily: ff }} />
              <span style={{ color: 'var(--muted)' }}>→</span>
              <input type="date" value={cEnd} onChange={e => setCEnd(e.target.value)} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12, fontFamily: ff }} />
            </div>
          )}
          <button onClick={() => setCustomOn(v => !v)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid ' + (customOn ? 'var(--brand)' : 'var(--border)'), background: customOn ? 'rgba(204,34,0,.07)' : 'var(--dim)', color: customOn ? 'var(--brand)' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            📅 {customOn ? 'Presets' : 'Custom dates'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {[{ id:'business', label:'🏢 Business' }, { id:'agents', label:'👤 Agents' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--brand)' : '2px solid transparent',
              background: 'transparent', color: tab === t.id ? 'var(--brand)' : 'var(--muted)', fontSize: 14, fontWeight: tab === t.id ? 800 : 600, cursor: 'pointer', fontFamily: ff, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'business' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>
            <StatCard label="Offers Sent Out" value={n.sent} now={n.sent} prev={p.sent} accent="#0EA5E9" />
            <StatCard label="Offers Accepted" value={n.accepted} now={n.accepted} prev={p.accepted} accent="#00c875" />
            <StatCard label="Under Contract" value={n.uc} now={n.uc} prev={p.uc} accent="#757575" />
            <StatCard label="Closed Deals" value={n.closed} now={n.closed} prev={p.closed} accent="#225091" />
            <StatCard label="Production Volume" value={fmt$(n.prod)} now={n.prod} prev={p.prod} money accent="#037f4c" />
            <StatCard label="GCI / Commissions" value={fmt$(n.gci)} now={n.gci} prev={p.gci} money accent="#CC2200" />
            <StatCard label="Avg GCI / Deal" value={fmt$(n.avgGci)} now={n.avgGci} prev={p.avgGci} money accent="#8B5CF6" />
            <StatCard label="Acceptance Rate" value={n.acceptRate + '%'} now={n.acceptRate} prev={p.acceptRate} accent="#F5A623" />
            <StatCard label="Sent → Closed" value={n.convRate + '%'} now={n.convRate} prev={p.convRate} accent="#EC4899" />
            <StatCard label="Fell Through" value={n.fell} now={n.fell} prev={p.fell} invert accent="#ff007f" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            <Panel title="Offers Sent vs Closed">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} allowDecimals={false} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Offers Sent" stroke="#0EA5E9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Closed" stroke="#225091" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="GCI / Commissions over time">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="gci" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#CC2200" stopOpacity={0.5}/><stop offset="100%" stopColor="#CC2200" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={v => '$'+(v/1000)+'k'} />
                  <Tooltip formatter={v => fmt$(v)} />
                  <Area type="monotone" dataKey="GCI" stroke="#CC2200" strokeWidth={2} fill="url(#gci)" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            <StatCard label="📞 Calls" value={ix.calls} now={ix.calls} prev={ixp.calls} accent="#0EA5E9" />
            <StatCard label="💬 Texts (SMS)" value={ix.sms} now={ix.sms} prev={ixp.sms} accent="#00c875" />
            <StatCard label="🏠 Showings" value={ix.showings} now={ix.showings} prev={ixp.showings} accent="#8B5CF6" />
            <StatCard label="👤 New Contacts" value={ix.contacts} now={ix.contacts} prev={ixp.contacts} accent="#F5A623" />
            <StatCard label="✅ Tasks Done" value={ix.tasksDone} now={ix.tasksDone} prev={ixp.tasksDone} accent="#65A30D" />
            <StatCard label="📝 Notes / Activity" value={ix.notes} now={ix.notes} prev={ixp.notes} accent="#6B7280" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            <Panel title="Calls & Texts over time">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} allowDecimals={false} />
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Calls" fill="#0EA5E9" radius={[3,3,0,0]} />
                  <Bar dataKey="SMS" fill="#00c875" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Closed Deals by Source">
              {sourceData.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No closed deals in this period.</div> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={e => e.name + ' (' + e.value + ')'} labelLine={false} style={{ fontSize: 11 }}>
                      {sourceData.map((e, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Panel title="GCI by Agent" height={Math.max(220, agentRows.length * 34)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentRows.map(r => ({ name: r.agent.name, GCI: Math.round(r.now.gci) }))} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={axis} tickFormatter={v => '$'+(v/1000)+'k'} />
                <YAxis type="category" dataKey="name" tick={axis} width={90} />
                <Tooltip formatter={v => fmt$(v)} />
                <Bar dataKey="GCI" fill="#CC2200" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr style={{ background: 'var(--dim)' }}>
                    {['Agent','Closed','Offers Sent','GCI','Production','Calls','Texts','Showings','New Contacts','Conv %'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map(({ agent, now, prev }) => (
                    <tr key={agent.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: agent.color || '#CC2200', marginRight: 8 }} />{agent.name}
                      </td>
                      {[
                        { now: now.deals, prev: prev.deals },
                        { now: now.sent, prev: prev.sent },
                        { now: now.gci, prev: prev.gci, money: true },
                        { now: now.prod, prev: prev.prod, money: true },
                        { now: now.calls, prev: prev.calls },
                        { now: now.sms, prev: prev.sms },
                        { now: now.showings, prev: prev.showings },
                        { now: now.contacts, prev: prev.contacts },
                        { now: now.conv, prev: prev.conv, suffix: '%' },
                      ].map((cell, ci) => (
                        <td key={ci} style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cell.money ? fmt$(cell.now) : cell.now}{cell.suffix || ''}</div>
                          <div style={{ fontSize: 10 }}><Trend now={cell.now} prev={cell.prev} money={cell.money} /></div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {agentRows.length === 0 && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No agent data.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Analytics
