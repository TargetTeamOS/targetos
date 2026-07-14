// ═══════════════════════════════════════════════════════════════
// BoardLinks — small chips showing where else this property lives:
// 🏠 Listings · 💼 Production · 📋 TC Board. Pass whichever IDs the
// current board knows; the component discovers the rest through the
// link columns (tc_deals.linked_deal_id / linked_listing_id and
// deals.listing_id) and renders one chip per connected board.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function BoardLinks({ listingId = null, dealId = null, tcDealId = null }) {
  const navigate = useNavigate()
  const [links, setLinks] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const out = { listing: listingId, deal: dealId, tc: tcDealId }
      try {
        if (listingId && (!out.deal || !out.tc)) {
          const [d, t] = await Promise.all([
            out.deal ? { data: null } : supabase.from('deals').select('id').eq('listing_id', listingId).limit(1).maybeSingle(),
            out.tc   ? { data: null } : supabase.from('tc_deals').select('id, linked_deal_id').eq('linked_listing_id', listingId).limit(1).maybeSingle(),
          ])
          if (d.data)  out.deal = d.data.id
          if (t.data)  { out.tc = t.data.id; out.deal = out.deal || t.data.linked_deal_id }
        }
        if (dealId && (!out.listing || !out.tc)) {
          const [d, t] = await Promise.all([
            out.listing ? { data: null } : supabase.from('deals').select('listing_id').eq('id', dealId).maybeSingle(),
            out.tc      ? { data: null } : supabase.from('tc_deals').select('id, linked_listing_id').eq('linked_deal_id', dealId).limit(1).maybeSingle(),
          ])
          if (d.data?.listing_id) out.listing = d.data.listing_id
          if (t.data) { out.tc = t.data.id; out.listing = out.listing || t.data.linked_listing_id }
        }
      } catch { /* chips are best-effort */ }
      if (alive) setLinks(out)
    })()
    return () => { alive = false }
  }, [listingId, dealId, tcDealId])

  if (!links) return null
  const chips = []
  if (links.listing && !listingId) chips.push({ label: '🏠 View on Listings',   to: '/listings?open=' + links.listing })
  if (links.deal && !dealId)       chips.push({ label: '💼 View on Production', to: '/production?open=' + links.deal })
  if (links.tc && !tcDealId)       chips.push({ label: '📋 View on TC Board',   to: '/tc?open=' + links.tc })
  if (!chips.length) return null

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      {chips.map(c => (
        <button key={c.to} onClick={() => navigate(c.to)}
          style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                   border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--brand)' }}>
          {c.label} ↗
        </button>
      ))}
    </div>
  )
}
