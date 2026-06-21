import { supabase } from '../supabase'
export async function getEmailTemplates() {
  const { data, error } = await supabase.from('email_templates').select('*').order('created_at', { ascending: false })
  if (error) throw error; return data
}
export async function createEmailTemplate(t) {
  const { data, error } = await supabase.from('email_templates').insert([t]).select().single()
  if (error) throw error; return data
}
export async function updateEmailTemplate(id, changes) {
  const { data, error } = await supabase.from('email_templates').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error; return data
}
export async function deleteEmailTemplate(id) {
  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) throw error
}
