import React, { Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider, useApp }   from './context/AppContext'
import { Login }                 from './pages/Login'

// Lazy load pages — improves initial load time
const Dashboard    = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Contacts     = lazy(() => import('./pages/Contacts').then(m => ({ default: m.Contacts })))
const Production   = lazy(() => import('./pages/Production').then(m => ({ default: m.Production })))
const Listings     = lazy(() => import('./pages/Listings').then(m => ({ default: m.Listings })))
const Tasks        = lazy(() => import('./pages/Tasks').then(m => ({ default: m.Tasks })))
const Calendar     = lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })))
const Offers       = lazy(() => import('./pages/Offers').then(m => ({ default: m.Offers })))
const Transactions = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })))
const OpenHouse    = lazy(() => import('./pages/OpenHouse').then(m => ({ default: m.OpenHouse })))
const Gifts        = lazy(() => import('./pages/Gifts').then(m => ({ default: m.Gifts })))
const Calls        = lazy(() => import('./pages/Calls').then(m => ({ default: m.Calls })))
const Notes        = lazy(() => import('./pages/Notes').then(m => ({ default: m.Notes })))
const Signs        = lazy(() => import('./pages/Signs').then(m => ({ default: m.Signs })))
const Announcements = lazy(() => import('./pages/Announcements').then(m => ({ default: m.Announcements })))
const ListingPrep  = lazy(() => import('./pages/ListingPrep').then(m => ({ default: m.ListingPrep })))
const Automations  = lazy(() => import('./pages/Automations').then(m => ({ default: m.Automations })))
const DailyBriefing = lazy(() => import('./pages/DailyBriefing').then(m => ({ default: m.DailyBriefing })))
const Email        = lazy(() => import('./pages/Email').then(m => ({ default: m.Email })))
const EmailDesigner = lazy(() => import('./pages/EmailDesigner').then(m => ({ default: m.EmailDesigner })))
const Settings     = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Admin        = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))
const ActivityLog  = lazy(() => import('./pages/ActivityLog').then(m => ({ default: m.ActivityLog })))
const Mortgage     = lazy(() => import('./pages/Mortgage').then(m => ({ default: m.Mortgage })))
const Route        = lazy(() => import('./pages/Route').then(m => ({ default: m.Route })))

import { Layout }       from './components/Layout'
import { MobileLayout } from './components/MobileLayout'

const PAGE_MAP = {
  dash: Dashboard, contacts: Contacts, production: Production,
  listings: Listings, tasks: Tasks, calendar: Calendar,
  offers: Offers, transactions: Transactions, openhouse: OpenHouse,
  gifts: Gifts, calls: Calls, notes: Notes, signs: Signs,
  announcements: Announcements, listingprep: ListingPrep,
  automations: Automations, briefing: DailyBriefing,
  email: Email, designer: EmailDesigner,
  settings: Settings, admin: Admin, activitylog: ActivityLog,
  mortgage: Mortgage, route: Route,
}

function AppShell() {
  const { user, agent, loading } = useAuth()
  const [page, setPage]          = React.useState('dash')
  const isMobile = window.innerWidth < 768

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0F1A2E', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'28px', fontWeight:900, color:'#fff', marginBottom:'12px' }}>Target<span style={{ color:'#F5A623' }}>OS</span></div>
        <div style={{ color:'rgba(255,255,255,.4)', fontSize:'13px' }}>Loading...</div>
      </div>
    </div>
  )

  if (!user || !agent) return <Login />

  const PageComponent = PAGE_MAP[page] || Dashboard

  if (isMobile) {
    return (
      <MobileLayout page={page} setPage={setPage} agent={agent}>
        <Suspense fallback={<PageLoader />}>
          <PageComponent setPage={setPage} />
        </Suspense>
      </MobileLayout>
    )
  }

  return (
    <Layout page={page} setPage={setPage} agent={agent}>
      <Suspense fallback={<PageLoader />}>
        <PageComponent setPage={setPage} />
      </Suspense>
    </Layout>
  )
}

function PageLoader() {
  return (
    <div style={{ padding:'40px', textAlign:'center', color:'var(--muted)', fontSize:'13px' }}>
      <div style={{ fontSize:'24px', marginBottom:'10px' }}>⏳</div>
      Loading...
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </AuthProvider>
  )
}
