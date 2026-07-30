// ═══════════════════════════════════════════════════════════════
// TargetOS — Mobile App Shell
// Top bar (back/title/notifications, safe-area) + bottom nav
// (Home/Contacts/Tasks/Calendar/More) + a full-screen More sheet.
// Navigation is generated from the SAME NAV_ITEMS + filterNavItems used
// by the desktop Layout.jsx (src/lib/navConfig.js) -- filtered through
// the app's real can()/role checker, not a separate hard-coded list.
// This is a navigation convenience layer only; it is not itself a
// security boundary -- routes remain protected by RequirePermission and
// each page's own permission checks + Supabase RLS regardless of what
// appears here.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'
import { InstallPrompt } from './InstallPrompt'
import { NotificationBell } from './NotificationBell'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV_ITEMS, filterNavItems, MOBILE_PRIMARY_IDS, navLabelForPath } from '../lib/navConfig'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const PRIMARY_ICONS = { '': '🏠', contacts: '👥', tasks: '✅', calendar: '📅' }

export function MobileLayout({ children }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { agent, isAdmin, signOut, can } = useAuth()
  const [showMore, setShowMore] = useState(false)
  const drawerRef = useRef(null)

  const activePath = location.pathname
  const role = agent?.role || 'agent'

  // Single filtered list -- same function, same inputs, as desktop.
  const authorizedNav = filterNavItems(NAV_ITEMS, { role, can })
  const primaryNav = MOBILE_PRIMARY_IDS
    .map(id => authorizedNav.find(n => n.id === id))
    .filter(Boolean)
  const moreNav = authorizedNav.filter(n => !MOBILE_PRIMARY_IDS.includes(n.id))

  const title = navLabelForPath(activePath) || 'TargetOS'
  // Not a top-level nav route (e.g. a detail page) -> show Back instead
  // of relying only on the bottom nav to get around.
  const topLevelPaths = new Set(authorizedNav.map(n => n.path))
  const showBack = !topLevelPaths.has(activePath) && activePath !== '/'

  // Close the More sheet on route change, lock body scroll while open,
  // and restore it on close/unmount (required: "body scroll restores
  // after closing").
  useEffect(() => { setShowMore(false) }, [activePath])
  useEffect(() => {
    if (!showMore) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) { if (e.key === 'Escape') setShowMore(false) }
    document.addEventListener('keydown', onKey)
    // Basic focus move into the sheet for keyboard/screen-reader users.
    drawerRef.current?.focus()
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener('keydown', onKey) }
  }, [showMore])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', fontFamily: ff }}>
      <InstallPrompt />

      {/* Top bar */}
      <header role="banner" style={{
        background: 'var(--sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.15)',
        paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'max(14px, env(safe-area-inset-left))', paddingRight: 'max(14px, env(safe-area-inset-right))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, flex: 1, minWidth: 0 }}>
          {showBack ? (
            <button onClick={() => navigate(-1)} aria-label="Back"
              style={{ background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 18, cursor: 'pointer', minWidth: 44, minHeight: 44, flexShrink: 0 }}>←</button>
          ) : (
            <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
              Target<span style={{ color: '#F5A623' }}>OS</span>
            </div>
          )}
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {showBack ? title : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isAdmin && <span style={{ fontSize: 10, fontWeight: 700, color: '#CC2200', background: 'rgba(204,34,0,.15)', padding: '3px 9px', borderRadius: 20 }}>ADMIN</span>}
          <NotificationBell />
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: agent?.color || '#CC2200', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>
            {agent?.name?.[0] || '?'}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main role="main" style={{ flex: 1, overflowY: 'auto', padding: 12, WebkitOverflowScrolling: 'touch' }}>
        {children}
      </main>

      {/* More drawer -- full-screen sheet, built from the same
          authorized nav list as the bottom bar and desktop sidebar. */}
      {showMore && (
        <div role="dialog" aria-modal="true" aria-label="More" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 900 }} onClick={() => setShowMore(false)}>
          <div ref={drawerRef} tabIndex={-1} onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--panel)', borderRadius: '20px 20px 0 0', padding: '20px 16px', maxHeight: '75vh', overflowY: 'auto', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 99, margin: '0 auto 16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {moreNav.map(item => (
                <button key={item.id} onClick={() => navigate(item.path)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 6px', minHeight: 68, background: activePath.startsWith(item.path) && item.path !== '/' ? 'rgba(204,34,0,.1)' : 'var(--dim)', border: '1px solid ' + (activePath.startsWith(item.path) && item.path !== '/' ? 'rgba(204,34,0,.3)' : 'var(--border)'), borderRadius: 12, cursor: 'pointer', fontFamily: ff }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={signOut}
              style={{ width: '100%', marginTop: 14, minHeight: 44, background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.2)', borderRadius: 10, color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff }}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav aria-label="Primary" style={{
        background: 'var(--panel)', borderTop: '1px solid var(--border)', display: 'flex', flexShrink: 0, zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {primaryNav.map(item => {
          const isActive = item.path === '/' ? activePath === '/' : activePath.startsWith(item.path)
          return (
            <button key={item.id} onClick={() => navigate(item.path)} aria-current={isActive ? 'page' : undefined}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: ff, borderTop: '2px solid ' + (isActive ? '#CC2200' : 'transparent') }}>
              <span style={{ fontSize: 18 }}>{PRIMARY_ICONS[item.id] || item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: isActive ? '#CC2200' : 'var(--muted)' }}>{item.label}</span>
            </button>
          )
        })}
        <button onClick={() => setShowMore(s => !s)} aria-expanded={showMore} aria-haspopup="dialog"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 56, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: ff, borderTop: '2px solid ' + (showMore ? '#CC2200' : 'transparent') }}>
          <span style={{ fontSize: 18 }}>☰</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: showMore ? '#CC2200' : 'var(--muted)' }}>More</span>
        </button>
      </nav>
    </div>
  )
}
