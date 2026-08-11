// dashboardSettings — client for the Command Center settings store (A8, pending)
// and the applied goal upsert (A3). Presentation settings degrade gracefully:
// when A8 isn't deployed, `save` keeps values in session state and reports
// deployed:false so the UI can say so. Goals + news use already-applied RPCs.

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

const NOT_DEPLOYED = /function|does not exist|schema cache|42883|not find/i

export async function fetchSettings() {
  const { data, error } = await supabase.rpc('app_dashboard_settings_get')
  if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false, settings: {} }; throw error }
  return { deployed: true, settings: data && typeof data === 'object' ? data : {} }
}

export async function saveSetting(key, value) {
  const { data, error } = await supabase.rpc('app_dashboard_settings_set', { p_key: key, p_value: value })
  if (error) { if (NOT_DEPLOYED.test(error.message || '')) return { deployed: false }; throw error }
  if (data && data.error) return { deployed: true, ok: false, error: data.error }
  return { deployed: true, ok: true }
}

// Applied (A3). Returns {ok} | {error}. Admin-only server-side.
export async function saveGoal(goal) {
  const { data, error } = await supabase.rpc('app_goal_upsert', { p: goal })
  if (error) {
    if (NOT_DEPLOYED.test(error.message || '')) return { ok: false, error: 'Goals aren’t connected yet — apply COMMAND_CENTER_REPAIR_FOUNDATION.sql in Supabase, then try again.' }
    return { ok: false, error: error.message }
  }
  if (data && data.error) return { ok: false, error: data.error === 'forbidden' ? 'Admins only — you don’t have permission to set goals.' : data.error }
  return { ok: true }
}

export function useDashboardSettings() {
  const [settings, setSettings] = useState({})
  const [deployed, setDeployed] = useState(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(false)

  const reload = useCallback(async () => {
    if (mounted.current) setLoading(true)
    try {
      const r = await fetchSettings()
      if (mounted.current) { setSettings(r.settings || {}); setDeployed(r.deployed) }
    } catch {
      if (mounted.current) setDeployed(true)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    reload()
    return () => { mounted.current = false }
  }, [reload])

  // optimistic session update; persists to the store when deployed
  const save = useCallback(async (key, value) => {
    if (mounted.current) setSettings((s) => ({ ...s, [key]: value }))
    const r = await saveSetting(key, value)
    if (mounted.current && r.deployed === false) setDeployed(false)
    return r
  }, [])

  return { settings, deployed, loading, save, reload }
}
