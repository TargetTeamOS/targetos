import { createClient } from '@supabase/supabase-js'
import { requireBrowserSupabaseConfig } from './supabaseConfig'

const { url, key } = requireBrowserSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

export const supabase = createClient(url, key, {
  realtime: { params: { eventsPerSecond: 10 } },
  auth: { persistSession: true, autoRefreshToken: true }
})
