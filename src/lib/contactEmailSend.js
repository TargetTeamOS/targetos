// src/lib/contactEmailSend.js — orchestration for the Contact Detail inline
// composer. Sends ONLY through the agent's connected Outlook mailbox (via the
// injected send fn, which posts to /api/connector-send). There is NO Resend /
// sendEmail fallback. The contact activity is logged ONLY after Microsoft
// Graph confirms success — a failed send never records a successful activity.
//
// deps = { send, logActivity }  (both injectable for tests)
//   send(input)        -> { ok, from, error, needsConnect }
//   logActivity(info)  -> persists the "email sent" activity (called at most once)
export async function composeSendOutlook({ to, subject, body, agentName, outlook, deps }) {
  if (!to) return { ok: false, error: 'Contact has no email address' }
  // Outlook status must be loaded AND connected before we send or log.
  if (!outlook || outlook.connected !== true) {
    return { ok: false, needsConnect: true, error: 'Connect your Outlook account in Settings → Email Accounts to send email.' }
  }
  const html = deps.buildHtml({ body, agentName })
  const r = await deps.send({ to, subject, html })
  if (!r || !r.ok) {
    // Sanitized connector error only — never retry through Resend.
    return { ok: false, needsConnect: !!(r && r.needsConnect), error: (r && r.error) || 'Send failed' }
  }
  // Success confirmed by Graph → record the activity exactly once.
  await deps.logActivity({ subject, body, to, from: r.from })
  return { ok: true, from: r.from }
}
