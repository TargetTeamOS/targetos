import { supabase } from './supabase'

const LS_KEY = 'targetos_briefing_prefs'

// Load from localStorage first (instant), then sync with Supabase
export async function loadBriefingPrefs() {
  const local = localStorage.getItem(LS_KEY)
  if(local) {
    try { return JSON.parse(local) } catch(e) {}
  }
  // Try Supabase
  const { data } = await supabase.from('briefing_prefs').select('*')
  if(data?.length) {
    const prefs = {}
    data.forEach(row => { prefs[row.agent_name] = { enabled: row.enabled, sections: row.sections } })
    localStorage.setItem(LS_KEY, JSON.stringify(prefs))
    return prefs
  }
  return null
}

export async function saveBriefingPrefs(prefs) {
  // Always save to localStorage immediately
  localStorage.setItem(LS_KEY, JSON.stringify(prefs))
  // Try to save to Supabase (will work once table exists)
  try {
    const rows = Object.entries(prefs).map(([agent_name, p]) => ({
      agent_name,
      enabled: p.enabled,
      sections: p.sections,
      updated_at: new Date().toISOString()
    }))
    await supabase.from('briefing_prefs').upsert(rows, { onConflict: 'agent_name' })
  } catch(e) {
    // Table might not exist yet — localStorage is the fallback
    console.log('Briefing prefs saved to localStorage only')
  }
}
