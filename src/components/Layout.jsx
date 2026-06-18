import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { formatTime } from '../lib/time'
import { AGENTS } from '../lib/constants'

const DEFAULT_NAV = [
  { section: 'Main' },
  { id:'dash',         label:'Dashboard',      icon:'⊟' },
  { id:'contacts',     label:'Contacts',        icon:'👥' },
  { id:'pipeline',     label:'Pipeline',        icon:'→'  },
  { id:'listings',     label:'Target Listings', icon:'🏠' },
  { id:'transactions', label:'Transactions',    icon:'📋' },
  { id:'production',   label:'Production',      icon:'📊' },
  { section: 'Tools' },
  { id:'tasks',        label:'Tasks',           icon:'✓'  },
  { id:'calls',        label:'Phone & Calls',   icon:'📞' },
  { id:'email',        label:'Email Blast',     icon:'✉'  },
  { id:'designer',     label:'Email Designer',  icon:'🎨' },
  { id:'cards',        label:'Card Generator',  icon:'🎨' },
  { id:'mixads',       label:'Mix Ads',         icon:'📰' },
  { id:'leadgen',      label:'Lead Gen',        icon:'🎯' },
  { id:'openhouse',    label:'Open House',      icon:'🕐' },
  { id:'offers',       label:'Offers',          icon:'📝' },
  { section: 'Maps & Tools' },
  { id:'route',        label:'Showing Route',   icon:'🗺'  },
  { id:'signs',        label:'Sign Tracker',    icon:'📍' },
  { id:'mortgage',     label:'Mortgage Calc',   icon:'🏘'  },
  { id:'calendar',     label:'Calendar',        icon:'📅' },
  { id:'news',         label:'Market News',     icon:'📈' },
  { id:'notes',        label:'Quick Notes',     icon:'📄' },
  { section: 'Internal' },
  { id:'listprep',     label:'Listing Prep',    icon:'🔧' },
  { id:'gifts',        label:'Gift Boards',     icon:'🎁' },
  { id:'announce',     label:'Announcements',   icon:'📣' },
  { section: 'Admin' },
  { id:'actlog',       label:'Activity Log',    icon:'📋' },
  { id:'briefing',     label:'Daily Briefing',  icon:'📧' },
  { id:'automations',  label:'Automations',     icon:'⚡' },
  { id:'admin',        label:'Admin Panel',     icon:'🔒' },
  { id:'settings',     label:'Settings',        icon:'⚙'  },
]

const NAV_VERSION = 'v5' // bump this to force sidebar reset for all users
const PAGE_TITLES = Object.fromEntries(DEFAULT_NAV.filter(n=>n.id).map(n=>[n.id,n.label]))

const FONT_SIZES = ['11px','12px','13px','14px','15px']
const FONT_WEIGHTS = ['400','500','600','700','800']
const SIDEBAR_WIDTHS = ['200px','220px','240px','260px','280px']

export function Layout({ page, setPage, children }) {
  const { state, dispatch } = useApp()
  const agent = state.currentAgent || AGENTS[3]

  // Sidebar style state — persisted to localStorage
  const [sbStyle, setSbStyle] = useState(() => {
    try {
      const saved = localStorage.getItem('targetos_sb_style')
      return saved ? JSON.parse(saved) : { fontSize:'13px', fontWeight:'600', width:'220px' }
    } catch { return { fontSize:'13px', fontWeight:'600', width:'220px' } }
  })
  const [showEditor, setShowEditor] = useState(false)
  const [nav, setNav] = useState(() => {
    try {
      const savedVersion = localStorage.getItem('targetos_nav_version')
      const saved = localStorage.getItem('targetos_nav')
      // Force reset if version changed or new items missing
      if(savedVersion !== NAV_VERSION || !saved) {
        localStorage.setItem('targetos_nav_version', NAV_VERSION)
        localStorage.removeItem('targetos_nav')
        return DEFAULT_NAV
      }
      const savedNav = JSON.parse(saved)
      // Also merge any new items not in saved version
      const savedIds = new Set(savedNav.filter(n=>n.id).map(n=>n.id))
      const newItems = DEFAULT_NAV.filter(n => n.id && !savedIds.has(n.id))
      if(newItems.length > 0) {
        const withoutLast = savedNav.filter(n=>n.id!=='settings')
        const last = savedNav.filter(n=>n.id==='settings')
        return [...withoutLast, ...newItems, ...last]
      }
      return savedNav
    } catch { return DEFAULT_NAV }
  })

  function saveSbStyle(newStyle) {
    setSbStyle(newStyle)
    localStorage.setItem('targetos_sb_style', JSON.stringify(newStyle))
  }
  function saveNav(newNav) {
    setNav(newNav)
    localStorage.setItem('targetos_nav', JSON.stringify(newNav))
  }
  function resetNav() {
    setNav(DEFAULT_NAV)
    localStorage.removeItem('targetos_nav')
    setSbStyle({ fontSize:'13px', fontWeight:'600', width:'220px' })
    localStorage.removeItem('targetos_sb_style')
  }

  function doSignOut() {
    dispatch({ type:'SET_USER', payload:null })
  }

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden'}}>

      {/* ── SIDEBAR ── */}
      <aside style={{width:sbStyle.width,background:'#1B2B4B',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden',transition:'width .2s'}}>

        {/* Logo */}
        <div style={{padding:'14px 14px 12px',borderBottom:'1px solid rgba(255,255,255,.1)',display:'flex',alignItems:'center',gap:'10px',flexShrink:0}}>
          <img src="/logo.png" alt="Target Team" style={{width:'36px',height:'36px',objectFit:'contain',flexShrink:0}}/>
          <div>
            <div style={{color:'#fff',fontSize:'16px',fontWeight:900,letterSpacing:'-.3px',lineHeight:1}}>
              Target<span style={{color:'#F5A623'}}>OS</span>
            </div>
            <div style={{color:'rgba(255,255,255,.35)',fontSize:'9px',letterSpacing:'1.5px',textTransform:'uppercase',marginTop:'2px'}}>KW Valley Realty</div>
          </div>
        </div>

        {/* Nav */}
        <div style={{flex:1,overflowY:'auto',padding:'6px',scrollbarWidth:'none'}}>
          {nav.map((item, i) => {
            if (item.section) {
              return (
                <div key={i} style={{padding:'12px 8px 4px',color:'rgba(255,255,255,.3)',fontSize:'9px',fontWeight:800,textTransform:'uppercase',letterSpacing:'1.5px'}}>
                  {item.section}
                </div>
              )
            }
            if (item.hidden) return null
            const active = page === item.id
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:'10px',
                  padding:'9px 10px', borderRadius:'8px', border:'none',
                  background: active ? 'rgba(204,34,0,.25)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,.65)',
                  fontSize: sbStyle.fontSize,
                  fontWeight: active ? '700' : sbStyle.fontWeight,
                  cursor:'pointer', marginBottom:'1px', textAlign:'left',
                  fontFamily:'Inter,system-ui,sans-serif',
                  transition:'all .12s',
                  borderLeft: active ? '3px solid #CC2200' : '3px solid transparent',
                }}
                onMouseEnter={e => { if(!active){ e.currentTarget.style.background='rgba(255,255,255,.08)'; e.currentTarget.style.color='#fff' }}}
                onMouseLeave={e => { if(!active){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,.65)' }}}>
                <span style={{fontSize:'15px',width:'18px',textAlign:'center',flexShrink:0}}>{item.icon}</span>
                <span style={{flex:1}}>{item.label}</span>
              </button>
            )
          })}

          {/* Customize sidebar button */}
          <div style={{padding:'12px 8px 4px',borderTop:'1px solid rgba(255,255,255,.08)',marginTop:'8px'}}>
            <button onClick={() => setShowEditor(true)}
              style={{width:'100%',display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'8px',border:'1px dashed rgba(255,255,255,.2)',background:'transparent',color:'rgba(255,255,255,.35)',fontSize:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',transition:'all .15s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.4)';e.currentTarget.style.color='rgba(255,255,255,.6)'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.2)';e.currentTarget.style.color='rgba(255,255,255,.35)'}}>
              <span style={{fontSize:'13px'}}>✏️</span>
              <span>Customize Sidebar</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'12px',borderTop:'1px solid rgba(255,255,255,.08)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
            <div style={{width:32,height:32,borderRadius:'9px',background:agent.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:'#fff',flexShrink:0}}>
              {agent.ini}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:'#fff',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{agent.name.split(' ')[0]}</div>
              <div style={{color:'#F5A623',fontSize:'9px',textTransform:'capitalize'}}>{agent.role}</div>
            </div>
          </div>
          <button onClick={doSignOut} style={{background:'none',border:'none',color:'rgba(255,255,255,.25)',fontSize:'10px',cursor:'pointer',marginTop:'6px',fontFamily:'Inter,system-ui,sans-serif',padding:0}}>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Topbar */}
        <div style={{background:'var(--panel)',borderBottom:'1px solid var(--border)',padding:'12px 20px',display:'flex',alignItems:'center',gap:'12px',flexShrink:0,boxShadow:'0 1px 3px rgba(0,0,0,.05)'}}>
          <div style={{fontSize:'16px',fontWeight:800,flex:1,color:'var(--text)'}}>{PAGE_TITLES[page] || page}</div>
          <input placeholder="Search..." style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 13px',outline:'none',width:'220px',fontFamily:'Inter,system-ui,sans-serif'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          <LiveClock/>
          <ThemeToggle/>
          <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'#10B981'}}/>
            <span style={{color:'var(--muted)',fontSize:'11px'}}>Live</span>
          </div>
        </div>

        {/* Page */}
        <div style={{flex:1,overflowY:'auto',padding:'20px'}}>
          {children}
        </div>
      </main>

      {/* ── SIDEBAR EDITOR ── */}
      {showEditor && (
        <div onClick={e=>{if(e.target===e.currentTarget)setShowEditor(false)}}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,backdropFilter:'blur(4px)'}}>
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'20px',width:'100%',maxWidth:'540px',maxHeight:'85vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,.3)'}}>

            {/* Header */}
            <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>Customize Sidebar</div>
              <button onClick={()=>setShowEditor(false)} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'var(--muted)',lineHeight:1}}>✕</button>
            </div>

            <div style={{padding:'20px 24px',overflowY:'auto',flex:1}}>

              {/* Style controls */}
              <div style={{background:'var(--dim)',borderRadius:'12px',padding:'16px',marginBottom:'20px'}}>
                <div style={{fontSize:'12px',fontWeight:700,marginBottom:'14px',color:'var(--text)'}}>Text Style</div>

                {/* Font size */}
                <div style={{marginBottom:'12px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Font Size</div>
                  <div style={{display:'flex',gap:'6px'}}>
                    {FONT_SIZES.map(s => (
                      <button key={s} onClick={()=>saveSbStyle({...sbStyle,fontSize:s})}
                        style={{flex:1,padding:'8px 4px',borderRadius:'8px',border:'1.5px solid '+(sbStyle.fontSize===s?'#CC2200':'var(--border)'),background:sbStyle.fontSize===s?'rgba(204,34,0,.08)':'var(--panel)',color:sbStyle.fontSize===s?'#CC2200':'var(--text)',fontSize:s,fontWeight:600,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font weight */}
                <div style={{marginBottom:'12px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Font Weight</div>
                  <div style={{display:'flex',gap:'6px'}}>
                    {[['400','Regular'],['500','Medium'],['600','Semi'],['700','Bold'],['800','Black']].map(([w,l]) => (
                      <button key={w} onClick={()=>saveSbStyle({...sbStyle,fontWeight:w})}
                        style={{flex:1,padding:'8px 4px',borderRadius:'8px',border:'1.5px solid '+(sbStyle.fontWeight===w?'#CC2200':'var(--border)'),background:sbStyle.fontWeight===w?'rgba(204,34,0,.08)':'var(--panel)',color:sbStyle.fontWeight===w?'#CC2200':'var(--text)',fontSize:'11px',fontWeight:w,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Width */}
                <div>
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Sidebar Width</div>
                  <div style={{display:'flex',gap:'6px'}}>
                    {[['200px','Narrow'],['220px','Default'],['240px','Medium'],['260px','Wide'],['280px','Wider']].map(([w,l]) => (
                      <button key={w} onClick={()=>saveSbStyle({...sbStyle,width:w})}
                        style={{flex:1,padding:'8px 4px',borderRadius:'8px',border:'1.5px solid '+(sbStyle.width===w?'#CC2200':'var(--border)'),background:sbStyle.width===w?'rgba(204,34,0,.08)':'var(--panel)',color:sbStyle.width===w?'#CC2200':'var(--text)',fontSize:'10px',fontWeight:600,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live preview */}
              <div style={{background:'#1B2B4B',borderRadius:'12px',padding:'12px',marginBottom:'20px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'rgba(255,255,255,.3)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'10px'}}>Preview</div>
                {[{icon:'⊟',label:'Dashboard',active:true},{icon:'👥',label:'Contacts'},{icon:'🏠',label:'Target Listings'},{icon:'📊',label:'Production'}].map((item,i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'8px',background:item.active?'rgba(204,34,0,.25)':'transparent',color:item.active?'#fff':'rgba(255,255,255,.65)',fontSize:sbStyle.fontSize,fontWeight:item.active?'700':sbStyle.fontWeight,marginBottom:'2px',borderLeft:item.active?'3px solid #CC2200':'3px solid transparent'}}>
                    <span style={{fontSize:'15px',width:'18px',textAlign:'center'}}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Toggle menu items */}
              <div style={{background:'var(--dim)',borderRadius:'12px',padding:'16px',marginBottom:'20px'}}>
                <div style={{fontSize:'12px',fontWeight:700,marginBottom:'12px'}}>Show / Hide Menu Items</div>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {nav.filter(n=>n.id).map((item,i) => (
                    <div key={item.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',background:'var(--panel)',borderRadius:'8px'}}>
                      <div onClick={()=>{
                        const updated = nav.map(n => n.id===item.id ? {...n,hidden:!n.hidden} : n)
                        saveNav(updated)
                      }} style={{width:36,height:20,borderRadius:'99px',background:item.hidden?'var(--border)':'#10B981',position:'relative',cursor:'pointer',flexShrink:0,transition:'background .2s'}}>
                        <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:item.hidden?2:18,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                      </div>
                      <span style={{fontSize:'14px'}}>{item.icon}</span>
                      <span style={{fontSize:'12px',fontWeight:600,flex:1,textDecoration:item.hidden?'line-through':'none',opacity:item.hidden?.5:1}}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{padding:'16px 24px',borderTop:'1px solid var(--border)',display:'flex',gap:'8px',justifyContent:'space-between'}}>
              <button onClick={resetNav} style={{background:'none',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontSize:'12px',padding:'8px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Reset to Default</button>
              <button onClick={()=>setShowEditor(false)} style={{background:'#CC2200',border:'none',borderRadius:'8px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'8px 24px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LiveClock() {
  const [time, setTime] = React.useState(new Date())
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const et = time.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  })

  return (
    <div style={{
      background:'var(--dim)', border:'1px solid var(--border)',
      borderRadius:'8px', padding:'6px 12px',
      fontSize:'11px', fontWeight:700, color:'var(--text)',
      fontFamily:'monospace', whiteSpace:'nowrap',
      display:'flex', alignItems:'center', gap:'5px',
    }}>
      <span style={{color:'#10B981',fontSize:'8px'}}>●</span>
      {et} ET
    </div>
  )
}

function ThemeToggle() {
  const themes = ['light','dark','slate']
  const [idx, setIdx] = useState(0)
  function cycle() {
    const next = (idx+1) % themes.length
    setIdx(next)
    document.body.className = themes[next]
  }
  return (
    <button onClick={cycle} style={{background:'#1B2B4B',border:'none',borderRadius:'8px',color:'#fff',fontSize:'11px',fontWeight:600,padding:'8px 14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
      {themes[idx].charAt(0).toUpperCase()+themes[idx].slice(1)}
    </button>
  )
}
