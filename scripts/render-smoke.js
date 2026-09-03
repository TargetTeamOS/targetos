#!/usr/bin/env node
// TargetOS — Render Smoke Test (July 2026)
// Run: node scripts/render-smoke.js   (part of `npm run preflight`)
//
// Server-renders the main pages with react-dom/server. This catches
// the class of bug that build/validate/smoke ALL miss: runtime crashes
// on mount — e.g. the eraseZones temporal-dead-zone bug that took the
// whole Marketing page down (state declared AFTER an effect that
// referenced it; compiles fine, crashes instantly in the browser).
//
// SSR doesn't run effects, so network/canvas code is safe. What this
// verifies is exactly what a white-screen means: the first render.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Pages worth mounting — add here when new top-level pages are created.
//
// FIX (Sept 2026 audit, finding M4): this used to cover 9 of the 56 files
// in src/pages/ (a mount crash on any of the other 47 -- e.g. the
// ContactDetail "CRITICAL bug" HANDOFF.md mentions -- would have shipped
// to production with a clean "ALL PAGES RENDER"). Generated from every
// exported page component in src/pages/ (excluding *.test.jsx, which have
// no page export). Dashboard.jsx and DashboardV2.jsx both export a
// component named `Dashboard`, so DashboardV2's import is aliased to
// avoid a duplicate-binding error in the bundled entry below.
const PAGES = [
  { name: 'ActivityLog', import: "import { ActivityLog } from './src/pages/ActivityLog'", jsx: '<ActivityLog />' },
  { name: 'Admin', import: "import { Admin } from './src/pages/Admin'", jsx: '<Admin />' },
  { name: 'AgentActivity', import: "import { AgentActivity } from './src/pages/AgentActivity'", jsx: '<AgentActivity />' },
  { name: 'AgentPerformance', import: "import { AgentPerformance } from './src/pages/AgentPerformance'", jsx: '<AgentPerformance />' },
  { name: 'Analytics', import: "import { Analytics } from './src/pages/Analytics'", jsx: '<Analytics />' },
  { name: 'Announcements', import: "import { Announcements } from './src/pages/Announcements'", jsx: '<Announcements />' },
  { name: 'Automations', import: "import { Automations } from './src/pages/Automations'", jsx: '<Automations />' },
  { name: 'Calendar', import: "import { Calendar } from './src/pages/Calendar'", jsx: '<Calendar />' },
  { name: 'CallDiagnostics', import: "import { CallDiagnostics } from './src/pages/CallDiagnostics'", jsx: '<CallDiagnostics />' },
  { name: 'CallFlow', import: "import { CallFlow } from './src/pages/CallFlow'", jsx: '<CallFlow />' },
  { name: 'Calls', import: "import { Calls } from './src/pages/Calls'", jsx: '<Calls />' },
  { name: 'ContactDetail', import: "import { ContactDetail } from './src/pages/ContactDetail'", jsx: '<ContactDetail />' },
  { name: 'Contacts', import: "import { Contacts } from './src/pages/Contacts'", jsx: '<Contacts />' },
  { name: 'CustomFields', import: "import { CustomFields } from './src/pages/CustomFields'", jsx: '<CustomFields />' },
  { name: 'DailyBriefing', import: "import { DailyBriefing } from './src/pages/DailyBriefing'", jsx: '<DailyBriefing />' },
  { name: 'Dashboard', import: "import { Dashboard } from './src/pages/Dashboard'", jsx: '<Dashboard />' },
  { name: 'DashboardCommandCenter', import: "import { DashboardCommandCenter } from './src/pages/DashboardCommandCenter'", jsx: '<DashboardCommandCenter />' },
  { name: 'DashboardSmart', import: "import { DashboardSmart } from './src/pages/DashboardSmart'", jsx: '<DashboardSmart />' },
  { name: 'DashboardV2', import: "import { Dashboard as Dashboard_DashboardV2 } from './src/pages/DashboardV2'", jsx: '<Dashboard_DashboardV2 />' },
  { name: 'DesignStudio', import: "import { DesignStudio } from './src/pages/DesignStudio'", jsx: '<DesignStudio />' },
  { name: 'Email', import: "import { Email } from './src/pages/Email'", jsx: '<Email />' },
  { name: 'EmailBlast', import: "import { EmailBlast } from './src/pages/EmailBlast'", jsx: '<EmailBlast />' },
  { name: 'EmailDesigner', import: "import { EmailDesigner } from './src/pages/EmailDesigner'", jsx: '<EmailDesigner />' },
  { name: 'Gifts', import: "import { Gifts } from './src/pages/Gifts'", jsx: '<Gifts />' },
  { name: 'ListingPrep', import: "import { ListingPrep } from './src/pages/ListingPrep'", jsx: '<ListingPrep />' },
  { name: 'Listings', import: "import { Listings } from './src/pages/Listings'", jsx: '<Listings />' },
  { name: 'Login', import: "import { Login } from './src/pages/Login'", jsx: '<Login />' },
  { name: 'MarketUpdateCard', import: "import { MarketUpdateCard } from './src/pages/MarketUpdateCard'", jsx: '<MarketUpdateCard />' },
  { name: 'Marketing', import: "import { Marketing } from './src/pages/Marketing'", jsx: '<Marketing />' },
  { name: 'Mortgage', import: "import { Mortgage } from './src/pages/Mortgage'", jsx: '<Mortgage />' },
  { name: 'MyListings', import: "import { MyListings } from './src/pages/MyListings'", jsx: '<MyListings />' },
  { name: 'Notepad', import: "import { Notepad } from './src/pages/Notepad'", jsx: '<Notepad />' },
  { name: 'Notes', import: "import { Notes } from './src/pages/Notes'", jsx: '<Notes />' },
  { name: 'Offers', import: "import { Offers } from './src/pages/Offers'", jsx: '<Offers />' },
  { name: 'OffersLegacy', import: "import { OffersLegacy } from './src/pages/OffersLegacy'", jsx: '<OffersLegacy />' },
  { name: 'OffersV2', import: "import { OffersV2 } from './src/pages/OffersV2'", jsx: '<OffersV2 />' },
  { name: 'OpenHouse', import: "import { OpenHouse } from './src/pages/OpenHouse'", jsx: '<OpenHouse />' },
  { name: 'Pipeline', import: "import { Pipeline } from './src/pages/Pipeline'", jsx: '<Pipeline />' },
  { name: 'Production', import: "import { Production } from './src/pages/Production'", jsx: '<Production />' },
  { name: 'PublicSite', import: "import { PublicHome } from './src/pages/PublicSite'", jsx: '<PublicHome />' },
  { name: 'ReportBuilder', import: "import { ReportBuilder } from './src/pages/ReportBuilder'", jsx: '<ReportBuilder />' },
  { name: 'Reports', import: "import { Reports } from './src/pages/Reports'", jsx: '<Reports />' },
  { name: 'Segments', import: "import { Segments } from './src/pages/Segments'", jsx: '<Segments />' },
  { name: 'Settings', import: "import { Settings } from './src/pages/Settings'", jsx: '<Settings />' },
  { name: 'Signs', import: "import { Signs } from './src/pages/Signs'", jsx: '<Signs />' },
  { name: 'SocialCards', import: "import { SocialCards } from './src/pages/SocialCards'", jsx: '<SocialCards />' },
  { name: 'TCSettings', import: "import TCSettings from './src/pages/TCSettings'", jsx: '<TCSettings />' },
  { name: 'TVBoard', import: "import { TVBoard } from './src/pages/TVBoard'", jsx: '<TVBoard />' },
  { name: 'Tasks', import: "import { Tasks } from './src/pages/Tasks'", jsx: '<Tasks />' },
  { name: 'TestimonialCard', import: "import { TestimonialCard } from './src/pages/TestimonialCard'", jsx: '<TestimonialCard />' },
  { name: 'TransactionCoordinator', import: "import { TransactionCoordinator } from './src/pages/TransactionCoordinator'", jsx: '<TransactionCoordinator />' },
  { name: 'Transactions', import: "import { Transactions } from './src/pages/Transactions'", jsx: '<Transactions />' },
  { name: 'WebsiteBuilder', import: "import { WebsiteBuilder } from './src/pages/WebsiteBuilder'", jsx: '<WebsiteBuilder />' },
  { name: 'WeeklyAd', import: "import { WeeklyAd } from './src/pages/WeeklyAd'", jsx: '<WeeklyAd />' },
]

const SHIMS = `
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {}, getElementById: () => null, documentElement: { style: { setProperty: () => {} } }, body: {}, head: { appendChild: () => {} }, createElement: () => ({ style: {}, getContext: () => null, href: '', setAttribute: () => {}, appendChild: () => {} }) };
globalThis.window = { location: { origin: 'http://smoke.test', href: 'http://smoke.test/', pathname: '/', search: '' }, document: globalThis.document, addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }), innerWidth: 1280, innerHeight: 800, setInterval, clearInterval, setTimeout, clearTimeout };
globalThis.navigator = { userAgent: 'render-smoke', clipboard: {} };
`

// NOTE (Sept 2 2026 audit, docs/robustness-audit-2026-09-02.md): the entry
// below now calls process.exit(0) on success. Without it, some
// provider/module (likely an auth or Supabase client doing work outside a
// useEffect) leaves a pending handle/timer open under Node, which keeps
// this process alive indefinitely even after every check has already
// passed and printed — so `npm run preflight` could hang forever on a
// fully green run. The explicit exit makes this script terminate the way
// build/validate/smoke already do.
const entry = `
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './src/context/AuthContext'
import { AppProvider } from './src/context/AppContext'
${PAGES.map(p => p.import).join('\n')}

const pages = [
${PAGES.map(p => `  { name: '${p.name}', el: ${p.jsx.replace('<', 'React.createElement(').replace(' />', ')')} },`).join('\n')}
]

let failed = 0
for (const p of pages) {
  try {
    renderToString(
      React.createElement(MemoryRouter, null,
        React.createElement(AuthProvider, null,
          React.createElement(AppProvider, null, p.el))))
    console.log('  \\u2713 ' + p.name + ' renders')
  } catch (e) {
    failed++
    console.log('  \\u2717 ' + p.name + ' CRASHES ON MOUNT: ' + e.message)
  }
}
if (failed) { console.log('\\nRENDER SMOKE FAILED \\u2014 ' + failed + ' page(s) would white-screen. Do NOT push.'); process.exit(1) }
console.log('\\nALL PAGES RENDER \\u2014 no mount crashes.')
process.exit(0)
`

const tmpEntry = path.join(process.cwd(), '.render-smoke-entry.jsx')
const tmpOut = path.join(os.tmpdir(), 'render-smoke.cjs')
fs.writeFileSync(tmpEntry, entry)
try {
  // Use the local esbuild binary directly rather than `npx esbuild` — npx
  // resolves/verifies the package against the registry first, which has no
  // timeout here and can hang indefinitely (rather than just failing fast)
  // if the registry is slow or unreachable. The local binary needs no
  // network at all. (Found Sept 2 2026 — this step was hanging the entire
  // preflight with no error; see docs/robustness-audit-2026-09-02.md.)
  const esbuildBin = path.join(process.cwd(), 'node_modules', '.bin', 'esbuild')
  execSync(
    `${esbuildBin} ${tmpEntry} --bundle --platform=node --loader:.js=jsx --loader:.jsx=jsx --loader:.css=empty --jsx=automatic ` +
    // FIX (Sept 2026 audit, finding M4 follow-up): widening PAGES to the
    // real page set below pulled in files that read import.meta.env.* at
    // module scope (MLSSearch, Signs, PublicSite, AddressAutocomplete,
    // etc.) — Vite replaces that at build time, but esbuild targeting
    // node/cjs on its own leaves `import.meta` as a bare object with no
    // `env`, so `import.meta.env.VITE_X` throws "Cannot read properties
    // of undefined" before a single page gets a chance to render.
    // Defining it as an empty object makes every VITE_* lookup resolve to
    // `undefined` (falling through each site's own `|| ''`/`|| 'default'`)
    // instead of crashing the whole smoke test.
    `--define:import.meta.env={} ` +
    `--banner:js="${SHIMS.replace(/\n/g, ' ').replace(/"/g, '\\"')}" --outfile=${tmpOut} --log-level=error`,
    { stdio: ['ignore', 'inherit', 'inherit'], timeout: 60000 }
  )
  execSync(`node ${tmpOut}`, { stdio: 'inherit', timeout: 60000 })
} catch (e) {
  process.exitCode = 1
} finally {
  try { fs.unlinkSync(tmpEntry) } catch (e) {}
}
