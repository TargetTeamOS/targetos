'use strict'
// /api/admin-users — Full user management via Supabase Admin API
// Requires SUPABASE_SERVICE_KEY in Vercel environment variables

const { createClient } = require('@supabase/supabase-js')

async function parseBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) }
      catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Parse body — Vercel does NOT auto-parse req.body for API routes
  const body = await parseBody(req)
  const { action, userId, email, password, name, role, color, phone } = body

  // Validate env vars
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sgrnyvdsyahmypibjarx.supabase.co'
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SERVICE_KEY) {
    return res.status(500).json({
      error: 'SUPABASE_SERVICE_KEY not set in Vercel environment variables. Go to Vercel → Settings → Environment Variables and add it.'
    })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    // ── CREATE USER (with password) ──────────────────────────────
    if (action === 'create') {
      if (!email || !name) return res.status(400).json({ error: 'Email and name required' })

      // Check if auth user already exists
      const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
      const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

      let authUserId
      if (existing) {
        if (password) {
          await sb.auth.admin.updateUserById(existing.id, { password })
        }
        authUserId = existing.id
      } else {
        const { data: created, error: createErr } = await sb.auth.admin.createUser({
          email,
          password: password || 'TargetOS2024!',
          email_confirm: true,
        })
        if (createErr) return res.status(400).json({ error: createErr.message })
        authUserId = created.user.id
      }

      // Upsert agent record
      const { data: existingAgent } = await sb.from('agents')
        .select('id').eq('auth_user_id', authUserId).maybeSingle()

      if (existingAgent) {
        await sb.from('agents').update({
          name, email, phone: phone || null, role: role || 'agent',
          color: color || '#CC2200', active: true,
          updated_at: new Date().toISOString(),
        }).eq('id', existingAgent.id)
        return res.status(200).json({ ok: true, existed: true, message: name + ' linked to existing account' })
      }

      const { data: agent, error: agentErr } = await sb.from('agents').insert({
        auth_user_id: authUserId,
        name, email, phone: phone || null,
        role: role || 'agent', color: color || '#CC2200', active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select().single()
      if (agentErr) return res.status(400).json({ error: agentErr.message })

      return res.status(200).json({ ok: true, agent })
    }

    // ── INVITE USER (email invite) ───────────────────────────────
    if (action === 'invite') {
      if (!email || !name) return res.status(400).json({ error: 'Email and name required' })

      // Check if already in Auth
      const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
      const existing = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

      let authUserId
      if (existing) {
        authUserId = existing.id
      } else {
        // Send invite
        const { data: invited, error: invErr } = await sb.auth.admin.inviteUserByEmail(email, {
          data: { name, role }
        })
        if (invErr) return res.status(400).json({ error: invErr.message })
        authUserId = invited.user?.id
      }

      // Check if agent record already exists
      if (authUserId) {
        const { data: existingAgent } = await sb.from('agents')
          .select('id').eq('auth_user_id', authUserId).maybeSingle()
        if (existingAgent) {
          // Just update their name/role/color if changed
          await sb.from('agents').update({
            name, role: role || 'agent', color: color || '#CC2200',
            updated_at: new Date().toISOString(),
          }).eq('id', existingAgent.id)
          return res.status(200).json({ ok: true, existed: true, message: name + ' already in system — profile updated' })
        }
      }

      // Create agent record
      const { data: agent, error: agentErr } = await sb.from('agents').insert({
        auth_user_id: authUserId || null,
        name, email, phone: phone || null,
        role: role || 'agent', color: color || '#CC2200', active: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select().single()
      if (agentErr) return res.status(400).json({ error: agentErr.message })

      return res.status(200).json({ ok: true, agent, invited: !existing })
    }

    // ── RESET PASSWORD ───────────────────────────────────────────
    if (action === 'reset_password') {
      if (!userId) return res.status(400).json({ error: 'userId required' })
      const { error } = await sb.auth.admin.updateUserById(userId, { password })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // ── UPDATE EMAIL ─────────────────────────────────────────────
    if (action === 'update_email') {
      if (!userId) return res.status(400).json({ error: 'userId required' })
      const { error } = await sb.auth.admin.updateUserById(userId, { email })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // ── DELETE USER ──────────────────────────────────────────────
    if (action === 'delete') {
      if (!userId) return res.status(400).json({ error: 'userId required' })
      const { error } = await sb.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    // ── DEACTIVATE ───────────────────────────────────────────────
    if (action === 'deactivate') {
      if (!userId) return res.status(400).json({ error: 'userId required' })
      await sb.auth.admin.updateUserById(userId, { ban_duration: '876600h' }).catch(() => {})
      return res.status(200).json({ ok: true })
    }

    // ── REACTIVATE ───────────────────────────────────────────────
    if (action === 'reactivate') {
      if (!userId) return res.status(400).json({ error: 'userId required' })
      await sb.auth.admin.updateUserById(userId, { ban_duration: 'none' }).catch(() => {})
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action: ' + action })

  } catch(e) {
    console.error('admin-users error:', action, e.message)
    return res.status(500).json({ error: e.message })
  }
}
