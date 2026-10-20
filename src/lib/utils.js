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
  // FIX (Oct 2026 round-3 bug sweep): this was the one date helper in this
  // file missing the date-only-string guard its siblings (fmtDate,
  // getDaysUntil, isOverdue) already have -- a bare 'YYYY-MM-DD' value
  // (e.g. the date-only last_reached written by automationEngine.js)
  // parses as UTC midnight, which can be off by a day from local "today"
  // depending on the viewer's timezone. A full timestamp (length !== 10)
  // is left untouched, since appending a time there would corrupt it.
  const diff = Date.now() - new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).getTime()
  return Math.floor(diff / 86400000)
}

export function getDaysUntil(d) {
  if (!d) return null
  const diff = new Date(d + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

export function isOverdue(d) {
  if (!d) return false
  // FIX (Oct 2026 design review): this compared the due date's local
  // MIDNIGHT timestamp against Date.now() -- true from the instant the
  // due day starts, i.e. for the task's/follow-up's entire due day, not
  // just after that day has actually passed. Every call site's own
  // ternary ("isOverdue(d) ? 'Overdue' : 'Due today'" -- Dashboard.jsx,
  // Tasks.jsx, DailyBriefing.jsx) only makes sense if isOverdue is still
  // false while something is due today, so "Due today" was dead code all
  // day, every day, for anything due today. Plain date-string comparison
  // against today() means it only goes true once the due date is
  // actually behind today's date.
  return String(d).slice(0, 10) < today()
}

export function isDueToday(d) {
  if (!d) return false
  return String(d).slice(0, 10) === today()
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
  // FIX (Oct 2026 design review): toISOString() is always UTC. This is
  // an Eastern-time CRM (see isBusinessHours), so from ~7pm EST / 8pm
  // EDT onward every evening, this silently returned TOMORROW's date --
  // wrong "today" highlighted on the Calendar, new tasks/events
  // defaulting a day ahead, and (via isOverdue/isDueToday above) the
  // wrong day used for every overdue/due-today check in the app during
  // those hours. Build the date from LOCAL year/month/day components
  // instead (same reasoning as goalMath.js's startOfDay).
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
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

// ── AGENT BUCKET DEDUPLICATION ────────────────────────────────────
/**
 * Collapses duplicate agent profiles that are really the same person
 * (e.g. an old "Yanky" row and the real "Yanky Lichtenstein" row) into
 * one canonical entry per person, WITHOUT deleting or deactivating
 * anything in the database — this only affects which rows get shown
 * as buckets in this one view.
 *
 * Deliberately conservative: only treats two agents as duplicates when
 * one's full name is a case-insensitive prefix of the other's
 * (e.g. "Yanky" -> "Yanky Lichtenstein"). It never merges two agents
 * who merely share a first name with different surnames — that IS two
 * different real people, and merging them would be a real data-
 * integrity mistake, not a fix.
 *
 * Within a detected duplicate group, the profile with a real
 * auth_user_id (an actual linked login) wins as canonical, regardless
 * of which one has the longer/shorter name — a linked login is a much
 * stronger signal of "this is the real, currently-used profile" than
 * name completeness alone.
 */
export function dedupeCanonicalAgents(rawAgents) {
  const sorted = [...(rawAgents || [])].sort((a, b) => (b.name || '').length - (a.name || '').length)
  const kept = []
  for (const a of sorted) {
    const an = (a.name || '').trim().toLowerCase()
    if (!an) { kept.push({ ...a, mergedIds: [a.id] }); continue }
    const dupIndex = kept.findIndex(k => {
      const kn = (k.name || '').trim().toLowerCase()
      return kn === an || kn.startsWith(an + ' ')
    })
    if (dupIndex === -1) { kept.push({ ...a, mergedIds: [a.id] }); continue }
    const existing = kept[dupIndex]
    if (!existing.auth_user_id && a.auth_user_id) {
      // The shorter-named profile is actually the real, linked one —
      // swap which record is canonical, but keep BOTH ids in
      // mergedIds so historical offers assigned to either one still
      // count toward this one bucket.
      kept[dupIndex] = { ...a, mergedIds: [...existing.mergedIds, a.id] }
    } else {
      existing.mergedIds.push(a.id) // `a` is a duplicate — folded into `existing`'s history, not shown separately
    }
  }
  return kept
}

// ── UUID ─────────────────────────────────────────────────────────
export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}
