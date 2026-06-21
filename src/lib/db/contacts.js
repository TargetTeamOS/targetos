import { supabase } from '../supabase'

export async function getContacts({ search, status, agentId } = {}) {
  let query = supabase
    .from('contacts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (status)  query = query.eq('status', status)
  if (agentId) query = query.eq('agent_id', agentId)
  if (search)  query = query.or(
    `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
  )

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getContact(id) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createContact(contact) {
  const { data, error } = await supabase
    .from('contacts')
    .insert([contact])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateContact(id, changes) {
  const { data, error } = await supabase
    .from('contacts')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteContact(id) {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}
