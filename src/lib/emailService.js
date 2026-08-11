// ═══════════════════════════════════════════════════════════════
// EMAIL SERVICE — powered by Resend via Vercel serverless proxy
// All calls go through /api/send-email to avoid CORS issues
// From: office@targetreteam.com
// ═══════════════════════════════════════════════════════════════
import { supabase } from './supabase'
import { safeErrorMessage } from './errorMessage'

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
      return { success: false, error: safeErrorMessage(data.error, 'Send failed') }
    }

    return { success: true, id: data.id }
  } catch(e) {
    console.error('Email send failed:', e)
    return { success: false, error: e.message }
  }
}

async function sessionHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}
}

// Resolve the authenticated CRM user's personal mailbox. Outlook is preferred
// when both are connected, but Gmail is a fully supported sender.
export async function getConnectedEmailAccount() {
  try {
    const headers = await sessionHeaders()
    if (!headers.Authorization) return { connected:false, provider:null, from:null, error:'Your TargetOS session has expired.' }
    const res = await fetch('/api/connectors', {
      method:'POST', headers:{ 'Content-Type':'application/json', ...headers },
      body:JSON.stringify({ action:'my_accounts' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { connected:false, provider:null, from:null, error:safeErrorMessage(data.error, 'Mailbox status unavailable') }
    const accounts = Array.isArray(data.accounts) ? data.accounts : []
    const account = accounts.find(a => a.provider === 'outlook' && a.status === 'connected')
      || accounts.find(a => a.provider === 'google' && a.status === 'connected')
    if (!account) return { connected:false, provider:null, from:null }
    return {
      connected:true,
      provider:account.provider === 'google' ? 'gmail' : 'outlook',
      from:account.account_email || null,
    }
  } catch (error) {
    return { connected:false, provider:null, from:null, error:safeErrorMessage(error, 'Mailbox status unavailable') }
  }
}

export async function sendConnectedEmail({ provider, to, subject, html, text, contactId }) {
  try {
    const headers = await sessionHeaders()
    if (!headers.Authorization) return { success:false, error:'Your TargetOS session has expired.' }
    const res = await fetch('/api/connector-send', {
      method:'POST', headers:{ 'Content-Type':'application/json', ...headers },
      body:JSON.stringify({ provider, to, subject, html, text, contact_id:contactId || null }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok !== true) {
      return { success:false, error:safeErrorMessage(data.error, 'Email could not be sent'), needsConnect:res.status === 400 }
    }
    return { success:true, id:data.id || null, from:data.from || null, provider:data.provider || provider }
  } catch (error) {
    return { success:false, error:safeErrorMessage(error, 'Email service unavailable') }
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

// ── CONTACT EMAIL ─────────────────────────────────────────────
export async function sendContactEmail({ contactEmail, contactName, subject, body, agentName, agentEmail, contactId }) {
  const account = await getConnectedEmailAccount()
  if (!account.connected) {
    return { success:false, needsConnect:true, error:account.error || 'Connect Google or Outlook in Settings → Email Accounts before sending.' }
  }
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1B2B4B;padding:20px 24px;border-radius:12px 12px 0 0;">
        <div style="color:#fff;font-size:18px;font-weight:800;">Target<span style="color:#F5A623;">OS</span></div>
        <div style="color:rgba(255,255,255,.5);font-size:11px;">Keller Williams Valley Realty</div>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #E2E8F0;border-top:none;">
        <p style="color:#1E293B;font-size:15px;margin:0 0 16px;">${escapeEmailHtml(body).replace(/\n/g,'<br/>')}</p>
      </div>
      <div style="background:#F8FAFC;padding:16px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;font-size:12px;color:#94A3B8;">
        ${escapeEmailHtml(agentName)} · Target Team · Keller Williams Valley Realty<br/>
        845.424.1014 · <a href="https://app.targetreteam.com" style="color:#CC2200;">app.targetreteam.com</a>
      </div>
    </div>`
  return sendConnectedEmail({ provider:account.provider, to:contactEmail, subject, html, contactId })
}

function escapeEmailHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
