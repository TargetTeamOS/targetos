// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automation Engine
// Runs automations client-side when triggered.
// Logs every execution to automation_runs table.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { TRIGGERS, CONDITIONS, ACTIONS } from './automationConstants'

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
