'use strict'
// /api/admin-users — Create/update/delete Supabase auth users (requires service key)
const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { action, userId, email, password, name, role, color, phone } = req.body || {}

  try {
    if (action === 'create') {
      // Check if already exists
      const { data: existing } = await supabase.auth.admin.listUsers()
      const existingUser = existing?.users?.find(u => u.email?.toLowerCase() === email?.toLowerCase())

      let authUserId
      if (existingUser) {
        // Update their password
        await supabase.auth.admin.updateUserById(existingUser.id, { password: password || 'TargetOS2024!' })
        authUserId = existingUser.id
      } else {
        // Create new auth user
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email,
          password: password || 'TargetOS2024!',
          email_confirm: true,
        })
        if (authErr) return res.status(400).json({ error: authErr.message })
        authUserId = authData.user.id
      }

      // Check if agent record already exists for this auth user
      const { data: existingAgent } = await supabase.from('agents')
        .select('id').eq('auth_user_id', authUserId).maybeSingle()
      if (existingAgent) {
        // Update existing agent record
        await supabase.from('agents').update({ name, email, phone: phone||null, role: role||'agent', color: color||'#CC2200', active:true, updated_at: new Date().toISOString() }).eq('id', existingAgent.id)
        return res.status(200).json({ ok: true, agent: existingAgent, existed: true })
      }

      // Create agent record
      const { data: agent, error: agentErr } = await supabase.from('agents').insert({
        auth_user_id: authUserId,
        name, email, phone: phone || null, role: role || 'agent',
        color: color || '#CC2200', active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()
      if (agentErr) return res.status(400).json({ error: agentErr.message })

      return res.status(200).json({ ok: true, agent })
    }

    if (action === 'invite') {
      // First check if user already exists in Auth
      const { data: existing } = await supabase.auth.admin.listUsers()
      const existingUser = existing?.users?.find(u => u.email?.toLowerCase() === email?.toLowerCase())

      if (existingUser) {
        // User already in Auth — just link them to an agent record
        // Check if agent record already exists
        const { data: existingAgent } = await supabase.from('agents')
          .select('id').eq('auth_user_id', existingUser.id).maybeSingle()

        if (existingAgent) {
          return res.status(400).json({ error: 'This user already has an account in the system.' })
        }

        // Create agent record linked to existing auth user
        const { data: agent, error: agentErr } = await supabase.from('agents').insert({
          auth_user_id: existingUser.id,
          name, email, phone: phone || null, role: role || 'agent',
          color: color || '#CC2200', active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).select().single()
        if (agentErr) return res.status(400).json({ error: agentErr.message })
        return res.status(200).json({ ok: true, agent, existed: true })
      }

      // New user — send invite email
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name, role }
      })
      if (error) return res.status(400).json({ error: error.message })

      // Create agent record
      const { data: agent } = await supabase.from('agents').insert({
        auth_user_id: data.user?.id || null,
        name, email, phone: phone || null, role: role || 'agent',
        color: color || '#CC2200', active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single()

      return res.status(200).json({ ok: true, user: data.user, agent })
    }

    if (action === 'reset_password') {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'update_email') {
      const { error } = await supabase.auth.admin.updateUserById(userId, { email })
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'delete') {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (action === 'deactivate') {
      // Disable auth user
      const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: '876600h' })
      if (error) console.warn('Auth disable failed:', error.message) // non-fatal
      // Always deactivate in agents table
      await supabase.from('agents').update({ active: false, updated_at: new Date().toISOString() }).eq('auth_user_id', userId)
      return res.status(200).json({ ok: true })
    }

    if (action === 'reactivate') {
      const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' })
      if (error) console.warn('Auth reactivate failed:', error.message)
      await supabase.from('agents').update({ active: true, updated_at: new Date().toISOString() }).eq('auth_user_id', userId)
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch(e) {
    console.error('admin-users error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
