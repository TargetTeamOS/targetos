// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Utilities
// All shared formatting, calculation, and helper functions
// ═══════════════════════════════════════════════════════════════

// ── CURRENCY ────────────────────────────────────────────────────
export function fmt$(n) {
  if (!n && n !== 0) return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M'
  if (num >= 1_000)     return '$' + (num / 1_000).toFixed(0) + 'K'
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtFull$(n) {
  if (!n && n !== 0) return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── DATES ────────────────────────────────────────────────────────
export function fmtDate(d) {
  if (!d) return '—'
  const date = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateShort(d) {
  if (!d) return '—'
  const date = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

export function fmtTime(d) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
         date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function getDaysAgo(d) {
  if (!d) return null
  const diff = Date.now() - new Date(d).getTime()
  return Math.floor(diff / 86400000)
}

export function getDaysUntil(d) {
  if (!d) return null
  const diff = new Date(d + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

export function isOverdue(d) {
  if (!d) return false
  return new Date(d + 'T00:00:00').getTime() < Date.now()
}

export function isDueToday(d) {
  if (!d) return false
  const today = new Date().toISOString().slice(0, 10)
  return d === today
}

export function isDueSoon(d, days = 3) {
  if (!d) return false
  const until = getDaysUntil(d)
  return until !== null && until >= 0 && until <= days
}

export function toISODate(d) {
  if (!d) return ''
  if (typeof d === 'string' && d.length === 10) return d
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── NAMES & INITIALS ─────────────────────────────────────────────
export function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

// Alias for backward compatibility
export const getInitials = initials

export function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unknown'
}

// ── PERCENTAGES ──────────────────────────────────────────────────
export function pct(val, total) {
  if (!total || total === 0) return 0
  return Math.min(100, Math.round((val / total) * 100))
}

export function fmtPct(val, total) {
  return pct(val, total) + '%'
}

// ── PHONE ────────────────────────────────────────────────────────
export function fmtPhone(p) {
  if (!p) return ''
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return p
}

export function phoneHref(p) {
  if (!p) return '#'
  return 'tel:' + p.replace(/\D/g, '')
}

// ── STRINGS ──────────────────────────────────────────────────────
export function truncate(str, len = 40) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

export function titleCase(str) {
  if (!str) return ''
  return str.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase())
}

export function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// ── NUMBERS ──────────────────────────────────────────────────────
export function parseNum(v) {
  if (!v && v !== 0) return 0
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── COLORS ───────────────────────────────────────────────────────
export function agentColor(agent) {
  return agent?.color || '#CC2200'
}

export function statusColor(statuses, value) {
  const found = statuses?.find(s => s.value === value || s.label === value)
  return found?.hex || found?.color || '#94A3B8'
}

// ── SORT ─────────────────────────────────────────────────────────
export function sortBy(arr, key, dir = 'asc') {
  return [...arr].sort((a, b) => {
    const av = a[key] ?? ''
    const bv = b[key] ?? ''
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

// ── SEARCH / FILTER ──────────────────────────────────────────────
export function matchSearch(obj, query, keys) {
  if (!query) return true
  const q = query.toLowerCase()
  return keys.some(k => String(obj[k] || '').toLowerCase().includes(q))
}

// ── DEBOUNCE ─────────────────────────────────────────────────────
export function debounce(fn, ms = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

// ── GROUPING ─────────────────────────────────────────────────────
export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'Unknown'
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
}

// ── DEAL GCI HELPERS ─────────────────────────────────────────────
export function totalGCI(deals) {
  return deals.reduce((sum, d) => sum + parseNum(d.gci), 0)
}

export function totalProduction(deals) {
  return deals.reduce((sum, d) => sum + parseNum(d.production), 0)
}

export function dealsInStage(deals, stage) {
  return deals.filter(d => d.stage === stage)
}

export function closedDeals(deals) {
  return deals.filter(d => d.stage === 'Closed')
}

export function activeDeals(deals) {
  return deals.filter(d => !['Closed','Deal Fell Through'].includes(d.stage))
}

// ── COPY TO CLIPBOARD ────────────────────────────────────────────
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ── LOCAL STORAGE ────────────────────────────────────────────────
export function lsGet(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

export function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── UUID ─────────────────────────────────────────────────────────
export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}
