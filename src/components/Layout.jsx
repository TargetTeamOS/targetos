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
  // ── MAIN ──────────────────────────────────────────────────────────
  { id: '',              label: 'Dashboard',      icon: '🏠', roles: ['admin','secretary','agent'] },
  { id: 'contacts',      label: 'Contacts',       icon: '👥', roles: ['admin','secretary','agent'] },
  { id: 'tasks',         label: 'Tasks',          icon: '✅', roles: ['admin','secretary','agent'] },
  { id: 'calendar',      label: 'Calendar',       icon: '📅', roles: ['admin','secretary','agent'] },

  // ── BOARD 1: PRODUCTION ───────────────────────────────────────────
  { id: 'production',    label: 'Production',     icon: '📊', roles: ['admin','secretary','agent'] },
  { id: 'performance',   label: 'Performance',    icon: '📈', roles: ['admin','secretary'] },
  { id: 'reports',       label: 'Reports',        icon: '📉', roles: ['admin','secretary'] },

  // ── BOARD 2: TC BOARD ────────────────────────────────────────────
  { id: 'tc',            label: 'TC Board',       icon: '🎯', roles: ['admin','secretary'] },

  // ── BOARD 3: LISTINGS ────────────────────────────────────────────
  { id: 'my-listings',   label: 'My Listings',    icon: '🏡', roles: ['admin','secretary','agent'] },
  { id: 'listings',      label: 'All Listings',   icon: '🔍', roles: ['admin','secretary','agent'] },
  { id: 'openhouse',     label: 'Open House',     icon: '🚪', roles: ['admin','secretary','agent'] },
  { id: 'offers',        label: 'Offers',         icon: '📝', roles: ['admin','secretary','agent'] },
  { id: 'performance',   label: 'Agent Performance', icon: '📊', roles: ['admin','secretary'] },

  // ── COMMUNICATION ─────────────────────────────────────────────────
  { id: 'calls',         label: 'Calls & SMS',    icon: '📞', roles: ['admin','secretary','agent'] },
  { id: 'email',         label: 'Email',          icon: '📧', roles: ['admin','secretary'] },

  // ── TOOLS ─────────────────────────────────────────────────────────
  { id: 'segments',      label: 'Segments',       icon: '🎯', roles: ['admin','secretary'] },
  { id: 'gifts',         label: 'Gifts',          icon: '🎁', roles: ['admin','secretary'] },
  { id: 'signs',         label: 'Signs',          icon: '🪧', roles: ['admin','secretary'] },
  { id: 'social-cards',  label: 'Social Cards',   icon: '📱', roles: ['admin','secretary','agent'] },
  { id: 'mortgage',      label: 'Calculator',     icon: '🏦', roles: ['admin','secretary','agent'] },
  { id: 'briefing',      label: 'Daily Briefing', icon: '☀️',  roles: ['admin','secretary','agent'] },
  { id: 'announcements', label: 'Announcements',  icon: '📣', roles: ['admin','secretary','agent'] },

  // ── ADMIN ─────────────────────────────────────────────────────────
  { id: 'automations',   label: 'Automations',    icon: '⚡', roles: ['admin'] },
  { id: 'call-flow',     label: 'Call Flows',     icon: '🔀', roles: ['admin'] },
  { id: 'website',       label: 'Website',        icon: '🌐', roles: ['admin'] },
  { id: 'activitylog',   label: 'Activity Log',   icon: '📋', roles: ['admin'] },
  { id: 'custom-fields', label: 'Custom Fields',  icon: '🔲', roles: ['admin'] },
  { id: 'admin',         label: 'Admin',          icon: '⚙️',  roles: ['admin'] },
  { id: 'settings',      label: 'Settings',       icon: '🔧', roles: ['admin','secretary','agent'] },
]

export function Layout({ children }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { agent, isAdmin, signOut } = useAuth()
  const { state, setSidebarCollapsed, setTheme } = useApp()
  const collapsed = state.collapsed
  const custom = state.custom || {}

  const role = agent?.role || 'agent'

  const go = (id) => navigate('/' + id)
  const isActive = (id) => location.pathname === '/' + id || (id === '' && location.pathname === '/')

  const W = collapsed ? 60 : 220

  return (
    <>
    <div style={{ display: 'flex', height: '100vh', fontFamily: ff }}>
      {/* SIDEBAR */}
      <aside style={{ width: W, minWidth: W, background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, transition: 'width .2s', overflow: 'hidden', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: collapsed ? '18px 0' : '18px 16px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          {!collapsed && (
            <div style={{ display:'flex', alignItems:'center', gap:9, flex:1, minWidth:0 }}>
              {custom.logoUrl ? (
                <img src={custom.logoUrl} alt="logo" style={{ height:34, maxWidth:150, objectFit:'contain' }}
                  onError={e=>{ e.target.style.display='none' }} />
              ) : (
                <>
                  {/* Square icon */}
                  <div style={{ width:32, height:32, borderRadius:7, background:'#1B2B4B', border:'1px solid rgba(255,255,255,.12)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, gap:1 }}>
                    <span style={{ color:'#fff', fontWeight:900, fontSize:9, letterSpacing:'.1em', lineHeight:1 }}>TARGET</span>
                    <div style={{ display:'flex', alignItems:'center', gap:2, width:'100%', padding:'0 3px' }}>
                      <div style={{ flex:1, height:'1px', background:'#CC2200' }} />
                      <span style={{ color:'#CC2200', fontWeight:800, fontSize:6, letterSpacing:'.15em' }}>TEAM</span>
                      <div style={{ flex:1, height:'1px', background:'#CC2200' }} />
                    </div>
                  </div>
                  {/* Text */}
                  <div style={{ lineHeight:1 }}>
                    <div style={{ color:'#fff', fontWeight:900, fontSize:15, letterSpacing:'.06em', textTransform:'uppercase' }}>Target</div>
                    <div style={{ color:'rgba(255,255,255,.45)', fontWeight:600, fontSize:9, letterSpacing:'.15em', textTransform:'uppercase', marginTop:1 }}>Team · KW Valley Realty</div>
                  </div>
                </>
              )}
            </div>
          )}
          {collapsed && (
            <div style={{ width:32, height:32, borderRadius:7, background:'#1B2B4B', border:'1px solid rgba(255,255,255,.12)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1 }}>
              <span style={{ color:'#fff', fontWeight:900, fontSize:7, letterSpacing:'.1em' }}>TGT</span>
              <div style={{ display:'flex', alignItems:'center', gap:1, width:'100%', padding:'0 3px' }}>
                <div style={{ flex:1, height:'1px', background:'#CC2200' }} />
                <span style={{ color:'#CC2200', fontWeight:800, fontSize:5 }}>TM</span>
                <div style={{ flex:1, height:'1px', background:'#CC2200' }} />
              </div>
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
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '10px 0' : '9px 14px', justifyContent: collapsed ? 'center' : 'flex-start', border: 'none', background: active ? (custom.brandColor||'#CC2200') + '40' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,.65)', fontSize: '13px', fontWeight: active ? 700 : 500, cursor: 'pointer', borderRadius: '0', fontFamily: ff, borderLeft: active ? '3px solid ' + (custom.brandColor||'#CC2200') : '3px solid transparent', transition: 'all .12s' }}
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
          {!collapsed && (
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key:'k', metaKey:true, bubbles:true }))}
              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'7px 10px', borderRadius:7, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.5)', fontSize:11, fontFamily:ff, cursor:'pointer', marginBottom:8, textAlign:'left' }}>
              <span style={{ fontSize:13 }}>🔍</span>
              <span style={{ flex:1 }}>Search...</span>
              <kbd style={{ background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)', borderRadius:4, padding:'1px 5px', fontSize:9, fontFamily:'monospace', flexShrink:0 }}>⌘K</kbd>
            </button>
          )}
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
    </>
  )
}
