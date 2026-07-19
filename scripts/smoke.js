#!/usr/bin/env node
// TargetOS — Deep Smoke Test (July 2026)
// Run: node scripts/smoke.js   (after validate.js, before every push)
//
// Catches the class of bug the bundler does NOT: identifiers imported
// from files that don't export them, imports of files that don't exist,
// and syntax errors in serverless /api handlers (which Vite never builds).
// This is the "voiceNotes / useFeature / supabase-in-ListingPrep" fix.
//
// Same design rule as validate.js: every check pushes into the single
// `failures` array; exit code decided once at the end.

const fs = require('fs')
const path = require('path')

let failures = []
let passes = []

function getAllFiles(dir, exts) {
  let r = []
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f)
    if (fs.statSync(fp).isDirectory()) r = r.concat(getAllFiles(fp, exts))
    else if (exts.some(e => f.endsWith(e))) r.push(fp)
  })
  return r
}

const srcFiles = getAllFiles('src', ['.js', '.jsx'])
const apiFiles = getAllFiles('api', ['.js'])

// ── Resolve a relative import to an actual file ──────────────────
function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  const candidates = [
    base,
    base + '.js', base + '.jsx',
    path.join(base, 'index.js'), path.join(base, 'index.jsx'),
  ]
  return candidates.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null
}

// ── Collect the export surface of a file ─────────────────────────
const exportCache = {}
function getExports(file) {
  if (exportCache[file]) return exportCache[file]
  const code = fs.readFileSync(file, 'utf8')
  const names = new Set()
  let hasDefault = /export\s+default\b/.test(code)
  // export const/let/var/function/class NAME
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  // export { a, b as c } (possibly re-export)
  for (const m of code.matchAll(/export\s*\{([^}]+)\}/g)) {
    m[1].split(',').forEach(part => {
      const seg = part.trim()
      if (!seg) return
      const as = seg.match(/^([\w$]+)\s+as\s+([\w$]+)$/)
      const name = as ? as[2] : seg.split(/\s+/)[0]
      if (name === 'default') hasDefault = true
      else names.add(name)
    })
  }
  // export * from './x' — merge target's exports
  for (const m of code.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    if (m[1].startsWith('.')) {
      const t = resolveImport(file, m[1])
      if (t) getExports(t).names.forEach(n => names.add(n))
    }
  }
  exportCache[file] = { names, hasDefault }
  return exportCache[file]
}

// ── CHECK 1: every relative import resolves to a real file ───────
// ── CHECK 2: every named import exists in the target's exports ───
let importCount = 0
srcFiles.forEach(f => {
  const code = fs.readFileSync(f, 'utf8')
  const importRe = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g
  for (const m of code.matchAll(importRe)) {
    const [, defaultName, namedBlock, spec] = m
    if (!spec.startsWith('.')) continue // packages: vite/npm handle these
    importCount++
    const target = resolveImport(f, spec)
    if (!target) {
      failures.push(`${f}: import '${spec}' does not resolve to any file`)
      continue
    }
    const exp = getExports(target)
    if (defaultName && !exp.hasDefault) {
      failures.push(`${f}: default import '${defaultName}' but ${path.relative('.', target)} has no default export`)
    }
    if (namedBlock) {
      namedBlock.split(',').map(s => s.trim()).filter(Boolean).forEach(seg => {
        if (seg.startsWith('type ')) return
        const name = seg.split(/\s+as\s+/)[0].trim()
        if (name && !exp.names.has(name)) {
          failures.push(`${f}: imports { ${name} } but ${path.relative('.', target)} does not export it`)
        }
      })
    }
  }
})
passes.push(`Import resolution: ${importCount} relative imports verified across ${srcFiles.length} src files`)

// ── CHECK 3: /api handlers parse (Vite never builds these) ───────
// esbuild ships as a vite dependency, so it's always installed.
let esbuild
try { esbuild = require('esbuild') } catch { esbuild = null }
if (esbuild) {
  apiFiles.forEach(f => {
    try {
      esbuild.transformSync(fs.readFileSync(f, 'utf8'), { loader: 'js' })
    } catch (e) {
      failures.push(`${f}: syntax error — ${e.errors?.[0]?.text || e.message}`)
    }
  })
  passes.push(`API syntax: ${apiFiles.length} serverless handlers parsed clean`)
} else {
  failures.push('esbuild not found — run npm install before smoke test')
}

// ── CHECK 4: every /api handler has a default export (Vercel req) ─
apiFiles.forEach(f => {
  if (f.includes('_lib')) return
  const code = fs.readFileSync(f, 'utf8')
  if (!/export\s+default\b|module\.exports\s*=/.test(code)) {
    failures.push(`${f}: no default export / module.exports — Vercel will 404 this route`)
  }
})
passes.push('API handlers: default export present on all routes')

// ── CHECK 5: no duplicate route paths in App.jsx ─────────────────
{
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  const seen = {}
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"/g)) {
    if (m[1] === '*') continue // catch-alls are valid once per <Routes> block
    if (seen[m[1]]) failures.push(`src/App.jsx: duplicate route path "${m[1]}"`)
    seen[m[1]] = true
  }
  passes.push(`Routes: ${Object.keys(seen).length} unique paths in App.jsx`)
}

// ── CHECK 6: route elements reference imported components ────────
{
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  const imported = new Set()
  for (const m of app.matchAll(/import\s+(?:\{([^}]*)\}|([\w$]+))\s*from/g)) {
    if (m[2]) imported.add(m[2])
    if (m[1]) m[1].split(',').forEach(s => {
      const name = s.trim().split(/\s+as\s+/).pop()
      if (name) imported.add(name.trim())
    })
  }
  for (const m of app.matchAll(/(?:function|const)\s+([A-Z][\w$]*)/g)) imported.add(m[1]) // locally defined
  for (const m of app.matchAll(/element=\{<([A-Z][\w$]*)/g)) {
    if (!imported.has(m[1])) failures.push(`src/App.jsx: route element <${m[1]}> is never imported`)
  }
  passes.push('Routes: every element component is imported')
}

// ── Verdict (single exit point, per validate.js design rule) ─────
console.log('')
passes.forEach(p => console.log('  ✓ ' + p))
if (failures.length) {
  console.log('')
  failures.forEach(f => console.log('  ✗ ' + f))
  console.log(`\nSMOKE TEST FAILED — ${failures.length} problem(s). Do NOT push.`)
  process.exit(1)
} else {
  console.log('\nALL SMOKE CHECKS PASSED — safe to push.')
  process.exit(0)
}
