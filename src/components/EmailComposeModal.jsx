// ═══════════════════════════════════════════════════════════════
// EmailComposeModal — send a real email from inside the CRM to a
// contact, through the existing Resend integration (branded TargetOS
// template, reply-to = the sending agent's email so responses land
// in their normal inbox). This is the first in-CRM contact email;
// the previous "Send Email" button only opened the user's own mail
// app via mailto.
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { Btn, Modal, ModalActions } from './UI'
import { sendContactEmail } from '../lib/emailService'

export function EmailComposeModal({ open, onClose, contact, agent, toast }) {
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [sending, setSending] = useState(false)

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }
  const name = contact ? ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() : ''

  async function send() {
    if (!contact?.email) { toast?.('This contact has no email address', '#DC2626'); return }
    if (!subject.trim() || !body.trim()) { toast?.('Subject and message are required', '#DC2626'); return }
    setSending(true)
    try {
      const r = await sendContactEmail({
        contactEmail: contact.email, contactName: name,
        subject: subject.trim(), body: body.trim(),
        agentName: agent?.name || 'Target Team', agentEmail: agent?.email || null,
      })
      if (r && r.ok === false) throw new Error(r.error || 'send failed')
      toast?.('📨 Email sent to ' + (name || contact.email))
      setSubject(''); setBody('')
      onClose()
    } catch (e) {
      toast?.('Email failed: ' + (e.message || 'unknown error'), '#DC2626')
    } finally { setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={'📨 Email ' + (name || contact?.email || '')} width={560}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        To: <b>{contact?.email || '— no email on file —'}</b>
        {agent?.email ? <> · Replies go to <b>{agent.email}</b></> : null}
      </div>
      <input style={inp} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea style={{ ...inp, marginTop: 8, minHeight: 180, resize: 'vertical' }}
                placeholder={'Write your message…\n\nIt will be sent in the Target Team branded template with your name in the footer.'}
                value={body} onChange={e => setBody(e.target.value)} />
      <ModalActions>
        <Btn variant="secondary" onClick={() => window.open('mailto:' + (contact?.email || ''))}>Open in mail app instead</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={send} loading={sending} disabled={!contact?.email}>Send Email</Btn>
      </ModalActions>
    </Modal>
  )
}
