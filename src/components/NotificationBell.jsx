// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Notification Bell
// Shows unread count in sidebar. Dropdown with all notifications.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getNotifications, markRead, markAllRead } from '../lib/notifications'
import { fmtDateTime } from '../lib/utils'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const TYPE_ICONS = {
  info:     'ℹ️',
  task:     '✅',
  deal:     '📊',
  contact:  '👤',
  listing:  '🏡',
  alert:    '⚠️',
  success:  '✅',
}

export function NotificationBell() {
  const { agent } = useAuth()
  const navigate   = useNavigate()
  const [open,      setOpen]      = useState(false)
  const [notifs,    setNotifs]    = useState([])
  const [unread,    setUnread]    = useState(0)
  const [loading,   setLoading]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!agent?.id) return
    loadNotifs()

    // Realtime subscription for new notifications
    // Remove any stale channel first (guards against React Strict Mode double-fire)
    const chName = "notifs_" + agent.id
    supabase.removeChannel(supabase.channel(chName))
    const sub = supabase.channel(chName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: "agent_id=eq." + agent.id
      }, () => loadNotifs())
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [agent?.id])

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function loadNotifs() {
    if (!agent?.id) return
    const data = await getNotifications(agent.id, 30)
    setNotifs(data)
    setUnread(data.filter(n => !n.read).length)
  }

  async function handleClick(notif) {
    await markRead(notif.id)
    setNotifs(ns => ns.map(n => n.id === notif.id ? { ...n, read: true } : n))
    setUnread(u => Math.max(0, u - 1))
    if (notif.link) { navigate(notif.link); setOpen(false) }
  }

  async function handleMarkAll() {
    await markAllRead(agent.id)
    setNotifs(ns => ns.map(n => ({ ...n, read: true })))
    setUnread(0)
  }

  return (
    <div ref={ref} style={{ position: 'relative', fontFamily: ff }}>
      {/* Bell Button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'relative', background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: 'rgba(255,255,255,.7)', fontSize: '16px' }}>
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#CC2200', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '99px', minWidth: '16px', textAlign: 'center' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', bottom: '44px', left: 0, width: '300px', background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', zIndex: 1000, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Notifications {unread > 0 && <span style={{ color: '#CC2200' }}>({unread})</span>}</div>
            {unread > 0 && (
              <button onClick={handleMarkAll} style={{ fontSize: '11px', color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifs.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                No notifications yet
              </div>
            )}
            {notifs.map(n => (
              <div key={n.id} onClick={() => handleClick(n)}
                style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: n.link ? 'pointer' : 'default', background: n.read ? 'transparent' : 'rgba(204,34,0,.04)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}
                onMouseEnter={e => { if (n.link) e.currentTarget.style.background = 'var(--hov)' }}
                onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(204,34,0,.04)' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{TYPE_ICONS[n.type] || 'ℹ️'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: n.read ? 500 : 700, color: 'var(--text)', marginBottom: '2px' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: '11px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '3px' }}>{fmtDateTime(n.created_at)}</div>
                </div>
                {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#CC2200', flexShrink: 0, marginTop: '4px' }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
