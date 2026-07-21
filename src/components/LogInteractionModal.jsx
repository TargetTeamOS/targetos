// ═══════════════════════════════════════════════════════════════
// LOG INTERACTION MODAL (July 2026)
// Records a contact touch that happened outside the CRM (WhatsApp,
// personal phone, in person, email, manual follow-up) into the
// `interactions` table. A DB trigger stamps the contact contacted /
// first_contact_at / last_contact_at, so the lead drops out of the
// Uncontacted Leads alert. Future WhatsApp/email integrations can
// write to the same table.
// ═══════════════════════════════════════════════════════════════
import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const ff = 'Inter,system-ui,sans-serif'
const TYPES = [
  { v: 'call', label: '📞 Call' }, { v: 'sms', label: '💬 SMS' }, { v: 'whatsapp', label: '🟢 WhatsApp' },
  { v: 'email', label: '📧 Email' }, { v: 'in_person', label: '🤝 In Person' }, { v: 'note', label: '📝 Note' }, { v: 'other', label: '• Other' },
]

export function LogInteractionModal({ open, onClose, contact, agent, onLogged, toast }) {
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
  const [type, setType] = useState('call')
  const [direction, setDirection] = useState('outbound')
  const [when, setWhen] = useState(nowLocal())
  const [notes, setNotes] = useState('')
  const [followUp, setFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [countsAsContact, setCountsAsContact] = useState(true)
  const [saving, setSaving] = useState(false)

  // Notes/other default to NOT counting as client contact; real touches do.
  function onTypeChange(v) {
    setType(v)
    setCountsAsContact(!(v === 'note' || v === 'other'))
  }

  async function save() {
    setSaving(true)
    try {
      const occurred = when ? new Date(when).toISOString() : new Date().toISOString()
      const { error } = await supabase.from('interactions').insert({
        contact_id: contact.id,
        agent_id: agent?.id || null,
        type, direction,
        notes: notes || null,
        occurred_at: occurred,
        follow_up: followUp,
        follow_up_date: followUp && followUpDate ? followUpDate : null,
        counts_as_contact: countsAsContact,
        created_by: agent?.id || null,
      })
      if (error) throw error

      // Optional follow-up task
      if (followUp && followUpDate) {
        try {
          await supabase.from('tasks').insert({
            title: 'Follow up: ' + [(contact.first_name||''),(contact.last_name||'')].join(' ').trim(),
            agent_id: agent?.id || contact.agent_id || null,
            contact_id: contact.id,
            due_date: followUpDate, priority: 'normal', status: 'pending',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          })
        } catch {}
      }
      toast && toast('Interaction logged', '#0B7A45')
      onLogged && onLogged()
      onClose()
    } catch (e) {
      toast ? toast('Could not log (run sql/interactions.sql?): ' + e.message, '#DC2626') : alert('Error: ' + e.message)
    }
    setSaving(false)
  }

  if (!open) return null
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff, boxSizing: 'border-box' }
  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4, display: 'block' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, width: 'min(460px, 95vw)', maxHeight: '90vh', overflowY: 'auto', fontFamily: ff, boxShadow: '0 16px 48px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>➕ Log Interaction</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--muted)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Record a touch with {[(contact.first_name||''),(contact.last_name||'')].join(' ').trim() || 'this contact'} that happened outside the CRM.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Type</label>
            <select value={type} onChange={e => onTypeChange(e.target.value)} style={inp}>
              {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Direction</label>
            <select value={direction} onChange={e => setDirection(e.target.value)} style={inp}>
              <option value="outbound">Outbound (we reached out)</option>
              <option value="inbound">Inbound (they reached us)</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}><label style={lbl}>Date &amp; Time</label>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={inp} />
        </div>

        <div style={{ marginBottom: 10 }}><label style={lbl}>Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="What was discussed…" style={{ ...inp, resize: 'vertical' }} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={countsAsContact} onChange={e => setCountsAsContact(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#0B7A45' }} />
          Mark contact as contacted
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: followUp ? 8 : 16, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#CC2200' }} />
          Follow-up needed
        </label>
        {followUp && (
          <div style={{ marginBottom: 16 }}><label style={lbl}>Follow-up date (creates a task)</label>
            <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={inp} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 2, padding: 11, borderRadius: 9, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: ff }}>{saving ? 'Saving…' : 'Log Interaction'}</button>
        </div>
      </div>
    </div>
  )
}
