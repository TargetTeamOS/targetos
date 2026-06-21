import { supabase } from '../supabase'
export async function getBriefingPrefs(agentId) {
  const { data, error } = await supabase.from('briefing_prefs').select('*').eq('agent_id', agentId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
export async function upsertBriefingPrefs(prefs) {
  const { data, error } = await supabase.from('briefing_prefs').upsert(prefs, { onConflict: 'agent_id' }).select().single()
  if (error) throw error; return data
}
