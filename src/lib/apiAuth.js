// ═══════════════════════════════════════════════════════════════
// authFetch — fetch that attaches the logged-in user's Supabase
// token so protected API endpoints (send-sms, send-email,
// twilio-token, twilio-outbound, ai-assistant, generate-offer-pdf,
// twilio-recording-proxy) accept the call. Merges headers, never
// clobbers Content-Type.
// ═══════════════════════════════════════════════════════════════
import { supabase } from './supabase'

export async function authFetch(url, opts = {}) {
  let token = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token || null
  } catch { /* not logged in */ }
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  })
}
