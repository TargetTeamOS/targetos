import React, { Suspense, lazy, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppProvider, useApp }   from './context/AppContext'
import { Login }                 from './pages/Login'
import { Layout }                from './components/Layout'
import { MobileLayout }          from './components/MobileLayout'
import { VoiceCapture }          from './components/VoiceCapture'

// Lazy-loaded pages
const Dashboard     = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Contacts      = lazy(() => import('./pages/Contacts').then(m => ({ default: m.Contacts })))
const Production    = lazy(() => import('./pages/Production').then(m => ({ default: m.Production })))
const Listings      = lazy(() => import('./pages/Listings').then(m => ({ default: m.Listings })))
const Tasks         = lazy(() => import('./pages/Tasks').then(m => ({ default: m.Tasks })))
const Calendar      = lazy(() => import('./pages/Calendar').then(m => ({ default: m.Calendar })))
const Offers        = lazy(() => import('./pages/Offers').then(m => ({ default: m.Offers })))
const Transactions  = lazy(() => import('./pages/Transactions').then(m => ({ default: m.Transactions })))
const OpenHouse     = lazy(() => import('./pages/OpenHouse').then(m => ({ default: m.OpenHouse })))
const Gifts         = lazy(() => import('./pages/Gifts').then(m => ({ default: m.Gifts })))
const Calls         = lazy(() => import('./pages/Calls').then(m => ({ default: m.Calls })))
const Notes         = lazy(() => import('./pages/Notes').then(m => ({ default: m.Notes })))
const Signs         = lazy(() => import('./pages/Signs').then(m => ({ default: m.Signs })))
const Announcements = lazy(() => import('./pages/Announcements').then(m => ({ default: m.Announcements })))
const ListingPrep   = lazy(() => import('./pages/ListingPrep').then(m => ({ default: m.ListingPrep })))
const Automations   = lazy(() => import('./pages/Automations').then(m => ({ default: m.Automations })))
const DailyBriefing = lazy(() => import('./pages/DailyBriefing').then(m => ({ default: m.DailyBriefing })))
const Email         = lazy(() => import('./pages/Email').then(m => ({ default: m.Email })))
const EmailDesigner = lazy(() => import('./pages/EmailDesigner').then(m => ({ default: m.EmailDesigner })))
const Settings      = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Admin         = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))
const ActivityLog   = lazy(() => import('./pages/ActivityLog').then(m => ({ default: m.ActivityLog })))
const Mortgage      = lazy(() => import('./pages/Mortgage').then(m => ({ default: m.Mortgage })))
const Route         = lazy(() => import('./pages/Route').then(m => ({ default: m.Route })))
const Pipeline      = lazy(() => import('./pages/Pipeline').then(m => ({ default: m.Pipeline })))

const PAGE_MAP = {
  dash: Dashboard, contacts: Contacts, production: Production,
  listings: Listings, tasks: Tasks, calendar: Calendar,
  offers: Offers, transactions: Transactions, openhouse: OpenHouse,
  gifts: Gifts, calls: Calls, notes: Notes, signs: Signs,
  announcements: Announcements, listingprep: ListingPrep,
  automations: Automations, briefing: DailyBriefing,
  email: Email, designer: EmailDesigner, pipeline: Pipeline,
  settings: Settings, admin: Admin, activitylog: ActivityLog,
  mortgage: Mortgage, route: Route,
}

// Error boundary to catch crashes
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '40px', maxWidth: '500px', margin: '60px auto', fontFamily: 'Inter,system-ui,sans-serif' }}>
        <div style={{ background: '#1B2B4B', borderRadius: '16px', padding: '28px', textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 800 }}>TargetOS — Something crashed</div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px', marginTop: '6px' }}>Error details below</div>
        </div>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {this.state.error?.message}
          </div>
        </div>
        <button onClick={() => window.location.reload()}
          style={{ width: '100%', background: '#CC2200', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, padding: '14px', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
          Reload App
        </button>
      </div>
    )
    return this.props.children
  }
}

function Loader() {
  return (
    <div style={{ minHeight: '100vh', background: '#0F1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '10px' }}>
          Target<span style={{ color: '#F5A623' }}>OS</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '13px' }}>Loading...</div>
      </div>
    </div>
  )
}

function Toast() {
  const { state } = useApp()
  if (!state.toast) return null
  return (
    <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: state.toast.color || '#1B2B4B', color: '#fff', padding: '12px 24px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,.3)', fontFamily: 'Inter,system-ui,sans-serif', whiteSpace: 'nowrap' }}>
      {state.toast.msg}
    </div>
  )
}

function AppShell() {
  const { user, agent, loading } = useAuth()
  const [page, setPage] = useState('dash')
  const isMobile = window.innerWidth < 768

  if (loading) return <Loader />
  if (!user || !agent) return <Login />

  const PageComponent = PAGE_MAP[page] || Dashboard

  return (
    <>
      {isMobile
        ? <MobileLayout page={page} setPage={setPage} agent={agent}>
            <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>Loading...</div>}>
              <PageComponent setPage={setPage} />
            </Suspense>
          </MobileLayout>
        : <Layout page={page} setPage={setPage} agent={agent}>
            <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>Loading...</div>}>
              <PageComponent setPage={setPage} />
            </Suspense>
          </Layout>
      }
      <Toast />
      <VoiceCapture />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
