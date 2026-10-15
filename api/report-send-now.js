// ═══════════════════════════════════════════════════════════════
// /api/report-send-now — admin "send test / send now" for a report
// definition. Hard admin-gated. Body: { reportId } or an inline
// { def, recipients }.
// ═══════════════════════════════════════════════════════════════
'use strict'
const { getSupabase, requireAdmin } = require('./_lib/phone')
const { computeReport, renderReportHtml } = require('./_lib/reportEngine')
const FROM = process.env.BLAST_FROM || 'Target Team <listings@targetreteam.com>'

async function readBody(req) {
  return new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>{ try{resolve(JSON.parse(d||'{}'))}catch{resolve({})} }) })
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  // SECURITY (Oct 2026 hardening): this endpoint lets the caller hand
  // in an arbitrary report definition (body.def -- any query shape the
  // report engine supports) and an arbitrary recipient list, computed
  // on the service-role Supabase client below, which bypasses RLS, then
  // emailed to whatever addresses were given -- including addresses
  // outside the company. It was previously gated only by the staged/
  // log-only AUTH_ENFORCE check (effectively open to anonymous callers)
  // and then, after a partial fix, by requireAnyAgent -- meaning ANY
  // logged-in agent, not just admins, could pull arbitrary company-wide
  // data and exfiltrate it to an external inbox. The only caller,
  // ReportBuilder.jsx, is itself admin-gated client-side ("Report
  // Builder is available to admins."), so the API now matches that and
  // hard-requires admin.
  const authCheck = await requireAdmin(req)
  if (!authCheck.ok) return res.status(authCheck.status).end(JSON.stringify({ error: authCheck.message }))

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).end(JSON.stringify({ error:'Email service not configured' }))

  const body = await readBody(req)
  const supabase = getSupabase()
  let def = body.def
  if (body.reportId) {
    const { data } = await supabase.from('report_definitions').select('*').eq('id', body.reportId).maybeSingle()
    def = data
  }
  if (!def) return res.status(400).end(JSON.stringify({ error:'No report definition' }))
  const recipients = (body.recipients || def.recipients || []).filter(Boolean)
  if (!recipients.length) return res.status(400).end(JSON.stringify({ error:'No recipients' }))

  try {
    const data = await computeReport(supabase, def)
    const html = renderReportHtml(def, data)
    const resp = await fetch('https://api.resend.com/emails', {
      method:'POST', headers:{ 'Authorization':'Bearer '+RESEND_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify({ from:FROM, to:recipients, subject:(def.name||'Report')+' — '+data.range.from+' to '+data.range.to, html }),
    })
    const j = await resp.json()
    if (!resp.ok) return res.status(resp.status).end(JSON.stringify({ error: j.message||'send failed' }))
    return res.status(200).end(JSON.stringify({ ok:true, sent: recipients.length }))
  } catch (e) { return res.status(500).end(JSON.stringify({ error:e.message })) }
}
