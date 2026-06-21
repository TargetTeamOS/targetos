import { useState, useEffect, useCallback } from 'react'
import { getCalls, createCall, deleteCall } from '../db/calls'
export function useCalls(filters = {}) {
  const [calls, setCalls]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setCalls(await getCalls(filters)) } catch(e) { setError(e.message) } finally { setLoading(false) }
  }, [JSON.stringify(filters)])
  useEffect(() => { load() }, [load])
  const add    = async (c)  => { const d = await createCall(c); setCalls(p=>[d,...p]); return d }
  const remove = async (id) => { await deleteCall(id); setCalls(p=>p.filter(x=>x.id!==id)) }
  return { calls, loading, error, reload: load, add, remove }
}
