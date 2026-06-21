import { supabase } from '../supabase'

export async function getGifts({ type, status } = {}) {
  let query = supabase
    .from('gifts').select('*').order('created_at', { ascending: false })
  if (type)   query = query.eq('type', type)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createGift(gift) {
  const { data, error } = await supabase
    .from('gifts').insert([gift]).select().single()
  if (error) throw error
  return data
}

export async function updateGift(id, changes) {
  const { data, error } = await supabase
    .from('gifts')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteGift(id) {
  const { error } = await supabase.from('gifts').delete().eq('id', id)
  if (error) throw error
}
