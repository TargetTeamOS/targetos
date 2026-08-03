// dashboardData (core) — the framework-free heart of the shared dashboard data
// layer. It has no React and no network: fetchers are injected, so every rule
// here (cache keys, in-flight de-duplication, stale-response protection, date
// windows) is deterministic and unit-testable. The React hook in
// useDashboardData.js composes these pieces so that many widgets share ONE
// coordinator instead of each firing its own duplicate requests.

// Deterministic cache key: identical params in any order produce the same key.
export function makeCacheKey(metric, params = {}) {
  const p = params && typeof params === 'object' ? params : {}
  const stable = JSON.stringify(p, Object.keys(p).sort())
  return `${metric}::${stable}`
}

// Coordinator shared by all widgets on a dashboard.
//  - run(key, fetcher):  de-dupes — a second call with the same key while the
//    first is in flight returns the SAME promise (one fetcher invocation).
//  - issue(key) / isFresh(key, seq):  stale guard — each request draws a
//    monotonic sequence for its key; only the newest is allowed to write state,
//    so a slow older response can never clobber a newer one.
export function createRequestCoordinator() {
  const inflight = new Map() // key -> Promise
  const latest = new Map()   // key -> highest issued sequence

  return {
    run(key, fetcher) {
      if (inflight.has(key)) return inflight.get(key)
      const p = Promise.resolve()
        .then(() => fetcher())
        .finally(() => { inflight.delete(key) })
      inflight.set(key, p)
      return p
    },
    issue(key) {
      const next = (latest.get(key) || 0) + 1
      latest.set(key, next)
      return next
    },
    isFresh(key, seq) {
      return latest.get(key) === seq
    },
    inflightCount() { return inflight.size },
    reset() { inflight.clear(); latest.clear() },
  }
}

// Small in-memory cache with per-entry timestamp and optional TTL.
export function createCache() {
  const store = new Map() // key -> { value, at }
  return {
    get(key, ttlMs) {
      const hit = store.get(key)
      if (!hit) return undefined
      if (ttlMs != null && Date.now() - hit.at > ttlMs) return undefined
      return hit
    },
    set(key, value) { const at = Date.now(); store.set(key, { value, at }); return at },
    has(key) { return store.has(key) },
    clear(key) { key == null ? store.clear() : store.delete(key) },
  }
}

// Named date presets → an inclusive-from / exclusive-to window plus a label
// used in widget metadata ("Date range"). 'all' means no bounds.
export function rangeFor(preset, now = new Date()) {
  const y = now.getFullYear()
  const iso = (d) => d.toISOString().slice(0, 10)
  const daysAgo = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d }
  const tomorrow = () => { const d = new Date(now); d.setDate(d.getDate() + 1); return d }
  switch (preset) {
    case 'today':   return { from: iso(now), to: iso(tomorrow()), label: 'Today' }
    case 'week':    return { from: iso(daysAgo(7)),  to: iso(tomorrow()), label: 'Last 7 days' }
    case 'month':   return { from: iso(daysAgo(30)), to: iso(tomorrow()), label: 'Last 30 days' }
    case 'quarter': return { from: iso(daysAgo(90)), to: iso(tomorrow()), label: 'Last 90 days' }
    case 'mtd':     return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(tomorrow()), label: 'Month to date' }
    case 'ytd':     return { from: iso(new Date(y, 0, 1)), to: iso(tomorrow()), label: 'Year to date' }
    case 'all':
    default:        return { from: null, to: null, label: 'All time' }
  }
}

export const DATE_PRESETS = [
  { id: 'all', label: 'All time' }, { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' }, { id: 'month', label: '30 days' },
  { id: 'mtd', label: 'Month to date' }, { id: 'ytd', label: 'Year to date' },
]
