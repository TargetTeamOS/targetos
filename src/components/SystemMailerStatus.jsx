// SystemMailerStatus — small admin badge showing whether the Microsoft
// system mailbox (automated email) is configured, which mailbox it sends
// from, and recent delivery counts. Never displays any secret; it only
// reads /api/system-mailer-status (admin-gated, secret-free).
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function SystemMailerStatus() {
  const [s, setS] = useState(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/system-mailer-status', {
          headers: { ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}) },
        })
        if (!res.ok) { if (alive) setS({ error: true }); return }
        const d = await res.json()
        if (alive) setS(d)
      } catch (e) { if (alive) setS({ error: true }) }
    })()
    return () => { alive = false }
  }, [])

  const dot = (color) => ({ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: color, marginRight: 6 })
  return (
    <div style={{ marginTop: 16, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>System mailbox (automated email)</div>
      {s === null
        ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>Checking…</span>
        : s.error
          ? <span style={{ color: 'var(--muted)', fontSize: 12 }}>Status unavailable</span>
          : (
            <div style={{ fontSize: 12 }}>
              <span style={dot(s.configured ? '#16A34A' : '#DC2626')} />
              {s.configured
                ? <>Configured · reminders, briefings &amp; reports send from <b>{s.mailbox}</b></>
                : <>Not configured — set the MICROSOFT_SYSTEM_* environment variables in Vercel</>}
              {s.recent ? <span style={{ color: 'var(--muted)', marginLeft: 8 }}>· recent: {s.recent.sent} sent, {s.recent.error} failed</span> : null}
            </div>
          )}
    </div>
  )
}
