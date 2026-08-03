// useDashboardData — the shared React layer over dashboardData.js core.
// A single provider holds ONE request coordinator + cache + the authenticated
// identity, date range and scope, so every widget on the page pulls from the
// same foundation instead of firing its own duplicate requests. Widgets call
// useMetric(key, fetcher) and get de-duplication, stale-response protection,
// request cancellation, caching and consistent metadata for free.
//
// Identity is always taken from the authenticated session (useAuth) — never
// from anything the browser could forge. Fetchers should call security-definer
// RPCs (e.g. app_dashboard_summary) that re-check permissions server-side.

import { createContext, useContext, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { createRequestCoordinator, createCache, makeCacheKey, rangeFor } from './dashboardData'

const DashboardDataContext = createContext(null)

export function DashboardDataProvider({ children, defaultPreset = 'ytd' }) {
  const { user, agent } = useAuth()

  // Identity/role derived only from the authenticated session.
  const ctx = useMemo(() => ({
    authUserId: user?.id ?? null,
    agentId: agent?.id ?? null,
    role: agent?.role ?? null,
    isAdmin: agent?.role === 'admin',
  }), [user?.id, agent?.id, agent?.role])

  const [preset, setPreset] = useState(defaultPreset)
  const [scope, setScope] = useState(() => ({
    mode: agent?.role === 'admin' ? 'team' : 'agent',
    agentId: agent?.id ?? null,
  }))

  const coordinator = useRef(null)
  if (!coordinator.current) coordinator.current = createRequestCoordinator()
  const cache = useRef(null)
  if (!cache.current) cache.current = createCache()

  // Selective refresh: bump a per-key token (or all keys) to re-run metrics.
  const [tokens, setTokens] = useState({})
  const refresh = useCallback((metricKey) => {
    setTokens((t) => metricKey
      ? { ...t, [metricKey]: (t[metricKey] || 0) + 1 }
      : { ...t, __all__: (t.__all__ || 0) + 1 })
  }, [])

  const dateRange = useMemo(() => rangeFor(preset), [preset])

  const value = useMemo(() => ({
    ctx, dateRange, preset, setPreset, scope, setScope,
    coordinator: coordinator.current, cache: cache.current,
    refresh, tokenFor: (key) => (tokens[key] || 0) + (tokens.__all__ || 0),
  }), [ctx, dateRange, preset, scope, refresh, tokens])

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
}

export function useDashboardData() {
  const v = useContext(DashboardDataContext)
  if (!v) throw new Error('useDashboardData must be used within <DashboardDataProvider>')
  return v
}

// Widget-facing hook. `fetcher({ ctx, dateRange, scope, signal })` should return
// a MetricResult: { value, sourceType, records?|fetchRecords?, filters?, route? }.
// Returns { loading, error, data, meta, refresh }.
export function useMetric(key, fetcher, { params = {}, ttlMs } = {}) {
  const { ctx, dateRange, scope, coordinator, cache, refresh, tokenFor } = useDashboardData()
  const token = tokenFor(key)

  const cacheKey = useMemo(() => makeCacheKey(key, {
    ...params, from: dateRange.from, to: dateRange.to,
    scope: scope.mode, agentId: scope.agentId, token,
  }), [key, JSON.stringify(params), dateRange.from, dateRange.to, scope.mode, scope.agentId, token])

  const [state, setState] = useState({ loading: true, error: null, data: null, meta: null })

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const seq = coordinator.issue(cacheKey)

    const cached = ttlMs != null ? cache.get(cacheKey, ttlMs) : undefined
    if (cached) {
      setState({ loading: false, error: null, data: cached.value,
        meta: { lastUpdated: cached.at, dateRange, source: key, cached: true } })
      return () => { active = false; controller.abort() }
    }

    setState((s) => ({ ...s, loading: true, error: null }))
    coordinator.run(cacheKey, () => fetcher({ ctx, dateRange, scope, signal: controller.signal }))
      .then((result) => {
        if (!active || !coordinator.isFresh(cacheKey, seq)) return // stale — drop it
        const at = cache.set(cacheKey, result)
        setState({ loading: false, error: null, data: result,
          meta: { lastUpdated: at, dateRange, source: key, filters: result?.filters ?? params } })
      })
      .catch((err) => {
        if (!active || controller.signal.aborted || !coordinator.isFresh(cacheKey, seq)) return
        setState({ loading: false, error: err, data: null, meta: { dateRange, source: key } })
      })

    return () => { active = false; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  return { ...state, refresh: useCallback(() => refresh(key), [refresh, key]) }
}
