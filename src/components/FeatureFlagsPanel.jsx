// Admin → Features: kill switches + per-agent access for every
// gated feature. Backed by the feature_flags table (RLS: admin-write).
// Missing table degrades to an explanatory message — never crashes.
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { invalidateFlags } from '../lib/features'

const ff = 'Inter,system-ui,sans-serif'

export function FeatureFlagsPanel({ agents = [] }) {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const activeAgents = agents.filter(a => a.active !== false)

  async function load() {
    try {
      const { data, error } = await supabase.from('feature_flags').select('*').order('label')
      if (error) throw error
      setRows(data || [])
    } catch (e) { setErr(e.message); setRows([]) }
  }
  useEffect(() => { load() }, [])

  async function save(key, patch) {
    try {
      const { error } = await supabase.from('feature_flags')
        .update({ ...patch, updated_by: agent?.id || null, updated_at: new Date().toISOString() })
        .eq('key', key)
      if (error) throw error
      invalidateFlags()
      setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r))
      toast('Saved', '#10B981')
    } catch (e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  function toggleAgent(row, agentId) {
    const cur = Array.isArray(row.allowed_agent_ids) ? row.allowed_agent_ids : []
    const next = cur.includes(agentId) ? cur.filter(x => x !== agentId) : [...cur, agentId]
    save(row.key, { allowed_agent_ids: next.length ? next : null })
  }

  if (rows === null) return <div style={{ padding: 20, color: 'var(--muted)', fontFamily: ff }}>Loading…</div>
  if (err) return (
    <div style={{ padding: 20, fontFamily: ff, color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
      Feature flags table not found ({err}).<br />
      Run <code>sql/feature_flags.sql</code> in the Supabase SQL editor to enable this panel.
      Until then, all features behave as built (fail-open by design — nothing is broken).
    </div>
  )

  return (
    <div style={{ fontFamily: ff }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Kill switches and access control for gated features. <strong>Off</strong> hides the feature and blocks its API for everyone except admins.
        With no agents selected, an enabled feature is available to <strong>everyone</strong>; selecting agents restricts it to <strong>only them</strong>. Admins always have access.
      </div>
      {rows.map(row => {
        const allow = Array.isArray(row.allowed_agent_ids) ? row.allowed_agent_ids : []
        return (
          <div key={row.key} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{row.label}</div>
                {row.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{row.description}</div>}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: row.enabled ? '#10B981' : 'var(--muted)', fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!row.enabled} onChange={e => save(row.key, { enabled: e.target.checked })} />
                {row.enabled ? 'ON' : 'OFF'}
              </label>
            </div>
            {row.enabled && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                  Access: {allow.length === 0 ? 'everyone' : allow.length + ' selected agent' + (allow.length === 1 ? '' : 's')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeAgents.map(a => {
                    const sel = allow.includes(a.id)
                    return (
                      <button key={a.id} onClick={() => toggleAgent(row, a.id)}
                        style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                          border: '1px solid ' + (sel ? 'var(--brand)' : 'var(--border)'),
                          background: sel ? 'rgba(204,34,0,.1)' : 'transparent',
                          color: sel ? 'var(--brand)' : 'var(--muted)' }}>
                        {sel ? '✓ ' : ''}{a.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
