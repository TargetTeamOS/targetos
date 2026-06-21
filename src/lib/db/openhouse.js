import { supabase } from '../supabase'
export async function getOpenHouses() {
  const { data, error } = await supabase.from('open_houses').select('*').order('date', { ascending: false })
  if (error) throw error; return data
}
export async function createOpenHouse(oh) {
  const { data, error } = await supabase.from('open_houses').insert([oh]).select().single()
  if (error) throw error; return data
}
export async function deleteOpenHouse(id) {
  const { error } = await supabase.from('open_houses').delete().eq('id', id)
  if (error) throw error
}
export async function getVisitors(openHouseId) {
  const { data, error } = await supabase.from('oh_visitors').select('*').eq('open_house_id', openHouseId).order('visited_at', { ascending: false })
  if (error) throw error; return data
}
export async function createVisitor(v) {
  const { data, error } = await supabase.from('oh_visitors').insert([v]).select().single()
  if (error) throw error; return data
}
export async function updateVisitor(id, changes) {
  const { data, error } = await supabase.from('oh_visitors').update(changes).eq('id', id).select().single()
  if (error) throw error; return data
}
