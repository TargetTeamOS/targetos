import { useState } from 'react'
import { Modal, Btn } from './UI'
import { authFetch } from '../lib/apiAuth'

// Sends a real SMS through Twilio (/api/send-sms) and logs it to the
// contact. Replaces the old sms: hand-off that opened the phone app.
export function SmsComposeModal({ open, onClose, contact, agent, toast, onSent }) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const name = contact ? ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() : ''
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }

  async function send() {
    if (!contact?.phone) { toast?.('This contact has no phone number', '#DC2626'); return }
    if (!body.trim()) { toast?.('Write a message first', '#DC2626'); return }
    setSending(true)
    try {
      const r = await authFetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: contact.phone, body: body.trim(), contactId: contact.id, agentId: agent?.id }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'send failed')
      toast?.('💬 Text sent to ' + (name || contact.phone))
      setBody(''); onSent?.(); onClose()
    } catch (e) {
      toast?.('Text failed: ' + (e.message || 'unknown'), '#DC2626')
    } finally { setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={'💬 Text ' + (name || contact?.phone || '')} width={480}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        To: <b>{contact?.phone || '— no phone on file —'}</b> · sent from the team line, logged here
      </div>
      <textarea style={{ ...inp, minHeight: 120, resize: 'vertical' }} maxLength={1000}
        placeholder="Write your text message…" value={body} onChange={e => setBody(e.target.value)} />
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>{body.length}/1000</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <Btn variant="secondary" onClick={() => window.open('sms:' + (contact?.phone || ''))}>Open phone app</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={send} loading={sending} disabled={!contact?.phone}>Send Text</Btn>
      </div>
    </Modal>
  )
}
