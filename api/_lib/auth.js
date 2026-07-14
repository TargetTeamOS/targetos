// ═══════════════════════════════════════════════════════════════
// Caller authentication for API endpoints (July 2026 hardening)
// Validates the Supabase JWT the client sends as
// 'Authorization: Bearer <access_token>'. Endpoints that spend money
// or act as the team (SMS, email, calls, tokens, AI, PDFs) must
// require a logged-in user — before this, they were open to anyone
// who found the URL.
//
// Usage at the top of a handler:
//   const { requireUser } = require('./_lib/auth')
//   const user = await requireUser(req)
//   if (!user) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'unauthorized' })) }
// ═══════════════════════════════════════════════════════════════
'use strict'
const { getSupabase } = require('./phone')

async function requireUser(req) {
  try {
    const hdr = req.headers['authorization'] || ''
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
    if (!token) return null
    const supabase = getSupabase()
    if (!supabase) return null
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch (e) {
    console.warn('[auth] token validation error:', e.message)
    return null
  }
}

module.exports = { requireUser }
