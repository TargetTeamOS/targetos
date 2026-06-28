import { useState, useEffect, useCallback } from 'react'
import { getListings, createListing, updateListing, deleteListing } from '../db/listings'

export function useListings(filters = {}) {
  const [listings, setListings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getListings(filters)
      setListings(data)
    } catch(e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(filters)])

  useEffect(() => { load() }, [load])

  // Realtime — instant updates when listing changes

  const add    = async (l)     => { const d = await createListing(l); setListings(prev => [d, ...prev]); return d }
  const update = async (id,ch) => { const d = await updateListing(id,ch); setListings(prev => prev.map(x=>x.id===id?d:x)); return d }
  const remove = async (id)    => { await deleteListing(id); setListings(prev => prev.filter(x=>x.id!==id)) }

  return { listings, loading, error, reload: load, add, update, remove }
}
