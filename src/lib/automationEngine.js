// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automation Engine
// Runs automations client-side when triggered.
// Logs every execution to automation_runs table.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'

// ── TRIGGER DEFINITIONS ───────────────────────────────────────────
export const TRIGGERS = [
  {
    id:          'new_contact',
    label:       'New contact added',
    icon:        '👤',
    category:    'Contacts',
    description: 'Fires when a new contact is created',
    config:      [],
  },
  {
    id:          'contact_status_change',
    label:       'Contact status changes',
    icon:        '🔄',
    category:    'Contacts',
    description: 'Fires when a contact\'s status is changed',
    config:      [
      { key: 'to_status', label: 'New Status', type: 'status_select', required: false },
      { key: 'from_status', label: 'From Status', type: 'status_select', required: false },
    ],
  },
  {
    id:          'no_activity',
    label:       'No contact activity for X days',
    icon:        '💤',
    category:    'Contacts',
    description: 'Fires when a contact hasn\'t been touched in a set number of days',
    config:      [
      { key: 'days', label: 'Number of Days', type: 'number', default: 14, required: true },
    ],
  },
  {
    id:          'deal_stage_change',
    label:       'Deal stage changes',
    icon:        '📊',
    category:    'Deals',
    description: 'Fires when a deal moves to a new stage',
    config:      [
      { key: 'to_stage', label: 'New Stage', type: 'stage_select', required: false },
      { key: 'from_stage', label: 'From Stage', type: 'stage_select', required: false },
    ],
  },
  {
    id:          'deal_created',
    label:       'New deal added',
    icon:        '✨',
    category:    'Deals',
    description: 'Fires when a new deal is created',
    config:      [],
  },
  {
    id:          'closing_soon',
    label:       'Deal closing within X days',
    icon:        '📅',
    category:    'Deals',
    description: 'Fires when a deal has a closing date approaching',
    config:      [
      { key: 'days', label: 'Days Before Closing', type: 'number', default: 7, required: true },
    ],
  },
  {
    id:          'task_overdue',
    label:       'Task becomes overdue',
    icon:        '⚠️',
    category:    'Tasks',
    description: 'Fires when a task passes its due date without being completed',
    config:      [],
  },
  {
    id:          'task_completed',
    label:       'Task is completed',
    icon:        '✅',
    category:    'Tasks',
    description: 'Fires when a task is marked done',
    config:      [],
  },
  {
    id:          'listing_status_change',
    label:       'Listing status changes',
    icon:        '🏡',
    category:    'Listings',
    description: 'Fires when a listing changes status',
    config:      [
      { key: 'to_status', label: 'New Status', type: 'listing_status_select', required: false },
    ],
  },
  {
    id:          'open_house_created',
    label:       'Open house scheduled',
    icon:        '🚪',
    category:    'Listings',
    description: 'Fires when a new open house is created',
    config:      [],
  },
  {
    id:          'offer_accepted',
    label:       'Offer accepted (AO)',
    icon:        '🤝',
    category:    'Deals',
    description: 'Fires when a deal is moved to Offer Accapted stage',
    config:      [],
  },
  {
    id:          'deal_closed',
    label:       'Deal closes',
    icon:        '🏁',
    category:    'Deals',
    description: 'Fires when a deal is marked Closed',
    config:      [],
  },
]

// ── CONDITION DEFINITIONS ─────────────────────────────────────────
export const CONDITIONS = [
  { id: 'contact_status',   label: 'Contact status is',     type: 'status_select',   applies: ['new_contact','contact_status_change','no_activity'] },
  { id: 'contact_source',   label: 'Contact source is',     type: 'source_select',   applies: ['new_contact'] },
  { id: 'deal_stage',       label: 'Deal stage is',         type: 'stage_select',    applies: ['deal_stage_change','closing_soon','deal_created'] },
  { id: 'deal_side',        label: 'Deal side is',          type: 'side_select',     applies: ['deal_stage_change','deal_created'] },
  { id: 'agent_is',         label: 'Assigned agent is',     type: 'agent_select',    applies: ['*'] },
  { id: 'has_no_tasks',     label: 'Contact has no open tasks', type: 'boolean',     applies: ['new_contact','no_activity'] },
  { id: 'is_pre_approved',  label: 'Contact is pre-approved',   type: 'boolean',     applies: ['new_contact','contact_status_change'] },
]

// ── ACTION DEFINITIONS ────────────────────────────────────────────
export const ACTIONS = [
  {
    id:     'create_task',
    label:  'Create a task',
    icon:   '✅',
    fields: [
      { key: 'title',    label: 'Task Title',    type: 'text',          required: true,  placeholder: 'Follow up with {{contact_name}}' },
      { key: 'priority', label: 'Priority',      type: 'priority_select', required: true, default: 'normal' },
      { key: 'due_days', label: 'Due in (days)', type: 'number',        required: true,  default: 1 },
      { key: 'assign_to',label: 'Assign To',     type: 'agent_or_trigger', required: false, default: 'trigger_agent' },
      { key: 'notes',    label: 'Task Notes',    type: 'textarea',      required: false, placeholder: 'Auto-generated task' },
    ],
  },
  {
    id:     'send_notification',
    label:  'Send in-app notification',
    icon:   '🔔',
    fields: [
      { key: 'title',    label: 'Notification Title', type: 'text', required: true,  placeholder: 'New lead assigned' },
      { key: 'body',     label: 'Message',            type: 'textarea', required: true, placeholder: '{{contact_name}} has been added...' },
      { key: 'notify',   label: 'Notify',             type: 'agent_or_trigger', required: true, default: 'trigger_agent' },
    ],
  },
  {
    id:     'update_contact_status',
    label:  'Update contact status',
    icon:   '🔄',
    fields: [
      { key: 'status', label: 'Set Status To', type: 'status_select', required: true },
    ],
  },
  {
    id:     'update_deal_stage',
    label:  'Update deal stage',
    icon:   '📊',
    fields: [
      { key: 'stage', label: 'Set Stage To', type: 'stage_select', required: true },
    ],
  },
  {
    id:     'assign_agent',
    label:  'Assign to agent',
    icon:   '👤',
    fields: [
      { key: 'agent_id', label: 'Assign To Agent', type: 'agent_select', required: true },
    ],
  },
  {
    id:     'send_email',
    label:  'Send email notification',
    icon:   '📧',
    fields: [
      { key: 'to',      label: 'Send To',  type: 'agent_or_trigger', required: true, default: 'trigger_agent' },
      { key: 'subject', label: 'Subject',  type: 'text', required: true, placeholder: 'Follow up needed: {{contact_name}}' },
      { key: 'body',    label: 'Message',  type: 'textarea', required: true, placeholder: 'This is an automated reminder...' },
    ],
  },
  {
    id:     'add_tag',
    label:  'Add tag to contact',
    icon:   '🏷',
    fields: [
      { key: 'tag', label: 'Tag', type: 'text', required: true, placeholder: 'hot-lead' },
    ],
  },
]

// ── VARIABLE INTERPOLATION ────────────────────────────────────────
// Replaces {{variable}} in text with actual values from context
export function interpolate(text, context) {
  if (!text) return text
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context[key] ?? match
  })
}

// ── RUN AN AUTOMATION ─────────────────────────────────────────────
export async function runAutomation(automation, triggerData, agents) {
  const context = buildContext(triggerData)
  const affected = []

  try {
    for (const action of (automation.action_nodes || [])) {
      await executeAction(action, context, triggerData, agents)
      affected.push(action.id)
    }

    // Log success
    await supabase.from('automation_runs').insert({
      automation_id:    automation.id,
      trigger_type:     automation.trigger_type,
      trigger_data:     triggerData,
      status:           'success',
      records_affected: affected.length,
      created_at:       new Date().toISOString(),
    })

    // Update fire count
    await supabase.from('automations').update({
      fire_count: (automation.fire_count || 0) + 1,
      last_fired: new Date().toISOString(),
    }).eq('id', automation.id)

    return { success: true }
  } catch(e) {
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      trigger_type:  automation.trigger_type,
      trigger_data:  triggerData,
      status:        'error',
      error:         e.message,
      created_at:    new Date().toISOString(),
    })
    return { success: false, error: e.message }
  }
}

// ── BUILD CONTEXT FROM TRIGGER DATA ──────────────────────────────
function buildContext(data) {
  return {
    contact_name:  [data.first_name, data.last_name].filter(Boolean).join(' ') || data.contact_name || '',
    deal_addr:     data.addr || '',
    agent_name:    data.agent_name || '',
    stage:         data.stage || '',
    status:        data.status || '',
    days:          data.days || '',
    amount:        data.gci || data.production || '',
    ...data,
  }
}

// ── EXECUTE A SINGLE ACTION ───────────────────────────────────────
async function executeAction(action, context, triggerData, agents) {
  const cfg = action.config || {}

  switch (action.type) {

    case 'create_task': {
      const agentId = resolveAgent(cfg.assign_to, triggerData, agents)
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + (parseInt(cfg.due_days) || 1))
      await supabase.from('tasks').insert({
        title:      interpolate(cfg.title || 'Follow up', context),
        agent_id:   agentId,
        created_by: agentId,
        contact_id: triggerData.contact_id || null,
        deal_id:    triggerData.deal_id    || null,
        due_date:   dueDate.toISOString().slice(0, 10),
        priority:   cfg.priority || 'normal',
        status:     'pending',
        notes:      interpolate(cfg.notes || '', context),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      break
    }

    case 'send_notification': {
      const agentId = resolveAgent(cfg.notify, triggerData, agents)
      if (agentId) {
        await supabase.from('notifications').insert({
          agent_id:   agentId,
          title:      interpolate(cfg.title || 'Automation Alert', context),
          body:       interpolate(cfg.body || '', context),
          type:       'info',
          read:       false,
          created_at: new Date().toISOString(),
        })
      }
      break
    }

    case 'update_contact_status': {
      if (triggerData.contact_id) {
        await supabase.from('contacts').update({ status: cfg.status, updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
      }
      break
    }

    case 'update_deal_stage': {
      if (triggerData.deal_id) {
        await supabase.from('deals').update({ stage: cfg.stage, updated_at: new Date().toISOString() }).eq('id', triggerData.deal_id)
      }
      break
    }

    case 'add_tag': {
      if (triggerData.contact_id && cfg.tag) {
        const { data: contact } = await supabase.from('contacts').select('tags').eq('id', triggerData.contact_id).single()
        const tags = contact?.tags || []
        if (!tags.includes(cfg.tag)) {
          await supabase.from('contacts').update({ tags: [...tags, cfg.tag], updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
        }
      }
      break
    }

    case 'assign_agent': {
      if (triggerData.contact_id) await supabase.from('contacts').update({ agent_id: cfg.agent_id, updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
      if (triggerData.deal_id)    await supabase.from('deals').update({ agent_id: cfg.agent_id, updated_at: new Date().toISOString() }).eq('id', triggerData.deal_id)
      break
    }

    default:
      break
  }
}

// ── RESOLVE AGENT ID ──────────────────────────────────────────────
function resolveAgent(value, triggerData, agents) {
  if (!value || value === 'trigger_agent') return triggerData.agent_id
  if (value === 'all_agents') return null
  // If it's a UUID, return directly
  if (value?.length === 36) return value
  return triggerData.agent_id
}

// ── CHECK CONDITIONS ──────────────────────────────────────────────
export function checkConditions(automation, record) {
  const conditions = automation.conditions || []
  if (!conditions.length) return true
  return conditions.every(cond => {
    const val = record[cond.field]
    switch (cond.operator) {
      case 'equals':      return val === cond.value
      case 'not_equals':  return val !== cond.value
      case 'contains':    return String(val || '').toLowerCase().includes(String(cond.value).toLowerCase())
      case 'is_empty':    return !val
      case 'is_not_empty':return !!val
      default:            return true
    }
  })
}
