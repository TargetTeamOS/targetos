import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as webhook from '../../api/webhooks/gmail-pubsub.js'
const handler = webhook.default || webhook

function makeRes() {
  return { statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v },
    end(s) { this.body = s || ''; return this } }
}
async function call(body) {
  const res = makeRes(); await handler({ method: 'POST', headers: {}, body }, res)
  let json = null; try { json = res.body ? JSON.parse(res.body) : null } catch {}
  return { res, json, status: res.statusCode }
}
function push(emailAddress, historyId, { url = false } = {}) {
  let data = Buffer.from(JSON.stringify({ emailAddress, historyId, crm_user_id: 'attacker' })).toString('base64')
  if (url) data = data.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') // base64url variant
  return { message: { data, messageId: 'pmsg-1' }, subscription: 'sub' }
}

const D = {}
beforeEach(() => {
  D.verify = vi.fn(async () => ({ email: 'push@sa' }))
  D.sync = vi.fn(async () => ({ processed: 0 }))
  D.store = {
    getConnectionByEmail: vi.fn(async () => ({ id: 'conn-db', crm_user_id: 'agent-db', email_address: 'me@team.com' })),
    loadSyncState: vi.fn(async () => ({ gmail_history_id: '100' })),
  }
  handler.__setDepsForTests(D)
})

describe('gmail-pubsub webhook', () => {
  it('decodePush handles base64 and base64url', () => {
    expect(webhook.decodePush(push('me@team.com', '150')).emailAddress).toBe('me@team.com')
    expect(webhook.decodePush(push('me@team.com', '150', { url: true })).historyId).toBe('150')
  })

  it('fails closed (401) when OIDC verification fails; no sync', async () => {
    D.verify = vi.fn(async () => { throw new Error('bad sig') }); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '150'))).status).toBe(401)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('rejects malformed payloads (400)', async () => {
    expect((await call({ message: { messageId: 'x' } })).status).toBe(400)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('acks unknown mailbox (204), no sync', async () => {
    D.store.getConnectionByEmail = vi.fn(async () => null); handler.__setDepsForTests(D)
    expect((await call(push('nobody@x.com', '150'))).status).toBe(204)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('ignores duplicate/replayed notifications at or behind the cursor (204)', async () => {
    D.store.loadSyncState = vi.fn(async () => ({ gmail_history_id: '500' })); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '400'))).status).toBe(204)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('BigInt-safe: history IDs > Number.MAX_SAFE_INTEGER compare correctly', async () => {
    const big = '900719925474099100' // > 2^53
    D.store.loadSyncState = vi.fn(async () => ({ gmail_history_id: big + '0' })) // cursor bigger
    handler.__setDepsForTests(D)
    // push (smaller) is a duplicate → 204, no sync (Number() would wrongly treat these as equal)
    expect((await call(push('me@team.com', big))).status).toBe(204)
    expect(D.sync).not.toHaveBeenCalled()
    // now a strictly larger push → not a duplicate → sync runs
    D.store.loadSyncState = vi.fn(async () => ({ gmail_history_id: big })); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', big + '1'))).status).toBe(204)
    expect(D.sync).toHaveBeenCalledTimes(1)
  })

  it('syncs the DB-resolved connection (ignores payload ownership) and acks 204', async () => {
    const { status } = await call(push('me@team.com', '600'))
    expect(status).toBe(204)
    const conn = D.sync.mock.calls[0][0]
    expect(conn.id).toBe('conn-db'); expect(conn.crm_user_id).toBe('agent-db')
  })

  it('acks 204 when another worker holds the lock', async () => {
    D.sync = vi.fn(async () => ({ skipped: 'locked' })); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '600'))).status).toBe(204)
  })

  it('returns 503 when the sync result is an error (so Pub/Sub retries)', async () => {
    D.sync = vi.fn(async () => ({ error: 'sync incomplete' })); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '600'))).status).toBe(503)
  })
  it('returns 503 on a retryable sync result', async () => {
    D.sync = vi.fn(async () => ({ retryable: true, reason: 'page_limit' })); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '600'))).status).toBe(503)
  })
  it('returns 503 on a transient connection-lookup DB error', async () => {
    D.store.getConnectionByEmail = vi.fn(async () => { throw new Error('db down') }); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '600'))).status).toBe(503)
  })
  it('returns 503 on a transient sync-state DB error', async () => {
    D.store.loadSyncState = vi.fn(async () => { throw new Error('db down') }); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '600'))).status).toBe(503)
  })
  it('returns 503 when the sync throws', async () => {
    D.sync = vi.fn(async () => { throw new Error('kaboom') }); handler.__setDepsForTests(D)
    expect((await call(push('me@team.com', '600'))).status).toBe(503)
  })
})
