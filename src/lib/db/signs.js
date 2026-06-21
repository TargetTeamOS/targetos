import { supabase } from '../supabase'
export async function getSigns({ agentId } = {}) {
  let q = supabase.from('signs').select('*').order('created_at', { ascending: false })
  if (agentId) q = q.eq('agent_id', agentId)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createSign(s) {
  const { data, error } = await supabase.from('signs').insert([s]).select().single()
  if (error) throw error; return data
}
export async function updateSign(id, changes) {
  const { data, error } = await supabase.from('signs').update(changes).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteSign(id) {
  const { error } = await supabase.from('signs').delete().eq('id', id)
  if (error) throw error
}
