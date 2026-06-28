// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — App Entry Point
// All routes defined here. Every page has its own URL with :id.
// ═══════════════════════════════════════════════════════════════

import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth }  from './context/AuthContext'
import { AppProvider, useApp }    from './context/AppContext'
import { Login }                  from './pages/Login'
import { Layout }                 from './components/Layout'
import { VoiceCapture }           from './components/VoiceCapture'

// Page imports
import { Dashboard }     from './pages/Dashboard'
import { Contacts }      from './pages/Contacts'
import { ContactDetail } from './pages/ContactDetail'
import { Production }    from './pages/Production'
import { Listings }      from './pages/Listings'
import { Tasks }         from './pages/Tasks'
import { Calendar }      from './pages/Calendar'
import { Offers }        from './pages/Offers'
import { Gifts }         from './pages/Gifts'
import { AIAssistant } from './components/AIAssistant'
import { CallFlow } from './pages/CallFlow'
import { Calls }         from './pages/Calls'
import { OpenHouse }     from './pages/OpenHouse'
import { SocialCards } from './pages/SocialCards'
import { AgentPerformance } from './pages/AgentPerformance'
import { Signs }         from './pages/Signs'
import { Announcements } from './pages/Announcements'
import { ListingPrep }   from './pages/ListingPrep'
import { Pipeline }      from './pages/Pipeline'
import { Transactions }  from './pages/Transactions'
import { Notes }         from './pages/Notes'
import { Automations }   from './pages/Automations'
import { DailyBriefing } from './pages/DailyBriefing'
import { Email }         from './pages/Email'
import { EmailDesigner } from './pages/EmailDesigner'
import { Settings }      from './pages/Settings'
import { Admin }         from './pages/Admin'
import { ActivityLog }   from './pages/ActivityLog'
import { Mortgage }      from './pages/Mortgage'
import { Route as RoutePage } from './pages/Route'

// ── ERROR BOUNDARY ───────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '32px', maxWidth: '480px', margin: '48px auto', fontFamily: 'Inter,system-ui,sans-serif' }}>
        <div style={{ background: '#1B2B4B', borderRadius: '14px', padding: '24px', textAlign: 'center', marginBottom: '14px' }}>
          <div style={{ color: '#fff', fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>TargetOS</div>
          <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px' }}>Something went wrong</div>
        </div>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', color: '#DC2626', fontFamily: 'monospace', wordBreak: 'break-all' }}>{this.state.error?.message}</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => this.setState({ error: null })}
            style={{ flex:1, background: 'white', border: '1px solid #E2E8F0', borderRadius: '9px', color: '#1E293B', fontSize: '13px', fontWeight: 700, padding: '12px', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
            ↩ Try Again
          </button>
          <button onClick={() => window.location.href = '/'}
            style={{ flex:1, background: '#CC2200', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: 700, padding: '12px', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif' }}>
            Reload App
          </button>
        </div>
      </div>
    )
    return this.props.children
  }
}

// ── PER-PAGE ERROR BOUNDARY ──────────────────────────────────────
// Wraps each route so a single page crash doesn't break navigation
function SafePage({ children }) {
  return <ErrorBoundary key={window.location.pathname}>{children}</ErrorBoundary>
}

// ── LOADING SCREEN ───────────────────────────────────────────────
function AppLoader() {
  return (
    <div style={{ minHeight: '100vh', background: '#0F1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '30px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>Target<span style={{ color: '#F5A623' }}>OS</span></div>
        <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '13px' }}>Loading...</div>
      </div>
    </div>
  )
}

// ── TOAST ────────────────────────────────────────────────────────
function Toast() {
  const { state } = useApp()
  if (!state.toast) return null
  return (
    <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: state.toast.color || '#1B2B4B', color: '#fff', padding: '12px 24px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,.3)', fontFamily: 'Inter,system-ui,sans-serif', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      {state.toast.msg}
    </div>
  )
}

// ── MAIN APP SHELL ───────────────────────────────────────────────
function AppShell() {
  const { user, agent, loading } = useAuth()
  if (loading) return <AppLoader />
  if (!user || !agent) return <Login />

  return (
    <>
      <Layout>
        <Routes>
          {/* Core pages with :id routing */}
          <Route path="/"                    element={<Dashboard />} />
          <Route path="/contacts"            element={<Contacts />} />
          <Route path="/contacts/:id"        element={<Contacts />} />
          <Route path="/contacts/:id/detail" element={<ContactDetail />} />
          <Route path="/production"          element={<Production />} />
          <Route path="/production/:id"      element={<Production />} />
          <Route path="/listings"            element={<Listings />} />
          <Route path="/listings/:id"        element={<Listings />} />
          <Route path="/tasks"               element={<Tasks />} />
          <Route path="/tasks/:id"           element={<Tasks />} />
          <Route path="/calendar"            element={<Calendar />} />
          <Route path="/calendar/:id"        element={<Calendar />} />
          <Route path="/offers"              element={<Offers />} />
          <Route path="/offers/:id"          element={<Offers />} />
          <Route path="/gifts"               element={<Gifts />} />
          <Route path="/gifts/:id"           element={<Gifts />} />
          <Route path="/call-flow" element={<CallFlow />} />
          <Route path="/calls"               element={<Calls />} />
          <Route path="/calls/:id"           element={<Calls />} />
          <Route path="/openhouse"           element={<OpenHouse />} />
          <Route path="/openhouse/:id"       element={<OpenHouse />} />
          <Route path="/social-cards" element={<SocialCards />} />
          <Route path="/performance" element={<AgentPerformance />} />
          <Route path="/signs"               element={<Signs />} />
          <Route path="/signs/:id"           element={<Signs />} />
          <Route path="/announcements"       element={<Announcements />} />
          <Route path="/announcements/:id"   element={<Announcements />} />
          <Route path="/listingprep"         element={<ListingPrep />} />
          <Route path="/listingprep/:id"     element={<ListingPrep />} />
          <Route path="/pipeline"            element={<Pipeline />} />
          <Route path="/transactions"        element={<Transactions />} />
          <Route path="/transactions/:id"    element={<Transactions />} />
          <Route path="/notes"               element={<Notes />} />
          <Route path="/notes/:id"           element={<Notes />} />
          <Route path="/automations"         element={<Automations />} />
          <Route path="/automations/:id"     element={<Automations />} />
          <Route path="/briefing"            element={<DailyBriefing />} />
          <Route path="/email"               element={<Email />} />
          <Route path="/designer"            element={<EmailDesigner />} />
          <Route path="/designer/:id"        element={<EmailDesigner />} />
          <Route path="/settings"            element={<Settings />} />
          <Route path="/admin"               element={<Admin />} />
          <Route path="/activitylog"         element={<ActivityLog />} />
          <Route path="/mortgage"            element={<Mortgage />} />
          <Route path="/route"               element={<RoutePage />} />
          {/* Catch-all redirect */}
          <Route path="*"                    element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toast />
      <LocationAwareTools />
    </>
  )
}

// Mic only on Dashboard, AI assistant on all other pages
function LocationAwareTools() {
  const loc = useLocation()
  const isDashboard = loc.pathname === '/' || loc.pathname === '/dashboard'
  return (
    <>
      {isDashboard && <VoiceCapture />}
      {!isDashboard && <AIAssistant />}
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <AppShell />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
