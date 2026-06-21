import { useState, useEffect, useCallback } from 'react'
import { getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../db/calendar'
export function useCalendar({ agentId, startDate, endDate } = {}) {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents(await getCalendarEvents({ agentId, startDate, endDate })) } catch(e) {} finally { setLoading(false) }
  }, [agentId, startDate, endDate])
  useEffect(() => { load() }, [load])
  const add    = async (e)    => { const d = await createCalendarEvent(e); setEvents(p=>[...p,d]); return d }
  const update = async (id,c) => { const d = await updateCalendarEvent(id,c); setEvents(p=>p.map(x=>x.id===id?d:x)); return d }
  const remove = async (id)   => { await deleteCalendarEvent(id); setEvents(p=>p.filter(x=>x.id!==id)) }
  return { events, loading, reload: load, add, update, remove }
}
