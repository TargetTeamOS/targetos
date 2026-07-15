// ═══════════════════════════════════════════════════════════════
// ContactLayoutEditor — admin control for the contact page's right
// panel: show/hide each section and reorder with up/down. Saves to
// system_settings via contactLayout.js. Lives in Settings → Contact
// Layout (admin only).
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react'
import { Btn } from './UI'
import { CONTACT_PANELS, DEFAULT_CONTACT_LAYOUT, loadContactLayout, saveContactLayout } from '../lib/contactLayout'

export function ContactLayoutEditor({ toast, onChange }) {
  const [layout, setLayout] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadContactLayout(true).then(l => { setLayout(l); onChange && onChange(l) }) }, [])
  if (!layout) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</div>

  const panelById = Object.fromEntries(CONTACT_PANELS.map(p => [p.id, p]))
  const ordered = layout.order.filter(id => panelById[id])

  function apply(next) { setLayout(next); onChange && onChange(next) }
  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= ordered.length) return
    const next = [...ordered]
    ;[next[i], next[j]] = [next[j], next[i]]
    apply({ ...layout, order: next })
  }
  function toggle(id) {
    const hidden = { ...layout.hidden }
    if (hidden[id]) delete hidden[id]; else hidden[id] = true
    apply({ ...layout, hidden })
  }

  async function save() {
    setSaving(true)
    try { await saveContactLayout(layout); toast?.('Contact layout saved — applies to everyone') }
    catch (e) { toast?.('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }
  function reset() { apply(JSON.parse(JSON.stringify(DEFAULT_CONTACT_LAYOUT))) }

  const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: 'var(--panel)' }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        Choose which sections appear on the contact page (right column) and in what order.
        Applies to everyone on the team. Contact info fields on the left are always shown.
      </div>
      {ordered.map((id, i) => {
        const p = panelById[id]
        const shown = !layout.hidden[id]
        return (
          <div key={id} style={{ ...row, opacity: shown ? 1 : 0.55 }}>
            <span style={{ fontSize: 16 }}>{p.icon}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.label}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0}
              style={{ border: '1px solid var(--border)', background: 'var(--dim)', borderRadius: 6, cursor: i === 0 ? 'default' : 'pointer', padding: '2px 8px', color: 'var(--text)', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1}
              style={{ border: '1px solid var(--border)', background: 'var(--dim)', borderRadius: 6, cursor: i === ordered.length - 1 ? 'default' : 'pointer', padding: '2px 8px', color: 'var(--text)', opacity: i === ordered.length - 1 ? 0.3 : 1 }}>↓</button>
            <button onClick={() => toggle(id)}
              style={{ border: 'none', borderRadius: 99, cursor: 'pointer', padding: '4px 12px', fontSize: 11, fontWeight: 700,
                       background: shown ? 'rgba(16,185,129,.15)' : 'var(--dim)', color: shown ? '#10B981' : 'var(--muted)' }}>
              {shown ? '✓ Shown' : 'Hidden'}
            </button>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="secondary" onClick={reset}>Reset to default</Btn>
        <Btn onClick={save} loading={saving}>Save Layout</Btn>
      </div>
    </div>
  )
}
