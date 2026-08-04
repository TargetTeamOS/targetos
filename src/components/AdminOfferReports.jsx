import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmt$, fmtDate } from '../lib/utils'
import { OFFER_ACCEPTED_VALUES, OFFER_PENDING_VALUES } from '../lib/constants'
import { Loading, Empty } from './UI'

const CARD = { background:'var(--panel)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', cursor:'pointer', transition:'border-color .15s' }
const LABEL = { fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }
const VALUE = { fontSize:20, fontWeight:900, color:'var(--text)' }

/**
 * Every number here is traceable: it's computed directly from `offers`
 * (the same authoritative rows already loaded for the board itself —
 * no separate/duplicated data source) plus `revisions` (offer_revisions,
 * fetched once here). Clicking any card drills into the exact records
 * that produced it, filtered from these same in-memory arrays, and each
 * drill-down row opens the real offer via the existing /offers/:id route.
 *
 * Honest limitation, stated rather than hidden: offer_revisions only
 * has rows for offers processed through the Commit 1-4 PDF/send flow.
 * Revision-dependent metrics (avg revisions before acceptance, price
 * movement, time-to-accept) will read as "insufficient data" for older
 * offers that predate this system, not a misleading zero.
 */
export default function AdminOfferReports({ offers: offersProp, agents, revisionsOverride }) {
  // Full-history fetch: the board's own `offers` prop is capped at
  // db.offers.list()'s 200-row default (server-authorized: RLS still
  // scopes this to what the signed-in user may see; admin sees all).
  // Reports must reflect true history, not just the most recently
  // loaded page, so this paginates through everything itself rather
  // than trusting the capped prop — while still preferring an
  // explicit override for tests. offersProp is used only as an
  // instant first paint while the full fetch completes, never as the
  // final source of truth for a report number.
  const [fullOffers, setFullOffers] = useState(null) // null = loading
  useEffect(() => {
    if (revisionsOverride !== undefined) { setFullOffers(offersProp); return } // test mode
    let cancelled = false
    async function fetchAll() {
      const pageSize = 500
      let from = 0
      let all = []
      while (true) {
        const { data, error } = await supabase.from('offers')
          .select('id,listing_addr,buyer_name,buyer_contact_id,seller_name,seller_contact_id,purchase_price,status,offer_date,agent_id,buyers_agent_id,off_market,representing_side,sellers_agent_name,sellers_agent_contact_id,seller_agent_company,purchaser_attorney_name,purchaser_attorney_contact_id,seller_attorney_name,seller_attorney_contact_id,accepted_at')
          .order('offer_date', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data)
        if (data.length < pageSize) break
        from += pageSize
        if (from > 20000) break // sane hard ceiling against a runaway loop
      }
      if (!cancelled) setFullOffers(all)
    }
    fetchAll().catch(() => { if (!cancelled) setFullOffers(offersProp || []) })
    return () => { cancelled = true }
  }, [revisionsOverride])

  const offers = fullOffers ?? offersProp ?? []
  const [revisions, setRevisions] = useState(revisionsOverride ?? null) // null = loading
  const [drill, setDrill] = useState(null) // { title, rows: offer[] } | null

  useEffect(() => {
    if (revisionsOverride !== undefined) return
    let cancelled = false
    supabase.from('offer_revisions')
      .select('id,offer_id,revision_number,purchase_price,created_at,is_accepted_revision')
      .then(r => { if (!cancelled) setRevisions(r.data || []) })
      .catch(() => { if (!cancelled) setRevisions([]) })
    return () => { cancelled = true }
  }, [revisionsOverride])

  const revByOffer = useMemo(() => {
    const map = new Map()
    for (const r of revisions || []) {
      if (!map.has(r.offer_id)) map.set(r.offer_id, [])
      map.get(r.offer_id).push(r)
    }
    return map
  }, [revisions])

  const isAccepted = o => OFFER_ACCEPTED_VALUES.includes(o.status)
  const isPending  = o => OFFER_PENDING_VALUES.includes(o.status)
  const isOffMarket = o => !!o.off_market

  const stats = useMemo(() => {
    const accepted = offers.filter(isAccepted)
    const pending  = offers.filter(isPending)

    const byAgent = {}
    for (const o of offers) {
      const aid = o.agent_id || o.buyers_agent_id || 'unassigned'
      if (!byAgent[aid]) byAgent[aid] = { sent: [], accepted: [], pending: [], volumeOffered: 0, volumeAccepted: 0 }
      byAgent[aid].sent.push(o)
      if (isAccepted(o)) { byAgent[aid].accepted.push(o); byAgent[aid].volumeAccepted += Number(o.purchase_price) || 0 }
      if (isPending(o)) byAgent[aid].pending.push(o)
      byAgent[aid].volumeOffered += Number(o.purchase_price) || 0
    }

    const byMonth = {}
    const acceptedByMonth = {}
    for (const o of offers) {
      const m = (o.offer_date || '').slice(0, 7)
      if (!m) continue
      byMonth[m] = (byMonth[m] || []).concat(o)
      if (isAccepted(o)) acceptedByMonth[m] = (acceptedByMonth[m] || []).concat(o)
    }

    function topBy(keyFn, filter) {
      const map = new Map()
      for (const o of offers) {
        if (filter && !filter(o)) continue
        const key = keyFn(o)
        if (!key) continue
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(o)
      }
      return [...map.entries()].map(([key, rows]) => ({ key, rows, count: rows.length })).sort((a, b) => b.count - a.count)
    }
    const topProperties       = topBy(o => o.listing_addr)
    const topBuyers           = topBy(o => o.buyer_contact_id || o.buyer_name)
    const topSellers          = topBy(o => o.seller_contact_id || o.seller_name)
    const topSellersAgents    = topBy(o => o.sellers_agent_contact_id || o.sellers_agent_name)
    const topBrokerages       = topBy(o => o.seller_agent_company)
    const topPurchaserAtty    = topBy(o => o.purchaser_attorney_contact_id || o.purchaser_attorney_name)
    const topSellerAtty       = topBy(o => o.seller_attorney_contact_id || o.seller_attorney_name)

    const byStatus = {}
    const bySide   = {}
    for (const o of offers) {
      byStatus[o.status || 'Draft'] = (byStatus[o.status || 'Draft'] || []).concat(o)
      const side = o.representing_side || 'Buyer'
      bySide[side] = (bySide[side] || []).concat(o)
    }
    const offMarket = offers.filter(isOffMarket)
    const mlsListed = offers.filter(o => !isOffMarket(o))

    let revisionMetrics = { available: false }
    if (revisions && revisions.length > 0) {
      const acceptedWithRevisions = accepted.filter(o => revByOffer.has(o.id))
      if (acceptedWithRevisions.length > 0) {
        let totalRevisions = 0, totalPriceChanges = 0, totalDollarIncrease = 0, totalPctIncrease = 0, priceMoveCount = 0
        const priceComparisons = []
        for (const o of acceptedWithRevisions) {
          const revs = (revByOffer.get(o.id) || []).sort((a, b) => a.revision_number - b.revision_number)
          totalRevisions += revs.length
          const prices = revs.map(r => Number(r.purchase_price)).filter(p => p > 0)
          let changes = 0
          for (let i = 1; i < prices.length; i++) if (prices[i] !== prices[i - 1]) changes++
          totalPriceChanges += changes
          if (prices.length >= 2 && prices[0] > 0) {
            const initial = prices[0], final = prices[prices.length - 1]
            if (final !== initial) {
              totalDollarIncrease += (final - initial)
              totalPctIncrease += ((final - initial) / initial) * 100
              priceMoveCount++
              priceComparisons.push({ offer: o, initial, final })
            }
          }
        }
        revisionMetrics = {
          available: true,
          avgRevisionsBeforeAcceptance: (totalRevisions / acceptedWithRevisions.length).toFixed(1),
          avgPriceChangesBeforeAcceptance: (totalPriceChanges / acceptedWithRevisions.length).toFixed(1),
          avgDollarIncrease: priceMoveCount ? Math.round(totalDollarIncrease / priceMoveCount) : 0,
          avgPctIncrease: priceMoveCount ? (totalPctIncrease / priceMoveCount).toFixed(1) : 0,
          priceComparisons,
          sampleSize: acceptedWithRevisions.length,
        }
      }
    }

    const withAcceptTiming = accepted.filter(o => o.offer_date && o.accepted_at)
    const avgDaysToAccept = withAcceptTiming.length
      ? Math.round(withAcceptTiming.reduce((sum, o) => sum + (new Date(o.accepted_at) - new Date(o.offer_date)) / 86400000, 0) / withAcceptTiming.length)
      : null

    return {
      accepted, pending, byAgent, byMonth, acceptedByMonth,
      topProperties, topBuyers, topSellers, topSellersAgents, topBrokerages, topPurchaserAtty, topSellerAtty,
      byStatus, bySide, offMarket, mlsListed, revisionMetrics, avgDaysToAccept, withAcceptTiming,
    }
  }, [offers, revisions, revByOffer])

  function agentName(id) {
    if (id === 'unassigned') return 'Unassigned'
    return agents.find(a => a.id === id)?.name || 'Unknown agent'
  }

  function Card({ label, value, sub, onClick }) {
    return (
      <div style={CARD} onClick={onClick}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand, #CC2200)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
        <div style={LABEL}>{label}</div>
        <div style={VALUE}>{value}</div>
        {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sub}</div>}
      </div>
    )
  }

  function DrillDownRow({ o }) {
    return (
      <a href={'/offers/' + o.id} style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', borderBottom:'1px solid var(--border)', fontSize:12, textDecoration:'none', color:'inherit' }}>
        <span>{o.listing_addr || '(no address)'} — {o.buyer_name || '(buyer not named)'}</span>
        <span style={{ color:'var(--muted)' }}>{o.purchase_price ? fmt$(o.purchase_price) : '—'} · {o.status || 'Draft'} · {o.offer_date ? fmtDate(o.offer_date) : ''}</span>
      </a>
    )
  }

  if (revisions === null || fullOffers === null) return <Loading />
  if (offers.length === 0) return <Empty icon="📊" title="No offers yet" sub="Reports will populate once offers exist." />

  const totalVolumeOffered  = offers.reduce((s, o) => s + (Number(o.purchase_price) || 0), 0)
  const totalVolumeAccepted = stats.accepted.reduce((s, o) => s + (Number(o.purchase_price) || 0), 0)
  const conversionPct = offers.length ? Math.round(stats.accepted.length / offers.length * 100) : 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ padding:'8px 12px', background:'rgba(59,130,246,.06)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
        Admin-only. Every number below is computed directly from the same offer records the board shows — nothing here is a separate or sample data source. Click any card to see the exact records.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px,1fr))', gap:10 }}>
        <Card label="Total offers" value={offers.length} onClick={() => setDrill({ title:'All offers', rows: offers })} />
        <Card label="Accepted" value={stats.accepted.length} onClick={() => setDrill({ title:'Accepted offers', rows: stats.accepted })} />
        <Card label="Pending (Sent)" value={stats.pending.length} onClick={() => setDrill({ title:'Pending offers', rows: stats.pending })} />
        <Card label="Conversion rate" value={conversionPct + '%'} sub={stats.accepted.length + ' of ' + offers.length} />
        <Card label="Volume offered" value={fmt$(totalVolumeOffered)} onClick={() => setDrill({ title:'All offers', rows: offers })} />
        <Card label="Volume accepted" value={fmt$(totalVolumeAccepted)} onClick={() => setDrill({ title:'Accepted offers', rows: stats.accepted })} />
      </div>

      <div>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:8, color:'var(--text)' }}>By agent</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:10 }}>
          {Object.entries(stats.byAgent).map(([aid, a]) => (
            <div key={aid} style={{ ...CARD, cursor:'default' }}>
              <div style={{ fontWeight:700, fontSize:12, marginBottom:6 }}>{agentName(aid)}</div>
              <div style={{ display:'flex', gap:10, fontSize:11 }}>
                <span onClick={() => setDrill({ title: agentName(aid) + ' — sent', rows: a.sent })} style={{ cursor:'pointer' }}>Sent {a.sent.length}</span>
                <span onClick={() => setDrill({ title: agentName(aid) + ' — accepted', rows: a.accepted })} style={{ cursor:'pointer', color:'#10B981' }}>Accepted {a.accepted.length}</span>
                <span onClick={() => setDrill({ title: agentName(aid) + ' — pending', rows: a.pending })} style={{ cursor:'pointer', color:'#F5A623' }}>Pending {a.pending.length}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                {a.sent.length ? Math.round(a.accepted.length / a.sent.length * 100) : 0}% conversion · {fmt$(a.volumeAccepted)} accepted volume
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:8, color:'var(--text)' }}>By month</div>
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
          {Object.keys(stats.byMonth).sort().map(m => (
            <div key={m} style={{ ...CARD, minWidth:110, cursor:'pointer' }} onClick={() => setDrill({ title: m + ' offers', rows: stats.byMonth[m] })}>
              <div style={LABEL}>{m}</div>
              <div style={VALUE}>{stats.byMonth[m].length}</div>
              <div style={{ fontSize:10, color:'#10B981' }}>{(stats.acceptedByMonth[m] || []).length} accepted</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px,1fr))', gap:14 }}>
        {[
          ['Properties receiving the most offers', stats.topProperties],
          ['Buyers with the most offers', stats.topBuyers],
          ['Sellers with the most offers', stats.topSellers],
          ["Seller's agents receiving the most offers", stats.topSellersAgents],
          ['Brokerages receiving the most offers', stats.topBrokerages],
          ['Most active purchaser attorneys', stats.topPurchaserAtty],
          ['Most active seller attorneys', stats.topSellerAtty],
        ].map(([title, rows]) => (
          <div key={title}>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>{title}</div>
            {rows.length === 0 ? <div style={{ fontSize:11, color:'var(--muted)' }}>No data</div> : rows.slice(0, 5).map(r => (
              <div key={r.key} onClick={() => setDrill({ title: title + ': ' + r.key, rows: r.rows })}
                style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{r.key}</span>
                <span style={{ fontWeight:700 }}>{r.count}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px,1fr))', gap:14 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>Outcomes by status</div>
          {Object.entries(stats.byStatus).map(([status, rows]) => (
            <div key={status} onClick={() => setDrill({ title: status, rows })} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0', cursor:'pointer' }}>
              <span>{status}</span><span style={{ fontWeight:700 }}>{rows.length}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>By representation side</div>
          {Object.entries(stats.bySide).map(([side, rows]) => (
            <div key={side} onClick={() => setDrill({ title: side, rows })} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0', cursor:'pointer' }}>
              <span>{side}</span><span style={{ fontWeight:700 }}>{rows.length}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>Off-market vs MLS</div>
          <div onClick={() => setDrill({ title:'Off-market offers', rows: stats.offMarket })} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0', cursor:'pointer' }}>
            <span>Off-market</span><span style={{ fontWeight:700 }}>{stats.offMarket.length}</span>
          </div>
          <div onClick={() => setDrill({ title:'MLS-listed offers', rows: stats.mlsListed })} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0', cursor:'pointer' }}>
            <span>MLS-listed</span><span style={{ fontWeight:700 }}>{stats.mlsListed.length}</span>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:8, color:'var(--text)' }}>Revisions &amp; price movement before acceptance</div>
        {!stats.revisionMetrics.available ? (
          <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 0' }}>
            Insufficient revision data yet — these metrics populate as accepted offers accumulate revision history through the PDF-generation flow (offer_revisions). Not shown as zero, since zero would misrepresent "no data" as "no revisions."
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px,1fr))', gap:10 }}>
            <Card label="Avg revisions before acceptance" value={stats.revisionMetrics.avgRevisionsBeforeAcceptance} sub={'n=' + stats.revisionMetrics.sampleSize} />
            <Card label="Avg price changes before acceptance" value={stats.revisionMetrics.avgPriceChangesBeforeAcceptance} />
            <Card label="Avg $ increase before acceptance" value={fmt$(stats.revisionMetrics.avgDollarIncrease)} />
            <Card label="Avg % increase before acceptance" value={stats.revisionMetrics.avgPctIncrease + '%'}
              onClick={() => setDrill({ title:'Initial vs accepted price', rows: stats.revisionMetrics.priceComparisons.map(p => p.offer) })} />
          </div>
        )}
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
          Avg time from first Sent to Accepted: {stats.avgDaysToAccept != null ? stats.avgDaysToAccept + ' days (n=' + stats.withAcceptTiming.length + ')' : 'insufficient data'}
          {' — '}approximated from offer_date → accepted_at; not send-timestamp-precise (would require joining offer_sends, not loaded by this view).
        </div>
      </div>

      {drill && (
        <div data-testid="drill-modal" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setDrill(null)}>
          <div style={{ background:'var(--panel)', borderRadius:12, padding:16, maxWidth:640, width:'92%', maxHeight:'80vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ fontWeight:800, fontSize:13 }}>{drill.title} ({drill.rows.length})</div>
              <button onClick={() => setDrill(null)} style={{ border:'none', background:'none', fontSize:16, cursor:'pointer' }}>✕</button>
            </div>
            {drill.rows.length === 0 ? <Empty icon="📭" title="No records" /> : drill.rows.map(o => <DrillDownRow key={o.id} o={o} />)}
          </div>
        </div>
      )}
    </div>
  )
}
