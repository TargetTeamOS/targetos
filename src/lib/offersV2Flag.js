import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const OFFERS_V2_FLAG_KEY = 'offers_v2_beta'

export function offersV2Allowed(agent, row) {
  if (!row || row.enabled !== true) return false

  const allowedIds = Array.isArray(row.allowed_agent_ids)
    ? row.allowed_agent_ids
    : []

  if (allowedIds.length > 0) {
    return Boolean(agent?.id && allowedIds.includes(agent.id))
  }

  return true
}

export function useOffersV2Beta(agent) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true

    async function checkFlag() {
      if (!agent?.id) {
        if (active) setEnabled(false)
        return
      }

      const { data, error } = await supabase
        .from('feature_flags')
        .select('enabled, allowed_agent_ids')
        .eq('key', OFFERS_V2_FLAG_KEY)
        .maybeSingle()

      if (!active) return

      if (error) {
        console.error('Unable to load Offers V2 flag:', error)
        setEnabled(false)
        return
      }

      setEnabled(offersV2Allowed(agent, data))
    }

    checkFlag()

    return () => {
      active = false
    }
  }, [agent?.id])

  return enabled
}
