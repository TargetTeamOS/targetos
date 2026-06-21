import { supabase } from '../supabase'
export async function getCalls({ agentId, contactId, limit = 100 } = {}) {
  let q = supabase.from('calls').select('*').order('called_at', { ascending: false }).limit(limit)
  if (agentId)   q = q.eq('agent_id', agentId)
  if (contactId) q = q.eq('contact_id', contactId)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createCall(call) {
  const { data, error } = await supabase.from('calls').insert([call]).select().single()
  if (error) throw error; return data
}
export async function deleteCall(id) {
  const { error } = await supabase.from('calls').delete().eq('id', id)
  if (error) throw error
}
