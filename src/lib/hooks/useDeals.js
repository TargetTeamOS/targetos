import { useState, useEffect, useCallback } from 'react'
import { getDeals, createDeal, updateDeal, deleteDeal } from '../db/deals'
import { supabase } from '../supabase'

export function useDeals(filters = {}) {
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getDeals(filters)
      setDeals(data)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filters)])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('deals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setDeals(prev => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setDeals(prev => prev.map(d => d.id === payload.new.id ? payload.new : d))
        } else if (payload.eventType === 'DELETE') {
          setDeals(prev => prev.filter(d => d.id !== payload.old.id))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const add    = async (deal)    => { const d = await createDeal(deal); setDeals(prev => [d, ...prev]); return d }
  const update = async (id, ch)  => { const d = await updateDeal(id, ch); setDeals(prev => prev.map(x => x.id===id ? d : x)); return d }
  const remove = async (id)      => { await deleteDeal(id); setDeals(prev => prev.filter(x => x.id !== id)) }

  return { deals, loading, error, reload: load, add, update, remove }
}
