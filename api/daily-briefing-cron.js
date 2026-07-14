// TargetOS V2 — Daily Briefing: automated cron send
// This is the piece that was missing entirely: DailyBriefing.jsx has a
// fully-built "Send All" button, but nothing was ever triggering it
// automatically. This endpoint runs once daily via Vercel Cron (see
// vercel.json) and sends every enabled agent their briefing without
// anyone having to click anything.
//
// Known limitation, disclosed honestly: each agent has their own
// send_time preference, but this cron runs once a day at a single
// fixed time (7am ET) and sends to everyone with enabled !== false at
// that time, regardless of their individual preference. Precisely
// honoring per-agent send times would need a much-more-frequent cron
// (e.g. every 15 min) checking whose preferred time just arrived --
// possible to add later if this matters, not done here to keep this
// safely within a normal Vercel cron invocation budget.
'use strict'
const { getSupabase } = require('./_lib/phone')
const { getTodaysQuote, buildEmailHTML, isDueToday, isOverdue, getDaysUntil, DEFAULT_PREFS, DEFAULT_STYLE } = require('./_lib/briefing')
const { notifyAgent } = require('./_lib/notify')

async function gatherAgentData(supabase, agentId) {
  const today   = new Date().toISOString().slice(0, 10)
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
  const wkStr   = weekEnd.toISOString().slice(0, 10)

  const [tasks, deals, contacts, listings, openHouses, todayEvents] = await Promise.all([
    supabase.from('tasks').select('*').neq('status','done').eq('agent_id', agentId).then(r => r.data || []),
    supabase.from('deals').select('*').eq('agent_id', agentId).then(r => r.data || []),
    supabase.from('contacts').select('id,first_name,last_name,status,phone').eq('agent_id', agentId).then(r => r.data || []),
    supabase.from('listings').select('*').eq('status','Active').eq('agent_id', agentId).then(r => r.data || []),
    supabase.from('open_houses').select('*').gte('date',today).lte('date',wkStr).eq('agent_id', agentId).then(r => r.data || []),
    supabase.from('calendar_events').select('*').eq('date',today).eq('agent_id', agentId).order('start_time').then(r => r.data || []),
  ])

  const todayTasks    = tasks.filter(t => isDueToday(t.due_date) || isOverdue(t.due_date))
  const overdueTasks  = tasks.filter(t => isOverdue(t.due_date))
  const activeDeals   = deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
  const upcomingClose = deals.filter(d => {
    const dt = d.expected_close_date || d.close_date
    if (!dt) return false
    const dy = getDaysUntil(dt)
    return dy !== null && dy >= 0 && dy <= 30 && d.stage !== 'Closed'
  }).sort((a,b) => getDaysUntil(a.expected_close_date||a.close_date) - getDaysUntil(b.expected_close_date||b.close_date))
  const hotLeads   = contacts.filter(c => ['Hot','Warm'].includes(c.status))
  const closedGCI  = deals.filter(d => d.stage==='Closed' && (d.ao_date||'').startsWith(String(new Date().getFullYear()))).reduce((s,d) => s+(parseFloat(d.gci)||0), 0)

  return { todayTasks, overdueTasks, activeDeals, upcomingClose, hotLeads, listings, openHouses, todayEvents, closedGCI }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  // HARDENED (July 2026): the secret is now ENFORCED. Previously a
  // mismatch only logged a warning and the send proceeded anyway,
  // meaning anything that hit this URL triggered a full team send.
  const CRON_SECRET = process.env.CRON_SECRET
  if (CRON_SECRET && req.headers['authorization'] !== 'Bearer ' + CRON_SECRET) {
    console.warn('[daily-briefing-cron] BLOCKED unauthorized invocation')
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const supabase = getSupabase()
  if (!supabase) return res.status(200).json({ ok: false, error: 'no supabase client' })

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'RESEND_API_KEY not set' })

  // Current time in the team's timezone, floored to the half hour, so
  // each agent gets their briefing in the 30-minute slot matching
  // their own send_time preference (cron now runs every 30 minutes —
  // see vercel.json).
  const nowET = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
  const slot  = nowET.slice(0, 3) + (Number(nowET.slice(3, 5)) < 30 ? '00' : '30')
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  let sent = 0, skipped = 0, failed = 0
  const errors = []

  try {
    const { data: agents } = await supabase.from('agents').select('id, name, email').eq('active', true)

    for (const agentRow of (agents || [])) {
      try {
        const { data: prefRow } = await supabase.from('briefing_prefs').select('*').eq('agent_id', agentRow.id).maybeSingle()

        // HARDENED (July 2026): EXPLICIT OPT-IN ONLY. The old default
        // ("send unless a row says enabled=false") emailed every agent
        // who had never opened briefing settings — including everyone
        // whose opt-out lived in the old browser-only prefs the server
        // can't see. Now a briefing goes out only when the agent has a
        // saved row with enabled=true.
        const enabled = !!(prefRow && prefRow.enabled === true)
        if (!enabled || !agentRow.email) { skipped++; continue }

        // Send only in the agent's chosen 30-minute slot (default 07:00)
        const wantRaw  = (prefRow.send_time || '07:00').slice(0, 5)
        const wantSlot = wantRaw.slice(0, 3) + (Number(wantRaw.slice(3, 5)) < 30 ? '00' : '30')
        if (wantSlot !== slot) { skipped++; continue }

        // Once-per-day guard: unique(agent_id, sent_date) in
        // briefing_sends makes double sends impossible even if the
        // cron fires twice or overlaps a manual Send All.
        const { error: dupErr } = await supabase.from('briefing_sends')
          .insert({ agent_id: agentRow.id, sent_date: todayStr, source: 'cron' })
        if (dupErr) { skipped++; continue }  // unique violation = already sent today

        const prefs = { ...DEFAULT_PREFS, ...(prefRow?.sections || {}), emailEnabled: enabled }
        const emailStyle = prefRow?.email_style ? { ...DEFAULT_STYLE, ...prefRow.email_style } : DEFAULT_STYLE
        const customMsg = prefRow?.custom_message || ''

        const { data: quoteRows } = await supabase.from('briefing_quotes').select('text, author')
        const quote = getTodaysQuote(quoteRows || [])

        const data = await gatherAgentData(supabase, agentRow.id)
        const html = buildEmailHTML(agentRow.name, data, prefs, quote, customMsg, emailStyle)

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'TargetOS Daily Briefing <office@targetreteam.com>',
            to: [agentRow.email],
            subject: '☀️ Your Daily Briefing — ' + new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' }),
            html,
          }),
        })
        if (!emailRes.ok) throw new Error('Resend API error: ' + emailRes.status)
        sent++
        notifyAgent(supabase, agentRow.id, 'dailyBriefing', {
          title: 'Daily briefing ready',
          body: 'Your briefing for today has been sent to your email',
          link: '/daily-briefing', type: 'briefing',
        })
      } catch(e) {
        failed++
        errors.push(agentRow.name + ': ' + e.message)
        console.error('[daily-briefing-cron] failed for', agentRow.name, e.message)
      }
    }
  } catch(e) {
    console.error('[daily-briefing-cron] fatal:', e.message)
    return res.status(200).json({ ok: false, error: e.message })
  }

  console.info('[daily-briefing-cron] sent:', sent, 'skipped:', skipped, 'failed:', failed)
  return res.status(200).json({ ok: true, sent, skipped, failed, errors })
}
