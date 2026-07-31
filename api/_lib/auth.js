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
const { createServiceClient, getServerSupabaseConfig } = require('./supabaseConfig')

const ADMIN_ROLES = new Set(['admin', 'administrator', 'owner'])
const SECRETARY_ROLES = new Set(['secretary', 'transaction_coordinator', 'transaction coordinator'])
const AGENT_ROLES = new Set(['agent', 'manager', 'team_leader', 'team leader'])
const TEAM_ROLES = new Set([...ADMIN_ROLES, ...SECRETARY_ROLES, ...AGENT_ROLES])

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

function canonicalRole(role) {
  const normalized = normalizeRole(role)
  if (ADMIN_ROLES.has(normalized)) return 'admin'
  if (SECRETARY_ROLES.has(normalized)) return 'secretary'
  if (AGENT_ROLES.has(normalized)) return 'agent'
  return normalized
}

async function requireUser(req, deps = {}) {
  try {
    const hdr = req.headers['authorization'] || ''
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
    if (!token) return null
    const supabase = deps.supabase || createServiceClient({ env: deps.env || process.env })
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
  const supabase = deps.supabase || createServiceClient({ env: deps.env || process.env })
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
  const normalized = normalizeRole(role)
  const canonical = canonicalRole(role)
  return allowedRoles.some(allowed => {
    const normalizedAllowed = normalizeRole(allowed)
    if (normalizedAllowed === 'admin') return ADMIN_ROLES.has(normalized)
    if (normalizedAllowed === 'secretary') return SECRETARY_ROLES.has(normalized)
    if (normalizedAllowed === 'agent') return AGENT_ROLES.has(normalized)
    if (normalizedAllowed === 'team') return TEAM_ROLES.has(normalized)
    return canonical === canonicalRole(normalizedAllowed)
  })
}

async function authenticate(req, options = {}, deps = {}) {
  if (!deps.supabase && !deps.requireUser) {
    try {
      getServerSupabaseConfig(deps.env || process.env)
    } catch (error) {
      return {
        ok: false,
        status: error.status || 503,
        error: error.message,
      }
    }
  }
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
  return ADMIN_ROLES.has(normalizeRole(role))
}

function isTeamRole(role) {
  return TEAM_ROLES.has(normalizeRole(role))
}

module.exports = {
  ADMIN_ROLES,
  SECRETARY_ROLES,
  AGENT_ROLES,
  TEAM_ROLES,
  normalizeRole,
  canonicalRole,
  requireUser,
  getAgentForUser,
  authenticate,
  sendAuthError,
  roleAllowed,
  isAdminRole,
  isTeamRole,
}
