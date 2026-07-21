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
      <div style={height === 'auto' ? undefined : { height }}>{children}</div>
    </div>
  )
}
const axis = { fontSize: 11, fontFamily: ff }

export function Analytics() {
  const { isAdmin, canManage } = useAuth()
  const { agents } = useAgents()
  const [tab, setTab]       = useState('summary')
  const [preset, setPreset] = useState('month')
  const [customOn, setCustomOn] = useState(false)
  const [cStart, setCStart] = useState(iso(presetRange('month').start))
  const [cEnd, setCEnd]     = useState(iso(new Date()))
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ deals: [], offers: [], calls: [], contacts: [], showings: [], tasks: [], activity: [], tcDeals: [], listings: [] })
  const [goals, setGoals] = useState({})   // agent_id -> {deals,gci,production}
  const [savingGoal, setSavingGoal] = useState(false)
  const thisYear = new Date().getFullYear()

  async function loadGoals() {
    try {
      const { data: g } = await supabase.from('agent_goals').select('agent_id, deals, gci, production').eq('year', thisYear)
      const m = {}; (g || []).forEach(r => { m[r.agent_id] = r }); setGoals(m)
    } catch {}
  }
  useEffect(() => { loadGoals() }, [])

  async function saveGoal(agentId, field, value) {
    setSavingGoal(true)
    const cur = goals[agentId] || { deals: 0, gci: 0, production: 0 }
    const next = { ...cur, [field]: parseNum(value) }
    setGoals(g => ({ ...g, [agentId]: next }))
    try {
      await supabase.from('agent_goals').upsert({ agent_id: agentId, year: thisYear, deals: next.deals || 0, gci: next.gci || 0, production: next.production || 0, updated_at: new Date().toISOString() }, { onConflict: 'agent_id,year' })
    } catch (e) { alert('Could not save goal: ' + e.message) }
    setSavingGoal(false)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const safe = async (p) => { try { const r = await p; return r.data || [] } catch { return [] } }
      const [deals, offers, calls, contacts, showings, tasks, activity] = await Promise.all([
        safe(supabase.from('deals').select('*').range(0,4999)),
        safe(supabase.from('offers').select('id,status,offer_date,created_at,agent_id,buyers_agent_id,listing_addr,purchase_price').range(0,4999)),
        safe(supabase.from('calls').select('id,agent_id,direction,outcome,is_sms,kind,created_at').range(0,19999)),
        safe(supabase.from('contacts').select('id,agent_id,created_at,status,source,first_name,last_name').range(0,19999)),
        safe(supabase.from('showings').select('id,agent_id,showing_date,created_at,listing_id').range(0,9999)),
        safe(supabase.from('tasks').select('id,agent_id,status,completed,created_at,completed_at,due_date,title').range(0,9999)),
        safe(supabase.from('record_activity').select('id,agent_name,action,created_at').range(0,19999)),
      ])
      const tcDeals = await safe(supabase.from('tc_deals').select('id,addr,agent_id,tc_phase,attorney_name,mortgage_broker,inspector,close_date').range(0,4999))
      const listings = await safe(supabase.from('listings').select('id,addr,status,list_price,original_price,list_date,listed_date,created_at,agent_id,seller_updated_at,marketing_status').range(0,4999))
      if (alive) { setData({ deals, offers, calls, contacts, showings, tasks, activity, tcDeals, listings }); setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  const cur = useMemo(() => {
    if (customOn) { const s = new Date(cStart); s.setHours(0,0,0,0); const e = new Date(cEnd); e.setHours(23,59,59,999); return { start: s, end: e } }
    return presetRange(preset)
  }, [customOn, cStart, cEnd, preset])
  const prev = useMemo(() => priorSamePeriod(cur), [cur])

  const { deals, offers, calls, contacts, showings, tasks, activity, tcDeals, listings } = data
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

  // ── Year-over-year "as of this date" ──────────────────────────
  // Jan 1 → the end of the current range, this year vs the identical
  // window last year (Jan 1 → same month/day last year).
  const yoy = useMemo(() => {
    const asOf = cur.end
    const ytd = { start: new Date(asOf.getFullYear(), 0, 1), end: asOf }
    const lastYtd = { start: new Date(asOf.getFullYear()-1, 0, 1), end: new Date(asOf.getFullYear()-1, asOf.getMonth(), asOf.getDate(), 23,59,59,999) }
    const calc = (r) => {
      const closed = deals.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, r))
      const sent   = offers.filter(o => inRange(o.offer_date || o.created_at, r))
      return {
        closed: closed.length,
        gci: closed.reduce((s,d)=>s+parseNum(d.gci),0),
        prod: closed.reduce((s,d)=>s+parseNum(d.production),0),
        sent: sent.length,
        pipeline: deals.filter(d => ['Negotiations','Offer Accapted','Under Shtar','Under Contract'].includes(d.stage)).reduce((s,d)=>s+parseNum(d.production),0),
      }
    }
    return { asOf, now: calc(ytd), prev: calc(lastYtd) }
  }, [deals, offers, cur])

  // ── Alerts (Tier A subset — from data we have) ────────────────
  const alerts = useMemo(() => {
    const now = Date.now()
    const soon = deals.filter(d => d.stage === 'Under Contract' && d.close_date && (() => { const dd = new Date(d.close_date).getTime(); return dd >= now && dd <= now + 7*86400000 })())
    const stale = deals.filter(d => ['Negotiations','Offer Accapted','Under Shtar','Under Contract'].includes(d.stage) && d.created_at && (now - new Date(d.created_at).getTime() > 90*86400000))
    // Active TC deals missing key party info
    const active = (tcDeals || []).filter(t => t.tc_phase !== 'closed' && t.tc_phase !== 'dead')
    const missingInfo = active.filter(t => !t.attorney_name || !t.mortgage_broker).map(t => ({
      ...t, missing: [!t.attorney_name && 'attorney', !t.mortgage_broker && 'mortgage broker'].filter(Boolean).join(', ')
    }))
    const overdueTasks = (tasks || []).filter(t => t.status !== 'done' && !t.completed && t.due_date && new Date(t.due_date).getTime() < now)
    const uncontacted = (contacts || []).filter(c => c.status === 'New' && c.contacted !== true)
    return { closingSoon: soon, stuck: stale, missingInfo, overdueTasks, uncontacted }
  }, [deals, tcDeals, tasks, contacts])

  // Commission tracking (from Tier-B fields; falls back gracefully)
  const sideSplit = useMemo(() => {
    const closed = deals.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, cur))
    const norm = s => { const v = String(s||'').toLowerCase(); if (v.includes('dual')||v.includes('both')) return 'Dual'; if (v.includes('list')||v.includes('sell')) return 'Listing'; if (v.includes('buy')) return 'Buyer'; return 'Unspecified' }
    const g = { Buyer:{n:0,gci:0,prod:0}, Listing:{n:0,gci:0,prod:0}, Dual:{n:0,gci:0,prod:0}, Unspecified:{n:0,gci:0,prod:0} }
    closed.forEach(d => { const k = norm(d.side); g[k].n++; g[k].gci += parseNum(d.gci); g[k].prod += parseNum(d.production) })
    return g
  }, [deals, cur])

  const commission = useMemo(() => {
    const closed = deals.filter(d => d.stage === 'Closed' && inRange(d.close_date || d.created_at, cur))
    const total = closed.reduce((s,d)=>s+parseNum(d.gci),0)
    const collected = closed.reduce((s,d)=>{
      if (d.commission_status === 'collected') return s + parseNum(d.collected_gci ?? d.gci)
      if (d.commission_status === 'partial')   return s + parseNum(d.collected_gci ?? 0)
      return s
    }, 0)
    return { total, collected, outstanding: Math.max(0, total - collected) }
  }, [deals, cur])

  if (!isAdmin && !canManage) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: ff }}>Analytics is available to admins and office staff.</div>
  if (loading) return <Loading />

  const n = biz.now, p = biz.prev, ix = interactions.now, ixp = interactions.prev
  const alertCount = alerts.closingSoon.length + alerts.missingInfo.length + alerts.overdueTasks.length + alerts.uncontacted.length

  function downloadCSV(filename, rows) {
    if (!rows.length) { alert('Nothing to export for this view.'); return }
    const headers = Object.keys(rows[0])
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }
  function exportCSV() {
    const stamp = new Date().toISOString().slice(0,10)
    if (tab === 'agents' || tab === 'goals') {
      downloadCSV('agent-performance-' + stamp + '.csv', agentRows.map(r => ({
        Agent: r.agent.name, Closed: r.now.deals, OffersSent: r.now.sent, GCI: Math.round(r.now.gci),
        Production: Math.round(r.now.prod), Calls: r.now.calls, Texts: r.now.sms, Showings: r.now.showings,
        NewContacts: r.now.contacts, ConversionPct: r.now.conv,
      })))
    } else if (tab === 'listings') {
      downloadCSV('listings-' + stamp + '.csv', (listings||[]).map(l => ({
        Address: l.addr, Status: l.status, Agent: (agents||[]).find(a=>a.id===l.agent_id)?.name||'', ListPrice: parseNum(l.list_price),
        OriginalPrice: l.original_price?parseNum(l.original_price):'', SellerUpdated: l.seller_updated_at||'',
      })))
    } else {
      // business/summary/pipeline → company KPI snapshot
      downloadCSV('company-report-' + stamp + '.csv', [{
        Period: rangeLabel, OffersSent: n.sent, OffersAccepted: n.accepted, UnderContract: n.uc, Closed: n.closed,
        Production: Math.round(n.prod), GCI: Math.round(n.gci), CommissionCollected: Math.round(commission.collected),
        CommissionOutstanding: Math.round(commission.outstanding), AvgGCI: Math.round(n.avgGci),
        AcceptanceRatePct: n.acceptRate, SentToClosedPct: n.convRate, FellThrough: n.fell,
      }])
    }
  }
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
          <button onClick={exportCSV}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--dim)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            ⬇ CSV
          </button>
          <button onClick={() => window.print()}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--dim)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            🖨 PDF / Print
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {[{ id:'summary', label:'⭐ Summary' }, { id:'business', label:'🏢 Business' }, { id:'pipeline', label:'🔻 Pipeline' }, { id:'listings', label:'🏡 Listings' }, { id:'agents', label:'👤 Agents' }, { id:'goals', label:'🎯 Goals' }, { id:'alerts', label:'🔔 Alerts' + (alertCount ? ' (' + alertCount + ')' : '') }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--brand)' : '2px solid transparent',
              background: 'transparent', color: tab === t.id ? 'var(--brand)' : 'var(--muted)', fontSize: 14, fontWeight: tab === t.id ? 800 : 600, cursor: 'pointer', fontFamily: ff, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Headline KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>
            <StatCard label="Closed Deals" value={n.closed} now={n.closed} prev={p.closed} accent="#225091" />
            <StatCard label="Production" value={fmt$(n.prod)} now={n.prod} prev={p.prod} money accent="#037f4c" />
            <StatCard label="GCI / Commissions" value={fmt$(n.gci)} now={n.gci} prev={p.gci} money accent="#CC2200" />
            <StatCard label="Under Contract" value={n.uc} now={n.uc} prev={p.uc} accent="#757575" />
            <StatCard label="Offers Sent" value={n.sent} now={n.sent} prev={p.sent} accent="#0EA5E9" />
            <StatCard label="Offers Accepted" value={n.accepted} now={n.accepted} prev={p.accepted} accent="#00c875" />
          </div>

          {/* Year over year, as of this date */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>📆 This Year vs Last Year — as of {yoy.asOf.toLocaleDateString()}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 14 }}>Jan 1 → {yoy.asOf.toLocaleDateString()} compared to the exact same window last year</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
              {[
                { k:'Closed', now: yoy.now.closed, prev: yoy.prev.closed },
                { k:'Production', now: yoy.now.prod, prev: yoy.prev.prod, money: true },
                { k:'GCI', now: yoy.now.gci, prev: yoy.prev.gci, money: true },
                { k:'Offers Sent', now: yoy.now.sent, prev: yoy.prev.sent },
              ].map(m => (
                <div key={m.k} style={{ padding: '10px 12px', background: 'var(--dim)', borderRadius: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{m.k}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>{m.money ? fmt$(m.now) : m.now}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>last year: {m.money ? fmt$(m.prev) : m.prev}</div>
                  <div style={{ marginTop: 2 }}><Trend now={m.now} prev={m.prev} money={m.money} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <Panel title={'🔔 Closing within 7 days (' + alerts.closingSoon.length + ')'} height="auto">
              {alerts.closingSoon.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nothing closing this week.</div>
                : alerts.closingSoon.slice(0,8).map(d => (
                  <div key={d.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                    <span style={{ fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{d.addr}</span>
                    <span style={{ color:'#DC2626', fontWeight:700, flexShrink:0 }}>{new Date(d.close_date).toLocaleDateString()}</span>
                  </div>
                ))}
            </Panel>
            <Panel title={'⏳ Stuck 90+ days (' + alerts.stuck.length + ')'} height="auto">
              {alerts.stuck.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No stuck deals.</div>
                : alerts.stuck.slice(0,8).map(d => (
                  <div key={d.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                    <span style={{ fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{d.addr}</span>
                    <span style={{ color:'var(--muted)', flexShrink:0 }}>{d.stage}</span>
                  </div>
                ))}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'pipeline' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Panel title="Pipeline by Stage" height="auto">
            {(() => {
              const stages = ['Negotiations','Offer Accapted','Under Shtar','Under Contract','Closed']
              const colors = { 'Negotiations':'#037f4c','Offer Accapted':'#00c875','Under Shtar':'#bb3354','Under Contract':'#757575','Closed':'#225091' }
              const counts = stages.map(st => ({ st, n: deals.filter(d => d.stage === st).length, gci: deals.filter(d => d.stage === st).reduce((s,d)=>s+parseNum(d.gci),0) }))
              const max = Math.max(1, ...counts.map(c => c.n))
              return counts.map(c => (
                <div key={c.st} style={{ marginBottom: 12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                    <span style={{ fontWeight:700, color:'var(--text)' }}>{c.st}</span>
                    <span style={{ color:'var(--muted)' }}>{c.n} {c.gci > 0 ? '· ' + fmt$(c.gci) + ' GCI' : ''}</span>
                  </div>
                  <div style={{ height: 26, background:'var(--dim)', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ width: Math.max(3,(c.n/max)*100)+'%', height:'100%', background: colors[c.st], borderRadius:6, transition:'width .3s' }} />
                  </div>
                </div>
              ))
            })()}
          </Panel>
        </div>
      )}

      {tab === 'goals' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {(() => {
            const now = new Date()
            const startY = new Date(thisYear, 0, 1)
            const endY = new Date(thisYear, 11, 31)
            const dayOfYear = Math.floor((now - startY) / 86400000) + 1
            const daysLeft = Math.max(1, Math.floor((endY - now) / 86400000))
            const weeksLeft = Math.max(1, daysLeft / 7)
            const monthsLeft = Math.max(1, (12 - now.getMonth()) - now.getDate()/30)
            const yearFrac = dayOfYear / 365

            // company totals
            const closedYTD = deals.filter(d => d.stage === 'Closed' && (d.close_date||d.created_at||'').startsWith(String(thisYear)))
            const compActual = { deals: closedYTD.length, gci: closedYTD.reduce((s,d)=>s+parseNum(d.gci),0), production: closedYTD.reduce((s,d)=>s+parseNum(d.production),0) }
            const compGoal = Object.values(goals).reduce((a,g)=>({ deals:a.deals+(g.deals||0), gci:a.gci+(g.gci||0), production:a.production+(g.production||0) }), { deals:0, gci:0, production:0 })

            const GoalBar = ({ label, actual, goal, money }) => {
              const pct = goal > 0 ? Math.min(100, Math.round((actual/goal)*100)) : 0
              const projected = yearFrac > 0 ? Math.round(actual / yearFrac) : 0
              const onPace = goal > 0 && projected >= goal
              const remaining = Math.max(0, goal - actual)
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                    <span style={{ fontWeight:700, color:'var(--text)' }}>{label}</span>
                    <span style={{ color:'var(--muted)' }}>{money?fmt$(actual):actual} / {money?fmt$(goal):goal} <b style={{ color: onPace?'#0B7A45':'#DC2626' }}>({pct}%)</b></span>
                  </div>
                  <div style={{ height:22, background:'var(--dim)', borderRadius:6, overflow:'hidden', marginBottom:4 }}>
                    <div style={{ width: pct+'%', height:'100%', background: onPace?'#0B7A45':'#F5A623', borderRadius:6, transition:'width .3s' }} />
                  </div>
                  {goal > 0 && (
                    <div style={{ fontSize:11, color:'var(--muted)' }}>
                      Projected year-end: <b style={{ color: onPace?'#0B7A45':'#DC2626' }}>{money?fmt$(projected):projected}</b> ({onPace?'ahead of':'behind'} pace) ·
                      Need {money?fmt$(Math.ceil(remaining/monthsLeft)):Math.ceil(remaining/monthsLeft)}/mo · {money?fmt$(Math.ceil(remaining/weeksLeft)):Math.ceil(remaining/weeksLeft)}/wk to hit goal
                    </div>
                  )}
                </div>
              )
            }

            return (
              <>
                <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:18 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:2 }}>🏢 Company Goals — {thisYear}</div>
                  <div style={{ fontSize:11.5, color:'var(--muted)', marginBottom:14 }}>Sum of all agent goals · {daysLeft} days left in the year</div>
                  <GoalBar label="Closed Deals" actual={compActual.deals} goal={compGoal.deals} />
                  <GoalBar label="GCI / Commissions" actual={compActual.gci} goal={compGoal.gci} money />
                  <GoalBar label="Production Volume" actual={compActual.production} goal={compGoal.production} money />
                </div>

                <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', fontSize:14, fontWeight:800, color:'var(--text)', borderBottom:'1px solid var(--border)' }}>🎯 Set Agent Goals ({thisYear})</div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640 }}>
                      <thead><tr style={{ background:'var(--dim)' }}>
                        {['Agent','Deals Goal','Closed (YTD)','GCI Goal','GCI (YTD)','Production Goal','Prod (YTD)'].map((h,i) => (
                          <th key={h} style={{ padding:'9px 12px', textAlign:i===0?'left':'right', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(agents||[]).map(a => {
                          const g = goals[a.id] || {}
                          const ac = deals.filter(d => d.agent_id===a.id && d.stage==='Closed' && (d.close_date||d.created_at||'').startsWith(String(thisYear)))
                          const acD = ac.length, acG = ac.reduce((s,d)=>s+parseNum(d.gci),0), acP = ac.reduce((s,d)=>s+parseNum(d.production),0)
                          const gInp = { width:90, padding:'5px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, textAlign:'right' }
                          return (
                            <tr key={a.id} style={{ borderBottom:'1px solid var(--border)' }}>
                              <td style={{ padding:'8px 12px', fontWeight:700, color:'var(--text)', whiteSpace:'nowrap' }}>
                                <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:a.color||'#CC2200', marginRight:7 }} />{a.name}
                              </td>
                              <td style={{ padding:'8px 12px', textAlign:'right' }}><input type="number" defaultValue={g.deals||''} onBlur={e=>saveGoal(a.id,'deals',e.target.value)} style={gInp} /></td>
                              <td style={{ padding:'8px 12px', textAlign:'right', fontSize:12.5, color: acD>=(g.deals||0)&&g.deals?'#0B7A45':'var(--text)', fontWeight:600 }}>{acD}</td>
                              <td style={{ padding:'8px 12px', textAlign:'right' }}><input type="number" defaultValue={g.gci||''} onBlur={e=>saveGoal(a.id,'gci',e.target.value)} style={gInp} /></td>
                              <td style={{ padding:'8px 12px', textAlign:'right', fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{fmt$(acG)}</td>
                              <td style={{ padding:'8px 12px', textAlign:'right' }}><input type="number" defaultValue={g.production||''} onBlur={e=>saveGoal(a.id,'production',e.target.value)} style={gInp} /></td>
                              <td style={{ padding:'8px 12px', textAlign:'right', fontSize:12.5, color:'var(--text)', fontWeight:600 }}>{fmt$(acP)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding:'8px 16px', fontSize:11, color:'var(--muted)' }}>{savingGoal ? 'Saving…' : 'Type a goal and click away to save. YTD updates from closed deals.'}</div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {tab === 'alerts' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {alertCount === 0 && <div style={{ textAlign:'center', color:'var(--muted)', fontSize:14, padding:30 }}>✓ Nothing needs attention right now.</div>}
          {[
            { title:'🔔 Closing within 7 days', items: alerts.closingSoon, render: d => ({ main: d.addr, sub: new Date(d.close_date).toLocaleDateString(), col:'#DC2626' }) },
            { title:'📋 Active deals missing attorney / mortgage info', items: alerts.missingInfo, render: t => ({ main: t.addr, sub: 'missing: ' + t.missing, col:'#B45309' }) },
            { title:'⏰ Overdue tasks', items: alerts.overdueTasks, render: t => ({ main: t.title || 'Task', sub: 'due ' + new Date(t.due_date).toLocaleDateString(), col:'#DC2626' }) },
            { title:'📞 New leads not yet contacted', items: alerts.uncontacted, render: c => ({ main: [c.first_name,c.last_name].filter(Boolean).join(' ') || 'Lead', sub: c.source || '', col:'#0EA5E9' }) },
            { title:'⏳ Deals stuck 90+ days', items: alerts.stuck, render: d => ({ main: d.addr, sub: d.stage, col:'var(--muted)' }) },
          ].filter(g => g.items.length > 0).map(group => (
            <div key={group.title} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'11px 16px', fontSize:13, fontWeight:800, color:'var(--text)', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
                {group.title} <span style={{ color:'var(--muted)', fontWeight:600 }}>({group.items.length})</span>
              </div>
              {group.items.slice(0,15).map((it, i) => {
                const r = group.render(it)
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 16px', borderBottom:'1px solid var(--border)', fontSize:12.5 }}>
                    <span style={{ fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'60%' }}>{r.main || '—'}</span>
                    <span style={{ color:r.col, fontWeight:700, flexShrink:0 }}>{r.sub}</span>
                  </div>
                )
              })}
              {group.items.length > 15 && <div style={{ padding:'8px 16px', fontSize:11, color:'var(--muted)' }}>+{group.items.length-15} more</div>}
            </div>
          ))}
        </div>
      )}

      {tab === 'listings' && (() => {
        const now = Date.now()
        const agentName = id => (agents || []).find(a => a.id === id)?.name || '—'
        const dom = l => { const ld = l.listed_date || l.list_date || l.created_at; return ld ? Math.floor((now - new Date(ld).getTime())/86400000) : null }
        const byStatus = {}
        ;(listings || []).forEach(l => { const k = l.status || 'Unknown'; byStatus[k] = (byStatus[k]||0)+1 })
        const active = (listings || []).filter(l => l.status === 'Active')
        const sittingLong = active.filter(l => { const d = dom(l); return d != null && d > 90 })
        const reduced = (listings || []).filter(l => l.original_price && l.list_price && parseNum(l.list_price) < parseNum(l.original_price))
        const staleUpdate = active.filter(l => !l.seller_updated_at || (now - new Date(l.seller_updated_at).getTime() > 14*86400000))
        return (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              <StatCard label="Active" value={byStatus['Active']||0} now={byStatus['Active']||0} prev={null} accent="#00c875" />
              <StatCard label="Under Contract" value={byStatus['Under Contract']||0} now={byStatus['Under Contract']||0} prev={null} accent="#007eb5" />
              <StatCard label="Accepted Offer" value={byStatus['Accepted offer']||0} now={byStatus['Accepted offer']||0} prev={null} accent="#784bd1" />
              <StatCard label="Sold" value={byStatus['Sold']||0} now={byStatus['Sold']||0} prev={null} accent="#ffcb00" />
              <StatCard label="Avg Days on Market" value={active.length ? Math.round(active.reduce((s,l)=>s+(dom(l)||0),0)/active.length) : 0} now={0} prev={null} accent="#8B5CF6" />
              <StatCard label="Price Reductions" value={reduced.length} now={reduced.length} prev={null} invert accent="#F5A623" />
            </div>

            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'11px 16px', fontSize:13, fontWeight:800, color:'var(--text)', borderBottom:'1px solid var(--border)' }}>Active Listings — Days on Market</div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640 }}>
                  <thead><tr style={{ background:'var(--dim)' }}>
                    {['Address','Agent','List Price','Original','DOM','Seller Update'].map((h,i)=>(
                      <th key={h} style={{ padding:'9px 12px', textAlign:i===0?'left':'right', fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {active.sort((a,b)=>(dom(b)||0)-(dom(a)||0)).slice(0,25).map(l => {
                      const d = dom(l); const isReduced = l.original_price && parseNum(l.list_price) < parseNum(l.original_price)
                      const staleU = !l.seller_updated_at || (now - new Date(l.seller_updated_at).getTime() > 14*86400000)
                      return (
                        <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'9px 12px', fontWeight:600, color:'var(--text)', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.addr}</td>
                          <td style={{ padding:'9px 12px', textAlign:'right', fontSize:12, color:'var(--muted)' }}>{agentName(l.agent_id)}</td>
                          <td style={{ padding:'9px 12px', textAlign:'right', fontSize:12.5, fontWeight:600, color: isReduced?'#DC2626':'var(--text)' }}>{fmt$(parseNum(l.list_price))}</td>
                          <td style={{ padding:'9px 12px', textAlign:'right', fontSize:12, color:'var(--muted)' }}>{l.original_price?fmt$(parseNum(l.original_price)):'—'}</td>
                          <td style={{ padding:'9px 12px', textAlign:'right', fontSize:12.5, fontWeight:700, color: d>90?'#DC2626':d>60?'#F5A623':'var(--text)' }}>{d != null ? d+'d' : '—'}</td>
                          <td style={{ padding:'9px 12px', textAlign:'right', fontSize:11.5, color: staleU?'#DC2626':'#0B7A45', fontWeight:600 }}>{l.seller_updated_at?new Date(l.seller_updated_at).toLocaleDateString():'never'}</td>
                        </tr>
                      )
                    })}
                    {active.length===0 && <tr><td colSpan={6} style={{ padding:24, textAlign:'center', color:'var(--muted)' }}>No active listings.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:16 }}>
              <Panel title={'⏳ Sitting 90+ days (' + sittingLong.length + ')'} height="auto">
                {sittingLong.length===0 ? <div style={{ fontSize:12.5, color:'var(--muted)' }}>None sitting long.</div>
                  : sittingLong.slice(0,10).map(l => <div key={l.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12.5 }}><span style={{ fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{l.addr}</span><span style={{ color:'#DC2626', fontWeight:700 }}>{dom(l)}d</span></div>)}
              </Panel>
              <Panel title={'📢 No seller update in 14+ days (' + staleUpdate.length + ')'} height="auto">
                {staleUpdate.length===0 ? <div style={{ fontSize:12.5, color:'var(--muted)' }}>All sellers recently updated.</div>
                  : staleUpdate.slice(0,10).map(l => <div key={l.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:12.5 }}><span style={{ fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>{l.addr}</span><span style={{ color:'var(--muted)' }}>{l.seller_updated_at?new Date(l.seller_updated_at).toLocaleDateString():'never'}</span></div>)}
              </Panel>
            </div>
          </div>
        )
      })()}

      {tab === 'business' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>
            <StatCard label="Offers Sent Out" value={n.sent} now={n.sent} prev={p.sent} accent="#0EA5E9" />
            <StatCard label="Offers Accepted" value={n.accepted} now={n.accepted} prev={p.accepted} accent="#00c875" />
            <StatCard label="Under Contract" value={n.uc} now={n.uc} prev={p.uc} accent="#757575" />
            <StatCard label="Closed Deals" value={n.closed} now={n.closed} prev={p.closed} accent="#225091" />
            <StatCard label="Production Volume" value={fmt$(n.prod)} now={n.prod} prev={p.prod} money accent="#037f4c" />
            <StatCard label="GCI / Commissions" value={fmt$(n.gci)} now={n.gci} prev={p.gci} money accent="#CC2200" />
            <StatCard label="Commission Collected" value={fmt$(commission.collected)} now={commission.collected} prev={null} money accent="#0B7A45" />
            <StatCard label="Commission Outstanding" value={fmt$(commission.outstanding)} now={commission.outstanding} prev={null} money invert accent="#F5A623" />
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

          {/* Buyer / Listing / Dual side split */}
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:18 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text)', marginBottom:12 }}>Deal Side Split — Buyer vs Listing vs Dual</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12 }}>
              {[
                { k:'Buyer', c:'#0EA5E9' }, { k:'Listing', c:'#F5A623' }, { k:'Dual', c:'#8B5CF6' }, { k:'Unspecified', c:'#94A3B8' },
              ].filter(s => sideSplit[s.k].n > 0).map(s => (
                <div key={s.k} style={{ padding:'12px 14px', background:'var(--dim)', borderRadius:10, borderTop:'3px solid '+s.c }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase' }}>{s.k} Side</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--text)' }}>{sideSplit[s.k].n} <span style={{ fontSize:12, fontWeight:600, color:'var(--muted)' }}>deals</span></div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:3 }}>{fmt$(sideSplit[s.k].gci)} GCI · {fmt$(sideSplit[s.k].prod)} vol</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Leaderboards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {[
              { title: '🏆 Top GCI', key: 'gci', money: true },
              { title: '🥇 Most Closings', key: 'deals' },
              { title: '📤 Most Offers Sent', key: 'sent' },
              { title: '📞 Most Calls', key: 'calls' },
            ].map(board => {
              const ranked = [...agentRows].sort((a,b) => b.now[board.key] - a.now[board.key]).filter(r => r.now[board.key] > 0).slice(0,5)
              return (
                <div key={board.key} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:14 }}>
                  <div style={{ fontSize:12.5, fontWeight:800, color:'var(--text)', marginBottom:10 }}>{board.title}</div>
                  {ranked.length === 0 ? <div style={{ fontSize:12, color:'var(--muted)' }}>No data.</div>
                    : ranked.map((r, i) => (
                    <div key={r.agent.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom: i<ranked.length-1?'1px solid var(--border)':'none' }}>
                      <span style={{ fontSize:12, fontWeight:800, color: i===0?'#F5A623':'var(--muted)', width:16 }}>{i+1}</span>
                      <span style={{ width:7, height:7, borderRadius:'50%', background:r.agent.color||'#CC2200' }} />
                      <span style={{ flex:1, fontSize:12.5, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.agent.name}</span>
                      <span style={{ fontSize:12.5, fontWeight:800, color:'var(--text)' }}>{board.money ? fmt$(r.now[board.key]) : r.now[board.key]}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

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
