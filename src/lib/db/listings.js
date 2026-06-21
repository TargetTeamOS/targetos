import { supabase } from '../supabase'

export async function getListings({ status, agentId, search } = {}) {
  let query = supabase
    .from('listings')
    .select('*')
    .order('updated_at', { ascending: false })

  if (agentId) query = query.eq('agent_id', agentId)
  if (status)  query = query.eq('status', status)
  if (search)  query = query.ilike('addr', `%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getListing(id) {
  const { data, error } = await supabase
    .from('listings').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createListing(listing) {
  const { data, error } = await supabase
    .from('listings').insert([listing]).select().single()
  if (error) throw error
  return data
}

export async function updateListing(id, changes) {
  const { data, error } = await supabase
    .from('listings')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteListing(id) {
  const { error } = await supabase.from('listings').delete().eq('id', id)
  if (error) throw error
}
