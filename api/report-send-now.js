// ═══════════════════════════════════════════════════════════════
// /api/report-send-now — admin "send test / send now" for a report
// definition. Auth-gated (staged AUTH_ENFORCE). Body: { reportId } or
// an inline { def, recipients }.
// ═══════════════════════════════════════════════════════════════
'use strict'
const { getSupabase } = require('./_lib/phone')
const { computeReport, renderReportHtml } = require('./_lib/reportEngine')
const FROM = process.env.BLAST_FROM || 'Target Team <listings@targetreteam.com>'

async function readBody(req) {
  return new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>{ try{resolve(JSON.parse(d||'{}'))}catch{resolve({})} }) })
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  const { requireUser } = require('./_lib/auth')
  const user = await requireUser(req)
  if (!user && String(process.env.AUTH_ENFORCE||'').toLowerCase()==='true') return res.status(401).end(JSON.stringify({ error:'unauthorized' }))
  if (!user) console.warn('[AUTH] unauthenticated call to /api/report-send-now ALLOWED (log-only)')

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
