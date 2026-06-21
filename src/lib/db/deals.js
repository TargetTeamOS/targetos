import { supabase } from '../supabase'

export async function getDeals({ stage, agentId, year, search } = {}) {
  let query = supabase
    .from('deals')
    .select('*')
    .order('ao_date', { ascending: false })

  if (agentId) query = query.eq('agent_id', agentId)
  if (stage)   query = query.eq('stage', stage)
  if (year)    query = query.gte('ao_date', `${year}-01-01`).lte('ao_date', `${year}-12-31`)
  if (search)  query = query.ilike('addr', `%${search}%`)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getDeal(id) {
  const { data, error } = await supabase
    .from('deals').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createDeal(deal) {
  const { data, error } = await supabase
    .from('deals').insert([deal]).select().single()
  if (error) throw error
  return data
}

export async function updateDeal(id, changes) {
  const { data, error } = await supabase
    .from('deals')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteDeal(id) {
  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) throw error
}
