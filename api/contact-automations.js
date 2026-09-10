'use strict'
// api/contact-automations.js — apply/stop automations for ONE contact
// and list what's currently active on them. Uses the service key so it
// works regardless of RLS. Backs the Auto Plans panel on the contact page.
//
// Actions (POST):
//   list   { contact_id }                  → active + available automations
//   apply  { contact_id, automation_id }   → attach + fire it now
//   stop   { contact_id, automation_id }   → mark stopped
//
// UPDATED (Sept 2026, contact-engagement-model follow-up): a shared
// contact can now have more than one agent independently working it
// (see CONTACT_ENGAGEMENT_MODEL_PROPOSAL.md), so "applied" is scoped
// per-agent, not just per-contact -- otherwise two agents applying
// the same automation to the same shared contact would collide on
// one row, and either agent's "stop" could silently kill the other's
// running campaign. The caller's own agent identity is resolved
// server-side from their auth token (never trusted from the request
// body), matching the pattern in api/mls-search.js and
// api/dashboard-pins.js. Requires
// sql/contact_automations_agent_scope.sql to have been run for the
// agent_id column to exist; falls back to the old contact-wide
// behavior if that column isn't there yet (see isMissingAgentColumn).

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

// Postgres "column does not exist" -- means
// sql/contact_automations_agent_scope.sql hasn't been run yet on this
// database. Callers use this to fall back to the pre-migration,
// contact-wide (not agent-scoped) behavior instead of hard-failing.
function isMissingAgentColumn(e) {
  return e && (e.code === '42703' || /column .*agent_id.* does not exist/i.test(e.message || ''))
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

    // Resolve the caller's OWN agent identity server-side from their
    // auth token -- never trust an agent_id the client might send.
    // Anonymous/service callers (no __user, e.g. AUTH_ENFORCE=false in
    // dev) fall through with myAgent = null, same as before this change.
    let myAgent = null
    if (__user) {
      const { data } = await db.from('agents').select('id, role').eq('auth_user_id', __user.id).maybeSingle()
      myAgent = data || null
    }
    const myAgentId  = myAgent?.id || null
    const isManager  = myAgent?.role === 'admin' || myAgent?.role === 'secretary'

    if (action === 'list') {
      let active
      try {
        const r = await db.from('contact_automations')
          .select('id, automation_id, agent_id, status, applied_at, automations(name, trigger_type)')
          .eq('contact_id', contactId).eq('status', 'active').order('applied_at', { ascending: false })
        if (r.error) throw r.error
        active = r.data || []
        // Privacy: a non-manager only sees their own scoped rows, plus
        // any legacy rows with no agent_id (applied before this
        // migration -- treated as contact-wide, not any one agent's
        // private campaign). A manager sees everything on the contact.
        active = active
          .filter(a => isManager || a.agent_id == null || a.agent_id === myAgentId)
          .map(a => ({ ...a, mine: a.agent_id != null && a.agent_id === myAgentId }))
      } catch (e) {
        if (!isMissingAgentColumn(e)) throw e
        // Pre-migration fallback: no agent_id column yet, so there's
        // nothing to scope -- same query and visibility as before.
        const r = await db.from('contact_automations')
          .select('id, automation_id, status, applied_at, automations(name, trigger_type)')
          .eq('contact_id', contactId).eq('status', 'active').order('applied_at', { ascending: false })
        active = (r.data || []).map(a => ({ ...a, mine: true }))
      }
      const { data: available } = await db.from('automations').select('id, name, trigger_type, enabled').eq('enabled', true).order('name')
      res.statusCode = 200
      return res.end(JSON.stringify({ active, available: available || [] }))
    }

    if (action === 'apply') {
      if (!body.automation_id) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'automation_id required' })) }
      try {
        // idempotent per agent: re-activate MY stopped row if I have
        // one, rather than colliding with another agent's row for the
        // same automation on this shared contact.
        const { data: existing, error: exErr } = await db.from('contact_automations')
          .select('id').eq('contact_id', contactId).eq('automation_id', body.automation_id).eq('agent_id', myAgentId).maybeSingle()
        if (exErr) throw exErr
        if (existing) {
          await db.from('contact_automations').update({ status: 'active', applied_at: new Date().toISOString() }).eq('id', existing.id)
        } else {
          const { error: insErr } = await db.from('contact_automations').insert({
            contact_id: contactId, automation_id: body.automation_id, status: 'active', agent_id: myAgentId,
            applied_by: __user ? __user.id : null, applied_at: new Date().toISOString(),
          })
          if (insErr) throw insErr
        }
      } catch (e) {
        if (!isMissingAgentColumn(e)) throw e
        // Pre-migration fallback: original contact-wide idempotent apply.
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
      }
      // log to the contact timeline
      const { data: auto } = await db.from('automations').select('name').eq('id', body.automation_id).maybeSingle()
      await db.from('audit_log').insert({
        table_name: 'contacts', record_id: contactId, action: 'note', field_name: 'automation',
        new_value: 'Automation applied: ' + (auto ? auto.name : body.automation_id),
        metadata: { description: 'Automation applied', type: 'automation' },
        created_at: new Date().toISOString(),
        agent_id: myAgentId,
      })
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true }))
    }

    if (action === 'stop') {
      if (!body.automation_id) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'automation_id required' })) }
      try {
        let q = db.from('contact_automations').update({ status: 'stopped' })
          .eq('contact_id', contactId).eq('automation_id', body.automation_id)
        // Managers can stop any agent's instance on this contact
        // (matches the old, pre-scoping behavior). A regular agent can
        // only stop their OWN instance -- never another agent's
        // running campaign on a contact they happen to share.
        if (!isManager) q = q.eq('agent_id', myAgentId)
        const { error } = await q
        if (error) throw error
      } catch (e) {
        if (!isMissingAgentColumn(e)) throw e
        // Pre-migration fallback: original contact-wide stop.
        await db.from('contact_automations').update({ status: 'stopped' })
          .eq('contact_id', contactId).eq('automation_id', body.automation_id)
      }
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true }))
    }

    res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown action' }))
  } catch (e) {
    console.error('[contact-automations] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
