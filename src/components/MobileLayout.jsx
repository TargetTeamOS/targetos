import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { AGENTS } from '../lib/constants'

// Mobile bottom nav items
const MOBILE_NAV = [
  { id:'dash',         label:'Home',       icon:'🏠' },
  { id:'contacts',     label:'Contacts',   icon:'👥' },
  { id:'listings',     label:'Listings',   icon:'🏡' },
  { id:'production',   label:'Pipeline',   icon:'📊' },
  { id:'tasks',        label:'Tasks',      icon:'✓'  },
  { id:'more',         label:'More',       icon:'⋯'  },
]

const MORE_ITEMS = [
  { id:'transactions', label:'Transactions', icon:'📋' },
  { id:'calls',        label:'Calls',        icon:'📞' },
  { id:'email',        label:'Email',        icon:'✉'  },
  { id:'mortgage',     label:'Mortgage',     icon:'🔢' },
  { id:'openhouse',    label:'Open House',   icon:'🏡' },
  { id:'offers',       label:'Offers',       icon:'📝' },
  { id:'route',        label:'Route',        icon:'🗺' },
  { id:'signs',        label:'Signs',        icon:'🪧' },
  { id:'calendar',     label:'Calendar',     icon:'📅' },
  { id:'notes',        label:'Notes',        icon:'📓' },
  { id:'leadgen',      label:'Lead Gen',     icon:'🎯' },
  { id:'cards',        label:'Cards',        icon:'🖼' },
  { id:'mixads',       label:'Mix Ads',      icon:'📰' },
  { id:'listprep',     label:'List Prep',    icon:'📋' },
  { id:'gifts',        label:'Gifts',        icon:'🎁' },
  { id:'announce',     label:'Alerts',       icon:'📣' },
  { id:'automations',  label:'Automations',  icon:'⚡' },
  { id:'briefing',     label:'Daily Brief',  icon:'📧' },
  { id:'admin',        label:'Admin',        icon:'⚙️' },
  { id:'settings',     label:'Settings',     icon:'🔧' },
  { id:'news',         label:'News',         icon:'📰' },
]

export function MobileLayout({ page, setPage, children }) {
  const { state, dispatch } = useApp()
  const [showMore, setShowMore] = useState(false)
  const agent = AGENTS.find(a => a.id === state.currentAgent?.id) || AGENTS[3]

  // Live clock
  const [time, setTime] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t) }, [])
  const timeStr = time.toLocaleTimeString('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit', hour12:true })

  function nav(id) {
    if(id === 'more') { setShowMore(true); return }
    setPage(id)
    setShowMore(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden', fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* Top bar */}
      <div style={{ background:'var(--navy)', padding:'12px 16px 10px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, paddingTop:'max(12px, env(safe-area-inset-top))' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <img src="/logo.png" alt="TargetOS" style={{ width:28, height:28, objectFit:'contain' }}/>
          <div>
            <div style={{ color:'#fff', fontSize:'14px', fontWeight:800, lineHeight:1 }}>Target<span style={{ color:'#F5A623' }}>OS</span></div>
            <div style={{ color:'rgba(255,255,255,.4)', fontSize:'9px', letterSpacing:'1px' }}>KW Valley Realty</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ color:'rgba(255,255,255,.5)', fontSize:'11px', fontWeight:600 }}>{timeStr} ET</div>
          <div style={{ width:32, height:32, borderRadius:'50%', background:agent.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:800, color:'#fff', cursor:'pointer' }}
            onClick={() => setPage('settings')}>
            {agent.ini}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', WebkitOverflowScrolling:'touch', paddingBottom:'80px' }}>
        {children}
      </div>

      {/* Bottom navigation */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'var(--panel)', borderTop:'1px solid var(--border)', display:'flex', zIndex:100, paddingBottom:'max(8px, env(safe-area-inset-bottom))', boxShadow:'0 -4px 20px rgba(0,0,0,.08)' }}>
        {MOBILE_NAV.map(item => {
          const isActive = page === item.id
          return (
            <button key={item.id} onClick={() => nav(item.id)}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'8px 4px 4px', background:'transparent', border:'none', cursor:'pointer', position:'relative', minHeight:'54px' }}>
              {isActive && <div style={{ position:'absolute', top:0, left:'25%', right:'25%', height:2, background:'#CC2200', borderRadius:'0 0 3px 3px' }}/>}
              <span style={{ fontSize:'20px', lineHeight:1, marginBottom:'3px' }}>{item.icon}</span>
              <span style={{ fontSize:'9px', fontWeight:isActive?700:500, color:isActive?'#CC2200':'var(--muted)', letterSpacing:'.3px' }}>{item.label}</span>
            </button>
          )
        })}
      </div>

      {/* More drawer */}
      {showMore && (
        <div style={{ position:'fixed', inset:0, zIndex:200 }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.5)', backdropFilter:'blur(4px)' }} onClick={() => setShowMore(false)}/>
          <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'var(--panel)', borderRadius:'20px 20px 0 0', padding:'0 0 max(20px, env(safe-area-inset-bottom)) 0', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--border)', margin:'10px auto 16px' }}/>
            <div style={{ padding:'0 16px 8px', fontSize:'12px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px' }}>All Modules</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'2px', padding:'0 8px 8px' }}>
              {MORE_ITEMS.map(item => (
                <button key={item.id} onClick={() => { setPage(item.id); setShowMore(false) }}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'14px 8px', background:'var(--dim)', borderRadius:'12px', border:'none', cursor:'pointer', margin:'3px' }}>
                  <span style={{ fontSize:'24px', marginBottom:'5px' }}>{item.icon}</span>
                  <span style={{ fontSize:'10px', fontWeight:600, color:'var(--text)', textAlign:'center', lineHeight:1.2 }}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
