import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

// Settings → "My Email Accounts": ANY agent connects their own
// Outlook or Gmail here. Their sends then go out from their own
// mailbox; the office account (Admin → Connectors) is the fallback.

const ff = "'Inter', -apple-system, sans-serif"
const btn = { padding: '7px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }

const PROVIDERS = [
  { id: 'outlook', label: 'Outlook', icon: '📨', oauth: '/api/oauth-microsoft' },
  { id: 'google',  label: 'Gmail',   icon: '🟢', oauth: '/api/oauth-google' },
]

export function MyEmailAccounts() {
  const { agent } = useAuth()
  const [accounts, setAccounts] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  async function authHeaders() {
    try {
      const { supabase } = await import('../lib/supabase')
      const { data } = await supabase.auth.getSession()
      const token = data && data.session ? data.session.access_token : ''
      return token ? { Authorization: 'Bearer ' + token } : {}
    } catch (e) { return {} }
  }

  async function load() {
    if (!agent) return
    try {
      const h = await authHeaders()
      const r = await fetch('/api/connectors', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ action: 'my_accounts', agent_id: agent.id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'load failed')
      setAccounts(j.accounts || [])
      setErr('')
    } catch (e) { setErr(e.message); setAccounts([]) }
  }
  useEffect(() => { load() }, [agent && agent.id])

  async function disconnect(provider) {
    setBusy(provider)
    try {
      const h = await authHeaders()
      const r = await fetch('/api/connectors', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: JSON.stringify({ action: 'disconnect_my_account', agent_id: agent.id, provider }),
      })
      if (!r.ok) { const j = await r.json(); throw new Error(j.error || 'disconnect failed') }
      await load()
    } catch (e) { setErr(e.message) }
    setBusy('')
  }

  if (!agent) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
      <div style={{ fontSize: '13px', color: '#475569', fontFamily: ff, lineHeight: 1.5 }}>
        Connect your own email account. Emails you send from TargetOS will come from your
        real mailbox (and appear in its Sent folder), while tracking stays on the contact here.
      </div>
      {err && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontFamily: ff }}>{err}</div>
      )}
      {PROVIDERS.map(p => {
        const acct = (accounts || []).find(a => a.provider === p.id)
        const connected = acct && acct.status === 'connected'
        return (
          <div key={p.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>{p.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A', fontFamily: ff }}>{p.label}</div>
              <div style={{ fontSize: '12px', color: connected ? '#166534' : '#64748B', fontFamily: ff }}>
                {connected ? 'Connected — ' + (acct.account_email || 'account linked') : (acct && acct.status === 'error' ? 'Error: ' + (acct.last_error || 'reconnect needed') : 'Not connected')}
              </div>
            </div>
            {connected ? (
              <button onClick={() => disconnect(p.id)} disabled={busy === p.id}
                style={Object.assign({}, btn, { background: '#F1F5F9', color: '#334155' })}>Disconnect</button>
            ) : (
              <button onClick={() => { window.location.href = p.oauth + '?step=start&agent_id=' + agent.id }}
                style={Object.assign({}, btn, { background: '#2563EB', color: '#fff' })}>Connect</button>
            )}
          </div>
        )
      })}
      <div style={{ fontSize: '12px', color: '#94A3B8', fontFamily: ff }}>
        If the Connect button shows a credentials error, the admin hasn't finished the one-time
        Microsoft/Google app setup in Admin → Connectors yet.
      </div>
    </div>
  )
}
