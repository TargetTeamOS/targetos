import { useState, useEffect } from 'react'

// Admin → Connectors: manage Outlook, Google, Zapier, API Nation/Brivity.
// All data flows through /api/connectors (service key) — the browser
// never reads the integrations table directly, so secrets stay server-side.

const ff = "'Inter', -apple-system, sans-serif"

const CARD_META = {
  outlook:   { icon: '📨', blurb: 'Send email from the official Outlook account. Sent mail lands in the real mailbox; TargetOS logs every send on the contact.', kind: 'oauth' },
  google:    { icon: '🟢', blurb: 'Gmail sending + Google Sheets export through the connected Google account.', kind: 'oauth' },
  zapier:    { icon: '⚡', blurb: 'Two-way: automations can push to any Zap (send_webhook action), and Zaps can create contacts or notes here via the inbound URL below.', kind: 'webhook' },
  apination: { icon: '🔄', blurb: 'Brivity and other real-estate systems sync through API Nation. Point the API Nation workflow at the inbound URL below.', kind: 'webhook' },
  display:   { icon: '📺', blurb: 'Office TV board: live accepted offers, pipeline, closings, and agent leaderboard. Open the link below full-screen on any smart TV or Fire Stick browser — no login, no ScreenCloud subscription needed.', kind: 'display' },
  teamchat:  { icon: '📣', blurb: 'Internal notifications to a Slack or Teams channel: new lead, offer accepted, closing soon. Paste an incoming-webhook URL from either platform.', kind: 'teamchat' },
  mailchimp: { icon: '📨', blurb: 'Push contacts into your Mailchimp audience for listing blasts and newsletters. Automations can add contacts with tags; open/click tracking lives in Mailchimp.', kind: 'mailchimp' },
}

function StatusPill({ status }) {
  const map = {
    connected:      { bg: '#DCFCE7', fg: '#166534', label: 'Connected' },
    needs_connect:  { bg: '#FEF9C3', fg: '#854D0E', label: 'Needs connect' },
    not_configured: { bg: '#F1F5F9', fg: '#64748B', label: 'Not configured' },
    error:          { bg: '#FEE2E2', fg: '#991B1B', label: 'Error' },
  }
  const s = map[status] || map.not_configured
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px' }}>
      {s.label}
    </span>
  )
}

const inputStyle = { padding: '7px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '13px', color: '#1E293B', fontFamily: ff, background: '#F8FAFC', outline: 'none', width: '100%' }
const btnStyle = { padding: '7px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }

async function authHeaders() {
  try {
    const { supabase } = await import('../lib/supabase')
    const { data } = await supabase.auth.getSession()
    const token = data && data.session ? data.session.access_token : ''
    return token ? { Authorization: 'Bearer ' + token } : {}
  } catch (e) { return {} }
}

export function ConnectorsPanel() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [draft, setDraft] = useState({})   // { [id]: { client_id, client_secret } }
  const [secretShown, setSecretShown] = useState({}) // { [id]: 'the-secret' }
  const [copied, setCopied] = useState('')

  async function load() {
    try {
      const h = await authHeaders()
      const r = await fetch('/api/connectors', { headers: h })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'load failed')
      setRows(j.integrations || [])
      setErr('')
    } catch (e) {
      setErr(e.message + ' — if this says the table is missing, run sql/connectors.sql in Supabase first.')
      setRows([])
    }
  }
  useEffect(() => { load() }, [])

  async function post(payload) {
    const h = await authHeaders()
    const r = await fetch('/api/connectors', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, h),
      body: JSON.stringify(payload),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || 'request failed')
    return j
  }

  async function saveCreds(id) {
    const d = draft[id] || {}
    setBusy(id)
    try {
      await post({ action: 'save_credentials', id, client_id: d.client_id, client_secret: d.client_secret })
      setDraft(prev => Object.assign({}, prev, { [id]: {} }))
      await load()
    } catch (e) { setErr(e.message) }
    setBusy('')
  }

  async function disconnect(id) {
    setBusy(id)
    try { await post({ action: 'disconnect', id }); await load() } catch (e) { setErr(e.message) }
    setBusy('')
  }

  async function revealSecret(id) {
    setBusy(id)
    try {
      const j = await post({ action: 'reveal_webhook_secret', id })
      setSecretShown(prev => Object.assign({}, prev, { [id]: j.webhook_secret || '(none — run sql/connectors.sql)' }))
    } catch (e) { setErr(e.message) }
    setBusy('')
  }

  function copy(txt, tag) {
    try { navigator.clipboard.writeText(txt); setCopied(tag); setTimeout(() => setCopied(''), 1500) } catch (e) { /* no-op */ }
  }

  if (rows === null) return <div style={{ padding: '20px', color: '#64748B', fontFamily: ff, fontSize: '13px' }}>Loading connectors…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
      {err && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontFamily: ff }}>
          {err}
        </div>
      )}
      {rows.map(row => {
        const meta = CARD_META[row.id] || { icon: '🔌', blurb: '', kind: 'webhook' }
        const d = draft[row.id] || {}
        const account = row.config && row.config.account_email
        return (
          <div key={row.id} style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 18px', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '20px' }}>{meta.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#0F172A', fontFamily: ff }}>{row.name}</span>
              <StatusPill status={row.status} />
              {account ? <span style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>({account})</span> : null}
            </div>
            <div style={{ fontSize: '13px', color: '#475569', fontFamily: ff, marginBottom: '12px', lineHeight: 1.5 }}>{meta.blurb}</div>
            {row.last_error ? (
              <div style={{ fontSize: '12px', color: '#991B1B', fontFamily: ff, marginBottom: '10px' }}>Last error: {row.last_error}</div>
            ) : null}

            {meta.kind === 'oauth' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    value={d.client_id || ''}
                    onChange={e => setDraft(prev => Object.assign({}, prev, { [row.id]: Object.assign({}, d, { client_id: e.target.value }) }))}
                    placeholder={row.config && row.config.client_id ? 'Client ID saved ✓ (paste to replace)' : 'Client ID'}
                    style={inputStyle}
                  />
                  <input
                    type="password"
                    value={d.client_secret || ''}
                    onChange={e => setDraft(prev => Object.assign({}, prev, { [row.id]: Object.assign({}, d, { client_secret: e.target.value }) }))}
                    placeholder="Client Secret"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => saveCreds(row.id)}
                    disabled={busy === row.id || (!d.client_id && !d.client_secret)}
                    style={Object.assign({}, btnStyle, { background: '#0F172A', color: '#fff', opacity: busy === row.id ? 0.6 : 1 })}
                  >Save credentials</button>
                  {row.status !== 'not_configured' && (
                    <button
                      onClick={() => { window.location.href = '/api/oauth-' + (row.id === 'outlook' ? 'microsoft' : 'google') + '?step=start' }}
                      style={Object.assign({}, btnStyle, { background: '#2563EB', color: '#fff' })}
                    >{row.status === 'connected' ? 'Reconnect' : 'Connect account'}</button>
                  )}
                  {row.status === 'connected' && (
                    <button onClick={() => disconnect(row.id)} disabled={busy === row.id}
                      style={Object.assign({}, btnStyle, { background: '#F1F5F9', color: '#334155' })}
                    >Disconnect</button>
                  )}
                </div>
              </div>
            )}

            {meta.kind === 'display' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {secretShown[row.id] ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input readOnly value={window.location.origin + '/tv?token=' + secretShown[row.id]} style={Object.assign({}, inputStyle, { color: '#475569' })} />
                    <button onClick={() => copy(window.location.origin + '/tv?token=' + secretShown[row.id], row.id + '-url')}
                      style={Object.assign({}, btnStyle, { background: '#0F172A', color: '#fff', whiteSpace: 'nowrap' })}
                    >{copied === row.id + '-url' ? 'Copied ✓' : 'Copy TV link'}</button>
                  </div>
                ) : (
                  <button onClick={() => revealSecret(row.id)} disabled={busy === row.id}
                    style={Object.assign({}, btnStyle, { background: '#2563EB', color: '#fff', alignSelf: 'flex-start' })}
                  >Show TV link</button>
                )}
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>
                  Anyone with this link can see deal addresses and team stats (no client names). Keep it internal.
                </div>
              </div>
            )}

            {meta.kind === 'teamchat' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="password"
                  value={d.webhook_url || ''}
                  onChange={e => setDraft(prev => Object.assign({}, prev, { [row.id]: Object.assign({}, d, { webhook_url: e.target.value }) }))}
                  placeholder={row.status === 'connected' ? 'Webhook saved ✓ (paste to replace)' : 'Incoming webhook URL (Slack or Teams)'}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={async () => { setBusy(row.id); try { await post({ action: 'save_credentials', id: row.id, webhook_url: d.webhook_url }); setDraft(prev => Object.assign({}, prev, { [row.id]: {} })); await load() } catch (e) { setErr(e.message) } setBusy('') }}
                    disabled={busy === row.id || !d.webhook_url}
                    style={Object.assign({}, btnStyle, { background: '#0F172A', color: '#fff' })}>Save</button>
                  {row.status === 'connected' && (
                    <button onClick={async () => { setBusy(row.id); try { await post({ action: 'teamchat_test', id: row.id }); setErr('') } catch (e) { setErr(e.message) } setBusy('') }}
                      disabled={busy === row.id}
                      style={Object.assign({}, btnStyle, { background: '#2563EB', color: '#fff' })}>Send test message</button>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>
                  Slack: channel → Integrations → Incoming Webhooks. Teams: channel → Connectors → Incoming Webhook. Then use the "Post to Slack/Teams" action in any automation.
                </div>
              </div>
            )}

            {meta.kind === 'mailchimp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    value={d.api_key || ''}
                    onChange={e => setDraft(prev => Object.assign({}, prev, { [row.id]: Object.assign({}, d, { api_key: e.target.value }) }))}
                    placeholder={row.status === 'connected' ? 'API key saved ✓' : 'Mailchimp API key (ends in -us21 etc.)'}
                    style={inputStyle}
                  />
                  <input
                    value={d.audience_id !== undefined ? d.audience_id : (row.config && row.config.audience_id) || ''}
                    onChange={e => setDraft(prev => Object.assign({}, prev, { [row.id]: Object.assign({}, d, { audience_id: e.target.value }) }))}
                    placeholder="Audience ID"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={async () => { setBusy(row.id); try { await post({ action: 'save_credentials', id: row.id, api_key: d.api_key, audience_id: d.audience_id }); setDraft(prev => Object.assign({}, prev, { [row.id]: {} })); await load() } catch (e) { setErr(e.message) } setBusy('') }}
                    disabled={busy === row.id || (!d.api_key && d.audience_id === undefined)}
                    style={Object.assign({}, btnStyle, { background: '#0F172A', color: '#fff' })}>Save</button>
                  {row.status === 'connected' && (
                    <button onClick={async () => {
                      setBusy(row.id)
                      try {
                        const h = await authHeaders()
                        const r = await fetch('/api/mailchimp-sync', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ action: 'sync_all' }) })
                        const j = await r.json()
                        if (!r.ok) throw new Error(j.error || 'sync failed')
                        setErr('')
                        alert('Mailchimp sync: ' + j.synced + ' contacts synced' + (j.failed ? ', ' + j.failed + ' failed' : ''))
                      } catch (e) { setErr(e.message) }
                      setBusy('')
                    }} disabled={busy === row.id}
                      style={Object.assign({}, btnStyle, { background: '#2563EB', color: '#fff' })}>{busy === row.id ? 'Syncing…' : 'Sync all contacts'}</button>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>
                  Mailchimp → Account → Extras → API keys. Audience ID: Audience → Settings → "Audience name and defaults". Contacts get the tag "TargetOS".
                </div>
              </div>
            )}

            {meta.kind === 'webhook' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input readOnly value={row.inbound_url || ''} style={Object.assign({}, inputStyle, { color: '#475569' })} />
                  <button onClick={() => copy(row.inbound_url || '', row.id + '-url')}
                    style={Object.assign({}, btnStyle, { background: '#0F172A', color: '#fff', whiteSpace: 'nowrap' })}
                  >{copied === row.id + '-url' ? 'Copied ✓' : 'Copy URL'}</button>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input readOnly value={secretShown[row.id] || '••••••••••••••••'} style={Object.assign({}, inputStyle, { color: '#475569' })} />
                  {secretShown[row.id]
                    ? <button onClick={() => copy(secretShown[row.id], row.id + '-sec')}
                        style={Object.assign({}, btnStyle, { background: '#0F172A', color: '#fff', whiteSpace: 'nowrap' })}
                      >{copied === row.id + '-sec' ? 'Copied ✓' : 'Copy secret'}</button>
                    : <button onClick={() => revealSecret(row.id)} disabled={busy === row.id}
                        style={Object.assign({}, btnStyle, { background: '#F1F5F9', color: '#334155', whiteSpace: 'nowrap' })}
                      >Reveal secret</button>}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', fontFamily: ff }}>
                  In Zapier/API Nation: POST JSON to the URL with header <b>X-Webhook-Secret</b> set to the secret.
                  Events: <b>contact.create</b> (name, email, phone, source) and <b>note.add</b> (contact_email, text).
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
