import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

const NAV = [
  { section: 'MAIN' },
  { id: '/',            icon: '🏠', label: 'Dashboard'       },
  { id: '/contacts',    icon: '👥', label: 'Contacts'        },
  { id: '/production',  icon: '📊', label: 'Production'      },
  { id: '/listings',    icon: '🏡', label: 'Listings'        },
  { id: '/pipeline',    icon: '📈', label: 'Pipeline'        },
  { section: 'TRANSACTIONS' },
  { id: '/transactions',icon: '📋', label: 'Transactions'    },
  { id: '/offers',      icon: '📝', label: 'Offers'          },
  { id: '/gifts',       icon: '🎁', label: 'Gifts'           },
  { section: 'TOOLS' },
  { id: '/tasks',       icon: '✓',  label: 'Tasks'           },
  { id: '/calls',       icon: '📞', label: 'Phone & Calls'   },
  { id: '/email',       icon: '✉',  label: 'Email Blast'     },
  { id: '/designer',    icon: '🎨', label: 'Email Designer'  },
  { section: 'OPERATIONS' },
  { id: '/openhouse',   icon: '🏠', label: 'Open House'      },
  { id: '/listingprep', icon: '📋', label: 'Listing Prep'    },
  { id: '/signs',       icon: '🪧', label: 'Sign Tracker'    },
  { id: '/calendar',    icon: '📅', label: 'Calendar'        },
  { section: 'TEAM' },
  { id: '/announcements',icon:'📣', label: 'Announcements'   },
  { id: '/briefing',    icon: '📧', label: 'Daily Briefing'  },
  { id: '/automations', icon: '⚡', label: 'Automations'     },
  { section: 'ADMIN', adminOnly: true },
  { id: '/admin',       icon: '👑', label: 'Admin Panel',    adminOnly: true },
  { id: '/activitylog', icon: '📋', label: 'Activity Log',   adminOnly: true },
  { section: 'SETTINGS' },
  { id: '/settings',    icon: '⚙',  label: 'Settings'        },
]

export function Layout({ children }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { agent, isAdmin, signOut } = useAuth()
  const { state, dispatch } = useApp()
  const collapsed = state.sidebarCollapsed

  function go(path) { navigate(path) }

  const activePath = location.pathname

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <div className="sidebar" style={{ width: collapsed ? '56px' : '220px', minWidth: collapsed ? '56px' : '220px' }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '16px 10px' : '18px 16px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', gap:'10px' }}>
          {!collapsed && (
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'18px', fontWeight:900, color:'#fff', letterSpacing:'-.3px' }}>
                Target<span style={{ color:'#F5A623' }}>OS</span>
              </div>
              <div style={{ fontSize:'9px', color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:'1.5px', marginTop:'2px' }}>
                Target Team
              </div>
            </div>
          )}
          <button onClick={() => dispatch({ type:'TOGGLE_SIDEBAR' })}
            style={{ background:'rgba(255,255,255,.06)', border:'none', borderRadius:'7px', color:'rgba(255,255,255,.5)', width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:'12px', flexShrink:0 }}>
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'8px 8px', overflowY:'auto', overflowX:'hidden' }}>
          {NAV.map((item, i) => {
            if (item.section) {
              if (item.adminOnly && !isAdmin) return null
              if (collapsed) return <div key={i} style={{ height:'1px', background:'rgba(255,255,255,.06)', margin:'6px 4px' }}/>
              return (
                <div key={i} style={{ fontSize:'9px', fontWeight:700, color:'rgba(255,255,255,.25)', textTransform:'uppercase', letterSpacing:'1.2px', padding:'12px 8px 4px' }}>
                  {item.section}
                </div>
              )
            }

            if (item.adminOnly && !isAdmin) return null

            const isActive = activePath === item.id || (item.id !== '/' && activePath.startsWith(item.id))

            return (
              <button key={item.id} onClick={() => go(item.id)}
                title={collapsed ? item.label : undefined}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:'9px',
                  padding: collapsed ? '9px 0' : '8px 9px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius:'8px', border:'none',
                  background: isActive ? 'rgba(204,34,0,.25)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,.6)',
                  fontSize:'12px', fontWeight: isActive ? 700 : 500,
                  cursor:'pointer', marginBottom:'1px', textAlign:'left',
                  fontFamily:'Inter,system-ui,sans-serif',
                  borderLeft: isActive ? '2px solid #CC2200' : '2px solid transparent',
                  transition:'all .12s',
                }}>
                <span style={{ fontSize:'14px', width:'18px', textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                {!collapsed && <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Agent info + sign out */}
        <div style={{ padding: collapsed ? '10px 6px' : '12px 10px', borderTop:'1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'9px' }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:agent?.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:800, color:'#fff', flexShrink:0 }}>
              {agent?.name?.[0]||'?'}
            </div>
            {!collapsed && (
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'12px', fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{agent?.name}</div>
                <div style={{ fontSize:'10px', color:'rgba(255,255,255,.4)', textTransform:'capitalize' }}>{agent?.role}</div>
              </div>
            )}
            {!collapsed && (
              <button onClick={signOut} title="Sign out"
                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.3)', fontSize:'13px', padding:'4px', flexShrink:0 }}
                onMouseEnter={e => e.currentTarget.style.color='rgba(255,255,255,.7)'}
                onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,.3)'}>
                ↩
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
