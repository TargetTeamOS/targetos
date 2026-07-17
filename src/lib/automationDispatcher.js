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
export async function dispatch(triggerType, record, previousRecord = null, meta = {}) {
  try {
    const automations = await getActiveAutomations()
    const matching    = automations.filter(a => a.trigger_type === triggerType)
    console.log(`[AutomationDispatcher] Trigger: ${triggerType} | Active automations: ${automations.length} | Matching: ${matching.length}`)
    if (!matching.length) return

    // Build trigger data from the record
    const triggerData = buildTriggerData(triggerType, record, previousRecord)

    // Load agents once if needed for actions
    const { data: agents } = await supabase.from('agents').select('id,name,email,role,color')

    // Resolve names the record itself doesn't carry: the assigned
    // agent (db updates return no join) and WHO made the change.
    if (!triggerData.agent_name && triggerData.agent_id) {
      triggerData.agent_name = agents?.find(a => a.id === triggerData.agent_id)?.name || ''
    }
    triggerData.changed_by = meta.actingAgentId
      ? (agents?.find(a => a.id === meta.actingAgentId)?.name || 'Unknown user')
      : 'System / automation'

    // Deal triggers: enrich with the linked TC deal's OPEN tasks as a
    // linked list ({{tc_open_tasks}}) so emails can include each task.
    if (triggerData.deal_id && ['deal_stage_change','deal_under_contract','deal_closed','offer_accepted','closing_soon'].includes(triggerType)) {
      try {
        const { data: tcDeal } = await supabase.from('tc_deals').select('id').eq('linked_deal_id', triggerData.deal_id).maybeSingle()
        if (tcDeal) {
          const { data: tasks } = await supabase.from('tc_tasks')
            .select('id,title,due_date,status').eq('tc_deal_id', tcDeal.id).neq('status', 'done')
            .order('due_date', { ascending: true }).limit(40)
          triggerData.tc_open_tasks = (tasks || []).length
            ? tasks.map(t => '• <a href="https://app.targetreteam.com/tc#task-' + t.id + '">' + t.title + '</a>' + (t.due_date ? ' (due ' + t.due_date + ')' : '')).join('\n')
            : '(no open TC tasks yet — they appear once the TC deal is set up)'
        } else triggerData.tc_open_tasks = '(no TC deal linked yet)'
      } catch { triggerData.tc_open_tasks = '' }
    }

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
  // Only set the id field matching what record actually IS -- previously
  // contact_id/deal_id/task_id/listing_id were ALL set to record.id
  // regardless of trigger type. For a deal-triggered automation,
  // contact_id held the deal's id, so any action checking
  // "if (triggerData.contact_id)" (update_contact_status, add_tag,
  // remove_tag) would silently try to update a contact using the
  // deal's id -- matching zero rows, no error, nothing happens.
  const isContactTrigger = ['new_contact','new_buyer','contact_status_change','contact_assigned','contact_source_added','pre_approval_received','no_activity'].includes(triggerType)
  const isDealTrigger     = ['deal_created','deal_stage_change','offer_accepted','deal_closed','deal_under_contract','deal_fell_through','closing_soon'].includes(triggerType)
  const isTaskTrigger     = ['task_created','task_completed','task_overdue'].includes(triggerType)
  const isListingTrigger  = ['listing_status_change'].includes(triggerType)
  const isPhotoTrigger    = triggerType === 'photography_scheduled'
  if (isPhotoTrigger) return {
    deal_id: record.deal_id || record.id || null,
    addr: record.addr || '', agent_id: record.agent_id || null,
    photo_when: record.photo_when || '', photographer: record.photographer || '',
    trigger_type: triggerType, changed_by: '',
  }

  return {
    // Common
    agent_id:     record.agent_id,
    agent_name:   record.agents?.name || '',
    // Contact
    contact_id:   isContactTrigger ? record.id : (record.contact_id || null),
    first_name:   record.first_name || '',
    last_name:    record.last_name  || '',
    contact_name: [record.first_name, record.last_name].filter(Boolean).join(' '),
    phone:        record.phone || '',
    email:        record.email || '',
    status:       record.status || '',
    source:       record.source || '',
    // Deal
    deal_id:      isDealTrigger ? record.id : null,
    addr:         record.addr || '',
    stage:        record.stage || '',
    prev_stage:   prev?.stage || '',
    gci:          record.gci  || 0,
    production:   record.production || 0,
    close_date:   record.expected_close_date || record.close_date || '',
    // Task
    task_id:      isTaskTrigger ? record.id : null,
    title:        record.title || '',
    priority:     record.priority || '',
    due_date:     record.due_date || '',
    // Listing
    listing_id:   isListingTrigger ? record.id : null,
    list_price:   record.list_price || 0,
    listing_addr: record.addr || '',
    // Meta
    changed_by:   '',   // filled in dispatch() from meta.actingAgentId
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
  newContact: (record) => {
    dispatch('new_contact', record)
    if (record.buyer_type) dispatch('new_buyer', record)
  },
  contactUpdated: (record, prev) => {
    if (prev?.status !== record.status) dispatch('contact_status_change', record, prev)
    if (!prev?.pre_approved && record.pre_approved) dispatch('pre_approval_received', record, prev)
    if (!prev?.agent_id && record.agent_id) dispatch('contact_assigned', record, prev)
    if (!prev?.source && record.source) dispatch('contact_source_added', record, prev)
  },
  dealCreated: (record) => dispatch('deal_created', record),
  dealUpdated: (record, prev, meta = {}) => {
    if (prev?.stage !== record.stage) {
      dispatch('deal_stage_change', record, prev, meta)
      if (record.stage === 'Offer Accapted')    dispatch('offer_accepted',      record, prev, meta)
      if (record.stage === 'Closed')            dispatch('deal_closed',         record, prev, meta)
      if (record.stage === 'Under Contract')    dispatch('deal_under_contract', record, prev, meta)
      if (record.stage === 'Deal Fell Through') dispatch('deal_fell_through',   record, prev, meta)
    }
    dispatch('closing_soon', record, prev)
  },
  taskCreated: (record) => dispatch('task_created', record),
  photographyScheduled: (record) => dispatch('photography_scheduled', record),
  taskUpdated: (record, prev) => {
    if (record.status === 'done' && prev?.status !== 'done') dispatch('task_completed', record, prev)
    if (record.due_date && new Date(record.due_date) < new Date() && record.status !== 'done') dispatch('task_overdue', record, prev)
    if (prev?.priority !== record.priority) dispatch('task_priority_changed', record, prev)
    if (!prev?.agent_id && record.agent_id) dispatch('task_assigned', record, prev)
  },
  listingCreated: (record) => dispatch('listing_created', record),
  listingUpdated: (record, prev, meta = {}) => {
    if (prev?.status !== record.status) {
      dispatch('listing_status_change', record, prev, meta)
      if (record.status === 'Sold')    dispatch('listing_sold',    record, prev, meta)
      if (record.status === 'Expired') dispatch('listing_expired', record, prev, meta)
    }
    if (prev?.list_price && record.list_price < prev.list_price) dispatch('listing_price_reduced', record, prev, meta)
  },
  openHouseCreated: (record) => dispatch('open_house_created', record),
  visitorAdded:     (record) => dispatch('oh_visitor_added', record),
  eventCreated:     (record) => dispatch('event_created', record),
  giftCreated:      (record) => dispatch('gift_created', record),
  giftUpdated:      (record, prev) => {
    if (prev?.status !== record.status) dispatch('gift_status_change', record, prev)
  },
}
