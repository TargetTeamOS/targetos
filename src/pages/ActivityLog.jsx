// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Activity Log
// Tracks every action on every record in the CRM.
// Who did what, when, on which record.
// Admin can see all. Agents see their own.
// Every record (contact, deal, listing, task, etc.)
// has its own inline activity feed.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { fmtDateTime, fmtDate, initials } from '../lib/utils'
import {
  PageHeader, SearchInput, Select, Avatar, Pill, Loading, Empty,
  Tabs, SectionTitle, Btn
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── TABLE LABELS ─────────────────────────────────────────────────
const TABLE_LABELS = {
  contacts:       { label: 'Contact',      icon: '👤', color: '#0EA5E9' },
  deals:          { label: 'Deal',         icon: '📊', color: '#10B981' },
  listings:       { label: 'Listing',      icon: '🏡', color: '#F5A623' },
  tasks:          { label: 'Task',         icon: '✅', color: '#8B5CF6' },
  gifts:          { label: 'Gift',         icon: '🎁', color: '#EC4899' },
  offers:         { label: 'Offer',        icon: '📝', color: '#6366F1' },
  transactions:   { label: 'Transaction',  icon: '💼', color: '#14B8A6' },
  calls:          { label: 'Call',         icon: '📞', color: '#F97316' },
  open_houses:    { label: 'Open House',   icon: '🚪', color: '#84CC16' },
  oh_visitors:    { label: 'OH Visitor',   icon: '🙋', color: '#22D3EE' },
  announcements:  { label: 'Announcement', icon: '📣', color: '#CC2200' },
  signs:          { label: 'Sign',         icon: '🪧', color: '#A78BFA' },
  listing_prep:   { label: 'Listing Prep', icon: '🔧', color: '#FB923C' },
  calendar_events:{ label: 'Event',        icon: '📅', color: '#34D399' },
}

// ── ACTION LABELS ────────────────────────────────────────────────
const ACTION_LABELS = {
  created:  { label: 'Created',  color: '#10B981', icon: '✨' },
  updated:  { label: 'Updated',  color: '#3B82F6', icon: '✏️' },
  deleted:  { label: 'Deleted',  color: '#DC2626', icon: '🗑️' },
  viewed:   { label: 'Viewed',   color: '#94A3B8', icon: '👁' },
  status:   { label: 'Status',   color: '#F5A623', icon: '🔄' },
  note:     { label: 'Note',     color: '#8B5CF6', icon: '📝' },
  assigned: { label: 'Assigned', color: '#0EA5E9', icon: '👤' },
  completed:{ label: 'Completed',color: '#10B981', icon: '✅' },
}

// ── FETCH LOGS ───────────────────────────────────────────────────
async function fetchLogs({ agentId, tableFilter, actionFilter, search, limit = 100, isAdmin }) {
  let q = supabase
    .from('audit_log')
    .select('*, agents(id, name, color, role)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!isAdmin && agentId) q = q.eq('agent_id', agentId)
  if (tableFilter) q = q.eq('table_name', tableFilter)
  if (actionFilter) q = q.eq('action', actionFilter)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ── LOG ITEM COMPONENT ───────────────────────────────────────────
function LogItem({ log, onClick }) {
  const table  = TABLE_LABELS[log.table_name] || { label: log.table_name, icon: '📋', color: '#94A3B8' }
  const action = ACTION_LABELS[log.action]    || { label: log.action, color: '#94A3B8', icon: '•' }

  return (
    <div onClick={() => onClick?.(log)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default', transition: 'background .1s' }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--hov)' }}
      onMouseLeave={e => e.currentTarget.style.background = ''}>

      {/* Agent Avatar */}
      <Avatar agent={log.agents} size={32} style={{ flexShrink: 0, marginTop: '2px' }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
            {log.agents?.name || 'System'}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {action.icon} {action.label.toLowerCase()}
          </span>
          <span style={{ fontSize: '11px', background: table.color + '18', color: table.color, padding: '1px 6px', borderRadius: '99px', fontWeight: 600 }}>
            {table.icon} {table.label}
          </span>
        </div>

        {/* What changed */}
        {log.field_name && (
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '2px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{log.field_name}</span>
            {log.old_value && log.new_value && (
              <span> changed from <span style={{ color: '#DC2626' }}>{log.old_value}</span> → <span style={{ color: '#10B981' }}>{log.new_value}</span></span>
            )}
            {!log.old_value && log.new_value && (
              <span> set to <span style={{ color: '#10B981' }}>{log.new_value}</span></span>
            )}
          </div>
        )}

        {/* Metadata */}
        {log.metadata?.description && (
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{log.metadata.description}</div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
          {fmtDateTime(log.created_at)}
          {log.record_id && <span style={{ marginLeft: '8px', fontFamily: 'monospace', opacity: 0.5 }}>{log.record_id.slice(0, 8)}…</span>}
        </div>
      </div>

      {/* Action pill */}
      <Pill label={action.label} color={action.color} />
    </div>
  )
}

// ── MAIN ACTIVITY LOG PAGE ───────────────────────────────────────
export function ActivityLog() {
  const navigate = useNavigate()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()

  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter,setActionFilter]= useState('')
  const [agentFilter, setAgentFilter] = useState('')
  const [search,      setSearch]      = useState('')
  const [tab,         setTab]         = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchLogs({
        agentId:      agentFilter || agent?.id,
        tableFilter,
        actionFilter,
        isAdmin:      isAdmin || canManage,
        limit:        200,
      })
      setLogs(data)
    } catch(e) {
      toast('Failed to load activity: ' + e.message, '#DC2626')
    } finally {
      setLoading(false)
    }
  }, [agentFilter, tableFilter, actionFilter, isAdmin, canManage, agent?.id])

  useEffect(() => { load() }, [load])

  // Realtime subscription
  useEffect(() => {
    const sub = supabase.channel('rt_audit_log')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [load])

  // Filter by search
  const filtered = logs.filter(l => {
    if (tab === 'mine' && l.agent_id !== agent?.id) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        l.agents?.name?.toLowerCase().includes(q) ||
        l.table_name?.toLowerCase().includes(q) ||
        l.action?.toLowerCase().includes(q) ||
        l.field_name?.toLowerCase().includes(q) ||
        l.new_value?.toLowerCase().includes(q) ||
        l.old_value?.toLowerCase().includes(q) ||
        l.metadata?.description?.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Stats
  const today = new Date().toISOString().slice(0, 10)
  const todayLogs  = logs.filter(l => l.created_at?.startsWith(today))
  const createLogs = logs.filter(l => l.action === 'created')
  const updateLogs = logs.filter(l => l.action === 'updated')

  const tableOptions = Object.entries(TABLE_LABELS).map(([k, v]) => ({ value: k, label: v.icon + ' ' + v.label }))
  const actionOptions = Object.entries(ACTION_LABELS).map(([k, v]) => ({ value: k, label: v.icon + ' ' + v.label }))

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Activity Log"
        sub="Every action on every record — who, what, when"
      />

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Logged', value: logs.length, color: '#3B82F6' },
          { label: 'Today', value: todayLogs.length, color: '#10B981' },
          { label: 'Created', value: createLogs.length, color: '#F5A623' },
          { label: 'Updated', value: updateLogs.length, color: '#8B5CF6' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '14px 16px', borderTop: "3px solid " + (s.color) }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      {(isAdmin || canManage) && (
        <Tabs tabs={[{ id: 'all', label: 'All Activity' }, { id: 'mine', label: 'My Activity' }]} active={tab} onChange={setTab} />
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search activity..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={tableFilter} onChange={e => setTableFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Record Types</option>
          {tableOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Actions</option>
          {actionOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(isAdmin || canManage) && (
          <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <Btn variant="secondary" size="sm" onClick={load}>↻ Refresh</Btn>
      </div>

      {loading && <Loading />}

      {!loading && filtered.length === 0 && (
        <Empty icon="📋" title="No activity yet" sub="Activity will appear here as your team uses the CRM." />
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '4px 16px' }}>
          {filtered.map(log => (
            <LogItem key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// INLINE RECORD ACTIVITY FEED
// Use this inside any detail panel (contact, deal, listing, etc.)
// to show the activity history for that specific record.
// Usage: <RecordActivity recordId={contact.id} tableName="contacts" />
// ═══════════════════════════════════════════════════════════════

export function RecordActivity({ recordId, tableName }) {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!recordId) return
    supabase
      .from('audit_log')
      .select('*, agents(id, name, color)')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setLogs(data || []); setLoading(false) })
  }, [recordId])

  if (loading) return <div style={{ padding: '12px 0', color: 'var(--muted)', fontSize: '12px', fontFamily: ff }}>Loading activity...</div>

  if (!logs.length) return (
    <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '12px', fontFamily: ff }}>
      No activity recorded yet
    </div>
  )

  return (
    <div style={{ fontFamily: ff }}>
      {logs.map(log => {
        const action = ACTION_LABELS[log.action] || { label: log.action, color: '#94A3B8', icon: '•' }
        return (
          <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <Avatar agent={log.agents} size={26} style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                <strong>{log.agents?.name || 'System'}</strong>{' '}
                <span style={{ color: action.color }}>{action.icon} {log.action}</span>
                {log.field_name && <span style={{ color: 'var(--muted)' }}> · {log.field_name}</span>}
              </div>
              {log.field_name && log.old_value && log.new_value && (
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  <span style={{ color: '#DC2626' }}>{log.old_value}</span>
                  {' → '}
                  <span style={{ color: '#10B981' }}>{log.new_value}</span>
                </div>
              )}
              {log.metadata?.description && (
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{log.metadata.description}</div>
              )}
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{fmtDateTime(log.created_at)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
