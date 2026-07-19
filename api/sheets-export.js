'use strict'
// api/sheets-export.js — creates a Google Sheet from rows and returns
// its URL. Used for commission reports, contact exports, etc.
// Body: { title, headers?: [..], rows: [[..],[..]], agent_id? }
// Uses the requesting agent's Google account if connected, else the
// office Google account.

const { getIntegration, freshGoogleToken, logEvent,
        getAgentAccount, freshAccountToken, agentIdFromAuthUser } = require('./_lib/connectors')

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
    const body = await parseBody(req)
    const title = String(body.title || '').trim() || 'TargetOS Export'
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!rows.length) { res.status(400).json({ error: 'rows required (array of arrays)' }); return }
    const values = []
    if (Array.isArray(body.headers) && body.headers.length) values.push(body.headers)
    for (const r of rows.slice(0, 5000)) values.push(Array.isArray(r) ? r : [String(r)])

    let agentId = body.agent_id || null
    if (!agentId && __user) agentId = await agentIdFromAuthUser(__user.id)

    let token = null
    if (agentId) {
      const acct = await getAgentAccount(agentId, 'google')
      if (acct && acct.status === 'connected') token = await freshAccountToken('google', acct)
    }
    if (!token) {
      const integ = await getIntegration('google')
      if (!integ || integ.status !== 'connected') { res.status(400).json({ error: 'Google is not connected — connect in Settings → Email Accounts or Admin → Connectors' }); return }
      token = await freshGoogleToken(integ)
    }

    // 1) create the spreadsheet
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { title } }),
    })
    if (!createRes.ok) {
      const errText = await createRes.text()
      res.status(502).json({ error: 'Sheet create failed: ' + errText.slice(0, 200) }); return
    }
    const sheet = await createRes.json()

    // 2) write the data
    const writeRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + sheet.spreadsheetId + '/values/A1?valueInputOption=USER_ENTERED', {
      method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    })
    if (!writeRes.ok) {
      const errText = await writeRes.text()
      res.status(502).json({ error: 'Sheet write failed: ' + errText.slice(0, 200), url: sheet.spreadsheetUrl }); return
    }

    await logEvent('google', 'out', 'sheets.export', { title, rows: values.length }, true)
    res.status(200).json({ ok: true, url: sheet.spreadsheetUrl, rows: values.length })
  } catch (e) {
    console.error('[sheets-export] ' + e.message)
    res.status(500).json({ error: e.message })
  }
}
