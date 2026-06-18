// ═══════════════════════════════════════════════════════════════
// EMAIL SERVICE — powered by Resend
// All outbound emails from TargetOS go through here
// From: office@targetreteam.com
// ═══════════════════════════════════════════════════════════════

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY

const FROM_EMAIL = 'TargetOS <office@targetreteam.com>'
const REPLY_TO   = 'yanky@targetreteam.com'

// ── CORE SEND FUNCTION ────────────────────────────────────────
export async function sendEmail({ to, subject, html, text, replyTo }) {
  if(!RESEND_API_KEY) {
    console.warn('Resend API key not configured')
    return { success: false, error: 'API key not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
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
      console.error('Resend error:', data)
      return { success: false, error: data.message || 'Send failed' }
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
    weekday:'long', month:'long', day:'numeric',
    timeZone:'America/New_York'
  })
  return sendEmail({
    to:      email,
    subject: `📋 Your Daily Briefing — ${today}`,
    html,
    replyTo: 'yanky@targetreteam.com',
  })
}

// ── CONTACT EMAIL ─────────────────────────────────────────────
export async function sendContactEmail({ contactEmail, contactName, subject, body, agentName, agentEmail }) {
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1B2B4B;padding:20px 24px;border-radius:12px 12px 0 0;">
        <div style="color:#fff;font-size:18px;font-weight:800;">Target<span style="color:#F5A623;">OS</span></div>
        <div style="color:rgba(255,255,255,.5);font-size:11px;">Keller Williams Valley Realty</div>
      </div>
      <div style="background:#fff;padding:28px 24px;border:1px solid #E2E8F0;border-top:none;">
        <p style="color:#1E293B;font-size:15px;margin:0 0 16px;">${body.replace(/\n/g,'<br/>')}</p>
      </div>
      <div style="background:#F8FAFC;padding:16px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;font-size:12px;color:#94A3B8;">
        ${agentName} · Target Team · Keller Williams Valley Realty<br/>
        845.424.1014 · <a href="https://app.targetreteam.com" style="color:#CC2200;">app.targetreteam.com</a>
      </div>
    </div>`
  return sendEmail({
    to:      contactEmail,
    subject,
    html,
    replyTo: agentEmail || REPLY_TO,
  })
}

// ── DEAL NOTIFICATION ─────────────────────────────────────────
export async function sendDealNotification({ agentName, agentEmail, dealAddr, stage, gci }) {
  const stageColors = { 'Offer Accapted':'#D97706','Under Contract':'#2563EB','Closed':'#16A34A','Deal Fell Through':'#DC2626' }
  const color = stageColors[stage] || '#CC2200'
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:linear-gradient(135deg,#1B2B4B,#0F1A2E);border-radius:18px;padding:24px;text-align:center;">
        <div style="font-size:40px;margin-bottom:12px;">${stage==='Closed'?'🏆':stage==='Offer Accapted'?'📝':'🤝'}</div>
        <div style="color:#fff;font-size:22px;font-weight:900;margin-bottom:6px;">${stage}</div>
        <div style="color:rgba(255,255,255,.7);font-size:14px;margin-bottom:16px;">${dealAddr}</div>
        ${gci ? `<div style="background:rgba(245,166,35,.15);border-radius:10px;padding:12px;color:#F5A623;font-size:20px;font-weight:900;">GCI: $${Number(gci).toLocaleString()}</div>` : ''}
        <div style="margin-top:16px;color:rgba(255,255,255,.5);font-size:13px;">Agent: ${agentName}</div>
      </div>
    </div>`
  return sendEmail({
    to:      [agentEmail, 'yanky@targetreteam.com'],
    subject: `${stage==='Closed'?'🏆 CLOSED':'📝 '+stage}: ${dealAddr}`,
    html,
  })
}

// ── TASK REMINDER ─────────────────────────────────────────────
export async function sendTaskReminder({ agentEmail, agentName, tasks }) {
  const taskRows = tasks.map(t => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #F0F4F8;">
        <div style="font-size:13px;font-weight:600;color:#1E293B;">${t.title}</div>
        <div style="font-size:11px;color:${t.overdue?'#DC2626':'#94A3B8'};margin-top:2px;">
          ${t.overdue ? `⚠️ Overdue — was due ${t.due_date}` : `Due: ${t.due_date||'No date'}`}
        </div>
      </td>
    </tr>`).join('')

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:16px;">
      <div style="background:#1B2B4B;border-radius:12px 12px 0 0;padding:18px 24px;">
        <div style="color:#fff;font-size:16px;font-weight:800;">⏰ Task Reminder</div>
        <div style="color:rgba(255,255,255,.5);font-size:12px;margin-top:2px;">You have ${tasks.length} task${tasks.length>1?'s':''} that need attention</div>
      </div>
      <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;">
        <table style="width:100%;border-collapse:collapse;">${taskRows}</table>
      </div>
      <div style="padding:14px 24px;text-align:center;background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
        <a href="https://app.targetreteam.com" style="background:#CC2200;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;">Open TargetOS →</a>
      </div>
    </div>`

  return sendEmail({
    to: agentEmail,
    subject: `⏰ ${tasks.length} task${tasks.length>1?'s':''} need your attention`,
    html,
  })
}

// ── TEST EMAIL ────────────────────────────────────────────────
export async function sendTestEmail(to) {
  return sendEmail({
    to,
    subject: '✅ TargetOS Email Connected!',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
        <div style="background:linear-gradient(135deg,#1B2B4B,#0F1A2E);border-radius:18px;padding:28px;text-align:center;">
          <div style="font-size:40px;margin-bottom:14px;">🎉</div>
          <div style="color:#fff;font-size:20px;font-weight:900;margin-bottom:8px;">Email is Working!</div>
          <div style="color:rgba(255,255,255,.6);font-size:13px;margin-bottom:20px;">
            TargetOS email system is connected and sending correctly via Resend.
          </div>
          <a href="https://app.targetreteam.com" style="display:inline-block;background:linear-gradient(135deg,#CC2200,#E8650A);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:700;">Open TargetOS →</a>
        </div>
        <div style="text-align:center;margin-top:16px;font-size:11px;color:#94A3B8;">
          Target Team · Keller Williams Valley Realty · 845.424.1014
        </div>
      </div>`,
  })
}
