'use strict'
// api/dashboard-data.js — powers the two new dashboard tiles:
//   • new MLS listings in admin-set watch areas (via mls-search)
//   • new TEAM listings within a custom timeframe
// Also get/save the watch-area settings. Degrades gracefully when MLS
// Grid credentials aren't configured yet (returns configured:false).
// Body: { action: 'counts', days } | { action: 'get_areas' } | { action:'save_areas', areas }

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

    async function getAreas() {
      const { data } = await db.from('system_settings').select('value').eq('key','dashboard_mls_areas').maybeSingle()
      return data && data.value ? data.value : { cities: [], maxprice: null, minbeds: null }
    }

    if (body.action === 'get_areas') {
      res.statusCode = 200; return res.end(JSON.stringify({ areas: await getAreas() }))
    }

    if (body.action === 'save_areas') {
      const areas = {
        cities: Array.isArray(body.areas?.cities) ? body.areas.cities.map(c => String(c).trim()).filter(Boolean).slice(0,20) : [],
        maxprice: body.areas?.maxprice ? Number(body.areas.maxprice) : null,
        minbeds: body.areas?.minbeds ? Number(body.areas.minbeds) : null,
      }
      await db.from('system_settings').upsert({ key: 'dashboard_mls_areas', value: areas, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true, areas }))
    }

    if (body.action === 'counts') {
      const days = Math.max(1, Math.min(90, Number(body.days) || 7))
      const sinceIso = new Date(Date.now() - days*86400000).toISOString()
      const sinceDate = sinceIso.slice(0,10)

      // TEAM new listings (our own DB) — always available
      const { data: teamRows } = await db.from('listings')
        .select('id, addr, city, status, list_price, list_date, created_at')
        .or('list_date.gte.' + sinceDate + ',created_at.gte.' + sinceIso)
        .order('created_at', { ascending: false }).limit(100)
      const teamListings = (teamRows || [])

      // MLS new listings in watch areas — needs MLS Grid creds
      const areas = await getAreas()
      let mls = { configured: false, count: 0, sample: [], cities: areas.cities }
      const TOKEN = process.env.MLSGRID_API_TOKEN
      if (TOKEN && areas.cities && areas.cities.length) {
        mls.configured = true
        try {
          const base = 'https://api.mlsgrid.com/v2'
          const esc = s => String(s).replace(/'/g, "''")
          let total = 0
          const sample = []
          // query up to 3 cities to keep it fast
          for (const city of areas.cities.slice(0,3)) {
            const filters = ["StandardStatus eq 'Active'", 'MlgCanView eq true',
              "City eq '" + esc(city) + "'", 'ModificationTimestamp ge ' + sinceIso]
            if (areas.maxprice) filters.push('ListPrice le ' + Number(areas.maxprice))
            if (areas.minbeds) filters.push('BedroomsTotal ge ' + Number(areas.minbeds))
            const params = new URLSearchParams()
            params.set('$filter', filters.join(' and '))
            params.set('$top', '25'); params.set('$orderby','ModificationTimestamp desc')
            const r = await fetch(base + '/Property?' + params.toString(),
              { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' } })
            if (r.ok) {
              const j = await r.json()
              const recs = Array.isArray(j.value) ? j.value : []
              total += recs.length
              for (const rec of recs.slice(0,5)) sample.push({
                addr: rec.UnparsedAddress || '', city: rec.City || city,
                price: rec.ListPrice || null, beds: rec.BedroomsTotal || null,
              })
            }
          }
          mls.count = total
          mls.sample = sample.slice(0,8)
        } catch (e) { mls.error = e.message }
      }

      res.statusCode = 200
      return res.end(JSON.stringify({
        team: { count: teamListings.length, listings: teamListings.slice(0,10), days },
        mls, days,
      }))
    }

    res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown action' }))
  } catch (e) {
    console.error('[dashboard-data] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
