// ═══════════════════════════════════════════════════════════════
// ContactPicker — search the Contacts board or quick-add a new
// contact inline. Used anywhere a record needs to reference a person
// (TC participants, photographers, etc.). New contacts go through
// db.contacts.create, so audit logging and automations fire normally
// and the person shows up on the Contacts board immediately.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { Btn } from './UI'

const contactName = c => ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || c.email || c.phone || 'Unnamed'

export default function ContactPicker({ onSelect, placeholder = 'Search contacts…', agentId = null }) {
  const [q, setQ]           = useState('')
  const [results, setResults] = useState([])
  const [openList, setOpenList] = useState(false)
  const [adding, setAdding]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const timer = useRef(null)

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const like = '%' + q.replace(/[%_]/g, '') + '%'
        const { data } = await supabase
          .from('contacts')
          .select('id, first_name, last_name, email, phone')
          .or('first_name.ilike.' + like + ',last_name.ilike.' + like + ',email.ilike.' + like + ',phone.ilike.' + like)
          .limit(8)
        setResults(data || [])
        setOpenList(true)
      } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q])

  function pick(c) {
    setQ(''); setResults([]); setOpenList(false)
    onSelect(c)
  }

  async function quickAdd() {
    if (!form.first_name && !form.last_name && !form.email && !form.phone) return
    setSaving(true)
    try {
      const created = await db.contacts.create({
        first_name: form.first_name, last_name: form.last_name,
        email: form.email, phone: form.phone,
        status: 'New', source: 'TC Board',
        agent_id: agentId || null,
        created_at: new Date().toISOString(),
      })
      setAdding(false)
      setForm({ first_name: '', last_name: '', email: '', phone: '' })
      pick(created)
    } catch (e) {
      alert('Could not add contact: ' + (e.message || 'unknown error'))
    } finally { setSaving(false) }
  }

  const inp = { width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)' }

  return (
    <div style={{ position: 'relative' }}>
      {!adding && (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={inp} value={q} placeholder={placeholder}
                   onChange={e => setQ(e.target.value)}
                   onFocus={() => q.length >= 2 && setOpenList(true)} />
            <Btn variant="secondary" onClick={() => { setAdding(true); setOpenList(false) }}>+ New</Btn>
          </div>
          {openList && results.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4,
                          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                          boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 240, overflowY: 'auto' }}>
              {results.map(c => (
                <div key={c.id} onClick={() => pick(c)}
                     style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{contactName(c)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              ))}
            </div>
          )}
          {openList && q.length >= 2 && results.length === 0 && (
            <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4,
                          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                          padding: '8px 10px', fontSize: 13, color: 'var(--text-muted)' }}>
              No matches — use “+ New” to add them to the Contacts board.
            </div>
          )}
        </>
      )}

      {adding && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input style={inp} placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            <input style={inp} placeholder="Last name"  value={form.last_name}  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <input style={inp} placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input style={inp} placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Btn variant="secondary" onClick={() => setAdding(false)}>Cancel</Btn>
            <Btn onClick={quickAdd} disabled={saving}>{saving ? 'Adding…' : 'Add to Contacts'}</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

export { contactName }
