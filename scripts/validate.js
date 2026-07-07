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
jsxFiles.filter(f => f.endsWith('.jsx')).forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  let count = 0
  lines.forEach(l => {
    if (!l.includes('`') || l.trim().startsWith('//') || l.trim().startsWith('*')) return
    if (/[={>]\s*`/.test(l) && (l.includes('/>') || l.includes('</') || /\w+=\s*\{`/.test(l))) count++
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
const allSrc   = jsxFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n')
const subSrc = allSrc.split('\n').filter(l => !l.includes('removeChannel')).join('\n')
const chMatches = subSrc.match(/supabase\.channel\(['"`]([^'"`\$]+)['"`]\)/g) || []
const chNames   = chMatches.map(c => c.match(/['"`]([^'"`]+)['"`]/)?.[1]).filter(Boolean)
const dupes     = chNames.filter((n, i) => chNames.indexOf(n) !== i)
const uniqueDupes = [...new Set(dupes)]
if (uniqueDupes.length > 0) {
  failures.push('DUPLICATE SUPABASE CHANNELS (causes the postgres_changes crash): ' + uniqueDupes.join(', '))
} else {
  passes.push('✓ No duplicate Supabase channel names')
}

// ── CHECK 8: All pages have exports ────────────────────────────
jsxFiles.filter(f => f.includes('/pages/') && f.endsWith('.jsx')).forEach(f => {
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
let hookInConditional = 0
const hookFiles = [
  'src/pages/Dashboard.jsx', 'src/pages/Contacts.jsx',
  'src/pages/Tasks.jsx', 'src/pages/ContactDetail.jsx',
]
hookFiles.forEach(f => {
  try {
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    let braceDepth = 0
    let inComponent = false
    let componentBraceStart = 0
    lines.forEach((line, i) => {
      const opens  = (line.match(/\{/g)||[]).length
      const closes = (line.match(/\}/g)||[]).length
      if (/^(export )?function [A-Z]/.test(line.trim())) {
        inComponent = true
        componentBraceStart = braceDepth
      }
      braceDepth += opens - closes
      if (inComponent && braceDepth > componentBraceStart + 2) {
        if (/\buseState\(|\buseEffect\(|\buseRef\(|\buseMemo\(|\buseCallback\(/.test(line) &&
            !line.trim().startsWith('//')) {
          hookInConditional++
          failures.push('HOOK IN DEEP BLOCK (React error #310 risk): ' + f + ':' + (i+1))
        }
      }
      if (inComponent && braceDepth <= componentBraceStart) inComponent = false
    })
  } catch {}
})
if (hookInConditional === 0) passes.push('✓ No hooks inside deep blocks (React error #310 check)')

// ── CHECK 10: All components used in JSX are imported ──────────
// (Restored from the old script's dead-end `else` branch — same fix.)
let missingImports = 0
const criticalFiles = ['src/pages/ContactDetail.jsx', 'src/pages/Dashboard.jsx']
criticalFiles.forEach(f => {
  try {
    const c = fs.readFileSync(f, 'utf8')
    const used = [...new Set((c.match(/<([A-Z][a-zA-Z]+)[\s/>]/g)||[]).map(m=>m.slice(1).replace(/[\s/>].*/,'')))]
    const imported = (c.match(/import\s*\{([^}]+)\}/g)||[]).flatMap(m=>m.replace(/import\s*\{/,'').replace(/\}/,'').split(',').map(s=>s.trim()))
    const builtins = ['React','Fragment']
    const locallyDefined = (c.match(/(?:const|function|class)\s+([A-Z][a-zA-Z]+)/g)||[]).map(m=>m.split(/\s+/)[1])
    const missing = used.filter(u => !imported.includes(u) && !builtins.includes(u) && !locallyDefined.includes(u))
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
