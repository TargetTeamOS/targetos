// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Contact Detail Page
// Full 3-panel contact profile view.
//
// LEFT PANEL:   All contact details — phone, email, address,
//               status, source, assigned agent, tags, notes
// CENTER PANEL: Conversation timeline — calls, emails sent,
//               SMS, notes, voice captures, all timestamped
// RIGHT PANEL:  Quick actions, related deals, tasks,
//               files, activity log
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { fmtDate, fmtDateTime, fmtPhone, fmt$, initials, phoneHref } from '../lib/utils'
import { CONTACT_STATUSES, CONTACT_SOURCES, TASK_PRIORITIES } from '../lib/constants'
import { FileAttachments } from '../components/FileAttachments'
import {
  Field, Input, Select, Textarea, Btn, Avatar, Pill,
  Loading, Confirm, ModalActions, SectionTitle, Divider,
  Modal, Tabs
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const STATUS_COLORS = {
  New: '#0EA5E9', Hot: '#DC2626', Warm: '#F97316', Cold: '#94A3B8',
  Active: '#10B981', Nurturing: '#8B5CF6', 'Under Contract': '#F5A623',
  Closed: '#225091', Unresponsive: '#6B7280',
}

const TIMELINE_ICONS = {
  call:    { icon: '📞', color: '#10B981', label: 'Call' },
  note:    { icon: '📝', color: '#8B5CF6', label: 'Note' },
  email:   { icon: '📧', color: '#3B82F6', label: 'Email' },
  sms:     { icon: '💬', color: '#F97316', label: 'SMS' },
  voice:   { icon: '🎙', color: '#CC2200', label: 'Voice Capture' },
  status:  { icon: '🔄', color: '#F5A623', label: 'Status Changed' },
  created: { icon: '✨', color: '#10B981', label: 'Contact Created' },
  task:    { icon: '✅', color: '#6366F1', label: 'Task' },
  file:    { icon: '📎', color: '#14B8A6', label: 'File Attached' },
  meeting: { icon: '🤝', color: '#EC4899', label: 'Meeting' },
}

// ── TIMELINE ITEM ─────────────────────────────────────────────────
function TimelineItem({ item }) {
  const t = TIMELINE_ICONS[item.type] || { icon: '•', color: '#94A3B8', label: item.type }
  return (
    <div style={{ display: 'flex', gap: '12px', paddingBottom: '16px', position: 'relative' }}>
      {/* Line */}
      <div style={{ position: 'absolute', left: '15px', top: '28px', bottom: 0, width: '2px', background: 'var(--border)' }} />
      {/* Icon */}
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: t.color + '18', border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0, zIndex: 1, background: 'var(--panel)' }}>
        {t.icon}
      </div>
      {/* Content */}
      <div style={{ flex: 1, background: 'var(--dim)', borderRadius: '10px', padding: '10px 14px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: t.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t.label}</span>
            {item.agent && (
              <>
                <span style={{ color: 'var(--border)', fontSize: '10px' }}>·</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Avatar agent={item.agent} size={16} />
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{item.agent.name}</span>
                </div>
              </>
            )}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{fmtDateTime(item.created_at)}</span>
        </div>
        {item.title && <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{item.title}</div>}
        {item.body && <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.body}</div>}
        {item.meta && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{item.meta}</div>}
        {item.link && (
          <a href={item.link} style={{ fontSize: '12px', color: 'var(--brand)', textDecoration: 'none', marginTop: '4px', display: 'block' }}>
            View details →
          </a>
        )}
      </div>
    </div>
  )
}

// ── ADD TO TIMELINE FORM ──────────────────────────────────────────
function AddTimelineItem({ contactId, agentId, onAdded }) {
  const [type,    setType]    = useState('note')
  const [body,    setBody]    = useState('')
  const [title,   setTitle]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const { toast } = useApp()

  const TYPES = [
    { value: 'note',    label: '📝 Note' },
    { value: 'call',    label: '📞 Call' },
    { value: 'email',   label: '📧 Email' },
    { value: 'sms',     label: '💬 SMS' },
    { value: 'meeting', label: '🤝 Meeting' },
  ]

  async function save() {
    if (!body.trim() && !title.trim()) { toast('Write something first', '#DC2626'); return }
    setSaving(true)
    try {
      // Save as call log if type is call
      if (type === 'call') {
        await db.calls.create({
          agent_id:     agentId,
          contact_id:   contactId,
          contact_name: title,
          notes:        body,
          direction:    'Outbound',
          outcome:      '',
          called_at:    new Date().toISOString(),
        })
      } else {
        // Save as audit log note with contact linked
        await supabase.from('audit_log').insert({
          agent_id:   agentId,
          table_name: 'contacts',
          record_id:  contactId,
          action:     'note',
          field_name: type,
          new_value:  body,
          metadata:   { description: title || body.slice(0, 80), type },
          created_at: new Date().toISOString(),
        })
      }
      setBody('')
      setTitle('')
      toast('✅ Saved to timeline')
      onAdded?.()
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        {TYPES.map(t => (
          <button key={t.value} onClick={() => setType(t.value)}
            style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${type === t.value ? 'var(--brand)' : 'var(--border)'}`, background: type === t.value ? 'rgba(204,34,0,.08)' : 'transparent', color: type === t.value ? 'var(--brand)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
            {t.label}
          </button>
        ))}
      </div>
      {type !== 'note' && (
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'call' ? 'Contact name / outcome' : 'Subject / title'}
          style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, marginBottom: '8px', boxSizing: 'border-box' }} />
      )}
      <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={type === 'call' ? 'Call notes...' : type === 'email' ? 'Email summary...' : type === 'sms' ? 'Message content...' : 'Write a note...'}
        rows={3}
        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={save} loading={saving} size="sm">Save to Timeline</Btn>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN CONTACT DETAIL PAGE
// ════════════════════════════════════════════════════════════════
export function ContactDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const [contact,    setContact]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [timeline,   setTimeline]   = useState([])
  const [tlLoading,  setTlLoading]  = useState(true)
  const [relDeals,   setRelDeals]   = useState([])
  const [relTasks,   setRelTasks]   = useState([])
  const [agents,     setAgents]     = useState([])
  const [editing,    setEditing]    = useState(false)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [rightTab,   setRightTab]   = useState('deals')

  // ── LOAD CONTACT ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    loadContact()
    loadTimeline()
    loadRelated()
    db.agents.list().then(setAgents)
  }, [id])

  async function loadContact() {
    setLoading(true)
    try {
      const c = await db.contacts.get(id)
      setContact(c)
      setForm(c)
    } catch(e) {
      toast('Contact not found', '#DC2626')
      navigate('/contacts')
    } finally { setLoading(false) }
  }

  // ── BUILD TIMELINE FROM MULTIPLE SOURCES ─────────────────────
  async function loadTimeline() {
    setTlLoading(true)
    try {
      const [calls, auditLogs] = await Promise.all([
        supabase.from('calls').select('*, agents(id,name,color)').eq('contact_id', id).order('called_at', { ascending: false }).then(r => r.data || []),
        supabase.from('audit_log').select('*, agents(id,name,color)').eq('record_id', id).order('created_at', { ascending: false }).limit(100).then(r => r.data || []),
      ])

      const items = []

      // Add calls
      calls.forEach(c => {
        items.push({
          id:         c.id,
          type:       'call',
          title:      c.contact_name || 'Call',
          body:       [c.outcome, c.duration ? `Duration: ${c.duration}` : '', c.notes].filter(Boolean).join('\n'),
          agent:      c.agents,
          created_at: c.called_at,
          meta:       `${c.direction || 'Outbound'} call${c.outcome ? ' · ' + c.outcome : ''}`,
        })
      })

      // Add audit log entries
      auditLogs.forEach(a => {
        const typeMap = {
          note:    a.metadata?.type || 'note',
          created: 'created',
          status:  'status',
          updated: null, // skip generic updates
        }
        const type = typeMap[a.action] || a.action
        if (!type || type === null) return
        if (!TIMELINE_ICONS[type]) return // skip unknown types

        items.push({
          id:         a.id,
          type,
          title:      a.action === 'status' ? `Status: ${a.old_value} → ${a.new_value}` : a.metadata?.description || '',
          body:       a.action === 'note' ? a.new_value : '',
          agent:      a.agents,
          created_at: a.created_at,
        })
      })

      // Sort all by date descending
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setTimeline(items)
    } catch(e) {
      console.error('Timeline load error:', e)
    } finally { setTlLoading(false) }
  }

  async function loadRelated() {
    try {
      const [deals, tasks] = await Promise.all([
        supabase.from('deals').select('id,addr,stage,gci,agents(id,name,color)').limit(10).then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date').eq('contact_id', id).order('due_date').then(r => r.data || []),
      ])
      setRelDeals(deals)
      setRelTasks(tasks)
    } catch { /* silently fail */ }
  }

  // ── SAVE CONTACT ─────────────────────────────────────────────
  async function saveContact() {
    setSaving(true)
    try {
      const updated = await db.contacts.update(id, form)
      setContact(updated)
      setEditing(false)
      toast('✅ Contact saved')
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function deleteContact() {
    try {
      await db.contacts.delete(id, agent?.id)
      toast('Contact deleted')
      navigate('/contacts')
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDel(false) }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  if (loading) return <div style={{ fontFamily: ff, padding: '28px' }}><Loading /></div>
  if (!contact) return null

  const statusColor = STATUS_COLORS[contact.status] || '#94A3B8'

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── TOP HEADER BAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/contacts')}
          style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', fontFamily: ff }}>
          ← Contacts
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: statusColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 700 }}>
              {initials((contact.first_name || '') + ' ' + (contact.last_name || ''))}
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                {contact.first_name} {contact.last_name}
              </h1>
              {contact.phone && (
                <a href={phoneHref(contact.phone)} style={{ fontSize: '13px', color: 'var(--brand)', textDecoration: 'none' }}>
                  {fmtPhone(contact.phone)}
                </a>
              )}
            </div>
            <Pill label={contact.status} color={statusColor} size="md" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {contact.phone && (
            <Btn variant="secondary" size="sm" onClick={() => window.open(phoneHref(contact.phone))}>📞 Call</Btn>
          )}
          {contact.email && (
            <Btn variant="secondary" size="sm" onClick={() => window.open('mailto:' + contact.email)}>📧 Email</Btn>
          )}
          <Btn size="sm" onClick={() => setEditing(true)}>✏️ Edit</Btn>
        </div>
      </div>

      {/* ── THREE PANEL LAYOUT ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: '16px', alignItems: 'start' }}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL — Contact Details
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Contact Info Card */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Contact Info
            </div>
            <div style={{ padding: '12px 14px' }}>
              {[
                { label: '📞 Phone',   value: contact.phone ? fmtPhone(contact.phone) : null, href: contact.phone ? phoneHref(contact.phone) : null },
                { label: '📧 Email',   value: contact.email, href: contact.email ? 'mailto:' + contact.email : null },
                { label: '📍 Address', value: [contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(', ') },
                { label: '🏷 Status',  value: contact.status, pill: true, color: statusColor },
                { label: '📌 Source',  value: contact.source },
                { label: '👤 Agent',   value: contact.agents?.name },
                { label: '📅 Added',   value: fmtDate(contact.created_at) },
                { label: '🕐 Last Activity', value: fmtDate(contact.last_activity) },
              ].filter(row => row.value).map(row => (
                <div key={row.label} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' }}>{row.label}</div>
                  {row.href ? (
                    <a href={row.href} style={{ fontSize: '13px', color: 'var(--brand)', textDecoration: 'none', fontWeight: 500 }}>{row.value}</a>
                  ) : row.pill ? (
                    <Pill label={row.value} color={row.color} />
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{row.value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes Card */}
          {contact.notes && (
            <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Notes
              </div>
              <div style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {contact.notes}
              </div>
            </div>
          )}

          {/* Tags */}
          {contact.tags?.length > 0 && (
            <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {contact.tags.map(tag => (
                  <span key={tag} style={{ padding: '3px 8px', background: 'var(--dim)', borderRadius: '99px', fontSize: '11px', color: 'var(--muted)', border: '1px solid var(--border)' }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Status Change */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Quick Update Status</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {['Hot','Warm','Cold','Active','Nurturing','Closed','Unresponsive'].map(s => (
                <button key={s} onClick={async () => {
                  try {
                    const updated = await db.contacts.update(id, { status: s })
                    setContact(updated)
                    setForm(f => ({ ...f, status: s }))
                    toast(`✅ Status → ${s}`)
                    loadTimeline()
                  } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
                }}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${contact.status === s ? STATUS_COLORS[s] : 'var(--border)'}`, background: contact.status === s ? STATUS_COLORS[s] + '18' : 'transparent', color: contact.status === s ? STATUS_COLORS[s] : 'var(--muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            CENTER PANEL — Conversation Timeline
        ══════════════════════════════════════════════════════ */}
        <div>
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>💬 Conversation History</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{timeline.length} entries</div>
            </div>
            <div style={{ padding: '16px' }}>
              {/* Add to timeline */}
              <AddTimelineItem contactId={id} agentId={agent?.id} onAdded={loadTimeline} />

              {/* Timeline */}
              {tlLoading && <Loading />}
              {!tlLoading && timeline.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>💬</div>
                  No conversation history yet.<br />
                  Add a note, call, or email above to start tracking.
                </div>
              )}
              {timeline.map(item => (
                <TimelineItem key={item.id + item.type} item={item} />
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL — Actions, Deals, Tasks, Files
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Quick Actions */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: '✅ Create Task',       onClick: () => navigate('/tasks/new') },
                { label: '📊 Link to Deal',      onClick: () => navigate('/production/new') },
                { label: '📅 Schedule Event',    onClick: () => navigate('/calendar/new') },
                { label: '🎁 Add Gift',          onClick: () => navigate('/gifts/new') },
                { label: '📞 Log Call',          onClick: () => navigate('/calls/new') },
              ].map(a => (
                <button key={a.label} onClick={a.onClick}
                  style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: ff, transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--dim)'}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Related Content Tabs */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {[
                { id: 'deals',  label: `Deals (${relDeals.length})` },
                { id: 'tasks',  label: `Tasks (${relTasks.length})` },
                { id: 'files',  label: 'Files' },
              ].map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)}
                  style={{ flex: 1, padding: '9px 6px', background: 'none', border: 'none', borderBottom: rightTab === t.id ? '2px solid var(--brand)' : '2px solid transparent', marginBottom: '-1px', fontSize: '11px', fontWeight: rightTab === t.id ? 700 : 500, color: rightTab === t.id ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer', fontFamily: ff }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ padding: '12px 14px' }}>

              {/* Deals */}
              {rightTab === 'deals' && (
                <div>
                  {relDeals.length === 0 && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>No deals linked yet</div>}
                  {relDeals.map(d => (
                    <div key={d.id} onClick={() => navigate('/production/' + d.id)}
                      style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '3px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</div>
                        <Pill label={d.stage} color={DEAL_STAGES_MAP[d.stage] || '#94A3B8'} />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate('/production/new')}
                    style={{ width: '100%', marginTop: '8px', padding: '7px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', fontFamily: ff }}>
                    + Link Deal
                  </button>
                </div>
              )}

              {/* Tasks */}
              {rightTab === 'tasks' && (
                <div>
                  {relTasks.length === 0 && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: '12px' }}>No tasks for this contact</div>}
                  {relTasks.map(t => (
                    <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
                      style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.status === 'done' ? '#10B981' : '#F97316', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                        {t.due_date && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(t.due_date)}</div>}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate('/tasks/new')}
                    style={{ width: '100%', marginTop: '8px', padding: '7px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', fontFamily: ff }}>
                    + Add Task
                  </button>
                </div>
              )}

              {/* Files */}
              {rightTab === 'files' && (
                <FileAttachments tableName="contacts" recordId={id} />
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid #FECACA', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Danger Zone</div>
            <Btn variant="danger" size="sm" onClick={() => setConfirmDel(true)} style={{ width: '100%' }}>🗑 Delete Contact</Btn>
          </div>
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit Contact" width={560}>
        <Tabs tabs={['info','notes']} active={form._tab || 'info'} onChange={t => setForm(f => ({ ...f, _tab: t }))} />
        {(!form._tab || form._tab === 'info') && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="First Name" required><Input value={form.first_name || ''} onChange={v => set('first_name', v)} placeholder="John" /></Field>
              <Field label="Last Name"><Input value={form.last_name || ''} onChange={v => set('last_name', v)} placeholder="Smith" /></Field>
              <Field label="Phone"><Input value={form.phone || ''} onChange={v => set('phone', v)} type="tel" placeholder="(845) 555-1234" /></Field>
              <Field label="Email"><Input value={form.email || ''} onChange={v => set('email', v)} type="email" placeholder="john@email.com" /></Field>
            </div>
            <Field label="Address"><Input value={form.address || ''} onChange={v => set('address', v)} placeholder="123 Main St" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="City"><Input value={form.city || ''} onChange={v => set('city', v)} placeholder="Monsey" /></Field>
              <Field label="Zip"><Input value={form.zip || ''} onChange={v => set('zip', v)} placeholder="10952" /></Field>
              <Field label="Status"><Select value={form.status || ''} onChange={v => set('status', v)} options={CONTACT_STATUSES} /></Field>
              <Field label="Source"><Select value={form.source || ''} onChange={v => set('source', v)} options={CONTACT_SOURCES} placeholder="Source" /></Field>
            </div>
            {(isAdmin || canManage) && (
              <Field label="Assigned Agent">
                <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign agent" />
              </Field>
            )}
          </div>
        )}
        {form._tab === 'notes' && (
          <Field label="Notes"><Textarea value={form.notes || ''} onChange={v => set('notes', v)} rows={8} placeholder="Notes about this contact..." /></Field>
        )}
        <ModalActions>
          <Btn variant="secondary" onClick={() => setEditing(false)}>Cancel</Btn>
          <Btn onClick={saveContact} loading={saving}>Save Changes</Btn>
        </ModalActions>
      </Modal>

      <Confirm open={confirmDel} message={`Delete ${contact.first_name} ${contact.last_name || ''}? This cannot be undone.`} onConfirm={deleteContact} onCancel={() => setConfirmDel(false)} />
    </div>
  )
}

// Stage colors for the deals panel
const DEAL_STAGES_MAP = {
  'Negotiations':      '#037f4c',
  'Offer Accapted':    '#00c875',
  'Under Shtar':       '#bb3354',
  'Under Contract':    '#757575',
  'Closed':            '#225091',
  'Deal Fell Through': '#ff007f',
}
