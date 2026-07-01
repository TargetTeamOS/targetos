// Quick debug endpoint — visit this to check if call_flow_contexts table exists
'use strict'
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.json({ error: 'Supabase not configured' })
  const { createClient } = require('@supabase/supabase-js')
  const sb = createClient(url, key)
  // Test insert
  const { data, error } = await sb.from('call_flow_contexts').insert({ context: {test:true}, created_at: new Date().toISOString() }).select('id').single()
  if (error) return res.json({ table_exists: false, error: error.message, fix: 'Run the SQL in sql/call_flow_contexts.sql in Supabase SQL Editor' })
  // Clean up
  await sb.from('call_flow_contexts').delete().eq('id', data.id)
  return res.json({ table_exists: true, ok: true, message: 'call_flow_contexts table is working — menu context storage is enabled' })
}
