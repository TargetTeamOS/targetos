import { supabase } from '../supabase'
export async function getAnnouncements() {
  const { data, error } = await supabase.from('announcements').select('*, agents(name,color)').order('created_at', { ascending: false })
  if (error) throw error; return data
}
export async function createAnnouncement(a) {
  const { data, error } = await supabase.from('announcements').insert([a]).select().single()
  if (error) throw error; return data
}
export async function updateAnnouncement(id, changes) {
  const { data, error } = await supabase.from('announcements').update(changes).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}
