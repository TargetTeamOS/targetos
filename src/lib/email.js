// Agent email map for easy lookup
export const AGENT_EMAILS = {
  'Lazer Farkas':       'lazer@targetreteam.com',
  'Mendy Jankovits':    'mendy@targetreteam.com',
  'Isaac Leibowitz':    'isaac@targetreteam.com',
  'Yanky Lichtenstein': 'yanky@targetreteam.com',
  'Gitty Fogel':        'office@targetreteam.com',
  'Joel Rottenstein':   'joel@targetreteam.com',
  'Eli Hoffman':        'eli@targetreteam.com',
  'Avraham Weinberger': 'avraham@targetreteam.com',
}

/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — Email Service (Resend)
   ═══════════════════════════════════════════════════════════════ */

const FROM = 'TargetOS <office@targetreteam.com>'

export async function sendEmail({ to, subject, html, cc, replyTo }) {
  // Always route through the server-side API endpoint
  // Never call Resend directly from the browser — keeps API key server-side only
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html, cc, reply_to: replyTo })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || data.error || 'Email send failed')
    return { success: true, id: data.id }
  } catch(e) {
    console.error('Email error:', e)
    return { success: false, error: e.message }
  }
}

export function buildDailyBriefingEmail({ agentName, agentColor, tasks = [], overdueCount = 0 }) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#F0F2F5;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
        
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#1B2B4B,#2A4070);padding:28px 32px;">
          <div style="font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;">
            Target<span style="color:#F5A623;">OS</span>
          </div>
          <div style="font-size:13px;color:rgba(255,255,255,.6);">Daily Briefing · ${today}</div>
        </div>

        <!-- Greeting -->
        <div style="padding:28px 32px 0;">
          <div style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:6px;">
            Good morning, ${agentName.split(' ')[0]}! 👋
          </div>
          <div style="font-size:13px;color:#64748B;">
            Here's what's on your plate today.
          </div>
        </div>

        <!-- Overdue alert -->
        ${overdueCount > 0 ? `
        <div style="margin:20px 32px 0;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">⚠️</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#DC2626;">${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}</div>
            <div style="font-size:12px;color:#DC2626;">These need your immediate attention</div>
          </div>
        </div>` : ''}

        <!-- Tasks -->
        <div style="padding:20px 32px;">
          <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">
            Today's Tasks (${tasks.length})
          </div>
          ${tasks.length === 0
            ? '<div style="padding:20px;text-align:center;color:#94A3B8;font-size:13px;">🎯 No tasks due today — great job!</div>'
            : tasks.slice(0, 8).map(t => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F1F5F9;">
                <div style="width:8px;height:8px;border-radius:2px;background:${
                  t.priority === 'urgent' ? '#DC2626' :
                  t.priority === 'high'   ? '#D97706' : '#0EA5E9'
                };flex-shrink:0;"></div>
                <div style="flex:1;font-size:13px;color:#0F172A;">${t.title}</div>
                ${t.due_date ? `<div style="font-size:11px;color:#94A3B8;">${t.due_date}</div>` : ''}
              </div>
            `).join('')
          }
        </div>

        <!-- Footer -->
        <div style="padding:20px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
          <a href="https://app.targetreteam.com" style="display:inline-block;background:#CC2200;color:#fff;padding:11px 28px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700;">
            Open TargetOS →
          </a>
          <div style="margin-top:14px;font-size:11px;color:#94A3B8;">
            Target Team · KW Valley Realty · app.targetreteam.com
          </div>
        </div>
      </div>
    </body>
    </html>
  `
}

// Alias
export const buildDailyEmail = buildDailyBriefingEmail
