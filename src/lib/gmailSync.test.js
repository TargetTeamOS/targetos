import { describe, it, expect, vi } from 'vitest'
import * as gmailSync from '../../api/_lib/gmailSync.js'
const { runIncrementalSync, collectAddedMessageIds } = gmailSync

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const CONN = { id: 'conn-1', crm_user_id: 'agent-1' }

function makeStore(over = {}) {
  return Object.assign({
    claimSync: vi.fn(async () => true),
    loadSyncState: vi.fn(async () => ({ gmail_history_id: '100', retry_count: 0 })),
    freshAccessToken: vi.fn(async () => 'access-tok'),
    ownerFor: vi.fn(async () => ({ id: 'agent-1', role: 'agent' })),
    findThreadByProviderThreadId: vi.fn(async () => ({ id: 'thr-db', contact_id: null })),
    matchContact: vi.fn(async () => null),
    insertMessage: vi.fn(async () => ({ inserted: true, id: 'm-db' })),
    recordDeliveryEvent: vi.fn(async () => {}),
    addSanitizedTimeline: vi.fn(async () => {}),
    releaseSync: vi.fn(async () => {}),
    upsertSyncState: vi.fn(async () => {}),
  }, over)
}
function msgResource(id, threadId) {
  return { ok: true, json: { id, threadId: threadId || 'thr-1', payload: { mimeType: 'text/plain', body: { data: b64url('reply body') },
    headers: [{ name: 'Message-ID', value: '<r-' + id + '@x>' }, { name: 'From', value: 'jane@buyer.com' }, { name: 'Subject', value: 'Re: Offer' }] } } }
}
function makeGmail(over = {}) {
  return Object.assign({
    getProfile: vi.fn(async () => ({ ok: true, json: { historyId: '200', emailAddress: 'me@team.com' } })),
    historyList: vi.fn(async () => ({ ok: true, status: 200, json: { historyId: '150', history: [{ messagesAdded: [{ message: { id: 'gm1' } }] }] } })),
    getMessage: vi.fn(async (t, id) => msgResource(id)),
  }, over)
}

describe('gmailSync.collectAddedMessageIds', () => {
  it('dedupes message ids preserving order', () => {
    const ids = collectAddedMessageIds([
      { messagesAdded: [{ message: { id: 'a' } }, { message: { id: 'b' } }] },
      { messagesAdded: [{ message: { id: 'b' } }, { message: { id: 'c' } }] },
    ])
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})

describe('runIncrementalSync', () => {
  it('skips when it cannot claim the lock (concurrency guard)', async () => {
    const store = makeStore({ claimSync: vi.fn(async () => false) })
    const r = await runIncrementalSync(CONN, { store, gmail: makeGmail() })
    expect(r).toEqual({ skipped: 'locked' })
    expect(store.releaseSync).not.toHaveBeenCalled()
  })

  it('establishes a baseline (no import) when there is no cursor', async () => {
    const store = makeStore({ loadSyncState: vi.fn(async () => ({ gmail_history_id: null })) })
    const gmail = makeGmail()
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.baseline).toBe(true); expect(r.historyId).toBe('200')
    expect(gmail.getMessage).not.toHaveBeenCalled()
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', expect.objectContaining({ gmail_history_id: '200' }))
  })

  it('stores a reply that belongs to a tracked thread, owner from connection', async () => {
    const store = makeStore()
    const gmail = makeGmail()
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.processed).toBe(1)
    // owner comes from the DB connection, not the payload
    const args = store.insertMessage.mock.calls[0]
    expect(args[1].crm_user_id).toBe('agent-1')
    expect(args[2].direction).toBe('inbound')
    expect(store.recordDeliveryEvent).toHaveBeenCalledTimes(1)
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', expect.objectContaining({ gmail_history_id: '150' }))
  })

  it('ignores messages that are NOT part of a tracked thread (no inbox import)', async () => {
    const store = makeStore({ findThreadByProviderThreadId: vi.fn(async () => null) })
    const r = await runIncrementalSync(CONN, { store, gmail: makeGmail() })
    expect(r.processed).toBe(0)
    expect(store.insertMessage).not.toHaveBeenCalled()
  })

  it('is idempotent: a duplicate message writes no event/timeline', async () => {
    const store = makeStore({ insertMessage: vi.fn(async () => ({ inserted: false })) })
    const r = await runIncrementalSync(CONN, { store, gmail: makeGmail() })
    expect(r.processed).toBe(0)
    expect(store.recordDeliveryEvent).not.toHaveBeenCalled()
    expect(store.addSanitizedTimeline).not.toHaveBeenCalled()
  })

  it('recovers from a stale/invalid history cursor without importing', async () => {
    const gmail = makeGmail({ historyList: vi.fn(async () => ({ ok: false, status: 404 })) })
    const store = makeStore()
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.recovered).toBe(true); expect(r.historyId).toBe('200')
    expect(gmail.getMessage).not.toHaveBeenCalled()
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', expect.objectContaining({ gmail_history_id: '200' }))
  })

  it('follows pagination across pages', async () => {
    const historyList = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: { historyId: '150', nextPageToken: 'p2', history: [{ messagesAdded: [{ message: { id: 'gm1' } }] }] } })
      .mockResolvedValueOnce({ ok: true, status: 200, json: { historyId: '160', history: [{ messagesAdded: [{ message: { id: 'gm2' } }] }] } })
    const store = makeStore()
    const gmail = makeGmail({ historyList, getMessage: vi.fn(async (t, id) => msgResource(id)) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.processed).toBe(2); expect(r.pages).toBe(2)
    expect(store.releaseSync).toHaveBeenCalledWith('conn-1', expect.objectContaining({ gmail_history_id: '160' }))
  })

  it('links an unambiguous contact and adds a sanitized timeline entry', async () => {
    const store = makeStore({ matchContact: vi.fn(async () => 'contact-9') })
    const r = await runIncrementalSync(CONN, { store, gmail: makeGmail() })
    expect(r.processed).toBe(1)
    expect(store.addSanitizedTimeline).toHaveBeenCalledWith('contact-9', expect.objectContaining({ fromAddress: 'jane@buyer.com' }))
  })

  it('sanitizes errors and bumps retry_count without advancing the cursor', async () => {
    const store = makeStore()
    const gmail = makeGmail({ historyList: vi.fn(async () => { throw new Error('network Bearer ya29.SUPERSECRETTOKEN fail') }) })
    const r = await runIncrementalSync(CONN, { store, gmail })
    expect(r.error).not.toContain('ya29.SUPERSECRETTOKEN')
    expect(r.error).toContain('[redacted]')
    const rel = store.releaseSync.mock.calls[0][1]
    expect(rel.retry_count).toBe(1)
    expect(rel.gmail_history_id).toBeUndefined() // cursor not advanced on error
  })
})
