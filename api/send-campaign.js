// ═══════════════════════════════════════════════════════════════
// /api/send-campaign — sends an email blast to a resolved audience
// through Resend, in batches, skipping anyone on the unsubscribe
// list. Auth-gated (staged, like the other endpoints). Appends a
// compliant unsubscribe footer + physical-address line to every
// message. Updates the email_campaigns row with progress.
//
// Body: { campaignId, subject, bodyHtml, audience }
// audience: { type:'all'|'status'|'tag'|'segment', value }
// ═══════════════════════════════════════════════════════════════
'use strict'
const { getSupabase } = require('./_lib/phone')
const { unsubToken } = require('./unsubscribe')

const BASE = process.env.PUBLIC_BASE_URL || 'https://app.targetreteam.com'
const FROM = process.env.BLAST_FROM || 'Target Team <listings@targetreteam.com>'
const ORG_ADDRESS = process.env.ORG_POSTAL_ADDRESS || 'Target Team, Keller Williams'

async function readBody(req) {
  return new Promise((resolve) => {
    let d = ''
    req.on('data', c => { d += c })
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')) } catch { resolve({}) } })
  })
}

function footer(email) {
  const link = BASE + '/api/unsubscribe?email=' + encodeURIComponent(email) + '&token=' + unsubToken(email)
  return '<hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0">' +
    '<div style="font-size:12px;color:#94A3B8;text-align:center;line-height:1.5">' +
    ORG_ADDRESS + '<br>' +
    'You received this because you are a contact of Target Team.<br>' +
    '<a href="' + link + '" style="color:#94A3B8">Unsubscribe</a></div>'
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')

  // Staged auth (mirrors AUTH_ENFORCE pattern)
  const { requireUser } = require('./_lib/auth')
  const user = await requireUser(req)
  if (!user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      return res.status(401).end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to /api/send-campaign ALLOWED (log-only)')
  }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) return res.status(500).end(JSON.stringify({ error: 'Email service not configured' }))

  const { campaignId, subject, bodyHtml, audience } = await readBody(req)
  if (!subject || !bodyHtml || !audience) return res.status(400).end(JSON.stringify({ error: 'Missing subject, body, or audience' }))

  const supabase = getSupabase()

  try {
    // Resolve audience → contact emails
    let q = supabase.from('contacts').select('email, first_name').not('email', 'is', null)
    if (audience.type === 'status') q = q.eq('status', audience.value)
    if (audience.type === 'tag')    q = q.contains('tags', [audience.value])
    const { data: contacts, error } = await q.limit(5000)
    if (error) throw error

    // Remove unsubscribes + dedupe
    const { data: unsub } = await supabase.from('email_unsubscribes').select('email')
    const blocked = new Set((unsub || []).map(u => u.email.toLowerCase()))
    const seen = new Set()
    const recipients = []
    for (const c of (contacts || [])) {
      const e = (c.email || '').toLowerCase().trim()
      if (!e || blocked.has(e) || seen.has(e)) continue
      seen.add(e); recipients.push({ email: c.email, name: c.first_name || '' })
    }

    if (campaignId) await supabase.from('email_campaigns').update({ status: 'sending', total: recipients.length }).eq('id', campaignId)

    let sent = 0, failed = 0
    const BATCH = 40
    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH)
      await Promise.all(slice.map(async r => {
        try {
          const html = bodyHtml.replace(/\{\{first_name\}\}/g, r.name || 'there') + footer(r.email)
          const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: r.email, subject, html }),
          })
          if (resp.ok) sent++; else failed++
        } catch { failed++ }
      }))
      // gentle pacing to respect provider rate limits
      await new Promise(r => setTimeout(r, 400))
    }

    if (campaignId) await supabase.from('email_campaigns')
      .update({ status: 'sent', sent_count: sent, fail_count: failed, sent_at: new Date().toISOString() })
      .eq('id', campaignId)

    return res.status(200).end(JSON.stringify({ ok: true, sent, failed, total: recipients.length }))
  } catch (e) {
    if (campaignId) await supabase.from('email_campaigns').update({ status: 'failed' }).eq('id', campaignId)
    return res.status(500).end(JSON.stringify({ error: e.message }))
  }
}
