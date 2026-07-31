export function requireBrowserSupabaseConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim()

  if (!url || !key) {
    throw new Error(
      'TargetOS configuration error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required',
    )
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.origin !== url) throw new Error('invalid origin')
  } catch {
    throw new Error('TargetOS configuration error: VITE_SUPABASE_URL must be an exact HTTPS origin')
  }

  return { url, key }
}
