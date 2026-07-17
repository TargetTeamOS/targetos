import { ClickToCall } from '../components/ClickToCall'
import { authFetch } from '../lib/apiAuth'
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
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useFeature } from '../lib/features'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { CallJourney } from '../components/CallJourney'
import { loadContactLayout, saveContactLayout } from '../lib/contactLayout'
import { EmailComposeModal } from '../components/EmailComposeModal'
import { db } from '../lib/db'
import {
  fmtDate, fmtDateTime, fmtPhone, fmt$, initials,
  phoneHref, getDaysAgo, getDaysUntil, parseNum, today
} from '../lib/utils'
import { CONTACT_STATUSES, CONTACT_SOURCES, PROPERTY_TYPES, LOCAL_CITIES } from '../lib/constants'
import { FileAttachments } from '../components/FileAttachments'
import { uploadFile, listFiles, deleteFile, fmtFileSize, fileIcon } from '../lib/storage'
import { SignedAudio } from '../components/SignedAudio'
import { Avatar, Pill, Btn, Loading, Confirm, Field, Spinner } from '../components/UI'
import { CustomFieldsSection } from '../components/CustomFieldsSection'
import { BuyerInterest } from '../components/BuyerInterest'
import { EmailCompose }  from '../components/EmailCompose'

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
        <div onClick={() => setEditing(true)} className="inline-edit-row"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'text', minHeight: '26px', padding: '3px 8px', borderRadius: '6px', border: '1px solid transparent', transition: 'background .12s, border-color .12s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--dim)'; const p = e.currentTarget.querySelector('.edit-hint'); if (p) p.style.opacity = '1' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; const p = e.currentTarget.querySelector('.edit-hint'); if (p) p.style.opacity = '0' }}>
          {prefix && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{prefix}</span>}
          <span style={{ flex: 1, fontSize: '13px', color: displayVal ? 'var(--text)' : 'var(--muted)', fontWeight: displayVal ? 500 : 400 }}>
            {displayVal || placeholder}
          </span>
          <svg className="edit-hint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: 'var(--muted)', opacity: 0, transition: 'opacity .12s', flexShrink: 0 }}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
          </svg>
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
function Section({ title, icon, children, collapsible = true, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <div onClick={() => collapsible && setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 14px', background: 'var(--dim)', cursor: collapsible ? 'pointer' : 'default', userSelect: 'none', borderRadius: open ? '10px 10px 0 0' : '10px' }}>
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '11px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{title}</span>
        {collapsible && <span style={{ fontSize: '11px', color: 'var(--muted)', transition: 'transform .2s', transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>▾</span>}
      </div>
      {open && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 14px 16px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── TIMELINE ITEM ─────────────────────────────────────────────────
const TL_TYPES = {
  call:         { icon: '📞', color: '#10B981', label: 'Call' },
  call_inbound: { icon: '📲', color: '#10B981', label: 'Inbound Call' },
  call_outbound:{ icon: '📤', color: '#3B82F6', label: 'Outbound Call' },
  voicemail:    { icon: '📬', color: '#F97316', label: 'Voicemail' },
  note:         { icon: '📝', color: '#8B5CF6', label: 'Note' },
  email:        { icon: '📧', color: '#3B82F6', label: 'Email' },
  sms:          { icon: '💬', color: '#F97316', label: 'SMS' },
  showing:      { icon: '🏡', color: '#10B981', label: 'Showing' },
  voice:        { icon: '🎙', color: '#CC2200', label: 'Voice Capture' },
  status:       { icon: '🔄', color: '#F5A623', label: 'Status Changed' },
  created:      { icon: '✨', color: '#10B981', label: 'Contact Created' },
  task:         { icon: '✅', color: '#6366F1', label: 'Task Created' },
  task_completed:{ icon:'✔️', color: '#10B981', label: 'Task Completed' },
  meeting:      { icon: '🤝', color: '#EC4899', label: 'Meeting' },
  updated:      { icon: '✏️', color: '#94A3B8', label: 'Field Updated' },
  file:         { icon: '📎', color: '#14B8A6', label: 'File Uploaded' },
  agreement:    { icon: '📋', color: '#10B981', label: 'Agreement' },
  appointment:  { icon: '📅', color: '#8B5CF6', label: 'Appointment' },
  gift:         { icon: '🎁', color: '#EC4899', label: 'Gift' },
  assigned:     { icon: '👤', color: '#0EA5E9', label: 'Agent Assigned' },
  automation:   { icon: '⚡', color: '#CC2200', label: 'Automation' },
  interest:     { icon: '❤️', color: '#EC4899', label: 'Property Interest' },
  web_activity: { icon: '🌐', color: '#0EA5E9', label: 'Web Activity' },
  deleted:      { icon: '🗑️', color: '#DC2626', label: 'Deleted' },
}

function TimelineItem({ item }) {
  const [expanded, setExpanded] = React.useState(false)
  const [recState, setRecState] = React.useState({ status: 'idle', url: null }) // call recording
  const [vmState,  setVmState]  = React.useState({ status: 'idle', url: null }) // voicemail
  const t = TL_TYPES[item.type] || { icon: '•', color: '#94A3B8', label: item.type }

  async function loadAudio(setState) {
    setState({ status: 'loading', url: null })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await authFetch('/api/twilio-recording-proxy?callId=' + item.id, {
        headers: session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {},
      })
      if (!res.ok) throw new Error('failed')
      const blobUrl = URL.createObjectURL(await res.blob())
      setState({ status: 'ready', url: blobUrl })
    } catch(e) {
      setState({ status: 'error', url: null })
    }
  }

  return (
    <div style={{ display: 'flex', gap: '10px', paddingBottom: '14px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: '13px', top: '26px', bottom: 0, width: '2px', background: 'var(--border)' }} />
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--panel)', border: '2px solid ' + t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0, zIndex: 1 }}>
        {t.icon}
      </div>
      <div style={{ flex: 1, background: 'var(--dim)', borderRadius: '10px', padding: '9px 12px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px', flexWrap: 'wrap', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: t.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t.label}</span>
            {item.agent && <span style={{ fontSize: '10px', color: 'var(--muted)' }}>· {item.agent.name?.split(' ')[0]}</span>}
          </div>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{fmtDateTime(item.created_at)}</span>
        </div>
        {item.title && <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{item.title}</div>}
        {item.body && <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.body}</div>}
        {item.meta && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{item.meta}</div>}

        {/* Call recording player */}
        {item.recording_url && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>📼 Call Recording</div>
            {recState.status === 'ready'
              ? <audio controls autoPlay style={{ width: '100%', height: 32 }} src={recState.url} />
              : (
                <button onClick={() => loadAudio(setRecState)} disabled={recState.status === 'loading'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--dim)', color: recState.status === 'error' ? '#DC2626' : 'var(--text)', fontSize: 12, cursor: recState.status === 'loading' ? 'wait' : 'pointer', fontFamily: ff }}>
                  {recState.status === 'loading' ? '⏳ Loading…' : recState.status === 'error' ? '⚠ Failed — retry' : '▶ Load & Play'}
                </button>
              )}
            {item.transcript && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.5 }}>
                <strong>Transcript{item.transcript_language ? ' (' + item.transcript_language[0].toUpperCase() + item.transcript_language.slice(1) + ')' : ''}:</strong> {item.transcript}
              </div>
            )}
          </div>
        )}
        {!item.recording_url && item.has_recording && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--dim)', borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Recording available — restricted to admin/approved users</span>
          </div>
        )}

        {/* Phone journey — every menu step and keypress on this call */}
        {item.twilio_call_sid && (item.type === 'call' || item.type === 'voicemail') && (
          expanded
            ? <div style={{ marginTop: 8 }}>
                <button onClick={() => setExpanded(false)}
                  style={{ border:'none', background:'none', padding:0, fontSize:11, color:'var(--muted)', cursor:'pointer', fontFamily: ff }}>Hide phone journey ▾</button>
                <CallJourney callSid={item.twilio_call_sid} />
              </div>
            : <button onClick={() => setExpanded(true)}
                style={{ border:'none', background:'none', padding:0, marginTop:6, fontSize:11, color:'var(--brand)', cursor:'pointer', fontFamily: ff }}>
                📞 View phone journey — menus heard &amp; options pressed ▸
              </button>
        )}

        {/* Voicemail player + transcript */}
        {item.voicemail_url && (
          <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(249,115,22,.06)', borderRadius: 8, border: '1px solid rgba(249,115,22,.2)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#F97316', textTransform: 'uppercase', marginBottom: 4 }}>📬 Voicemail</div>
            {vmState.status === 'ready'
              ? <audio controls autoPlay style={{ width: '100%', height: 32 }} src={vmState.url} />
              : (
                <button onClick={() => loadAudio(setVmState)} disabled={vmState.status === 'loading'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(249,115,22,.3)', background: '#fff', color: vmState.status === 'error' ? '#DC2626' : '#F97316', fontSize: 12, cursor: vmState.status === 'loading' ? 'wait' : 'pointer', fontFamily: ff }}>
                  {vmState.status === 'loading' ? '⏳ Loading…' : vmState.status === 'error' ? '⚠ Failed — retry' : '▶ Load & Play'}
                </button>
              )}
            {(item.transcript || item.voicemail_transcript) && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.5 }}>
                <strong>Transcript{item.transcript_language ? ' (' + item.transcript_language[0].toUpperCase() + item.transcript_language.slice(1) + ')' : ''}:</strong> {item.transcript || item.voicemail_transcript}
              </div>
            )}
          </div>
        )}
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
            style={{ padding: '4px 10px', borderRadius: '6px', border: "1px solid " + (type === t.value ? 'var(--brand)' : 'var(--border)'), background: type === t.value ? 'rgba(204,34,0,.08)' : 'transparent', color: type === t.value ? 'var(--brand)' : 'var(--muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
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
// AGREEMENTS SECTION — Upload real documents per agreement type
// Stores in Supabase Storage under contacts/{id}/agreements/
// Logs every upload to the activity timeline
// ════════════════════════════════════════════════════════════════
const AGREEMENT_TYPES = [
  { id: 'buyer',    label: 'Buyer Agreement',    icon: '🏠', color: '#10B981' },
  { id: 'seller',   label: 'Listing Agreement',  icon: '🏡', color: '#F5A623' },
  { id: 'referral', label: 'Referral Agreement', icon: '🤝', color: '#8B5CF6' },
  { id: 'rental',   label: 'Rental Agreement',   icon: '🔑', color: '#3B82F6' },
  { id: 'other',    label: 'Other Document',     icon: '📄', color: '#94A3B8' },
]

function AgreementsSection({ contactId, agentId, onActivityLog }) {
  const { toast } = useApp()
  const [docs,      setDocs]      = React.useState([])
  const [loading,   setLoading]   = React.useState(true)
  const [uploading, setUploading] = React.useState(null)
  const [dragOver,  setDragOver]  = React.useState(false)
  const inputRef   = React.useRef(null)
  const ff2 = 'Inter,system-ui,sans-serif'

  React.useEffect(() => { if (contactId) load() }, [contactId])

  async function load() {
    setLoading(true)
    try {
      // List files in contacts/{contactId}/agreements/ folder
      const { data, error } = await supabase.storage
        .from('targetos-files')
        .list('contacts/' + contactId + '/agreements', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
      if (error && error.message?.includes('not found')) { setDocs([]); return }
      if (error) throw error
      // Build full paths and public URLs for each file
      const files = (data || []).filter(f => f.name !== '.emptyFolderPlaceholder').map(f => {
        const path = 'contacts/' + contactId + '/agreements/' + f.name
        const { data: urlData } = supabase.storage.from('targetos-files').getPublicUrl(path)
        return { name: f.name, path, url: urlData?.publicUrl, size: f.metadata?.size }
      })
      setDocs(files)
    } catch(e) {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }

  async function handleFiles(fileList, agreementType = 'other') {
    const files = Array.from(fileList || [])
    if (!files.length) return

    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) { toast(file.name + ' is too large (max 50MB)', '#DC2626'); continue }
      const uploadKey = agreementType + '_' + file.name
      setUploading(uploadKey)
      try {
        // Path: contacts/{id}/agreements/{type}_{timestamp}_{filename}
        const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const fullPath  = agreementType + '_' + Date.now() + '_' + safeName
        const tablePath = 'contacts/' + contactId + '/agreements'

        // Upload directly to supabase storage with exact path control
        const exactPath = 'contacts/' + contactId + '/agreements/' + fullPath
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('targetos-files')
          .upload(exactPath, file, { cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError

        // Log to activity timeline
        const typeDef = AGREEMENT_TYPES.find(t => t.id === agreementType)
        await supabase.from('audit_log').insert({
          agent_id:   agentId,
          table_name: 'contacts',
          record_id:  contactId,
          action:     'note',
          field_name: 'agreement',
          new_value:  (typeDef?.label || 'Document') + ' uploaded: ' + file.name,
          metadata:   { description: (typeDef?.label || 'Document') + ' uploaded', type: 'agreement', file_name: file.name },
          created_at: new Date().toISOString(),
        })

        toast('✅ ' + (typeDef?.label || 'Document') + ' uploaded')
        onActivityLog?.()
      } catch(e) {
        console.error('Upload error:', e)
        toast('Upload failed: ' + e.message + ' — Check Supabase Storage policies', '#DC2626')
      } finally {
        setUploading(null)
      }
    }
    await load()
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e, type) {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files, type)
  }

  function getTypeFromPath(path) {
    const name   = path.split('/').pop() || ''
    const prefix = name.split('_')[0]
    return AGREEMENT_TYPES.find(t => t.id === prefix) || AGREEMENT_TYPES[4]
  }

  function cleanName(path) {
    const name  = path.split('/').pop() || path
    const parts = name.split('_')
    return parts.length >= 3 ? parts.slice(2).join('_') : name
  }

  return (
    <div style={{ background: 'var(--panel)', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '8px' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--dim)' }}>
        <span style={{ fontSize: '14px' }}>📋</span>
        <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Agreements & Documents</span>
        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ padding: '10px 14px' }}>

        {/* Drag-and-drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => onDrop(e, 'other')}
          onClick={() => inputRef.current?.click()}
          style={{
            border: '2px dashed ' + (dragOver ? '#CC2200' : 'var(--border)'),
            borderRadius: '8px',
            padding: '14px',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: '10px',
            background: dragOver ? 'rgba(204,34,0,.04)' : 'var(--dim)',
            transition: 'all .15s',
          }}
        >
          <div style={{ fontSize: '20px', marginBottom: '4px' }}>📎</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '3px' }}>PDF, Word, JPG, PNG · max 50MB</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files, 'other')}
        />

        {/* Upload by type buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '10px' }}>
          {AGREEMENT_TYPES.map(type => {
            const isUp = uploading?.startsWith(type.id)
            return (
              <button
                key={type.id}
                onClick={() => {
                  // Create a temp input for this specific type
                  const inp = document.createElement('input')
                  inp.type = 'file'
                  inp.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
                  inp.onchange = e => { const f = e.target.files?.[0]; if (f) handleFiles([f], type.id) }
                  inp.click()
                }}
                disabled={!!uploading}
                style={{
                  padding: '6px 8px', borderRadius: '7px',
                  border: '1px solid ' + type.color + '44',
                  background: type.color + '0e', color: type.color,
                  fontSize: '11px', fontWeight: 600,
                  cursor: isUp ? 'wait' : 'pointer', fontFamily: ff2,
                  display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center',
                  opacity: !!uploading && !isUp ? 0.5 : 1,
                }}
              >
                <span>{isUp ? '⏳' : type.icon}</span>
                {isUp ? 'Uploading...' : '+ ' + type.label.replace(' Agreement','').replace(' Document','')}
              </button>
            )
          })}
        </div>

        {/* File list */}
        {loading && <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '6px 0' }}>Loading...</div>}
        {!loading && docs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>
            No documents yet — upload an agreement above.
          </div>
        )}
        {docs.map((doc, i) => {
          const typeDef = getTypeFromPath(doc.path || doc.name || '')
          const label   = cleanName(doc.path || doc.name || '')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '15px', flexShrink: 0 }}>{typeDef.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={doc.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {label}
                </a>
                <div style={{ fontSize: '10px', color: typeDef.color, fontWeight: 600, marginTop: '1px' }}>
                  {typeDef.label}{doc.size ? ' · ' + fmtFileSize(doc.size) : ''}
                </div>
              </div>
              <a href={doc.url} download={label} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--muted)', textDecoration: 'none', flexShrink: 0, padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)' }}>↓</a>
              <button onClick={async () => {
                try {
                  await deleteFile(doc.path)
                  setDocs(prev => prev.filter((_, j) => j !== i))
                  toast('Document deleted')
                } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
              }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '13px', flexShrink: 0, padding: '3px' }}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════
// RIGHT PANEL — Full featured client service panel
// Matches and exceeds Brivity's right panel functionality
// ════════════════════════════════════════════════════════════════

// Section-visibility: admins can hide panels + reorder via a layout
// settings object. hideKey identifies the panel. In arrange mode
// (editLayout) each section shows a drag handle + hide button.
function RightSection({ title, icon, color = 'var(--brand)', children, action = null, defaultOpen = true, hideKey = null, hidden = {}, layout = null, editLayout = false, onReorder = null, onHide = null }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const isHidden = hideKey ? (layout?.hidden?.[hideKey] || hidden[hideKey]) : false
  // In arrange mode, show hidden panels too (dimmed) so they can be re-shown
  if (isHidden && !editLayout) return null
  let ord
  if (hideKey && layout?.order) {
    const i = layout.order.indexOf(hideKey)
    ord = i < 0 ? 999 : i
  }
  const dragProps = (editLayout && hideKey) ? {
    draggable: true,
    onDragStart: e => { e.dataTransfer.setData('text/panel', hideKey); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' },
    onDrop: e => { e.preventDefault(); const from = e.dataTransfer.getData('text/panel'); if (from && from !== hideKey && onReorder) onReorder(from, hideKey) },
  } : {}
  return (
    <div {...dragProps} style={{ background: 'var(--panel)', borderRadius: '10px', border: editLayout ? '1px dashed var(--brand)' : '1px solid var(--border)', overflow: 'hidden', marginBottom: '8px', order: ord, opacity: isHidden ? 0.5 : 1 }}>
      <div onClick={() => !editLayout && setOpen(o => !o)}
        style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: editLayout ? 'grab' : 'pointer', userSelect: 'none', background: 'var(--dim)' }}>
        {editLayout && hideKey && <span style={{ fontSize: '14px', color: 'var(--muted)', cursor: 'grab' }} title="Drag to reorder">⠿</span>}
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {editLayout && hideKey ? (
          <span onClick={e => { e.stopPropagation(); onHide && onHide(hideKey, !isHidden) }}
            style={{ fontSize: '12px', fontWeight: 700, color: isHidden ? '#10B981' : 'var(--muted)', cursor: 'pointer', padding: '2px 8px', borderRadius: 6, background: 'var(--panel)', border: '1px solid var(--border)' }}>
            {isHidden ? 'Show' : '✕ Hide'}
          </span>
        ) : (
          <>
            {action && <span onClick={e => { e.stopPropagation(); action.onClick() }}
              style={{ fontSize: '11px', fontWeight: 700, color: color, background: color + '18', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer', border: "1px solid " + (color) + "33" }}>
              {action.label}
            </span>}
            <span style={{ fontSize: '11px', color: 'var(--muted)', transition: 'transform .2s', transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>▾</span>
          </>
        )}
      </div>
      {open && !editLayout && <div style={{ padding: '10px 14px' }}>{children}</div>}
    </div>
  )
}

function RightPanel({ contact: f, contactId, navigate, relDeals, relTasks, agents, agent, voiceNotes = [], onRefreshTimeline, layout, editLayout, setLayout }) {
  const { can } = useAuth()
  const canReassign = can('contacts.reassign')
  function onReorder(fromKey, toKey) {
    const order = (layout?.order || []).slice()
    const fi = order.indexOf(fromKey), ti = order.indexOf(toKey)
    if (fi < 0 || ti < 0) return
    order.splice(ti, 0, order.splice(fi, 1)[0])
    setLayout({ ...layout, order })
  }
  function onHide(key, hide) {
    const hidden = { ...(layout?.hidden || {}) }
    if (hide) hidden[key] = true; else delete hidden[key]
    setLayout({ ...layout, hidden })
  }
  const [composeOpen, setComposeOpen] = React.useState(false)

  async function onAssignAgent(newAgentId) {
    if (!canReassign) { toast('You do not have permission to reassign contacts', '#DC2626'); return }
    try {
      await db.contacts.update(contactId, { agent_id: newAgentId }, agent?.id)
      const picked = (agents || []).find(a => a.id === newAgentId) || null
      // reflect immediately without a full reload
      f.agent_id = newAgentId
      f.agents = picked
      toast(newAgentId ? 'Assigned to ' + (picked?.name || 'agent') : 'Agent unassigned')
      onRefreshTimeline && onRefreshTimeline()
    } catch (e) { toast('Could not assign: ' + e.message, '#DC2626') }
  }
  const { toast } = useApp()
  const [rightTab,      setRightTab]     = React.useState('deals')
  const [addingTask,    setAddingTask]   = React.useState(false)
  const [newTask,       setNewTask]      = React.useState({ title: '', due_date: '', priority: 'normal' })
  const [addingAppt,   setAddingAppt]   = React.useState(false)
  const [newAppt,      setNewAppt]      = React.useState({ title: '', date: '', time: '', notes: '' })
  const [savingTask,   setSavingTask]   = React.useState(false)
  const [savingAppt,  setSavingAppt]   = React.useState(false)
  const [agreements,   setAgreements]  = React.useState([])
  const [appts,       setAppts]        = React.useState([])
  const [calls,       setCalls]        = React.useState([])
  const [expandedCallId, setExpandedCallId] = React.useState(null)
  const [gifts,       setGifts]        = React.useState([])
  const [autoPlans,   setAutoPlans]   = React.useState([])

  React.useEffect(() => {
    if (!contactId) return
    // Load related data
    supabase.from('calendar_events').select('id,title,start_date,start_time,type').eq('contact_id', contactId).order('start_date').limit(10).then(r => setAppts(r.data || []))
    supabase.from('calls').select('id,contact_name,direction,outcome,called_at,notes,twilio_call_sid').eq('contact_id', contactId).order('called_at', { ascending: false }).limit(10).then(r => setCalls(r.data || []))
    supabase.from('gifts').select('id,client_name,status,description').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(10).then(r => setGifts(r.data || []))
    // Agreements stored as tags/notes for now
    const tags = f.tags || []
    setAgreements(tags.filter(t => ['Buyer Agreement', 'Listing Agreement', 'Referral Agreement'].includes(t)).map(t => ({
      type: t.replace(' Agreement', ''),
      signed: true,
    })))
  }, [contactId])

  async function quickCreateTask() {
    if (!newTask.title.trim()) { toast('Task title required', '#DC2626'); return }
    setSavingTask(true)
    try {
      await db.tasks.create({
        agent_id:   f.agent_id || agent?.id,
        created_by: agent?.id,
        contact_id: contactId,
        title:      newTask.title,
        due_date:   newTask.due_date || null,
        priority:   newTask.priority,
        status:     'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      setNewTask({ title: '', due_date: '', priority: 'normal' })
      setAddingTask(false)
      toast('✅ Task created')
      // Activity lock: log task creation
      await supabase.from('audit_log').insert({
        agent_id: agentId, table_name: 'contacts', record_id: contactId,
        action: 'task', field_name: 'task',
        new_value: newTask.title,
        metadata: { description: 'Task created: ' + newTask.title, type: 'task' },
        created_at: new Date().toISOString(),
      })
      onRefreshTimeline?.()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSavingTask(false) }
  }

  async function quickCreateAppt() {
    if (!newAppt.title.trim()) { toast('Title required', '#DC2626'); return }
    setSavingAppt(true)
    try {
      await supabase.from('calendar_events').insert({
        agent_id:   f.agent_id || agent?.id,
        contact_id: contactId,
        title:      newAppt.title,
        start_date: newAppt.date || new Date().toISOString().slice(0,10),
        start_time: newAppt.time || null,
        notes:      newAppt.notes || '',
        type:       'appointment',
        created_at: new Date().toISOString(),
      })
      setNewAppt({ title: '', date: '', time: '', notes: '' })
      setAddingAppt(false)
      toast('✅ Appointment created')
      // Activity lock: log appointment
      await supabase.from('audit_log').insert({
        agent_id: agentId, table_name: 'contacts', record_id: contactId,
        action: 'note', field_name: 'appointment',
        new_value: newAppt.title + (newAppt.date ? ' on ' + newAppt.date : ''),
        metadata: { description: 'Appointment: ' + newAppt.title, type: 'appointment' },
        created_at: new Date().toISOString(),
      })
      supabase.from('calendar_events').select('id,title,start_date,start_time,type').eq('contact_id', contactId).order('start_date').limit(10).then(r => setAppts(r.data || []))
      onRefreshTimeline?.()
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
    finally { setSavingAppt(false) }
  }

  const inp = (value, onChange, placeholder, type='text', style={}) => (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'6px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', boxSizing:'border-box', ...style }} />
  )

  const sel = (value, onChange, options) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width:'100%', padding:'6px 9px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  const EmptyState = ({ text, action }) => (
    <div style={{ textAlign:'center', padding:'12px 0', color:'var(--muted)', fontSize:'12px' }}>
      <div style={{ marginBottom:'6px' }}>{text}</div>
      {action && <button onClick={action.onClick} style={{ fontSize:'11px', color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', fontWeight:600 }}>{action.label}</button>}
    </div>
  )

  const AddBtn = ({ onClick, label }) => (
    <button onClick={onClick}
      style={{ width:'100%', marginTop:'6px', padding:'6px', border:'1px dashed var(--border)', borderRadius:'6px', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* sections are admin-reorderable/hideable via layout (CSS order) */}
      {/* ── ASSIGNED TO ── */}
      <RightSection hideKey="assigned" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Assigned To" icon="👤" color="#0EA5E9">
        {f.agents ? (
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <Avatar agent={f.agents} size={36} />
            <div>
              <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text)' }}>{f.agents.name}</div>
              <div style={{ fontSize:'11px', color:'var(--muted)' }}>Primary Agent</div>
            </div>
            {canReassign && (
            <select value={f.agent_id || ''} onChange={e => onAssignAgent(e.target.value || null)}
              style={{ marginLeft:'auto', padding:'5px 8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'12px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
              {(agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="">— Unassign —</option>
            </select>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ fontSize:'12px', color:'var(--muted)' }}>No agent assigned</div>
            {canReassign && (
            <select value="" onChange={e => e.target.value && onAssignAgent(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:'8px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:'13px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
              <option value="">+ Assign an agent…</option>
              {(agents || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            )}
          </div>
        )}
      </RightSection>

      {/* ── AGREEMENTS ── */}
      <AgreementsSection contactId={contactId} agentId={f.agent_id || agent?.id} contactName={f.first_name + ' ' + (f.last_name || '')} onActivityLog={onRefreshTimeline} />

      {/* ── APPOINTMENTS ── */}
      {voiceNotes.length > 0 && (
        <RightSection hideKey="voice" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title={"🎤 Voice Recordings (" + voiceNotes.length + ")"} icon="🎤" color="#8B5CF6">
          {voiceNotes.map(function(n){ return (
            <div key={n.id} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{new Date(n.created_at).toLocaleString()}</div>
              <SignedAudio path={n.audio_path} fallbackUrl={n.audio_url} />
              {n.transcript && <div style={{ fontSize:12, color:'var(--muted)', marginTop:4, fontStyle:'italic' }}>“{n.transcript}”</div>}
            </div>
          )})}
        </RightSection>
      )}
      <RightSection hideKey="showings" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Showings & Interest" icon="🏡" color="#10B981">
      <BuyerInterest contactId={contactId} agentId={f.agent_id || agent?.id} />
    </RightSection>

    <RightSection hideKey="appointments" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Appointments" icon="📅" color="#8B5CF6"
        action={{ label: '+ Add', onClick: () => setAddingAppt(true) }}>
        {appts.length === 0 && <EmptyState text="No appointments yet" action={{ label: '+ Schedule', onClick: () => setAddingAppt(true) }} />}
        {appts.map(a => (
          <div key={a.id} onClick={() => navigate('/calendar/' + a.id)}
            style={{ padding:'7px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text)' }}>{a.title}</div>
            <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'2px' }}>{fmtDate(a.start_date)}{a.start_time ? ' · ' + a.start_time : ''}</div>
          </div>
        ))}
        {addingAppt && (
          <div style={{ marginTop:'8px', display:'flex', flexDirection:'column', gap:'6px', padding:'10px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)' }}>
            {inp(newAppt.title, v => setNewAppt(p => ({...p, title: v})), 'Appointment title...')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {inp(newAppt.date, v => setNewAppt(p => ({...p, date: v})), '', 'date')}
              {inp(newAppt.time, v => setNewAppt(p => ({...p, time: v})), 'Time', 'time')}
            </div>
            <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
              <button onClick={() => setAddingAppt(false)} style={{ padding:'5px 10px', border:'1px solid var(--border)', borderRadius:'6px', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <Btn size="sm" onClick={quickCreateAppt} loading={savingAppt}>Save</Btn>
            </div>
          </div>
        )}
      </RightSection>

      {/* ── TASKS ── */}
      <RightSection hideKey="tasks" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title={"Tasks (" + (relTasks.length) + ")"} icon="✅" color="#F97316"
        action={{ label: '+ Add', onClick: () => setAddingTask(true) }}>
        {relTasks.length === 0 && <EmptyState text="No tasks yet" action={{ label: '+ Create task', onClick: () => setAddingTask(true) }} />}
        {relTasks.slice(0,5).map(t => (
          <div key={t.id} onClick={() => navigate('/tasks/' + t.id)}
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background: t.status === 'done' ? '#10B981' : t.priority === 'urgent' ? '#DC2626' : '#F97316', flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
              {t.due_date && <div style={{ fontSize:'10px', color:'var(--muted)' }}>{fmtDate(t.due_date)}</div>}
            </div>
          </div>
        ))}
        {addingTask && (
          <div style={{ marginTop:'8px', display:'flex', flexDirection:'column', gap:'6px', padding:'10px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)' }}>
            {inp(newTask.title, v => setNewTask(p => ({...p, title: v})), 'Task title... use {{contact_name}}')}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {inp(newTask.due_date, v => setNewTask(p => ({...p, due_date: v})), '', 'date')}
              {sel(newTask.priority, v => setNewTask(p => ({...p, priority: v})), [
                {value:'urgent',label:'🔴 Urgent'},{value:'high',label:'🟠 High'},{value:'normal',label:'🔵 Normal'},{value:'low',label:'⚪ Low'}
              ])}
            </div>
            <div style={{ display:'flex', gap:'6px', justifyContent:'flex-end' }}>
              <button onClick={() => setAddingTask(false)} style={{ padding:'5px 10px', border:'1px solid var(--border)', borderRadius:'6px', background:'transparent', color:'var(--muted)', fontSize:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <Btn size="sm" onClick={quickCreateTask} loading={savingTask}>Save</Btn>
            </div>
          </div>
        )}
        {relTasks.length > 5 && <AddBtn onClick={() => navigate('/tasks')} label={"View all " + (relTasks.length) + " tasks →"} />}
      </RightSection>

      {/* ── DEALS ── */}
      <RightSection hideKey="deals" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title={"Deals (" + (relDeals.length) + ")"} icon="💼" color="#10B981">
        {relDeals.length === 0 && <EmptyState text="No deals linked" action={{ label: '+ Link Deal', onClick: () => navigate('/production/new') }} />}
        {relDeals.map(d => (
          <div key={d.id} onClick={() => navigate('/production/' + d.id)}
            style={{ padding:'7px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.addr}</div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:'3px' }}>
              <span style={{ fontSize:'11px', fontWeight:700, color:'#10B981' }}>{fmt$(d.gci)}</span>
              <Pill label={d.stage} color="#9aadbd" />
            </div>
          </div>
        ))}
        <AddBtn onClick={() => navigate('/production/new')} label="+ Link Deal" />
      </RightSection>

      {/* ── CALLS LOG ── */}
      <RightSection hideKey="calls" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title={"Calls (" + (calls.length) + ")"} icon="📞" color="#3B82F6">
        {calls.length === 0 && <EmptyState text="No calls logged" action={{ label: '+ Log Call', onClick: () => navigate('/calls/new') }} />}
        {calls.slice(0,4).map(c => (
          <div key={c.id} style={{ padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:'12px', fontWeight:600, color:'var(--text)' }}>{c.direction || 'Outbound'}</span>
              <span style={{ fontSize:'10px', color:'var(--muted)' }}>{fmtDate(c.called_at)}</span>
            </div>
            {c.outcome && <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>{c.outcome}</div>}
            {c.notes  && <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px', fontStyle:'italic' }}>{c.notes.slice(0,60)}{c.notes.length>60?'…':''}</div>}
            {c.twilio_call_sid && (
              expandedCallId === c.id
                ? <CallJourney callSid={c.twilio_call_sid} />
                : <button onClick={() => setExpandedCallId(c.id)}
                    style={{ border:'none', background:'none', padding:0, marginTop:2, fontSize:'11px', color:'var(--brand)', cursor:'pointer' }}>
                    View phone journey ▸
                  </button>
            )}
          </div>
        ))}
        <AddBtn onClick={() => navigate('/calls/new')} label="+ Log Call" />
      </RightSection>

      {/* ── GIFTS ── */}
      <RightSection hideKey="gifts" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title={"Gifts (" + (gifts.length) + ")"} icon="🎁" color="#EC4899">
        {gifts.length === 0 && <EmptyState text="No gifts yet" action={{ label: '+ Add Gift', onClick: () => navigate('/gifts/new') }} />}
        {gifts.map(g => (
          <div key={g.id} onClick={() => navigate('/gifts/' + g.id)}
            style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
            <div style={{ flex:1, fontSize:'12px', color:'var(--text)' }}>{g.description || g.client_name}</div>
            <Pill label={g.status} color="#EC4899" />
          </div>
        ))}
        <AddBtn onClick={() => navigate('/gifts/new')} label="+ Add Gift" />
      </RightSection>

      {/* ── AUTO PLANS (Automations) ── */}
      <RightSection hideKey="autoplans" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Auto Plans" icon="⚡" color="#CC2200" defaultOpen={false}>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'10px', lineHeight:1.5 }}>
          Apply automations to this contact to send emails, create tasks, and follow ups automatically.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {[
            { label: '🔔 New Lead Follow-Up',   desc: 'Create task · Send email' },
            { label: '📅 30-Day Nurture',        desc: 'Weekly check-ins for 30 days' },
            { label: '🏡 Buyer Search Plan',     desc: 'Match listings · Alert on new' },
            { label: '🎉 Post-Close Follow-Up',  desc: 'Birthday · Anniversary reminders' },
          ].map(plan => (
            <div key={plan.label} style={{ padding:'8px 10px', background:'var(--dim)', borderRadius:'7px', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
              <div>
                <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text)' }}>{plan.label}</div>
                <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'1px' }}>{plan.desc}</div>
              </div>
              <button
                onClick={() => navigate('/automations')}
                style={{ padding:'4px 8px', borderRadius:'5px', border:'1px solid var(--brand)', background:'transparent', color:'var(--brand)', fontSize:'11px', fontWeight:600, cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', flexShrink:0 }}>
                Apply
              </button>
            </div>
          ))}
        </div>
        <AddBtn onClick={() => navigate('/automations')} label="Manage Automations →" />
      </RightSection>

      {/* ── LISTING ALERTS ── */}
      <RightSection hideKey="alerts" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Listing Alerts" icon="🏡" color="#F5A623" defaultOpen={false}>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'10px', lineHeight:1.5 }}>
          Send matching listing alerts to this contact based on their buyer criteria.
        </div>
        {f.budget_max && f.locations?.length ? (
          <div style={{ padding:'10px', background:'#FFF7ED', borderRadius:'8px', border:'1px solid #FED7AA', marginBottom:'8px' }}>
            <div style={{ fontSize:'12px', fontWeight:700, color:'#92400E' }}>Buyer Profile Set ✓</div>
            <div style={{ fontSize:'11px', color:'#B45309', marginTop:'3px' }}>
              Budget up to {fmt$(f.budget_max)} · {f.locations.join(', ')}
            </div>
          </div>
        ) : (
          <div style={{ padding:'10px', background:'var(--dim)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'8px', fontSize:'12px', color:'var(--muted)' }}>
            Set buyer criteria in the left panel to enable listing alerts.
          </div>
        )}
        <Btn size="sm" variant="secondary" style={{ width:'100%' }}
          onClick={async () => {
            await supabase.from('audit_log').insert({
              agent_id:   f.agent_id || agent?.id,
              table_name: 'contacts',
              record_id:  contactId,
              action:     'note',
              field_name: 'email',
              new_value:  'Listing alert sent to ' + (f.email || f.first_name),
              metadata:   { description: 'Listing alert email', type: 'email' },
              created_at: new Date().toISOString(),
            })
            toast('✅ Listing alert logged — wire up email to send')
            onRefreshTimeline?.()
          }}>
          📧 Send Listing Alert
        </Btn>
      </RightSection>

      {/* ── MARKET REPORT ── */}
      <RightSection hideKey="market" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Market Report" icon="📊" color="#6366F1" defaultOpen={false}>
        <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'10px', lineHeight:1.5 }}>
          Send a market update to this contact for their area.
        </div>
        {f.locations?.length ? (
          <div style={{ fontSize:'12px', color:'var(--text)', marginBottom:'8px' }}>
            <strong>Area:</strong> {f.locations.join(', ')}
          </div>
        ) : (
          <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'8px' }}>Set locations in the buyer criteria section.</div>
        )}
        <Btn size="sm" variant="secondary" style={{ width:'100%' }}
          onClick={async () => {
            await supabase.from('audit_log').insert({
              agent_id:   f.agent_id || agent?.id,
              table_name: 'contacts',
              record_id:  contactId,
              action:     'note',
              field_name: 'email',
              new_value:  'Market report sent to ' + (f.email || f.first_name),
              metadata:   { description: 'Market report email', type: 'email' },
              created_at: new Date().toISOString(),
            })
            toast('✅ Market report logged')
            onRefreshTimeline?.()
          }}>
          📊 Send Market Report
        </Btn>
      </RightSection>

      {/* ── FILES ── */}
      <RightSection hideKey="files" layout={layout} editLayout={editLayout} onReorder={onReorder} onHide={onHide} title="Files" icon="📎" color="#14B8A6" defaultOpen={false}>
        <FileAttachments tableName="contacts" recordId={contactId} />
      </RightSection>

      {/* Quick Actions panel removed — its actions live in the header
          action bar (Note/Email/Call/Task/Appointment/SMS) and the
          Deals/Listings sections, so this was a third redundant copy. */}
      <EmailComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} contact={f} agent={agent} toast={toast} />

    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// MAIN CONTACT DETAIL PAGE
// ════════════════════════════════════════════════════════════════
export function ContactDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const location  = useLocation()

  // ── PREV / NEXT CONTACT (July 2026) ─────────────────────────────
  // Walks the same list the user came from: the Contacts page passes
  // its visible row order via navigation state; when the page is
  // opened directly (deep link, refresh), fall back to the default
  // Contacts ordering (last activity, newest first).
  const [navIds, setNavIds] = useState(() => Array.isArray(location.state?.ids) ? location.state.ids : null)
  useEffect(() => {
    if (Array.isArray(location.state?.ids)) { setNavIds(location.state.ids); return }
    if (navIds) return
    supabase.from('contacts').select('id')
      .order('last_activity', { ascending:false, nullsFirst:false })
      .order('created_at',    { ascending:false })
      .limit(1000)
      .then(({ data }) => setNavIds((data || []).map(c => c.id)))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const navIdx  = navIds ? navIds.indexOf(id) : -1
  const prevId  = navIdx > 0 ? navIds[navIdx - 1] : null
  const nextId  = (navIdx >= 0 && navIdx < (navIds?.length || 0) - 1) ? navIds[navIdx + 1] : null
  function goSibling(cid) { if (cid) navigate('/contacts/' + cid + '/detail', { state: { ids: navIds } }) }
  const { agent, isAdmin, canManage } = useAuth()
  const cols3On = useFeature('contact_3col', agent)
  const { toast } = useApp()

  const [contact,   setContact]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [timeline,  setTimeline]  = useState([])
  const [tlLoading, setTlLoading] = useState(true)
  const [relDeals,  setRelDeals]  = useState([])
  const [voiceNotes, setVoiceNotes] = useState([])
  const [contactLayout, setContactLayout] = useState(null)
  const [editLayout, setEditLayout] = useState(false)

  async function saveLayoutNow() {
    try { await saveContactLayout(contactLayout); toast('Layout saved for everyone'); setEditLayout(false) }
    catch (e) { toast('Save failed: ' + e.message, '#DC2626') }
  }
  const [relTasks,  setRelTasks]  = useState([])
  const [agents,    setAgents]    = useState([])
  const [recordingGrants, setRecordingGrants] = useState([])
  const [grantAgentId,    setGrantAgentId]    = useState('')
  const [rightTab,  setRightTab]  = useState('deals')
  const [confirmDel,setConfirmDel]= useState(false)
  const [savingAuto,setSavingAuto]= useState(false)
  const [activeTab,  setActiveTab]  = useState('activity')  // activity | notes | calls | tasks | emails
  const [tlFilter,   setTlFilter]   = useState('all')

  useEffect(() => {
    if (!id) return
    loadContact()
    loadTimeline()
    loadRelated()
    db.agents.list().then(setAgents)
    if (isAdmin) loadRecordingGrants()
  }, [id])

  async function loadRecordingGrants() {
    try {
      const { data } = await supabase.from('recording_access_grants')
        .select('id, agent_id, agents(id,name,color)')
        .eq('contact_id', id)
      setRecordingGrants(data || [])
    } catch(e) { console.warn('loadRecordingGrants:', e.message) }
  }

  async function grantRecordingAccess() {
    if (!grantAgentId) return
    try {
      const { error } = await supabase.from('recording_access_grants').insert({
        agent_id: grantAgentId, contact_id: id, granted_by: agent?.id,
      })
      if (error) throw error
      setGrantAgentId('')
      await loadRecordingGrants()
      toast('✅ Recording access granted')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  async function revokeRecordingAccess(grantId) {
    try {
      await supabase.from('recording_access_grants').delete().eq('id', grantId)
      await loadRecordingGrants()
      toast('Access revoked')
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

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
      const [calls, callSids, smsMessages, webActivity, logs] = await Promise.all([
        supabase.rpc('get_contact_calls', { p_contact_id: id }).then(r => r.data || []).catch(() => []),
        // The RPC predates call-journey tracking and may not return the
        // Twilio SID — merge it in from the calls table so the timeline
        // can show the phone journey. Falls back harmlessly if blocked.
        supabase.from('calls').select('id,twilio_call_sid').eq('contact_id', id).limit(100).then(r => r.data || []).catch(() => []),
        supabase.from('sms_messages').select('id,body,direction,from_number,to_number,created_at,agents(id,name,color)').eq('contact_id', id).order('created_at', { ascending: false }).limit(20).then(r => r.data || []).catch(()=>[]),
        supabase.from('audit_log').select('id,action,field_name,new_value,metadata,created_at,agents(id,name,color)').eq('record_id', id).eq('field_name', 'web_activity').order('created_at', { ascending: false }).limit(20).then(r => r.data || []).catch(()=>[]),
        supabase.from('audit_log').select('*, agents(id,name,color)').eq('record_id', id).order('created_at', { ascending: false }).limit(100).then(r => r.data || []),
      ])

      const items = []

      // SMS messages in timeline
      smsMessages.forEach(m => items.push({
        id: m.id, type: 'sms',
        title: (m.direction === 'inbound' ? '📲 Received' : '📤 Sent') + ' SMS',
        body:  m.body || '',
        meta:  m.direction === 'inbound' ? 'From: ' + (m.from_number||'') : 'To: ' + (m.to_number||''),
        agent: m.agents,
        created_at: m.created_at,
      }))

      // Web activity in timeline
      webActivity.forEach(a => items.push({
        id: a.id + '_web', type: 'web_activity',
        title: a.metadata?.description || a.new_value || 'Website visit',
        body:  a.metadata?.page || '',
        meta:  'Web Activity',
        agent: a.agents,
        created_at: a.created_at,
      }))

      calls.forEach(c => items.push({
        id: c.id, type: c.voicemail_url ? 'voicemail' : 'call',
        title:       (c.direction||'Outbound') + ' call' + (c.outcome ? ' · ' + c.outcome : '') + (c.duration_sec > 0 ? ' · ' + Math.floor(c.duration_sec/60) + 'm' : ''),
        body:        c.notes || '',
        meta:        c.from_number || '',
        has_recording: c.has_recording || false,
        recording_url: c.recording_url || null,
        voicemail_url: c.voicemail_url || null,
        voicemail_transcript: c.voicemail_transcript || null,
        transcript: c.transcript || null,
        transcript_language: c.transcript_language || null,
        twilio_call_sid: c.twilio_call_sid || (callSids.find(x => x.id === c.id)?.twilio_call_sid) || null,
        duration_sec: c.duration_sec || 0,
        agent:       c.agent_id ? { id: c.agent_id, name: c.agent_name, color: c.agent_color } : null,
        created_at:  c.called_at,
      }))

      logs.forEach(a => {
        // Map every audit_log action to a timeline type
        let type = a.metadata?.type || a.action
        if (a.action === 'note')    type = a.metadata?.type || 'note'
        if (a.action === 'created') type = 'created'
        if (a.action === 'status')  type = 'status'
        if (a.action === 'updated') type = 'updated'
        if (a.action === 'assigned') type = 'assigned'
        if (a.action === 'deleted') type = 'deleted'
        if (!TL_TYPES[type]) type = 'updated' // fallback — show everything

        let title = a.metadata?.description || ''
        let body  = ''

        if (a.action === 'status') {
          title = 'Status: ' + (a.old_value || '—') + ' → ' + a.new_value
        } else if (a.action === 'updated' && a.field_name) {
          const fieldLabel = a.field_name.replace(/_/g, ' ')
          if (a.old_value && a.new_value) title = `${fieldLabel}: "${a.old_value}" → "${a.new_value}""\n          else if (a.new_value)           title = "${fieldLabel} set to "${a.new_value}"`
          else                            title = (fieldLabel) + " cleared"
        } else if (a.action === 'note') {
          body = a.new_value || ''
        } else if (a.action === 'created') {
          title = 'Contact was created'
        }

        items.push({
          id:         a.id,
          type,
          title,
          body,
          agent:      a.agents,
          created_at: a.created_at,
          field:      a.field_name,
          oldVal:     a.old_value,
          newVal:     a.new_value,
        })
      })

      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setTimeline(items)
    } catch(e) { console.error('Timeline error:', e) }
    finally { setTlLoading(false) }
  }

  useEffect(() => { loadContactLayout().then(setContactLayout).catch(() => {}) }, [])
  useEffect(() => {
    if (!id) return
    supabase.from('notes').select('*').eq('linked_type','contact').eq('linked_id',id).not('audio_url','is',null)
      .order('created_at',{ascending:false}).then(({data}) => setVoiceNotes(data || [])).catch(()=>{})
  }, [id])

  async function loadRelated() {
    try {
      // Deals actually linked to THIS contact (contact_id, or as a
      // participant via tc_participants). Previously this loaded the
      // 10 most-recent deals in the whole system with no filter — so
      // every contact showed the same unrelated deals.
      const [ownDeals, partRows, tasks] = await Promise.all([
        supabase.from('deals').select('id,addr,stage,gci,agents(id,name,color)').eq('contact_id', id).then(r => r.data || []),
        supabase.from('tc_participants').select('tc_deal_id').eq('contact_id', id).then(r => r.data || []),
        supabase.from('tasks').select('id,title,status,priority,due_date').eq('contact_id', id).order('due_date').then(r => r.data || []),
      ])
      let deals = ownDeals
      // Include deals where this contact is a participant (seller, buyer, etc.)
      const tcIds = [...new Set((partRows || []).map(p => p.tc_deal_id).filter(Boolean))]
      if (tcIds.length) {
        const { data: tcDeals } = await supabase.from('tc_deals').select('id,addr,tc_phase,sale_price,agent_id,agents(id,name,color)').in('id', tcIds)
        const mapped = (tcDeals || []).map(d => ({ id: d.id, addr: d.addr, stage: d.tc_phase, gci: d.sale_price, agents: d.agents, _tc: true }))
        const seen = new Set(deals.map(d => d.id))
        deals = [...deals, ...mapped.filter(m => !seen.has(m.id))]
      }
      setRelDeals(deals)
      setRelTasks(tasks)
    } catch (e) { console.warn('loadRelated:', e.message) }
  }

  // ── AUTOSAVE FIELD ────────────────────────────────────────────
  async function saveField(field, value) {
    if (!contact) return
    try {
      const updated = await db.contacts.update(id, { [field]: value }, agent?.id)
      setContact(c => ({ ...c, [field]: value, ...updated }))
      loadTimeline()
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  async function saveFields(fields) {
    if (!contact) return
    try {
      const updated = await db.contacts.update(id, fields, agent?.id)
      setContact(prev => ({ ...prev, ...fields, ...updated }))
      toast('✅ Saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  async function saveCustomField(key, value) {
    if (!contact) return
    const newCustomData = { ...(contact.custom_data || {}), [key]: value }
    try {
      const updated = await db.contacts.update(id, { custom_data: newCustomData }, agent?.id)
      setContact(c => ({ ...c, custom_data: newCustomData, ...updated }))
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
  }

  // ── STATUS QUICK UPDATE ───────────────────────────────────────
  async function quickStatus(s) {
    try {
      const updated = await db.contacts.update(id, { status: s }, agent?.id)
      setContact(prev => ({ ...prev, status: s }))
      toast("✅ Status → " + (s))
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
          title: 'Follow up with ' + contact.first_name + ' ' + (contact.last_name || ''),
          due_date:   fields.next_followup,
          priority:   'normal',
          status:     'pending',
          notes:      "Auto-created follow-up for " + (contact.first_name),
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
      <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button onClick={() => navigate('/contacts')}
          style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:18, color:'var(--muted)', fontFamily:ff, lineHeight:1, padding:0, flexShrink:0 }}
          title="Back to Contacts">←</button>
        <div style={{ display:'flex', gap:2, flexShrink:0 }}>
          <button onClick={()=>goSibling(prevId)} disabled={!prevId}
            style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'7px 0 0 7px', cursor: prevId?'pointer':'default', fontSize:13, color: prevId?'var(--text)':'var(--border)', fontFamily:ff, padding:'4px 9px' }}
            title="Previous contact">‹</button>
          <button onClick={()=>goSibling(nextId)} disabled={!nextId}
            style={{ background:'var(--panel)', border:'1px solid var(--border)', borderLeft:'none', borderRadius:'0 7px 7px 0', cursor: nextId?'pointer':'default', fontSize:13, color: nextId?'var(--text)':'var(--border)', fontFamily:ff, padding:'4px 9px' }}
            title="Next contact">›</button>
        </div>
        <div style={{ width:40, height:40, borderRadius:'50%', background:statusColor, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, flexShrink:0 }}>
          {initials((f.first_name||'')+' '+(f.last_name||''))}
        </div>
        <div style={{ minWidth:0, flex:'0 1 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h1 style={{ fontSize:17, fontWeight:800, color:'var(--text)', margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.first_name} {f.last_name}</h1>
            <select value={f.status||'New'} onChange={e=>saveField('status',e.target.value)}
              style={{ padding:'4px 26px 4px 12px', borderRadius:99, border:'none', width:'auto',
                background:(STATUS_COLORS[f.status]||'#8B5CF6')+'22', color:STATUS_COLORS[f.status]||'#8B5CF6',
                fontSize:11, fontWeight:800, fontFamily:ff, cursor:'pointer', appearance:'none', flexShrink:0,
                backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27 fill=%27none%27 stroke=%27gray%27 stroke-width=%272%27><path d=%27M2 3.5L5 6.5L8 3.5%27/></svg>")',
                backgroundRepeat:'no-repeat', backgroundPosition:'right 9px center' }}>
              {CONTACT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {(isAdmin || f.agent_id === agent?.id) && (
              <button onClick={() => saveField('is_private', !f.is_private)}
                title={f.is_private ? 'Private: hidden from other agents in contact search. Click to make visible.' : 'Visible to all agents in contact search. Click to make private.'}
                style={{ border:'1px solid '+(f.is_private?'#F5A623':'var(--border)'), background: f.is_private?'rgba(245,166,35,.12)':'transparent', color: f.is_private?'#B45309':'var(--muted)', borderRadius:99, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff, flexShrink:0 }}>
                {f.is_private ? '🔒 Private' : '🔓 Shared'}
              </button>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {[f.phone, f.email, f.source && ('via '+f.source),
              daysSinceContact!==null && (daysSinceContact===0?'Reached today':'Last contact '+daysSinceContact+'d ago')
             ].filter(Boolean).join('  ·  ')}
          </div>
        </div>
        {/* actions, right-aligned */}
        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
          {f.phone && <ClickToCall phone={f.phone} contactName={(f.first_name||'')+' '+(f.last_name||'')} contactId={id} showLabel />}
          {f.email && (
            <button onClick={()=>window.open('mailto:'+f.email)} title="Email"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--panel)'} onMouseLeave={e=>e.currentTarget.style.background='var(--dim)'}>
              📧 Email
            </button>
          )}
          {f.phone && (
            <button onClick={()=>window.open('sms:'+f.phone)} title="Text"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:ff }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--panel)'} onMouseLeave={e=>e.currentTarget.style.background='var(--dim)'}>
              💬 Text
            </button>
          )}
          {isAdmin && (
            <button onClick={()=>setEditLayout(v=>!v)} title="Rearrange the panels on this page"
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:'1px solid '+(editLayout?'var(--brand)':'var(--border)'), background: editLayout ? 'var(--brand)' : 'var(--dim)', color: editLayout ? '#fff' : 'var(--muted)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
              {editLayout ? '✓ Done' : '⚙ Arrange'}
            </button>
          )}
        </div>
      </div>

      {editLayout && isAdmin && (
        <div style={{ background:'rgba(204,34,0,.06)', border:'1px solid var(--brand)', borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--brand)' }}>⚙ Arrange mode</span>
          <span style={{ fontSize:12, color:'var(--muted)', flex:1 }}>Drag the ⠿ handle on any panel to reorder. Click ✕ on a panel to hide it. Changes save for everyone.</span>
          <button onClick={saveLayoutNow}
            style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Save for everyone</button>
          <button onClick={()=>{ loadContactLayout(true).then(setContactLayout); setEditLayout(false) }}
            style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Cancel</button>
        </div>
      )}

      {/* ── THREE PANEL LAYOUT — GHL/HubSpot style ── */}
      <div className={cols3On ? "contact-3col" : ""} style={{ display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: '12px', alignItems: 'stretch' }}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL
        ══════════════════════════════════════════════════════ */}
        <div className="contact-col" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

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
                    style={{ padding: '3px 8px', borderRadius: '6px', border: "1px solid " + (f.status === s ? STATUS_COLORS[s] : 'var(--border)'), background: f.status === s ? STATUS_COLORS[s] + '18' : 'transparent', color: f.status === s ? STATUS_COLORS[s] : 'var(--muted)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* BUYER CRITERIA */}
          <Section title="Buyer Criteria" icon="🏡" defaultOpen={!!(f.buyer_type || f.budget_min || f.budget_max || (f.property_types||[]).length || (f.locations||[]).length)}>
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
          <Section title="Seller Info" icon="🏠" defaultOpen={!!(f.property_addr || f.asking_price || f.reason_selling)}>
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
                    title:      `Follow up with ${f.first_name} ${f.last_name || ''}",\n                    due_date:   f.next_followup,\n                    priority:   f.status === 'Hot' ? 'urgent' : f.status === 'Warm' ? 'high' : 'normal',\n                    status:     'pending',\n                    notes:      "Follow-up for ${f.first_name} — ${f.motivation || ''} ${f.timeline || ''}`.trim(),
                  })
                  toast('✅ Follow-up task created')
                } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
              }} style={{ width: '100%', justifyContent: 'center' }}>
                ✅ Create Follow-Up Task
              </Btn>
            </div>

            {/* Upcoming follow-up indicator */}
            {daysToFollowup !== null && (
              <div style={{ marginTop: '8px', padding: '8px 10px', background: daysToFollowup < 0 ? '#FEF2F2' : daysToFollowup <= 2 ? '#FFF7ED' : '#F0FDF4', borderRadius: '8px', border: "1px solid " + (daysToFollowup < 0 ? '#FECACA' : daysToFollowup <= 2 ? '#FED7AA' : '#BBF7D0'), fontSize: '12px', color: daysToFollowup < 0 ? '#DC2626' : daysToFollowup <= 2 ? '#C2410C' : '#166534', fontWeight: 600 }}>
                {daysToFollowup < 0 ? "⚠️ Follow-up overdue by " + (Math.abs(daysToFollowup)) + " days" : daysToFollowup === 0 ? '📅 Follow-up due today' : "📅 Follow-up in " + (daysToFollowup) + " days"}
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

          <CustomFieldsSection entity="contacts" customData={f.custom_data} onChange={saveCustomField} />

          {/* DANGER */}
          <div style={{ background: 'var(--panel)', borderRadius: '8px', border: '1px solid #FECACA', padding: '12px 14px' }}>
            <Btn variant="danger" size="sm" onClick={() => setConfirmDel(true)} style={{ width: '100%', justifyContent: 'center' }}>🗑 Delete Contact</Btn>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            CENTER — CONVERSATION TIMELINE
        ══════════════════════════════════════════════════════ */}
        <div className="contact-col">
          <div style={{ background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>💬 Conversation History</div>
              {/* HubSpot-style tabs */}
              <div style={{ display:'flex', gap:2 }}>
                {[
                  { id:'activity', label:'Activity', icon:'⚡' },
                  { id:'notes',    label:'Notes',    icon:'📝' },
                  { id:'calls',    label:'Calls',    icon:'📞' },
                  { id:'tasks',    label:'Tasks',    icon:'✅' },
                  { id:'emails',   label:'Emails',   icon:'📧' },
                ].map(tab => (
                  <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                    style={{ padding:'5px 10px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:ff, fontSize:11, fontWeight:700,
                      background: activeTab===tab.id ? 'var(--brand)' : 'transparent',
                      color: activeTab===tab.id ? '#fff' : 'var(--muted)' }}>
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{timeline.length} entries</span>
            </div>
            <div style={{ padding: '16px' }}>
              {activeTab === 'emails' ? (
                <EmailCompose
                  contact={contact}
                  contactId={id}
                  onSent={() => { loadTimeline(); setActiveTab('activity') }}
                />
              ) : (
                <AddToTimeline contactId={id} agentId={agent?.id} onAdded={loadTimeline} />
              )}

              {activeTab === 'calls' && isAdmin && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--dim)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>🔒 Recording Access for This Contact</div>
                  {recordingGrants.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                      {recordingGrants.map(g => (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.agents?.color || '#CC2200' }} />
                          <span style={{ flex: 1, color: 'var(--text)' }}>{g.agents?.name || 'Unknown agent'}</span>
                          <button onClick={() => revokeRecordingAccess(g.id)}
                            style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: 11, cursor: 'pointer', fontFamily: ff }}>Revoke</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={grantAgentId} onChange={e => setGrantAgentId(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 12, fontFamily: ff }}>
                      <option value="">Grant an agent access...</option>
                      {agents.filter(a => !recordingGrants.some(g => g.agent_id === a.id)).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <Btn size="sm" onClick={grantRecordingAccess} disabled={!grantAgentId}>Grant</Btn>
                  </div>
                </div>
              )}

              {tlLoading && <div style={{ textAlign: 'center', padding: '20px' }}><Spinner size={20} color="var(--muted)" /></div>}

              {!tlLoading && timeline.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>💬</div>
                  No history yet. Add a note above to start tracking.
                </div>
              )}

              {timeline
                .filter(item => {
                  if (activeTab === 'activity') return true
                  if (activeTab === 'notes')    return ['note','manual'].includes(item.type)
                  if (activeTab === 'calls')    return ['call_inbound','call_outbound','call'].includes(item.type)
                  if (activeTab === 'tasks')    return ['task','task_completed'].includes(item.type)
                  if (activeTab === 'emails')   return ['email'].includes(item.type)
                  return true
                })
                .map(item => <TimelineItem key={item.id + item.type} item={item} />)}
              {timeline.filter(item => {
                if (activeTab === 'activity') return true
                if (activeTab === 'notes')    return ['note','manual'].includes(item.type)
                if (activeTab === 'calls')    return ['call_inbound','call_outbound','call'].includes(item.type)
                if (activeTab === 'tasks')    return ['task','task_completed'].includes(item.type)
                if (activeTab === 'emails')   return ['email'].includes(item.type)
                return true
              }).length === 0 && (
                <div style={{ textAlign:'center', padding:'32px 16px', color:'var(--muted)', fontSize:12 }}>
                  No {activeTab} activity yet
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT — ACTIONS + DEALS + TASKS + FILES
        ══════════════════════════════════════════════════════ */}
        <div className="contact-col">
          <RightPanel contact={f} contactId={id} navigate={navigate} relDeals={relDeals} relTasks={relTasks} agents={agents} agent={agent} voiceNotes={voiceNotes} onRefreshTimeline={loadTimeline} layout={contactLayout} editLayout={editLayout} setLayout={setContactLayout} toast={toast} />
        </div>
      </div>

      <Confirm open={confirmDel} message={'Delete ' + f.first_name + ' ' + (f.last_name || '') + '? Cannot be undone.'} onConfirm={deleteContact} onCancel={() => setConfirmDel(false)} />
    </div>
  )
}
