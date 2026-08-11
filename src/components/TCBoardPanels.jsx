// ═══════════════════════════════════════════════════════════════
// TC BOARD — Parties & Email Log (July 2026)
// TCParties: every party on the deal (attorneys, mortgage broker,
// inspector, other-side agent, buyer/seller) linked to the Contacts
// board — searchable, editable, with click-to-call and email.
// TCEmailLog: a running log of correspondence for the deal so the
// whole thread is tracked in one place.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ContactPicker, { contactName } from './ContactPicker'
import { ClickToCall } from './ClickToCall'

const ff = 'Inter,system-ui,sans-serif'

// Canonical party roles on a transaction
const PARTY_ROLES = [
  { key: 'buyer',            label: 'Buyer',              icon: '🔑' },
  { key: 'seller',           label: 'Seller',             icon: '🏠' },
  { key: 'buyer_attorney',   label: "Buyer's Attorney",   icon: '⚖️' },
  { key: 'seller_attorney',  label: "Seller's Attorney",  icon: '⚖️' },
  { key: 'mortgage_broker',  label: 'Mortgage Broker',    icon: '🏦' },
  { key: 'inspector',        label: 'Inspector',          icon: '🔍' },
  { key: 'appraiser',        label: 'Appraiser',          icon: '📐' },
  { key: 'other_agent',      label: 'Other Side Agent',   icon: '🤝' },
  { key: 'title',            label: 'Title Company',      icon: '📋' },
]

export function TCParties({ deal, agents = [] }) {
  const [parties, setParties] = useState({})   // role -> contact row
  const [loading, setLoading] = useState(true)
  const [addingRole, setAddingRole] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const { data: rows } = await supabase.from('tc_participants')
        .select('id, role, contact_id').eq('tc_deal_id', deal.id)
      const ids = [...new Set((rows || []).map(r => r.contact_id).filter(Boolean))]
      let contacts = {}
      if (ids.length) {
        const { data: cs } = await supabase.from('contacts')
          .select('id, first_name, last_name, email, phone, type, address').in('id', ids)
        ;(cs || []).forEach(c => { contacts[c.id] = c })
      }
      const map = {}
      ;(rows || []).forEach(r => { if (r.contact_id && contacts[r.contact_id]) map[r.role] = { ...contacts[r.contact_id], _pid: r.id } })
      setParties(map)
    } catch (e) { /* table may be empty */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [deal.id])

  async function setParty(role, contact) {
    try {
      // Remove any existing participant for this role, then add
      await supabase.from('tc_participants').delete().eq('tc_deal_id', deal.id).eq('role', role)
      await supabase.from('tc_participants').insert({ tc_deal_id: deal.id, role, contact_id: contact.id })

      // SELLER sync → listing_contacts (only if this deal is linked to a listing)
      if (role === 'seller' && deal.linked_listing_id) {
        const lid = deal.linked_listing_id
        const { data: existing } = await supabase.from('listing_contacts').select('id').eq('listing_id', lid).eq('role', 'seller')
        const isFirst = !existing || existing.length === 0
        const { error: insErr } = await supabase.from('listing_contacts')
          .upsert({ listing_id: lid, contact_id: contact.id, role: 'seller', primary_contact: isFirst }, { onConflict: 'listing_id,contact_id' })
        if (!insErr && isFirst) await supabase.from('listings').update({ seller_contact_id: contact.id }).eq('id', lid)
      }

      setAddingRole(null)
      load()
    } catch (e) { alert('Could not save: ' + e.message) }
  }
  async function removeParty(role) {
    try {
      await supabase.from('tc_participants').delete().eq('tc_deal_id', deal.id).eq('role', role)
      // keep listing_contacts in sync: remove this contact's seller link on the linked listing
      if (role === 'seller' && deal.linked_listing_id) {
        const cur = parties['seller']
        if (cur?.id) {
          await supabase.from('listing_contacts').delete().eq('listing_id', deal.linked_listing_id).eq('contact_id', cur.id)
          await supabase.from('listings').update({ seller_contact_id: null }).eq('id', deal.linked_listing_id).eq('seller_contact_id', cur.id)
        }
      }
      load()
    } catch {}
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading parties…</div>

  return (
    <div style={{ fontFamily: ff }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
        Everyone on this deal — linked to the Contacts board. Call or email any of them right here.
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {PARTY_ROLES.map(pr => {
          const c = parties[pr.key]
          return (
            <div key={pr.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--dim)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center' }}>{pr.icon}</span>
              <div style={{ minWidth: 120, flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{pr.label}</div>
                {c ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{contactName(c)}</div>
                   : <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Not set</div>}
              </div>
              {c && (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {c.phone && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.phone}</span>}
                  {c.email && <a href={'mailto:' + c.email} style={{ fontSize: 11.5, color: 'var(--brand)', textDecoration: 'none' }}>{c.email}</a>}
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                {c?.phone && <ClickToCall phone={c.phone} contactName={contactName(c)} contactId={c.id} size="sm" />}
                {c && (
                  <>
                    <a href={'/contacts/' + c.id + '/detail'} target="_blank" rel="noreferrer" title="Open contact"
                      style={{ fontSize: 13, textDecoration: 'none' }}>↗</a>
                    <button onClick={() => setAddingRole(pr.key)} title="Change"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>✏️</button>
                    <button onClick={() => removeParty(pr.key)} title="Remove"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#DC2626' }}>✕</button>
                  </>
                )}
                {!c && (
                  <button onClick={() => setAddingRole(pr.key)}
                    style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--brand)', background: 'rgba(204,34,0,.06)', color: 'var(--brand)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
                    + Link contact
                  </button>
                )}
              </div>
              {addingRole === pr.key && (
                <div style={{ position: 'absolute', zIndex: 50, marginTop: 4, right: 16, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, width: 300, boxShadow: '0 8px 24px rgba(0,0,0,.2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Link a contact as {pr.label}</div>
                  <ContactPicker placeholder={'Search contacts…'} onSelect={c2 => setParty(pr.key, c2)} agentId={deal.agent_id} />
                  <button onClick={() => setAddingRole(null)} style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Email / correspondence log ──────────────────────────────────
export function TCEmailLog({ deal }) {
  const [entries, setEntries] = useState(null)
  const [draft, setDraft] = useState({ subject: '', note: '', direction: 'sent' })
  const [saving, setSaving] = useState(false)

  // ── REAL SEND (added 2026-08-09) ──────────────────────────────────
  // Sends through the AUTHENTICATED USER'S own connected mailbox via
  // the existing, already-gated api/connector-send.js (same endpoint
  // used elsewhere). Respects EXTERNAL_EFFECTS_ENABLED server-side —
  // if it's off, this logs the attempt as 'blocked' rather than
  // pretending to send. NOT included in this pass: CC/BCC, attachments,
  // approved templates, reply-within-thread — those need separate,
  // larger work (thread/receive sync in particular).
  const [mode, setMode] = useState('log')   // 'log' | 'compose'
  const [contacts, setContacts] = useState([])   // linked parties with an email, from tc_participants
  const [compose, setCompose] = useState({ contact_id: '', to_email: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)

  async function loadContacts() {
    try {
      const { data: rows } = await supabase.from('tc_participants').select('contact_id').eq('tc_deal_id', deal.id)
      const ids = [...new Set((rows || []).map(r => r.contact_id).filter(Boolean))]
      if (!ids.length) { setContacts([]); return }
      const { data: cs } = await supabase.from('contacts').select('id, first_name, last_name, email').in('id', ids)
      setContacts((cs || []).filter(c => c.email))
    } catch { setContacts([]) }
  }

  async function load() {
    try {
      const { data } = await supabase.from('tc_correspondence')
        .select('*').eq('tc_deal_id', deal.id).order('created_at', { ascending: false }).limit(50)
      setEntries(data || [])
    } catch { setEntries([]) }
  }
  useEffect(() => { load(); loadContacts() }, [deal.id])

  async function addEntry() {
    if (!draft.subject.trim() && !draft.note.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('tc_correspondence').insert({
        tc_deal_id: deal.id, subject: draft.subject, note: draft.note,
        direction: draft.direction, send_status: 'logged', created_at: new Date().toISOString(),
      })
      if (error) throw error
      setDraft({ subject: '', note: '', direction: 'sent' })
      load()
    } catch (e) { alert('Run sql/tc_correspondence.sql first: ' + e.message) }
    setSaving(false)
  }

  async function sendEmail() {
    const toEmail = compose.contact_id
      ? contacts.find(c => c.id === compose.contact_id)?.email
      : compose.to_email.trim()
    if (!toEmail) { alert('Pick a linked contact or enter an email address'); return }
    if (!compose.subject.trim()) { alert('Subject required'); return }
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/connector-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}) },
        // agent_id intentionally omitted — connector-send.js derives the
        // sender from the SIGNED-IN user's own session, never a
        // client-supplied identity, so this always sends from whoever
        // is actually composing it (per handoff: "an agent may not
        // send from another agent's mailbox").
        body: JSON.stringify({
          provider: 'outlook',
          to: toEmail,
          contact_id: compose.contact_id || null,
          subject: compose.subject.trim(),
          html: '<p>' + compose.body.trim().replace(/\n/g, '</p><p>') + '</p>',
        }),
      })
      const result = await res.json()
      const blocked = result.blocked
      const ok = res.ok && !blocked && !result.error

      await supabase.from('tc_correspondence').insert({
        tc_deal_id: deal.id,
        direction: 'sent',
        subject: compose.subject.trim(),
        note: compose.body.trim(),
        contact_id: compose.contact_id || null,
        to_email: toEmail,
        provider: ok ? result.provider : null,
        from_account: ok ? result.from : null,
        send_status: blocked ? 'blocked' : ok ? 'sent' : 'failed',
        created_at: new Date().toISOString(),
      })

      if (blocked) alert('Logged, but not actually sent — external sending is currently disabled (EXTERNAL_EFFECTS_ENABLED is off).')
      else if (!ok) alert('Send failed: ' + (result.error || 'unknown error') + ' — logged as failed.')

      setCompose({ contact_id: '', to_email: '', subject: '', body: '' })
      setMode('log')
      load()
    } catch (e) {
      alert('Send failed: ' + e.message)
    } finally { setSending(false) }
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12.5, fontFamily: ff, boxSizing: 'border-box' }

  return (
    <div style={{ fontFamily: ff }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
        Send real email through your connected mailbox, or log a call/meeting/note — the whole thread lives here.
      </div>

      {/* Mode switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <button onClick={() => setMode('compose')}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                   border: '1px solid ' + (mode === 'compose' ? 'var(--brand)' : 'var(--border)'),
                   background: mode === 'compose' ? 'var(--brand)' : 'var(--bg)',
                   color: mode === 'compose' ? '#fff' : 'var(--text)' }}>
          ✉️ Compose Email
        </button>
        <button onClick={() => setMode('log')}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                   border: '1px solid ' + (mode === 'log' ? 'var(--brand)' : 'var(--border)'),
                   background: mode === 'log' ? 'var(--brand)' : 'var(--bg)',
                   color: mode === 'log' ? '#fff' : 'var(--text)' }}>
          📝 Log Call/Note
        </button>
      </div>

      {mode === 'compose' ? (
        <div style={{ background: 'var(--dim)', borderRadius: 10, padding: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select style={{ ...inp, flex: 1 }} value={compose.contact_id}
              onChange={e => setCompose(c => ({ ...c, contact_id: e.target.value, to_email: '' }))}>
              <option value="">— Pick a linked party —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(' ')} · {c.email}</option>)}
            </select>
          </div>
          {!compose.contact_id && (
            <input style={{ ...inp, marginBottom: 6 }} placeholder="Or enter an email address directly"
              value={compose.to_email} onChange={e => setCompose(c => ({ ...c, to_email: e.target.value }))} />
          )}
          <input style={{ ...inp, marginBottom: 6 }} placeholder="Subject"
            value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))} />
          <textarea style={{ ...inp, resize: 'vertical', marginBottom: 6 }} rows={4} placeholder="Message…"
            value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))} />
          <button onClick={sendEmail} disabled={sending}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            {sending ? 'Sending…' : '✉️ Send'}
          </button>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>
            Sends from your own connected Outlook/Gmail account. No CC/BCC or attachments yet.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--dim)', borderRadius: 10, padding: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <select value={draft.direction} onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}
              style={{ ...inp, width: 120, flexShrink: 0 }}>
              <option value="received">📥 Received</option>
              <option value="call">📞 Call</option>
              <option value="note">📝 Note</option>
            </select>
            <input value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
              placeholder="Subject / who / topic" style={inp} />
          </div>
          <textarea value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
            placeholder="What was said / summary…" rows={2} style={{ ...inp, resize: 'vertical', marginBottom: 6 }} />
          <button onClick={addEntry} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>
            {saving ? 'Saving…' : '+ Log entry'}
          </button>
        </div>
      )}

      {/* Log */}
      {entries === null ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
        : entries.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>No correspondence yet.</div>
        : entries.map(e => {
          const icon = { sent: '📤', received: '📥', call: '📞', note: '📝' }[e.direction] || '•'
          const statusBadge = e.send_status === 'sent' ? { label: '✓ Sent' + (e.from_account ? ' via ' + e.from_account : ''), color: '#10B981' }
            : e.send_status === 'blocked' ? { label: '⏸ Blocked (external effects off)', color: '#F5A623' }
            : e.send_status === 'failed' ? { label: '✕ Send failed', color: '#DC2626' }
            : null
          return (
            <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span>{icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{e.subject || '(no subject)'}</span>
                <span style={{ fontSize: 10.5, color: 'var(--muted)', flexShrink: 0 }}>{new Date(e.created_at).toLocaleString()}</span>
              </div>
              {e.to_email && <div style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 24 }}>To: {e.to_email}</div>}
              {e.note && <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 24, marginTop: 2, whiteSpace: 'pre-wrap' }}>{e.note}</div>}
              {statusBadge && <div style={{ fontSize: 10.5, fontWeight: 700, color: statusBadge.color, marginLeft: 24, marginTop: 2 }}>{statusBadge.label}</div>}
            </div>
          )
        })}
    </div>
  )
}
