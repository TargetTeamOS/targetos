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
    console.log('[AutomationEngine] Automation fired successfully:', automation.name, '- actions taken:', affected.length)
    try { await supabase.from('automation_runs').insert({
      automation_id:    automation.id,
      trigger_type:     automation.trigger_type,
      trigger_data:     triggerData,
      status:           'success',
      records_affected: affected.length,
      created_at:       new Date().toISOString(),
    }) } catch(logErr) { console.warn('[AutomationEngine] Could not write run log:', logErr.message) }

    // Update fire count
    await supabase.from('automations').update({
      fire_count: (automation.fire_count || 0) + 1,
      last_fired: new Date().toISOString(),
    }).eq('id', automation.id)

    return { success: true }
  } catch(e) {
    console.error('[AutomationEngine] Automation failed:', automation.name, e.message, e)
    try {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        trigger_type:  automation.trigger_type,
        trigger_data:  triggerData,
        status:        'error',
        error:         e.message,
        created_at:    new Date().toISOString(),
      })
    } catch(logErr) {
      console.error('[AutomationEngine] Could not log run (automation_runs table may not exist):', logErr.message)
    }
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

    case 'create_gift': {
      // Creates a Gifts-board entry from the deal: client, property,
      // side, deal type, plus the client's HOME address / homeowner-vs-
      // investor type looked up from Contacts by email/phone when found.
      let homeAddr = '', clientType = ''
      try {
        const em = triggerData.client_email, ph = triggerData.client_phone, nm = (triggerData.client_name || '').trim()
        if (em || ph) {
          let cq = supabase.from('contacts').select('address, type').limit(1)
          cq = em ? cq.eq('email', em) : cq.eq('phone', ph)
          const { data: cRows } = await cq
          if (cRows?.[0]) { homeAddr = cRows[0].address || ''; clientType = cRows[0].type || '' }
        }
        // Last resort: exact full-name match (only if unambiguous)
        if (!homeAddr && nm && nm.includes(' ')) {
          const [first, ...rest] = nm.split(' ')
          const { data: byName } = await supabase.from('contacts').select('address, type')
            .ilike('first_name', first).ilike('last_name', rest.join(' ')).limit(2)
          if (byName?.length === 1) { homeAddr = byName[0].address || ''; clientType = clientType || byName[0].type || '' }
        }
      } catch {}
      await supabase.from('gifts').insert({
        client_name: triggerData.client_name || '',
        address:     homeAddr || triggerData.addr || '',
        phone:       triggerData.client_phone || null,
        deal_id:     triggerData.deal_id || null,
        agent_id:    triggerData.agent_id || null,
        status:      'Pending',
        notes:       interpolate(cfg.notes || 'Property: {{addr}} · Side: {{side}} · Stage: {{stage}}', context)
                     + (clientType ? ' · Client type: ' + clientType : '')
                     + (homeAddr ? '' : ' · (client home address not on file — property address used)'),
        created_at:  new Date().toISOString(), updated_at: new Date().toISOString(),
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

    case 'remove_tag': {
      if (triggerData.contact_id && cfg.tag) {
        const { data: c } = await supabase.from('contacts').select('tags').eq('id', triggerData.contact_id).single()
        const tags = (c?.tags || []).filter(t => t !== cfg.tag)
        await supabase.from('contacts').update({ tags, updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
      }
      break
    }

    case 'notify_all_agents': {
      const { data: allAgents } = await supabase.from('agents').select('id').eq('active', true)
      const notifications = (allAgents || []).map(a => ({
        agent_id:   a.id,
        title:      interpolate(cfg.title || 'Team Notification', context),
        body:       interpolate(cfg.body  || '', context),
        type:       'info',
        read:       false,
        created_at: new Date().toISOString(),
      }))
      if (notifications.length) await supabase.from('notifications').insert(notifications)
      break
    }

    case 'notify_admin': {
      const { data: admins } = await supabase.from('agents').select('id').eq('role', 'admin').eq('active', true)
      const notifications = (admins || []).map(a => ({
        agent_id:   a.id,
        title:      interpolate(cfg.title || 'Admin Alert', context),
        body:       interpolate(cfg.body  || '', context),
        type:       'alert',
        read:       false,
        created_at: new Date().toISOString(),
      }))
      if (notifications.length) await supabase.from('notifications').insert(notifications)
      break
    }

    case 'create_followup': {
      const agentId = resolveAgent(cfg.assign_to, triggerData, agents)
      const due = new Date()
      due.setDate(due.getDate() + (parseInt(cfg.due_days) || 7))
      await supabase.from('tasks').insert({
        title:      interpolate('Follow up with ' + (context.contact_name || 'contact'), context),
        agent_id:   agentId,
        created_by: agentId,
        contact_id: triggerData.contact_id || null,
        deal_id:    triggerData.deal_id    || null,
        due_date:   due.toISOString().slice(0, 10),
        priority:   'normal',
        status:     'pending',
        notes:      interpolate(cfg.notes || '', context),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      break
    }

    case 'set_followup_date': {
      if (triggerData.contact_id) {
        const due = new Date()
        due.setDate(due.getDate() + (parseInt(cfg.days) || 7))
        await supabase.from('contacts').update({ next_followup: due.toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
      }
      break
    }

    case 'log_call': {
      if (triggerData.contact_id && triggerData.agent_id) {
        await supabase.from('calls').insert({
          agent_id:     triggerData.agent_id,
          contact_id:   triggerData.contact_id,
          contact_name: context.contact_name || '',
          direction:    'Outbound',
          outcome:      'Auto-logged',
          notes:        interpolate(cfg.notes || 'Auto-logged call via automation', context),
          called_at:    new Date().toISOString(),
        })
        await supabase.from('contacts').update({ last_reached: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
      }
      break
    }

    case 'create_note': {
      if (triggerData.contact_id && triggerData.agent_id) {
        await supabase.from('audit_log').insert({
          agent_id:   triggerData.agent_id,
          table_name: 'contacts',
          record_id:  triggerData.contact_id,
          action:     'note',
          field_name: 'general',
          new_value:  interpolate(cfg.body || 'Auto-generated note', context),
          metadata:   { description: 'Auto-note from automation', type: 'general' },
          created_at: new Date().toISOString(),
        })
      }
      break
    }

    case 'update_contact_field': {
      if (triggerData.contact_id && cfg.field && cfg.value) {
        await supabase.from('contacts').update({ [cfg.field]: interpolate(cfg.value, context), updated_at: new Date().toISOString() }).eq('id', triggerData.contact_id)
      }
      break
    }

    case 'create_gift': {
      if (triggerData.agent_id) {
        const agentId = resolveAgent(cfg.assign_to, triggerData, agents)
        await supabase.from('gifts').insert({
          agent_id:    agentId,
          client_name: context.contact_name || '',
          description: interpolate(cfg.description || 'Closing gift', context),
          status:      'Pending',
          created_at:  new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        })
      }
      break
    }

    case 'schedule_event': {
      if (triggerData.agent_id) {
        const eventDate = new Date()
        eventDate.setDate(eventDate.getDate() + (parseInt(cfg.days) || 1))
        await supabase.from('calendar_events').insert({
          agent_id:   triggerData.agent_id,
          title:      interpolate(cfg.title || 'Follow-up event', context),
          start_date: eventDate.toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        })
      }
      break
    }

    case 'send_sms': {
      // SMS via Twilio — logs the intent as a call note for now
      // Full Twilio integration requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Vercel env
      const agentId = resolveAgent(cfg.to, triggerData, agents)
      if (agentId) {
        await supabase.from('notifications').insert({
          agent_id:   agentId,
          title:      'SMS Automation (Twilio not yet configured)',
          body:       interpolate(cfg.body || '', context),
          type:       'info',
          read:       false,
          created_at: new Date().toISOString(),
        })
      }
      console.log('[AutomationEngine] SMS action requires Twilio setup — sent as notification instead')
      break
    }

    case 'mark_task_done': {
      if (triggerData.task_id) {
        await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', triggerData.task_id)
      }
      break
    }

    case 'send_webhook': {
      // Pushes trigger data to an external URL — paste a Zapier "Catch
      // Hook" URL (or any endpoint) into cfg.url when building the
      // automation. cfg.payload (optional) is an interpolated message.
      const hookUrl = (cfg.url || '').trim()
      if (!hookUrl || !hookUrl.startsWith('https://')) {
        console.warn('[AutomationEngine] send_webhook skipped — cfg.url missing or not https')
        break
      }
      try {
        await fetch(hookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'TargetOS',
            event: context.trigger_type || 'automation',
            message: interpolate(cfg.payload || '', context),
            data: triggerData,
            sent_at: new Date().toISOString(),
          }),
        })
        console.log('[AutomationEngine] webhook sent → ' + hookUrl.split('/').slice(0, 3).join('/'))
      } catch (e) {
        console.warn('[AutomationEngine] webhook failed: ' + e.message)
      }
      break
    }

    case 'send_email': {
      const agentId = resolveAgent(cfg.to, triggerData, agents)
      const agentRecord = agents.find(a => a.id === agentId)
      // Email source of truth = agents.email (DB, admin-editable).
      // Hardcoded AGENT_EMAIL_MAP removed 7/19/26 after backfill SQL
      // (sql/agent_email_backfill.sql). If an agent row is missing an
      // email, we warn and fall back to office@ (monitored) — fix the
      // agent record in Admin→Users, not here.
      // cfg.to_email: a literal address (interpolated) beats agent
      // resolution — used by system alerts like the stage-change email.
      const literalTo = cfg.to_email ? interpolate(cfg.to_email, context).trim() : ''
      const roleAgent = cfg.to_role ? agents.find(a => a.role === cfg.to_role) : null
      const roleEmail = roleAgent ? (roleAgent.email || '') : ''
      const toEmail = literalTo || roleEmail || agentRecord?.email || 'office@targetreteam.com'
      if (!literalTo && !roleEmail && agentRecord && !agentRecord.email) {
        console.warn(`[automation] agent "${agentRecord.name}" has no email in DB — sent to office@ fallback. Fix in Admin→Users.`)
      }
      const emailSubject = interpolate(cfg.subject || 'TargetOS Automation Alert', context)
      const emailBody    = interpolate(cfg.body    || '', context)
      const emailBodyHtml = emailBody.replace(/\n/g, '<br>')
      const html = '<html><body style="font-family:Inter,Arial,sans-serif;background:#F0F2F5;padding:20px">'
        + '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">'
        + '<div style="background:#1B2B4B;padding:20px 28px"><div style="color:#fff;font-size:18px;font-weight:900">TargetOS</div>'
        + '<div style="color:rgba(255,255,255,.5);font-size:12px">Automation Alert</div></div>'
        + '<div style="padding:24px 28px"><div style="font-size:15px;font-weight:700;color:#0F172A;margin-bottom:10px">' + emailSubject + '</div>'
        + '<div style="font-size:14px;color:#334155;line-height:1.6">' + emailBodyHtml + '</div></div>'
        + '<div style="padding:18px 28px;background:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center">'
        + '<a href="https://app.targetreteam.com" style="background:#CC2200;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Open TargetOS</a>'
        + '<div style="margin-top:10px;font-size:11px;color:#94A3B8">Target Team · KW Valley Realty</div>'
        + '</div></div></body></html>'
      const { data: { session } } = await supabase.auth.getSession()
      const emailRes = await fetch('/api/send-email', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({ from: 'TargetOS <office@targetreteam.com>', to: [toEmail],
          ...(cfg.cc_email ? { cc: interpolate(cfg.cc_email, context).split(',').map(x => x.trim()).filter(Boolean) } : {}),
          subject: emailSubject, html, reply_to: 'yanky@targetreteam.com' }),
      })
      const emailResult = await emailRes.json()
      if (!emailRes.ok) throw new Error('Email failed: ' + (emailResult.error || 'Unknown'))
      console.log('[AutomationEngine] Email sent to', toEmail)
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
  // Role names resolve to the first active agent with that role
  if (['secretary', 'admin', 'agent'].includes(value)) {
    const a = (agents || []).find(x => x.role === value)
    if (a) return a.id
  }
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
