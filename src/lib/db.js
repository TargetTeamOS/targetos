// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Database Layer
// Every create/update/delete automatically logs to audit_log.
// Who, what, when, on which record — always.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// Lazy import to avoid circular dependency
function getTrigger() {
  try { return require('./automationDispatcher').trigger } catch { return null }
}
const trigger = new Proxy({}, { get: (_, k) => (...args) => { try { const t = getTrigger(); if (t?.[k]) t[k](...args) } catch {} } })

// ── HELPER ───────────────────────────────────────────────────────
async function run(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

// ── AUDIT LOGGER ─────────────────────────────────────────────────
// Logs silently — never crashes the main operation
async function log(agentId, tableName, recordId, action, extra = {}) {
  try {
    if (!agentId || !tableName || !recordId) return
    await supabase.from('audit_log').insert({
      agent_id:   agentId,
      table_name: tableName,
      record_id:  recordId,
      action,
      ...extra,
      created_at: new Date().toISOString(),
    })
  } catch { /* never crash on audit failure */ }
}

export const db = {

// ── AGENTS ───────────────────────────────────────────────────────
agents: {
  async list() {
    return run(supabase.from('agents').select('*').eq('active', true).order('name'))
  },
  async get(id) {
    return run(supabase.from('agents').select('*').eq('id', id).single())
  },
  async getByAuthId(authId) {
    return run(supabase.from('agents').select('*').eq('auth_user_id', authId).single())
  },
  async getByEmail(email) {
    return run(supabase.from('agents').select('*').eq('email', email).single())
  },
  async update(id, data, agentId) {
    const result = await run(supabase.from('agents').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(agentId || id, 'agents', id, 'updated', { metadata: { description: 'Agent profile updated' } })
    return result
  },
},

// ── CONTACTS ─────────────────────────────────────────────────────
contacts: {
  async list(filters = {}) {
    let q = supabase.from('contacts').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.status)   q = q.eq('status', filters.status)
    if (filters.search)   q = q.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
    return run(q.order('last_activity', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('contacts').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('contacts').insert({ ...data, last_activity: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'contacts', result.id, 'created', { metadata: { description: `${result.first_name} ${result.last_name || ''} added` } })
    trigger.newContact(result)
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('contacts').update({ ...data, last_activity: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'contacts', id, 'updated', { metadata: { description: `${result.first_name} ${result.last_name || ''} updated` } })
    trigger.contactUpdated(result, data)
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'contacts', id, 'deleted', { metadata: { description: 'Contact deleted' } })
    return run(supabase.from('contacts').delete().eq('id', id))
  },
},

// ── DEALS ────────────────────────────────────────────────────────
deals: {
  async list(filters = {}) {
    let q = supabase.from('deals').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.stage)    q = q.eq('stage', filters.stage)
    if (filters.year) q = q.gte('ao_date', `${filters.year}-01-01`).lte('ao_date', `${filters.year}-12-31`)
    return run(q.order('ao_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('deals').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('deals').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'deals', result.id, 'created', { metadata: { description: `Deal at ${result.addr} added` } })
    trigger.dealCreated(result)
    return result
  },
  async update(id, data) {
    // Detect stage change for specific logging
    const action = data.stage ? 'status' : 'updated'
    const result = await run(supabase.from('deals').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'deals', id, action, {
      field_name: data.stage ? 'stage' : undefined,
      new_value:  data.stage,
      metadata:   { description: `Deal at ${result.addr} updated` }
    })
    trigger.dealUpdated(result, data)
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'deals', id, 'deleted', { metadata: { description: 'Deal deleted' } })
    return run(supabase.from('deals').delete().eq('id', id))
  },
},

// ── LISTINGS ─────────────────────────────────────────────────────
listings: {
  async list(filters = {}) {
    let q = supabase.from('listings').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.status)   q = q.eq('status', filters.status)
    return run(q.order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('listings').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('listings').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'listings', result.id, 'created', { metadata: { description: `Listing at ${result.addr} added` } })
    return result
  },
  async update(id, data) {
    const action = data.status ? 'status' : 'updated'
    const result = await run(supabase.from('listings').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'listings', id, action, {
      field_name: data.status ? 'status' : undefined,
      new_value:  data.status,
      metadata:   { description: `Listing at ${result.addr} updated` }
    })
    trigger.listingUpdated(result, data)
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'listings', id, 'deleted')
    return run(supabase.from('listings').delete().eq('id', id))
  },
},

// ── GIFTS ────────────────────────────────────────────────────────
gifts: {
  async list(filters = {}) {
    let q = supabase.from('gifts').select('*, agents(id,name,color), deals(id,addr)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.status)   q = q.eq('status', filters.status)
    return run(q.order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('gifts').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('gifts').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'gifts', result.id, 'created', { metadata: { description: `Gift for ${result.client_name} added` } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('gifts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'gifts', id, data.status ? 'status' : 'updated', { field_name: data.status ? 'status' : undefined, new_value: data.status })
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'gifts', id, 'deleted')
    return run(supabase.from('gifts').delete().eq('id', id))
  },
},

// ── OFFERS ───────────────────────────────────────────────────────
offers: {
  async list(filters = {}) {
    let q = supabase.from('offers').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    return run(q.order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('offers').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('offers').insert({ ...data, created_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'offers', result.id, 'created', { metadata: { description: `Offer on ${result.listing_addr} added` } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('offers').update(data).eq('id', id).select().single())
    log(data.agent_id, 'offers', id, data.status ? 'status' : 'updated', { field_name: data.status ? 'status' : undefined, new_value: data.status })
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'offers', id, 'deleted')
    return run(supabase.from('offers').delete().eq('id', id))
  },
},

// ── TRANSACTIONS ─────────────────────────────────────────────────
transactions: {
  async list(filters = {}) {
    let q = supabase.from('transactions').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    return run(q.order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('transactions').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('transactions').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'transactions', result.id, 'created', { metadata: { description: `Transaction at ${result.addr} added` } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('transactions').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'transactions', id, 'updated')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'transactions', id, 'deleted')
    return run(supabase.from('transactions').delete().eq('id', id))
  },
},

// ── TASKS ────────────────────────────────────────────────────────
tasks: {
  async list(filters = {}) {
    let q = supabase.from('tasks').select('*, agents(id,name,color)')
    if (filters.agent_id)   q = q.eq('agent_id', filters.agent_id)
    if (filters.status)     q = q.eq('status', filters.status)
    if (filters.deal_id)    q = q.eq('deal_id', filters.deal_id)
    if (filters.contact_id) q = q.eq('contact_id', filters.contact_id)
    return run(q.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('tasks').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('tasks').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id || data.created_by, 'tasks', result.id, 'created', { metadata: { description: result.title } })
    trigger.taskCreated(result)
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('tasks').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'tasks', id, data.status ? 'status' : 'updated', { field_name: data.status ? 'status' : undefined, new_value: data.status, metadata: { description: result.title } })
    return result
  },
  async complete(id, agentId) {
    const result = await run(supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(agentId, 'tasks', id, 'completed', { field_name: 'status', new_value: 'done', metadata: { description: result.title } })
    trigger.taskUpdated(result, { status: 'done' })
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'tasks', id, 'deleted')
    return run(supabase.from('tasks').delete().eq('id', id))
  },
},

// ── CALLS ────────────────────────────────────────────────────────
calls: {
  async list(filters = {}) {
    let q = supabase.from('calls').select('*, agents(id,name,color)')
    if (filters.agent_id)   q = q.eq('agent_id', filters.agent_id)
    if (filters.contact_id) q = q.eq('contact_id', filters.contact_id)
    return run(q.order('called_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('calls').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('calls').insert({ ...data, called_at: data.called_at || new Date().toISOString() }).select().single())
    log(data.agent_id, 'calls', result.id, 'created', { metadata: { description: `Call to ${result.contact_name || result.phone} — ${result.outcome || 'logged'}` } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('calls').update(data).eq('id', id).select().single())
    log(data.agent_id, 'calls', id, 'updated')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'calls', id, 'deleted')
    return run(supabase.from('calls').delete().eq('id', id))
  },
},

// ── CALENDAR ─────────────────────────────────────────────────────
calendar: {
  async list(filters = {}) {
    let q = supabase.from('calendar_events').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.from)     q = q.gte('start_date', filters.from)
    if (filters.to)       q = q.lte('start_date', filters.to)
    return run(q.order('start_date').order('start_time'))
  },
  async get(id) {
    return run(supabase.from('calendar_events').select('*').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('calendar_events').insert({ ...data, created_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'calendar_events', result.id, 'created', { metadata: { description: result.title } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('calendar_events').update(data).eq('id', id).select().single())
    log(data.agent_id, 'calendar_events', id, 'updated', { metadata: { description: result.title } })
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'calendar_events', id, 'deleted')
    return run(supabase.from('calendar_events').delete().eq('id', id))
  },
},

// ── OPEN HOUSES ──────────────────────────────────────────────────
openHouses: {
  async list(filters = {}) {
    let q = supabase.from('open_houses').select('*, agents(id,name,color), listings(id,addr)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.active !== undefined) q = q.eq('active', filters.active)
    return run(q.order('date', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('open_houses').select('*, agents(id,name,color), oh_visitors(*)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('open_houses').insert({ ...data, created_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'open_houses', result.id, 'created', { metadata: { description: `Open house at ${result.listing_addr}` } })
    trigger.openHouseCreated(result)
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('open_houses').update(data).eq('id', id).select().single())
    log(data.agent_id, 'open_houses', id, 'updated')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'open_houses', id, 'deleted')
    return run(supabase.from('open_houses').delete().eq('id', id))
  },
},

// ── OPEN HOUSE VISITORS ──────────────────────────────────────────
visitors: {
  async list(openHouseId) {
    return run(supabase.from('oh_visitors').select('*').eq('open_house_id', openHouseId).order('visited_at', { ascending: false }))
  },
  async create(data) {
    const result = await run(supabase.from('oh_visitors').insert({ ...data, visited_at: new Date().toISOString() }).select().single())
    return result
  },
  async update(id, data) {
    return run(supabase.from('oh_visitors').update(data).eq('id', id).select().single())
  },
  async delete(id) {
    return run(supabase.from('oh_visitors').delete().eq('id', id))
  },
},

// ── ANNOUNCEMENTS ────────────────────────────────────────────────
announcements: {
  async list() {
    return run(supabase.from('announcements').select('*, agents(id,name,color)').order('pinned', { ascending: false }).order('created_at', { ascending: false }))
  },
  async create(data) {
    const result = await run(supabase.from('announcements').insert({ ...data, created_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'announcements', result.id, 'created', { metadata: { description: result.title } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('announcements').update(data).eq('id', id).select().single())
    log(data.agent_id, 'announcements', id, 'updated')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'announcements', id, 'deleted')
    return run(supabase.from('announcements').delete().eq('id', id))
  },
},

// ── SIGNS ────────────────────────────────────────────────────────
signs: {
  async list(filters = {}) {
    let q = supabase.from('signs').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    return run(q.order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('signs').select('*').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('signs').insert({ ...data, created_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'signs', result.id, 'created', { metadata: { description: `Sign at ${result.addr}` } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('signs').update(data).eq('id', id).select().single())
    log(data.agent_id, 'signs', id, 'updated')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'signs', id, 'deleted')
    return run(supabase.from('signs').delete().eq('id', id))
  },
},

// ── LISTING PREP ─────────────────────────────────────────────────
listingPrep: {
  async list(filters = {}) {
    let q = supabase.from('listing_prep').select('*, agents(id,name,color), listings(id,addr)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    return run(q.order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('listing_prep').select('*, listings(id,addr)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('listing_prep').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    log(data.agent_id, 'listing_prep', result.id, 'created', { metadata: { description: result.listing_addr } })
    return result
  },
  async update(id, data) {
    const result = await run(supabase.from('listing_prep').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
    log(data.agent_id, 'listing_prep', id, 'updated')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'listing_prep', id, 'deleted')
    return run(supabase.from('listing_prep').delete().eq('id', id))
  },
},

// ── EMAIL TEMPLATES ──────────────────────────────────────────────
emailTemplates: {
  async list() {
    return run(supabase.from('email_templates').select('*').order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('email_templates').select('*').eq('id', id).single())
  },
  async create(data) {
    return run(supabase.from('email_templates').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
  },
  async update(id, data) {
    return run(supabase.from('email_templates').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
  },
  async delete(id) {
    return run(supabase.from('email_templates').delete().eq('id', id))
  },
},

// ── AUTOMATIONS ──────────────────────────────────────────────────
automations: {
  async list() {
    return run(supabase.from('automations').select('*, agents(id,name)').order('name'))
  },
  async get(id) {
    return run(supabase.from('automations').select('*').eq('id', id).single())
  },
  async create(data) {
    return run(supabase.from('automations').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
  },
  async update(id, data) {
    return run(supabase.from('automations').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id).select().single())
  },
  async delete(id) {
    return run(supabase.from('automations').delete().eq('id', id))
  },
},

// ── AUDIT LOG ────────────────────────────────────────────────────
auditLog: {
  async list(filters = {}) {
    let q = supabase.from('audit_log').select('*, agents(id,name,color)')
    if (filters.agent_id)   q = q.eq('agent_id', filters.agent_id)
    if (filters.table_name) q = q.eq('table_name', filters.table_name)
    if (filters.record_id)  q = q.eq('record_id', filters.record_id)
    return run(q.order('created_at', { ascending: false }).limit(filters.limit || 200))
  },
  async log(agentId, tableName, recordId, action, extra = {}) {
    return log(agentId, tableName, recordId, action, extra)
  },
},

// ── BRIEFING PREFS ───────────────────────────────────────────────
briefingPrefs: {
  async get(agentId) {
    const { data } = await supabase.from('briefing_prefs').select('*').eq('agent_id', agentId).single()
    return data
  },
  async upsert(agentId, prefs) {
    return run(supabase.from('briefing_prefs').upsert({ agent_id: agentId, ...prefs, updated_at: new Date().toISOString() }).select().single())
  },
},

} // end db

// ── NAMED EXPORTS (backward compat) ─────────────────────────────
export const createContact    = (d) => db.contacts.create(d)
export const getContacts      = (f) => db.contacts.list(f)
export const updateContact    = (id, d) => db.contacts.update(id, d)
export const deleteContact    = (id, agentId) => db.contacts.delete(id, agentId)

export const createDeal       = (d) => db.deals.create(d)
export const getDeals         = (f) => db.deals.list(f)
export const updateDeal       = (id, d) => db.deals.update(id, d)
export const deleteDeal       = (id, agentId) => db.deals.delete(id, agentId)

export const createListing    = (d) => db.listings.create(d)
export const getListings      = (f) => db.listings.list(f)
export const updateListing    = (id, d) => db.listings.update(id, d)
export const deleteListing    = (id, agentId) => db.listings.delete(id, agentId)

export const createTask       = (d) => db.tasks.create(d)
export const getTasks         = (f) => db.tasks.list(f)
export const updateTask       = (id, d) => db.tasks.update(id, d)
export const completeTask     = (id, agentId) => db.tasks.complete(id, agentId)
export const deleteTask       = (id, agentId) => db.tasks.delete(id, agentId)

export const createGift       = (d) => db.gifts.create(d)
export const getGifts         = (f) => db.gifts.list(f)
export const updateGift       = (id, d) => db.gifts.update(id, d)
export const deleteGift       = (id, agentId) => db.gifts.delete(id, agentId)

export const createOffer      = (d) => db.offers.create(d)
export const getOffers        = (f) => db.offers.list(f)
export const updateOffer      = (id, d) => db.offers.update(id, d)
export const deleteOffer      = (id, agentId) => db.offers.delete(id, agentId)

export const createCall       = (d) => db.calls.create(d)
export const getCalls         = (f) => db.calls.list(f)
export const updateCall       = (id, d) => db.calls.update(id, d)
export const deleteCall       = (id, agentId) => db.calls.delete(id, agentId)

export const getAgents        = () => db.agents.list()
export const getAgent         = (id) => db.agents.get(id)
export const updateAgent      = (id, d, agentId) => db.agents.update(id, d, agentId)

export const createAnnouncement = (d) => db.announcements.create(d)
export const getAnnouncements   = () => db.announcements.list()
export const updateAnnouncement = (id, d) => db.announcements.update(id, d)
export const deleteAnnouncement = (id, agentId) => db.announcements.delete(id, agentId)

export const logAudit = (agentId, table, recordId, action, extra) =>
  db.auditLog.log(agentId, table, recordId, action, extra)
