import React, { useEffect, useState } from 'react'
import { useApp } from './context/AppContext'
import { supabase } from './lib/supabase'
import { AGENTS } from './lib/constants'
import { Login } from './components/Login'
import { MobileLayout } from './components/MobileLayout'
import { MobileDashboard } from './pages/MobileDashboard'
import { DailyBriefing } from './pages/DailyBriefing'
import { EmailDesigner } from './pages/EmailDesigner'
import { Layout } from './components/Layout'
import { Toast } from './components/UI'

import { Dashboard }     from './pages/Dashboard'
import { Contacts }      from './pages/Contacts'
import { Pipeline }      from './pages/Pipeline'
import { Listings }      from './pages/Listings'
import { Transactions }  from './pages/Transactions'
import { Production }    from './pages/Production'
import { Tasks }         from './pages/Tasks'
import { Calls }         from './pages/Calls'
import { Email }         from './pages/Email'
import { Cards }         from './pages/Cards'
import { MixAds }        from './pages/MixAds'
import { LeadGen }       from './pages/LeadGen'
import { OpenHouse }     from './pages/OpenHouse'
import { Offers }        from './pages/Offers'
import { Route }         from './pages/Route'
import { Signs }         from './pages/Signs'
import { Mortgage }      from './pages/Mortgage'
import { Calendar }      from './pages/Calendar'
import { News }          from './pages/News'
import { Notes }         from './pages/Notes'
import { ListingPrep }   from './pages/ListingPrep'
import { Gifts }         from './pages/Gifts'
import { Announcements } from './pages/Announcements'
import { Automations }   from './pages/Automations'
import { Admin }         from './pages/Admin'
import { ActivityLog }   from './pages/ActivityLog'
import { Settings }      from './pages/Settings'

const PAGES = {
  dash:dash=>Dashboard,contacts:Contacts,pipeline:Pipeline,
  listings:Listings,transactions:Transactions,production:Production,
  tasks:Tasks,calls:Calls,email:Email,cards:Cards,mixads:MixAds,
  leadgen:LeadGen,openhouse:OpenHouse,offers:Offers,
  route:Route,signs:Signs,mortgage:Mortgage,calendar:Calendar,
  news:News,notes:Notes,listprep:ListingPrep,gifts:Gifts,
  announce:Announcements,automations:Automations,
  admin:Admin,actlog:ActivityLog,briefing:DailyBriefing,settings:Settings,
}

// fix the typo above
const PAGE_MAP = {
  dash:Dashboard,contacts:Contacts,pipeline:Pipeline,
  listings:Listings,transactions:Transactions,production:Production,
  tasks:Tasks,calls:Calls,email:Email,cards:Cards,mixads:MixAds,
  leadgen:LeadGen,openhouse:OpenHouse,offers:Offers,
  route:Route,signs:Signs,mortgage:Mortgage,calendar:Calendar,
  news:News,notes:Notes,listprep:ListingPrep,gifts:Gifts,
  announce:Announcements,automations:Automations,
  admin:Admin,actlog:ActivityLog,briefing:DailyBriefing,settings:Settings,
}

export default function App() {
  const { state, dispatch } = useApp()
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [page, setPage] = useState('dash')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if(data?.session) {
        const email = data.session.user.email
        const agent = AGENTS.find(a => a.email === email) || AGENTS[3]
        dispatch({ type:'SET_USER',  payload: data.session.user })
        dispatch({ type:'SET_AGENT', payload: agent })
      }
      setChecking(false)
    })
    supabase.auth.onAuthStateChange((event) => {
      if(event === 'SIGNED_OUT') {
        dispatch({ type:'SET_USER', payload:null })
        dispatch({ type:'SET_AGENT', payload:null })
        setPage('dash')
      }
    })
  }, [])

  if(checking) return (
    <div style={{position:'fixed',inset:0,background:'#1B2B4B',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <svg width="36" height="42" viewBox="0 0 60 70" style={{marginBottom:'12px'}}>
          <rect x="8" y="0" width="14" height="70" rx="3" fill="#fff"/>
          <rect x="38" y="0" width="5" height="70" rx="2" fill="#CC2200"/>
          <rect x="8" y="60" width="35" height="4" rx="2" fill="#CC2200"/>
        </svg>
        <div style={{color:'rgba(255,255,255,.5)',fontSize:'13px'}}>Loading TargetOS...</div>
      </div>
    </div>
  )

  if(!state.user) return <Login/>

  // ── MOBILE LAYOUT ──────────────────────────────────────────
  if(isMobile) {
    const MobilePage = page === 'dash' ? null : PAGE_MAP[page]
    return (
      <MobileLayout page={page} setPage={setPage}>
        {page === 'dash'
          ? <MobileDashboard setPage={setPage}/>
          : MobilePage
          ? <div style={{padding:'14px'}}><MobilePage setPage={setPage}/></div>
          : <MobileDashboard setPage={setPage}/>
        }
      </MobileLayout>
    )
  }

  const PageComponent = PAGE_MAP[page]

  return (
    <>
      <Layout page={page} setPage={setPage}>
        {PageComponent ? <PageComponent setPage={setPage}/> : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'55vh'}}><div style={{textAlign:'center',color:'var(--muted)'}}>Page not found</div></div>}
      </Layout>
      <Toast toast={state.toast}/>
      <style>{`@keyframes slideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}`}</style>
    </>
  )
}
