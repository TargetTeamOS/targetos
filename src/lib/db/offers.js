import { supabase } from '../supabase'
export async function getOffers({ agentId } = {}) {
  let q = supabase.from('offers').select('*').order('created_at', { ascending: false })
  if (agentId) q = q.eq('agent_id', agentId)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createOffer(offer) {
  const { data, error } = await supabase.from('offers').insert([offer]).select().single()
  if (error) throw error; return data
}
export async function updateOffer(id, changes) {
  const { data, error } = await supabase.from('offers').update(changes).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteOffer(id) {
  const { error } = await supabase.from('offers').delete().eq('id', id)
  if (error) throw error
}
