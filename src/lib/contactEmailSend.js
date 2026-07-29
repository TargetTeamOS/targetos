// src/lib/contactEmailSend.js — orchestration for the Contact Detail inline
// composer. Sends ONLY through the agent's connected Outlook mailbox (via the
// injected send fn, which posts to /api/connector-send). There is NO Resend /
// sendEmail fallback. Microsoft Graph success is AUTHORITATIVE: once the send
// succeeds the email is delivered, so the contact activity is logged exactly
// once and a logging failure never turns a delivered email into a failure or
// a resend.
//
// deps = { buildHtml, send, logActivity }  (all injectable for tests)
//   buildHtml({body,agentName})  -> escaped branded HTML
//   send({to,subject,html})      -> { ok, from, error, needsConnect }
//   logActivity(info)            -> resolves on success; throws OR returns
//                                   { ok:false } / { error } on failure
export async function composeSendOutlook({ to, subject, body, agentName, outlook, deps }) {
  // 1) recipient
  if (!to) return { ok: false, error: 'Contact has no email address' }
  // 2) refuse while Outlook status is still loading
  if (outlook == null) return { ok: false, loading: true, error: 'Checking Outlook connection…' }
  // 3) refuse when Outlook is disconnected
  if (outlook.connected !== true) return { ok: false, needsConnect: true, error: 'Connect your Outlook account in Settings → Email Accounts to send email.' }

  // 4) build HTML  5) send exactly once
  const html = deps.buildHtml({ body, agentName })
  const r = await deps.send({ to, subject, html })

  // 6) send failure -> do not log, do not retry, do not call send again
  if (!r || !r.ok) {
    return { ok: false, needsConnect: !!(r && r.needsConnect), code: r && r.code, error: (r && r.error) || 'Send failed' }
  }

  // 7) Graph success is authoritative -- the email is sent.
  // 8) log exactly once inside try/catch; 9) handle throw AND {ok:false}/{error}
  let logFailed = false
  try {
    const lr = await deps.logActivity({ subject, body, to, from: r.from })
    if (lr && (lr.ok === false || lr.error)) logFailed = true
  } catch (e) { logFailed = true }

  // 12) never return ok:false after Graph success
  if (logFailed) return { ok: true, from: r.from, warning: 'Email sent, but the contact activity could not be recorded.' }
  return { ok: true, from: r.from }
}

// Real Supabase-backed activity logger. Inspects the RETURNED { error }
// (Supabase does not throw on insert errors) and raises a generic marker so
// no raw DB text reaches the user. Inserts at most once (called once by the
// orchestrator, only after a successful send).
export function makeAuditLogActivity(supabase, { agentId, contactId }) {
  return async function logActivity({ subject, body, to, from }) {
    const { error } = await supabase.from('audit_log').insert({
      agent_id: agentId,
      table_name: 'contacts',
      record_id: contactId,
      action: 'note',
      field_name: 'email',
      new_value: String(body || '').slice(0, 200),
      metadata: { type: 'email', description: 'Email sent: ' + subject, subject, body, to, from },
      created_at: new Date().toISOString(),
    })
    if (error) throw new Error('activity_log_failed')
  }
}

// Map a composeSendOutlook result to composer side-effects (single toast,
// clear-on-success, onSent-once). Kept pure/injectable so the component's
// success/failure UX contract is directly testable without a DOM.
export function applyComposeResult(result, recipient, { toast, clearDraft, onSent }) {
  if (!result.ok) {
    // pre-send failure -> sanitized error, keep the draft, do NOT call onSent
    toast('❌ Failed to send: ' + result.error, '#DC2626')
    return { cleared: false, notified: false }
  }
  const base = 'Email sent from ' + (result.from || 'your Outlook') + ' to ' + recipient + '.'
  toast('✅ ' + (result.warning ? base + ' ' + result.warning : base))
  clearDraft()
  onSent && onSent()
  return { cleared: true, notified: true }
}
