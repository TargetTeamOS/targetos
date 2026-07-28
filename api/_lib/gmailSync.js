'use strict'
// api/_lib/gmailSync.js — incremental Gmail history sync for ONE connection.
// Concurrency-guarded (lock token), idempotent, tracked-thread-only. Never
// advances the cursor unless every page and every retrievable message in the
// batch was processed successfully. Dependencies are injectable for tests.

const emailStore = require('./emailStore')
const gmailApi = require('./gmailApi')
const { parseGmailMessage } = require('./gmailParse')

function nowIso() { return new Date().toISOString() }
function isDecimalString(s) { return s != null && /^\d+$/.test(String(s)) }
function maxPages() { const v = Number(process.env.GMAIL_SYNC_MAX_PAGES); return (Number.isFinite(v) && v >= 1 && v <= 50) ? v : 10 }
function maxRecoveryThreads() { const v = Number(process.env.GMAIL_RECOVERY_MAX_THREADS); return (Number.isFinite(v) && v >= 1 && v <= 1000) ? v : 200 }

function sanitize(msg) {
  return String(msg == null ? '' : msg)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|client_secret|id_token)"?\s*[:=]\s*"?[A-Za-z0-9._~+/=-]+/gi, '$1=[redacted]')
    .replace(/enc:v\d+:[A-Za-z0-9+/=]+/g, '[enc]')
    .slice(0, 200)
}

// PURE: unique messageAdded ids (order preserved).
function collectAddedMessageIds(history) {
  const ids = []; const seen = new Set()
  for (const h of (history || [])) for (const ma of (h.messagesAdded || [])) {
    const id = ma && ma.message && ma.message.id
    if (id && !seen.has(id)) { seen.add(id); ids.push(id) }
  }
  return ids
}

// PURE: direction from Gmail labels / mailbox ownership.
function computeDirection(parsed, connection) {
  const labels = (parsed.provider_payload_metadata && parsed.provider_payload_metadata.label_ids) || []
  const mailbox = String((connection && connection.email_address) || '').toLowerCase()
  if ((Array.isArray(labels) && labels.includes('SENT')) ||
      (parsed.from_address && mailbox && parsed.from_address === mailbox)) return 'outbound'
  return 'inbound'
}

async function storeParsedIntoThread(store, connection, owner, thread, parsed) {
  const direction = computeDirection(parsed, connection)
  parsed.direction = direction
  parsed.received_at = direction === 'inbound' ? parsed.sent_at : null
  let contactId = thread.contact_id || null
  if (!contactId && direction === 'inbound') contactId = await store.matchContact(parsed.from_address, owner)
  const ins = await store.insertMessage(thread.id, connection, parsed, contactId)
  if (ins.inserted) {
    await store.recordDeliveryEvent(ins.id, { eventType: direction === 'inbound' ? 'received' : 'sent', status: 'ok' })
    // No "reply received" note for outbound messages.
    if (direction === 'inbound' && contactId) await store.addSanitizedTimeline(contactId, { subject: parsed.subject, fromAddress: parsed.from_address })
  }
  return ins.inserted
}

// Bounded tracked-thread recovery for a stale/invalid history cursor. Loads
// only existing tracked CRM threads, fetches them via threads.get, persists
// unseen messages idempotently, and only THEN advances to the profile
// historyId. Never imports the general inbox. Throws (→ retain state) on any
// tracked-thread fetch failure.
async function recoverTrackedThreads(ctx) {
  const { connection, token, store, gmail, fetchImpl, lockToken, state } = ctx
  const owner = await store.ownerFor(connection)
  const threads = await store.listTrackedThreads(connection.id, maxRecoveryThreads())
  for (const th of threads) {
    if (!th.provider_thread_id) continue
    const gt = await gmail.getThread(token, th.provider_thread_id, { fetchImpl })
    if (!gt.ok || !gt.json) throw new Error('threads.get failed during recovery status ' + (gt && gt.status))
    for (const m of (gt.json.messages || [])) {
      const parsed = parseGmailMessage(m, 'inbound')
      await storeParsedIntoThread(store, connection, owner, th, parsed)
    }
  }
  const prof = await gmail.getProfile(token, { fetchImpl })
  const hid = prof && prof.ok && prof.json ? prof.json.historyId : null
  if (!prof.ok || !isDecimalString(hid)) {
    await store.releaseSync(connection.id, lockToken, { last_error_code: 'recovery_no_history', last_error_at: nowIso(), retry_count: ((state && state.retry_count) || 0) + 1 })
    return { retryable: true, reason: 'recovery_profile' }
  }
  await store.releaseSync(connection.id, lockToken, { gmail_history_id: hid, watch_status: 'active', last_successful_sync_at: nowIso(), retry_count: 0, last_error_code: null })
  return { recovered: true, historyId: hid, threads: threads.length }
}

async function runIncrementalSync(connection, deps = {}) {
  const store = deps.store || emailStore
  const gmail = deps.gmail || gmailApi
  const fetchImpl = deps.fetchImpl

  const lockToken = await store.claimSync(connection.id)
  if (!lockToken) return { skipped: 'locked' }

  let state = null
  try {
    state = await store.loadSyncState(connection.id)
    const cursor = state && state.gmail_history_id
    const token = await store.freshAccessToken(connection, { fetchImpl })
    const owner = await store.ownerFor(connection)

    // Establish a baseline only from a valid, non-empty profile historyId.
    if (!cursor) {
      const prof = await gmail.getProfile(token, { fetchImpl })
      const hid = prof && prof.ok && prof.json ? prof.json.historyId : null
      if (!prof.ok || !isDecimalString(hid)) {
        await store.releaseSync(connection.id, lockToken, { last_error_code: 'baseline_no_history', last_error_at: nowIso(), retry_count: ((state && state.retry_count) || 0) + 1 })
        return { retryable: true, reason: 'baseline' }
      }
      await store.releaseSync(connection.id, lockToken, { provider: 'google', gmail_history_id: hid, watch_status: 'active', last_successful_sync_at: nowIso(), retry_count: 0, last_notification_at: nowIso() })
      return { baseline: true, historyId: hid }
    }

    let pageToken = null, pages = 0, newest = cursor, processed = 0
    while (true) {
      const resp = await gmail.historyList(token, { startHistoryId: cursor, pageToken, fetchImpl })
      if (resp.status === 404) return await recoverTrackedThreads({ connection, token, store, gmail, fetchImpl, lockToken, state })
      if (!resp.ok) throw new Error('history.list failed status ' + resp.status) // 401/429/5xx → retain
      const h = resp.json || {}
      if (isDecimalString(h.historyId)) newest = String(h.historyId)

      for (const mid of collectAddedMessageIds(h.history)) {
        const got = await gmail.getMessage(token, mid, { fetchImpl })
        if (got.status === 404) continue                     // confirmed gone → skip
        if (!got.ok) throw new Error('messages.get failed status ' + got.status) // retain cursor
        if (!got.json) throw new Error('messages.get returned no body')
        const parsed = parseGmailMessage(got.json, 'inbound')
        const thread = await store.findTrackedThread(connection.id, parsed)
        if (!thread) continue                                 // not tracked → no inbox import
        if (await storeParsedIntoThread(store, connection, owner, thread, parsed)) processed++
      }

      pageToken = h.nextPageToken
      pages++
      if (!pageToken) break
      if (pages >= maxPages()) {
        // More pages remain but the page budget is exhausted: retain the OLD
        // cursor and mark retryable so the next run resumes.
        await store.releaseSync(connection.id, lockToken, { last_error_code: 'page_limit', last_error_at: nowIso(), retry_count: ((state && state.retry_count) || 0) + 1 })
        return { retryable: true, reason: 'page_limit', processed }
      }
    }

    // Advance ONLY after all pages and messages processed successfully.
    await store.releaseSync(connection.id, lockToken, { gmail_history_id: newest, watch_status: 'active', last_successful_sync_at: nowIso(), retry_count: 0, last_error_code: null })
    return { processed, historyId: newest, pages }
  } catch (e) {
    const st = state || await store.loadSyncState(connection.id).catch(() => null)
    await store.releaseSync(connection.id, lockToken, { last_error_code: 'sync_error', last_error_at: nowIso(), retry_count: ((st && st.retry_count) || 0) + 1 }).catch(() => {})
    return { error: sanitize(e.message) }
  }
}

module.exports = { collectAddedMessageIds, computeDirection, runIncrementalSync, recoverTrackedThreads, sanitize, nowIso, isDecimalString }
