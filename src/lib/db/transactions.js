import { supabase } from '../supabase'
export async function getTransactions({ agentId, status } = {}) {
  let q = supabase.from('transactions').select('*').order('created_at', { ascending: false })
  if (agentId) q = q.eq('agent_id', agentId)
  if (status)  q = q.eq('status', status)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createTransaction(t) {
  const { data, error } = await supabase.from('transactions').insert([t]).select().single()
  if (error) throw error; return data
}
export async function updateTransaction(id, changes) {
  const { data, error } = await supabase.from('transactions').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw error
}
