/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — Utility Functions
   ═══════════════════════════════════════════════════════════════ */

// ── CURRENCY ────────────────────────────────────────────────────
export function fmt$(n) {
  if (!n && n !== 0) return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
  if (Math.abs(num) >= 1000000) return '$' + (num/1000000).toFixed(1) + 'M'
  if (Math.abs(num) >= 1000)    return '$' + (num/1000).toFixed(0) + 'K'
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0 })
}

export function fmt$Full(n) {
  if (!n && n !== 0) return '—'
  return '$' + parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── DATES ────────────────────────────────────────────────────────
export function fmtDate(d) {
  if (!d) return '—'
  try {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return d }
}

export function fmtDateShort(d) {
  if (!d) return '—'
  try {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return d }
}

export function fmtDateTime(ts) {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' +
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch { return ts }
}

export function fmtTime(t) {
  if (!t) return ''
  try {
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12  = hour % 12 || 12
    return `${h12}:${m} ${ampm}`
  } catch { return t }
}

export function getDaysAgo(ts) {
  if (!ts) return '—'
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) {
      const hours = Math.floor(diff / 3600000)
      if (hours === 0) return 'Just now'
      return `${hours}h ago`
    }
    if (days === 1) return 'Yesterday'
    if (days < 7)  return `${days}d ago`
    if (days < 30) return `${Math.floor(days/7)}w ago`
    if (days < 365)return `${Math.floor(days/30)}mo ago`
    return `${Math.floor(days/365)}y ago`
  } catch { return '—' }
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

export function todayPlus(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function isOverdue(dateStr) {
  if (!dateStr) return false
  return dateStr < today()
}

export function isDueToday(dateStr) {
  if (!dateStr) return false
  return dateStr === today()
}

// ── TEXT ─────────────────────────────────────────────────────────
export function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function truncate(s, n = 40) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function phoneFormat(p) {
  if (!p) return ''
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11) return `+${digits[0]} (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return p
}

// ── NUMBERS ──────────────────────────────────────────────────────
export function pct(value, total) {
  if (!total) return 0
  return Math.min(Math.round((value / total) * 100), 100)
}

export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

// ── TIME OF DAY ──────────────────────────────────────────────────
export function timeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// ── COLOR ────────────────────────────────────────────────────────
export function hexWithAlpha(hex, alpha) {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

// ── VALIDATION ───────────────────────────────────────────────────
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPhone(phone) {
  return phone.replace(/\D/g, '').length >= 10
}

// Aliases for backward compatibility
export const getInitials = initials
