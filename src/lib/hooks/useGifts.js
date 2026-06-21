import { useState, useEffect, useCallback } from 'react'
import { getGifts, createGift, updateGift, deleteGift } from '../db/gifts'
import { supabase } from '../supabase'
export function useGifts(filters = {}) {
  const [gifts, setGifts]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setGifts(await getGifts(filters)) } catch(e) { setError(e.message) } finally { setLoading(false) }
  }, [JSON.stringify(filters)])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('gifts-rt').on('postgres_changes',{event:'*',schema:'public',table:'gifts'},(p)=>{
      if(p.eventType==='INSERT') setGifts(prev=>[p.new,...prev])
      else if(p.eventType==='UPDATE') setGifts(prev=>prev.map(g=>g.id===p.new.id?p.new:g))
      else if(p.eventType==='DELETE') setGifts(prev=>prev.filter(g=>g.id!==p.old.id))
    }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])
  const add    = async (g)    => { const d = await createGift(g); setGifts(p=>[d,...p]); return d }
  const update = async (id,c) => { const d = await updateGift(id,c); setGifts(p=>p.map(x=>x.id===id?d:x)); return d }
  const remove = async (id)   => { await deleteGift(id); setGifts(p=>p.filter(x=>x.id!==id)) }
  return { gifts, loading, error, reload: load, add, update, remove }
}
