// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — React Hooks
// All data-fetching hooks with Supabase Realtime subscriptions.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { db } from './db'

// ── GENERIC BASE HOOK ────────────────────────────────────────────
// One stable channel per table per hook instance.
// Uses a ref-based instance ID so the channel name is fixed for the
// lifetime of the component — no duplicate subscriptions on re-render.
let _hookInstanceCounter = 0

function useTable(tableName, fetcher) {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Stable refs
  const mounted     = useRef(false)
  const channelRef  = useRef(null)
  const instanceId  = useRef(++_hookInstanceCounter)

  const fetch = useCallback(async () => {
    if (!mounted.current) return
    try {
      setLoading(true)
      setError(null)
      const rows = await fetcher()
      if (mounted.current) setData(rows || [])
    } catch(e) {
      if (mounted.current) setError(e)
    } finally {
      if (mounted.current) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName])

  useEffect(() => {
    mounted.current = true
    fetch()

    // Stable channel name — never changes for this hook instance
    const chName = 'rt_' + tableName + '_' + instanceId.current

    // Tear down any existing channel first (handles React Strict Mode double-fire)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const ch = supabase.channel(chName)
    ch.on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
      if (mounted.current) fetch()
    }).subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('Realtime channel error for', tableName)
      }
    })
    channelRef.current = ch

    return () => {
      mounted.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [tableName, fetch])

  return { data, loading, error, refetch: fetch }
}

// ── AGENTS ───────────────────────────────────────────────────────
export function useAgents() {
  const base = useTable('agents', () => db.agents.list())
  return {
    ...base,
    agents: base.data,
    update: (id, data) => db.agents.update(id, data),
  }
}

// ── CONTACTS ─────────────────────────────────────────────────────
export function useContacts(filters = {}) {
  const base = useTable('contacts', () => db.contacts.list(filters))
  return {
    ...base,
    contacts: base.data,
    add:    (data) => db.contacts.create(data),
    update: (id, data) => db.contacts.update(id, data),
    remove: (id) => db.contacts.delete(id),
  }
}

// ── DEALS ────────────────────────────────────────────────────────
export function useDeals(filters = {}) {
  const base = useTable('deals', () => db.deals.list(filters))
  return {
    ...base,
    deals: base.data,
    add:    (data) => db.deals.create(data),
    update: (id, data) => db.deals.update(id, data),
    remove: (id) => db.deals.delete(id),
  }
}

// ── LISTINGS ─────────────────────────────────────────────────────
export function useListings(filters = {}) {
  const base = useTable('listings', () => db.listings.list(filters))
  return {
    ...base,
    listings: base.data,
    add:    (data) => db.listings.create(data),
    update: (id, data) => db.listings.update(id, data),
    remove: (id) => db.listings.delete(id),
  }
}

// ── GIFTS ────────────────────────────────────────────────────────
export function useGifts(filters = {}) {
  const base = useTable('gifts', () => db.gifts.list(filters))
  return {
    ...base,
    gifts: base.data,
    add:    (data) => db.gifts.create(data),
    update: (id, data, actingAgentId) => db.gifts.update(id, data, actingAgentId),
    remove: (id) => db.gifts.delete(id),
  }
}

// ── OFFERS ───────────────────────────────────────────────────────
export function useOffers(filters = {}) {
  const base = useTable('offers', () => db.offers.list(filters))
  return {
    ...base,
    offers: base.data,
    add:    (data) => db.offers.create(data),
    update: (id, data, actingAgentId) => db.offers.update(id, data, actingAgentId),
    remove: (id) => db.offers.delete(id),
  }
}

// ── TRANSACTIONS ─────────────────────────────────────────────────
export function useTransactions(filters = {}) {
  const base = useTable('transactions', () => db.transactions.list(filters))
  return {
    ...base,
    transactions: base.data,
    add:    (data) => db.transactions.create(data),
    update: (id, data) => db.transactions.update(id, data),
    remove: (id) => db.transactions.delete(id),
  }
}

// ── TASKS ────────────────────────────────────────────────────────
export function useTasks(filters = {}) {
  const base = useTable('tasks', () => db.tasks.list(filters))
  return {
    ...base,
    tasks: base.data,
    add:      (data) => db.tasks.create(data),
    update:   (id, data, actingAgentId) => db.tasks.update(id, data, actingAgentId),
    complete: (id, agentId) => db.tasks.complete(id, agentId),
    remove:   (id) => db.tasks.delete(id),
  }
}

// ── CALLS ────────────────────────────────────────────────────────
export function useCalls(filters = {}) {
  const base = useTable('calls', () => db.calls.list(filters))
  return {
    ...base,
    calls: base.data,
    add:    (data) => db.calls.create(data),
    update: (id, data) => db.calls.update(id, data),
    remove: (id) => db.calls.delete(id),
  }
}

// ── CALENDAR ─────────────────────────────────────────────────────
export function useCalendar(filters = {}) {
  const base = useTable('calendar_events', () => db.calendar.list(filters))
  return {
    ...base,
    events: base.data,
    add:    (data) => db.calendar.create(data),
    update: (id, data) => db.calendar.update(id, data),
    remove: (id) => db.calendar.delete(id),
  }
}

// ── OPEN HOUSES ──────────────────────────────────────────────────
export function useOpenHouses(filters = {}) {
  const base = useTable('open_houses', () => db.openHouses.list(filters))
  return {
    ...base,
    openHouses: base.data,
    add:    (data) => db.openHouses.create(data),
    update: (id, data, actingAgentId) => db.openHouses.update(id, data, actingAgentId),
    remove: (id) => db.openHouses.delete(id),
  }
}

// ── ANNOUNCEMENTS ────────────────────────────────────────────────
export function useAnnouncements() {
  const base = useTable('announcements', () => db.announcements.list())
  return {
    ...base,
    announcements: base.data,
    add:    (data) => db.announcements.create(data),
    update: (id, data) => db.announcements.update(id, data),
    remove: (id) => db.announcements.delete(id),
  }
}

// ── SIGNS ────────────────────────────────────────────────────────
export function useSigns(filters = {}) {
  const base = useTable('signs', () => db.signs.list(filters))
  return {
    ...base,
    signs: base.data,
    add:    (data) => db.signs.create(data),
    update: (id, data, actingAgentId) => db.signs.update(id, data, actingAgentId),
    remove: (id) => db.signs.delete(id),
  }
}

// ── LISTING PREP ─────────────────────────────────────────────────
export function useListingPrep(filters = {}) {
  const base = useTable('listing_prep', () => db.listingPrep.list(filters))
  return {
    ...base,
    preps: base.data,
    add:    (data) => db.listingPrep.create(data),
    update: (id, data, actingAgentId) => db.listingPrep.update(id, data, actingAgentId),
    remove: (id) => db.listingPrep.delete(id),
  }
}

// ── EMAIL TEMPLATES ──────────────────────────────────────────────
export function useEmailTemplates() {
  const base = useTable('email_templates', () => db.emailTemplates.list())
  return {
    ...base,
    templates: base.data,
    add:    (data) => db.emailTemplates.create(data),
    update: (id, data) => db.emailTemplates.update(id, data),
    remove: (id) => db.emailTemplates.delete(id),
  }
}

// ── AUTOMATIONS ──────────────────────────────────────────────────
export function useAutomations() {
  const base = useTable('automations', () => db.automations.list())
  return {
    ...base,
    automations: base.data,
    add:    (data) => db.automations.create(data),
    update: (id, data) => db.automations.update(id, data),
    remove: (id) => db.automations.delete(id),
  }
}

// ── AUDIT LOG ────────────────────────────────────────────────────
export function useAuditLog(filters = {}) {
  const base = useTable('audit_log', () => db.auditLog.list(filters))
  return {
    ...base,
    logs: base.data,
  }
}
