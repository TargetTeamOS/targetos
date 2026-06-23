// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automation Dispatcher
// Called after every record create/update in db.js.
// Loads active automations, checks which ones match the trigger,
// verifies conditions, then executes all matching actions.
// Runs client-side — fires instantly when agent saves a record.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { runAutomation, checkConditions } from './automationEngine'

// Cache automations for 60 seconds to avoid repeated DB reads
let _cache = null
let _cacheTime = 0
const CACHE_TTL = 5_000  // 5 seconds - fast enough for real-time use

async function getActiveAutomations() {
  const now = Date.now()
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache
  const { data } = await supabase
    .from('automations')
    .select('*')
    .eq('active', true)
  _cache     = data || []
  _cacheTime = now
  return _cache
}

// Invalidate cache when automations are saved
export function invalidateCache() {
  _cache     = null
  _cacheTime = 0
}

// ── MAIN DISPATCHER ───────────────────────────────────────────────
// Call this after any record is created or updated
export async function dispatch(triggerType, record, previousRecord = null) {
  try {
    const automations = await getActiveAutomations()
    const matching    = automations.filter(a => a.trigger_type === triggerType)
    console.log(`[AutomationDispatcher] Trigger: ${triggerType} | Active automations: ${automations.length} | Matching: ${matching.length}`)
    if (!matching.length) return

    // Build trigger data from the record
    const triggerData = buildTriggerData(triggerType, record, previousRecord)

    // Load agents once if needed for actions
    const { data: agents } = await supabase.from('agents').select('id,name,email,role,color')

    for (const automation of matching) {
      // Check trigger-specific conditions (e.g. to_stage, from_stage)
      if (!matchesTriggerConfig(automation, record, previousRecord)) continue

      // Check user-defined conditions
      if (!checkConditions(automation, record)) continue

      // Fire — don't await so it doesn't block the UI
      runAutomation(automation, triggerData, agents || []).catch(e => {
        console.error(`[Automation] "${automation.name}" failed:`, e.message)
      })
    }
  } catch(e) {
    // Automation errors must NEVER crash the main operation
    console.error('[AutomationDispatcher] Error:', e.message)
  }
}

// ── BUILD TRIGGER DATA FROM RECORD ───────────────────────────────
function buildTriggerData(triggerType, record, prev) {
  return {
    // Common
    agent_id:     record.agent_id,
    agent_name:   record.agents?.name || '',
    // Contact
    contact_id:   record.id,
    first_name:   record.first_name || '',
    last_name:    record.last_name  || '',
    contact_name: [record.first_name, record.last_name].filter(Boolean).join(' '),
    phone:        record.phone || '',
    email:        record.email || '',
    status:       record.status || '',
    source:       record.source || '',
    // Deal
    deal_id:      record.id,
    addr:         record.addr || '',
    stage:        record.stage || '',
    prev_stage:   prev?.stage || '',
    gci:          record.gci  || 0,
    production:   record.production || 0,
    close_date:   record.expected_close_date || record.close_date || '',
    // Task
    task_id:      record.id,
    title:        record.title || '',
    priority:     record.priority || '',
    due_date:     record.due_date || '',
    // Listing
    listing_id:   record.id,
    list_price:   record.list_price || 0,
    listing_addr: record.addr || '',
    // Meta
    trigger_type: triggerType,
    created_at:   record.created_at,
  }
}

// ── CHECK TRIGGER CONFIG ──────────────────────────────────────────
// Checks trigger-level config like "to_stage = Closed" or "from_status = New"
function matchesTriggerConfig(automation, record, prev) {
  const cfg = automation.trigger_config || {}

  switch (automation.trigger_type) {
    case 'deal_stage_change':
      if (cfg.to_stage   && record.stage !== cfg.to_stage)   return false
      if (cfg.from_stage && prev?.stage  !== cfg.from_stage) return false
      return true

    case 'contact_status_change':
      if (cfg.to_status   && record.status !== cfg.to_status)   return false
      if (cfg.from_status && prev?.status  !== cfg.from_status) return false
      return true

    case 'listing_status_change':
      if (cfg.to_status && record.status !== cfg.to_status) return false
      return true

    case 'offer_accepted':
      return record.stage === 'Offer Accapted'

    case 'deal_closed':
      return record.stage === 'Closed'

    case 'closing_soon': {
      if (!record.expected_close_date && !record.close_date) return false
      const date  = record.expected_close_date || record.close_date
      const days  = Math.ceil((new Date(date) - Date.now()) / 86400000)
      const limit = parseInt(cfg.days) || 7
      return days >= 0 && days <= limit
    }

    case 'no_activity': {
      if (!record.last_activity) return false
      const daysSince = Math.floor((Date.now() - new Date(record.last_activity)) / 86400000)
      const limit     = parseInt(cfg.days) || 14
      return daysSince >= limit
    }

    default:
      return true
  }
}

// ── SPECIFIC TRIGGER HELPERS ──────────────────────────────────────
// Call these from specific points in db.js

export const trigger = {
  newContact:     (record) => dispatch('new_contact', record),
  contactUpdated: (record, prev) => {
    if (prev?.status !== record.status) dispatch('contact_status_change', record, prev)
    else dispatch('no_activity', record, prev)
  },
  dealCreated:    (record) => dispatch('deal_created', record),
  dealUpdated:    (record, prev) => {
    if (prev?.stage !== record.stage) {
      dispatch('deal_stage_change', record, prev)
      if (record.stage === 'Offer Accapted') dispatch('offer_accepted', record, prev)
      if (record.stage === 'Closed')         dispatch('deal_closed',    record, prev)
    }
    dispatch('closing_soon', record, prev)
  },
  taskCreated:    (record) => dispatch('task_created', record),
  taskUpdated:    (record, prev) => {
    if (record.status === 'done' && prev?.status !== 'done') dispatch('task_completed', record, prev)
    if (record.due_date && new Date(record.due_date) < Date.now() && record.status !== 'done') dispatch('task_overdue', record, prev)
  },
  listingUpdated: (record, prev) => {
    if (prev?.status !== record.status) dispatch('listing_status_change', record, prev)
  },
  openHouseCreated: (record) => dispatch('open_house_created', record),
}
