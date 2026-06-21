import { supabase } from '../supabase'
export async function getAutomations() {
  const { data, error } = await supabase.from('automations').select('*').order('created_at', { ascending: false })
  if (error) throw error; return data
}
export async function upsertAutomation(automation) {
  const { data, error } = await supabase.from('automations').upsert(automation, { onConflict: 'id' }).select().single()
  if (error) throw error; return data
}
export async function updateAutomation(id, changes) {
  const { data, error } = await supabase.from('automations').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteAutomation(id) {
  const { error } = await supabase.from('automations').delete().eq('id', id)
  if (error) throw error
}
