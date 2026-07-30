// ═══════════════════════════════════════════════════════════════
// Shared navigation config — ONE definition, filtered through the same
// real permission logic for both desktop (Layout.jsx) and mobile
// (MobileLayout.jsx). Replaces two separate hard-coded lists that used
// to drift independently.
//
// Items with a `perm` key are gated by the app's real permission system
// (buildPermissionChecker/can() from src/lib/permissions.js — respects
// admin-configured per-agent overrides, not just role). Items without a
// `perm` key keep the existing role-list convention unchanged from
// before this file existed — nothing here invents a new permission key
// that doesn't already exist in DEFAULT_PERMISSIONS, and nothing here
// grants broader access than the pre-existing desktop nav already did.
//
// IMPORTANT: this list controls what appears in navigation only. It is
// NOT a security boundary by itself — actual route/data access is (and
// must remain) enforced by RequirePermission on the route, and by each
// page's own permission checks + Supabase RLS. Hiding an item here does
// not substitute for those.
// ═══════════════════════════════════════════════════════════════

export const NAV_ITEMS = [
  { id: '',              path: '/',              label: 'Dashboard',           icon: '🏠', roles: ['admin', 'secretary', 'agent'] },
  { id: 'contacts',      path: '/contacts',      label: 'Contacts',            icon: '👥', perm: 'contacts.view',  roles: ['admin', 'secretary', 'agent'] },
  { id: 'tasks',         path: '/tasks',         label: 'Tasks',               icon: '✅', perm: 'tasks.view',     roles: ['admin', 'secretary', 'agent'] },
  { id: 'calendar',      path: '/calendar',      label: 'Calendar',            icon: '📅', roles: ['admin', 'secretary', 'agent'] },
  { id: 'production',    path: '/production',    label: 'Production',         icon: '📊', perm: 'deals.view',     roles: ['admin', 'secretary', 'agent'] },
  { id: 'analytics',     path: '/analytics',     label: 'Reports & Analytics',icon: '📈', perm: 'reports.view',   roles: ['admin', 'secretary'] },
  { id: 'notepad',       path: '/notepad',       label: 'Notepad',             icon: '📝', roles: ['admin', 'secretary', 'agent'] },
  { id: 'tc',            path: '/tc',            label: 'TC Board',            icon: '🎯', roles: ['admin', 'secretary'] },
  { id: 'my-listings',   path: '/my-listings',   label: 'My Listings',         icon: '🏡', perm: 'listings.view',  roles: ['admin', 'secretary', 'agent'] },
  { id: 'listings',      path: '/listings',      label: 'All Listings',        icon: '🔍', perm: 'listings.view',  roles: ['admin', 'secretary', 'agent'] },
  { id: 'openhouse',     path: '/openhouse',     label: 'Open House',          icon: '🚪', roles: ['admin', 'secretary', 'agent'] },
  { id: 'offers',        path: '/offers',        label: 'Offers',              icon: '📝', roles: ['admin', 'secretary', 'agent'] },
  { id: 'calls',         path: '/calls',         label: 'Calls & SMS',         icon: '📞', perm: 'calls.view',     roles: ['admin', 'secretary', 'agent'] },
  { id: 'email',         path: '/email',         label: 'Email',               icon: '📧', roles: ['admin', 'secretary'] },
  { id: 'segments',      path: '/segments',      label: 'Segments',            icon: '🎯', roles: ['admin', 'secretary'] },
  { id: 'gifts',         path: '/gifts',         label: 'Gifts',               icon: '🎁', roles: ['admin', 'secretary'] },
  { id: 'signs',         path: '/signs',         label: 'Signs',               icon: '🪧', roles: ['admin', 'secretary'] },
  { id: 'marketing',     path: '/marketing',     label: 'Marketing',           icon: '🎨', roles: ['admin', 'secretary', 'agent'] },
  { id: 'mortgage',      path: '/mortgage',      label: 'Toolbox',             icon: '🧰', roles: ['admin', 'secretary', 'agent'] },
  { id: 'briefing',      path: '/briefing',      label: 'Daily Briefing',      icon: '☀️', roles: ['admin', 'secretary', 'agent'] },
  { id: 'announcements', path: '/announcements', label: 'Announcements',       icon: '📣', roles: ['admin', 'secretary', 'agent'] },
  { id: 'automations',   path: '/automations',   label: 'Automations',         icon: '⚡', perm: 'admin.automations', roles: ['admin'] },
  { id: 'website',       path: '/website',       label: 'Website',             icon: '🌐', roles: ['admin'] },
  { id: 'activitylog',   path: '/activitylog',   label: 'Activity Log',        icon: '📋', perm: 'admin.audit_log', roles: ['admin'] },
  { id: 'custom-fields', path: '/custom-fields', label: 'Custom Fields',       icon: '🔲', perm: 'admin.customize', roles: ['admin'] },
  { id: 'admin',         path: '/admin',         label: 'Admin',               icon: '⚙️', perm: 'admin.users',    roles: ['admin'] },
  { id: 'settings',      path: '/settings',      label: 'Settings',            icon: '🔧', roles: ['admin', 'secretary', 'agent'] },
]

// Filters a nav list against the current agent's role + real can()
// checker. Both Layout.jsx and MobileLayout.jsx call this so they can
// never drift into showing different things to the same person.
export function filterNavItems(items, { role, can }) {
  return items.filter(item => {
    if (item.perm && can && !can(item.perm)) return false
    if (item.roles && !item.roles.includes(role)) return false
    return true
  })
}

// Recommended mobile primary tabs (Home/Contacts/Tasks/Calendar/More),
// pulled from the same NAV_ITEMS so labels/icons/perm checks can't
// diverge from the "More" list. "More" itself is synthesized separately
// in MobileLayout since it isn't a real route.
export const MOBILE_PRIMARY_IDS = ['', 'contacts', 'tasks', 'calendar']

// Look up a nav item's label by pathname, for the mobile top bar title.
// Falls back gracefully for routes not in NAV_ITEMS (detail pages, etc.)
export function navLabelForPath(pathname) {
  const clean = pathname.split('/').filter(Boolean)[0] || ''
  const item = NAV_ITEMS.find(n => n.id === clean)
  return item ? item.label : null
}
