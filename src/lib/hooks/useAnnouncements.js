import { useState, useEffect, useCallback } from 'react'
import { getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../db/announcements'
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setAnnouncements(await getAnnouncements()) } catch(e) {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
    return () => supabase.removeChannel(ch)
  }, [load])
  const add    = async (a)    => { const d = await createAnnouncement(a); setAnnouncements(p=>[d,...p]); return d }
  const update = async (id,c) => { const d = await updateAnnouncement(id,c); setAnnouncements(p=>p.map(x=>x.id===id?d:x)); return d }
  const remove = async (id)   => { await deleteAnnouncement(id); setAnnouncements(p=>p.filter(x=>x.id!==id)) }
  return { announcements, loading, reload: load, add, update, remove }
}
