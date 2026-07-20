# TargetOS V2 — AI Assistant Instructions

This file is read by every AI assistant before making any changes.
**Follow every rule here without exception. No shortcuts.**

---

## DEPLOY WORKFLOW — MANDATORY EVERY TIME

Before pushing ANY change, run this sequence in order:

```bash
npm run build                    # must show "✓ built" — zero errors
node scripts/validate.js         # must show "✅ ALL CHECKS PASSED"
node scripts/smoke.js            # must show "ALL SMOKE CHECKS PASSED"
node scripts/render-smoke.js     # must show "ALL PAGES RENDER" — SSR-mounts
                                 # every key page; catches mount crashes
                                 # (TDZ/undefined state) that build+smoke
                                 # miss. Found the eraseZones Marketing
                                 # white-screen. `npm run preflight` runs all.
                                 # (verifies every import/export resolves +
                                 #  /api handlers parse — the bug class the
                                 #  bundler misses; bit us 3× before this)
git push origin v2               # push to v2
git push origin v2:main          # deploy to Vercel (NO --force — ever)
```

**Never push if either command fails. Fix the issue first.**

---

## CRITICAL RULES — THESE CRASH THE APP

### 1. NO BACKTICKS IN JSX RENDER PATHS
esbuild silently misparses template literals inside JSX at runtime.

```jsx
// ❌ CRASHES AT RUNTIME
<div style={{ border: `1px solid ${color}` }}>
<Comp label={`${count} items`} />

// ✅ CORRECT
<div style={{ border: '1px solid ' + color }}>
<Comp label={count + ' items'} />
```

Backticks are ONLY safe in pure JavaScript (outside JSX): `const x = \`...\``

---

### 2. NO DUPLICATE SUPABASE REALTIME CHANNELS
**This is what caused the "cannot add postgres_changes callbacks after subscribe()" crash.**

```js
// ❌ CRASHES — Date.now() creates a new name every render
supabase.channel(`rt_${table}_${Date.now()}`)

// ❌ CRASHES — same table subscribed in two places
// hooks.js already subscribes to 'agents'
// some other file also subscribes to 'agents' → duplicate

// ✅ CORRECT — stable name, tear down before recreating
const chName = 'rt_' + tableName + '_' + instanceId
supabase.removeChannel(supabase.channel(chName)) // remove stale first
const ch = supabase.channel(chName)
  .on('postgres_changes', {...}, handler)
  .subscribe()
return () => supabase.removeChannel(ch)
```

**One subscription per table, ever. Check `src/lib/hooks.js` owns it.**
**Run `node scripts/validate.js` — it will catch duplicate channel names.**

---

### 3. API FILES MUST BE COMMONJS
All `/api/*.js` files run on Vercel serverless — they MUST use CommonJS.

```js
// ❌ BREAKS VERCEL
import { createClient } from '@supabase/supabase-js'
export default async function handler(req, res) {}

// ✅ CORRECT
const { createClient } = require('@supabase/supabase-js')
module.exports = async function handler(req, res) {}
```

Also: create the Supabase client INSIDE the handler, never at module level.

---

### 4. ALL VARIABLES MUST BE DEFINED BEFORE USE
```jsx
// ❌ CRASHES — 'custom' used but never pulled from state
const { state } = useApp()
<div style={{ background: custom.brandColor }}>

// ✅ CORRECT
const { state } = useApp()
const custom = state.custom || {}
<div style={{ background: custom.brandColor }}>
```

---

### 5. useLocation() MUST BE IN SCOPE
```jsx
// ❌ CRASHES — location.search used but useLocation not called here
function Calls() {
  const params = new URLSearchParams(location.search) // undefined!

// ✅ CORRECT
function Calls() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
```

---

### 6. vercel.json MUST ALWAYS HAVE THESE THREE FIELDS
```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```
The rewrite pattern `(?!api/)` protects serverless API routes.
Without `buildCommand` + `outputDirectory`, Vercel cannot build the project.

---

## TECH STACK QUICK REFERENCE

```
Frontend:  React 18 + Vite 5
Routing:   React Router v6
State:     React Context (AppContext, AuthContext)
Database:  Supabase (PostgreSQL + Realtime + Auth)
Styling:   CSS variables in src/styles.css — NO Tailwind, NO CSS modules
Icons:     Inline SVG or emoji only — NO icon libraries
API:       /api/*.js — Vercel serverless, CommonJS only
Deploy:    git push origin v2:main --force → Vercel auto-deploys
Live URL:  https://app.targetreteam.com
```

## REPO STRUCTURE

```
src/
  pages/       ← One file per CRM page
  components/  ← Shared UI (Layout, UI.jsx, etc.)
  context/     ← AppContext, AuthContext
  lib/         ← db.js, hooks.js, supabase.js, utils.js
  styles.css   ← All CSS variables
api/           ← Vercel serverless (CommonJS only)
vercel.json    ← Must keep buildCommand + outputDirectory + rewrite
scripts/
  validate.js  ← Run before every deploy
```

## KEY FILES

- `src/App.jsx` — routes, auth guard
- `src/components/Layout.jsx` — sidebar (uses `state.custom`)
- `src/components/UI.jsx` — shared components (Btn, Modal, etc.)
- `src/lib/hooks.js` — ALL Realtime subscriptions live here
- `src/lib/db.js` — all Supabase CRUD operations

---

## WHAT BROKE BEFORE AND WHY

| Error | Cause | Fix |
|-------|-------|-----|
| `cannot add postgres_changes callbacks after subscribe()` | `Date.now()` in channel name + duplicate subscriptions across files | Stable channel names + one subscription per table |
| Blank screen on login | `custom` used in Layout.jsx before being defined | `const custom = state.custom \|\| {}` |
| Build fails on Vercel | `buildCommand` missing from vercel.json | Always keep all 3 vercel.json fields |
| Runtime crash on any page | Backtick template literals in JSX | String concatenation only in JSX |
| `location.search` undefined | `useLocation()` called in child, used in parent | Call `useLocation()` in the same component that uses it |
| Calls page crash | `location.search` used in main component but `useLocation` only called in sub-component | Moved `useLocation()` to top of `Calls()` function |

