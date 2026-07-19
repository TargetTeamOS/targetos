'use strict'
// api/mailchimp-sync.js — pushes contacts into the Mailchimp audience.
// Actions:
//   upsert_contact — { email, first_name, last_name, tags:[] }
//   sync_all       — pushes every contact with an email (batched);
//                    tags each 'TargetOS'. Returns counts.
// Credentials: Admin → Connectors → Mailchimp (API key + Audience ID).

const { getIntegration, mailchimpUpsert, logEvent, sb } = require('./_lib/connectors')

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

module.exports = async function handler(req, res) {
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const integ = await getIntegration('mailchimp')
    const apiKey = ((integ && integ.secrets) || {}).api_key || ''
    const audienceId = ((integ && integ.config) || {}).audience_id || ''
    if (!apiKey || !audienceId) {
      res.status(400).json({ error: 'Mailchimp not configured — save API key + Audience ID in Admin → Connectors' }); return
    }

    const body = await parseBody(req)
    const action = body.action || 'upsert_contact'

    if (action === 'upsert_contact') {
      await mailchimpUpsert(apiKey, audienceId, {
        email: body.email,
        first_name: body.first_name || '',
        last_name: body.last_name || '',
        tags: Array.isArray(body.tags) ? body.tags : ['TargetOS'],
      })
      await logEvent('mailchimp', 'out', 'contact.upsert', { email: body.email }, true)
      res.status(200).json({ ok: true }); return
    }

    if (action === 'sync_all') {
      const { data: contacts, error } = await sb().from('contacts')
        .select('email, first_name, last_name')
        .not('email', 'is', null).neq('email', '')
        .limit(3000)
      if (error) throw new Error(error.message)
      let ok = 0, failed = 0
      const errs = []
      for (const c of contacts || []) {
        try {
          await mailchimpUpsert(apiKey, audienceId, {
            email: c.email, first_name: c.first_name, last_name: c.last_name, tags: ['TargetOS'],
          })
          ok++
        } catch (e) {
          failed++
          if (errs.length < 5) errs.push(c.email + ': ' + e.message)
        }
      }
      await logEvent('mailchimp', 'out', 'sync_all', { ok, failed }, failed === 0)
      res.status(200).json({ ok: true, synced: ok, failed, sample_errors: errs }); return
    }

    res.status(400).json({ error: 'unknown action' })
  } catch (e) {
    console.error('[mailchimp-sync] ' + e.message)
    res.status(500).json({ error: e.message })
  }
}
