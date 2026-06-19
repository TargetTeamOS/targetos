import { supabase } from './supabase'

const LS_KEY = 'targetos_briefing_prefs_v2'

export async function loadBriefingPrefs() {
  // 1. Try Supabase first (source of truth)
  try {
    const { data } = await supabase.from('briefing_prefs').select('*')
    if(data?.length) {
      const prefs = {}
      data.forEach(row => {
        prefs[row.agent_name] = { enabled: row.enabled, sections: row.sections }
      })
      // Cache in localStorage
      localStorage.setItem(LS_KEY, JSON.stringify(prefs))
      return prefs
    }
  } catch(e) {}

  // 2. Fall back to localStorage
  try {
    const saved = localStorage.getItem(LS_KEY)
    if(saved) return JSON.parse(saved)
  } catch(e) {}

  return null
}

export async function saveBriefingPrefs(prefs) {
  // Save to localStorage immediately
  localStorage.setItem(LS_KEY, JSON.stringify(prefs))

  // Save to Supabase
  try {
    const rows = Object.entries(prefs).map(([agent_name, p]) => ({
      agent_name,
      enabled: p.enabled,
      sections: p.sections,
      updated_at: new Date().toISOString()
    }))
    await supabase.from('briefing_prefs').upsert(rows, { onConflict: 'agent_name' })
  } catch(e) {
    console.warn('briefing_prefs DB save failed:', e.message)
  }
}
