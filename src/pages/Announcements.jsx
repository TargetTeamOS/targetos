// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Announcements Page
// Team announcements with pin support. Admin/secretary only.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAnnouncements } from '../lib/hooks'
import { fmtDateTime } from '../lib/utils'
import { ANNOUNCEMENT_TYPES } from '../lib/constants'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  ModalActions, Loading, Empty, Confirm, Toggle, Avatar
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const BLANK = { title: '', body: '', type: 'info', pinned: false }

export function Announcements() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const { announcements, loading, add, update, remove } = useAnnouncements()

  const [selected,setSelected] = useState(null)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && announcements.length > 0 && urlId !== 'new') {
      const a = announcements.find(x => x.id === urlId)
      if (a) { navigate('/announcements/' + a.id, { replace: true }); setSelected(a); setForm({ ...BLANK, ...a }) }
    }
  }, [urlId, announcements.length])

  function closePanel() {
    setSelected(null)
    navigate('/announcements', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveAnn() {
    if (!form.title.trim()) { toast('Title required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Saved')
      } else {
        await add({ ...form, agent_id: agent?.id })
        toast('✅ Announcement posted')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteAnn() {
    try {
      await remove(selected.id)
      toast('Deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const typeColor = (t) => ANNOUNCEMENT_TYPES.find(x => x.value === t)?.color || '#3B82F6'
  const typeIcon  = (t) => ({ info: 'ℹ️', alert: '⚠️', success: '✅', deal: '🏠' })[t] || 'ℹ️'

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Announcements"
        sub="Team updates and news"
        actions={canManage && <Btn onClick={() => { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); navigate('/announcements/new') }}>+ Post Announcement</Btn>}
      />

      {loading && <Loading />}
      {!loading && announcements.length === 0 && (
        <Empty icon="📣" title="No announcements" sub={canManage ? "Post your first announcement." : "Check back soon."} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {announcements.map(a => (
          <div key={a.id}
            onClick={() => canManage && (navigate('/announcements/' + a.id), setSelected(a), setForm({ ...BLANK, ...a }))}
            style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: "1px solid " + (a.pinned ? typeColor(a.type) + '44' : 'var(--border)'), padding: '18px 20px', cursor: canManage ? 'pointer' : 'default', borderLeft: "4px solid " + (typeColor(a.type)), transition: 'box-shadow .15s' }}
            onMouseEnter={e => { if (canManage) e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>{typeIcon(a.type)}</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{a.title}</div>
                {a.pinned && <Pill label="Pinned" color="#F5A623" />}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0, marginLeft: '12px' }}>{fmtDateTime(a.created_at)}</div>
            </div>
            {a.body && <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.body}</div>}
            {a.agents && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px' }}>
                <Avatar agent={a.agents} size={18} />
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{a.agents.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={!!(selected || urlId === 'new')} onClose={closePanel} title={selected ? 'Edit Announcement' : 'New Announcement'} width={500}>
        <Field label="Title" required>
          <Input value={form.title} onChange={v => set('title', v)} placeholder="Announcement title" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={v => set('type', v)} options={ANNOUNCEMENT_TYPES} />
        </Field>
        <Field label="Message">
          <Textarea value={form.body} onChange={v => set('body', v)} placeholder="Announcement details..." rows={5} />
        </Field>
        <Field label="">
          <Toggle value={form.pinned} onChange={v => set('pinned', v)} label="Pin to top" />
        </Field>
        <ModalActions>
          {selected && <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveAnn} loading={saving}>{selected ? 'Save' : 'Post'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDelete} message="Delete this announcement?" onConfirm={deleteAnn} onCancel={() => setConfirmDelete(false)} />
    </div>
  )
}
