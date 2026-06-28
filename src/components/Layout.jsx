// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Desktop Sidebar Layout
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { Avatar } from './UI'
import { NotificationBell } from './NotificationBell'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const NAV = [
  { id: '',             label: 'Dashboard',     icon: '🏠', roles: ['admin','secretary','agent'] },
  { id: 'contacts',     label: 'Contacts',      icon: '👥', roles: ['admin','secretary','agent'] },
  { id: 'production',   label: 'Production',    icon: '📊', roles: ['admin','secretary','agent'] },
  { id: 'performance',  label: 'Performance',   icon: '📈', roles: ['admin','secretary'] },
  { id: 'pipeline',     label: 'Pipeline',      icon: '🔀', roles: ['admin','secretary','agent'] },
  { id: 'listings',     label: 'Listings',      icon: '🏡', roles: ['admin','secretary','agent'] },
  { id: 'offers',       label: 'Offers',        icon: '📝', roles: ['admin','secretary','agent'] },
  { id: 'transactions', label: 'Transactions',  icon: '💼', roles: ['admin','secretary'] },
  { id: 'tasks',        label: 'Tasks',         icon: '✅', roles: ['admin','secretary','agent'] },
  { id: 'calendar',     label: 'Calendar',      icon: '📅', roles: ['admin','secretary','agent'] },
  { id: 'openhouse',    label: 'Open House',    icon: '🚪', roles: ['admin','secretary','agent'] },
  { id: 'gifts',        label: 'Gifts',         icon: '🎁', roles: ['admin','secretary'] },
  { id: 'call-flow', label: 'Call Flows',    icon: '🔀', roles: ['admin','secretary'] },
  { id: 'calls',        label: 'Calls',         icon: '📞', roles: ['admin','secretary','agent'] },
  { id: 'signs',        label: 'Signs',         icon: '🪧', roles: ['admin','secretary'] },
  { id: 'social-cards', label: 'Social Cards',  icon: '📱', roles: ['admin','secretary','agent'] },
  { id: 'listingprep',  label: 'Listing Prep',  icon: '🔧', roles: ['admin','secretary','agent'] },
  { DIVIDER: true },
  { id: 'announcements',label: 'Announcements', icon: '📣', roles: ['admin','secretary','agent'] },
  { id: 'briefing',     label: 'Daily Briefing',icon: '☀️',  roles: ['admin','secretary','agent'] },
  { id: 'email',        label: 'Email',         icon: '📧', roles: ['admin','secretary'] },
  { id: 'automations',  label: 'Automations',   icon: '⚡', roles: ['admin'] },
  { DIVIDER: true },
  { id: 'activitylog',  label: 'Activity Log',  icon: '📋', roles: ['admin'] },
  { id: 'admin',        label: 'Admin',         icon: '⚙️',  roles: ['admin'] },
  { id: 'settings',     label: 'Settings',      icon: '🔧', roles: ['admin','secretary','agent'] },
]

export function Layout({ children }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { agent, isAdmin, signOut } = useAuth()
  const { state, setSidebarCollapsed, setTheme } = useApp()
  const collapsed = state.collapsed

  const role = agent?.role || 'agent'

  const go = (id) => navigate('/' + id)
  const isActive = (id) => location.pathname === '/' + id || (id === '' && location.pathname === '/')

  const W = collapsed ? 60 : 220

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: ff }}>
      {/* SIDEBAR */}
      <aside style={{ width: W, minWidth: W, background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, transition: 'width .2s', overflow: 'hidden', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: collapsed ? '18px 0' : '18px 16px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '8px', background: '#CC2200', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: '#fff' }}>T</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '16px', letterSpacing: '-.02em' }}>Target<span style={{ color: '#F5A623' }}>OS</span></div>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(!collapsed)}
            style={{ background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,.7)', cursor: 'pointer', padding: '5px 8px', fontSize: '12px', fontFamily: ff }}>
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0', scrollbarWidth: 'none' }}>
          {NAV.map((item, i) => {
            if (item.DIVIDER) return <div key={i} style={{ height: '1px', background: 'rgba(255,255,255,.06)', margin: '6px 0' }} />
            if (!item.roles.includes(role)) return null

            const active = isActive(item.id)
            return (
              <button key={item.id} onClick={() => go(item.id)}
                title={collapsed ? item.label : ''}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '10px 0' : '9px 14px', justifyContent: collapsed ? 'center' : 'flex-start', border: 'none', background: active ? 'rgba(204,34,0,.3)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,.65)', fontSize: '13px', fontWeight: active ? 700 : 500, cursor: 'pointer', borderRadius: '0', fontFamily: ff, borderLeft: active ? '3px solid #CC2200' : '3px solid transparent', transition: 'all .12s' }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontSize: '16px', flexShrink: 0, width: '20px', textAlign: 'center' }}>{item.icon}</span>
                {!collapsed && item.label}
              </button>
            )
          })}
        </nav>

        {/* Agent Info */}
        <div style={{ padding: collapsed ? '12px 0' : '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          {!collapsed && <div style={{ marginBottom: '8px' }}><NotificationBell /></div>}
          {!collapsed && agent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <Avatar agent={agent} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '10px', textTransform: 'capitalize' }}>{agent.role}</div>
              </div>
            </div>
          )}
          {collapsed && agent && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <Avatar agent={agent} size={28} />
            </div>
          )}
          <button onClick={signOut}
            style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,.5)', fontSize: '11px', padding: '7px', cursor: 'pointer', fontFamily: ff, textAlign: 'center' }}>
            {collapsed ? '↩' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 28px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
