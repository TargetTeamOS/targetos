// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Database Layer
// Every create/update/delete automatically logs to audit_log.
// Who, what, when, on which record — always.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// Fire automation trigger safely
async function fireTrigger(name, ...args) {
  try {
    const { trigger } = await import('./automationDispatcher.js')
    if (trigger?.[name]) trigger[name](...args)
  } catch { /* automation errors must never crash the app */ }
}

// ── HELPER ───────────────────────────────────────────────────────
async function run(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}
// ── STRIP VIRTUAL FIELDS ──────────────────────────────────────────
// Removes client-side joins and computed fields before any DB write.
// Called on every update/insert to prevent "column not found" errors.
const VIRTUAL_FIELDS = new Set([
  'agents','contacts','listings','deals','tasks','calls',
  'oh_visitors','deal_contacts','open_houses',
  '_contact_count','_task_count','showings_count','_local',
])
function stripVirtual(data) {
  if (!data || typeof data !== 'object') return data
  const clean = {}
  for (const key of Object.keys(data)) {
    if (!VIRTUAL_FIELDS.has(key) && !key.startsWith('_')) {
      clean[key] = data[key]
    }
  }
  return clean
}



// ── FIELD LABELS ─────────────────────────────────────────────────
const FIELD_LABELS = {
  first_name:'First Name', last_name:'Last Name', phone:'Phone', email:'Email',
  address:'Address', city:'City', state:'State', zip:'Zip',
  status:'Status', source:'Source', type:'Type', notes:'Notes',
  agent_id:'Assigned Agent', budget_max:'Budget Max',
  addr:'Address', list_price:'List Price', beds:'Beds', baths:'Baths',
  sqft:'Sqft', mls_number:'MLS #', list_date:'List Date',
  stage:'Stage', side:'Side', gci:'GCI', production:'Production',
  ao_date:'A/O Date', close_date:'Close Date', expected_close_date:'Exp. Close',
  client_legal_name:'Client Name', client_phone:'Client Phone', client_email:'Client Email',
  priority:'Priority', due_date:'Due Date', title:'Title',
  listing_addr:'Listing', offer_price:'Offer Price', offer_date:'Offer Date',
  client_name:'Client Name', gift_type:'Gift Type', sent_date:'Sent Date',
  order_status:'Order Status',
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── AUDIT LOGGER ─────────────────────────────────────────────────
// agentId is optional — logs even without it (system actions, imports, etc.)
async function log(agentId, tableName, recordId, action, extra = {}) {
  try {
    if (!tableName || !recordId) return
    await supabase.from('audit_log').insert({
      agent_id:   agentId || null,
      table_name: tableName,
      record_id:  String(recordId),
      action:     action || 'updated',
      ...extra,
      created_at: new Date().toISOString(),
    })
  } catch { /* never crash on audit failure */ }
}

// ── FIELD-LEVEL DIFF LOGGER ──────────────────────────────────────
// Compares before/after and logs each changed field individually
// Skip fields that are internal/timestamps
const SKIP_FIELDS = new Set(['updated_at','created_at','last_activity','id','agents',
  'listings','deals','contacts','oh_visitors','_local'])

async function logDiff(agentId, tableName, recordId, before, after, recordLabel) {
  if (!before || !after) return
  const changes = []
  for (const key of Object.keys(after)) {
    if (SKIP_FIELDS.has(key)) continue
    const oldVal = before[key]
    const newVal = after[key]
    // Only log if value actually changed
    const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal).trim()
    const newStr = newVal === null || newVal === undefined ? '' : String(newVal).trim()
    if (oldStr === newStr) continue
    changes.push({ key, oldVal: oldStr, newVal: newStr })
  }

  if (changes.length === 0) return

  // Log each changed field as a separate audit entry
  for (const { key, oldVal, newVal } of changes) {
    await log(agentId, tableName, recordId,
      key === 'status' ? 'status_changed' : 'updated',
      {
        metadata: {
          field:       key,
          field_label: fieldLabel(key),
          old_value:   oldVal,
          new_value:   newVal,
          description: recordLabel + ': ' + fieldLabel(key) + ' changed',
        }
      }
    )
  }
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
    const before = await run(supabase.from('agents').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('agents').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    await logDiff(agentId || id, 'agents', id, before, result, result.name || 'Agent')
    return result
  },
},

// ── CONTACTS ─────────────────────────────────────────────────────
contacts: {
  async list(filters = {}) {
    let q = supabase.from('contacts').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.status)   q = q.eq('status', filters.status)
    if (filters.search)   q = q.or('first_name.ilike.%' + filters.search + '%,last_name.ilike.%' + filters.search + '%,phone.ilike.%' + filters.search + '%,email.ilike.%' + filters.search + '%')
    return run(q.order('last_activity', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('contacts').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('contacts').insert({ ...stripVirtual(data),
      last_activity: new Date().toISOString(),
      created_at:    new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).select().single())
    await log(data.agent_id, 'contacts', result.id, 'created', {
      metadata: {
        description: (result.first_name || '') + ' ' + (result.last_name || '') + ' added',
        field_label: 'Contact Created',
      }
    })
    fireTrigger('newContact', result)
    return result
  },
  async update(id, data) {
    // Fetch before state for diff
    const before = await run(supabase.from('contacts').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('contacts').update({ ...stripVirtual(data),
      last_activity: new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    const label = (result.first_name || '') + ' ' + (result.last_name || '')
    await logDiff(agentId, 'contacts', id, before, result, label.trim())
    fireTrigger('contactUpdated', result, data)
    return result
  },
  async delete(id, agentId) {
    const before = await run(supabase.from('contacts').select('first_name,last_name').eq('id', id).single()).catch(() => null)
    await log(agentId, 'contacts', id, 'deleted', {
      metadata: { description: before ? (before.first_name + ' ' + (before.last_name||'') + ' deleted') : 'Contact deleted' }
    })
    return run(supabase.from('contacts').delete().eq('id', id))
  },
},

// ── DEALS ────────────────────────────────────────────────────────
deals: {
  async list(filters = {}) {
    let q = supabase.from('deals').select('*, agents(id,name,color)')
    if (filters.agent_id) q = q.eq('agent_id', filters.agent_id)
    if (filters.stage)    q = q.eq('stage', filters.stage)
    if (filters.year) q = q.gte('ao_date', filters.year + '-01-01').lte('ao_date', filters.year + '-12-31')
    return run(q.order('ao_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('deals').select('*, agents(id,name,color)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('deals').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'deals', result.id, 'created', {
      metadata: { description: 'Deal at ' + (result.addr || '') + ' added', field_label: 'Deal Created' }
    })
    fireTrigger('dealCreated', result)
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('deals').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('deals').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    await logDiff(agentId, 'deals', id, before, result, result.addr || 'Deal')
    fireTrigger('dealUpdated', result, data)
    return result
  },
  async delete(id, agentId) {
    const before = await run(supabase.from('deals').select('addr').eq('id', id).single()).catch(() => null)
    await log(agentId, 'deals', id, 'deleted', { metadata: { description: (before?.addr || 'Deal') + ' deleted' } })
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
    const result = await run(supabase.from('listings').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'listings', result.id, 'created', {
      metadata: { description: 'Listing at ' + (result.addr || '') + ' added', field_label: 'Listing Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('listings').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('listings').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    await logDiff(agentId, 'listings', id, before, result, result.addr || 'Listing')
    fireTrigger('listingUpdated', result, data)
    return result
  },
  async delete(id, agentId) {
    const before = await run(supabase.from('listings').select('addr').eq('id', id).single()).catch(() => null)
    await log(agentId, 'listings', id, 'deleted', { metadata: { description: (before?.addr || 'Listing') + ' deleted' } })
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
    const result = await run(supabase.from('gifts').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'gifts', result.id, 'created', {
      metadata: { description: 'Gift for ' + (result.client_name || '') + ' added', field_label: 'Gift Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('gifts').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('gifts').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    await logDiff(agentId, 'gifts', id, before, result, result.client_name || 'Gift')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'gifts', id, 'deleted', { metadata: { description: 'Gift deleted' } })
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
    const result = await run(supabase.from('offers').insert({ ...stripVirtual(data), created_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'offers', result.id, 'created', {
      metadata: { description: 'Offer on ' + (result.listing_addr || '') + ' added', field_label: 'Offer Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('offers').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('offers').update(data).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    await logDiff(agentId, 'offers', id, before, result, result.listing_addr || 'Offer')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'offers', id, 'deleted', { metadata: { description: 'Offer deleted' } })
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
    const result = await run(supabase.from('transactions').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'transactions', result.id, 'created', {
      metadata: { description: 'Transaction at ' + (result.addr || '') + ' added', field_label: 'Transaction Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('transactions').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('transactions').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    await logDiff(agentId, 'transactions', id, before, result, result.addr || 'Transaction')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'transactions', id, 'deleted', { metadata: { description: 'Transaction deleted' } })
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
    const result = await run(supabase.from('tasks').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    await log(data.agent_id || data.created_by, 'tasks', result.id, 'created', {
      metadata: { description: result.title, field_label: 'Task Created' }
    })
    fireTrigger('taskCreated', result)
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('tasks').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('tasks').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    const agentId = data.agent_id || before?.agent_id || null
    await logDiff(agentId, 'tasks', id, before, result, result.title || 'Task')
    return result
  },
  async complete(id, agentId) {
    const result = await run(supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    await log(agentId, 'tasks', id, 'updated', {
      metadata: { field: 'status', field_label: 'Status', old_value: 'pending', new_value: 'done', description: result.title + ' completed' }
    })
    fireTrigger('taskUpdated', result, { status: 'done' })
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'tasks', id, 'deleted', { metadata: { description: 'Task deleted' } })
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
    const result = await run(supabase.from('calls').insert({ ...stripVirtual(data), called_at: data.called_at || new Date().toISOString() }).select().single())
    await log(data.agent_id, 'calls', result.id, 'created', {
      metadata: { description: 'Call to ' + (result.contact_name || result.from_number || '') + ' — ' + (result.outcome || 'logged'), field_label: 'Call Logged' }
    })
    // Also log on the contact record if linked
    if (data.contact_id) {
      await log(data.agent_id, 'contacts', data.contact_id, 'call_logged', {
        metadata: { description: 'Call logged — ' + (result.outcome || 'no outcome'), field_label: 'Call Logged' }
      })
    }
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('calls').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('calls').update(data).eq('id', id).select().single())
    await logDiff(data.agent_id || before?.agent_id, 'calls', id, before, result, result.contact_name || 'Call')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'calls', id, 'deleted', { metadata: { description: 'Call deleted' } })
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
    const result = await run(supabase.from('calendar_events').insert({ ...stripVirtual(data), created_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'calendar_events', result.id, 'created', {
      metadata: { description: result.title, field_label: 'Event Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('calendar_events').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('calendar_events').update(data).eq('id', id).select().single())
    await logDiff(data.agent_id || before?.agent_id, 'calendar_events', id, before, result, result.title || 'Event')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'calendar_events', id, 'deleted', { metadata: { description: 'Event deleted' } })
    return run(supabase.from('calendar_events').delete().eq('id', id))
  },
},

// ── OPEN HOUSES ──────────────────────────────────────────────────
openHouses: {
  async list(filters = {}) {
    let q = supabase.from('open_houses').select('*, agents(id,name,color), listings(id,addr)')
    if (filters.agent_id)          q = q.eq('agent_id', filters.agent_id)
    if (filters.active !== undefined) q = q.eq('active', filters.active)
    return run(q.order('date', { ascending: false }))
  },
  async get(id) {
    return run(supabase.from('open_houses').select('*, agents(id,name,color), oh_visitors(*)').eq('id', id).single())
  },
  async create(data) {
    const result = await run(supabase.from('open_houses').insert({ ...stripVirtual(data), created_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'open_houses', result.id, 'created', {
      metadata: { description: 'Open house at ' + (result.listing_addr || ''), field_label: 'Open House Created' }
    })
    fireTrigger('openHouseCreated', result)
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('open_houses').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('open_houses').update(data).eq('id', id).select().single())
    await logDiff(data.agent_id || before?.agent_id, 'open_houses', id, before, result, result.listing_addr || 'Open House')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'open_houses', id, 'deleted', { metadata: { description: 'Open house deleted' } })
    return run(supabase.from('open_houses').delete().eq('id', id))
  },
},

// ── OPEN HOUSE VISITORS ──────────────────────────────────────────
visitors: {
  async list(openHouseId) {
    return run(supabase.from('oh_visitors').select('*').eq('open_house_id', openHouseId).order('visited_at', { ascending: false }))
  },
  async create(data) {
    return run(supabase.from('oh_visitors').insert({ ...stripVirtual(data), visited_at: new Date().toISOString() }).select().single())
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
    const result = await run(supabase.from('announcements').insert({ ...stripVirtual(data), created_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'announcements', result.id, 'created', {
      metadata: { description: result.title, field_label: 'Announcement Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('announcements').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('announcements').update(data).eq('id', id).select().single())
    await logDiff(data.agent_id || before?.agent_id, 'announcements', id, before, result, result.title || 'Announcement')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'announcements', id, 'deleted', { metadata: { description: 'Announcement deleted' } })
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
    const result = await run(supabase.from('signs').insert({ ...stripVirtual(data), created_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'signs', result.id, 'created', {
      metadata: { description: 'Sign at ' + (result.addr || ''), field_label: 'Sign Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('signs').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('signs').update(data).eq('id', id).select().single())
    await logDiff(data.agent_id || before?.agent_id, 'signs', id, before, result, result.addr || 'Sign')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'signs', id, 'deleted', { metadata: { description: 'Sign deleted' } })
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
    const result = await run(supabase.from('listing_prep').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
    await log(data.agent_id, 'listing_prep', result.id, 'created', {
      metadata: { description: result.listing_addr || 'Listing prep created', field_label: 'Listing Prep Created' }
    })
    return result
  },
  async update(id, data) {
    const before = await run(supabase.from('listing_prep').select('*').eq('id', id).single()).catch(() => null)
    const result = await run(supabase.from('listing_prep').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
    await logDiff(data.agent_id || before?.agent_id, 'listing_prep', id, before, result, result.listing_addr || 'Listing Prep')
    return result
  },
  async delete(id, agentId) {
    await log(agentId, 'listing_prep', id, 'deleted', { metadata: { description: 'Listing prep deleted' } })
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
    return run(supabase.from('email_templates').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
  },
  async update(id, data) {
    return run(supabase.from('email_templates').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
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
    return run(supabase.from('automations').insert({ ...stripVirtual(data), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single())
  },
  async update(id, data) {
    return run(supabase.from('automations').update({ ...stripVirtual(data), updated_at: new Date().toISOString() }).eq('id', id).select().single())
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
