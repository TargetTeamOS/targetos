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

  // ── CLOSING-SOON AUTOMATIONS, evaluated DAILY (July 2026) ────────
  // The client-side engine only fires closing_soon when a deal gets
  // edited inside the window; this cron closes that gap — every deal
  // approaching its close date fires exactly once per automation,
  // deduped via automation_fires. Supports the two actions the
  // commission-bill rule uses: create_task + send_email (to_role/cc).
  let closingFired = 0
  try {
    const { data: autos } = await supabase.from('automations')
      .select('*').eq('active', true).eq('trigger_type', 'closing_soon')
    if (autos?.length) {
      const { data: agents } = await supabase.from('agents').select('id,name,email,role')
      const today = new Date()
      for (const auto of autos) {
        const days = parseInt(auto.trigger_config?.days) || 7
        const winEnd = new Date(today); winEnd.setDate(winEnd.getDate() + days)
        const { data: deals } = await supabase.from('deals')
          .select('*')
          .not('stage', 'in', '("Closed","Deal Fell Through")')
          .gte('close_date', today.toISOString().slice(0, 10))
          .lte('close_date', winEnd.toISOString().slice(0, 10))
        for (const deal of (deals || [])) {
          const { data: already } = await supabase.from('automation_fires')
            .select('id').eq('automation_id', auto.id).eq('record_id', deal.id).limit(1)
          if (already?.length) continue
          const agentRow = agents?.find(a => a.id === deal.agent_id)
          const ctx = {
            addr: deal.addr || '', client_name: deal.client_name || '',
            agent_name: agentRow?.name || '', close_date: deal.close_date || '',
            production: deal.production != null ? Number(deal.production).toLocaleString() : '',
            gci: deal.gci != null ? Number(deal.gci).toLocaleString() : '',
          }
          const fill = t => String(t || '').replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '')
          for (const action of (auto.action_nodes || [])) {
            const cfg = action.config || {}
            try {
              if (action.type === 'create_task') {
                const roleAgent = ['secretary','admin'].includes(cfg.assign_to) ? agents?.find(a => a.role === cfg.assign_to) : null
                const due = new Date(); due.setDate(due.getDate() + (parseInt(cfg.due_days) || 1))
                await supabase.from('tasks').insert({
                  title: fill(cfg.title || 'Follow up'), notes: fill(cfg.notes || ''),
                  agent_id: roleAgent?.id || deal.agent_id || null, created_by: null,
                  deal_id: deal.id, due_date: due.toISOString().slice(0, 10),
                  priority: cfg.priority || 'normal', status: 'pending',
                  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                })
              }
              if (action.type === 'send_email') {
                const roleAgent = cfg.to_role ? agents?.find(a => a.role === cfg.to_role) : null
                const to = (cfg.to_email && fill(cfg.to_email)) || roleAgent?.email || 'office@targetreteam.com'
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    from: 'TargetOS <office@targetreteam.com>', to: [to],
                    ...(cfg.cc_email ? { cc: String(cfg.cc_email).split(',').map(x => x.trim()).filter(Boolean) } : {}),
                    subject: fill(cfg.subject || 'TargetOS alert'),
                    html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">' + fill(cfg.body || '').replace(/\n/g, '<br/>') + '</div>',
                  }),
                })
              }
            } catch (e) { console.warn('[closing-cron] action failed:', e.message) }
          }
          await supabase.from('automation_fires').insert({ automation_id: auto.id, record_id: deal.id })
          await supabase.from('automations').update({ last_fired: new Date().toISOString(), fire_count: (auto.fire_count || 0) + 1 }).eq('id', auto.id)
          closingFired++
        }
      }
    }
  } catch (e) { console.warn('[closing-cron] skipped:', e.message) }

  console.info('[daily-briefing-cron] sent:', sent, 'skipped:', skipped, 'failed:', failed, 'closing_fired:', closingFired)
  return res.status(200).json({ ok: true, sent, skipped, failed, closingFired, errors })
}
