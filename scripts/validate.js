#!/usr/bin/env node
// TargetOS V2 — Pre-deploy Validator
// Run: node scripts/validate.js
// Must show ALL CHECKS PASSED before every deploy.
//
// Design rule (July 2026 rewrite): every check pushes into ONE shared
// `failures` array. The exit code is decided ONCE, at the very end, from
// that single array. Do not add a check that decides its own pass/fail
// outside this array — that's exactly the bug this rewrite fixes (a
// separate, never-declared `errors` counter meant some checks reported
// failures but never actually blocked a deploy, and crashed instead of
// failing cleanly when it did trigger).

const fs   = require('fs')
const path = require('path')
const { execSync } = require('child_process')

let failures = []
let passes   = []

function getAllFiles(dir, exts) {
  let r = []
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f)
    if (fs.statSync(fp).isDirectory()) r = r.concat(getAllFiles(fp, exts))
    else if (exts.some(e => f.endsWith(e))) r.push(fp)
  })
  return r
}

const jsxFiles = getAllFiles('src', ['.jsx', '.js'])

// ── CHECK 1: No backticks in JSX render paths ──────────────────
// FIX (Sept 2026 audit, finding M1): the old regex required the backtick
// to sit immediately after =/{/> (mod whitespace), which missed
// CLAUDE.md's own canonical crash example --
// `<div style={{ border: \`1px solid ${color}\` }}>` -- because the
// backtick there is preceded by "border: ", not one of those three
// characters. A backtick anywhere inside a JSX attribute's `attr={...}`
// expression is just as dangerous, so also flag any `word={` opener
// followed later on the same line by a backtick, in addition to the
// original self-closing/closing-tag heuristic.
jsxFiles.filter(f => f.endsWith('.jsx')).forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  let count = 0
  lines.forEach(l => {
    if (!l.includes('`') || l.trim().startsWith('//') || l.trim().startsWith('*')) return
    const looksLikeJsxAttrExpr = /\w+=\{[^}]*`/.test(l)
    const looksLikeTagContext  = (l.includes('/>') || l.includes('</')) && /[={>]\s*`/.test(l)
    if (looksLikeJsxAttrExpr || looksLikeTagContext) count++
  })
  if (count > 0) failures.push('JSX BACKTICK [' + count + '] in ' + path.basename(f))
})
if (!failures.some(f => f.startsWith('JSX'))) passes.push('✓ No JSX-context backticks')

// ── CHECK 2: All imports resolve ───────────────────────────────
jsxFiles.forEach(f => {
  const dir  = path.dirname(f)
  const c    = fs.readFileSync(f, 'utf8')
  const imps = c.match(/^import .+ from ['\"](\.\.?\/.+)['\"]$/gm) || []
  imps.forEach(line => {
    const m = line.match(/from ['\"](\.\.?\/.+)['\"]$/)
    if (!m) return
    const res = path.resolve(dir, m[1])
    const ok  = [res, res+'.js', res+'.jsx', res+'/index.js', res+'/index.jsx'].some(p => fs.existsSync(p))
    if (!ok) failures.push('BROKEN IMPORT ' + path.basename(f) + ' => ' + m[1])
  })
})
if (!failures.some(f => f.startsWith('BROKEN'))) passes.push('✓ All imports resolve')

// ── CHECK 3: API files are CommonJS ────────────────────────────
fs.readdirSync('api').filter(f => f.endsWith('.js')).forEach(f => {
  const c = fs.readFileSync('api/' + f, 'utf8')
  if (!c.includes('module.exports')) failures.push('API MISSING module.exports: ' + f)
  if (/^import /m.test(c))           failures.push('API ES MODULE (use require): ' + f)
})
if (!failures.some(f => f.startsWith('API'))) passes.push('✓ All API files are CommonJS')

// ── CHECK 4: No undefined custom variable ──────────────────────
jsxFiles.filter(f => f.endsWith('.jsx')).forEach(f => {
  const c = fs.readFileSync(f, 'utf8')
  const defined = c.includes('const custom') || c.includes('state.custom') || c.includes('DEFAULT_CUSTOM')
  const used    = /custom\.(brand|org|logo|font|border|sidebar|accent|compact)/.test(c)
  if (used && !defined) failures.push('UNDEFINED custom in ' + path.basename(f))
})
if (!failures.some(f => f.includes('custom'))) passes.push('✓ No undefined custom variable')

// ── CHECK 5: useLocation present where location is used ────────
jsxFiles.filter(f => f.endsWith('.jsx')).forEach(f => {
  const c = fs.readFileSync(f, 'utf8')
  if ((c.includes('location.search') || c.includes('location.pathname')) && !c.includes('= useLocation()')) {
    failures.push('MISSING useLocation() in ' + path.basename(f))
  }
})
if (!failures.some(f => f.includes('useLocation'))) passes.push('✓ All location hooks present')

// ── CHECK 6: vercel.json has all required fields ───────────────
try {
  const vj = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  if (!vj.buildCommand)   failures.push('vercel.json: missing buildCommand')
  if (!vj.outputDirectory) failures.push('vercel.json: missing outputDirectory')
  if (!vj.rewrites || !vj.rewrites[0]?.source.includes('(?!api/)'))
    failures.push('vercel.json: rewrite must include (?!api/) to protect API routes')
  if (!failures.some(f => f.startsWith('vercel'))) passes.push('✓ vercel.json is correct')
} catch(e) { failures.push('vercel.json: cannot parse — ' + e.message) }

// ── CHECK 7: No duplicate Supabase channel names ───────────────
// FIX (Sept 2026 audit, finding M2): the old regex only matched
// supabase.channel(...) when the argument was a bare string literal with
// nothing else inside the parens -- every concatenated name in the app
// ('rt_'+tableName+'_'+instanceId in hooks.js, 'activity_'+recordId in
// RecordActivityFeed.jsx, 'sms_'+contactId in SMSInbox.jsx,
// 'notifs_'+agent.id in NotificationBell.jsx) was invisible to it. A
// future file computing that exact same concatenation would sail through
// undetected -- the exact class of bug that caused the postgres_changes
// production crash CLAUDE.md documents. Extract the FULL argument
// expression (balanced-paren scan, so nested calls don't truncate it)
// instead of requiring a bare string literal, and compare call sites by
// that normalized expression text so an identical concatenation used
// twice is still caught.
const allSrc = jsxFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n')
const subSrc = allSrc.split('\n').filter(l => !l.includes('removeChannel')).join('\n')
function extractChannelArgs(src) {
  const args = []
  const marker = 'supabase.channel('
  let idx = 0
  while (true) {
    const start = src.indexOf(marker, idx)
    if (start === -1) break
    let i = start + marker.length
    let depth = 1
    const argStart = i
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
      i++
    }
    args.push(src.slice(argStart, i - 1).trim().replace(/\s+/g, ' '))
    idx = i
  }
  return args
}
// A bare variable reference (e.g. `chName`, `ch`) carries no static
// evidence either way -- the same generic local name is reused across
// unrelated files/functions for entirely different runtime channel names
// (confirmed: NotificationBell.jsx, RecordActivityFeed.jsx and
// hooks.js each have their own unrelated local `chName`/`ch`), so
// comparing bare identifiers by source text alone is pure noise. Only
// compare expressions that contain a string-literal fragment -- that's
// what makes a match like 'notifs_'+agent.id meaningful in the first
// place, and it's exactly the shape of every real example M2 called out.
const chNames     = extractChannelArgs(subSrc).filter(n => /['"`]/.test(n))
const dupes       = chNames.filter((n, i) => chNames.indexOf(n) !== i)
const uniqueDupes = [...new Set(dupes)]
if (uniqueDupes.length > 0) {
  failures.push('DUPLICATE SUPABASE CHANNELS (causes the postgres_changes crash): ' + uniqueDupes.join(', '))
} else {
  passes.push('✓ No duplicate Supabase channel names')
}

// ── CHECK 8: All pages have exports ────────────────────────────
// Excludes *.test.jsx — test files legitimately have no export; they were
// false-flagging here (found during Sept 2 2026 audit, docs/robustness-audit-2026-09-02.md).
jsxFiles.filter(f => f.includes('/pages/') && f.endsWith('.jsx') && !f.endsWith('.test.jsx')).forEach(f => {
  const c = fs.readFileSync(f, 'utf8')
  if (!c.includes('export function') && !c.includes('export default') && !c.includes('export const')) {
    failures.push('NO EXPORT in ' + path.basename(f))
  }
})
if (!failures.some(f => f.startsWith('NO EXPORT'))) passes.push('✓ All pages export correctly')

// ── CHECK 9: Hook-order — useState/useEffect must not appear inside
//            if() blocks. This causes React error #310, which crashes
//            the entire app. (Restored from the old script's dead-end
//            `else` branch, where it ran but could never actually fail
//            the build.) ────────────────────────────────────────────
// FIX (Sept 2026 audit, finding M3): this used to scan only 4 of the 56
// files in src/pages/, and would not have caught H1 (MLSSearch.jsx,
// a component not even in src/pages/) or H2 (TransactionCoordinator.jsx,
// which WAS in src/pages/ but outside this 4-file allowlist). Scan every
// .jsx file in the whole tree (components included) rather than a
// hand-picked list, so a new page or component isn't silently unchecked.
// FIX (Sept 2026 audit, finding M3 follow-up): a flat single baseline
// broke the moment this check covered real files -- Analytics.jsx defines
// `HealthTable` (a legitimate component, invoked as <HealthTable .../>
// JSX further down) INSIDE another component's render body. Its useState
// call sits at the top of HealthTable's own body, but measured against
// the OUTER component's braceStart that looked "deep" and false-flagged
// a call that isn't a Rules-of-Hooks violation at all. Track a stack of
// baselines, one per nested component definition (function or capitalized
// arrow-const), so a hook is only flagged when it's actually inside an
// if/for/etc. block WITHIN its own component -- not merely nested inside
// another component's render.
let hookInConditional = 0
const hookFiles = jsxFiles.filter(f => f.endsWith('.jsx') && !f.endsWith('.test.jsx'))
hookFiles.forEach(f => {
  try {
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    let braceDepth = 0
    let componentStack = []
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      const opens  = (line.match(/\{/g)||[]).length
      const closes = (line.match(/\}/g)||[]).length
      const isComponentStart =
        /^(export )?(default )?function [A-Z]/.test(trimmed) ||
        /^(export )?(const|let) [A-Z]\w*\s*=\s*(\(.*\)|\w+)\s*=>\s*\{/.test(trimmed) ||
        /^(export )?(const|let) [A-Z]\w*\s*=\s*function\b/.test(trimmed)
      if (isComponentStart) componentStack.push(braceDepth)
      braceDepth += opens - closes
      if (componentStack.length) {
        const baseline = componentStack[componentStack.length - 1]
        if (braceDepth > baseline + 2) {
          if (/\buseState\(|\buseEffect\(|\buseRef\(|\buseMemo\(|\buseCallback\(/.test(line) &&
              !trimmed.startsWith('//')) {
            hookInConditional++
            failures.push('HOOK IN DEEP BLOCK (React error #310 risk): ' + f + ':' + (i+1))
          }
        }
        while (componentStack.length && braceDepth <= componentStack[componentStack.length - 1]) {
          componentStack.pop()
        }
      }
    })
  } catch {}
})
if (hookInConditional === 0) passes.push('✓ No hooks inside deep blocks (React error #310 check)')

// ── CHECK 10: All components used in JSX are imported ──────────
// (Restored from the old script's dead-end `else` branch — same fix.)
// FIX (Sept 2026 audit, finding M3): same fix as CHECK 9 above -- this
// used to scan only 2 hardcoded files out of 56 pages. Scan every .jsx
// file in the tree instead.
// Extracts every local binding name an `import ...` statement introduces
// -- default, named (with `as` aliases), and `* as namespace` -- since
// widening this check to every file (below) hits default-imported
// components (`import ContactPicker from '../components/ContactPicker'`,
// `import GridLayout from 'react-grid-layout'`, `import App from
// './App'`) that the old brace-only regex silently treated as "not
// imported," which would have made this check unusable the moment it
// covered real files.
function getImportedNames(c) {
  const names = new Set()
  const stmts = c.match(/^import\s[\s\S]*?from\s*['"][^'"]+['"]/gm) || []
  stmts.forEach(stmt => {
    const body = stmt.replace(/^import\s+/, '').replace(/\s+from\s*['"][^'"]+['"]$/, '')
    const braceMatch = body.match(/\{([^}]*)\}/)
    if (braceMatch) {
      braceMatch[1].split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
        const asMatch = s.match(/\bas\s+(\w+)/)
        names.add(asMatch ? asMatch[1] : s)
      })
    }
    const nsMatch = body.match(/\*\s*as\s+(\w+)/)
    if (nsMatch) names.add(nsMatch[1])
    const beforeBrace = body.split('{')[0].replace(/\*.*$/, '')
    const defaultMatch = beforeBrace.match(/^\s*(\w+)/)
    if (defaultMatch) names.add(defaultMatch[1])
  })
  return names
}

let missingImports = 0
const criticalFiles = jsxFiles.filter(f => f.endsWith('.jsx') && !f.endsWith('.test.jsx'))
criticalFiles.forEach(f => {
  try {
    const c = fs.readFileSync(f, 'utf8')
    const used = [...new Set((c.match(/<([A-Z][a-zA-Z]+)[\s/>]/g)||[]).map(m=>m.slice(1).replace(/[\s/>].*/,'')))]
    const imported = getImportedNames(c)
    const builtins = ['React','Fragment']
    const locallyDefined = (c.match(/(?:const|function|class)\s+([A-Z][a-zA-Z]+)/g)||[]).map(m=>m.split(/\s+/)[1])
    const missing = used.filter(u => !imported.has(u) && !builtins.includes(u) && !locallyDefined.includes(u))
    if (missing.length) {
      failures.push('MISSING IMPORTS in ' + f + ': ' + missing.join(', '))
      missingImports += missing.length
    }
  } catch {}
})
if (missingImports === 0) passes.push('✓ All component imports verified')

// ── CHECK 11: Unit tests (vitest) ───────────────────────────────
// Added July 2026. Pure-logic regressions (e.g. the TC phase mapping,
// currency/date formatting) are now caught here, before they ship.
try {
  execSync('npx vitest run', { stdio: 'pipe' })
  passes.push('✓ Unit tests pass (npm test)')
} catch (e) {
  failures.push('UNIT TESTS FAILED — run `npm test` locally for full output:\n' +
    (e.stdout ? e.stdout.toString().split('\n').slice(-25).join('\n') : e.message))
}

// ── SUMMARY — single source of truth for pass/fail ──────────────
console.log('\n═══════════════════════════════════════')
console.log('  TargetOS Pre-Deploy Validation')
console.log('═══════════════════════════════════════\n')
passes.forEach(p => console.log('  ' + p))
if (failures.length) {
  console.log('\n  ❌ FAILURES — DO NOT DEPLOY:\n')
  failures.forEach(f => console.log('    ✗ ' + f))
  console.log('\n  Fix all failures before pushing.\n')
  process.exit(1)
}

console.log('\n  ✅ ALL CHECKS PASSED — safe to deploy\n')
console.log('  Deploy (two steps — test staging before promoting to production):')
console.log('    1. npm run build && node scripts/validate.js && git push origin v2')
console.log('       -> check https://targetos-git-v2-target-team.vercel.app')
console.log('    2. git push origin v2:main   (no --force — see handoff doc)\n')
