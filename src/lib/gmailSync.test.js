import { describe, it, expect, vi, afterEach } from 'vitest'
import * as gmailSync from '../../api/_lib/gmailSync.js'
const { runIncrementalSync, collectAddedMessageIds, computeDirection } = gmailSync

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const CONN = { id: 'conn-1', crm_user_id: 'agent-1', email_address: 'me@team.com' }

function msgResource(id, opts = {}) {
  return { ok: true, status: 200, json: { id, threadId: opts.threadId || 'thr-1', labelIds: opts.labels || ['INBOX'],
    payload: { mimeType: 'text/plain', body: { data: b64url('reply body') },
      headers: [{ name: 'Message-ID', value: '<' + id + '@x>' }, { name: 'From', value: opts.from || 'jane@buyer.com' }, { name: 'Subject', value: 'Re: Offer' }] } } }
}
function makeStore(over = {}) {
  return Object.assign({
    claimSync: vi.fn(async () => 'lock-1'),
    loadSyncState: vi.fn(async () => ({ gmail_history_id: '100', retry_count: 0 })),
    freshAccessToken: vi.fn(async () => 'access-tok'),
    ownerFor: vi.fn(async () => ({ id: 'agent-1', role: 'agent' })),
    findTrackedThread: vi.fn(async () => ({ id: 'thr-db', contact_id: null })),
    matchContact: vi.fn(async () => null),
    insertMessage: vi.fn(async () => ({ inserted: true, id: 'm-db' })),
    recordDeliveryEvent: vi.fn(async () => {}),
    addSanitizedTimeline: vi.fn(async () => {}),
    releaseSync: vi.fn(async () => {}),
    listTrackedThreads: vi.fn(async () => []),
  }, over)
}
function makeGmail(over = {}) {
  return Object.assign({
    getProfile: vi.fn(async () => ({ ok: true, json: { historyId: '200' } })),
    historyList: vi.fn(async () => ({ ok: true, status: 200, json: { historyId: '150', history: [{ messagesAdded: [{ message: { id: 'gm1' } }] }] } })),
    getMessage: vi.fn(async (t, id) => msgResource(id)),
    getThread: vi.fn(async () => ({ ok: true, json: { messages: [msgResource('recovered-1')] } })),
  }, over)
}
afterEach(() => { vi.unstubAllEnvs() })

describe('pure helpers', () => {
  it('collectAddedMessageIds dedupes preserving order', () => {
    expect(collectAddedMessageIds([{ messagesAdded: [{ message: { id: 'a' } }, { message: { id: 'b' } }] }, { messagesAdded: [{ message: { id: 'b' } }] }])).toEqual(['a', 'b'])
  })
  it('computeDirection: SENT label or self-From is outbound, else inbound', () => {
    expect(computeDirection({ provider_payload_metadata: { label_ids: ['SENT'] }, from_address: 'x@y.com' }, CONN)).toBe('outbound')
    expect(computeDirection({ provider_payload_metadata: { label_ids: ['INBOX'] }, from_address: 'me@team.com' }, CONN)).toBe('outbound')
    expect(computeDirection({ provider_payload_metadata: { label_ids: ['INBOX'] }, from_address: 'jane@buyer.com' }, CONN)).toBe('inbound')
  })
})

describe('runIncrementalSync', () => {
  it('skips when it cannot acquire the lock', async () => {
    const store = makeStore({ claimSync: vi.fn(async () => null) })
    expect(await runIncrementalSync(CONN, { store, gmail: makeGmail() })).toEqual({ skipped: 'locked' })
    expect(store.releaseSync).not.toHaveBeenCalled()
  })

  it('baseline sets cursor from a valid profile historyId (no import)', async () => {
    const store = makeStore({ loadSyncState: vi.fn(async () => ({ gmail_history_id: null })) })
    const gmail = makeGmail()
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.baseline).toBe(true); expect(gmail.getMessage).not.toHaveBeenCalled()
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', 'lock-1', expect.objectContaining({ gmail_history_id: '200' }))
  })

  it('baseline retries (no cursor set) when profile historyId is missing', async () => {
    const store = makeStore({ loadSyncState: vi.fn(async () => ({ gmail_history_id: null })) })
    const gmail = makeGmail({ getProfile: vi.fn(async () => ({ ok: true, json: {} })) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.retryable).toBe(true)
    const patch = store.releaseSync.mock.calls[0][2]
    expect(patch.gmail_history_id).toBeUndefined()
    expect(patch.last_error_code).toBe('baseline_no_history')
  })

  it('baseline retries when getProfile fails', async () => {
    const store = makeStore({ loadSyncState: vi.fn(async () => ({ gmail_history_id: null })) })
    const gmail = makeGmail({ getProfile: vi.fn(async () => ({ ok: false, status: 500 })) })
    expect((await runIncrementalSync(CONN, { store, gmail })).retryable).toBe(true)
  })

  it('stores a tracked inbound reply; owner from connection; advances cursor', async () => {
    const store = makeStore(); const gmail = makeGmail()
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.processed).toBe(1)
    const [threadId, conn, parsed] = store.insertMessage.mock.calls[0]
    expect(threadId).toBe('thr-db'); expect(conn.crm_user_id).toBe('agent-1'); expect(parsed.direction).toBe('inbound')
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', 'lock-1', expect.objectContaining({ gmail_history_id: '150' }))
  })

  it('ignores messages not in a tracked thread (no inbox import)', async () => {
    const store = makeStore({ findTrackedThread: vi.fn(async () => null) })
    const r = await runIncrementalSync(CONN, { store, gmail: makeGmail() })
    expect(r.processed).toBe(0); expect(store.insertMessage).not.toHaveBeenCalled()
  })

  it('is idempotent: a duplicate writes no event/timeline', async () => {
    const store = makeStore({ insertMessage: vi.fn(async () => ({ inserted: false })) })
    const r = await runIncrementalSync(CONN, { store, gmail: makeGmail() })
    expect(r.processed).toBe(0); expect(store.recordDeliveryEvent).not.toHaveBeenCalled(); expect(store.addSanitizedTimeline).not.toHaveBeenCalled()
  })

  it('a SENT message is stored as outbound with no reply-timeline', async () => {
    const store = makeStore()
    const gmail = makeGmail({ getMessage: vi.fn(async (t, id) => msgResource(id, { labels: ['SENT'], from: 'me@team.com' })) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.processed).toBe(1)
    expect(store.insertMessage.mock.calls[0][2].direction).toBe('outbound')
    expect(store.addSanitizedTimeline).not.toHaveBeenCalled()
    expect(store.recordDeliveryEvent).toHaveBeenCalledWith('m-db', expect.objectContaining({ eventType: 'sent' }))
  })

  it('skips a confirmed 404 message but still advances the cursor', async () => {
    const store = makeStore()
    const gmail = makeGmail({ getMessage: vi.fn(async () => ({ ok: false, status: 404 })) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.processed).toBe(0)
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', 'lock-1', expect.objectContaining({ gmail_history_id: '150' }))
  })

  it('retains the cursor and retries on a retriable messages.get failure', async () => {
    const store = makeStore()
    const gmail = makeGmail({ getMessage: vi.fn(async () => ({ ok: false, status: 500 })) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.error).toBeTruthy()
    const patch = store.releaseSync.mock.calls[0][2]
    expect(patch.gmail_history_id).toBeUndefined()           // cursor retained
    expect(patch.retry_count).toBe(1)
  })

  it('retains the cursor when the page limit is hit with more pages pending', async () => {
    vi.stubEnv('GMAIL_SYNC_MAX_PAGES', '2')
    const historyList = vi.fn(async () => ({ ok: true, status: 200, json: { historyId: '150', nextPageToken: 'more', history: [] } }))
    const store = makeStore(); const gmail = makeGmail({ historyList })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.retryable).toBe(true); expect(r.reason).toBe('page_limit')
    const patch = store.releaseSync.mock.calls[0][2]
    expect(patch.gmail_history_id).toBeUndefined()           // old cursor kept
    expect(patch.last_error_code).toBe('page_limit')
  })

  it('does not swallow a history.list 401/5xx (retains cursor, retryable error)', async () => {
    const store = makeStore()
    const gmail = makeGmail({ historyList: vi.fn(async () => ({ ok: false, status: 429 })) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.error).toBeTruthy()
    expect(store.releaseSync.mock.calls[0][2].gmail_history_id).toBeUndefined()
  })

  it('recovers missed replies on a stale cursor via tracked threads only', async () => {
    const store = makeStore({ listTrackedThreads: vi.fn(async () => [{ id: 'thr-1', provider_thread_id: 'pt-1', contact_id: 'c-1' }]) })
    const gmail = makeGmail({ historyList: vi.fn(async () => ({ ok: false, status: 404 })) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.recovered).toBe(true); expect(r.historyId).toBe('200')
    expect(gmail.getThread).toHaveBeenCalledWith('access-tok', 'pt-1', expect.anything())
    expect(gmail.getMessage).not.toHaveBeenCalled()          // inbox never imported
    expect(store.insertMessage).toHaveBeenCalled()           // missed reply recovered
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', 'lock-1', expect.objectContaining({ gmail_history_id: '200' }))
  })

  it('sanitizes errors (no token leakage)', async () => {
    const store = makeStore()
    const gmail = makeGmail({ historyList: vi.fn(async () => { throw new Error('boom Bearer ya29.SUPERSECRET fail') }) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.error).not.toContain('ya29.SUPERSECRET'); expect(r.error).toContain('[redacted]')
  })
})
