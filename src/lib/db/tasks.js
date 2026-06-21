import { supabase } from '../supabase'

export async function getTasks({ agentId, status, dueDate, dealId, contactId } = {}) {
  let query = supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true })

  if (agentId)   query = query.eq('agent_id', agentId)
  if (status)    query = query.eq('status', status)
  if (dueDate)   query = query.eq('due_date', dueDate)
  if (dealId)    query = query.eq('deal_id', dealId)
  if (contactId) query = query.eq('contact_id', contactId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createTask(task) {
  const { data, error } = await supabase
    .from('tasks').insert([task]).select().single()
  if (error) throw error
  return data
}

export async function updateTask(id, changes) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}
