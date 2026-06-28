import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://sgrnyvdsyahmypibjarx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_L4MNs2GuBFnmyNKgiIGBMg_nNxeaLkE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
  auth: { persistSession: true, autoRefreshToken: true }
})
