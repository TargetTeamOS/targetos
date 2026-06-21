import { supabase } from '../supabase'
export async function getListingPreps({ agentId } = {}) {
  let q = supabase.from('listing_prep').select('*').order('created_at', { ascending: false })
  if (agentId) q = q.eq('agent_id', agentId)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createListingPrep(p) {
  const { data, error } = await supabase.from('listing_prep').insert([p]).select().single()
  if (error) throw error; return data
}
export async function updateListingPrep(id, changes) {
  const { data, error } = await supabase.from('listing_prep').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteListingPrep(id) {
  const { error } = await supabase.from('listing_prep').delete().eq('id', id)
  if (error) throw error
}
