import { useState, useEffect } from 'react'
import { authFetch } from '../lib/apiAuth'

// Real contact-scoped automations: lists what's ACTIVE on this contact
// with a green "Running" badge, lets admin/secretary apply any enabled
// automation or stop a running one. Replaces the old hardcoded fake
// "Apply" buttons that just navigated away.
const ff = 'Inter, system-ui, sans-serif'

export function ContactAutomations({ contactId, canManage, toast, onRefreshTimeline }) {
  const [active, setActive] = useState([])
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [picking, setPicking] = useState(false)

  async function load() {
    try {
      const r = await authFetch('/api/contact-automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', contact_id: contactId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'load failed')
      setActive(d.active || []); setAvailable(d.available || [])
    } catch (e) { toast?.('Automations: ' + e.message, '#DC2626') }
    setLoading(false)
  }
  useEffect(() => { if (contactId) load() }, [contactId])

  async function apply(automation_id) {
    setBusy(automation_id)
    try {
      const r = await authFetch('/api/contact-automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', contact_id: contactId, automation_id }),
      })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'apply failed')
      toast?.('⚡ Automation applied'); setPicking(false); await load(); onRefreshTimeline?.()
    } catch (e) { toast?.(e.message, '#DC2626') }
    setBusy('')
  }

  async function stop(automation_id) {
    setBusy(automation_id)
    try {
      await authFetch('/api/contact-automations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', contact_id: contactId, automation_id }),
      })
      await load()
    } catch (e) { toast?.(e.message, '#DC2626') }
    setBusy('')
  }

  const activeIds = new Set(active.map(a => a.automation_id))
  const appliable = available.filter(a => !activeIds.has(a.id))

  if (loading) return <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: ff }}>Loading automations…</div>

  return (
    <div>
      {active.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5, fontFamily: ff }}>
          No automations running on this contact yet.
        </div>
      )}
      {active.map(a => (
        <div key={a.id} style={{ padding: '8px 10px', background: 'rgba(0,200,117,.06)', borderRadius: 7, border: '1px solid rgba(0,200,117,.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00c875', flexShrink: 0, animation: 'pulse 1.6s infinite' }} />
              {a.automations ? a.automations.name : 'Automation'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
              Running · applied {a.applied_at ? new Date(a.applied_at).toLocaleDateString() : ''}
            </div>
          </div>
          {canManage && (
            <button onClick={() => stop(a.automation_id)} disabled={busy === a.automation_id}
              style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: ff, flexShrink: 0 }}>
              Stop
            </button>
          )}
        </div>
      ))}

      {canManage && (
        picking ? (
          <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, fontFamily: ff }}>Apply an automation:</div>
            {appliable.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: ff }}>All enabled automations are already applied.</div>}
            {appliable.map(a => (
              <button key={a.id} onClick={() => apply(a.id)} disabled={busy === a.id}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--dim)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: ff, marginBottom: 4 }}>
                {a.name} <span style={{ color: 'var(--muted)', fontSize: 10 }}>· {a.trigger_type}</span>
              </button>
            ))}
            <button onClick={() => setPicking(false)} style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', fontFamily: ff }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setPicking(true)}
            style={{ marginTop: 4, width: '100%', padding: '8px', borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
            + Apply automation
          </button>
        )
      )}
      <style>{'@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }'}</style>
    </div>
  )
}
