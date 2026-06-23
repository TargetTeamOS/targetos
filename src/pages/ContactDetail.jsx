// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Contact Detail Page (Full Rebuild)
//
// LEFT PANEL:   Rich buyer/seller profile — all fields inline
//               editable, buyer criteria, automation rules,
//               full date history
// CENTER PANEL: Conversation timeline
// RIGHT PANEL:  Quick actions, deals, tasks, files
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import {
  fmtDate, fmtDateTime, fmtPhone, fmt$, initials,
  phoneHref, getDaysAgo, getDaysUntil, parseNum, today
} from '../lib/utils'
import { CONTACT_STATUSES, CONTACT_SOURCES, PROPERTY_TYPES, LOCAL_CITIES } from '../lib/constants'
import { FileAttachments } from '../components/FileAttachments'
import { Avatar, Pill, Btn, Loading, Confirm, Field, Input, Select, Textarea, Toggle, Modal, ModalActions, Tabs, Spinner } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const STATUS_COLORS = {
  New: '#0EA5E9', Hot: '#DC2626', Warm: '#F97316', Cold: '#94A3B8',
  Active: '#10B981', Nurturing: '#8B5CF6', 'Under Contract': '#F5A623',
  Closed: '#225091', Unresponsive: '#6B7280',
}
const FINANCING_OPTIONS = ['Cash', 'Conventional', 'FHA', 'VA', 'Hard Money', 'Bridge Loan', 'Unknown']
const TIMELINE_OPTIONS  = ['ASAP', '1-3 months', '3-6 months', '6-12 months', '12+ months', 'Just browsing']
const MOTIVATION_OPTIONS = ['Upsizing', 'Downsizing', 'Relocating', 'Investment', 'First Home', 'Divorce', 'Estate', 'Other']
const LANG_OPTIONS      = ['English', 'Hebrew', 'Yiddish', 'Spanish', 'Russian', 'French', 'Other']
const CONTACT_METHODS   = ['Phone', 'WhatsApp', 'Email', 'SMS', 'In Person']
const FOLLOWUP_TEMPLATES = [
  { value: 'check_in',    label: '👋 General check-in' },
  { value: 'new_listing', label: '🏡 New listing found' },
  { value: 'price_drop',  label: '💰 Price drop alert' },
  { value: 'open_house',  label: '🚪 Open house invite' },
  { value: 'market_update',label: '📊 Market update' },
]

// ── INLINE EDIT FIELD ─────────────────────────────────────────────
function InlineField({ label, value, onChange, type = 'text', options = null, placeholder = '—', multiline = false, prefix = null }) {
  const [editing, setEditing]   = useState(false)
  const [draft,   setDraft]     = useState(value)
  const ref = useRef(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }

  const displayVal = value || ''

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{label}</div>
      {editing ? (
        options ? (
          <select ref={ref} value={draft || ''} onChange={e => setDraft(e.target.value)} onBlur={commit}
            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--brand)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none' }}>
            <option value="">—</option>
            {options.map(o => <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o : o.label}</option>)}
          </select>
        ) : multiline ? (
          <textarea ref={ref} value={draft || ''} onChange={e => setDraft(e.target.value)} onBlur={commit} rows={3}
            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--brand)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
        ) : (
          <input ref={ref} type={type} value={draft || ''} onChange={e => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--brand)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none', boxSizing: 'border-box' }} />
        )
      ) : (
        <div onClick={() => setEditing(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'text', minHeight: '24px', padding: '2px 4px', borderRadius: '4px', border: '1px solid transparent', transition: 'border-color .1s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
          {prefix && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{prefix}</span>}
          <span style={{ fontSize: '13px', color: displayVal ? 'var(--text)' : 'var(--muted)', fontWeight: displayVal ? 500 : 400 }}>
            {displayVal || placeholder}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--border)', marginLeft: '2px' }}>✏️</span>
        </div>
      )}
    </div>
  )
}

// ── MULTI-TAG INPUT ───────────────────────────────────────────────
function TagInput({ label, values = [], options, onChange }) {
  const [input, setInput] = useState('')

  function add(val) {
    if (!val) return
    const v = val.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setInput('')
  }

  function remove(v) { onChange(values.filter(x => x !== v)) }

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
        {values.map(v => (
          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(204,34,0,.1)', color: '#CC2200', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
            {v}
            <span onClick={() => remove(v)} style={{ cursor: 'pointer', fontSize: '10px', opacity: 0.7 }}>✕</span>
          </span>
        ))}
      </div>
      {options ? (
        <select value="" onChange={e => { add(e.target.value); e.target.value = '' }}
          style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--muted)', fontSize: '12px', fontFamily: ff }}>
          <option value="">+ Add...</option>
          {options.filter(o => !values.includes(o)).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) } }}
          placeholder="Type and press Enter..."
          style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, boxSizing: 'border-box' }} />
      )}
    </div>
  )
}

// ── SECTION HEADER ────────────────────────────────────────────────
function Section({ title, icon, children, collapsible = true }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: '2px' }}>
      <div onClick={() => collapsible && setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--dim)', cursor: collapsible ? 'pointer' : 'default', userSelect: 'none', borderRadius: open ? '8px 8px 0 0' : '8px' }}>
        <span style={{ fontSize: '13px' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
        {collapsible && <span style={{ fontSize: '11px', color: 'var(--muted)', transition: 'transform .2s', transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>▾</span>}
      </div>
      {open && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '12px 14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── TIMELINE ITEM ─────────────────────────────────────────────────
const TL_TYPES = {
  call:    { icon: '📞', color: '#10B981', label: 'Call' },
  note:    { icon: '📝', color: '#8B5CF6', label: 'Note' },
  email:   { icon: '📧', color: '#3B82F6', label: 'Email' },
  sms:     { icon: '💬', color: '#F97316', label: 'SMS' },
  voice:   { icon: '🎙', color: '#CC2200', label: 'Voice Capture' },
  status:  { icon: '🔄', color: '#F5A623', label: 'Status Changed' },
  created: { icon: '✨', color: '#10B981', label: 'Created' },
  task:    { icon: '✅', color: '#6366F1', label: 'Task' },
  meeting: { icon: '🤝', color: '#EC4899', label: 'Meeting' },
  updated: { icon: '✏️', color: '#94A3B8', label: 'Updated' },
}

function TimelineItem({ item }) {
  const t = TL_TYPES[item.type] || { icon: '•', color: '#94A3B8', label: item.type }
  return (
    <div style={{ display: 'flex', gap: '10px', paddingBottom: '14px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: '13px', top: '26px', bottom: 0, width: '2px', background: 'var(--border)' }} />
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--panel)', border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0, zIndex: 1 }}>
        {t.icon}
      </div>
      <div style={{ flex: 1, background: 'var(--dim)', borderRadius: '10px', padding: '9px 12px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px', flexWrap: 'wrap', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: t.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t.label}</span>
            {item.agent && (
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>· {item.agent.name?.split(' ')[0]}</span>
            )}
          </div>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDateTime(item.created_at)}</span>
        </div>
        {item.title && <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{item.title}</div>}
        {item.body && <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.body}</div>}
        {item.meta && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{item.meta}</div>}
      </div>
    </div>
  )
}

// ── ADD TO TIMELINE ───────────────────────────────────────────────
function AddToTimeline({ contactId, agentId, onAdded }) {
  const [type, setType] = useState('note')
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
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
      if (type === 'call') {
        await db.calls.create({
          agent_id: agentId, contact_id: contactId,
          contact_name: title, notes: body,
          direction: 'Outbound', called_at: new Date().toISOString(),
        })
      } else {
        await supabase.from('audit_log').insert({
          agent_id: agentId, table_name: 'contacts', record_id: contactId,
          action: 'note', field_name: type, new_value: body,
          metadata: { description: title || body.slice(0, 80), type },
          created_at: new Date().toISOString(),
        })
      }
      setBody(''); setTitle('')
      toast('✅ Saved to timeline')
      onAdded?.()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', padding: '12px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {TYPES.map(t => (
          <button key={t.value} onClick={() => setType(t.value)}
            style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${type === t.value ? 'var(--brand)' : 'var(--border)'}`, background: type === t.value ? 'rgba(204,34,0,.08)' : 'transparent', color: type === t.value ? 'var(--brand)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
            {t.label}
          </button>
        ))}
      </div>
      {type !== 'note' && (
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'call' ? 'Who did you call / outcome...' : 'Subject / title...'}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, marginBottom: '6px', boxSizing: 'border-box' }} />
      )}
      <textarea value={body} onChange={e => setBody(e.target.value)}
        placeholder={type === 'call' ? 'Call notes...' : type === 'email' ? 'Email summary...' : type === 'sms' ? 'Message...' : type === 'meeting' ? 'What was discussed...' : 'Write a note...'}
        rows={3}
        style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }} />
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

  const [contact,   setContact]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [timeline,  setTimeline]  = useState([])
  const [tlLoading, setTlLoading] = useState(true)
  const [relDeals,  setRelDeals]  = useState([])
  const [relTasks,  setRelTasks]  = useState([])
  const [agents,    setAgents]    = useState([])
  const [rightTab,  setRightTab]  = useState('deals')
  const [confirmDel,setConfirmDel]= useState(false)
  const [savingAuto,setSavingAuto]= useState(false)

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
    } catch(e) {
      toast('Contact not found', '#DC2626')
      navigate('/contacts')
    } finally { setLoading(false) }
  }

  async function loadTimeline() {
    setTlLoading(true)
    try {
      const [calls, logs] = await Promise.all([
        supabase.from('calls').select('*, agents(id,name,color)').eq('contact_id', id).order('called_at', { ascending: false }).then(r => r.data || []),
        supabase.from('audit_log').select('*, agents(id,name,color)').eq('record_id', id).order('created_at', { ascending: false }).limit(100).then(r => r.data || []),
      ])

      const items = []

      calls.forEach(c => items.push({
        id: c.id, type: 'call',
        title:      c.contact_name || '',
        body:       [c.notes, c.outcome ? `Outcome: ${c.outcome}` : '', c.duration ? `Duration: ${c.duration}` : ''].filter(Boolean).join('\n'),
        meta:       `${c.direction || 'Outbound'} call${c.outcome ? ' · ' + c.outcome : ''}`,
        agent:      c.agents,
        created_at: c.called_at,
      }))

      logs.forEach(a => {
        const typeMap = { note: a.metadata?.type || 'note', created: 'created', status: 'status', updated: 'updated' }
        const type = typeMap[a.action]
        if (!type || !TL_TYPES[type]) return
        items.push({
          id:         a.id,
          type,
          title:      a.action === 'status' ? `Status changed: ${a.old_value || '?'} → ${a.new_value}` : a.metadata?.description || '',
          body:       a.action === 'note' ? a.new_value : '',
          agent:      a.agents,
          created_at: a.created_at,
        })
      })

      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setTimeline(items)
    } catch(e) { console.error('Timeline error:', e) }
    finally { setTlLoading(false) }
  }

  async function loadRelated() {
    try {
      const [deals, tasks] = await Promise.all([
        supabase.from('deals').select('id,addr,stage,gci,agents(id,name,color)').limit(10).then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date').eq('contact_id', id).order('due_date').then(r => r.data || []),
      ])
      setRelDeals(deals)
      setRelTasks(tasks)
    } catch {}
  }

  // ── AUTOSAVE FIELD ────────────────────────────────────────────
  async function saveField(field, value) {
    if (!contact) return
    try {
      const updated = await db.contacts.update(id, { [field]: value })
      setContact(prev => ({ ...prev, [field]: value, ...updated }))
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  async function saveFields(fields) {
    if (!contact) return
    try {
      const updated = await db.contacts.update(id, fields)
      setContact(prev => ({ ...prev, ...fields, ...updated }))
      toast('✅ Saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  // ── STATUS QUICK UPDATE ───────────────────────────────────────
  async function quickStatus(s) {
    try {
      const updated = await db.contacts.update(id, { status: s })
      setContact(prev => ({ ...prev, status: s }))
      toast(`✅ Status → ${s}`)
      loadTimeline()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  // ── SAVE AUTOMATION ───────────────────────────────────────────
  async function saveAutomation(fields) {
    setSavingAuto(true)
    try {
      await saveFields(fields)
      // If auto followup is enabled, create the next task
      if (fields.auto_followup_on && fields.next_followup) {
        await db.tasks.create({
          agent_id:   contact.agent_id || agent?.id,
          created_by: agent?.id,
          contact_id: id,
          title:      `Follow up with ${contact.first_name} ${contact.last_name || ''}`,
          due_date:   fields.next_followup,
          priority:   'normal',
          status:     'pending',
          notes:      `Auto-created follow-up for ${contact.first_name}`,
        })
        toast('✅ Automation saved — follow-up task created')
      } else {
        toast('✅ Automation saved')
      }
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSavingAuto(false) }
  }

  async function deleteContact() {
    try {
      await db.contacts.delete(id, agent?.id)
      toast('Contact deleted')
      navigate('/contacts')
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setConfirmDel(false) }
  }

  if (loading) return <div style={{ fontFamily: ff, padding: '28px' }}><Loading /></div>
  if (!contact) return null

  const statusColor = STATUS_COLORS[contact.status] || '#94A3B8'
  const f = contact // shorthand for all field reads
  const daysSinceContact = f.last_reached ? getDaysAgo(f.last_reached) : null
  const daysToFollowup   = f.next_followup ? getDaysUntil(f.next_followup) : null

  return (
    <div style={{ fontFamily: ff }}>

      {/* ── TOP HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/contacts')}
          style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--muted)', fontFamily: ff }}>
          ← Contacts
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: statusColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, flexShrink: 0 }}>
            {initials((f.first_name || '') + ' ' + (f.last_name || ''))}
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
              {f.first_name} {f.last_name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
              <Pill label={f.status || 'New'} color={statusColor} size="md" />
              {f.source && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>via {f.source}</span>}
              {daysSinceContact !== null && (
                <span style={{ fontSize: '11px', color: daysSinceContact > 14 ? '#DC2626' : 'var(--muted)', fontWeight: daysSinceContact > 14 ? 700 : 400 }}>
                  {daysSinceContact === 0 ? 'Reached today' : `Last contact ${daysSinceContact}d ago`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {f.phone && <Btn variant="secondary" size="sm" onClick={() => window.open(phoneHref(f.phone))}>📞 Call</Btn>}
          {f.email && <Btn variant="secondary" size="sm" onClick={() => window.open('mailto:' + f.email)}>📧 Email</Btn>}
        </div>
      </div>

      {/* ── THREE PANEL LAYOUT ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 270px', gap: '14px', alignItems: 'start' }}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

          {/* CONTACT INFO */}
          <Section title="Contact Info" icon="👤" collapsible={false}>
            <InlineField label="First Name" value={f.first_name} onChange={v => saveField('first_name', v)} placeholder="First name" />
            <InlineField label="Last Name" value={f.last_name} onChange={v => saveField('last_name', v)} placeholder="Last name" />
            <InlineField label="Phone" value={f.phone} onChange={v => saveField('phone', v)} type="tel" placeholder="(845) 555-1234" />
            <InlineField label="Phone 2" value={f.phone2} onChange={v => saveField('phone2', v)} type="tel" placeholder="Additional phone" />
            <InlineField label="Email" value={f.email} onChange={v => saveField('email', v)} type="email" placeholder="email@example.com" />
            <InlineField label="Email 2" value={f.email2} onChange={v => saveField('email2', v)} type="email" placeholder="Additional email" />
            <InlineField label="Company" value={f.company} onChange={v => saveField('company', v)} placeholder="Company name" />
            <InlineField label="Preferred Contact" value={f.preferred_contact} onChange={v => saveField('preferred_contact', v)} options={CONTACT_METHODS} />
            <InlineField label="Language" value={f.language} onChange={v => saveField('language', v)} options={LANG_OPTIONS} />
            <InlineField label="Birthday" value={f.birthday} onChange={v => saveField('birthday', v)} type="date" />
          </Section>

          {/* ADDRESS */}
          <Section title="Address" icon="📍">
            <InlineField label="Street Address" value={f.address} onChange={v => saveField('address', v)} placeholder="123 Main St" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <InlineField label="City" value={f.city} onChange={v => saveField('city', v)} options={LOCAL_CITIES} placeholder="City" />
              <InlineField label="Zip" value={f.zip} onChange={v => saveField('zip', v)} placeholder="10952" />
            </div>
          </Section>

          {/* STATUS & SOURCE */}
          <Section title="Status & Source" icon="🏷">
            <InlineField label="Status" value={f.status} onChange={v => { saveField('status', v); loadTimeline() }} options={CONTACT_STATUSES} />
            <InlineField label="Source" value={f.source} onChange={v => saveField('source', v)} options={CONTACT_SOURCES} placeholder="How did they find you?" />
            <InlineField label="Assigned Agent" value={f.agent_id} onChange={v => saveField('agent_id', v)}
              options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign to agent" />

            {/* Quick status buttons */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px' }}>Quick Status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {['Hot','Warm','Cold','Active','Nurturing','Closed','Unresponsive'].map(s => (
                  <button key={s} onClick={() => quickStatus(s)}
                    style={{ padding: '3px 8px', borderRadius: '6px', border: `1px solid ${f.status === s ? STATUS_COLORS[s] : 'var(--border)'}`, background: f.status === s ? STATUS_COLORS[s] + '18' : 'transparent', color: f.status === s ? STATUS_COLORS[s] : 'var(--muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* BUYER CRITERIA */}
          <Section title="Buyer Criteria" icon="🏡">
            <InlineField label="Buyer Type" value={f.buyer_type} onChange={v => saveField('buyer_type', v)}
              options={['Developer','Investor','Home Owner','First Time Buyer','Vacation/Summer Home']} placeholder="Type of buyer" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <InlineField label="Budget Min" value={f.budget_min} onChange={v => saveField('budget_min', parseNum(v))} type="number" prefix="$" placeholder="Min" />
              <InlineField label="Budget Max" value={f.budget_max} onChange={v => saveField('budget_max', parseNum(v))} type="number" prefix="$" placeholder="Max" />
              <InlineField label="Beds Min" value={f.beds_min} onChange={v => saveField('beds_min', parseInt(v))} type="number" placeholder="Min beds" />
              <InlineField label="Baths Min" value={f.baths_min} onChange={v => saveField('baths_min', parseFloat(v))} type="number" placeholder="Min baths" />
            </div>
            <TagInput label="Property Types Wanted" values={f.property_types || []} options={['Single Family','Multi Family','Condo','Land','Commercial','New Construction','Co-Op']} onChange={v => saveField('property_types', v)} />
            <TagInput label="Preferred Locations" values={f.locations || []} options={LOCAL_CITIES} onChange={v => saveField('locations', v)} />
            <InlineField label="Must Haves" value={f.must_haves} onChange={v => saveField('must_haves', v)} multiline placeholder="What are they firm on?" />
            <InlineField label="Deal Breakers" value={f.deal_breakers} onChange={v => saveField('deal_breakers', v)} multiline placeholder="What will kill the deal?" />
            <InlineField label="Financing" value={f.financing} onChange={v => saveField('financing', v)} options={FINANCING_OPTIONS} placeholder="How are they financing?" />
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Pre-Approved</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <div onClick={() => saveField('pre_approved', !f.pre_approved)}
                  style={{ width: 32, height: 18, borderRadius: '99px', background: f.pre_approved ? '#10B981' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 1, left: f.pre_approved ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text)' }}>{f.pre_approved ? 'Yes — Pre-Approved' : 'Not pre-approved'}</span>
              </label>
            </div>
            {f.pre_approved && (
              <InlineField label="Pre-Approval Amount" value={f.pre_approval_amt} onChange={v => saveField('pre_approval_amt', parseNum(v))} type="number" prefix="$" placeholder="Amount approved for" />
            )}
            <InlineField label="Timeline" value={f.timeline} onChange={v => saveField('timeline', v)} options={TIMELINE_OPTIONS} placeholder="When do they want to buy?" />
            <InlineField label="Motivation" value={f.motivation} onChange={v => saveField('motivation', v)} options={MOTIVATION_OPTIONS} placeholder="Why are they buying?" />
          </Section>

          {/* SELLER INFO */}
          <Section title="Seller Info" icon="🏠">
            <InlineField label="Property Address" value={f.property_addr} onChange={v => saveField('property_addr', v)} placeholder="Property they're selling" />
            <InlineField label="Asking Price" value={f.asking_price} onChange={v => saveField('asking_price', parseNum(v))} type="number" prefix="$" placeholder="Their asking price" />
            <InlineField label="Reason for Selling" value={f.reason_selling} onChange={v => saveField('reason_selling', v)} multiline placeholder="Why are they selling?" />
          </Section>

          {/* KEY DATES */}
          <Section title="Key Dates" icon="📅">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { label: '✨ Created',          value: f.created_at,      readOnly: true,  fmt: fmtDateTime },
                { label: '🕐 Last Activity',    value: f.last_activity,   readOnly: true,  fmt: fmtDateTime },
                { label: '📞 Last Reached Out', value: f.last_reached,    field: 'last_reached',   type: 'date' },
                { label: '📋 Next Follow-Up',   value: f.next_followup,   field: 'next_followup',  type: 'date' },
                { label: '💤 No Contact Since', value: f.no_contact_since,field: 'no_contact_since',type: 'date' },
                { label: '📄 AO Date',          value: f.ao_date,         field: 'ao_date',         type: 'date' },
                { label: '📝 Contract Date',    value: f.contract_date,   field: 'contract_date',   type: 'date' },
                { label: '🏁 Close Date',       value: f.close_date,      field: 'close_date',      type: 'date' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>{row.label}</span>
                  {row.readOnly ? (
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{row.fmt ? row.fmt(row.value) : fmtDate(row.value)}</span>
                  ) : (
                    <input type="date" value={row.value || ''} onChange={e => saveField(row.field, e.target.value || null)}
                      style={{ border: '1px solid var(--border)', borderRadius: '5px', padding: '3px 6px', fontSize: '12px', background: 'var(--inp)', color: 'var(--text)', fontFamily: ff, cursor: 'pointer' }} />
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* AUTOMATION */}
          <Section title="Automation" icon="⚡">
            <div style={{ marginBottom: '12px', padding: '10px', background: 'var(--dim)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Auto Follow-Up</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                <div onClick={() => saveField('auto_followup_on', !f.auto_followup_on)}
                  style={{ width: 32, height: 18, borderRadius: '99px', background: f.auto_followup_on ? '#10B981' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 1, left: f.auto_followup_on ? 15 : 1, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text)' }}>Auto follow-up {f.auto_followup_on ? 'ON' : 'OFF'}</span>
              </label>

              {f.auto_followup_on && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Follow up every</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="number" value={f.auto_followup_days || 7} min={1} max={90}
                        onChange={e => saveField('auto_followup_days', parseInt(e.target.value))}
                        style={{ width: '60px', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>days</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Follow-Up Template</div>
                    <select value={f.followup_template || ''} onChange={e => saveField('followup_template', e.target.value)}
                      style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff }}>
                      <option value="">None — just create task</option>
                      {FOLLOWUP_TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Manual follow-up task creator */}
            <div style={{ padding: '10px', background: 'var(--dim)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Create Follow-Up Task</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Next Follow-Up Date</div>
                  <input type="date" value={f.next_followup || ''} onChange={e => saveField('next_followup', e.target.value || null)}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Last Reached</div>
                  <input type="date" value={f.last_reached || ''} onChange={e => saveField('last_reached', e.target.value || null)}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--inp)', color: 'var(--text)', fontSize: '12px', fontFamily: ff, boxSizing: 'border-box' }} />
                </div>
              </div>
              <Btn size="sm" onClick={async () => {
                if (!f.next_followup) { toast('Set a follow-up date first', '#DC2626'); return }
                try {
                  await db.tasks.create({
                    agent_id:   f.agent_id || agent?.id,
                    created_by: agent?.id,
                    contact_id: id,
                    title:      `Follow up with ${f.first_name} ${f.last_name || ''}`,
                    due_date:   f.next_followup,
                    priority:   f.status === 'Hot' ? 'urgent' : f.status === 'Warm' ? 'high' : 'normal',
                    status:     'pending',
                    notes:      `Follow-up for ${f.first_name} — ${f.motivation || ''} ${f.timeline || ''}`.trim(),
                  })
                  toast('✅ Follow-up task created')
                } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
              }} style={{ width: '100%', justifyContent: 'center' }}>
                ✅ Create Follow-Up Task
              </Btn>
            </div>

            {/* Upcoming follow-up indicator */}
            {daysToFollowup !== null && (
              <div style={{ marginTop: '8px', padding: '8px 10px', background: daysToFollowup < 0 ? '#FEF2F2' : daysToFollowup <= 2 ? '#FFF7ED' : '#F0FDF4', borderRadius: '8px', border: `1px solid ${daysToFollowup < 0 ? '#FECACA' : daysToFollowup <= 2 ? '#FED7AA' : '#BBF7D0'}`, fontSize: '12px', color: daysToFollowup < 0 ? '#DC2626' : daysToFollowup <= 2 ? '#C2410C' : '#166534', fontWeight: 600 }}>
                {daysToFollowup < 0 ? `⚠️ Follow-up overdue by ${Math.abs(daysToFollowup)} days` : daysToFollowup === 0 ? '📅 Follow-up due today' : `📅 Follow-up in ${daysToFollowup} days`}
              </div>
            )}
          </Section>

          {/* NOTES */}
          <Section title="Notes" icon="📝">
            <textarea value={f.notes || ''} onChange={e => setContact(c => ({ ...c, notes: e.target.value }))}
              onBlur={e => saveField('notes', e.target.value)}
              placeholder="Notes about this contact..."
              rows={5}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
          </Section>

          {/* TAGS */}
          <Section title="Tags" icon="🏷">
            <TagInput label="" values={f.tags || []} onChange={v => saveField('tags', v)} />
          </Section>

          {/* DANGER */}
          <div style={{ background: 'var(--panel)', borderRadius: '8px', border: '1px solid #FECACA', padding: '12px 14px' }}>
            <Btn variant="danger" size="sm" onClick={() => setConfirmDel(true)} style={{ width: '100%', justifyContent: 'center' }}>🗑 Delete Contact</Btn>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            CENTER — CONVERSATION TIMELINE
        ══════════════════════════════════════════════════════ */}
        <div>
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>💬 Conversation History</div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{timeline.length} entries</span>
            </div>
            <div style={{ padding: '16px' }}>
              <AddToTimeline contactId={id} agentId={agent?.id} onAdded={loadTimeline} />

              {tlLoading && <div style={{ textAlign: 'center', padding: '20px' }}><Spinner size={20} color="var(--muted)" /></div>}

              {!tlLoading && timeline.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>💬</div>
                  No history yet. Add a note above to start tracking.
                </div>
              )}

              {timeline.map(item => <TimelineItem key={item.id + item.type} item={item} />)}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT — ACTIONS + DEALS + TASKS + FILES
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Quick Actions */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {[
                { label: '✅ Create Task',       nav: '/tasks/new' },
                { label: '📊 Add to Deal',       nav: '/production/new' },
                { label: '📅 Schedule Event',    nav: '/calendar/new' },
                { label: '🎁 Send Gift',         nav: '/gifts/new' },
                { label: '📞 Log Call',          nav: '/calls/new' },
                { label: '🏡 Create Listing',    nav: '/listings/new' },
              ].map(a => (
                <button key={a.label} onClick={() => navigate(a.nav)}
                  style={{ width: '100%', padding: '7px 10px', textAlign: 'left', background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: ff }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--hov)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--dim)'}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs: Deals / Tasks / Files */}
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {[
                { id: 'deals', label: `Deals (${relDeals.length})` },
                { id: 'tasks', label: `Tasks (${relTasks.length})` },
                { id: 'files', label: 'Files' },
              ].map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)}
                  style={{ flex: 1, padding: '9px 4px', background: 'none', border: 'none', borderBottom: rightTab === t.id ? '2px solid var(--brand)' : '2px solid transparent', marginBottom: '-1px', fontSize: '11px', fontWeight: rightTab === t.id ? 700 : 500, color: rightTab === t.id ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer', fontFamily: ff }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 12px' }}>
              {rightTab === 'deals' && (
                <div>
                  {relDeals.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No deals linked</div>}
                  {relDeals.map(d => (
                    <div key={d.id} onClick={() => navigate('/production/' + d.id)}
                      style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.addr}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981' }}>{fmt$(d.gci)}</span>
                        <Pill label={d.stage} color="#9aadbd" />
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate('/production/new')}
                    style={{ width: '100%', marginTop: '6px', padding: '6px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', fontFamily: ff }}>
                    + Link Deal
                  </button>
                </div>
              )}
              {rightTab === 'tasks' && (
                <div>
                  {relTasks.length === 0 && <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted)', fontSize: '12px' }}>No tasks</div>}
                  {relTasks.map(t => (
                    <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.status === 'done' ? '#10B981' : '#F97316', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                        {t.due_date && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDate(t.due_date)}</div>}
                      </div>
                    </div>
                  ))}
                  <button onClick={() => navigate('/tasks/new')}
                    style={{ width: '100%', marginTop: '6px', padding: '6px', border: '1px dashed var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', fontFamily: ff }}>
                    + Add Task
                  </button>
                </div>
              )}
              {rightTab === 'files' && <FileAttachments tableName="contacts" recordId={id} />}
            </div>
          </div>
        </div>
      </div>

      <Confirm open={confirmDel} message={`Delete ${f.first_name} ${f.last_name || ''}? Cannot be undone.`} onConfirm={deleteContact} onCancel={() => setConfirmDel(false)} />
    </div>
  )
}
