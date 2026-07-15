// ═══════════════════════════════════════════════════════════════
// /api/unsubscribe — public, no auth (recipients aren't logged in).
// GET ?email=<addr>&token=<sig> → adds the email to
// email_unsubscribes and shows a confirmation page. Every blast
// footer links here. Token is a lightweight HMAC so the link can't
// be trivially abused to unsubscribe arbitrary addresses.
// ═══════════════════════════════════════════════════════════════
'use strict'
const crypto = require('crypto')
const { getSupabase } = require('./_lib/phone')

function sign(email) {
  const secret = process.env.UNSUB_SECRET || process.env.CRON_SECRET || 'targetos-unsub'
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('hex').slice(0, 16)
}

// Exported so the blast sender can build matching links
function unsubToken(email) { return sign(email) }

function page(title, msg) {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title></head>' +
    '<body style="font-family:Arial,sans-serif;background:#F8FAFC;margin:0;padding:40px">' +
    '<div style="max-width:460px;margin:40px auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:32px;text-align:center">' +
    '<div style="font-size:20px;font-weight:800;color:#0F172A;margin-bottom:8px">Target Team</div>' +
    '<div style="font-size:15px;color:#334155;line-height:1.5">' + msg + '</div>' +
    '</div></body></html>'
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html')
  try {
    const url = new URL(req.url, 'https://x')
    const email = (url.searchParams.get('email') || '').toLowerCase().trim()
    const token = url.searchParams.get('token') || ''
    if (!email || !token) return res.status(400).end(page('Invalid link', 'This unsubscribe link is missing information.'))
    if (token !== sign(email)) return res.status(400).end(page('Invalid link', 'This unsubscribe link is not valid.'))

    const supabase = getSupabase()
    await supabase.from('email_unsubscribes')
      .upsert({ email, reason: 'link', created_at: new Date().toISOString() }, { onConflict: 'email' })

    return res.status(200).end(page('Unsubscribed',
      'You have been unsubscribed from Target Team emails.<br><br><b>' + email + '</b><br><br>You will no longer receive our listing updates. If this was a mistake, contact your agent.'))
  } catch (e) {
    return res.status(500).end(page('Error', 'Something went wrong. Please contact your agent to be removed.'))
  }
}

module.exports.unsubToken = unsubToken
