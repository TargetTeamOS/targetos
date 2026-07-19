'use strict'
// api/connectors.js — the ONLY way the app touches the integrations
// table. GET = list (secrets stripped). POST = save creds/settings,
// disconnect, or fetch recent events. Auth-hardened (AUTH_ENFORCE).

const { sb, getIntegration, patchIntegration, baseUrl } = require('./_lib/connectors')

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  try {
    if (req.method === 'GET') {
      const { data, error } = await sb().from('integrations')
        .select('id, name, status, config, last_error, updated_at').order('id')
      if (error) throw new Error(error.message)
      // expose the inbound webhook URL (not the secret) for zapier/apination
      const rows = (data || []).map(r => {
        const out = Object.assign({}, r)
        if (r.id === 'zapier' || r.id === 'apination') {
          out.inbound_url = baseUrl(req) + '/api/webhook-inbound?source=' + r.id
        }
        return out
      })
      res.status(200).json({ integrations: rows })
      return
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
    const body = await parseBody(req)
    const action = body.action || ''
    const id = body.id || ''

    if (action === 'save_credentials') {
      // OAuth apps: client_id is config (visible), client_secret is secret
      const integ = await getIntegration(id)
      if (!integ) { res.status(404).json({ error: 'unknown integration — run sql/connectors.sql first' }); return }
      const config  = Object.assign({}, integ.config || {})
      const secrets = Object.assign({}, integ.secrets || {})
      if (body.client_id !== undefined)     config.client_id = String(body.client_id).trim()
      if (body.send_as !== undefined)       config.send_as = String(body.send_as).trim() // 'self' | 'office'
      if (body.client_secret)               secrets.client_secret = String(body.client_secret).trim()
      if (body.audience_id !== undefined)   config.audience_id = String(body.audience_id).trim()
      if (body.api_key)                     secrets.api_key = String(body.api_key).trim()
      if (body.webhook_url)                 secrets.webhook_url = String(body.webhook_url).trim()
      let ready = config.client_id && secrets.client_secret
      if (id === 'teamchat')  ready = !!secrets.webhook_url
      if (id === 'mailchimp') ready = !!(secrets.api_key && config.audience_id)
      if ((id === 'teamchat' || id === 'mailchimp') && ready) {
        await patchIntegration(id, { config, secrets, status: 'connected', last_error: null })
        res.status(200).json({ ok: true, status: 'connected' })
        return
      }
      await patchIntegration(id, {
        config, secrets,
        status: integ.status === 'connected' ? 'connected' : (ready ? 'needs_connect' : 'not_configured'),
        last_error: null,
      })
      res.status(200).json({ ok: true, status: ready ? 'needs_connect' : 'not_configured' })
      return
    }

    if (action === 'save_display_config') {
      const integ = await getIntegration('display')
      if (!integ) { res.status(404).json({ error: 'run the display SQL first' }); return }
      const config = Object.assign({}, integ.config || {})
      if (body.mode !== undefined)           config.mode = ['dashboard','slides','images','rotate'].includes(body.mode) ? body.mode : 'dashboard'
      if (body.slides_url !== undefined)     config.slides_url = String(body.slides_url).trim()
      if (body.images !== undefined)         config.images = Array.isArray(body.images) ? body.images.map(u => String(u).trim()).filter(Boolean).slice(0, 30) : []
      if (body.rotate_seconds !== undefined) config.rotate_seconds = Math.max(10, Math.min(600, Number(body.rotate_seconds) || 45))
      if (body.popup_seconds !== undefined)  config.popup_seconds = Math.max(5, Math.min(120, Number(body.popup_seconds) || 15))
      if (body.announce_days !== undefined)  config.announce_days = Math.max(1, Math.min(30, Number(body.announce_days) || 3))
      if (body.board_title !== undefined)    config.board_title = String(body.board_title).slice(0, 60)
      if (body.panels !== undefined && typeof body.panels === 'object') config.panels = body.panels
      await patchIntegration('display', { config })
      res.status(200).json({ ok: true, config })
      return
    }

    if (action === 'teamchat_test') {
      const { notifyTeamChat } = require('./_lib/connectors')
      const r = await notifyTeamChat('✅ TargetOS is connected — this is a test notification.')
      if (r.skipped) { res.status(400).json({ error: 'webhook URL not saved yet' }); return }
      res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true } : { error: 'webhook post failed — check the URL' })
      return
    }

    if (action === 'reveal_webhook_secret') {
      // shown once in Admin so Yanky can paste it into Zapier/API Nation
      const integ = await getIntegration(id)
      if (!integ) { res.status(404).json({ error: 'unknown integration' }); return }
      res.status(200).json({ webhook_secret: (integ.secrets || {}).webhook_secret || null })
      return
    }

    if (action === 'disconnect') {
      const integ = await getIntegration(id)
      if (!integ) { res.status(404).json({ error: 'unknown integration' }); return }
      const secrets = Object.assign({}, integ.secrets || {})
      delete secrets.access_token; delete secrets.refresh_token; delete secrets.expires_at
      delete secrets.account_email
      await patchIntegration(id, { secrets, status: secrets.client_secret ? 'needs_connect' : 'not_configured', last_error: null })
      res.status(200).json({ ok: true })
      return
    }

    if (action === 'events') {
      const { data, error } = await sb().from('integration_events')
        .select('*').order('created_at', { ascending: false }).limit(body.limit || 25)
      if (error) throw new Error(error.message)
      res.status(200).json({ events: data || [] })
      return
    }

    if (action === 'my_accounts') {
      const agentId = body.agent_id
      if (!agentId) { res.status(400).json({ error: 'agent_id required' }); return }
      const { data, error } = await sb().from('integration_accounts')
        .select('provider, status, account_email, last_error, updated_at')
        .eq('agent_id', agentId)
      if (error) throw new Error(error.message)
      res.status(200).json({ accounts: data || [] })
      return
    }

    if (action === 'disconnect_my_account') {
      const agentId = body.agent_id
      const provider = body.provider === 'google' ? 'google' : 'outlook'
      if (!agentId) { res.status(400).json({ error: 'agent_id required' }); return }
      const { error } = await sb().from('integration_accounts')
        .delete().eq('agent_id', agentId).eq('provider', provider)
      if (error) throw new Error(error.message)
      res.status(200).json({ ok: true })
      return
    }

    res.status(400).json({ error: 'unknown action' })
  } catch (e) {
    console.error('[connectors] ' + e.message)
    res.status(500).json({ error: e.message })
  }
}
