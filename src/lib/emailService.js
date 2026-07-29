// ═══════════════════════════════════════════════════════════════
// EMAIL SERVICE — powered by Resend via Vercel serverless proxy
// All calls go through /api/send-email to avoid CORS issues
// From: office@targetreteam.com
// ═══════════════════════════════════════════════════════════════
import { supabase } from './supabase'

const FROM_EMAIL = 'TargetOS <office@targetreteam.com>'
const REPLY_TO   = 'yanky@targetreteam.com'

// ── CORE SEND FUNCTION ────────────────────────────────────────
// CRITICAL: /api/send-email requires a valid agent session
// (requireAnyAgent) -- every call here MUST include the current
// session's access token, or every single email silently fails
// with an auth error before it ever reaches Resend.
export async function sendEmail({ to, subject, html, text, replyTo }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
      },
      body: JSON.stringify({
        from:     FROM_EMAIL,
        to:       Array.isArray(to) ? to : [to],
        reply_to: replyTo || REPLY_TO,
        subject,
        html,
        text: text || subject,
      }),
    })

    const data = await res.json()

    if(!res.ok) {
      console.error('Email error:', data)
      return { success: false, error: data.error || 'Send failed' }
    }

    return { success: true, id: data.id }
  } catch(e) {
    console.error('Email send failed:', e)
    return { success: false, error: e.message }
  }
}

// ── DAILY BRIEFING ────────────────────────────────────────────
export async function sendDailyBriefing({ agentName, email, html }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday:'long', month:'long', day:'numeric', timeZone:'America/New_York'
  })
  return sendEmail({
    to:      email,
    subject: `📋 Your Daily Briefing — ${today}`,
    html,
  })
}

// Fetch the signed-in agent's connected Outlook account (for showing the
// real From address before sending). Returns { connected, from }.
export async function getConnectedOutlookAccount() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/outlook-account', {
      headers: { ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}) },
    })
    if (!res.ok) return { connected: false, from: null }
    const d = await res.json()
    return { connected: !!d.connected, from: d.from || null }
  } catch (e) { return { connected: false, from: null } }
}

// Branded contact-email HTML (shared by the composers).
export function buildContactEmailHtml({ body, agentName }) {
  return `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1B2B4B;padding:20px 24px;border-radius:12px 12px 0 0;">
        <div style="color:#fff;font-size:18px;font-weight:800;">Target<span style="color:#F5A623;">OS</span></div>
        <div style="color:rgba(255,255,255,.5);font-size:11px;">Keller Williams Valley Realty</div>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #E2E8F0;border-top:none;">
        <p style="color:#1E293B;font-size:15px;margin:0 0 16px;">${String(body || '').replace(/\n/g, '<br/>')}</p>
      </div>
      <div style="background:#F8FAFC;padding:16px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;font-size:12px;color:#94A3B8;">
        ${agentName || 'Target Team'} · Target Team · Keller Williams Valley Realty<br/>
        845.424.1014 · <a href="https://app.targetreteam.com" style="color:#CC2200;">app.targetreteam.com</a>
      </div>
    </div>`
}

// Send a personal contact email through the SIGNED-IN AGENT'S connected
// Outlook mailbox via the delegated /api/connector-send endpoint. Attaches
// the agent's Supabase session JWT. Never touches Resend. Returns
// { ok, from, status, error, needsConnect }.
export async function postConnectorOutlook({ to, subject, html }) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/connector-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify({ provider: 'outlook', to, subject, html }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const needsConnect = res.status === 400 && /connect/i.test(data.error || '')
    return { ok: false, status: res.status, needsConnect, error: needsConnect ? 'Connect your Outlook account in Settings → Email Accounts to send email.' : (data.error || 'Send failed') }
  }
  return { ok: true, status: res.status, from: data.from || null }
}

// ── CONTACT EMAIL ─────────────────────────────────────────────
// Agent-composed contact emails now go OUT THROUGH THE AGENT'S OWN
// connected Outlook mailbox (Microsoft Graph, via /api/connector-send), so
// the message lands in the agent's Sent Items and the From is the agent's
// real address. Resend/office@ is no longer used for these. When the agent
// has no active Outlook connection we surface a clear Connect-Outlook error.
export async function sendContactEmail({ contactEmail, contactName, subject, body, agentName, agentEmail }) {
  const html = buildContactEmailHtml({ body, agentName })
  const r = await postConnectorOutlook({ to: contactEmail, subject, html })
  if (!r.ok) return { success: false, ok: false, needsConnect: r.needsConnect, error: r.error }
  return { success: true, ok: true, from: r.from }
}

// ── TASK REMINDER ─────────────────────────────────────────────
export async function sendTaskReminder({ agentEmail, agentName, tasks }) {
  const taskRows = tasks.map(t=>`
    <tr><td style="padding:10px 14px;border-bottom:1px solid #F0F4F8;">
      <div style="font-size:13px;font-weight:600;color:#1E293B;">${t.title}</div>
      <div style="font-size:11px;color:${t.overdue?'#DC2626':'#94A3B8'};margin-top:2px;">
        ${t.overdue?'⚠️ Overdue':'Due: '+t.due_date}
      </div>
    </td></tr>`).join('')
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:16px;">
      <div style="background:#1B2B4B;border-radius:12px 12px 0 0;padding:18px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:800;">⏰ Task Reminder</div>
      </div>
      <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;">
        <table style="width:100%;border-collapse:collapse;">${taskRows}</table>
      </div>
      <div style="padding:14px 24px;text-align:center;background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
        <a href="https://app.targetreteam.com" style="background:#CC2200;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;">Open TargetOS →</a>
      </div>
    </div>`
  return sendEmail({ to:agentEmail, subject:`⏰ ${tasks.length} task${tasks.length>1?'s':''} need your attention`, html })
}
