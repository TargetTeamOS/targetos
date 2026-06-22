/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — Complete Database Layer
   All Supabase calls in one file.
   Every function throws on error — pages handle their own errors.
   ═══════════════════════════════════════════════════════════════ */
import { supabase } from './supabase'

// ── HELPERS ──────────────────────────────────────────────────────
const q  = (table) => supabase.from(table)
const ts = ()      => new Date().toISOString()

async function run(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

// ── AGENTS ───────────────────────────────────────────────────────
export const agents = {
  list:   ()       => run(q('agents').select('*').eq('active', true).order('name')),
  get:    (id)     => run(q('agents').select('*').eq('id', id).single()),
  update: (id, ch) => run(q('agents').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
}

// ── CONTACTS ─────────────────────────────────────────────────────
export const contacts = {
  list: ({ agentId, status, search, limit = 200 } = {}) => {
    let q2 = q('contacts').select('*, agents(name,color)').order('last_activity', { ascending: false }).limit(limit)
    if (agentId) q2 = q2.eq('agent_id', agentId)
    if (status)  q2 = q2.eq('status', status)
    if (search)  q2 = q2.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
    return run(q2)
  },
  get:    (id)     => run(q('contacts').select('*, agents(name,color)').eq('id', id).single()),
  create: (data)   => run(q('contacts').insert([{ ...data, last_activity: ts(), created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('contacts').update({ ...ch, updated_at: ts(), last_activity: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('contacts').delete().eq('id', id)),
}

// ── DEALS (PRODUCTION) ───────────────────────────────────────────
export const deals = {
  list: ({ agentId, stage, year, limit = 500 } = {}) => {
    let q2 = q('deals').select('*, agents(name,color,email)').order('ao_date', { ascending: false }).limit(limit)
    if (agentId) q2 = q2.eq('agent_id', agentId)
    if (stage)   q2 = q2.eq('stage', stage)
    if (year) {
      q2 = q2.or(`ao_date.gte.${year}-01-01,close_date.gte.${year}-01-01`)
      q2 = q2.or(`ao_date.lte.${year}-12-31,close_date.lte.${year}-12-31`)
    }
    return run(q2)
  },
  get:    (id)     => run(q('deals').select('*, agents(name,color)').eq('id', id).single()),
  create: (data)   => run(q('deals').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('deals').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('deals').delete().eq('id', id)),
}

// ── LISTINGS ─────────────────────────────────────────────────────
export const listings = {
  list: ({ agentId, status, limit = 200 } = {}) => {
    let q2 = q('listings').select('*, agents(name,color)').order('created_at', { ascending: false }).limit(limit)
    if (agentId) q2 = q2.eq('agent_id', agentId)
    if (status)  q2 = q2.eq('status', status)
    return run(q2)
  },
  get:    (id)     => run(q('listings').select('*, agents(name,color)').eq('id', id).single()),
  create: (data)   => run(q('listings').insert([{ ...data, created_at: ts(), updated_at: ts(), spend: [], showings: [], interests: [] }]).select().single()),
  update: (id, ch) => run(q('listings').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('listings').delete().eq('id', id)),
}

// ── GIFTS ────────────────────────────────────────────────────────
export const gifts = {
  list: ({ agentId, status, type, limit = 300 } = {}) => {
    let q2 = q('gifts').select('*, agents(name,color)').order('created_at', { ascending: false }).limit(limit)
    if (agentId) q2 = q2.eq('agent_id', agentId)
    if (status)  q2 = q2.eq('status', status)
    if (type)    q2 = q2.eq('type', type)
    return run(q2)
  },
  get:    (id)     => run(q('gifts').select('*').eq('id', id).single()),
  create: (data)   => run(q('gifts').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('gifts').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('gifts').delete().eq('id', id)),
}

// ── OFFERS ───────────────────────────────────────────────────────
export const offers = {
  list: ({ agentId, status } = {}) => {
    let q2 = q('offers').select('*, agents(name,color)').order('created_at', { ascending: false })
    if (agentId) q2 = q2.eq('agent_id', agentId)
    if (status)  q2 = q2.eq('status', status)
    return run(q2)
  },
  get:    (id)     => run(q('offers').select('*').eq('id', id).single()),
  create: (data)   => run(q('offers').insert([{ ...data, created_at: ts() }]).select().single()),
  update: (id, ch) => run(q('offers').update(ch).eq('id', id).select().single()),
  delete: (id)     => run(q('offers').delete().eq('id', id)),
}

// ── TRANSACTIONS ─────────────────────────────────────────────────
export const transactions = {
  list: ({ agentId, status } = {}) => {
    let q2 = q('transactions').select('*, agents(name,color)').order('created_at', { ascending: false })
    if (agentId) q2 = q2.eq('agent_id', agentId)
    if (status)  q2 = q2.eq('status', status)
    return run(q2)
  },
  get:    (id)     => run(q('transactions').select('*').eq('id', id).single()),
  create: (data)   => run(q('transactions').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('transactions').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('transactions').delete().eq('id', id)),
}

// ── TASKS ────────────────────────────────────────────────────────
export const tasks = {
  list: ({ agentId, status, priority, dueDate, limit = 300 } = {}) => {
    let q2 = q('tasks').select('*, agents!tasks_agent_id_fkey(name,color)').order('created_at', { ascending: false }).limit(limit)
    if (agentId)  q2 = q2.eq('agent_id', agentId)
    if (status)   q2 = q2.eq('status', status)
    if (priority) q2 = q2.eq('priority', priority)
    if (dueDate)  q2 = q2.eq('due_date', dueDate)
    return run(q2)
  },
  get:    (id)     => run(q('tasks').select('*').eq('id', id).single()),
  create: (data)   => run(q('tasks').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('tasks').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('tasks').delete().eq('id', id)),
  complete:(id)    => run(q('tasks').update({ status: 'done', completed_at: ts(), updated_at: ts() }).eq('id', id).select().single()),
}

// ── CALLS ────────────────────────────────────────────────────────
export const calls = {
  list: ({ agentId, contactId, limit = 200 } = {}) => {
    let q2 = q('calls').select('*, agents(name,color)').order('called_at', { ascending: false }).limit(limit)
    if (agentId)   q2 = q2.eq('agent_id', agentId)
    if (contactId) q2 = q2.eq('contact_id', contactId)
    return run(q2)
  },
  get:    (id)   => run(q('calls').select('*').eq('id', id).single()),
  create: (data) => run(q('calls').insert([{ ...data, called_at: ts() }]).select().single()),
  delete: (id)   => run(q('calls').delete().eq('id', id)),
}

// ── CALENDAR EVENTS ───────────────────────────────────────────────
export const calendar = {
  list: ({ agentId, startDate, endDate, limit = 200 } = {}) => {
    let q2 = q('calendar_events').select('*, agents(name,color)').order('start_date').order('start_time').limit(limit)
    if (agentId)   q2 = q2.eq('agent_id', agentId)
    if (startDate) q2 = q2.gte('start_date', startDate)
    if (endDate)   q2 = q2.lte('start_date', endDate)
    return run(q2)
  },
  get:    (id)     => run(q('calendar_events').select('*').eq('id', id).single()),
  create: (data)   => run(q('calendar_events').insert([{ ...data, created_at: ts() }]).select().single()),
  update: (id, ch) => run(q('calendar_events').update(ch).eq('id', id).select().single()),
  delete: (id)     => run(q('calendar_events').delete().eq('id', id)),
}

// ── OPEN HOUSES ───────────────────────────────────────────────────
export const openHouses = {
  list: ({ agentId } = {}) => {
    let q2 = q('open_houses').select('*, agents(name,color)').order('date', { ascending: false })
    if (agentId) q2 = q2.eq('agent_id', agentId)
    return run(q2)
  },
  get:    (id)   => run(q('open_houses').select('*').eq('id', id).single()),
  create: (data) => run(q('open_houses').insert([{ ...data, created_at: ts() }]).select().single()),
  delete: (id)   => run(q('open_houses').delete().eq('id', id)),
}

export const visitors = {
  list:   (ohId)   => run(q('oh_visitors').select('*').eq('open_house_id', ohId).order('visited_at', { ascending: false })),
  create: (data)   => run(q('oh_visitors').insert([{ ...data, visited_at: ts() }]).select().single()),
  update: (id, ch) => run(q('oh_visitors').update(ch).eq('id', id).select().single()),
  delete: (id)     => run(q('oh_visitors').delete().eq('id', id)),
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────
export const announcements = {
  list: () => run(q('announcements').select('*, agents(name,color)').order('pinned', { ascending: false }).order('created_at', { ascending: false })),
  get:    (id)     => run(q('announcements').select('*').eq('id', id).single()),
  create: (data)   => run(q('announcements').insert([{ ...data, created_at: ts() }]).select().single()),
  update: (id, ch) => run(q('announcements').update(ch).eq('id', id).select().single()),
  delete: (id)     => run(q('announcements').delete().eq('id', id)),
}

// ── SIGNS ─────────────────────────────────────────────────────────
export const signs = {
  list: ({ agentId } = {}) => {
    let q2 = q('signs').select('*, agents(name,color)').order('created_at', { ascending: false })
    if (agentId) q2 = q2.eq('agent_id', agentId)
    return run(q2)
  },
  get:    (id)     => run(q('signs').select('*').eq('id', id).single()),
  create: (data)   => run(q('signs').insert([{ ...data, created_at: ts() }]).select().single()),
  update: (id, ch) => run(q('signs').update(ch).eq('id', id).select().single()),
  delete: (id)     => run(q('signs').delete().eq('id', id)),
}

// ── LISTING PREP ──────────────────────────────────────────────────
export const listingPrep = {
  list: ({ agentId } = {}) => {
    let q2 = q('listing_prep').select('*, agents(name,color)').order('created_at', { ascending: false })
    if (agentId) q2 = q2.eq('agent_id', agentId)
    return run(q2)
  },
  get:    (id)     => run(q('listing_prep').select('*').eq('id', id).single()),
  create: (data)   => run(q('listing_prep').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('listing_prep').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('listing_prep').delete().eq('id', id)),
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────
export const emailTemplates = {
  list: () => run(q('email_templates').select('*, agents(name)').order('created_at', { ascending: false })),
  get:    (id)     => run(q('email_templates').select('*').eq('id', id).single()),
  create: (data)   => run(q('email_templates').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('email_templates').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('email_templates').delete().eq('id', id)),
}

// ── AUTOMATIONS ───────────────────────────────────────────────────
export const automations = {
  list: () => run(q('automations').select('*').order('created_at', { ascending: false })),
  get:    (id)     => run(q('automations').select('*').eq('id', id).single()),
  create: (data)   => run(q('automations').insert([{ ...data, created_at: ts(), updated_at: ts() }]).select().single()),
  update: (id, ch) => run(q('automations').update({ ...ch, updated_at: ts() }).eq('id', id).select().single()),
  delete: (id)     => run(q('automations').delete().eq('id', id)),
}

// ── BRIEFING PREFS ────────────────────────────────────────────────
export const briefingPrefs = {
  get:    (agentId) => run(q('briefing_prefs').select('*').eq('agent_id', agentId).single()),
  upsert: (data)    => run(q('briefing_prefs').upsert(data, { onConflict: 'agent_id' }).select().single()),
}

// ── AUDIT LOG ─────────────────────────────────────────────────────
export const auditLog = {
  list: ({ agentId, tableName, limit = 100 } = {}) => {
    let q2 = q('audit_log').select('*, agents(name,color)').order('created_at', { ascending: false }).limit(limit)
    if (agentId)   q2 = q2.eq('agent_id', agentId)
    if (tableName) q2 = q2.eq('table_name', tableName)
    return run(q2)
  },
  create: (data) => run(q('audit_log').insert([{ ...data, created_at: ts() }]).select().single()),
}

// ── NAMED EXPORTS (backward compatibility) ────────────────────────
export const getAgents      = () => agents.list()
export const updateAgent    = (id,ch) => agents.update(id,ch)

export const getContacts    = (f) => contacts.list(f)
export const createContact  = (d) => contacts.create(d)
export const updateContact  = (id,ch) => contacts.update(id,ch)
export const deleteContact  = (id) => contacts.delete(id)

export const getDeals       = (f) => deals.list(f)
export const createDeal     = (d) => deals.create(d)
export const updateDeal     = (id,ch) => deals.update(id,ch)
export const deleteDeal     = (id) => deals.delete(id)

export const getListings    = (f) => listings.list(f)
export const createListing  = (d) => listings.create(d)
export const updateListing  = (id,ch) => listings.update(id,ch)
export const deleteListing  = (id) => listings.delete(id)

export const getGifts       = (f) => gifts.list(f)
export const createGift     = (d) => gifts.create(d)
export const updateGift     = (id,ch) => gifts.update(id,ch)
export const deleteGift     = (id) => gifts.delete(id)

export const getOffers      = (f) => offers.list(f)
export const createOffer    = (d) => offers.create(d)
export const updateOffer    = (id,ch) => offers.update(id,ch)
export const deleteOffer    = (id) => offers.delete(id)

export const getTransactions   = (f) => transactions.list(f)
export const createTransaction = (d) => transactions.create(d)
export const updateTransaction = (id,ch) => transactions.update(id,ch)
export const deleteTransaction = (id) => transactions.delete(id)

export const getTasks       = (f) => tasks.list(f)
export const createTask     = (d) => tasks.create(d)
export const updateTask     = (id,ch) => tasks.update(id,ch)
export const deleteTask     = (id) => tasks.delete(id)
export const completeTask   = (id) => tasks.complete(id)

export const getCalls       = (f) => calls.list(f)
export const createCall     = (d) => calls.create(d)
export const deleteCall     = (id) => calls.delete(id)

export const getCalendarEvents    = (f) => calendar.list(f)
export const createCalendarEvent  = (d) => calendar.create(d)
export const updateCalendarEvent  = (id,ch) => calendar.update(id,ch)
export const deleteCalendarEvent  = (id) => calendar.delete(id)

export const getOpenHouses    = (f) => openHouses.list(f)
export const createOpenHouse  = (d) => openHouses.create(d)
export const deleteOpenHouse  = (id) => openHouses.delete(id)

export const getVisitors      = (id) => visitors.list(id)
export const createVisitor    = (d) => visitors.create(d)
export const updateVisitor    = (id,ch) => visitors.update(id,ch)
export const deleteVisitor    = (id) => visitors.delete(id)

export const getAnnouncements    = () => announcements.list()
export const createAnnouncement  = (d) => announcements.create(d)
export const updateAnnouncement  = (id,ch) => announcements.update(id,ch)
export const deleteAnnouncement  = (id) => announcements.delete(id)

export const getSigns       = (f) => signs.list(f)
export const createSign     = (d) => signs.create(d)
export const updateSign     = (id,ch) => signs.update(id,ch)
export const deleteSign     = (id) => signs.delete(id)

export const getListingPreps    = (f) => listingPrep.list(f)
export const createListingPrep  = (d) => listingPrep.create(d)
export const updateListingPrep  = (id,ch) => listingPrep.update(id,ch)
export const deleteListingPrep  = (id) => listingPrep.delete(id)

export const getEmailTemplates    = () => emailTemplates.list()
export const createEmailTemplate  = (d) => emailTemplates.create(d)
export const updateEmailTemplate  = (id,ch) => emailTemplates.update(id,ch)
export const deleteEmailTemplate  = (id) => emailTemplates.delete(id)

export const getAutomations    = () => automations.list()
export const upsertAutomation  = (d) => automations.create(d)
export const updateAutomation  = (id,ch) => automations.update(id,ch)
export const deleteAutomation  = (id) => automations.delete(id)

export const getBriefingPrefs  = (aid) => briefingPrefs.get(aid)
export const upsertBriefingPrefs=(d)  => briefingPrefs.upsert(d)

export const getAuditLog    = (f) => auditLog.list(f)

// ── NOTES (alias for tasks with priority=note) ────────────────────
export const getNotes   = (f={}) => tasks.list({...f, priority:'note'})
export const createNote = (d)    => tasks.create({...d, priority:'note', status:'pinned'})
export const updateNote = (id,ch)=> tasks.update(id,ch)
export const deleteNote = (id)   => tasks.delete(id)
