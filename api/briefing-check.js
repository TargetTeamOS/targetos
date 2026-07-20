'use strict'
// api/briefing-check.js — diagnoses why the daily briefing isn't
// arriving, and can send one on demand. Admin tool. Reports the exact
// state of all four gates the cron requires.
// Body: { action: 'diagnose' | 'send_now', email? }

const { createClient } = require('@supabase/supabase-js')
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sgrnyvdsyahmypibjarx.supabase.co'
function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('service key missing')
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
}
async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch{r({})}}); req.on('error',()=>r({})) })
}

module.exports = async function handler(req, res) {
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user && String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
    res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error:'unauthorized' }))
  }
  res.setHeader('Content-Type','application/json')
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error:'POST only' })) }

  try {
    const body = await parseBody(req)
    const db = sb()

    if (body.action === 'diagnose') {
      const checks = {}
      // 1. env keys
      checks.resend_key = !!process.env.RESEND_API_KEY
      checks.cron_secret_set = !!process.env.CRON_SECRET
      // 2. tables exist?
      try { await db.from('briefing_prefs').select('agent_id').limit(1); checks.briefing_prefs_table = true }
      catch (e) { checks.briefing_prefs_table = false }
      try { await db.from('briefing_sends').select('agent_id').limit(1); checks.briefing_sends_table = true }
      catch (e) { checks.briefing_sends_table = false }
      // 3. who is opted in?
      const { data: prefs } = await db.from('briefing_prefs').select('agent_id, enabled, send_time, agents(name, email)')
      const optedIn = (prefs || []).filter(p => p.enabled === true)
      checks.agents_opted_in = optedIn.length
      checks.opted_in_detail = optedIn.map(p => ({
        name: p.agents ? p.agents.name : p.agent_id,
        email: p.agents ? p.agents.email : null,
        send_time: p.send_time || '07:00',
      }))
      // 4. already sent today? (the sticky-skip trap)
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      try {
        const { data: sentToday } = await db.from('briefing_sends').select('agent_id').eq('sent_date', todayStr)
        checks.sent_today = (sentToday || []).length
      } catch { checks.sent_today = 'table missing' }
      // 5. current slot
      const nowET = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
      checks.current_et_slot = nowET.slice(0,3) + (Number(nowET.slice(3,5)) < 30 ? '00' : '30')

      // verdict
      const problems = []
      if (!checks.resend_key) problems.push('RESEND_API_KEY not set in Vercel → emails cannot send')
      if (!checks.briefing_prefs_table) problems.push('briefing_prefs table missing → run sql/briefing_hardening.sql')
      if (!checks.briefing_sends_table) problems.push('briefing_sends table missing → run sql/briefing_hardening.sql (this also causes permanent skips)')
      if (checks.agents_opted_in === 0) problems.push('No agent has enabled=true in briefing_prefs → toggle the briefing ON and save in the Daily Briefing page')
      res.statusCode = 200
      return res.end(JSON.stringify({ checks, problems, healthy: problems.length === 0 }))
    }

    if (body.action === 'send_now') {
      // fire the cron handler logic directly by calling it with the secret
      const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host)
      const r = await fetch(base + '/api/daily-briefing-cron?force=1', {
        method: 'GET',
        headers: process.env.CRON_SECRET ? { Authorization: 'Bearer ' + process.env.CRON_SECRET } : {},
      })
      const txt = await r.text()
      res.statusCode = 200
      return res.end(JSON.stringify({ triggered: true, cron_response: txt.slice(0, 500) }))
    }

    res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown action' }))
  } catch (e) {
    console.error('[briefing-check] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
