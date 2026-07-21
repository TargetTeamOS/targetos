// ═══════════════════════════════════════════════════════════════
// /api/report-cron — runs hourly, sends any report_definitions whose
// schedule matches the current ET hour (weekly: matching weekday +
// hour; daily: matching hour). Dedupe via report_sends unique
// constraint. CRON_SECRET enforced. Uses the shared report engine so
// emails match the admin preview exactly.
// ═══════════════════════════════════════════════════════════════
'use strict'
const { getSupabase } = require('./_lib/phone')
const { computeReport, renderReportHtml } = require('./_lib/reportEngine')

const FROM = process.env.BLAST_FROM || 'Target Team <listings@targetreteam.com>'

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  const CRON_SECRET = process.env.CRON_SECRET
  if (CRON_SECRET && req.headers['authorization'] !== 'Bearer ' + CRON_SECRET) {
    console.warn('[report-cron] BLOCKED unauthorized invocation')
    return res.status(401).end(JSON.stringify({ error: 'unauthorized' }))
  }
  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).end(JSON.stringify({ error: 'Email service not configured' }))

  const supabase = getSupabase()

  // Current ET weekday + hour
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date())
  const wdMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
  const weekday = wdMap[parts.find(p => p.type === 'weekday').value]
  let hour = parseInt(parts.find(p => p.type === 'hour').value, 10)
  if (hour === 24) hour = 0
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  let sent = 0, skipped = 0, failed = 0
  try {
    const { data: defs } = await supabase.from('report_definitions').select('*').eq('enabled', true)
    for (const def of (defs || [])) {
      const sch = def.schedule || {}
      const hourMatch = Number(sch.hour) === hour
      const dayMatch = sch.type === 'daily' || (sch.type === 'weekly' && Number(sch.weekday) === weekday)
      if (!hourMatch || !dayMatch) { skipped++; continue }

      // dedupe
      const { error: dupErr } = await supabase.from('report_sends')
        .insert({ report_id: def.id, sent_date: todayStr, slot: String(hour) })
      if (dupErr) { skipped++; continue }

      const recipients = (def.recipients || []).filter(Boolean)
      if (!recipients.length) { skipped++; continue }

      try {
        const data = await computeReport(supabase, def)
        const html = renderReportHtml(def, data)
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: recipients, subject: def.name + ' — ' + data.range.from + ' to ' + data.range.to, html }),
        })
        if (resp.ok) { sent++; await supabase.from('report_definitions').update({ last_sent_at: new Date().toISOString() }).eq('id', def.id) }
        else failed++
      } catch (e) { console.error('[report-cron] send failed for', def.id, e.message); failed++ }
    }
    let alertResult = { commission: 'skip', goals: 'skip', leads: 'skip' }
    try { alertResult = await runAlertAutomations() }
    catch (e) { console.warn('[report-cron] alert automations error:', e.message) }

    return res.status(200).end(JSON.stringify({ ok: true, weekday, hour, sent, skipped, failed, alerts: alertResult }))
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message }))
  }

  // ── REPORT ALERT AUTOMATIONS (July 2026) ──────────────────────
  // Three time-based automation rows evaluated here (this cron already
  // runs hourly with ET weekday/hour). Each computes its own list,
  // fills its {{variables}}, and sends via Resend. Deduped by a per-day
  // slot key in report_sends (reusing that table's unique constraint —
  // report_id here is the automation UUID). Never touches the client
  // automation engine or automation_fires. Only sends when there's
  // something to report.
  async function runAlertAutomations() {
    const result = { commission: 'skip', goals: 'skip', leads: 'skip' }
    const money = v => '$' + Math.round(Number(v) || 0).toLocaleString()
    const fill = (t, ctx) => String(t || '').replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '')

    async function alreadySent(autoId, slot) {
      // Insert a dedupe marker; unique violation → already sent this window.
      const { error } = await supabase.from('report_sends').insert({ report_id: autoId, sent_date: todayStr, slot })
      return !!error
    }
    async function sendEmail(auto, ctx) {
      const action = (auto.action_nodes || []).find(a => a.type === 'send_email')
      if (!action) return false
      const cfg = action.config || {}
      const to = (cfg.to_email && fill(cfg.to_email, ctx)) || 'yanky@targetreteam.com'
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: [to],
          ...(cfg.cc_email ? { cc: String(cfg.cc_email).split(',').map(x => x.trim()).filter(Boolean) } : {}),
          subject: fill(cfg.subject || 'TargetOS alert', ctx),
          html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">' + fill(cfg.body || '', ctx).replace(/\n/g, '<br/>') + '</div>',
        }),
      })
      if (resp.ok) {
        await supabase.from('automations').update({ last_fired: new Date().toISOString(), fire_count: (auto.fire_count || 0) + 1 }).eq('id', auto.id)
        return true
      }
      return false
    }

    const { data: autos } = await supabase.from('automations').select('*').eq('active', true)
      .in('trigger_type', ['commission_outstanding', 'agent_behind_goal', 'leads_uncontacted'])
    if (!autos || !autos.length) return result

    // A) commission_outstanding — weekly (day + hour from trigger_config)
    for (const auto of autos.filter(a => a.trigger_type === 'commission_outstanding')) {
      const sch = auto.trigger_config || {}
      const wantDay = wdMap[sch.day] ?? 1, wantHour = Number(sch.hour ?? 8)
      if (weekday !== wantDay || hour !== wantHour) { result.commission = 'not-time'; continue }
      if (await alreadySent(auto.id, 'wk')) { result.commission = 'deduped'; continue }
      const { data: closed } = await supabase.from('deals').select('addr,gci,collected_gci,commission_status,close_date')
        .eq('stage', 'Closed')
      const outstanding = (closed || []).filter(d => d.commission_status !== 'collected')
        .map(d => ({ addr: d.addr, amt: (Number(d.gci) || 0) - (Number(d.collected_gci) || 0) }))
        .filter(d => d.amt > 0)
      if (!outstanding.length) { result.commission = 'nothing'; continue }
      const total = outstanding.reduce((s, d) => s + d.amt, 0)
      const list = outstanding.map(d => '• ' + (d.addr || 'Deal') + ' — ' + money(d.amt)).join('\n')
      result.commission = (await sendEmail(auto, { outstanding_list: list, outstanding_total: money(total) })) ? 'sent(' + outstanding.length + ')' : 'send-failed'
    }

    // B) agent_behind_goal — weekly
    for (const auto of autos.filter(a => a.trigger_type === 'agent_behind_goal')) {
      const sch = auto.trigger_config || {}
      const wantDay = wdMap[sch.day] ?? 1, wantHour = Number(sch.hour ?? 8)
      if (weekday !== wantDay || hour !== wantHour) { result.goals = 'not-time'; continue }
      if (await alreadySent(auto.id, 'wk')) { result.goals = 'deduped'; continue }
      const year = new Date().getFullYear()
      const yearFrac = ((Date.now() - new Date(year, 0, 1).getTime()) / (new Date(year+1,0,1).getTime() - new Date(year,0,1).getTime()))
      const [{ data: agents }, { data: goals }, { data: deals }] = await Promise.all([
        supabase.from('agents').select('id,name').eq('active', true),
        supabase.from('agent_goals').select('agent_id,deals,gci,production').eq('year', year),
        supabase.from('deals').select('agent_id,gci,stage,close_date,created_at').eq('stage', 'Closed'),
      ])
      const goalMap = {}; (goals || []).forEach(g => { goalMap[g.agent_id] = g })
      const behind = []
      for (const a of (agents || [])) {
        const g = goalMap[a.id]; if (!g || !(g.gci > 0)) continue
        const actualGci = (deals || []).filter(d => d.agent_id === a.id && (d.close_date || d.created_at || '').startsWith(String(year))).reduce((s, d) => s + (Number(d.gci) || 0), 0)
        const projected = yearFrac > 0 ? actualGci / yearFrac : 0
        if (projected < g.gci) {
          const needWk = Math.max(0, (g.gci - actualGci) / Math.max(1, (52 * (1 - yearFrac))))
          behind.push('• ' + a.name + ' — ' + money(actualGci) + ' of ' + money(g.gci) + ' goal · projected ' + money(projected) + ' · need ' + money(needWk) + '/wk')
        }
      }
      if (!behind.length) { result.goals = 'nothing'; continue }
      result.goals = (await sendEmail(auto, { behind_list: behind.join('\n') })) ? 'sent(' + behind.length + ')' : 'send-failed'
    }

    // C) leads_uncontacted — daily (hour from trigger_config)
    for (const auto of autos.filter(a => a.trigger_type === 'leads_uncontacted')) {
      const sch = auto.trigger_config || {}
      const wantHour = Number(sch.hour ?? 8)
      if (hour !== wantHour) { result.leads = 'not-time'; continue }
      if (await alreadySent(auto.id, 'day')) { result.leads = 'deduped'; continue }
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()  // older than 24h
      const { data: contacts } = await supabase.from('contacts')
        .select('first_name,last_name,source,agent_id,created_at,contacted,first_contact_at,status')
        .lte('created_at', cutoff)
      const agentsRes = await supabase.from('agents').select('id,name')
      const aMap = {}; (agentsRes.data || []).forEach(a => { aMap[a.id] = a.name })
      const uncontacted = (contacts || []).filter(c => c.contacted !== true && !c.first_contact_at && (c.status === 'New' || !c.status))
      if (!uncontacted.length) { result.leads = 'nothing'; continue }
      const list = uncontacted.slice(0, 50).map(c => {
        const age = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000)
        return '• ' + [c.first_name, c.last_name].filter(Boolean).join(' ') + ' — ' + (c.source || 'no source') + (c.agent_id ? ' · ' + (aMap[c.agent_id] || 'agent') : ' · unassigned') + ' · ' + age + 'd old'
      }).join('\n')
      result.leads = (await sendEmail(auto, { uncontacted_list: list })) ? 'sent(' + uncontacted.length + ')' : 'send-failed'
    }
    return result
  }
}
