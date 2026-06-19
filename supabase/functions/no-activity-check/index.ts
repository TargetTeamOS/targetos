import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = 'https://app.targetreteam.com'
const AGENT_EMAILS: Record<string,string> = { 'Lazer Farkas':'lazer@targetreteam.com','Mendy Jankovits':'mendy@targetreteam.com','Isaac Leibowitz':'isaac6829490@gmail.com','Yanky Lichtenstein':'yanky@targetreteam.com','Gitty Fogel':'office@targetreteam.com','Joel Rottenstein':'joel@targetreteam.com','Eli Hoffman':'eli@targetreteam.com','Avraham Weinberger':'avraham@targetreteam.com' }

Deno.serve(async () => {
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
    total += (contacts||[]).length
    // Create follow-up tasks for each
    for(const c of (contacts||[])) {
      await supabase.from('tasks').insert([{
        title: `Re-engage ${c.first_name||''} ${c.last_name||''} — no activity ${days} days`,
        priority: 'high', status: 'pending',
        due_date: new Date().toISOString().split('T')[0],
      }])
    }
    await supabase.from('automations').update({ fire_count:(auto.fire_count||0)+1, last_fired:new Date().toISOString() }).eq('id',auto.id)
  }
  return new Response(JSON.stringify({ success: true, contacts_flagged: total }), { headers:{'Content-Type':'application/json'} })
})
