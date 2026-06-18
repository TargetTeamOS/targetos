// ═══════════════════════════════════════════════════════════════
// DAILY BRIEFING EMAIL — Beautiful redesign
// No GCI section, everything clickable, clean modern layout
// ═══════════════════════════════════════════════════════════════

export const AGENT_EMAILS = {
  'Lazer Farkas':      'lazer@targetreteam.com',
  'Mendy Jankovits':   'mendy@targetreteam.com',
  'Isaac Leibowitz':   'isaac6829490@gmail.com',
  'Yanky Lichtenstein':'yanky@targetreteam.com',
  'Gitty Fogel':       'office@targetreteam.com',
  'Joel Rottenstein':  'joel@targetreteam.com',
  'Eli Hoffman':       'eli@targetreteam.com',
  'Avraham Weinberger':'avraham@targetreteam.com',
}

const APP = 'https://app.targetreteam.com'

const QUOTES = [
  { q:"Your next deal is one conversation away.", a:"Target Team" },
  { q:"Every call you make is a door you open.", a:"Target Team" },
  { q:"Consistency builds empires. Show up every day.", a:"Target Team" },
  { q:"In real estate, relationships are your inventory.", a:"Target Team" },
  { q:"Be so good they can't ignore you.", a:"Steve Martin" },
  { q:"The secret of getting ahead is getting started.", a:"Mark Twain" },
  { q:"Success is not final, failure is not fatal — it is the courage to continue that counts.", a:"Winston Churchill" },
  { q:"Push yourself, because no one else is going to do it for you.", a:"Unknown" },
  { q:"Great things never come from comfort zones.", a:"Unknown" },
  { q:"Wake up with determination. Go to bed with satisfaction.", a:"Unknown" },
  { q:"Do something today that your future self will thank you for.", a:"Unknown" },
  { q:"Sometimes later becomes never. Do it now.", a:"Unknown" },
  { q:"Discipline is choosing between what you want now and what you want most.", a:"Unknown" },
  { q:"The best time to plant a tree was 20 years ago. The second best time is now.", a:"Chinese Proverb" },
  { q:"A real estate agent's most powerful asset is their follow-up.", a:"Target Team" },
]

function getQuote() {
  const i = (new Date().getDay() + new Date().getDate()) % QUOTES.length
  return QUOTES[i]
}

function getDayStr() {
  return new Date().toLocaleDateString('en-US', {
    weekday:'long', month:'long', day:'numeric', year:'numeric',
    timeZone:'America/New_York'
  })
}

function priorityColor(p) {
  return { urgent:'#DC2626', high:'#D97706', normal:'#0EA5E9', low:'#94A3B8' }[p||'normal'] || '#0EA5E9'
}

function priorityBg(p) {
  return { urgent:'#FEF2F2', high:'#FFFBEB', normal:'#EFF6FF', low:'#F8FAFC' }[p||'normal'] || '#EFF6FF'
}

export function buildDailyEmail({ agentName, tasks=[], overdueTasks=[], appointments=[], agentColor='#CC2200' }) {
  const quote = getQuote()
  const day = getDayStr()
  const firstName = agentName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const ini = (agentName.split(' ')[0][0]||'?') + (agentName.split(' ')[1]?.[0]||'')

  // Task rows — each links to tasks page
  const taskRows = tasks.length > 0
    ? tasks.map(t => `
      <tr>
        <td style="padding:0;">
          <a href="${APP}#tasks" style="text-decoration:none;display:block;padding:13px 20px;border-bottom:1px solid #F1F5F9;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="20" valign="top" style="padding-top:2px;">
                  <div style="width:16px;height:16px;border-radius:4px;border:2px solid ${priorityColor(t.priority)};background:transparent;"></div>
                </td>
                <td style="padding-left:10px;">
                  <div style="font-size:13px;font-weight:600;color:#1E293B;line-height:1.4;">${t.title}</div>
                  <div style="font-size:11px;color:${priorityColor(t.priority)};margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;">
                    ${t.priority||'normal'} priority${t.due_date ? ' · Due today' : ''}
                  </div>
                </td>
                <td width="60" align="right" valign="middle">
                  <span style="font-size:10px;background:${priorityBg(t.priority)};color:${priorityColor(t.priority)};padding:3px 8px;border-radius:20px;font-weight:700;">Open →</span>
                </td>
              </tr>
            </table>
          </a>
        </td>
      </tr>`).join('')
    : `<tr><td style="padding:20px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">✅</div>
        <div style="font-size:14px;font-weight:700;color:#16A34A;margin-bottom:3px;">All clear!</div>
        <div style="font-size:12px;color:#94A3B8;">No tasks scheduled for today — great day to prospect.</div>
      </td></tr>`

  // Overdue rows
  const overdueRows = overdueTasks.length > 0
    ? overdueTasks.map(t => {
        const daysOverdue = t.due_date ? Math.floor((Date.now()-new Date(t.due_date))/86400000) : 1
        return `
        <tr>
          <td style="padding:0;">
            <a href="${APP}#tasks" style="text-decoration:none;display:block;padding:13px 20px;border-bottom:1px solid #FEE2E2;background:#FFF5F5;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="20" valign="top" style="padding-top:2px;">
                    <div style="font-size:16px;">⚠️</div>
                  </td>
                  <td style="padding-left:10px;">
                    <div style="font-size:13px;font-weight:700;color:#DC2626;line-height:1.4;">${t.title}</div>
                    <div style="font-size:11px;color:#EF4444;margin-top:3px;">
                      ${daysOverdue} day${daysOverdue>1?'s':''} overdue · Was due ${new Date(t.due_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                    </div>
                  </td>
                  <td width="70" align="right" valign="middle">
                    <span style="font-size:10px;background:#FEE2E2;color:#DC2626;padding:3px 8px;border-radius:20px;font-weight:700;">Fix Now →</span>
                  </td>
                </tr>
              </table>
            </a>
          </td>
        </tr>`
      }).join('')
    : ''

  // Appointment rows
  const apptRows = appointments.length > 0
    ? appointments.map(a => `
      <tr>
        <td style="padding:0;">
          <a href="${APP}#calendar" style="text-decoration:none;display:block;padding:13px 20px;border-bottom:1px solid #DBEAFE;background:#EFF6FF;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="36" valign="middle">
                  <div style="width:36px;height:36px;border-radius:8px;background:#2563EB;display:flex;align-items:center;justify-content:center;font-size:16px;text-align:center;line-height:36px;">📅</div>
                </td>
                <td style="padding-left:10px;">
                  <div style="font-size:13px;font-weight:700;color:#1E40AF;line-height:1.4;">${a.title}</div>
                  <div style="font-size:11px;color:#60A5FA;margin-top:2px;">${a.time||''}${a.location?' · '+a.location:''}</div>
                </td>
                <td width="70" align="right" valign="middle">
                  <span style="font-size:10px;background:#DBEAFE;color:#2563EB;padding:3px 8px;border-radius:20px;font-weight:700;">View →</span>
                </td>
              </tr>
            </table>
          </a>
        </td>
      </tr>`).join('')
    : ''

  const hasOverdue = overdueTasks.length > 0
  const hasAppts = appointments.length > 0

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Daily Briefing — ${day}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:20px 12px 40px;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1B2B4B 0%,#0F1A2E 100%);border-radius:18px 18px 0 0;padding:30px 28px 26px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(204,34,0,.12);"></div>
    <div style="position:absolute;bottom:-40px;left:-20px;width:100px;height:100px;border-radius:50%;background:rgba(245,166,35,.06);"></div>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="48">
          <div style="width:48px;height:48px;border-radius:12px;background:${agentColor};display:table-cell;vertical-align:middle;text-align:center;font-size:18px;font-weight:900;color:#fff;">${ini}</div>
        </td>
        <td style="padding-left:14px;">
          <div style="color:#fff;font-size:20px;font-weight:800;line-height:1.2;">${greeting}, ${firstName}! 👋</div>
          <div style="color:rgba(255,255,255,.45);font-size:12px;margin-top:3px;">${day}</div>
        </td>
        <td width="80" align="right">
          <a href="${APP}" style="display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 12px;border-radius:8px;">Open App →</a>
        </td>
      </tr>
    </table>

    <div style="margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1);">
      <div style="color:rgba(255,255,255,.65);font-size:13px;line-height:1.7;">
        ${tasks.length > 0
          ? `You have <strong style="color:#fff;">${tasks.length} task${tasks.length>1?'s':''}</strong> due today.`
          : `You're all clear on tasks today.`}
        ${hasAppts ? ` <strong style="color:#93C5FD;">${appointments.length} appointment${appointments.length>1?'s':''}</strong> scheduled.` : ''}
        ${hasOverdue ? ` <strong style="color:#FCA5A5;">${overdueTasks.length} overdue item${overdueTasks.length>1?'s':''} need attention.</strong>` : ''}
      </div>
    </div>
  </div>

  <!-- OVERDUE (if any) -->
  ${hasOverdue ? `
  <div style="background:#fff;border-left:4px solid #DC2626;border-right:1px solid #FEE2E2;border-bottom:1px solid #FEE2E2;">
    <div style="padding:12px 20px 6px;">
      <span style="font-size:10px;font-weight:800;color:#DC2626;text-transform:uppercase;letter-spacing:.8px;">⚠️ Overdue — Needs Attention (${overdueTasks.length})</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${overdueRows}</table>
  </div>` : ''}

  <!-- APPOINTMENTS (if any) -->
  ${hasAppts ? `
  <div style="background:#fff;border-left:4px solid #2563EB;border-right:1px solid #DBEAFE;border-bottom:1px solid #DBEAFE;margin-top:1px;">
    <div style="padding:12px 20px 6px;">
      <span style="font-size:10px;font-weight:800;color:#2563EB;text-transform:uppercase;letter-spacing:.8px;">📅 Today's Appointments (${appointments.length})</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${apptRows}</table>
  </div>` : ''}

  <!-- TODAY'S TASKS -->
  <div style="background:#fff;border-left:4px solid ${agentColor};border-right:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;margin-top:1px;">
    <div style="padding:12px 20px 6px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:10px;font-weight:800;color:${agentColor};text-transform:uppercase;letter-spacing:.8px;">✓ Today's Tasks (${tasks.length})</span>
      ${tasks.length > 0 ? `<a href="${APP}#tasks" style="font-size:10px;color:${agentColor};text-decoration:none;font-weight:700;">View all →</a>` : ''}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">${taskRows}</table>
  </div>

  ${!hasOverdue ? `
  <!-- ALL CAUGHT UP -->
  <div style="background:#F0FDF4;border-left:4px solid #16A34A;border-right:1px solid #BBF7D0;border-bottom:1px solid #BBF7D0;margin-top:1px;padding:14px 20px;">
    <span style="font-size:13px;font-weight:600;color:#16A34A;">✅ No overdue tasks — you're all caught up!</span>
  </div>` : ''}

  <!-- QUOTE -->
  <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:22px 24px;margin-top:1px;">
    <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;">💬 Daily Inspiration</div>
    <div style="border-left:3px solid ${agentColor};padding-left:16px;">
      <div style="font-size:16px;font-style:italic;color:#334155;line-height:1.7;font-weight:500;">"${quote.q}"</div>
      <div style="font-size:12px;color:#94A3B8;margin-top:8px;">— ${quote.a}</div>
    </div>
  </div>

  <!-- FOOTER CTA -->
  <div style="background:linear-gradient(135deg,#1B2B4B,#0F1A2E);border-radius:0 0 18px 18px;padding:22px 24px;text-align:center;margin-top:1px;">
    <a href="${APP}" style="display:inline-block;background:linear-gradient(135deg,#CC2200,#E8650A);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 32px;border-radius:10px;margin-bottom:16px;letter-spacing:.2px;">
      Open TargetOS →
    </a>
    <div style="color:rgba(255,255,255,.3);font-size:11px;line-height:1.8;">
      Target Team · Keller Williams Valley Realty · 845.424.1014<br/>
      <a href="${APP}" style="color:rgba(255,255,255,.2);font-size:10px;text-decoration:none;">Manage preferences</a>
    </div>
  </div>

</div>
</body>
</html>`
}
