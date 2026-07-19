// ═══════════════════════════════════════════════════════════════
// CONTACT PEEK (July 2026)
// Small verification popup used inside contact-search dropdowns: when
// several contacts share a name, tap 👁 to see phone, email, home
// address, type, agent, and past deals/offers before selecting.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ff = 'Inter,system-ui,sans-serif'

export function ContactPeek({ contactId, onClose, onSelect }) {
  const [c, setC] = useState(null)
  const [history, setHistory] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('contacts')
        .select('*, agents(name)').eq('id', contactId).maybeSingle()
      if (alive) setC(data)
      // Past deals: offers where they're the buyer/seller + deals
      // matched by email/phone (deals lack a contact_id column).
      const items = []
      try {
        const { data: offs } = await supabase.from('offers')
          .select('listing_addr, status, offer_date, buyer_contact_id, seller_contact_id')
          .or('buyer_contact_id.eq.' + contactId + ',seller_contact_id.eq.' + contactId)
          .order('offer_date', { ascending: false }).limit(5)
        ;(offs || []).forEach(o => items.push({
          label: o.listing_addr, sub: 'Offer · ' + (o.status || '') + (o.buyer_contact_id === contactId ? ' · Buyer' : ' · Seller'),
          date: o.offer_date }))
      } catch {}
      try {
        if (data?.email || data?.phone) {
          let dq = supabase.from('deals').select('addr, stage, close_date').limit(5)
          dq = data.email ? dq.eq('client_email', data.email) : dq.eq('client_phone', data.phone)
          const { data: dls } = await dq
          ;(dls || []).forEach(d => items.push({ label: d.addr, sub: 'Deal · ' + (d.stage || ''), date: d.close_date }))
        }
      } catch {}
      if (alive) setHistory(items)
    })()
    return () => { alive = false }
  }, [contactId])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel, #fff)', borderRadius: 14, padding: 18, width: 'min(420px, 94vw)', maxHeight: '80vh', overflowY: 'auto', fontFamily: ff, boxShadow: '0 16px 48px rgba(0,0,0,.3)' }}>
        {!c ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#1B2B4B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, flexShrink: 0 }}>
                {((c.first_name || '?')[0] + (c.last_name?.[0] || '')).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text, #111)' }}>
                  {[(c.first_name || ''), (c.last_name || '')].join(' ').trim() || 'Unnamed'}
                  {c.is_private && ' 🔒'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted, #666)' }}>{[c.type, c.status].filter(Boolean).join(' · ')}</div>
              </div>
              <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--muted, #888)', cursor: 'pointer' }}>✕</button>
            </div>

            {[
              ['📞 Phone', c.phone],
              ['✉️ Email', c.email],
              ['🏠 Home address', c.address],
              ['🏢 Company', c.company],
              ['👤 Agent', c.agents?.name],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border, #eee)', fontSize: 12.5 }}>
                <span style={{ color: 'var(--muted, #777)', minWidth: 118, flexShrink: 0 }}>{k}</span>
                <span style={{ color: 'var(--text, #111)', fontWeight: 600, wordBreak: 'break-word' }}>{v}</span>
              </div>
            ))}

            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted, #777)', textTransform: 'uppercase', margin: '12px 0 6px' }}>Past deals & offers</div>
            {history === null ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
              : history.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>None on record</div>
              : history.map((h, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text, #111)' }}>{h.label || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted, #777)' }}>{h.sub}{h.date ? ' · ' + new Date(h.date).toLocaleDateString() : ''}</div>
                </div>
              ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {onSelect && (
                <button onClick={() => { onSelect(c); onClose() }}
                  style={{ flex: 1, padding: 11, borderRadius: 9, border: 'none', background: '#CC2200', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: ff }}>
                  ✓ Yes, this is the one
                </button>
              )}
              <a href={'/contacts/' + c.id + '/detail'} target="_blank" rel="noreferrer"
                style={{ padding: '11px 14px', borderRadius: 9, border: '1px solid var(--border, #ddd)', color: 'var(--text, #111)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', fontFamily: ff }}>
                Full page ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
