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
    return res.status(200).end(JSON.stringify({ ok: true, weekday, hour, sent, skipped, failed }))
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message }))
  }
}
