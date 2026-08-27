'use strict'
const { getSupabase } = require('./_lib/phone')
const { signExpiring, verifyExpiring } = require('./_lib/requestSecurity')
const UNSUB_TTL_SECONDS = 90 * 24 * 60 * 60

function unsubToken(email, options = {}) {
  return signExpiring(String(email || '').toLowerCase().trim(), 'UNSUB_SECRET', UNSUB_TTL_SECONDS, options.env, options.now)
}
function verifyUnsubToken(email, token, options = {}) {
  const checked = verifyExpiring(token, 'UNSUB_SECRET', options.env, options.now)
  if (!checked.ok || checked.value !== String(email || '').toLowerCase().trim()) return { ok: false, status: checked.status || 400 }
  return checked
}
function page(title, msg) {
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title +
    '</title></head><body><main><h1>Target Team</h1><p>' + msg + '</p></main></body></html>'
}
async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html')
  try {
    const url = new URL(req.url, 'https://x')
    const email = (url.searchParams.get('email') || '').toLowerCase().trim()
    const checked = verifyUnsubToken(email, url.searchParams.get('token') || '')
    if (!email || !checked.ok) return res.status(checked.status === 503 ? 503 : 400).end(page('Invalid link', 'This unsubscribe link is invalid or expired.'))
    await getSupabase().from('email_unsubscribes').upsert({ email, reason: 'link', created_at: new Date().toISOString() }, { onConflict: 'email' })
    return res.status(200).end(page('Unsubscribed', 'You have been unsubscribed.'))
  } catch {
    return res.status(500).end(page('Error', 'Please contact your agent to be removed.'))
  }
}
module.exports = handler
module.exports.unsubToken = unsubToken
module.exports.verifyUnsubToken = verifyUnsubToken
