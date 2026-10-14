import { createClient } from '@supabase/supabase-js'
import { createSanitizingFetch } from './payloadSanitize'

const SUPABASE_URL = 'https://sgrnyvdsyahmypibjarx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_L4MNs2GuBFnmyNKgiIGBMg_nNxeaLkE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
  auth: { persistSession: true, autoRefreshToken: true },
  // Every insert/update/upsert passes through one sanitizer: an empty
  // string sent to a uuid / numeric / date / timestamp column becomes null
  // instead of failing the whole save. See src/lib/payloadSanitize.js.
  global: { fetch: createSanitizingFetch(SUPABASE_URL) },
})
