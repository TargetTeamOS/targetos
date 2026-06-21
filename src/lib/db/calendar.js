import { supabase } from '../supabase'
export async function getCalendarEvents({ agentId, startDate, endDate } = {}) {
  let q = supabase.from('calendar_events').select('*').order('start_date').order('start_time')
  if (agentId)   q = q.eq('agent_id', agentId)
  if (startDate) q = q.gte('start_date', startDate)
  if (endDate)   q = q.lte('start_date', endDate)
  const { data, error } = await q; if (error) throw error; return data
}
export async function createCalendarEvent(e) {
  const { data, error } = await supabase.from('calendar_events').insert([e]).select().single()
  if (error) throw error; return data
}
export async function updateCalendarEvent(id, changes) {
  const { data, error } = await supabase.from('calendar_events').update(changes).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteCalendarEvent(id) {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}
