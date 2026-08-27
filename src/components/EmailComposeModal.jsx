// ═══════════════════════════════════════════════════════════════
// EmailComposeModal — sends from the signed-in agent's OWN connected
// Outlook account when one exists (via /api/connector-send + the real
// Microsoft Graph integration already in api/oauth-microsoft.js /
// api/connectors.js). Falls back to the shared office Resend account
// only when the agent has no personal account connected -- and says so
// plainly, rather than implying a personal send that didn't happen.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { Btn, Modal, ModalActions } from './UI'
import { sendContactEmail, getConnectedEmailAccount } from '../lib/emailService'
import { safeErrorMessage } from '../lib/errorMessage'

export function EmailComposeModal({ open, onClose, contact, agent, toast, initialSubject = '', initialBody = '', onSent }) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody]       = useState(initialBody)
  const [sending, setSending] = useState(false)
  const [emailAccount, setEmailAccount] = useState(undefined) // undefined=checking

  useEffect(() => {
    if (open) { setSubject(initialSubject || ''); setBody(initialBody || '') }
  }, [open, initialSubject, initialBody])

  useEffect(() => {
    if (!open || !agent?.id) { setEmailAccount(null); return }
    let alive = true
    setEmailAccount(undefined)
    getConnectedEmailAccount().then(account => { if (alive) setEmailAccount(account) })
      .catch(() => { if (alive) setEmailAccount({ connected:false }) })
    return () => { alive = false }
  }, [open, agent?.id])

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
        contactId: contact.id || null,
      })
      if (!r?.success) throw new Error(safeErrorMessage(r?.error, 'Send failed'))
      toast?.('📨 Sent from your connected mailbox to ' + (name || contact.email))
      onSent?.(contact, subject.trim(), { provider:emailAccount?.provider, from:r.from || emailAccount?.from })
      setSubject(''); setBody('')
      onClose()
    } catch (e) {
      toast?.('Email failed: ' + safeErrorMessage(e, 'Send failed'), '#DC2626')
    } finally { setSending(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={'📨 Email ' + (name || contact?.email || '')} width={560}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        To: <b>{contact?.email || '— no email on file —'}</b>
      </div>
      <div style={{ fontSize: 11.5, marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--dim)', border: '1px solid var(--border)' }}>
        {emailAccount === undefined ? 'Checking your email connection…' :
          emailAccount?.connected ? <>Sending from your connected {emailAccount.provider === 'gmail' ? 'Google' : 'Outlook'} mailbox: <b>{emailAccount.from || 'account connected'}</b></> :
          <>No personal mailbox connected. Connect Google or Outlook in Settings → My Email Accounts before sending.</>}
      </div>
      <input style={inp} placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
      <textarea style={{ ...inp, marginTop: 8, minHeight: 180, resize: 'vertical' }}
                placeholder={'Write your message…'}
                value={body} onChange={e => setBody(e.target.value)} />
      <ModalActions>
        <Btn variant="secondary" onClick={() => window.open('mailto:' + (contact?.email || ''))}>Open in mail app instead</Btn>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={send} loading={sending} disabled={!contact?.email}>Send Email</Btn>
      </ModalActions>
    </Modal>
  )
}
