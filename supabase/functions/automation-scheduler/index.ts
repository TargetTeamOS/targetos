// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Automation Scheduler Edge Function
// Runs on a schedule (every hour via pg_cron or Supabase scheduled functions)
// Handles time-based triggers:
//   - no_activity: contacts with no activity for X days
//   - closing_soon: deals closing within X days
//   - task_overdue: tasks past due date
//   - birthday: contacts with birthdays today
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    const results = await runScheduledChecks()
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch(e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function runScheduledChecks() {
  const [automations, agents] = await Promise.all([
    supabase.from('automations').select('*').eq('active', true).then(r => r.data || []),
    supabase.from('agents').select('*').eq('active', true).then(r => r.data || []),
  ])

  const results = []

  for (const automation of automations) {
    switch (automation.trigger_type) {

      case 'no_activity': {
        const days = parseInt(automation.trigger_config?.days) || 14
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - days)
        const { data: contacts } = await supabase
          .from('contacts')
          .select('*')
          .lt('last_activity', cutoff.toISOString())
          .neq('status', 'Closed')
          .neq('status', 'Unresponsive')
        if (contacts?.length) {
          for (const contact of contacts) {
            await fireAutomation(automation, {
              contact_id:   contact.id,
              agent_id:     contact.agent_id,
              contact_name: `${contact.first_name} ${contact.last_name || ''}`.trim(),
              first_name:   contact.first_name,
              last_name:    contact.last_name,
              status:       contact.status,
              days:         days,
              trigger_type: 'no_activity',
            }, agents)
          }
          results.push({ trigger: 'no_activity', automation: automation.name, count: contacts.length })
        }
        break
      }

      case 'closing_soon': {
        const days = parseInt(automation.trigger_config?.days) || 7
        const today = new Date().toISOString().slice(0, 10)
        const future = new Date()
        future.setDate(future.getDate() + days)
        const futureStr = future.toISOString().slice(0, 10)
        const { data: deals } = await supabase
          .from('deals')
          .select('*')
          .gte('expected_close_date', today)
          .lte('expected_close_date', futureStr)
          .neq('stage', 'Closed')
          .neq('stage', 'Deal Fell Through')
        if (deals?.length) {
          for (const deal of deals) {
            await fireAutomation(automation, {
              deal_id:     deal.id,
              agent_id:    deal.agent_id,
              addr:        deal.addr,
              stage:       deal.stage,
              gci:         deal.gci,
              close_date:  deal.expected_close_date,
              days:        days,
              trigger_type: 'closing_soon',
            }, agents)
          }
          results.push({ trigger: 'closing_soon', automation: automation.name, count: deals.length })
        }
        break
      }

      case 'task_overdue': {
        const today = new Date().toISOString().slice(0, 10)
        const { data: tasks } = await supabase
          .from('tasks')
          .select('*')
          .lt('due_date', today)
          .neq('status', 'done')
          .neq('status', 'cancelled')
        if (tasks?.length) {
          for (const task of tasks) {
            await fireAutomation(automation, {
              task_id:     task.id,
              agent_id:    task.agent_id,
              title:       task.title,
              due_date:    task.due_date,
              priority:    task.priority,
              trigger_type: 'task_overdue',
            }, agents)
          }
          results.push({ trigger: 'task_overdue', automation: automation.name, count: tasks.length })
        }
        break
      }
    }
  }

  return results
}

async function fireAutomation(automation: any, triggerData: any, agents: any[]) {
  try {
    for (const action of (automation.action_nodes || [])) {
      await executeAction(action, triggerData, agents)
    }
    await supabase.from('automation_runs').insert({
      automation_id:    automation.id,
      trigger_type:     automation.trigger_type,
      trigger_data:     triggerData,
      status:           'success',
      records_affected: automation.action_nodes?.length || 0,
      created_at:       new Date().toISOString(),
    })
    await supabase.from('automations').update({
      fire_count: (automation.fire_count || 0) + 1,
      last_fired: new Date().toISOString(),
    }).eq('id', automation.id)
  } catch(e) {
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      trigger_type:  automation.trigger_type,
      trigger_data:  triggerData,
      status:        'error',
      error:         e.message,
      created_at:    new Date().toISOString(),
    })
  }
}

function interpolate(text: string, ctx: any): string {
  if (!text) return text
  return text.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => ctx[key] ?? '')
}

function resolveAgent(value: string, triggerData: any, agents: any[]): string {
  if (!value || value === 'trigger_agent') return triggerData.agent_id
  if (value?.length === 36) return value
  return triggerData.agent_id
}

async function executeAction(action: any, ctx: any, agents: any[]) {
  const cfg = action.config || {}
  switch (action.type) {

    case 'create_task': {
      const agentId = resolveAgent(cfg.assign_to, ctx, agents)
      const due = new Date()
      due.setDate(due.getDate() + (parseInt(cfg.due_days) || 1))
      await supabase.from('tasks').insert({
        title:      interpolate(cfg.title || 'Follow up', ctx),
        agent_id:   agentId,
        created_by: agentId,
        contact_id: ctx.contact_id || null,
        deal_id:    ctx.deal_id    || null,
        due_date:   due.toISOString().slice(0, 10),
        priority:   cfg.priority || 'normal',
        status:     'pending',
        notes:      interpolate(cfg.notes || '', ctx),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      break
    }

    case 'send_notification': {
      const agentId = resolveAgent(cfg.notify, ctx, agents)
      if (agentId) {
        await supabase.from('notifications').insert({
          agent_id:   agentId,
          title:      interpolate(cfg.title || 'Automation Alert', ctx),
          body:       interpolate(cfg.body || '', ctx),
          type:       'info',
          read:       false,
          created_at: new Date().toISOString(),
        })
      }
      break
    }

    case 'update_contact_status': {
      if (ctx.contact_id) {
        await supabase.from('contacts').update({ status: cfg.status, updated_at: new Date().toISOString() }).eq('id', ctx.contact_id)
      }
      break
    }

    case 'update_deal_stage': {
      if (ctx.deal_id) {
        await supabase.from('deals').update({ stage: cfg.stage, updated_at: new Date().toISOString() }).eq('id', ctx.deal_id)
      }
      break
    }

    case 'add_tag': {
      if (ctx.contact_id && cfg.tag) {
        const { data } = await supabase.from('contacts').select('tags').eq('id', ctx.contact_id).single()
        const tags = data?.tags || []
        if (!tags.includes(cfg.tag)) {
          await supabase.from('contacts').update({ tags: [...tags, cfg.tag] }).eq('id', ctx.contact_id)
        }
      }
      break
    }
  }
}
