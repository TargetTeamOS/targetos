'use strict'
// api/dashboard-pins.js — save a custom filter from anywhere in the CRM
// onto the dashboard, auto-updating, shareable to selected users.
//   create { title, board, filters, color, shared_with[], shared_all }
//   list                          → pins visible to me, each WITH a live count
//   delete { id }
//   update_share { id, shared_with[], shared_all }
// Live counts are computed server-side on each list call, so pins stay
// current without any stored snapshot.

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

const BOARDS = {
  contacts:  { table: 'contacts',  dateField: 'created_at' },
  deals:     { table: 'deals',     dateField: 'ao_date' },
  listings:  { table: 'listings',  dateField: 'list_date' },
  tasks:     { table: 'tasks',     dateField: 'created_at' },
  offers:    { table: 'offers',    dateField: 'created_at' },
}

function rangeFrom(id) {
  if (!id || id === 'all') return null
  const now = new Date(), today = now.toISOString().slice(0,10)
  if (id === 'today') return { from: today, to: today }
  if (id === 'week')  { const d=new Date(now); d.setDate(d.getDate()-7); return { from:d.toISOString().slice(0,10), to:today } }
  if (id === 'month') { const d=new Date(now); d.setMonth(d.getMonth()-1); return { from:d.toISOString().slice(0,10), to:today } }
  if (id === 'year')  return { from: now.getFullYear()+'-01-01', to: today }
  if (/^\d{4}$/.test(id)) return { from: id+'-01-01', to: id+'-12-31' }
  if (id.startsWith('custom:')) { const [,f,t]=id.split(':'); return f&&t?{from:f,to:t}:null }
  return null
}

async function liveCount(db, board, filters) {
  const def = BOARDS[board]; if (!def) return null
  let q = db.from(def.table).select('id', { count: 'exact', head: true })
  const f = filters || {}
  if (f.status) q = q.eq('status', f.status)
  if (f.stage) q = q.eq('stage', f.stage)
  if (f.source) q = q.eq('source', f.source)
  if (f.agent_id) q = q.eq('agent_id', f.agent_id)
  if (f.priority) q = q.eq('priority', f.priority)
  const r = rangeFrom(f.dateRange)
  if (r) q = q.gte(def.dateField, r.from).lte(def.dateField, r.to)
  const { count, error } = await q
  if (error) return null
  return count || 0
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
    // resolve my agent id
    let myId = null
    if (__user) { const { data } = await db.from('agents').select('id').eq('auth_user_id', __user.id).maybeSingle(); myId = data?.id || null }

    if (body.action === 'create') {
      if (!body.title || !body.board) { res.statusCode = 400; return res.end(JSON.stringify({ error:'title + board required' })) }
      const { data, error } = await db.from('dashboard_pins').insert({
        owner_id: myId, title: String(body.title).slice(0,60), board: body.board,
        filters: body.filters || {}, color: body.color || '#2563EB',
        shared_with: Array.isArray(body.shared_with) ? body.shared_with : [],
        shared_all: !!body.shared_all,
      }).select('id').single()
      if (error) throw new Error(error.message)
      res.statusCode = 200; return res.end(JSON.stringify({ ok:true, id:data.id }))
    }

    if (body.action === 'list') {
      // pins I own OR shared to me OR shared_all
      const { data: pins, error } = await db.from('dashboard_pins')
        .select('*').order('position').order('created_at')
      if (error) throw new Error(error.message)
      const visible = (pins||[]).filter(p =>
        p.owner_id === myId || p.shared_all || (Array.isArray(p.shared_with) && myId && p.shared_with.includes(myId)))
      const withCounts = await Promise.all(visible.map(async p => ({
        id: p.id, title: p.title, board: p.board, filters: p.filters, color: p.color,
        owner_id: p.owner_id, mine: p.owner_id === myId,
        shared_all: p.shared_all, shared_with: p.shared_with || [],
        count: await liveCount(db, p.board, p.filters),
      })))
      res.statusCode = 200; return res.end(JSON.stringify({ pins: withCounts }))
    }

    if (body.action === 'delete') {
      await db.from('dashboard_pins').delete().eq('id', body.id).eq('owner_id', myId)
      res.statusCode = 200; return res.end(JSON.stringify({ ok:true }))
    }

    if (body.action === 'update_share') {
      await db.from('dashboard_pins').update({
        shared_with: Array.isArray(body.shared_with) ? body.shared_with : [],
        shared_all: !!body.shared_all, updated_at: new Date().toISOString(),
      }).eq('id', body.id).eq('owner_id', myId)
      res.statusCode = 200; return res.end(JSON.stringify({ ok:true }))
    }

    res.statusCode = 400; res.end(JSON.stringify({ error:'unknown action' }))
  } catch (e) {
    console.error('[dashboard-pins] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
