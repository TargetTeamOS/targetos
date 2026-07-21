// ═══════════════════════════════════════════════════════════════
// LinkListingControl (July 2026)
// Shows on a TC deal when it isn't connected to a listing row.
// Lets office staff connect it to an existing listing (auto-matched
// by address, or picked manually), writes tc_deals.linked_listing_id,
// then back-syncs any seller already on the deal (tc_participants)
// into listing_contacts so reporting/seller-health picks it up.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ff = 'Inter,system-ui,sans-serif'

// crude address similarity: shared normalized tokens / number match
function scoreMatch(a, b) {
  if (!a || !b) return 0
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const at = norm(a).split(' ').filter(Boolean)
  const bt = norm(b).split(' ').filter(Boolean)
  if (!at.length || !bt.length) return 0
  const bset = new Set(bt)
  let shared = 0
  at.forEach(t => { if (bset.has(t)) shared++ })
  // weight house-number matches heavily
  const aNum = at.find(t => /^\d+$/.test(t))
  const bNum = bt.find(t => /^\d+$/.test(t))
  const numBonus = aNum && bNum && aNum === bNum ? 2 : 0
  return shared / Math.max(at.length, bt.length) + numBonus
}

export default function LinkListingControl({ deal, onLinked, toast }) {
  const [listings, setListings] = useState([])
  const [picked, setPicked] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('listings').select('id,addr,status,agent_id,list_price')
      .order('created_at', { ascending: false }).range(0, 999)
      .then(r => setListings(r.data || []))
  }, [open])

  const suggestions = listings
    .map(l => ({ ...l, _score: scoreMatch(deal.addr, l.addr) }))
    .filter(l => l._score > 0.3)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5)

  async function linkTo(listingId) {
    if (!listingId) return
    setSaving(true)
    try {
      // 1) connect the TC deal
      const { error: e1 } = await supabase.from('tc_deals').update({ linked_listing_id: listingId }).eq('id', deal.id)
      if (e1) throw e1

      // 2) back-sync any existing seller on this deal → listing_contacts
      const { data: parts } = await supabase.from('tc_participants')
        .select('contact_id').eq('tc_deal_id', deal.id).eq('role', 'seller')
      const sellerIds = [...new Set((parts || []).map(p => p.contact_id).filter(Boolean))]
      for (let i = 0; i < sellerIds.length; i++) {
        const cid = sellerIds[i]
        const isFirst = i === 0
        await supabase.from('listing_contacts')
          .upsert({ listing_id: listingId, contact_id: cid, role: 'seller', primary_contact: isFirst }, { onConflict: 'listing_id,contact_id' })
        if (isFirst) await supabase.from('listings').update({ seller_contact_id: cid }).eq('id', listingId)
      }

      toast && toast('Listing linked' + (sellerIds.length ? ' · seller synced' : ''), '#0B7A45')
      setOpen(false)
      onLinked && onLinked(listingId)
    } catch (e) {
      toast ? toast('Could not link: ' + e.message, '#DC2626') : alert('Could not link: ' + e.message)
    }
    setSaving(false)
  }

  if (deal.linked_listing_id) return null   // already linked — nothing to show

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff, boxSizing: 'border-box' }

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(245,166,35,.08)', border: '1px solid rgba(245,166,35,.3)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#B45309' }}>
          ⚠ Not connected to a listing — seller info won't sync to reports until it is.
        </div>
        {!open && (
          <button onClick={() => setOpen(true)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--brand)', background: 'var(--panel)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff, flexShrink: 0 }}>
            🔗 Connect listing
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Suggested matches for "{deal.addr || '—'}"</div>
              {suggestions.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--panel)', borderRadius: 8, marginBottom: 5 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.addr}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>{l.status}{l._score >= 2 ? ' · strong match' : ''}</span>
                  </div>
                  <button onClick={() => linkTo(l.id)} disabled={saving}
                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>Link</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Or pick any listing</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={picked} onChange={e => setPicked(e.target.value)} style={inp}>
              <option value="">Select a listing…</option>
              {listings.map(l => <option key={l.id} value={l.id}>{l.addr} ({l.status})</option>)}
            </select>
            <button onClick={() => linkTo(picked)} disabled={!picked || saving}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: picked ? 'var(--brand)' : 'var(--border)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: picked ? 'pointer' : 'default', fontFamily: ff, flexShrink: 0 }}>
              {saving ? '…' : 'Link'}
            </button>
          </div>
          <button onClick={() => setOpen(false)} style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}
    </div>
  )
}
