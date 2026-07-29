// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Listing Workspace
// Agent Listing Management Hub / Seller-Reporting Command Center.
//
// Opened full-screen from My Listings. Reporting-first: seller-ready
// summary, buyer feedback themes, and next action come before any
// editing. Uses only existing data (listings, listing_showings,
// open_houses, audit_log) — no schema changes.
//
// "Seller updated" is tracked via an audit_log marker row
// (action: 'seller_update') rather than a new listings column, so
// this ships without any migration.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate } from '../lib/utils'
import { Btn, Tabs, Loading, Empty } from './UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── Feedback theme engine ─────────────────────────────────────────
// Keyword-based, deliberately conservative: avoids the documented
// false-positive traps (great price ≠ price too high, loved the
// kitchen ≠ kitchen concern, beautiful bedrooms ≠ bedroom concern)
// by requiring a negative/concern word AND checking it isn't paired
// with a positive qualifier on the same text.
const THEME_DEFS = [
  {
    id: 'price_too_high', label: 'Price too high',
    negative: ['too expensive', 'overpriced', 'over priced', 'price too high', 'too high', 'price is high', 'pricey', 'out of budget', 'above budget'],
    positive: ['great price', 'good price', 'priced right', 'fair price', 'price is right', 'well priced', 'reasonably priced', 'good value', 'great value'],
  },
  { id: 'taxes_too_high', label: 'Taxes too high', negative: ['taxes too high', 'taxes are high', 'high taxes', 'tax burden'], positive: [] },
  { id: 'price_flexibility', label: 'Wants to negotiate', negative: ['negotiate', 'room to negotiate', 'flexible on price', 'open to offers below', 'will they take'], positive: [] },
  { id: 'size_too_small', label: 'Size too small', negative: ['too small', 'not enough space', 'feels small', 'felt small', 'smaller than expected', 'cramped'], positive: ['not too small'] },
  { id: 'needs_more_beds', label: 'Needs more bedrooms', negative: ['need more bedroom', 'needs more bedroom', 'not enough bedroom', 'too few bedroom'], positive: [] },
  { id: 'needs_more_baths', label: 'Needs more bathrooms', negative: ['need more bathroom', 'needs more bathroom', 'not enough bathroom', 'too few bathroom'], positive: [] },
  { id: 'basement_concern', label: 'Basement concern', negative: ['basement is small', 'basement issue', 'basement concern', 'unfinished basement', 'basement flood', 'basement damp', 'basement musty'], positive: ['loved the basement', 'great basement', 'finished basement'] },
  { id: 'parking_issue', label: 'Parking / driveway issue', negative: ['no parking', 'parking issue', 'driveway issue', 'street parking only', 'tight driveway', 'not enough parking'], positive: [] },
  { id: 'condition_updates', label: 'Needs updates / condition', negative: ['needs work', 'needs updating', 'needs updates', 'dated', 'outdated', 'needs renovation', 'run down', 'fixer'], positive: [] },
  { id: 'location_concern', label: 'Location concern', negative: ['bad location', 'busy street', 'traffic noise', 'too far', 'location concern', 'far from'], positive: ['great location', 'loved the location', 'perfect location'] },
  { id: 'layout_concern', label: 'Layout concern', negative: ['awkward layout', 'layout issue', 'weird layout', "layout doesn't work", "layout didn't work", 'poor flow'], positive: ['great layout', 'loved the layout', 'good flow'] },
  { id: 'kitchen_concern', label: 'Kitchen concern', negative: ['kitchen is small', 'kitchen issue', 'kitchen needs', 'dated kitchen', 'outdated kitchen'], positive: ['loved the kitchen', 'great kitchen', 'beautiful kitchen'] },
  { id: 'bedroom_concern', label: 'Bedroom concern', negative: ['small bedroom', 'bedroom issue', 'bedroom concern'], positive: ['beautiful bedroom', 'loved the bedroom', 'great bedroom'] },
  { id: 'positive', label: 'Positive feedback', negative: ['loved it', 'love it', 'great price', 'perfect', 'beautiful', 'stunning', 'would offer', 'we love', 'they loved'], positive: [] },
  { id: 'second_showing', label: 'Wants second showing', negative: ['second showing', 'come back', 'another showing', 'wants to see again', 'bring the family'], positive: [] },
  { id: 'offer_coming', label: 'Offer coming / serious interest', negative: ['offer coming', 'writing an offer', 'putting in an offer', 'submitting an offer', 'very interested', 'serious interest'], positive: [] },
]

function detectThemes(text) {
  if (!text) return []
  const t = text.toLowerCase()
  const found = []
  for (const theme of THEME_DEFS) {
    const hasNegative = theme.negative.some(p => t.includes(p))
    if (!hasNegative) continue
    const hasPositiveOverride = theme.positive.some(p => t.includes(p))
    if (hasPositiveOverride && theme.id !== 'positive') continue
    found.push(theme.id)
  }
  return found
}

function buildThemeSummary(showings) {
  const counts = {}
  const examples = {}
  for (const s of showings) {
    const text = [s.feedback, s.notes].filter(Boolean).join('. ')
    const themes = detectThemes(text)
    for (const id of themes) {
      counts[id] = (counts[id] || 0) + 1
      if (!examples[id]) examples[id] = []
      if (examples[id].length < 5) examples[id].push({ text: text, buyer: s.buyer_name || 'Anonymous', date: s.showing_date })
    }
  }
  return THEME_DEFS
    .filter(t => counts[t.id] > 0)
    .map(t => ({ id: t.id, label: t.label, count: counts[t.id], examples: examples[t.id] }))
    .sort((a, b) => b.count - a.count)
}

// ── Buyer feedback stats ──────────────────────────────────────────
function buildBuyerStats(showings) {
  const total = showings.length
  const buyerNames = new Set(showings.map(s => (s.buyer_name || '').trim().toLowerCase()).filter(Boolean))
  const withFeedback = showings.filter(s => (s.feedback && s.feedback.trim()) || (s.notes && s.notes.trim()))
  const avgInterest = total ? (showings.reduce((sum, s) => sum + (s.interest_level || 3), 0) / total) : null
  const interested = showings.filter(s => (s.interest_level || 3) >= 4).length
  const neutral = showings.filter(s => (s.interest_level || 3) === 3).length
  const notInterested = showings.filter(s => (s.interest_level || 3) <= 2).length
  return {
    total, uniqueBuyers: buyerNames.size, avgInterest,
    interested, neutral, notInterested,
    noFeedback: total - withFeedback.length,
  }
}

// ── Since-last-update ─────────────────────────────────────────────
function buildSinceUpdate(showings, openHouses, priceEvents, sellerUpdatedAt) {
  const cutoff = sellerUpdatedAt ? new Date(sellerUpdatedAt).getTime() : null
  const after = (d) => !cutoff || (d && new Date(d).getTime() > cutoff)
  return {
    label: sellerUpdatedAt ? 'since last update (' + fmtDate(sellerUpdatedAt) + ')' : 'since listing',
    showings: showings.filter(s => after(s.showing_date)),
    openHouses: openHouses.filter(oh => after(oh.date)),
    priceEvents: priceEvents.filter(p => after(p.created_at)),
  }
}

// ── Price history from audit_log (no price_history column exists) ─
function extractPriceEvents(auditRows) {
  return auditRows
    .filter(r => r.field_name === 'Price' || r.field_name === 'list_price' || r.metadata?.field === 'list_price')
    .map(r => ({
      created_at: r.created_at,
      old_value: r.old_value || r.metadata?.old_value,
      new_value: r.new_value || r.metadata?.new_value,
      reason: r.metadata?.reason || null,
      agent_name: r.agents?.name || null,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function findLastSellerUpdate(auditRows) {
  const row = auditRows.find(r => r.action === 'seller_update')
  return row ? row.created_at : null
}

// ── Key alerts / next action ──────────────────────────────────────
function buildAlerts(listing, showings, buyerStats, themeSummary, sinceUpdate) {
  const alerts = []
  const dom = listing.list_date ? Math.floor((Date.now() - new Date(listing.list_date)) / 86400000) : null
  const status = listing.status || 'Active'

  if (status === 'Active' && dom !== null && dom >= 14 && showings.length === 0) {
    alerts.push({ level: 'red', text: dom + ' days on market with no showings logged yet.' })
  }
  const priceTheme = themeSummary.find(t => t.id === 'price_too_high')
  if (priceTheme && priceTheme.count >= 2) {
    alerts.push({ level: 'amber', text: priceTheme.count + ' buyers mentioned price is too high.' })
  }
  if (buyerStats.total >= 3 && buyerStats.avgInterest !== null && buyerStats.avgInterest < 2.5) {
    alerts.push({ level: 'amber', text: 'Average buyer interest is low (' + buyerStats.avgInterest.toFixed(1) + '/5) across ' + buyerStats.total + ' showings.' })
  }
  if (buyerStats.noFeedback > 0) {
    alerts.push({ level: 'gray', text: buyerStats.noFeedback + ' showing(s) have no feedback recorded — follow up with the buyer agent.' })
  }
  const offerTheme = themeSummary.find(t => t.id === 'offer_coming')
  if (offerTheme) {
    alerts.push({ level: 'blue', text: offerTheme.count + ' buyer(s) indicated an offer may be coming.' })
  }
  if (sinceUpdate.showings.length === 0 && sinceUpdate.openHouses.length === 0 && sinceUpdate.priceEvents.length === 0) {
    alerts.push({ level: 'gray', text: 'No new activity ' + sinceUpdate.label + ' — seller report will be quiet.' })
  }
  return alerts
}

const ALERT_COLORS = { red: '#DC2626', amber: '#F97316', blue: '#3B82F6', gray: '#94A3B8' }

function AlertRow({ alerts }) {
  if (!alerts.length) {
    return <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', padding: '8px 0' }}>Nothing needs attention — all caught up.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: (ALERT_COLORS[a.level] || '#94A3B8') + '14', borderLeft: '3px solid ' + (ALERT_COLORS[a.level] || '#94A3B8') }}>
          <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{a.text}</span>
        </div>
      ))}
    </div>
  )
}

function buildSellerReportText(listing, buyerStats, themeSummary, sinceUpdate, priceEvents) {
  const lines = []
  lines.push(listing.addr + (listing.city ? ', ' + listing.city : ''))
  lines.push('Status: ' + (listing.status || 'Active') + '  ·  List Price: ' + fmt$(listing.list_price))
  lines.push('')
  lines.push('ACTIVITY ' + sinceUpdate.label.toUpperCase())
  lines.push('- Showings: ' + sinceUpdate.showings.length)
  lines.push('- Open houses: ' + sinceUpdate.openHouses.length)
  lines.push('- Price changes: ' + sinceUpdate.priceEvents.length)
  lines.push('')
  lines.push('BUYER FEEDBACK')
  lines.push('- Total showings: ' + buyerStats.total + '  ·  Unique buyers: ' + buyerStats.uniqueBuyers)
  lines.push('- Average interest: ' + (buyerStats.avgInterest !== null ? buyerStats.avgInterest.toFixed(1) + '/5' : 'n/a'))
  lines.push('- Interested: ' + buyerStats.interested + '  ·  Neutral: ' + buyerStats.neutral + '  ·  Not interested: ' + buyerStats.notInterested + '  ·  No feedback: ' + buyerStats.noFeedback)
  const objections = themeSummary.filter(t => t.id !== 'positive' && t.id !== 'offer_coming' && t.id !== 'second_showing')
  const positives = themeSummary.filter(t => t.id === 'positive')
  if (objections.length) {
    lines.push('')
    lines.push('MAIN OBJECTIONS')
    objections.forEach(t => lines.push('- ' + t.label + ' (' + t.count + ')'))
  }
  if (positives.length) {
    lines.push('')
    lines.push('POSITIVE FEEDBACK')
    positives.forEach(t => lines.push('- ' + t.label + ' (' + t.count + ')'))
  }
  if (priceEvents.length) {
    lines.push('')
    lines.push('PRICE MOVEMENT')
    lines.push('- Current price: ' + fmt$(listing.list_price) + '  ·  Total changes: ' + priceEvents.length)
  }
  lines.push('')
  lines.push('RECOMMENDED NEXT STEP')
  if (objections.some(t => t.id === 'price_too_high')) {
    lines.push('- Multiple buyers flagged price. Consider reviewing pricing strategy.')
  } else if (buyerStats.total === 0) {
    lines.push('- No showings yet. Consider a marketing push or open house.')
  } else if (themeSummary.some(t => t.id === 'offer_coming')) {
    lines.push('- Serious buyer interest signaled — follow up directly with buyer agent(s).')
  } else {
    lines.push('- Continue current marketing plan and monitor upcoming showings.')
  }
  return lines.join('\n')
}

export function ListingWorkspace({ listing, showings, openHouses, isAdmin, agent, onClose, onLogShowing, onScheduleOH, onPriceChange, onRefresh }) {
  const [tab, setTab] = useState('buyer_feedback')
  const [auditRows, setAuditRows] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(true)
  const [marking, setMarking] = useState(false)
  const [copyLabel, setCopyLabel] = useState('Copy Seller Report')

  useEffect(() => { loadAudit() }, [listing?.id])

  async function loadAudit() {
    setLoadingAudit(true)
    try {
      const { data } = await supabase
        .from('audit_log')
        .select('*, agents(id,name,color)')
        .eq('table_name', 'listings')
        .eq('record_id', listing.id)
        .order('created_at', { ascending: false })
        .limit(200)
      setAuditRows(data || [])
    } catch (e) { console.warn('audit_log load failed:', e.message); setAuditRows([]) }
    finally { setLoadingAudit(false) }
  }

  const priceEvents = useMemo(() => extractPriceEvents(auditRows), [auditRows])
  const sellerUpdatedAt = useMemo(() => findLastSellerUpdate(auditRows), [auditRows])
  const buyerStats = useMemo(() => buildBuyerStats(showings), [showings])
  const themeSummary = useMemo(() => buildThemeSummary(showings), [showings])
  const sinceUpdate = useMemo(() => buildSinceUpdate(showings, openHouses, priceEvents, sellerUpdatedAt), [showings, openHouses, priceEvents, sellerUpdatedAt])
  const alerts = useMemo(() => buildAlerts(listing, showings, buyerStats, themeSummary, sinceUpdate), [listing, showings, buyerStats, themeSummary, sinceUpdate])
  const reportText = useMemo(() => buildSellerReportText(listing, buyerStats, themeSummary, sinceUpdate, priceEvents), [listing, buyerStats, themeSummary, sinceUpdate, priceEvents])

  const showingsByAgent = useMemo(() => {
    const groups = {}
    for (const s of showings) {
      const key = s.agent_name || 'Unknown agent'
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  }, [showings])

  async function markSellerUpdated() {
    setMarking(true)
    try {
      await supabase.from('audit_log').insert({
        agent_id: agent?.id || null,
        table_name: 'listings',
        record_id: listing.id,
        action: 'seller_update',
        field_name: 'Seller Update',
        metadata: { description: 'Marked seller updated for ' + listing.addr },
        created_at: new Date().toISOString(),
      })
      await loadAudit()
    } catch (e) { console.warn('mark seller updated failed:', e.message) }
    finally { setMarking(false) }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText)
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy Seller Report'), 1800)
    } catch (e) { console.warn('clipboard failed:', e.message) }
  }

  const dom = listing.list_date ? Math.floor((Date.now() - new Date(listing.list_date)) / 86400000) : null

  const tabsList = [
    { id: 'buyer_feedback', label: 'Buyer Feedback' },
    { id: 'seller_report', label: 'Seller Report' },
    { id: 'price_activity', label: 'Price & Activity' },
    { id: 'notes', label: 'Notes' },
  ]
  if (isAdmin) tabsList.push({ id: 'admin_log', label: 'Admin Log' })

  return (
    <div style={{ fontFamily: ff }}>
      {/* Property header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Btn variant="secondary" size="sm" onClick={onClose} style={{ marginBottom: 10 }}>← Back to My Listings</Btn>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{listing.addr}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {listing.city ? listing.city + ' · ' : ''}{fmt$(listing.list_price)} · {listing.status || 'Active'}{dom !== null ? ' · ' + dom + 'd on market' : ''}
          </div>
        </div>
      </div>

      {/* Seller-ready summary + Buyer feedback summary panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Seller-Ready Summary</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
            {sinceUpdate.showings.length} showing(s), {sinceUpdate.openHouses.length} open house(s), {sinceUpdate.priceEvents.length} price change(s) {sinceUpdate.label}.
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn size="sm" onClick={markSellerUpdated} loading={marking}>Mark Seller Updated</Btn>
            {sellerUpdatedAt && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last: {fmtDate(sellerUpdatedAt)}</span>}
          </div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Buyer Feedback Summary</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
            {buyerStats.total} showings · {buyerStats.uniqueBuyers} unique buyers · avg interest {buyerStats.avgInterest !== null ? buyerStats.avgInterest.toFixed(1) + '/5' : 'n/a'}
            <br />👍 {buyerStats.interested} interested · 🤔 {buyerStats.neutral} neutral · 👎 {buyerStats.notInterested} not interested · {buyerStats.noFeedback} no feedback
          </div>
        </div>
      </div>

      {/* Key alerts */}
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Next Action / Key Alerts</div>
        <AlertRow alerts={alerts} />
      </div>

      <Tabs tabs={tabsList} active={tab} onChange={setTab} />

      {tab === 'buyer_feedback' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Btn size="sm" onClick={() => onLogShowing(listing)}>🏠 Log Showing</Btn>
            <Btn size="sm" variant="secondary" onClick={() => onScheduleOH(listing)}>🚪 Schedule Open House</Btn>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Theme Summary <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>— based on feedback text</span></div>
          {themeSummary.length === 0 ? (
            <Empty title="No themes detected yet" sub="Themes appear once showing feedback includes descriptive text." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
              {themeSummary.map(t => <ThemeRow key={t.id} theme={t} />)}
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>By Showing Agent</div>
          {showingsByAgent.length === 0 ? (
            <Empty title="No showings logged yet" sub="Log a showing to start building buyer feedback here." />
          ) : (
            showingsByAgent.map(([agentName, list]) => (
              <div key={agentName} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Agent: {agentName} — {list.length} showing{list.length !== 1 ? 's' : ''}</div>
                {list.map(s => (
                  <div key={s.id} style={{ padding: '8px 10px', background: 'var(--dim)', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{s.buyer_name || 'Anonymous'}</span>
                      <span style={{ color: 'var(--muted)' }}>{fmtDate(s.showing_date)}</span>
                    </div>
                    {(s.feedback || s.notes) ? (
                      <div style={{ color: 'var(--muted)', marginTop: 2 }}>{[s.feedback, s.notes].filter(Boolean).join(' — ')}</div>
                    ) : (
                      <div style={{ color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>No feedback recorded — follow up with buyer agent.</div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'seller_report' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Btn size="sm" onClick={copyReport}>{copyLabel}</Btn>
            <Btn size="sm" variant="secondary" onClick={markSellerUpdated} loading={marking}>Mark Seller Updated</Btn>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: ff, fontSize: 12.5, lineHeight: 1.7, background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, color: 'var(--text)' }}>
            {reportText}
          </pre>
        </div>
      )}

      {tab === 'price_activity' && (
        <div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
            <StatBlock label="Current Price" value={fmt$(listing.list_price)} />
            <StatBlock label="Price Changes" value={String(priceEvents.length)} />
          </div>
          <Btn size="sm" onClick={() => onPriceChange(listing)} style={{ marginBottom: 12 }}>💰 Change Price</Btn>
          {loadingAudit ? <Loading /> : priceEvents.length === 0 ? (
            <Empty title="No price changes recorded" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {priceEvents.map((p, i) => (
                <div key={i} style={{ padding: '8px 10px', background: 'var(--dim)', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{fmt$(p.old_value)} → <strong>{fmt$(p.new_value)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>{fmtDate(p.created_at)}</span>
                  </div>
                  {p.reason && <div style={{ color: 'var(--muted)', marginTop: 2 }}>{p.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <div style={{ fontSize: 13, color: listing.notes ? 'var(--text)' : 'var(--muted)', fontStyle: listing.notes ? 'normal' : 'italic', whiteSpace: 'pre-wrap' }}>
          {listing.notes || 'No notes yet. Edit notes from the All Listings record.'}
        </div>
      )}

      {tab === 'admin_log' && isAdmin && (
        <div>
          {loadingAudit ? <Loading /> : auditRows.length === 0 ? (
            <Empty title="No activity recorded yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {auditRows.map(r => (
                <div key={r.id} style={{ padding: '8px 10px', background: 'var(--dim)', borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{r.field_name || r.action}</span>
                    <span style={{ color: 'var(--muted)' }}>{fmtDate(r.created_at)}</span>
                  </div>
                  {(r.old_value || r.new_value) && (
                    <div style={{ color: 'var(--muted)', marginTop: 2 }}>{r.old_value || '—'} → {r.new_value || '—'}</div>
                  )}
                  {r.agents?.name && <div style={{ color: 'var(--muted)', marginTop: 2 }}>by {r.agents.name}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ThemeRow({ theme }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'var(--dim)', borderRadius: 8, padding: '8px 10px' }}>
      <div onClick={() => setOpen(p => !p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{theme.label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{theme.count} {open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {theme.examples.map((ex, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)' }}>"{ex.text}" — {ex.buyer}, {fmtDate(ex.date)}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatBlock({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}
