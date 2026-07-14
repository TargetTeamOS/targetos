// TargetOS V2 — Call Diagnostics
// Shows the raw call_events table directly, with zero matching/joining
// to the calls table. Built specifically to remove all ambiguity about
// whether call-event logging is actually happening -- if this page is
// empty, logging genuinely isn't firing. If it has rows, the display
// logic elsewhere has a matching bug, not a logging bug.
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { PageHeader, Loading, Empty } from '../components/UI'

export function CallDiagnostics() {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  function load() {
    setLoading(true)
    supabase.from('call_events').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (error) { setError(error.message); setLoading(false); return }
        setEvents(data || [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <PageHeader title="Call Diagnostics" sub="Raw call_events log — most recent 100, no filtering" />
      <button onClick={load} style={{ marginBottom: 14, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', cursor: 'pointer', fontSize: 13 }}>
        ↻ Refresh
      </button>

      {loading && <Loading />}
      {!loading && error && (
        <div style={{ padding: 16, background: '#FEF2F2', border: '1px solid #DC262644', borderRadius: 10, color: '#DC2626', fontSize: 13 }}>
          Failed to load: {error}
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <Empty icon="📭" title="No call events logged yet" sub="If you've made test calls and nothing shows here, the logging itself isn't firing — not a display/matching issue." />
      )}
      {!loading && !error && events.length > 0 && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--dim)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Time</th>
                <th style={{ padding: '8px 10px' }}>Call SID</th>
                <th style={{ padding: '8px 10px' }}>Step</th>
                <th style={{ padding: '8px 10px' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{new Date(e.created_at).toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{e.call_sid}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{e.step}</td>
                  <td style={{ padding: '8px 10px' }}>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
