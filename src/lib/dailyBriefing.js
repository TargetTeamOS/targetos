// ═══════════════════════════════════════════════════════════════
// DAILY BRIEFING EMAIL — Full redesign
// Deep links to exact records, clean table-based layout
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
  { q:"Success is not final, failure is not fatal — it is the courage to continue.", a:"Winston Churchill" },
  { q:"Push yourself, because no one else is going to do it for you.", a:"Unknown" },
  { q:"Wake up with determination. Go to bed with satisfaction.", a:"Unknown" },
  { q:"Do something today that your future self will thank you for.", a:"Unknown" },
  { q:"Sometimes later becomes never. Do it now.", a:"Unknown" },
  { q:"A real estate agent's most powerful asset is their follow-up.", a:"Target Team" },
  { q:"Discipline is choosing between what you want now and what you want most.", a:"Unknown" },
]

function getQuote() {
  const i = (new Date().getDay() * 3 + new Date().getDate()) % QUOTES.length
  return QUOTES[i]
}

function getDayStr() {
  return new Date().toLocaleDateString('en-US', {
    weekday:'long', month:'long', day:'numeric', year:'numeric',
    timeZone:'America/New_York'
  })
}

function priorityStyle(p) {
  const s = {
    urgent: { bg:'#FEF2F2', border:'#FCA5A5', text:'#DC2626', dot:'#DC2626', label:'URGENT' },
    high:   { bg:'#FFFBEB', border:'#FDE68A', text:'#D97706', dot:'#D97706', label:'HIGH'   },
    normal: { bg:'#EFF6FF', border:'#BFDBFE', text:'#2563EB', dot:'#2563EB', label:'NORMAL' },
    low:    { bg:'#F8FAFC', border:'#E2E8F0', text:'#94A3B8', dot:'#CBD5E1', label:'LOW'    },
  }
  return s[p||'normal'] || s.normal
}

// ── MAIN BUILD FUNCTION ───────────────────────────────────────
export function buildDailyEmail({
  agentName, tasks=[], overdueTasks=[], appointments=[],
  agentColor='#CC2200', showQuote=true,
  // Customization options
  headerStyle='gradient',    // 'gradient' | 'solid' | 'minimal'
  accentColor,               // override agent color
  greeting,                  // custom greeting text
  footerNote,                // custom footer note
  showProgress=false,        // show units/production/gci progress
  agentProgress=null,        // { units, unitGoal, prod, prodGoal, gci, gciGoal }
}) {
  const color = accentColor || agentColor
  const quote = getQuote()
  const day = getDayStr()
  const firstName = agentName.split(' ')[0]
  const hour = new Date().toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:'America/New_York'})
  const timeGreeting = Number(hour) < 12 ? 'Good morning' : Number(hour) < 17 ? 'Good afternoon' : 'Good evening'
  const customGreeting = greeting || `${timeGreeting}, ${firstName}!`
  const ini = (agentName[0]||'?') + (agentName.split(' ')[1]?.[0]||'')
  const fmt$ = n => '$' + Number(n||0).toLocaleString()
  const pct = (a,g) => Math.min(Math.round((a||0)/(g||1)*100),100)

  // ── TASK ROW — deep links to exact task ──────────────────────
  function taskRow(t, isOverdue=false) {
    const ps = priorityStyle(isOverdue ? 'urgent' : t.priority)
    const daysOverdue = isOverdue && t.due_date ? Math.floor((Date.now()-new Date(t.due_date))/86400000) : 0
    // Deep link: open tasks page with this task highlighted
    const link = `${APP}/?page=tasks&task=${t.id||''}`
    return `
    <tr>
      <td style="padding:0;border-bottom:1px solid ${isOverdue?'#FEE2E2':'#F1F5F9'};">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${isOverdue?'#FFF5F5':'#ffffff'};">
          <tr>
            <td width="5" style="background:${ps.dot};border-radius:0;font-size:0;">&nbsp;</td>
            <td style="padding:14px 16px 14px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:14px;font-weight:700;color:${isOverdue?'#DC2626':'#1E293B'};line-height:1.4;margin-bottom:4px;">${isOverdue?'⚠️ ':''}${t.title}</div>
                    <div style="font-size:11px;color:${ps.text};font-weight:600;">
                      ${isOverdue
                        ? `${daysOverdue} day${daysOverdue>1?'s':''} overdue · Was due ${new Date(t.due_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`
                        : `${(t.priority||'normal').toUpperCase()}${t.due_date?' · Due today':''}`
                      }
                    </div>
                  </td>
                  <td width="90" align="right" valign="middle" style="padding-left:10px;">
                    <a href="${link}"
                      style="display:inline-block;background:${isOverdue?'#DC2626':color};color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;padding:7px 14px;border-radius:7px;white-space:nowrap;">
                      ${isOverdue?'Fix Now':'Open Task'}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
  }

  // ── APPOINTMENT ROW — deep links to calendar ─────────────────
  function apptRow(a) {
    const link = `${APP}/?page=calendar`
    return `
    <tr>
      <td style="padding:0;border-bottom:1px solid #DBEAFE;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7FF;">
          <tr>
            <td width="5" style="background:#2563EB;font-size:0;">&nbsp;</td>
            <td style="padding:14px 16px 14px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:14px;font-weight:700;color:#1E40AF;line-height:1.4;margin-bottom:4px;">📅 ${a.title}</div>
                    <div style="font-size:11px;color:#3B82F6;font-weight:600;">
                      ${a.time||''}${a.location?' · '+a.location:''}
                    </div>
                  </td>
                  <td width="90" align="right" valign="middle" style="padding-left:10px;">
                    <a href="${link}"
                      style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;padding:7px 14px;border-radius:7px;white-space:nowrap;">
                      View
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
  }

  // ── SECTION HEADER ────────────────────────────────────────────
  function sectionHeader(label, count, linkPage, bgColor, textColor) {
    return `
    <tr>
      <td style="background:${bgColor};padding:11px 20px;border-left:4px solid ${textColor};">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td><span style="font-size:11px;font-weight:800;color:${textColor};text-transform:uppercase;letter-spacing:.8px;">${label}${count!==undefined?' ('+count+')':''}</span></td>
            ${linkPage?`<td align="right"><a href="${APP}/?page=${linkPage}" style="font-size:11px;color:${textColor};text-decoration:none;font-weight:700;">View all →</a></td>`:'<td></td>'}
          </tr>
        </table>
      </td>
    </tr>`
  }

  // ── PROGRESS BARS ─────────────────────────────────────────────
  function progressSection(p) {
    if(!p) return ''
    const metrics = [
      { label:'Units', actual:p.units, goal:p.unitGoal, fmt:v=>v, color:'#0EA5E9' },
      { label:'Production', actual:p.prod, goal:p.prodGoal, fmt:fmt$, color:'#7C3AED' },
      { label:'GCI', actual:p.gci, goal:p.gciGoal, fmt:fmt$, color:color },
    ]
    const cols = metrics.map(m => {
      const pc = pct(m.actual, m.goal)
      const barW = Math.round(pc * 1.4) // max ~140px out of 160px
      return `
      <td style="padding:0 6px;vertical-align:top;width:33%;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0;">
          <tr><td style="padding:14px 12px 10px;">
            <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">${m.label}</div>
            <div style="font-size:18px;font-weight:900;color:#1E293B;margin-bottom:2px;">${m.fmt(m.actual)}</div>
            <div style="font-size:10px;color:#94A3B8;margin-bottom:8px;">of ${m.fmt(m.goal)}</div>
            <div style="background:#E2E8F0;border-radius:99px;height:5px;overflow:hidden;">
              <div style="background:${m.color};border-radius:99px;height:5px;width:${barW}px;max-width:100%;"></div>
            </div>
            <div style="font-size:11px;font-weight:800;color:${m.color};margin-top:5px;">${pc}%</div>
          </td></tr>
        </table>
      </td>`
    }).join('')
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:2px;background:#ffffff;border:1px solid #E2E8F0;border-top:none;">
      <tr>
        <td style="padding:14px 14px 16px;">
          <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">📈 Your Progress — 2026</div>
          <table width="100%" cellpadding="0" cellspacing="0"><tr>${cols}</tr></table>
        </td>
      </tr>
    </table>`
  }

  const hasOverdue = overdueTasks.length > 0
  const hasAppts   = appointments.length > 0
  const hasTasks   = tasks.length > 0

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Daily Briefing — ${day}</title>
</head>
<body style="margin:0;padding:0;background:#EEF2F7;-webkit-text-size-adjust:100%;mso-line-height-rule:exactly;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:24px 0 40px;">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- ═══ HEADER ═══ -->
        <tr>
          <td style="background:linear-gradient(135deg,#1B2B4B 0%,#0D1A30 100%);border-radius:16px 16px 0 0;padding:28px 28px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50" valign="middle">
                  <div style="width:50px;height:50px;border-radius:12px;background:${color};text-align:center;line-height:50px;font-size:18px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">${ini}</div>
                </td>
                <td style="padding-left:14px;" valign="middle">
                  <div style="color:#ffffff;font-size:20px;font-weight:800;line-height:1.2;font-family:Arial,sans-serif;">${customGreeting} 👋</div>
                  <div style="color:rgba(255,255,255,0.45);font-size:12px;margin-top:4px;font-family:Arial,sans-serif;">${day}</div>
                </td>
                <td width="110" align="right" valign="middle">
                  <a href="${APP}" style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#ffffff;text-decoration:none;font-size:11px;font-weight:700;padding:8px 14px;border-radius:8px;font-family:Arial,sans-serif;">Open App →</a>
                </td>
              </tr>
            </table>
            <!-- Summary line -->
            <div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.65);font-size:13px;line-height:1.7;font-family:Arial,sans-serif;">
              ${hasTasks ? `You have <strong style="color:#ffffff;">${tasks.length} task${tasks.length>1?'s':''}</strong> due today.` : `No tasks scheduled for today.`}
              ${hasAppts ? ` <strong style="color:#93C5FD;">${appointments.length} appointment${appointments.length>1?'s':''}</strong> on your calendar.` : ''}
              ${hasOverdue ? ` <strong style="color:#FCA5A5;">${overdueTasks.length} overdue item${overdueTasks.length>1?'s':''} need your attention.</strong>` : ` All caught up — no overdue items! ✅`}
            </div>
          </td>
        </tr>

        <!-- ═══ OVERDUE ═══ -->
        ${hasOverdue ? `
        <tr><td style="padding-top:3px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FEE2E2;border-top:none;border-radius:0;">
            <tr>${sectionHeader('⚠️ Overdue — Needs Attention', overdueTasks.length, 'tasks', '#FFF5F5', '#DC2626')}</tr>
            ${overdueTasks.map(t=>taskRow(t,true)).join('')}
          </table>
        </td></tr>` : ''}

        <!-- ═══ APPOINTMENTS ═══ -->
        ${hasAppts ? `
        <tr><td style="padding-top:3px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DBEAFE;border-top:none;">
            <tr>${sectionHeader("📅 Today's Appointments", appointments.length, 'calendar', '#F0F7FF', '#2563EB')}</tr>
            ${appointments.map(a=>apptRow(a)).join('')}
          </table>
        </td></tr>` : ''}

        <!-- ═══ TODAY'S TASKS ═══ -->
        <tr><td style="padding-top:3px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;">
            <tr>${sectionHeader("✓ Today's Tasks", tasks.length, 'tasks', '#F8FAFC', color)}</tr>
            ${hasTasks
              ? tasks.map(t=>taskRow(t,false)).join('')
              : `<tr><td style="padding:24px;text-align:center;background:#ffffff;">
                  <div style="font-size:28px;margin-bottom:8px;">🎯</div>
                  <div style="font-size:14px;font-weight:700;color:#16A34A;margin-bottom:4px;">All clear for today!</div>
                  <div style="font-size:12px;color:#94A3B8;">No tasks scheduled — great day to prospect and follow up.</div>
                  <div style="margin-top:12px;"><a href="${APP}/?page=contacts" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:9px 20px;border-radius:8px;font-family:Arial,sans-serif;">Open Contacts →</a></div>
                </td></tr>`
            }
          </table>
        </td></tr>

        <!-- ═══ PROGRESS (optional) ═══ -->
        ${showProgress && agentProgress ? progressSection(agentProgress) : ''}

        <!-- ═══ QUOTE ═══ -->
        ${showQuote ? `
        <tr><td style="padding-top:3px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;">
            <tr>
              <td style="padding:22px 24px;">
                <div style="font-size:10px;font-weight:700;color:#CBD5E1;text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-family:Arial,sans-serif;">💬 Daily Inspiration</div>
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="4" style="background:${color};border-radius:2px;font-size:0;">&nbsp;</td>
                    <td style="padding-left:16px;">
                      <div style="font-size:16px;font-style:italic;color:#334155;line-height:1.7;font-family:Georgia,serif;font-weight:400;">"${quote.q}"</div>
                      <div style="font-size:12px;color:#94A3B8;margin-top:8px;font-family:Arial,sans-serif;">— ${quote.a}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>` : ''}

        <!-- ═══ FOOTER CTA ═══ -->
        <tr><td style="padding-top:3px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1B2B4B,#0D1A30);border-radius:0 0 16px 16px;">
            <tr>
              <td style="padding:24px 28px;text-align:center;">
                <a href="${APP}" style="display:inline-block;background:linear-gradient(135deg,#CC2200,#E8650A);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 36px;border-radius:10px;margin-bottom:18px;font-family:Arial,sans-serif;letter-spacing:.2px;">
                  Open TargetOS →
                </a>
                <div style="display:block;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:0 8px;">
                        <a href="${APP}/?page=contacts" style="display:inline-block;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;font-family:Arial,sans-serif;">Contacts</a>
                      </td>
                      <td align="center" style="padding:0 8px;">
                        <a href="${APP}/?page=listings" style="display:inline-block;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;font-family:Arial,sans-serif;">Listings</a>
                      </td>
                      <td align="center" style="padding:0 8px;">
                        <a href="${APP}/?page=production" style="display:inline-block;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;font-family:Arial,sans-serif;">Pipeline</a>
                      </td>
                      <td align="center" style="padding:0 8px;">
                        <a href="${APP}/?page=tasks" style="display:inline-block;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);text-decoration:none;font-size:11px;font-weight:600;padding:8px 14px;border-radius:7px;font-family:Arial,sans-serif;">Tasks</a>
                      </td>
                    </tr>
                  </table>
                </div>
                ${footerNote ? `<div style="margin-top:14px;color:rgba(255,255,255,0.4);font-size:11px;font-family:Arial,sans-serif;">${footerNote}</div>` : ''}
                <div style="margin-top:16px;color:rgba(255,255,255,0.25);font-size:11px;font-family:Arial,sans-serif;line-height:1.8;">
                  Target Team · Keller Williams Valley Realty · 845.424.1014
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`
}
