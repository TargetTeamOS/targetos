import { createClient } from '@supabase/supabase-js'

const URL = 'https://sgrnyvdsyahmypibjarx.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncm55dmRzeWFobXlwaWJqYXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NjY3MzQsImV4cCI6MjA2MzM0MjczNH0.Q3d8EUVN9MFXL-GluEKQHjnXTRHvMJgXp9tFBbMFaOM'

export const supabase = createClient(URL, KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})
