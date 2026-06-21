import { supabase } from '../supabase'

export async function getAuditLog({ tableName, recordId, agentId, limit = 50 } = {}) {
  let query = supabase
    .from('audit_log')
    .select(`*, agents(name, color)`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (tableName) query = query.eq('table_name', tableName)
  if (recordId)  query = query.eq('record_id', recordId)
  if (agentId)   query = query.eq('agent_id', agentId)

  const { data, error } = await query
  if (error) throw error
  return data
}
