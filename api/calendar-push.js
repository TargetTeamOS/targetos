'use strict'
// api/calendar-push.js — mirrors a TargetOS calendar event into the
// agent's connected external calendar (Outlook first, else Google;
// org-level office account as final fallback). Fire-and-forget from
// the Calendar page: a failure here never blocks the in-app save.
// Body: { agent_id?, title, start_date, start_time?, end_date?,
//         end_time?, all_day?, location?, description? }
// Times are treated as America/New_York.

const { getIntegration, freshMicrosoftToken, freshGoogleToken, logEvent,
        getAgentAccount, freshAccountToken, agentIdFromAuthUser } = require('./_lib/connectors')

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
    const body = await parseBody(req)
    const title = String(body.title || '').trim()
    if (!title) { res.status(400).json({ error: 'title required' }); return }
    const t = buildTimes(body)

    let agentId = body.agent_id || null
    if (!agentId && __user) agentId = await agentIdFromAuthUser(__user.id)

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
