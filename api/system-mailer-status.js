'use strict'
// api/system-mailer-status.js — admin-visible status for the Microsoft
// system mailbox. Returns configuration health + recent delivery counts.
// NEVER returns tenant/client id, secret, or tokens. Admin only.

const { requireUser } = require('./_lib/auth')
const { getAgentForUser } = require('./_lib/connectors')
const systemMailer = require('./_lib/systemMailer')

function json(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }

const deps = { requireUser, getAgentForUser, systemMailer }

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
  const user = await deps.requireUser(req)
  if (!user) return json(res, 401, { error: 'unauthorized' })
  const agent = await deps.getAgentForUser(user.id)
  if (!agent || agent.role !== 'admin') return json(res, 403, { error: 'admin only' })
  try {
    const s = await deps.systemMailer.status() // { configured, mailbox, recent } — no secrets
    return json(res, 200, s)
  } catch (e) {
    return json(res, 500, { error: 'status unavailable' })
  }
}

module.exports = handler
module.exports.__setDepsForTests = (d) => { Object.assign(deps, d) }
