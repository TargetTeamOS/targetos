// TargetOS V2 — Task Reminder Scheduler
// Called daily by Vercel Cron at 8 AM Eastern
// Sends email reminders for tasks due today or overdue
// Vercel cron config in vercel.json:
//   { "crons": [{ "path": "/api/task-reminders", "schedule": "0 12 * * *" }] }
'use strict'

const { getSupabase } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  // Allow GET (cron) or POST (manual trigger)
  const sb = getSupabase()
  if (!sb) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    const today    = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    // Load all pending tasks due today or overdue, grouped by agent
    const { data: tasks } = await sb
      .from('tasks')
      .select('id, title, due_date, priority, notes, agent_id, contact_id, agents(id, name, email)')
      .eq('status', 'pending')
      .lte('due_date', tomorrow)
      .order('due_date', { ascending: true })

    if (!tasks || tasks.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, message: 'No tasks due' })
    }

    // Group by agent
    const byAgent = {}
    tasks.forEach(t => {
      const agentId = t.agent_id || 'unassigned'
      if (!byAgent[agentId]) byAgent[agentId] = { agent: t.agents, tasks: [] }
      byAgent[agentId].tasks.push(t)
    })

    const RESEND_KEY = process.env.RESEND_API_KEY
    if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' })

    let sent = 0
    for (const [agentId, group] of Object.entries(byAgent)) {
      const ag = group.agent
      if (!ag?.email) continue

      const overdue = group.tasks.filter(t => t.due_date < today)
      const dueToday = group.tasks.filter(t => t.due_date === today)
      const dueTomorrow = group.tasks.filter(t => t.due_date === tomorrow)

      const taskRows = group.tasks.map(t => {
        const isOverdue  = t.due_date < today
        const isToday    = t.due_date === today
        const statusText = isOverdue ? '⚠️ Overdue' : isToday ? '📅 Due today' : '🔜 Due tomorrow'
        const statusColor= isOverdue ? '#DC2626'    : isToday ? '#F97316'     : '#6366F1'
        const priorityIcon = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🔵'
        return `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #F0F4F8;vertical-align:top;">
              <div style="display:flex;align-items:flex-start;gap:8px;">
                <span>${priorityIcon}</span>
                <div>
                  <div style="font-size:13px;font-weight:600;color:#1E293B;">${t.title}</div>
                  ${t.notes ? '<div style="font-size:11px;color:#94A3B8;margin-top:2px;">'+t.notes+'</div>' : ''}
                </div>
              </div>
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #F0F4F8;white-space:nowrap;">
              <span style="font-size:11px;font-weight:700;color:${statusColor};background:${statusColor}18;padding:3px 8px;border-radius:99px;">${statusText}</span>
            </td>
          </tr>`
      }).join('')

      const subject = overdue.length > 0
        ? `⚠️ ${overdue.length} overdue task${overdue.length>1?'s':''} — TargetOS`
        : `📅 ${dueToday.length} task${dueToday.length>1?'s':''} due today — TargetOS`

      const html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1B2B4B;padding:20px 24px;border-radius:12px 12px 0 0;">
            <div style="color:#fff;font-size:18px;font-weight:800;">⏰ Task Reminder</div>
            <div style="color:rgba(255,255,255,.5);font-size:12px;margin-top:4px;">Good morning, ${ag.name?.split(' ')[0] || 'Agent'}</div>
          </div>
          <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;">
            ${overdue.length > 0 ? '<div style="padding:12px 14px;background:#FEF2F2;border-bottom:1px solid #FCA5A5;font-size:13px;color:#DC2626;font-weight:700;">⚠️ '+overdue.length+' overdue task'+( overdue.length>1?'s':'')+' need immediate attention</div>' : ''}
            <table style="width:100%;border-collapse:collapse;">${taskRows}</table>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;">
            <a href="https://app.targetreteam.com/tasks"
              style="display:inline-block;background:#CC2200;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;">
              Open My Tasks →
            </a>
            <div style="font-size:11px;color:#94A3B8;margin-top:10px;">
              ${group.tasks.length} task${group.tasks.length>1?'s':''} total · ${dueToday.length} today · ${overdue.length} overdue
            </div>
          </div>
        </div>`

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'TargetOS <office@targetreteam.com>',
          to: [ag.email],
          subject, html,
        }),
      })
      if (r.ok) sent++
      else console.warn('Failed to send to', ag.email, await r.text())
    }

    return res.status(200).json({
      ok: true,
      sent,
      total_tasks: tasks.length,
      agents_notified: sent,
      message: `Sent reminders to ${sent} agent${sent!==1?'s':''}`,
    })
  } catch(e) {
    console.error('task-reminders error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
