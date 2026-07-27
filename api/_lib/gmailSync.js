'use strict'
// api/_lib/gmailSync.js — incremental history sync for ONE connection.
// Concurrency-guarded, idempotent, tracked-thread-only. Dependencies are
// injectable (store, gmail, fetchImpl) so the flow is unit-testable without
// live Google or Supabase.

const emailStore = require('./emailStore')
const gmailApi = require('./gmailApi')
const { parseGmailMessage } = require('./gmailParse')

function nowIso() { return new Date().toISOString() }

function sanitize(msg) {
  return String(msg == null ? '' : msg)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|client_secret|id_token)"?\s*[:=]\s*"?[A-Za-z0-9._~+/=-]+/gi, '$1=[redacted]')
    .replace(/enc:v\d+:[A-Za-z0-9+/=]+/g, '[enc]')
    .slice(0, 200)
}

// PURE: collect unique messageAdded ids from a history.list response's
// history[] array (order preserved, de-duplicated).
function collectAddedMessageIds(history) {
  const ids = []
  const seen = new Set()
  for (const h of (history || [])) {
    for (const ma of (h.messagesAdded || [])) {
      const id = ma && ma.message && ma.message.id
      if (id && !seen.has(id)) { seen.add(id); ids.push(id) }
    }
  }
  return ids
}

async function runIncrementalSync(connection, deps = {}) {
  const store = deps.store || emailStore
  const gmail = deps.gmail || gmailApi
  const fetchImpl = deps.fetchImpl
  const maxPages = deps.maxPages || Number(process.env.GMAIL_SYNC_MAX_PAGES || 10)

  const claimed = await store.claimSync(connection.id)
  if (!claimed) return { skipped: 'locked' }

  try {
    const state = await store.loadSyncState(connection.id)
    const startHistoryId = state && state.gmail_history_id
    const token = await store.freshAccessToken(connection, { fetchImpl })

    // No cursor yet → establish a baseline from the mailbox's current
    // historyId. We deliberately do NOT import history before activation.
    if (!startHistoryId) {
      const prof = await gmail.getProfile(token, { fetchImpl })
      const hid = prof.ok && prof.json ? prof.json.historyId : null
      await store.releaseSync(connection.id, {
        provider: 'google', gmail_history_id: hid, watch_status: 'active',
        last_successful_sync_at: nowIso(), retry_count: 0, last_notification_at: nowIso(),
      })
      return { baseline: true, historyId: hid }
    }

    const owner = await store.ownerFor(connection)
    let pageToken = null, pages = 0, newest = startHistoryId, processed = 0

    do {
      const resp = await gmail.historyList(token, { startHistoryId, pageToken, fetchImpl })
      if (resp.status === 404) {
        // Stale/invalid cursor → re-baseline from profile (no full import).
        const prof = await gmail.getProfile(token, { fetchImpl })
        const hid = prof.ok && prof.json ? prof.json.historyId : null
        await store.releaseSync(connection.id, {
          gmail_history_id: hid, watch_status: 'active', retry_count: 0,
          last_successful_sync_at: nowIso(),
        })
        return { recovered: true, historyId: hid }
      }
      if (!resp.ok) throw new Error('history.list failed status ' + resp.status)
      const h = resp.json || {}
      if (h.historyId) newest = h.historyId

      for (const mid of collectAddedMessageIds(h.history)) {
        const got = await gmail.getMessage(token, mid, { fetchImpl })
        if (!got.ok || !got.json) continue
        const parsed = parseGmailMessage(got.json, 'inbound')

        // Persist ONLY replies that belong to a tracked CRM thread.
        const thread = await store.findThreadByProviderThreadId(connection.id, parsed.provider_thread_id)
        if (!thread) continue

        let contactId = thread.contact_id || null
        if (!contactId) contactId = await store.matchContact(parsed.from_address, owner)

        const ins = await store.insertMessage(thread.id, connection, parsed, contactId)
        if (ins.inserted) {
          await store.recordDeliveryEvent(ins.id, { eventType: 'received', status: 'ok' })
          if (contactId) await store.addSanitizedTimeline(contactId, { subject: parsed.subject, fromAddress: parsed.from_address })
          processed++
        }
      }
      pageToken = h.nextPageToken
      pages++
    } while (pageToken && pages < maxPages)

    // Advance the cursor ONLY after successful processing.
    await store.releaseSync(connection.id, {
      gmail_history_id: newest, watch_status: 'active',
      last_successful_sync_at: nowIso(), retry_count: 0, last_error_code: null,
    })
    return { processed, historyId: newest, pages }
  } catch (e) {
    const state = await store.loadSyncState(connection.id).catch(() => null)
    await store.releaseSync(connection.id, {
      watch_status: 'active', last_error_code: 'sync_error',
      last_error_at: nowIso(), retry_count: ((state && state.retry_count) || 0) + 1,
    }).catch(() => {})
    return { error: sanitize(e.message) }
  }
}

module.exports = { collectAddedMessageIds, runIncrementalSync, sanitize, nowIso }
