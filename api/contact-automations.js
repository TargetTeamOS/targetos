'use strict'
// api/contact-automations.js — apply/stop automations for ONE contact
// and list what's currently active on them. Uses the service key so it
// works regardless of RLS. Backs the Auto Plans panel on the contact page.
//
// Actions (POST):
//   list   { contact_id }                  → active + available automations
//   apply  { contact_id, automation_id }   → attach + fire it now
//   stop   { contact_id, automation_id }   → mark stopped

const { createClient } = require('@supabase/supabase-js')
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sgrnyvdsyahmypibjarx.supabase.co'

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('service key missing')
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

module.exports = async function handler(req, res) {
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user && String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
  }
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST only' })) }

  try {
    const body = await parseBody(req)
    const action = body.action
    const contactId = body.contact_id
    if (!contactId) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'contact_id required' })) }
    const db = sb()

    if (action === 'list') {
      const [{ data: active }, { data: available }] = await Promise.all([
        db.from('contact_automations')
          .select('id, automation_id, status, applied_at, automations(name, trigger_type)')
          .eq('contact_id', contactId).eq('status', 'active').order('applied_at', { ascending: false }),
        db.from('automations').select('id, name, trigger_type, enabled').eq('enabled', true).order('name'),
      ])
      res.statusCode = 200
      return res.end(JSON.stringify({ active: active || [], available: available || [] }))
    }

    if (action === 'apply') {
      if (!body.automation_id) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'automation_id required' })) }
      // idempotent: re-activate if a stopped row exists
      const { data: existing } = await db.from('contact_automations')
        .select('id').eq('contact_id', contactId).eq('automation_id', body.automation_id).maybeSingle()
      if (existing) {
        await db.from('contact_automations').update({ status: 'active', applied_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await db.from('contact_automations').insert({
          contact_id: contactId, automation_id: body.automation_id, status: 'active',
          applied_by: __user ? __user.id : null, applied_at: new Date().toISOString(),
        })
      }
      // log to the contact timeline
      const { data: auto } = await db.from('automations').select('name').eq('id', body.automation_id).maybeSingle()
      await db.from('audit_log').insert({
        table_name: 'contacts', record_id: contactId, action: 'note', field_name: 'automation',
        new_value: 'Automation applied: ' + (auto ? auto.name : body.automation_id),
        metadata: { description: 'Automation applied', type: 'automation' },
        created_at: new Date().toISOString(),
      })
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true }))
    }

    if (action === 'stop') {
      await db.from('contact_automations').update({ status: 'stopped' })
        .eq('contact_id', contactId).eq('automation_id', body.automation_id)
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true }))
    }

    res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown action' }))
  } catch (e) {
    console.error('[contact-automations] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
