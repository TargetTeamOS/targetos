// ═══════════════════════════════════════════════════════════════
// SUPABASE EDGE FUNCTION: daily-briefing
// Runs every morning at 7AM ET via pg_cron
// Sends personalized daily briefing to each agent
// Deploy: supabase functions deploy daily-briefing
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const APP_URL = 'https://app.targetreteam.com'

const AGENT_EMAILS: Record<string, string> = {
  'Lazer Farkas':      'lazer@targetreteam.com',
  'Mendy Jankovits':   'mendy@targetreteam.com',
  'Isaac Leibowitz':   'isaac6829490@gmail.com',
  'Yanky Lichtenstein':'yanky@targetreteam.com',
  'Gitty Fogel':       'office@targetreteam.com',
  'Joel Rottenstein':  'joel@targetreteam.com',
  'Eli Hoffman':       'eli@targetreteam.com',
  'Avraham Weinberger':'avraham@targetreteam.com',
}

const AGENT_COLORS: Record<string, string> = {
  'Lazer Farkas':'#CC2200','Mendy Jankovits':'#0EA5E9','Isaac Leibowitz':'#F5A623',
  'Yanky Lichtenstein':'#10B981','Gitty Fogel':'#7C3AED','Joel Rottenstein':'#E8650A',
  'Eli Hoffman':'#14B8A6','Avraham Weinberger':'#8B5CF6',
}

const QUOTES = [
  { q:"Your next deal is one conversation away.", a:"Target Team" },
  { q:"Every call you make is a door you open.", a:"Target Team" },
  { q:"Consistency builds empires. Show up every day.", a:"Target Team" },
  { q:"In real estate, relationships are your inventory.", a:"Target Team" },
  { q:"Be so good they can't ignore you.", a:"Steve Martin" },
  { q:"The secret of getting ahead is getting started.", a:"Mark Twain" },
  { q:"Push yourself, because no one else is going to do it for you.", a:"Unknown" },
  { q:"Wake up with determination. Go to bed with satisfaction.", a:"Unknown" },
  { q:"Do something today that your future self will thank you for.", a:"Unknown" },
  { q:"Sometimes later becomes never. Do it now.", a:"Unknown" },
  { q:"A real estate agent's most powerful asset is their follow-up.", a:"Target Team" },
  { q:"Discipline is choosing between what you want now and what you want most.", a:"Unknown" },
]

function getQuote() {
  const d = new Date()
  return QUOTES[(d.getDay() * 3 + d.getDate()) % QUOTES.length]
}

function fmtDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday:'long', month:'long', day:'numeric', year:'numeric',
    timeZone:'America/New_York'
  })
}

function buildEmail(agentName: string, tasks: any[], overdue: any[], appointments: any[], color: string) {
  const firstName = agentName.split(' ')[0]
  const ini = agentName[0] + (agentName.split(' ')[1]?.[0] || '')
  const quote = getQuote()
  const day = fmtDate()

  const taskRows = tasks.length > 0 ? tasks.map(t => `
    <tr><td style="padding:0;border-bottom:1px solid #F1F5F9;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="5" style="background:${t.priority==='urgent'?'#DC2626':t.priority==='high'?'#D97706':'#0EA5E9'};font-size:0;">&nbsp;</td>
          <td style="padding:13px 16px;">
            <div style="font-size:14px;font-weight:700;color:#1E293B;">${t.title}</div>
            <div style="font-size:11px;color:#94A3B8;margin-top:3px;">${(t.priority||'normal').toUpperCase()} priority</div>
          </td>
          <td width="110" align="right" style="padding-right:14px;">
            <a href="${APP_URL}/?page=tasks&task=${t.id}" style="background:${color};color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:7px 14px;border-radius:7px;display:inline-block;">Open Task</a>
          </td>
        </tr>
      </table>
    </td></tr>`).join('')
  : `<tr><td style="padding:24px;text-align:center;background:#fff;">
      <div style="font-size:28px;margin-bottom:8px;">🎯</div>
      <div style="font-size:14px;font-weight:700;color:#16A34A;">No tasks today!</div>
      <div style="font-size:12px;color:#94A3B8;margin-top:4px;">Great day to prospect and follow up with leads.</div>
    </td></tr>`

  const overdueRows = overdue.map(t => {
    const days = t.due_date ? Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000) : 1
    return `<tr><td style="padding:0;border-bottom:1px solid #FEE2E2;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F5;">
        <tr>
          <td width="5" style="background:#DC2626;font-size:0;">&nbsp;</td>
          <td style="padding:13px 16px;">
            <div style="font-size:14px;font-weight:700;color:#DC2626;">⚠️ ${t.title}</div>
            <div style="font-size:11px;color:#EF4444;margin-top:3px;">${days} day${days>1?'s':''} overdue</div>
          </td>
          <td width="110" align="right" style="padding-right:14px;">
            <a href="${APP_URL}/?page=tasks&task=${t.id}" style="background:#DC2626;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:7px 14px;border-radius:7px;display:inline-block;">Fix Now</a>
          </td>
        </tr>
      </table>
    </td></tr>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:24px 12px 40px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#1B2B4B,#0D1A30);border-radius:16px 16px 0 0;padding:28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="50" valign="middle">
        <div style="width:50px;height:50px;border-radius:12px;background:${color};text-align:center;line-height:50px;font-size:18px;font-weight:900;color:#fff;">${ini}</div>
      </td>
      <td style="padding-left:14px;" valign="middle">
        <div style="color:#fff;font-size:20px;font-weight:800;">Good morning, ${firstName}! 👋</div>
        <div style="color:rgba(255,255,255,0.45);font-size:12px;margin-top:4px;">${day}</div>
      </td>
      <td width="100" align="right" valign="middle">
        <a href="${APP_URL}" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:8px 14px;border-radius:8px;display:inline-block;">Open App →</a>
      </td>
    </tr></table>
    <div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.65);font-size:13px;line-height:1.7;">
      ${tasks.length>0?`You have <strong style="color:#fff;">${tasks.length} task${tasks.length>1?'s':''}</strong> due today.`:'No tasks scheduled for today.'}
      ${overdue.length>0?`<strong style="color:#FCA5A5;"> ${overdue.length} overdue item${overdue.length>1?'s':''} need attention.</strong>`:''}
    </div>
  </td></tr>

  ${overdue.length > 0 ? `
  <!-- OVERDUE -->
  <tr><td style="padding-top:3px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;">
      <tr><td style="background:#FFF5F5;padding:11px 20px;border-left:4px solid #DC2626;">
        <span style="font-size:11px;font-weight:800;color:#DC2626;text-transform:uppercase;letter-spacing:.8px;">⚠️ Overdue — Needs Attention (${overdue.length})</span>
      </td></tr>
      ${overdueRows}
    </table>
  </td></tr>` : ''}

  <!-- TODAY'S TASKS -->
  <tr><td style="padding-top:3px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;">
      <tr><td style="background:#F8FAFC;padding:11px 20px;border-left:4px solid ${color};">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td><span style="font-size:11px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.8px;">✓ Today's Tasks (${tasks.length})</span></td>
          ${tasks.length>0?`<td align="right"><a href="${APP_URL}/?page=tasks" style="font-size:11px;color:${color};text-decoration:none;font-weight:700;">View all →</a></td>`:'<td></td>'}
        </tr></table>
      </td></tr>
      ${taskRows}
    </table>
  </td></tr>

  ${overdue.length===0?`
  <!-- ALL CAUGHT UP -->
  <tr><td style="padding-top:3px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-left:4px solid #16A34A;">
      <tr><td style="padding:14px 20px;"><span style="font-size:13px;font-weight:600;color:#16A34A;">✅ No overdue tasks — you're all caught up!</span></td></tr>
    </table>
  </td></tr>`:''}

  <!-- QUOTE -->
  <tr><td style="padding-top:3px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #E2E8F0;">
      <tr><td style="padding:22px 24px;">
        <div style="font-size:10px;font-weight:700;color:#CBD5E1;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;">💬 Daily Inspiration</div>
        <table cellpadding="0" cellspacing="0"><tr>
          <td width="4" style="background:${color};border-radius:2px;">&nbsp;</td>
          <td style="padding-left:16px;">
            <div style="font-size:16px;font-style:italic;color:#334155;line-height:1.7;font-family:Georgia,serif;">"${quote.q}"</div>
            <div style="font-size:12px;color:#94A3B8;margin-top:8px;">— ${quote.a}</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding-top:3px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1B2B4B,#0D1A30);border-radius:0 0 16px 16px;">
      <tr><td style="padding:24px;text-align:center;">
        <a href="${APP_URL}" style="background:linear-gradient(135deg,#CC2200,#E8650A);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;display:inline-block;margin-bottom:16px;">Open TargetOS →</a>
        <div>
          <a href="${APP_URL}/?page=contacts" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;display:inline-block;margin:3px;">Contacts</a>
          <a href="${APP_URL}/?page=listings" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;display:inline-block;margin:3px;">Listings</a>
          <a href="${APP_URL}/?page=production" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;display:inline-block;margin:3px;">Pipeline</a>
          <a href="${APP_URL}/?page=tasks" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;display:inline-block;margin:3px;">Tasks</a>
        </div>
        <div style="margin-top:14px;color:rgba(255,255,255,0.25);font-size:11px;">Target Team · KW Valley Realty · 845.424.1014</div>
      </td></tr>
    </table>
  </td></tr>

</table></td></tr></table>
</body></html>`
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'TargetOS <office@targetreteam.com>', to: [to], subject, html }),
  })
  return res.ok
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const today = new Date().toISOString().split('T')[0]
    let totalSent = 0, totalFailed = 0

    // Load all briefing prefs
    const { data: prefs } = await supabase.from('briefing_prefs').select('*')
    const prefMap: Record<string, any> = {}
    prefs?.forEach((p: any) => { prefMap[p.agent_name] = p })

    for (const [agentName, email] of Object.entries(AGENT_EMAILS)) {
      const pref = prefMap[agentName]
      // Skip if agent has turned off briefing
      if (pref && pref.enabled === false) continue

      const sections = pref?.sections || { todayTasks: true, overdueTasks: true, appointments: true, quote: true }

      // Load today's tasks assigned to this agent (match by agent_name in title for now)
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'pending')
        .order('due_date', { ascending: true })

      const todayTasks = sections.todayTasks
        ? (allTasks || []).filter((t: any) => t.due_date === today)
        : []
      const overdueTasks = sections.overdueTasks
        ? (allTasks || []).filter((t: any) => t.due_date && t.due_date < today)
        : []

      // Load today's calendar events for this agent
      const { data: events } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('start_date', today)
        .eq('agent_name', agentName)

      const color = AGENT_COLORS[agentName] || '#CC2200'
      const html = buildEmail(agentName, todayTasks, overdueTasks, events || [], color)
      const subject = `📋 Your Daily Briefing — ${fmtDate()}`

      const ok = await sendEmail(email, subject, html)
      if (ok) totalSent++; else totalFailed++

      // Rate limit
      await new Promise(r => setTimeout(r, 300))
    }

    // Log the send
    await supabase.from('activity_log').insert([{
      action: 'daily_briefing_sent',
      description: `Sent ${totalSent} briefing emails, ${totalFailed} failed`,
      created_at: new Date().toISOString(),
    }])

    return new Response(JSON.stringify({ success: true, sent: totalSent, failed: totalFailed }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
