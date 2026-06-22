/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — All React Hooks
   Every hook: loads data, subscribes to realtime, exposes CRUD.
   Pattern: { data, loading, error, reload, add, update, remove }
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import * as db from './db'

// ── UNIVERSAL HOOK FACTORY ────────────────────────────────────────
function makeHook(tableName, fetchFn, realtimeFilter = null) {
  return function useHook(filters = {}) {
    const [data,    setData]    = useState([])
    const [loading, setLoading] = useState(true)
    const [error,   setError]   = useState(null)
    const filterKey = JSON.stringify(filters)

    const load = useCallback(async () => {
      setLoading(true); setError(null)
      try {
        const result = await fetchFn(filters)
        setData(result || [])
      } catch(e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, [filterKey])

    useEffect(() => { load() }, [load])

    // Realtime subscription
    useEffect(() => {
      const channelName = `${tableName}-${filterKey}`
      const channel = supabase.channel(channelName)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: tableName,
          ...(realtimeFilter ? { filter: realtimeFilter(filters) } : {})
        }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setData(prev => [payload.new, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setData(prev => prev.map(r => r.id === payload.new.id ? payload.new : r))
          } else if (payload.eventType === 'DELETE') {
            setData(prev => prev.filter(r => r.id !== payload.old.id))
          }
        })
        .subscribe()

      return () => supabase.removeChannel(channel)
    }, [filterKey])

    const add = useCallback(async (item) => {
      const result = await db[tableName]?.create(item)
      if (result) setData(prev => [result, ...prev])
      return result
    }, [])

    const update = useCallback(async (id, changes) => {
      const result = await db[tableName]?.update(id, changes)
      if (result) setData(prev => prev.map(r => r.id === id ? result : r))
      return result
    }, [])

    const remove = useCallback(async (id) => {
      await db[tableName]?.delete(id)
      setData(prev => prev.filter(r => r.id !== id))
    }, [])

    return { data, loading, error, reload: load, add, update, remove }
  }
}

// ── AGENTS HOOK ───────────────────────────────────────────────────
export function useAgents() {
  const [agents,  setAgents]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.agents.list().then(setAgents).catch(console.error).finally(() => setLoading(false))
  }, [])

  const update = async (id, ch) => {
    const r = await db.agents.update(id, ch)
    setAgents(prev => prev.map(a => a.id === id ? r : a))
    return r
  }

  return { agents, loading, update }
}

// ── CONTACTS HOOK ─────────────────────────────────────────────────
export function useContacts(filters = {}) {
  const [contacts, setContacts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setContacts(await db.contacts.list(filters)) }
    catch(e) { setError(e.message) }
    finally  { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('contacts-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, p => {
        if (p.eventType === 'INSERT') setContacts(prev => [p.new, ...prev])
        else if (p.eventType === 'UPDATE') setContacts(prev => prev.map(c => c.id === p.new.id ? p.new : c))
        else if (p.eventType === 'DELETE') setContacts(prev => prev.filter(c => c.id !== p.old.id))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const add    = async (data)     => { const r = await db.contacts.create(data); setContacts(p => [r, ...p]); return r }
  const update = async (id, ch)   => { const r = await db.contacts.update(id, ch); setContacts(p => p.map(c => c.id === id ? r : c)); return r }
  const remove = async (id)       => { await db.contacts.delete(id); setContacts(p => p.filter(c => c.id !== id)) }

  return { contacts, loading, error, reload: load, add, update, remove }
}

// ── DEALS HOOK ────────────────────────────────────────────────────
export function useDeals(filters = {}) {
  const [deals,   setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setDeals(await db.deals.list(filters)) }
    catch(e) { setError(e.message) }
    finally  { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('deals-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, p => {
        if (p.eventType === 'INSERT') setDeals(prev => [p.new, ...prev])
        else if (p.eventType === 'UPDATE') setDeals(prev => prev.map(d => d.id === p.new.id ? p.new : d))
        else if (p.eventType === 'DELETE') setDeals(prev => prev.filter(d => d.id !== p.old.id))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const add    = async (data)   => { const r = await db.deals.create(data); setDeals(p => [r, ...p]); return r }
  const update = async (id, ch) => { const r = await db.deals.update(id, ch); setDeals(p => p.map(d => d.id === id ? r : d)); return r }
  const remove = async (id)     => { await db.deals.delete(id); setDeals(p => p.filter(d => d.id !== id)) }

  return { deals, loading, error, reload: load, add, update, remove }
}

// ── LISTINGS HOOK ─────────────────────────────────────────────────
export function useListings(filters = {}) {
  const [listings, setListings] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setListings(await db.listings.list(filters)) }
    catch(e) { setError(e.message) }
    finally  { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('listings-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, p => {
        if (p.eventType === 'INSERT') setListings(prev => [p.new, ...prev])
        else if (p.eventType === 'UPDATE') setListings(prev => prev.map(l => l.id === p.new.id ? p.new : l))
        else if (p.eventType === 'DELETE') setListings(prev => prev.filter(l => l.id !== p.old.id))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const add    = async (data)   => { const r = await db.listings.create(data); setListings(p => [r, ...p]); return r }
  const update = async (id, ch) => { const r = await db.listings.update(id, ch); setListings(p => p.map(l => l.id === id ? r : l)); return r }
  const remove = async (id)     => { await db.listings.delete(id); setListings(p => p.filter(l => l.id !== id)) }

  return { listings, loading, error, reload: load, add, update, remove }
}

// ── TASKS HOOK ────────────────────────────────────────────────────
export function useTasks(filters = {}) {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTasks(await db.tasks.list(filters)) }
    catch(e) { setError(e.message) }
    finally  { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tasks-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, p => {
        if (p.eventType === 'INSERT') setTasks(prev => [p.new, ...prev])
        else if (p.eventType === 'UPDATE') setTasks(prev => prev.map(t => t.id === p.new.id ? p.new : t))
        else if (p.eventType === 'DELETE') setTasks(prev => prev.filter(t => t.id !== p.old.id))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const add      = async (data)   => { const r = await db.tasks.create(data); setTasks(p => [r, ...p]); return r }
  const update   = async (id, ch) => { const r = await db.tasks.update(id, ch); setTasks(p => p.map(t => t.id === id ? r : t)); return r }
  const remove   = async (id)     => { await db.tasks.delete(id); setTasks(p => p.filter(t => t.id !== id)) }
  const complete = async (id)     => { const r = await db.tasks.complete(id); setTasks(p => p.map(t => t.id === id ? r : t)); return r }

  return { tasks, loading, error, reload: load, add, update, remove, complete }
}

// ── GIFTS HOOK ────────────────────────────────────────────────────
export function useGifts(filters = {}) {
  const [gifts,   setGifts]   = useState([])
  const [loading, setLoading] = useState(true)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true)
    try { setGifts(await db.gifts.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  const add    = async (data)   => { const r = await db.gifts.create(data); setGifts(p => [r, ...p]); return r }
  const update = async (id, ch) => { const r = await db.gifts.update(id, ch); setGifts(p => p.map(g => g.id === id ? r : g)); return r }
  const remove = async (id)     => { await db.gifts.delete(id); setGifts(p => p.filter(g => g.id !== id)) }

  return { gifts, loading, reload: load, add, update, remove }
}

// ── CALLS HOOK ────────────────────────────────────────────────────
export function useCalls(filters = {}) {
  const [calls,   setCalls]   = useState([])
  const [loading, setLoading] = useState(true)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCalls(await db.calls.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  const add    = async (data) => { const r = await db.calls.create(data); setCalls(p => [r, ...p]); return r }
  const remove = async (id)   => { await db.calls.delete(id); setCalls(p => p.filter(c => c.id !== id)) }

  return { calls, loading, reload: load, add, remove }
}

// ── ANNOUNCEMENTS HOOK ────────────────────────────────────────────
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState([])
  const [loading,       setLoading]       = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setAnnouncements(await db.announcements.list()) } catch(e) {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('ann-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  const add    = async (data)   => { const r = await db.announcements.create(data); setAnnouncements(p => [r, ...p]); return r }
  const update = async (id, ch) => { const r = await db.announcements.update(id, ch); setAnnouncements(p => p.map(a => a.id === id ? r : a)); return r }
  const remove = async (id)     => { await db.announcements.delete(id); setAnnouncements(p => p.filter(a => a.id !== id)) }

  return { announcements, loading, reload: load, add, update, remove }
}

// ── CALENDAR HOOK ─────────────────────────────────────────────────
export function useCalendar(filters = {}) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const filterKey = JSON.stringify(filters)

  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents(await db.calendar.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])

  useEffect(() => { load() }, [load])

  const add    = async (data)   => { const r = await db.calendar.create(data); setEvents(p => [...p, r]); return r }
  const update = async (id, ch) => { const r = await db.calendar.update(id, ch); setEvents(p => p.map(e => e.id === id ? r : e)); return r }
  const remove = async (id)     => { await db.calendar.delete(id); setEvents(p => p.filter(e => e.id !== id)) }

  return { events, loading, reload: load, add, update, remove }
}

// ── OFFERS HOOK ───────────────────────────────────────────────────
export function useOffers(filters = {}) {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const filterKey = JSON.stringify(filters)
  const load = useCallback(async () => {
    setLoading(true)
    try { setOffers(await db.offers.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])
  useEffect(() => { load() }, [load])
  const add    = async (data)   => { const r = await db.offers.create(data); setOffers(p=>[r,...p]); return r }
  const update = async (id, ch) => { const r = await db.offers.update(id,ch); setOffers(p=>p.map(o=>o.id===id?r:o)); return r }
  const remove = async (id)     => { await db.offers.delete(id); setOffers(p=>p.filter(o=>o.id!==id)) }
  return { offers, loading, reload:load, add, update, remove }
}

// ── TRANSACTIONS HOOK ─────────────────────────────────────────────
export function useTransactions(filters = {}) {
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const filterKey = JSON.stringify(filters)
  const load = useCallback(async () => {
    setLoading(true)
    try { setTransactions(await db.transactions.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])
  useEffect(() => { load() }, [load])
  const add    = async (data)   => { const r = await db.transactions.create(data); setTransactions(p=>[r,...p]); return r }
  const update = async (id, ch) => { const r = await db.transactions.update(id,ch); setTransactions(p=>p.map(t=>t.id===id?r:t)); return r }
  const remove = async (id)     => { await db.transactions.delete(id); setTransactions(p=>p.filter(t=>t.id!==id)) }
  return { transactions, loading, reload:load, add, update, remove }
}

// ── OPEN HOUSES HOOK ──────────────────────────────────────────────
export function useOpenHouses(filters = {}) {
  const [openHouses, setOpenHouses] = useState([])
  const [loading,    setLoading]    = useState(true)
  const filterKey = JSON.stringify(filters)
  const load = useCallback(async () => {
    setLoading(true)
    try { setOpenHouses(await db.openHouses.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])
  useEffect(() => { load() }, [load])
  const add    = async (data) => { const r = await db.openHouses.create(data); setOpenHouses(p=>[r,...p]); return r }
  const remove = async (id)   => { await db.openHouses.delete(id); setOpenHouses(p=>p.filter(o=>o.id!==id)) }
  return { openHouses, loading, reload:load, add, remove }
}

// ── SIGNS HOOK ────────────────────────────────────────────────────
export function useSigns(filters = {}) {
  const [signs,   setSigns]   = useState([])
  const [loading, setLoading] = useState(true)
  const filterKey = JSON.stringify(filters)
  const load = useCallback(async () => {
    setLoading(true)
    try { setSigns(await db.signs.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])
  useEffect(() => { load() }, [load])
  const add    = async (data)   => { const r = await db.signs.create(data); setSigns(p=>[r,...p]); return r }
  const update = async (id, ch) => { const r = await db.signs.update(id,ch); setSigns(p=>p.map(s=>s.id===id?r:s)); return r }
  const remove = async (id)     => { await db.signs.delete(id); setSigns(p=>p.filter(s=>s.id!==id)) }
  return { signs, loading, reload:load, add, update, remove }
}

// ── LISTING PREP HOOK ─────────────────────────────────────────────
export function useListingPrep(filters = {}) {
  const [preps,   setPreps]   = useState([])
  const [loading, setLoading] = useState(true)
  const filterKey = JSON.stringify(filters)
  const load = useCallback(async () => {
    setLoading(true)
    try { setPreps(await db.listingPrep.list(filters)) } catch(e) {} finally { setLoading(false) }
  }, [filterKey])
  useEffect(() => { load() }, [load])
  const add    = async (data)   => { const r = await db.listingPrep.create(data); setPreps(p=>[r,...p]); return r }
  const update = async (id, ch) => { const r = await db.listingPrep.update(id,ch); setPreps(p=>p.map(lp=>lp.id===id?r:lp)); return r }
  const remove = async (id)     => { await db.listingPrep.delete(id); setPreps(p=>p.filter(lp=>lp.id!==id)) }
  return { preps, loading, reload:load, add, update, remove }
}

// ── EMAIL TEMPLATES HOOK ──────────────────────────────────────────
export function useEmailTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setTemplates(await db.emailTemplates.list()) } catch(e) {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const add    = async (data)   => { const r = await db.emailTemplates.create(data); setTemplates(p=>[r,...p]); return r }
  const update = async (id, ch) => { const r = await db.emailTemplates.update(id,ch); setTemplates(p=>p.map(t=>t.id===id?r:t)); return r }
  const remove = async (id)     => { await db.emailTemplates.delete(id); setTemplates(p=>p.filter(t=>t.id!==id)) }
  return { templates, loading, reload:load, add, update, remove }
}

// ── AUTOMATIONS HOOK ──────────────────────────────────────────────
export function useAutomations() {
  const [automations, setAutomations] = useState([])
  const [loading,     setLoading]     = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setAutomations(await db.automations.list()) } catch(e) {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const add    = async (data)   => { const r = await db.automations.create(data); setAutomations(p=>[r,...p]); return r }
  const update = async (id, ch) => { const r = await db.automations.update(id,ch); setAutomations(p=>p.map(a=>a.id===id?r:a)); return r }
  const remove = async (id)     => { await db.automations.delete(id); setAutomations(p=>p.filter(a=>a.id!==id)) }
  return { automations, loading, reload:load, add, update, remove }
}
