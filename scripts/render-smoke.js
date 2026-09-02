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
const PAGES = [
  { name: 'Marketing',     import: "import { Marketing } from './src/pages/Marketing'",         jsx: '<Marketing />' },
  { name: 'Announcements', import: "import { Announcements } from './src/pages/Announcements'", jsx: '<Announcements />' },
  { name: 'Admin',         import: "import { Admin } from './src/pages/Admin'",                 jsx: '<Admin />' },
  { name: 'Settings',      import: "import { Settings } from './src/pages/Settings'",           jsx: '<Settings />' },
  { name: 'Calendar',      import: "import { Calendar } from './src/pages/Calendar'",           jsx: '<Calendar />' },
  { name: 'TVBoard',       import: "import { TVBoard } from './src/pages/TVBoard'",             jsx: '<TVBoard />' },
  { name: 'AgentActivity', import: "import { AgentActivity } from './src/pages/AgentActivity'", jsx: '<AgentActivity />' },
  { name: 'Dashboard',     import: "import { Dashboard } from './src/pages/Dashboard'",           jsx: '<Dashboard />' },
  { name: 'DashboardSmart',import: "import { DashboardSmart } from './src/pages/DashboardSmart'", jsx: '<DashboardSmart />' },
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
    `--banner:js="${SHIMS.replace(/\n/g, ' ').replace(/"/g, '\\"')}" --outfile=${tmpOut} --log-level=error`,
    { stdio: ['ignore', 'inherit', 'inherit'], timeout: 60000 }
  )
  execSync(`node ${tmpOut}`, { stdio: 'inherit', timeout: 60000 })
} catch (e) {
  process.exitCode = 1
} finally {
  try { fs.unlinkSync(tmpEntry) } catch (e) {}
}
