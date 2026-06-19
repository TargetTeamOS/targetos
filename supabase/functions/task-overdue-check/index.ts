import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!
const APP_URL = 'https://app.targetreteam.com'

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const today = new Date().toISOString().split('T')[0]
  const { data: tasks } = await supabase.from('tasks').select('*').eq('status','pending').lt('due_date',today).not('due_date','is',null)
  if(!tasks?.length) return new Response(JSON.stringify({skipped:'none overdue'}))

  const rows = tasks.map(t => {
    const d = Math.floor((Date.now()-new Date(t.due_date).getTime())/86400000)
    return `<tr><td style="padding:12px 16px;border-bottom:1px solid #FEE2E2;background:#FFF5F5;">
      <div style="font-size:13px;font-weight:700;color:#DC2626;">⚠️ ${t.title}</div>
      <div style="font-size:11px;color:#EF4444;margin-top:3px;">${d} day${d>1?'s':''} overdue</div>
      <a href="${APP_URL}/?page=tasks&task=${t.id}" style="display:inline-block;margin-top:6px;background:#DC2626;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:5px 12px;border-radius:6px;">Fix Now →</a>
    </td></tr>`
  }).join('')

  await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{'Authorization':`Bearer ${RESEND_KEY}`,'Content-Type':'application/json'},
    body: JSON.stringify({ from:'TargetOS <office@targetreteam.com>', to:['yanky@targetreteam.com','avraham@targetreteam.com'],
      subject:`⚠️ ${tasks.length} Overdue Task${tasks.length>1?'s':''} — Action Required`,
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;">
        <div style="background:#DC2626;padding:18px 24px;border-radius:12px 12px 0 0;color:#fff;font-size:16px;font-weight:800;">⚠️ Overdue Tasks (${tasks.length})</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #FEE2E2;border-top:none;">${rows}</table>
        <div style="background:#1B2B4B;padding:16px;border-radius:0 0 12px 12px;text-align:center;">
          <a href="${APP_URL}/?page=tasks" style="background:#CC2200;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;">View All Tasks →</a>
        </div></div>`
    })
  })
  return new Response(JSON.stringify({ success:true, overdue:tasks.length }), { headers:{'Content-Type':'application/json'} })
})
