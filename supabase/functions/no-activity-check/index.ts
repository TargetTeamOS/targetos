import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = 'https://app.targetreteam.com'
const AGENT_EMAILS: Record<string,string> = { 'Lazer Farkas':'lazer@targetreteam.com','Mendy Jankovits':'mendy@targetreteam.com','Isaac Leibowitz':'isaac6829490@gmail.com','Yanky Lichtenstein':'yanky@targetreteam.com','Gitty Fogel':'office@targetreteam.com','Joel Rottenstein':'joel@targetreteam.com','Eli Hoffman':'eli@targetreteam.com','Avraham Weinberger':'avraham@targetreteam.com' }
// SECURITY (Sept 2026 audit, finding C5): see task-overdue-check for why
// this gate is needed. Same secret, set once with
// `supabase secrets set EDGE_FUNCTIONS_SECRET=...`.
const EDGE_FUNCTIONS_SECRET = Deno.env.get('EDGE_FUNCTIONS_SECRET')

Deno.serve(async (req: Request) => {
  if (!EDGE_FUNCTIONS_SECRET) {
    console.error('[no-activity-check] EDGE_FUNCTIONS_SECRET not set — refusing to run')
    return new Response(JSON.stringify({ error: 'EDGE_FUNCTIONS_SECRET not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }
  if (req.headers.get('authorization') !== `Bearer ${EDGE_FUNCTIONS_SECRET}`) {
    console.warn('[no-activity-check] BLOCKED unauthorized invocation')
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const { data: automations } = await supabase.from('automations').select('*').eq('active', true)
  const noActivityAutos = (automations||[]).filter((a:any) => a.nodes?.some((n:any) => n.type==='trigger_no_activity'))
  if(!noActivityAutos.length) return new Response(JSON.stringify({skipped:'no automations'}))

  let total = 0
  for(const auto of noActivityAutos) {
    const trigger = auto.nodes.find((n:any) => n.type==='trigger_no_activity')
    const days = trigger?.config?.days || 5
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days)
    const { data: contacts } = await supabase.from('contacts').select('*').lt('updated_at', cutoff.toISOString())
    // Create follow-up tasks for each -- but skip any contact that
    // already has an open re-engage task (Sept 2026 audit, finding C5:
    // no dedupe meant every invocation re-inserted a duplicate task per
    // stale contact). Also links the task to the contact/agent, which
    // the previous insert never did.
    for(const c of (contacts||[])) {
      const { data: existing } = await supabase.from('tasks')
        .select('id').eq('contact_id', c.id).eq('status', 'pending')
        .ilike('title', 'Re-engage %').limit(1)
      if (existing && existing.length) continue
      await supabase.from('tasks').insert([{
        title: `Re-engage ${c.first_name||''} ${c.last_name||''} — no activity ${days} days`,
        priority: 'high', status: 'pending',
        due_date: new Date().toISOString().split('T')[0],
        contact_id: c.id, agent_id: c.agent_id || null,
      }])
      total++
    }
    await supabase.from('automations').update({ fire_count:(auto.fire_count||0)+1, last_fired:new Date().toISOString() }).eq('id',auto.id)
  }
  return new Response(JSON.stringify({ success: true, contacts_flagged: total }), { headers:{'Content-Type':'application/json'} })
})
