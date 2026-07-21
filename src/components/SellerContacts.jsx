// ═══════════════════════════════════════════════════════════════
// SELLER CONTACTS (July 2026)
// Reusable, permission-aware manager for a listing's seller
// contact(s) via the listing_contacts table. Used by the TC board,
// the agent's My Listings board, and (admins only) the general
// Listings drawer.
//
// Permission model (enforced here so every placement is consistent):
//   • canManageAll (admin/secretary/TC) → see + manage ANY listing
//   • listing agent (listingAgentId === myAgentId) → see + manage own
//   • everyone else → component renders NOTHING (no names/phones/emails)
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import ContactPicker from './ContactPicker'

const ff = 'Inter,system-ui,sans-serif'

export default function SellerContacts({ listingId, listingAgentId, compact = false }) {
  const { agent, isAdmin, canManage } = useAuth()
  const canManageAll = isAdmin || canManage           // admin + secretary/TC
  const isOwnListing = !!(agent?.id && listingAgentId && agent.id === listingAgentId)
  const allowed = canManageAll || isOwnListing

  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    if (!listingId || !allowed) { setSellers([]); return }
    setLoading(true); setErr('')
    try {
      const { data, error } = await supabase.from('listing_contacts')
        .select('id,contact_id,role,primary_contact,contacts(id,first_name,last_name,phone,email)')
        .eq('listing_id', listingId)
      if (error) throw error
      setSellers(data || [])
    } catch (e) { setErr(e.message || String(e)); setSellers([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [listingId, allowed])

  async function addSeller(contact) {
    if (!listingId) { alert('Save the listing first, then link a seller.'); return }
    if (!contact?.id) { alert('No contact selected.'); return }
    if (sellers.some(s => s.contact_id === contact.id)) { alert('Already linked as a seller.'); return }
    const isFirst = sellers.length === 0
    try {
      const { data, error } = await supabase.from('listing_contacts')
        .insert({ listing_id: listingId, contact_id: contact.id, role: 'seller', primary_contact: isFirst })
        .select('id,contact_id,role,primary_contact,contacts(id,first_name,last_name,phone,email)')
        .single()
      if (error) throw error
      if (data) setSellers(prev => [...prev, data])
      if (isFirst) await supabase.from('listings').update({ seller_contact_id: contact.id }).eq('id', listingId)
      load()
    } catch (e) { alert('Could not link seller: ' + (e.message || e)) }
  }
  async function removeSeller(row) {
    try {
      await supabase.from('listing_contacts').delete().eq('id', row.id)
      if (row.primary_contact) await supabase.from('listings').update({ seller_contact_id: null }).eq('id', listingId)
      load()
    } catch (e) { alert('Could not remove: ' + (e.message || e)) }
  }
  async function makePrimary(row) {
    try {
      await supabase.from('listing_contacts').update({ primary_contact: false }).eq('listing_id', listingId)
      await supabase.from('listing_contacts').update({ primary_contact: true }).eq('id', row.id)
      await supabase.from('listings').update({ seller_contact_id: row.contact_id }).eq('id', listingId)
      load()
    } catch (e) { alert('Could not set primary: ' + (e.message || e)) }
  }

  // Not permitted → render nothing at all (no seller data exposed)
  if (!allowed) return null

  return (
    <div style={{ marginTop: compact ? 4 : 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>🧑 Seller Contact(s)</div>
      {!listingId ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>No linked listing.</div>
      ) : (
        <>
          {err && <div style={{ fontSize: 11.5, color: '#DC2626', marginBottom: 6 }}>{err}</div>}
          {loading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>}
          {sellers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {sellers.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--dim)', borderRadius: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{[s.contacts?.first_name, s.contacts?.last_name].filter(Boolean).join(' ') || 'Contact'}</span>
                    {s.primary_contact && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#0B7A45' }}>PRIMARY</span>}
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)' }}>{s.contacts?.phone || s.contacts?.email || ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!s.primary_contact && <button onClick={() => makePrimary(s)} title="Make primary seller" style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>★</button>}
                    <button onClick={() => removeSeller(s)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ContactPicker onSelect={addSeller} placeholder="Search & link a seller contact…" agentId={listingAgentId || agent?.id} />
        </>
      )}
    </div>
  )
}
