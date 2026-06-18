// ═══════════════════════════════════════════════
// TIME UTILITY — All timestamps in Eastern Time
// Target Team is based in Rockland County, NY
// Always use these functions for any date/time
// ═══════════════════════════════════════════════

const TZ = 'America/New_York'

// Get current time as ISO string in Eastern Time
export function nowISO() {
  return new Date().toISOString()
}

// Format a timestamp for display — Eastern Time
export function formatTime(isoString, opts = {}) {
  if(!isoString) return '—'
  const defaults = {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }
  return new Date(isoString).toLocaleString('en-US', {...defaults, ...opts})
}

// Format date only (no time)
export function formatDate(isoString) {
  if(!isoString) return '—'
  return new Date(isoString).toLocaleDateString('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric'
  })
}

// Format time only
export function formatTimeOnly(isoString) {
  if(!isoString) return '—'
  return new Date(isoString).toLocaleTimeString('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true
  })
}

// Human-readable "time ago" — always in Eastern Time
export function timeAgo(isoString) {
  if(!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if(mins < 1)   return 'just now'
  if(mins < 60)  return `${mins}m ago`
  if(hours < 24) return `${hours}h ago`
  if(days === 1) return 'yesterday'
  if(days < 7)   return `${days} days ago`
  if(days < 30)  return `${Math.floor(days/7)} weeks ago`
  return formatDate(isoString)
}

// Get today's date as YYYY-MM-DD in Eastern Time
export function todayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // en-CA gives YYYY-MM-DD
}

// Get current Eastern time object
export function nowET() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
}

// Format for activity log display
export function formatActivity(isoString) {
  if(!isoString) return '—'
  const d = new Date(isoString)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  
  if(diffDays === 0) {
    return 'Today at ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
  }
  if(diffDays === 1) {
    return 'Yesterday at ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
  }
  if(diffDays < 7) {
    return d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' }) + ' at ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
}
