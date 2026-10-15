'use strict'
// api/calendar-push.js — mirrors a TargetOS calendar event into the
// agent's connected external calendar (Outlook first, else Google;
// org-level office account as final fallback). Fire-and-forget from
// the Calendar page: a failure here never blocks the in-app save.
// Body: { agent_id?, title, start_date, start_time?, end_date?,
//         end_time?, all_day?, location?, description? }
// Times are treated as America/New_York.

const { getIntegration, freshMicrosoftToken, freshGoogleToken, logEvent,
        getAgentAccount, freshAccountToken } = require('./_lib/connectors')
const { requireAnyAgent, requireAdminOrSecretary } = require('./_lib/phone')

const TZ = 'America/New_York'

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

function buildTimes(b) {
  const startDate = String(b.start_date || '').slice(0, 10)
  if (!startDate) throw new Error('start_date required (YYYY-MM-DD)')
  const endDate = String(b.end_date || '').slice(0, 10) || startDate
  const allDay = !!b.all_day || !b.start_time
  if (allDay) {
    // all-day: end date is exclusive for both providers
    const d = new Date(endDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
    return { allDay: true, start: startDate, end: d.toISOString().slice(0, 10) }
  }
  const startTime = String(b.start_time).slice(0, 5)
  let endTime = b.end_time ? String(b.end_time).slice(0, 5) : ''
  if (!endTime) {
    // default 1 hour
    const [h, m] = startTime.split(':').map(Number)
    endTime = String((h + 1) % 24).padStart(2, '0') + ':' + String(m).padStart(2, '0')
  }
  return {
    allDay: false,
    start: startDate + 'T' + startTime + ':00',
    end: endDate + 'T' + endTime + ':00',
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  // SECURITY (Oct 2026 hardening, task #41): this used to only be gated
  // by a staged, log-only requireUser/AUTH_ENFORCE check -- part of a
  // ~20-endpoint cluster found to fail open whenever AUTH_ENFORCE isn't
  // explicitly set to 'true' in Vercel. Now hard-gated unconditionally
  // (any authenticated agent; the agent_id-override check just below
  // still separately requires admin/secretary).
  const baseAuth = await requireAnyAgent(req)
  if (!baseAuth.ok) { res.status(baseAuth.status).json({ error: baseAuth.message }); return }

  try {
    const body = await parseBody(req)
    const title = String(body.title || '').trim()
    if (!title) { res.status(400).json({ error: 'title required' }); return }
    const t = buildTimes(body)

    // SECURITY (Oct 2026 hardening): body.agent_id used to be trusted
    // outright. Unlike connector-send.js/sheets-export.js, there IS a
    // legitimate reason a request names a DIFFERENT agent here --
    // Calendar.jsx lets an admin/secretary assign an event to another
    // agent (the "Agent" dropdown, itself gated client-side by
    // isAdmin||canManage), and that assignment is meant to sync to
    // the assigned agent's own calendar. But nothing on the server
    // checked the caller actually had that role, so anyone could push
    // arbitrary events onto ANY other agent's real external calendar.
    // Now a non-self agent_id is only honored when the caller is
    // verified admin/secretary; otherwise it's silently ignored in
    // favor of the caller's own id (fire-and-forget, so this degrades
    // rather than errors).
    const ownAgentId = baseAuth.agentId
    let agentId = ownAgentId
    if (body.agent_id && body.agent_id !== ownAgentId) {
      const authCheck = await requireAdminOrSecretary(req)
      if (authCheck.ok) agentId = body.agent_id
      else console.warn('[calendar-push] ignoring agent_id override — caller is not admin/secretary')
    }

    // pick a destination: agent outlook → agent google → office outlook → office google
    let provider = null, token = null, account = ''
    if (agentId) {
      const ms = await getAgentAccount(agentId, 'outlook')
      if (ms && ms.status === 'connected') { provider = 'outlook'; token = await freshAccountToken('outlook', ms); account = ms.account_email || '' }
      if (!token) {
        const gg = await getAgentAccount(agentId, 'google')
        if (gg && gg.status === 'connected') { provider = 'google'; token = await freshAccountToken('google', gg); account = gg.account_email || '' }
      }
    }
    if (!token) {
      const ms = await getIntegration('outlook')
      if (ms && ms.status === 'connected') { provider = 'outlook'; token = await freshMicrosoftToken(ms); account = (ms.secrets || {}).account_email || '' }
    }
    if (!token) {
      const gg = await getIntegration('google')
      if (gg && gg.status === 'connected') { provider = 'google'; token = await freshGoogleToken(gg); account = (gg.secrets || {}).account_email || '' }
    }
    if (!token) { res.status(200).json({ ok: false, skipped: true, reason: 'no calendar account connected' }); return }

    if (provider === 'outlook') {
      const payload = {
        subject: title,
        body: { contentType: 'Text', content: String(body.description || '') },
        location: body.location ? { displayName: String(body.location) } : undefined,
        isAllDay: t.allDay,
        start: { dateTime: t.allDay ? t.start + 'T00:00:00' : t.start, timeZone: TZ },
        end:   { dateTime: t.allDay ? t.end   + 'T00:00:00' : t.end,   timeZone: TZ },
      }
      const r = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const errText = await r.text()
        await logEvent('outlook', 'out', 'calendar.push', { title, error: errText.slice(0, 300) }, false)
        res.status(502).json({ error: 'Outlook calendar push failed: ' + errText.slice(0, 200) }); return
      }
      const j = await r.json()
      await logEvent('outlook', 'out', 'calendar.push', { title, account }, true)
      res.status(200).json({ ok: true, provider, account, link: j.webLink || null }); return
    }

    // google
    const payload = {
      summary: title,
      description: String(body.description || ''),
      location: String(body.location || '') || undefined,
      start: t.allDay ? { date: t.start } : { dateTime: t.start, timeZone: TZ },
      end:   t.allDay ? { date: t.end }   : { dateTime: t.end,   timeZone: TZ },
    }
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const errText = await r.text()
      await logEvent('google', 'out', 'calendar.push', { title, error: errText.slice(0, 300) }, false)
      res.status(502).json({ error: 'Google calendar push failed: ' + errText.slice(0, 200) }); return
    }
    const j = await r.json()
    await logEvent('google', 'out', 'calendar.push', { title, account }, true)
    res.status(200).json({ ok: true, provider, account, link: j.htmlLink || null })
  } catch (e) {
    console.error('[calendar-push] ' + e.message)
    res.status(500).json({ error: e.message })
  }
}
