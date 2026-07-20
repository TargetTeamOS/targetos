'use strict'
// api/agent-activity.js — team-wide per-agent activity metrics.
// Aggregates from calls, contacts, deals, offers, audit_log over a
// date range. Service key so it sees every agent. Admin-only.
// Body: { days: 30 }  → { range, agents: [ {agent, metrics...} ], totals }

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
    const days = Math.max(1, Math.min(365, Number(body.days) || 30))
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const db = sb()

    const [agentsR, callsR, contactsR, dealsR, offersR, auditR] = await Promise.all([
      db.from('agents').select('id, name, color, role, active').eq('active', true),
      db.from('calls').select('agent_id, outcome, direction, duration, called_at').gte('called_at', since).limit(20000),
      db.from('contacts').select('agent_id, status, created_at').gte('created_at', since).limit(20000),
      db.from('deals').select('agent_id, stage, production, created_at, ao_date').gte('created_at', since).limit(20000),
      db.from('offers').select('agent_id, status, created_at').gte('created_at', since).limit(20000),
      db.from('audit_log').select('agent_id, table_name, action, created_at').gte('created_at', since).limit(50000),
    ])

    const agents = (agentsR.data || [])
    const calls = callsR.data || [], contacts = contactsR.data || []
    const deals = dealsR.data || [], offers = offersR.data || [], audit = auditR.data || []
    const num = v => Number(v) || 0

    const ACCEPTED_OFFER = ['AO','Accepted','Closed']
    const CLOSED_DEAL = ['Closed']
    const CONVERTED_CONTACT = ['Client','Closed','Under Contract','Under Shtar']

    const rows = agents.map(a => {
      const aCalls = calls.filter(c => c.agent_id === a.id)
      const talk = aCalls.reduce((s,c)=>s+num(c.duration),0)
      const connected = aCalls.filter(c => c.outcome && !/no answer|voicemail|missed|busy/i.test(c.outcome)).length
      const aContacts = contacts.filter(c => c.agent_id === a.id)
      const converted = aContacts.filter(c => CONVERTED_CONTACT.includes(c.status)).length
      const aDeals = deals.filter(d => d.agent_id === a.id)
      const closed = aDeals.filter(d => CLOSED_DEAL.includes(d.stage))
      const aOffers = offers.filter(o => o.agent_id === a.id)
      const acceptedOffers = aOffers.filter(o => ACCEPTED_OFFER.includes(o.status)).length
      const aAudit = audit.filter(x => x.agent_id === a.id)
      const signIns = aAudit.filter(x => x.action === 'signed_in').length
      const emails = aAudit.filter(x => (x.table_name==='auth'?false:true) && /email/i.test(x.action || '')).length
        + aAudit.filter(x => x.action === 'email_sent').length
      const edits = aAudit.filter(x => x.action === 'updated' || x.action === 'status_changed').length
      const lastActive = aAudit.length ? aAudit.map(x=>x.created_at).sort().slice(-1)[0] : null

      return {
        agent_id: a.id, name: a.name, color: a.color || '#579bfc', role: a.role,
        sign_ins: signIns,
        new_contacts: aContacts.length,
        converted_contacts: converted,
        contact_conv_rate: aContacts.length ? Math.round(converted/aContacts.length*100) : 0,
        new_deals: aDeals.length,
        closed_deals: closed.length,
        production: closed.reduce((s,d)=>s+num(d.production),0),
        calls: aCalls.length,
        calls_connected: connected,
        call_conn_rate: aCalls.length ? Math.round(connected/aCalls.length*100) : 0,
        talk_seconds: talk,
        offers: aOffers.length,
        offers_accepted: acceptedOffers,
        offer_conv_rate: aOffers.length ? Math.round(acceptedOffers/aOffers.length*100) : 0,
        emails_sent: emails,
        edits, // productivity proxy: record edits made
        last_active: lastActive,
      }
    }).sort((a,b)=> b.production - a.production)

    const sum = k => rows.reduce((s,r)=>s+r[k],0)
    const totals = {
      sign_ins: sum('sign_ins'), new_contacts: sum('new_contacts'), converted_contacts: sum('converted_contacts'),
      new_deals: sum('new_deals'), closed_deals: sum('closed_deals'), production: sum('production'),
      calls: sum('calls'), calls_connected: sum('calls_connected'), talk_seconds: sum('talk_seconds'),
      offers: sum('offers'), offers_accepted: sum('offers_accepted'), emails_sent: sum('emails_sent'), edits: sum('edits'),
    }

    res.statusCode = 200
    res.end(JSON.stringify({ range_days: days, since, agents: rows, totals }))
  } catch (e) {
    console.error('[agent-activity] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
