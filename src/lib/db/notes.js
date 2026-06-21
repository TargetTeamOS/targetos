import { supabase } from '../supabase'
export async function getNotes({ agentId } = {}) {
  let q = supabase.from('tasks').select('*').eq('priority', 'note').order('created_at', { ascending: false })
  if (agentId) q = q.eq('agent_id', agentId)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createNote(note) {
  const { data, error } = await supabase.from('tasks').insert([{ ...note, priority: 'note' }]).select().single()
  if (error) throw error; return data
}
export async function updateNote(id, changes) {
  const { data, error } = await supabase.from('tasks').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteNote(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
