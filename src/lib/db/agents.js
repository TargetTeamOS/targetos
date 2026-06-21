import { supabase } from '../supabase'

export async function getAgents() {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getAgentByAuthId(authUserId) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('auth_user_id', authUserId)
    .single()
  if (error) throw error
  return data
}

export async function updateAgent(id, changes) {
  const { data, error } = await supabase
    .from('agents')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
