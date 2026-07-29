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
import { sendContactEmail } from '../lib/emailService'

async function authHeaders() {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    return token ? { Authorization: 'Bearer ' + token } : {}
  } catch { return {} }
}

export function EmailComposeModal({ open, onClose, contact, agent, toast, initialSubject = '', initialBody = '', onSent }) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody]       = useState(initialBody)
  const [sending, setSending] = useState(false)
  const [outlookAccount, setOutlookAccount] = useState(undefined) // undefined=checking, null=not connected, {}=connected

  useEffect(() => {
    if (open) { setSubject(initialSubject || ''); setBody(initialBody || '') }
  }, [open, initialSubject, initialBody])

  useEffect(() => {
    if (!open || !agent?.id) { setOutlookAccount(null); return }
    let alive = true
    setOutlookAccount(undefined)
    ;(async () => {
      try {
        const h = await authHeaders()
        const r = await fetch('/api/connectors', {
          method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h),
          body: JSON.stringify({ action: 'my_accounts', agent_id: agent.id }),
        })
        const j = await r.json()
        const acct = (j.accounts || []).find(a => a.provider === 'outlook' && a.status === 'connected')
        if (alive) setOutlookAccount(acct || null)
      } catch { if (alive) setOutlookAccount(null) }
    })()
    return () => { alive = false }
  }, [open, agent?.id])

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }
  const name = contact ? ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim() : ''

  async function send() {
    if (!contact?.email) { toast?.('This contact has no email address', '#DC2626'); return }
    if (!subject.trim() || !body.trim()) { toast?.('Subject and message are required', '#DC2626'); return }
    setSending(true)
    try {
      if (outlookAccount) {
        const h = await authHeaders()
        const r = await fetch('/api/connector-send', {
          method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h),
          body: JSON.stringify({
            provider: 'outlook', to: contact.email, subject: subject.trim(),
            html: '<p>' + body.trim().replace(/\n/g, '<br/>') + '</p>',
            agent_id: agent.id, contact_id: contact.id || null,
          }),
        })
        const j = await r.json()
        if (!r.ok || j.error) throw new Error(j.error || 'Outlook send failed')
        toast?.('📨 Sent from your Outlook (' + (j.from || outlookAccount.account_email) + ') to ' + (name || contact.email))
        onSent?.(contact, subject.trim(), { provider: 'outlook', from: j.from || outlookAccount.account_email })
      } else {
        const r = await sendContactEmail({
          contactEmail: contact.email, contactName: name,
          subject: subject.trim(), body: body.trim(),
          agentName: agent?.name || 'Target Team', agentEmail: agent?.email || null,
        })
        if (r && r.success === false) throw new Error(r.error || 'Send failed')
        toast?.('📨 Sent from the shared office account to ' + (name || contact.email))
        onSent?.(contact, subject.trim(), { provider: 'resend', from: 'office@targetreteam.com' })
      }
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
      </div>
      <div style={{ fontSize: 11.5, marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--dim)', border: '1px solid var(--border)' }}>
        {outlookAccount === undefined ? 'Checking your email connection…' :
          outlookAccount ? <>Sending from your Outlook: <b>{outlookAccount.account_email}</b></> :
          <>No personal email connected — this will send from the shared office account (office@targetreteam.com), not your own. Connect Outlook in Settings → My Email Accounts to send from your own address.</>}
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
