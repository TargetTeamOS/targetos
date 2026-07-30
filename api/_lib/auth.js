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

const ADMIN_ROLES = new Set(['admin', 'administrator', 'owner'])
const TEAM_ROLES = new Set(['admin', 'administrator', 'owner', 'manager', 'team_leader', 'secretary'])

async function requireUser(req, deps = {}) {
  try {
    const hdr = req.headers['authorization'] || ''
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
    if (!token) return null
    const supabase = deps.supabase || getSupabase()
    if (!supabase) return null
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch (e) {
    console.warn('[auth] token validation error:', e.message)
    return null
  }
}

async function getAgentForUser(authUserId, deps = {}) {
  if (!authUserId) return null
  const supabase = deps.supabase || getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.from('agents')
    .select('id, auth_user_id, name, email, role, active')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error || !data || data.active === false) return null
  return data
}

function roleAllowed(role, allowedRoles) {
  if (!allowedRoles || !allowedRoles.length) return true
  const normalized = String(role || '').toLowerCase()
  return allowedRoles.some(allowed => {
    if (allowed === 'admin') return ADMIN_ROLES.has(normalized)
    if (allowed === 'team') return TEAM_ROLES.has(normalized)
    return normalized === String(allowed).toLowerCase()
  })
}

async function authenticate(req, options = {}, deps = {}) {
  const user = await (deps.requireUser || requireUser)(req, deps)
  if (!user) return { ok: false, status: 401, error: 'unauthorized' }
  const agent = await (deps.getAgentForUser || getAgentForUser)(user.id, deps)
  if (!agent) return { ok: false, status: 403, error: 'no active CRM agent is linked to this login' }
  if (!roleAllowed(agent.role, options.roles)) {
    return { ok: false, status: 403, error: 'forbidden' }
  }
  return { ok: true, user, agent }
}

function sendAuthError(res, result) {
  const body = JSON.stringify({ error: result.error || 'unauthorized' })
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(result.status || 401).json(JSON.parse(body))
  }
  res.statusCode = result.status || 401
  if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json')
  return res.end(body)
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(String(role || '').toLowerCase())
}

function isTeamRole(role) {
  return TEAM_ROLES.has(String(role || '').toLowerCase())
}

module.exports = {
  ADMIN_ROLES,
  TEAM_ROLES,
  requireUser,
  getAgentForUser,
  authenticate,
  sendAuthError,
  roleAllowed,
  isAdminRole,
  isTeamRole,
}
