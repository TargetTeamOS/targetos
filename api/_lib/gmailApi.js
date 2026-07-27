'use strict'
// api/_lib/gmailApi.js — thin Gmail REST adapter. Every call is
// server-side and takes an already-fresh access token (tokens are never
// handled in the browser). Timeouts + bounded pagination are enforced.

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TIMEOUT_MS = Number(process.env.GMAIL_API_TIMEOUT_MS || 10000)

async function gapi(path, { method = 'GET', token, body, fetchImpl } = {}) {
  const f = fetchImpl || fetch
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const r = await f(BASE + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await r.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch (e) { json = null }
    return { ok: r.ok, status: r.status, json }
  } finally { clearTimeout(t) }
}

function watch(token, { topicName, labelIds, fetchImpl } = {}) {
  return gapi('/watch', { method: 'POST', token, fetchImpl,
    body: { topicName, labelIds: labelIds || ['INBOX'], labelFilterAction: 'include' } })
}
function stopWatch(token, { fetchImpl } = {}) {
  return gapi('/stop', { method: 'POST', token, fetchImpl })
}
function getProfile(token, { fetchImpl } = {}) {
  return gapi('/profile', { token, fetchImpl })
}
function historyList(token, { startHistoryId, pageToken, maxResults = 100, fetchImpl } = {}) {
  const qs = new URLSearchParams()
  if (startHistoryId) qs.set('startHistoryId', String(startHistoryId))
  if (pageToken) qs.set('pageToken', pageToken)
  qs.set('historyTypes', 'messageAdded')
  qs.set('maxResults', String(maxResults))
  return gapi('/history?' + qs.toString(), { token, fetchImpl })
}
function getMessage(token, id, { format = 'full', fetchImpl } = {}) {
  return gapi('/messages/' + encodeURIComponent(id) + '?format=' + format, { token, fetchImpl })
}

module.exports = { gapi, watch, stopWatch, getProfile, historyList, getMessage, BASE, TIMEOUT_MS }
