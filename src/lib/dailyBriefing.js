// ═══════════════════════════════════════════════════════════════
// DAILY BRIEFING EMAIL SYSTEM
// Sends each agent a personalized daily email every morning at 7AM ET
// Contains: today's tasks, appointments, overdue tasks, progress, quote
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// Real agent emails from Monday.com
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

const MOTIVATIONAL_QUOTES = [
  { quote: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "Success is not final, failure is not fatal — it is the courage to continue that counts.", author: "Winston Churchill" },
  { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { quote: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
  { quote: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { quote: "Great things never come from comfort zones.", author: "Unknown" },
  { quote: "Dream it. Wish it. Do it.", author: "Unknown" },
  { quote: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
  { quote: "The key to success is to focus on goals, not obstacles.", author: "Unknown" },
  { quote: "Little things make big days.", author: "Unknown" },
  { quote: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
  { quote: "Don't stop until you're proud.", author: "Unknown" },
  { quote: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
  { quote: "Do something today that your future self will thank you for.", author: "Unknown" },
  { quote: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { quote: "Your limitation — it's only your imagination.", author: "Unknown" },
  { quote: "Sometimes later becomes never. Do it now.", author: "Unknown" },
  { quote: "Great minds discuss ideas; average minds discuss events; small minds discuss people.", author: "Eleanor Roosevelt" },
  { quote: "A real estate agent's most powerful asset is their follow-up.", author: "Target Team" },
  { quote: "Every call you make is a door you open.", author: "Target Team" },
  { quote: "Your next deal is one conversation away.", author: "Target Team" },
  { quote: "Consistency builds empires. Show up every day.", author: "Target Team" },
  { quote: "The best investment you can make is in yourself and your clients.", author: "Target Team" },
  { quote: "In real estate, relationships are your inventory.", author: "Target Team" },
  { quote: "Be so good they can't ignore you.", author: "Steve Martin" },
  { quote: "Discipline is choosing between what you want now and what you want most.", author: "Unknown" },
]

function getTodayQuote() {
  const day = new Date().getDay() + new Date().getDate()
  return MOTIVATIONAL_QUOTES[day % MOTIVATIONAL_QUOTES.length]
}

function getGreeting() {
  const h = new Date().getHours()
  if(h < 12) return 'Good morning'
  if(h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getDayName() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'America/New_York' })
}

// GCI data per agent (from production board)
const AGENT_GCI = {
  'Lazer Farkas':       { gci: 77440,  goal: 200000 },
  'Mendy Jankovits':    { gci: 34000,  goal: 150000 },
  'Isaac Leibowitz':    { gci: 46090,  goal: 180000 },
  'Yanky Lichtenstein': { gci: 0,      goal: 100000 },
  'Gitty Fogel':        { gci: 0,      goal: 80000  },
  'Joel Rottenstein':   { gci: 39750,  goal: 120000 },
  'Eli Hoffman':        { gci: 146735, goal: 90000  },
  'Avraham Weinberger': { gci: 24000,  goal: 160000 },
}

// ── BUILD HTML EMAIL ──────────────────────────────────────────
export function buildDailyEmail({ agentName, tasks, overdueTasks, appointments, agentColor = '#CC2200' }) {
  const quote = getTodayQuote()
  const greeting = getGreeting()
  const dayName = getDayName()
  const gciData = AGENT_GCI[agentName] || { gci: 0, goal: 100000 }
  const gciPct = Math.min(Math.round(gciData.gci / gciData.goal * 100), 100)
  const remaining = gciData.goal - gciData.gci
  const firstName = agentName.split(' ')[0]
  const fmt$ = n => '$' + Number(n).toLocaleString()

  const taskRows = tasks.length > 0
    ? tasks.map(t => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #F0F4F8;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:18px;height:18px;border-radius:4px;border:2px solid #CBD5E1;flex-shrink:0;"></div>
            <div>
              <div style="font-size:13px;font-weight:600;color:#1E293B;">${t.title}</div>
              <div style="font-size:11px;color:#94A3B8;margin-top:2px;">${t.due_date ? 'Due today' : 'No due date'} · ${t.priority || 'normal'} priority</div>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : `<tr><td style="padding:20px 14px;text-align:center;color:#94A3B8;font-size:13px;">✅ No tasks scheduled for today — great day to prospect!</td></tr>`

  const overdueRows = overdueTasks.length > 0
    ? overdueTasks.map(t => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #FEE2E2;background:#FFF5F5;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:16px;">⚠️</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:#DC2626;">${t.title}</div>
              <div style="font-size:11px;color:#EF4444;margin-top:2px;">Was due ${new Date(t.due_date).toLocaleDateString('en-US', {month:'short',day:'numeric'})} — ${Math.floor((Date.now()-new Date(t.due_date))/86400000)} day(s) overdue</div>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : ''

  const apptRows = appointments.length > 0
    ? appointments.map(a => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #EFF6FF;background:#F8FBFF;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:16px;">📅</span>
            <div>
              <div style="font-size:13px;font-weight:600;color:#1E40AF;">${a.title}</div>
              <div style="font-size:11px;color:#60A5FA;margin-top:2px;">${a.time || ''}${a.location ? ' · ' + a.location : ''}</div>
            </div>
          </div>
        </td>
      </tr>`).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>TargetOS Daily Briefing — ${dayName}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">

<div style="max-width:600px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1B2B4B 0%,#0F1A2E 100%);border-radius:18px 18px 0 0;padding:28px 28px 24px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;background:rgba(204,34,0,.15);"></div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <div style="width:40px;height:40px;border-radius:10px;background:${agentColor};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;">${firstName[0]}</div>
      <div>
        <div style="color:#fff;font-size:18px;font-weight:800;">${greeting}, ${firstName}! 👋</div>
        <div style="color:rgba(255,255,255,.5);font-size:12px;margin-top:2px;">${dayName}</div>
      </div>
    </div>
    <div style="color:rgba(255,255,255,.7);font-size:13px;line-height:1.6;">
      Here's your personalized daily briefing from <strong style="color:#F5A623;">TargetOS</strong>. 
      ${tasks.length > 0 ? `You have <strong style="color:#fff;">${tasks.length} task${tasks.length>1?'s':''}</strong> scheduled for today.` : "You're all clear on tasks today — focus on prospecting!"}
      ${overdueTasks.length > 0 ? ` <strong style="color:#FC8181;">${overdueTasks.length} overdue item${overdueTasks.length>1?'s':''} need${overdueTasks.length===1?'s':''} attention.</strong>` : ''}
    </div>
  </div>

  <!-- GCI Progress Bar -->
  <div style="background:#fff;padding:20px 24px;border-left:4px solid ${agentColor};border-right:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div>
        <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;">Your GCI Progress — 2026</div>
        <div style="font-size:22px;font-weight:900;color:#1E293B;">${fmt$(gciData.gci)} <span style="font-size:13px;color:#94A3B8;font-weight:400;">of ${fmt$(gciData.goal)}</span></div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px;font-weight:900;color:${agentColor};">${gciPct}%</div>
        <div style="font-size:11px;color:#94A3B8;">${remaining > 0 ? fmt$(remaining) + ' to go' : '🎉 Goal reached!'}</div>
      </div>
    </div>
    <div style="background:#F1F5F9;border-radius:99px;height:8px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,${agentColor},#E8650A);border-radius:99px;height:8px;width:${gciPct}%;"></div>
    </div>
    <div style="font-size:11px;color:#94A3B8;margin-top:6px;">
      ${gciPct >= 100 ? '🏆 You\'ve hit your annual goal — keep going!' : gciPct >= 75 ? '🔥 Almost there — strong push to close it out!' : gciPct >= 50 ? '💪 Halfway there — stay consistent!' : gciPct >= 25 ? '📈 Good start — pick up the pace!' : '🚀 Early in the year — time to build momentum!'}
    </div>
  </div>

  ${appointments.length > 0 ? `
  <!-- Appointments -->
  <div style="background:#fff;border-left:4px solid #2563EB;border-right:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;margin-top:1px;">
    <div style="padding:14px 24px 6px;font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:.8px;">📅 Today's Appointments</div>
    <table style="width:100%;border-collapse:collapse;">${apptRows}</table>
  </div>` : ''}

  <!-- Today's Tasks -->
  <div style="background:#fff;border-left:4px solid ${agentColor};border-right:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;margin-top:1px;">
    <div style="padding:14px 24px 6px;font-size:11px;font-weight:700;color:${agentColor};text-transform:uppercase;letter-spacing:.8px;">✓ Today's Tasks (${tasks.length})</div>
    <table style="width:100%;border-collapse:collapse;">${taskRows}</table>
  </div>

  ${overdueTasks.length > 0 ? `
  <!-- Overdue Tasks -->
  <div style="background:#FFF5F5;border-left:4px solid #DC2626;border-right:1px solid #FEE2E2;border-bottom:1px solid #FEE2E2;margin-top:1px;">
    <div style="padding:14px 24px 6px;font-size:11px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:.8px;">⚠️ Overdue — Needs Attention (${overdueTasks.length})</div>
    <table style="width:100%;border-collapse:collapse;">${overdueRows}</table>
  </div>` : `
  <!-- All caught up -->
  <div style="background:#F0FDF4;border-left:4px solid #16A34A;border-right:1px solid #BBF7D0;border-bottom:1px solid #BBF7D0;margin-top:1px;padding:14px 24px;">
    <div style="font-size:13px;color:#16A34A;font-weight:600;">✅ No overdue tasks — you're all caught up!</div>
  </div>`}

  <!-- Motivational Quote -->
  <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:20px 24px;">
    <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">💬 Daily Inspiration</div>
    <div style="border-left:3px solid ${agentColor};padding-left:14px;">
      <div style="font-size:15px;font-style:italic;color:#334155;line-height:1.7;font-weight:500;">"${quote.quote}"</div>
      <div style="font-size:12px;color:#94A3B8;margin-top:6px;">— ${quote.author}</div>
    </div>
  </div>

  <!-- CTA Footer -->
  <div style="background:linear-gradient(135deg,#1B2B4B,#0F1A2E);border-radius:0 0 18px 18px;padding:20px 24px;text-align:center;">
    <a href="https://app.targetreteam.com" style="display:inline-block;background:linear-gradient(135deg,#CC2200,#E8650A);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;margin-bottom:14px;">
      Open TargetOS →
    </a>
    <div style="color:rgba(255,255,255,.4);font-size:11px;">
      Target Team · Keller Williams Valley Realty · 845.424.1014<br/>
      <a href="https://app.targetreteam.com" style="color:rgba(255,255,255,.3);font-size:10px;">Manage email preferences</a>
    </div>
  </div>

</div>
</body>
</html>`
}

// ── FETCH AGENT DATA AND SEND ─────────────────────────────────
export async function fetchAgentDailyData(agentName, userId) {
  const today = new Date().toISOString().split('T')[0]
  const [tasksRes, overdueRes] = await Promise.all([
    supabase.from('tasks').select('*')
      .eq('status', 'pending')
      .eq('assigned_to', userId)
      .eq('due_date', today),
    supabase.from('tasks').select('*')
      .eq('status', 'pending')
      .eq('assigned_to', userId)
      .lt('due_date', today)
      .not('due_date', 'is', null),
  ])
  return {
    tasks: tasksRes.data || [],
    overdueTasks: overdueRes.data || [],
    appointments: [], // would come from Google Calendar when integrated
  }
}
