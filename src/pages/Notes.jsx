// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Notes Page
// Standalone timestamped notes on any record.
// Notes are never deletable by agents — only admins.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { fmtDateTime, initials } from '../lib/utils'
import { Avatar, PageHeader, Btn, Field, Textarea, Select, SearchInput, Loading, Empty, Pill, Confirm } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const NOTE_TYPES = [
  { value: 'general',  label: 'General',     color: '#3B82F6' },
  { value: 'call',     label: 'Call Note',   color: '#10B981' },
  { value: 'meeting',  label: 'Meeting',     color: '#8B5CF6' },
  { value: 'followup', label: 'Follow Up',   color: '#F97316' },
  { value: 'important',label: 'Important',   color: '#DC2626' },
]

async function fetchNotes(agentId, isAdmin) {
  let q = supabase.from('audit_log')
    .select('*, agents(id,name,color)')
    .eq('action', 'note')
    .order('created_at', { ascending: false })
    .limit(200)
  if (!isAdmin) q = q.eq('agent_id', agentId)
  const { data } = await q
  return data || []
}

async function saveNote(agentId, body, noteType, linkedTable, linkedId) {
  return supabase.from('audit_log').insert({
    agent_id:   agentId,
    table_name: linkedTable || 'notes',
    record_id:  linkedId   || '00000000-0000-0000-0000-000000000000',
    action:     'note',
    field_name: noteType || 'general',
    new_value:  body,
    metadata:   { description: body.slice(0, 100), type: noteType },
    created_at: new Date().toISOString(),
  })
}

export function Notes() {
  const navigate = useNavigate()
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()

  const [notes,   setNotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [body,    setBody]    = useState('')
  const [type,    setType]    = useState('general')
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [filterType, setFilterType] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await fetchNotes(agent?.id, isAdmin)
    setNotes(data)
    setLoading(false)
  }

  async function addNote() {
    if (!body.trim()) { toast('Write something first', '#DC2626'); return }
    setSaving(true)
    try {
      await saveNote(agent.id, body, type, null, null)
      setBody('')
      toast('✅ Note saved')
      await load()
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  const filtered = notes.filter(n => {
    if (filterType && n.field_name !== filterType) return false
    if (search && !n.new_value?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const typeColor = (t) => NOTE_TYPES.find(x => x.value === t)?.color || '#3B82F6'
  const typeLabel = (t) => NOTE_TYPES.find(x => x.value === t)?.label || t

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader title="Notes" sub={`${notes.length} notes logged`} />

      {/* Add Note */}
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <Select value={type} onChange={setType} options={NOTE_TYPES} style={{ width: '160px', flex: 'none' }} />
        </div>
        <Textarea value={body} onChange={setBody} placeholder="Write a note..." rows={3} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <Btn onClick={addNote} loading={saving}>Save Note</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search notes..." style={{ flex: 1 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Types</option>
          {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="📝" title="No notes yet" sub="Add your first note above." />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map(n => (
          <div key={n.id} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px', borderLeft: `4px solid ${typeColor(n.field_name)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Avatar agent={n.agents} size={26} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{n.agents?.name || 'Unknown'}</span>
                <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>{fmtDateTime(n.created_at)}</span>
              </div>
              <Pill label={typeLabel(n.field_name)} color={typeColor(n.field_name)} />
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.new_value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
