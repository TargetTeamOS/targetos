// TargetOS V2 — Web Activity Tracker
// Called from the public website when a contact views a page/listing.
// URL: POST /api/track-activity
// Body: { email?, phone?, action, page, metadata }
// This logs activity to the contact timeline so agents can see
// when a lead is browsing listings or returning to the site.
'use strict'

const { getSupabase, phoneVariants } = require('./_lib/phone')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' })

  let body = {}
  try {
    const raw = await new Promise((ok,err) => { let d=''; req.on('data',c=>{d+=c}); req.on('end',()=>ok(d)); req.on('error',err) })
    body = JSON.parse(raw || '{}')
  } catch { body = req.body || {} }

  const { email, phone, action = 'page_view', page, metadata = {} } = body
  if (!action) return res.status(400).json({ error: 'action required' })

  const sb = getSupabase()
  if (!sb) return res.status(200).json({ ok: true }) // Fail silently

  try {
    // Identify contact by email or phone
    let contact = null
    if (email || phone) {
      let q = sb.from('contacts').select('id,agent_id')
      let skip = false
      if (email) q = q.eq('email', email)
      else {
        const variants = phoneVariants(phone)
        if (!variants.length) skip = true
        else q = q.or(variants.map(v => 'phone.ilike.%' + v + '%').join(','))
      }
      if (!skip) {
        const { data } = await q.maybeSingle()
        contact = data
      }
    }

    // Log the activity
    const activityData = {
      action:     'web_activity',
      field_name: action,
      new_value:  page || action,
      metadata: {
        type:        'web_activity',
        description: action.replace(/_/g,' ') + (page ? ': ' + page : ''),
        page,
        action,
        ip:          req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        user_agent:  req.headers['user-agent'],
        referrer:    req.headers['referer'],
        ...metadata,
      },
      created_at: new Date().toISOString(),
    }

    if (contact?.id) {
      // Known contact — log to their timeline
      await sb.from('audit_log').insert({
        ...activityData,
        table_name: 'contacts',
        record_id:  contact.id,
        agent_id:   contact.agent_id || null,
        action:     'note',
      })
    } else {
      // Anonymous — store in web_activity table for lead matching later
      await sb.from('web_activity').insert({
        email:    email || null,
        phone:    phone || null,
        action,
        page:     page || null,
        metadata: activityData.metadata,
        ip:       activityData.metadata.ip,
        created_at: new Date().toISOString(),
      }).catch(() => {}) // Table may not exist yet
    }

    return res.status(200).json({ ok: true, identified: !!contact })
  } catch(e) {
    console.warn('track-activity error:', e.message)
    return res.status(200).json({ ok: true }) // Always return 200 to not break website
  }
}
