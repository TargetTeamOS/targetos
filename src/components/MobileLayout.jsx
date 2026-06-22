import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const BOTTOM_NAV = [
  { id: '/',          icon: '🏠', label: 'Home'      },
  { id: '/contacts',  icon: '👥', label: 'Contacts'  },
  { id: '/production',icon: '📊', label: 'Board'     },
  { id: '/tasks',     icon: '✓',  label: 'Tasks'     },
  { id: '/more',      icon: '☰',  label: 'More'      },
]

const MORE_NAV = [
  { id: '/listings',    icon: '🏡', label: 'Listings'        },
  { id: '/pipeline',    icon: '📈', label: 'Pipeline'        },
  { id: '/transactions',icon: '📋', label: 'Transactions'    },
  { id: '/offers',      icon: '📝', label: 'Offers'          },
  { id: '/gifts',       icon: '🎁', label: 'Gifts'           },
  { id: '/calls',       icon: '📞', label: 'Calls'           },
  { id: '/openhouse',   icon: '🏠', label: 'Open House'      },
  { id: '/listingprep', icon: '📋', label: 'Listing Prep'    },
  { id: '/signs',       icon: '🪧', label: 'Signs'           },
  { id: '/calendar',    icon: '📅', label: 'Calendar'        },
  { id: '/announcements',icon:'📣', label: 'Announcements'   },
  { id: '/email',       icon: '✉',  label: 'Email'           },
  { id: '/settings',    icon: '⚙',  label: 'Settings'        },
]

export function MobileLayout({ children }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { agent, isAdmin, signOut } = useAuth()
  const [showMore, setShowMore] = useState(false)

  const activePath = location.pathname

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)', fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* Top bar */}
      <div style={{ background:'var(--sidebar)', padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,.15)' }}>
        <div style={{ fontSize:'18px', fontWeight:900, color:'#fff' }}>
          Target<span style={{ color:'#F5A623' }}>OS</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {isAdmin && <span style={{ fontSize:'10px', fontWeight:700, color:'#CC2200', background:'rgba(204,34,0,.15)', padding:'3px 9px', borderRadius:'20px' }}>ADMIN</span>}
          <div style={{ width:30, height:30, borderRadius:'50%', background:agent?.color||'#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:800, color:'#fff' }}>
            {agent?.name?.[0]||'?'}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
        {children}
      </div>

      {/* More drawer */}
      {showMore && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:900 }} onClick={() => setShowMore(false)}>
          <div style={{ position:'absolute', bottom:'56px', left:0, right:0, background:'var(--panel)', borderRadius:'20px 20px 0 0', padding:'20px 16px', maxHeight:'70vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:'36px', height:'4px', background:'var(--border)', borderRadius:'99px', margin:'0 auto 16px' }}/>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px' }}>
              {MORE_NAV.map(item => (
                <button key={item.id} onClick={() => { navigate(item.id); setShowMore(false) }}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'5px', padding:'12px 6px', background: activePath.startsWith(item.id) ? 'rgba(204,34,0,.1)' : 'var(--dim)', border:`1px solid ${activePath.startsWith(item.id)?'rgba(204,34,0,.3)':'var(--border)'}`, borderRadius:'12px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
                  <span style={{ fontSize:'20px' }}>{item.icon}</span>
                  <span style={{ fontSize:'10px', fontWeight:600, color:'var(--text)', textAlign:'center' }}>{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={signOut}
              style={{ width:'100%', marginTop:'14px', background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'10px', color:'#DC2626', fontSize:'13px', fontWeight:600, padding:'11px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ background:'var(--panel)', borderTop:'1px solid var(--border)', display:'flex', flexShrink:0, height:'56px', zIndex:100 }}>
        {BOTTOM_NAV.map(item => {
          const isActive = item.id === '/more' ? showMore : (activePath === item.id || (item.id !== '/' && activePath.startsWith(item.id)))
          return (
            <button key={item.id}
              onClick={() => { if (item.id === '/more') setShowMore(s => !s); else { navigate(item.id); setShowMore(false) }}}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'2px', background:'transparent', border:'none', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', borderTop:`2px solid ${isActive?'#CC2200':'transparent'}` }}>
              <span style={{ fontSize:'18px' }}>{item.icon}</span>
              <span style={{ fontSize:'9px', fontWeight:600, color:isActive?'#CC2200':'var(--muted)' }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
