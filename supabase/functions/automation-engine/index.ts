import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const APP = 'https://app.targetreteam.com'

const AGENT_EMAILS: Record<string,string> = {
  'Lazer Farkas':'lazer@targetreteam.com',
  'Mendy Jankovits':'mendy@targetreteam.com',
  'Isaac Leibowitz':'isaac6829490@gmail.com',
  'Yanky Lichtenstein':'yanky@targetreteam.com',
  'Gitty Fogel':'office@targetreteam.com',
  'Joel Rottenstein':'joel@targetreteam.com',
  'Eli Hoffman':'eli@targetreteam.com',
  'Avraham Weinberger':'avraham@targetreteam.com',
}

function interp(str:string, v:Record<string,any>){
  return (str||'').replace(/\{(\w+)\}/g,(_:string,k:string)=>String(v[k]||''))
}

async function sendEmail(to:string|string[], subject:string, html:string){
  const res = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Authorization':`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:'TargetOS <office@targetreteam.com>',
      to:Array.isArray(to)?to:[to],
      subject,
      html
    })
  })
  return res.ok
}

function emailHtml(body:string, title='TargetOS Notification') {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;">
    <div style="background:#1B2B4B;padding:18px 24px;border-radius:12px 12px 0 0;">
      <div style="color:#fff;font-size:16px;font-weight:800;">🔔 ${title}</div>
    </div>
    <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:20px 24px;">
      <p style="font-size:14px;color:#334155;line-height:1.8;margin:0;">${body.replace(/\n/g,'<br/>')}</p>
    </div>
    <div style="background:#1B2B4B;padding:14px 24px;border-radius:0 0 12px 12px;text-align:center;margin-top:1px;">
      <a href="${APP}" style="background:#CC2200;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;">Open TargetOS →</a>
    </div>
  </div>`
}

async function runAction(action:any, ctx:Record<string,any>, supabase:any) {
  const v:Record<string,string> = {
    name:   ctx.first_name ? `${ctx.first_name} ${ctx.last_name||''}`.trim() : (ctx.addr||ctx.title||''),
    first:  ctx.first_name||'',
    last:   ctx.last_name||'',
    phone:  ctx.phone||'',
    email:  ctx.email||'',
    agent:  ctx.agent_name||'',
    addr:   ctx.addr||ctx.address||'',
    price:  ctx.price ? '$'+Number(ctx.price).toLocaleString() : '',
    gci:    ctx.gci   ? '$'+Number(ctx.gci).toLocaleString()   : '',
    stage:  ctx.stage||'',
    status: ctx.status||'',
    source: ctx.source||'',
    type:   ctx._table||'',
  }

  switch(action.type) {

    // ── EMAIL ────────────────────────────────────────────────
    case 'action_email': {
      const to = action.config?.to==='contact'        ? ctx.email
               : action.config?.to==='assigned_agent' ? AGENT_EMAILS[ctx.agent_name]
               : AGENT_EMAILS[action.config?.to]      || action.config?.to
      if(to) await sendEmail(to,
        interp(action.config?.subject||'Message from Target Team', v),
        emailHtml(interp(action.config?.body||'', v), interp(action.config?.subject||'Message', v))
      )
      break
    }

    // ── NOTIFY AGENT ─────────────────────────────────────────
    case 'action_notify_agent': {
      const agentName  = action.config?.to==='assigned_agent' ? ctx.agent_name : action.config?.to
      const agentEmail = AGENT_EMAILS[agentName]
      if(agentEmail) await sendEmail(agentEmail,
        '🔔 TargetOS Alert',
        emailHtml(interp(action.config?.message||'', v), 'TargetOS Notification')
      )
      break
    }

    // ── CREATE TASK ──────────────────────────────────────────
    case 'action_task': {
      const dueDate = (()=>{
        const d = new Date()
        const di = action.config?.dueIn||'same day'
        if(di==='same day') return d.toISOString().split('T')[0]
        if(di==='1 week') { d.setDate(d.getDate()+7); return d.toISOString().split('T')[0] }
        if(di==='2 weeks') { d.setDate(d.getDate()+14); return d.toISOString().split('T')[0] }
        const days = parseInt(di)||1
        d.setDate(d.getDate()+days)
        return d.toISOString().split('T')[0]
      })()
      await supabase.from('tasks').insert([{
        title:    interp(action.config?.title||'Task', v),
        priority: action.config?.priority||'normal',
        status:   'pending',
        due_date: dueDate,
      }])
      break
    }

    // ── CONTACT STATUS ───────────────────────────────────────
    case 'action_contact_status': {
      if(ctx.id && ctx._table==='contacts') {
        await supabase.from('contacts').update({ status: action.config?.status }).eq('id', ctx.id)
      }
      break
    }

    // ── ASSIGN CONTACT ───────────────────────────────────────
    case 'action_assign_contact': {
      if(ctx.id && ctx._table==='contacts') {
        await supabase.from('contacts').update({ agent_name: action.config?.agent }).eq('id', ctx.id)
      }
      break
    }

    // ── TAG CONTACT ──────────────────────────────────────────
    case 'action_tag_contact': {
      if(ctx.id && ctx._table==='contacts') {
        const { data } = await supabase.from('contacts').select('tags').eq('id', ctx.id).single()
        const currentTags: string[] = data?.tags || []
        let newTags: string[]
        if(action.config?.action==='Remove Tag') {
          newTags = currentTags.filter((t:string) => t !== action.config?.tag)
        } else {
          newTags = currentTags.includes(action.config?.tag) ? currentTags : [...currentTags, action.config?.tag]
        }
        await supabase.from('contacts').update({ tags: newTags }).eq('id', ctx.id)
      }
      break
    }

    // ── DEAL STAGE ───────────────────────────────────────────
    case 'action_deal_stage': {
      if(ctx.id && ctx._table==='deals') {
        await supabase.from('deals').update({ stage: action.config?.stage }).eq('id', ctx.id)
      }
      break
    }

    // ── DEAL CTC ─────────────────────────────────────────────
    case 'action_deal_ctc': {
      if(ctx.id && ctx._table==='deals') {
        await supabase.from('deals').update({ ctc: action.config?.ctcStage }).eq('id', ctx.id)
      }
      // Also update transaction if one exists
      if(ctx.addr) {
        await supabase.from('transactions').update({ ctc: action.config?.ctcStage }).eq('addr', ctx.addr)
      }
      break
    }

    // ── LISTING STATUS ───────────────────────────────────────
    case 'action_listing_status': {
      if(ctx.id && ctx._table==='listings') {
        await supabase.from('listings').update({ status: action.config?.status }).eq('id', ctx.id)
      }
      break
    }

    // ── SEND SIGN ────────────────────────────────────────────
    case 'action_send_sign': {
      // Create a task for Gitty to deploy the sign
      await supabase.from('tasks').insert([{
        title:    `Deploy ${action.config?.signType||'sign'} — ${v.addr}`,
        priority: 'high',
        status:   'pending',
        due_date: new Date().toISOString().split('T')[0],
      }])
      // Also log in signs table
      if(v.addr) {
        await supabase.from('signs').insert([{
          addr:       v.addr,
          type:       action.config?.signType==='Under Contract Sent' ? 'Under Contract' : 'Sold',
          agent_name: v.agent,
          installed:  new Date().toISOString().split('T')[0],
        }]).catch(() => {}) // ignore if signs table doesn't exist yet
      }
      // Notify Gitty
      if(AGENT_EMAILS['Gitty Fogel']) {
        await sendEmail(AGENT_EMAILS['Gitty Fogel'],
          `🪧 Sign Request — ${v.addr}`,
          emailHtml(`Please deploy the <strong>${action.config?.signType}</strong> sign at:<br/><br/><strong>${v.addr}</strong><br/><br/>Agent: ${v.agent}`, 'Sign Deployment Request')
        )
      }
      break
    }

    // ── COMMISSION STATUS ────────────────────────────────────
    case 'action_commission_status': {
      if(ctx.id && ctx._table==='deals') {
        await supabase.from('deals').update({
          commission_status: action.config?.status,
          updated_at: new Date().toISOString()
        }).eq('id', ctx.id)
      }
      // Create task for Gitty to chase commission
      if(action.config?.status === 'Working on it') {
        await supabase.from('tasks').insert([{
          title:    `Chase commission — ${v.addr} (${v.agent})`,
          priority: 'high',
          status:   'pending',
          due_date: new Date().toISOString().split('T')[0],
        }])
      }
      break
    }

    // ── ANNOUNCE ─────────────────────────────────────────────
    case 'action_announce': {
      await supabase.from('announcements').insert([{
        title:      interp(action.config?.title||'Announcement', v),
        body:       interp(action.config?.body||'', v),
        type:       'auto',
        agent_name: v.agent||'TargetOS',
      }])
      break
    }

    // ── CELEBRATE ────────────────────────────────────────────
    case 'action_celebrate': {
      const msg = interp(action.config?.message||'🎉 Celebration!', v)
      // Post to announcements
      await supabase.from('announcements').insert([{
        title:      msg,
        body:       msg,
        type:       'celebration',
        agent_name: v.agent||'TargetOS',
        pinned:     true,
      }])
      // Email entire team
      const allEmails = Object.values(AGENT_EMAILS) as string[]
      await sendEmail(allEmails, '🎉 ' + msg,
        `<div style="font-family:Arial,sans-serif;text-align:center;padding:40px 24px;max-width:500px;margin:0 auto;">
          <div style="font-size:56px;margin-bottom:16px;">🎉</div>
          <div style="font-size:22px;font-weight:800;color:#1B2B4B;margin-bottom:12px;">${msg}</div>
          <a href="${APP}" style="background:#CC2200;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9px;font-size:14px;font-weight:700;display:inline-block;margin-top:16px;">Open TargetOS →</a>
          <div style="margin-top:20px;color:#94A3B8;font-size:12px;">Target Team · KW Valley Realty</div>
        </div>`
      )
      break
    }

    // ── WEBHOOK ──────────────────────────────────────────────
    case 'action_webhook': {
      if(action.config?.url) {
        const method = action.config?.method||'POST'
        const body = action.config?.body ? interp(action.config.body, v) : JSON.stringify(v)
        await fetch(action.config.url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method==='POST' ? body : undefined,
        }).catch((e:Error) => console.error('Webhook failed:', e.message))
      }
      break
    }

    default:
      console.log('Unknown action type:', action.type)
  }
}

function checkTrigger(type:string, rec:any, old:any): boolean {
  switch(type) {
    case 'trigger_new_contact':     return !old
    case 'trigger_contact_status':  return old && rec.status !== old.status
    case 'trigger_offer_accepted':  return rec.stage==='Offer Accapted'    && old?.stage!=='Offer Accapted'
    case 'trigger_under_shtar':     return rec.stage==='Under Shtar'       && old?.stage!=='Under Shtar'
    case 'trigger_under_contract':  return rec.stage==='Under Contract'    && old?.stage!=='Under Contract'
    case 'trigger_deal_closed':     return rec.stage==='Closed'            && old?.stage!=='Closed'
    case 'trigger_deal_fell':       return rec.stage==='Deal Fell Through' && old?.stage!=='Deal Fell Through'
    case 'trigger_deal_stage':      return old && rec.stage !== old.stage
    case 'trigger_listing_active':  return rec.status==='Active'           && old?.status!=='Active'
    case 'trigger_listing_ao':      return rec.status==='Accepted offer'   && old?.status!=='Accepted offer'
    case 'trigger_listing_sold':    return rec.status==='Sold'             && old?.status!=='Sold'
    case 'trigger_listing_status':  return old && rec.status !== old.status
    case 'trigger_new_listing':     return !old
    default: return false
  }
}

Deno.serve(async (req:Request) => {
  try {
    const body = await req.json()
    const { type, table, record, old_record } = body

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Load active automations
    const { data: automations } = await supabase
      .from('automations')
      .select('*')
      .eq('active', true)

    if(!automations?.length) {
      return new Response(
        JSON.stringify({ skipped: 'no active automations' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    let fired = 0
    const errors: string[] = []

    for(const auto of automations) {
      const nodes = auto.nodes || []
      const trigger = nodes.find((n:any) => n.type?.startsWith('trigger_'))
      if(!trigger) continue

      if(!checkTrigger(trigger.type, record, old_record)) continue

      // Check trigger config (e.g. specific stage required)
      if(trigger.config?.stage && record.stage !== trigger.config.stage) continue
      if(trigger.config?.status && record.status !== trigger.config.status) continue

      const ctx = { ...record, _table: table }
      const actions = nodes.filter((n:any) => n.type?.startsWith('action_'))

      for(const action of actions) {
        try {
          await runAction(action, ctx, supabase)
          await new Promise(r => setTimeout(r, 100))
        } catch(e:any) {
          errors.push(`${action.type}: ${e.message}`)
          console.error('Action failed:', action.type, e.message)
        }
      }

      // Update fire count
      await supabase.from('automations').update({
        fire_count: (auto.fire_count||0) + 1,
        last_fired: new Date().toISOString(),
      }).eq('id', auto.id)

      fired++
    }

    return new Response(
      JSON.stringify({ success: true, fired, errors }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch(e:any) {
    console.error('Automation engine error:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
