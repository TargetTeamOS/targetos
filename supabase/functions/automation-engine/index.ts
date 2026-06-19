// ═══════════════════════════════════════════════════════════════
// SUPABASE EDGE FUNCTION: automation-engine
// Triggered by database webhooks when records change
// Evaluates which automations should fire and executes actions
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const APP_URL = 'https://app.targetreteam.com'

const AGENT_EMAILS: Record<string, string> = {
  'Lazer Farkas':      'lazer@targetreteam.com',
  'Mendy Jankovits':   'mendy@targetreteam.com',
  'Isaac Leibowitz':   'isaac6829490@gmail.com',
  'Yanky Lichtenstein':'yanky@targetreteam.com',
  'Gitty Fogel':       'office@targetreteam.com',
  'Joel Rottenstein':  'joel@targetreteam.com',
  'Eli Hoffman':       'eli@targetreteam.com',
  'Avraham Weinberger':'avraham@targetreteam.com',
}

async function sendEmail(to: string|string[], subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'TargetOS <office@targetreteam.com>', to: Array.isArray(to)?to:[to], subject, html }),
  })
}

function interpolate(template: string, vars: Record<string, any>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '')
}

async function executeAction(action: any, context: Record<string, any>, supabase: any) {
  const vars = {
    name: context.name || '',
    first: context.first || '',
    phone: context.phone || '',
    email: context.email || '',
    agent: context.agent_name || '',
    addr: context.addr || context.address || '',
    price: context.price ? '$'+Number(context.price).toLocaleString() : '',
    gci: context.gci ? '$'+Number(context.gci).toLocaleString() : '',
    stage: context.stage || '',
    ...context
  }

  switch(action.type) {
    case 'action_email': {
      const toEmail = action.config?.to === 'contact' ? context.email
        : action.config?.to === 'assigned_agent' ? AGENT_EMAILS[context.agent_name]
        : AGENT_EMAILS[action.config?.to] || action.config?.to
      if(toEmail) {
        await sendEmail(toEmail,
          interpolate(action.config?.subject || 'Message from Target Team', vars),
          `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px;margin:0 auto;">
            <p style="font-size:15px;color:#334155;line-height:1.8;">${interpolate(action.config?.body||'', vars).replace(/\n/g,'<br/>')}</p>
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;">
              Target Team · KW Valley Realty · 845.424.1014<br/>
              <a href="${APP_URL}" style="color:#CC2200;">app.targetreteam.com</a>
            </div>
          </div>`
        )
      }
      break
    }

    case 'action_notify_agent': {
      const agentName = action.config?.to === 'assigned_agent' ? context.agent_name : action.config?.to
      const agentEmail = AGENT_EMAILS[agentName]
      if(agentEmail) {
        await sendEmail(agentEmail,
          '🔔 TargetOS Alert',
          `<div style="font-family:Arial,sans-serif;padding:24px;max-width:560px;margin:0 auto;background:#F8FAFC;border-radius:12px;">
            <div style="font-size:16px;font-weight:700;color:#1E293B;margin-bottom:12px;">🔔 TargetOS Notification</div>
            <p style="font-size:14px;color:#334155;line-height:1.7;">${interpolate(action.config?.message||'', vars)}</p>
            <div style="margin-top:16px;"><a href="${APP_URL}" style="background:#CC2200;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;">Open TargetOS →</a></div>
          </div>`
        )
      }
      break
    }

    case 'action_task': {
      const dueDate = (() => {
        const d = new Date()
        const di = action.config?.dueIn || 'same day'
        if(di === 'same day') return d.toISOString().split('T')[0]
        const days = parseInt(di) || 1
        d.setDate(d.getDate() + days)
        return d.toISOString().split('T')[0]
      })()
      await supabase.from('tasks').insert([{
        title: interpolate(action.config?.title || 'Task', vars),
        priority: action.config?.priority || 'normal',
        status: 'pending',
        due_date: dueDate,
      }])
      break
    }

    case 'action_contact_status': {
      if(context.contact_id) {
        await supabase.from('contacts').update({ status: action.config?.status }).eq('id', context.contact_id)
      }
      break
    }

    case 'action_deal_stage': {
      if(context.deal_id) {
        await supabase.from('deals').update({ stage: action.config?.stage }).eq('id', context.deal_id)
      }
      break
    }

    case 'action_listing_status': {
      if(context.listing_id) {
        await supabase.from('listings').update({ status: action.config?.status }).eq('id', context.listing_id)
      }
      break
    }

    case 'action_announce': {
      await supabase.from('announcements').insert([{
        title: interpolate(action.config?.title || 'Announcement', vars),
        body: interpolate(action.config?.body || '', vars),
        type: 'auto',
        agent_name: context.agent_name || 'TargetOS',
      }])
      break
    }

    case 'action_celebrate': {
      // Post celebration announcement
      await supabase.from('announcements').insert([{
        title: '🎉 ' + interpolate(action.config?.message || 'Celebration!', vars),
        body: interpolate(action.config?.message || '', vars),
        type: 'celebration',
        agent_name: context.agent_name || 'TargetOS',
        pinned: true,
      }])
      // Also email the whole team
      const teamEmails = Object.values(AGENT_EMAILS)
      await sendEmail(teamEmails,
        '🎉 ' + interpolate(action.config?.message || 'Team Celebration!', vars),
        `<div style="font-family:Arial,sans-serif;text-align:center;padding:40px 24px;max-width:500px;margin:0 auto;">
          <div style="font-size:56px;margin-bottom:16px;">🎉</div>
          <div style="font-size:22px;font-weight:800;color:#1B2B4B;margin-bottom:12px;">${interpolate(action.config?.message||'Celebration!', vars)}</div>
          <a href="${APP_URL}" style="background:#CC2200;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9px;font-size:14px;font-weight:700;display:inline-block;margin-top:16px;">Open TargetOS →</a>
        </div>`
      )
      break
    }
  }
}

async function evaluateTrigger(triggerType: string, record: any, oldRecord: any): Promise<boolean> {
  switch(triggerType) {
    case 'trigger_new_contact':
      return !oldRecord // INSERT
    case 'trigger_contact_status':
      return oldRecord && record.status !== oldRecord.status
    case 'trigger_offer_accepted':
      return record.stage === 'Offer Accapted' && oldRecord?.stage !== 'Offer Accapted'
    case 'trigger_under_shtar':
      return record.stage === 'Under Shtar' && oldRecord?.stage !== 'Under Shtar'
    case 'trigger_under_contract':
      return record.stage === 'Under Contract' && oldRecord?.stage !== 'Under Contract'
    case 'trigger_deal_closed':
      return record.stage === 'Closed' && oldRecord?.stage !== 'Closed'
    case 'trigger_deal_fell':
      return record.stage === 'Deal Fell Through' && oldRecord?.stage !== 'Deal Fell Through'
    case 'trigger_deal_stage':
      return oldRecord && record.stage !== oldRecord.stage
    case 'trigger_listing_active':
      return record.status === 'Active' && oldRecord?.status !== 'Active'
    case 'trigger_listing_ao':
      return record.status === 'Accepted offer' && oldRecord?.status !== 'Accepted offer'
    case 'trigger_listing_sold':
      return record.status === 'Sold' && oldRecord?.status !== 'Sold'
    case 'trigger_listing_status':
      return oldRecord && record.status !== oldRecord.status
    case 'trigger_new_listing':
      return !oldRecord
    default:
      return false
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const { type, table, record, old_record } = body

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Load all active automations
    const { data: automations } = await supabase
      .from('automations')
      .select('*')
      .eq('active', true)

    if (!automations?.length) {
      return new Response(JSON.stringify({ skipped: 'no active automations' }), { headers: { 'Content-Type': 'application/json' } })
    }

    let fired = 0

    for (const auto of automations) {
      const nodes = auto.nodes || []
      const trigger = nodes.find((n: any) => n.type?.startsWith('trigger_'))
      if (!trigger) continue

      // Check if this automation's trigger matches the event
      const shouldFire = await evaluateTrigger(trigger.type, record, old_record)
      if (!shouldFire) continue

      // Build context from the record
      const context: Record<string, any> = {
        ...record,
        contact_id: table === 'contacts' ? record.id : record.contact_id,
        deal_id: table === 'deals' ? record.id : null,
        listing_id: table === 'listings' ? record.id : null,
        name: record.first_name ? `${record.first_name} ${record.last_name || ''}`.trim() : record.addr || record.title || '',
        first: record.first_name || '',
        agent_name: record.agent_name || '',
      }

      // Execute all action nodes in order
      const actionNodes = nodes.filter((n: any) => n.type?.startsWith('action_'))
      for (const action of actionNodes) {
        await executeAction(action, context, supabase)
        await new Promise(r => setTimeout(r, 100))
      }

      // Update fire count and last_fired
      await supabase.from('automations').update({
        fire_count: (auto.fire_count || 0) + 1,
        last_fired: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', auto.id)

      fired++
    }

    return new Response(JSON.stringify({ success: true, automations_fired: fired }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Automation engine error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
