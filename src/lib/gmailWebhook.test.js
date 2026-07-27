import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as webhook from '../../api/webhooks/gmail-pubsub.js'
const handler = webhook.default || webhook

function makeRes() {
  return { statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v },
    end(s) { this.body = s || ''; this.ended = true; return this } }
}
async function call(body, { method = 'POST' } = {}) {
  const res = makeRes()
  await handler({ method, headers: {}, body }, res)
  let json = null; try { json = res.body ? JSON.parse(res.body) : null } catch { /* 204 */ }
  return { res, json, status: res.statusCode }
}
// Pub/Sub envelope whose data carries a BOGUS crm_user_id to prove it is ignored.
function push(emailAddress, historyId) {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId, crm_user_id: 'attacker', connection_id: 'attacker-conn' })).toString('base64')
  return { message: { data, messageId: 'pmsg-1' }, subscription: 'sub' }
}

const D = { verify: vi.fn(), store: {}, sync: vi.fn() }
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
  it('decodePush decodes the base64 envelope', () => {
    const p = webhook.decodePush(push('me@team.com', '150'))
    expect(p.emailAddress).toBe('me@team.com'); expect(p.historyId).toBe('150')
  })

  it('fails closed (401) when OIDC verification fails; no sync', async () => {
    D.verify = vi.fn(async () => { throw new Error('bad sig') })
    handler.__setDepsForTests(D)
    const { status } = await call(push('me@team.com', '150'))
    expect(status).toBe(401)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('rejects malformed payloads (400)', async () => {
    const { status } = await call({ message: { messageId: 'x' } }) // no data
    expect(status).toBe(400)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('acks unknown mailbox (204) without syncing', async () => {
    D.store.getConnectionByEmail = vi.fn(async () => null)
    handler.__setDepsForTests(D)
    const { status } = await call(push('nobody@x.com', '150'))
    expect(status).toBe(204)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('ignores duplicate/replayed notifications at or behind the cursor (204)', async () => {
    D.store.loadSyncState = vi.fn(async () => ({ gmail_history_id: '500' }))
    handler.__setDepsForTests(D)
    const { status } = await call(push('me@team.com', '400')) // 400 <= 500
    expect(status).toBe(204)
    expect(D.sync).not.toHaveBeenCalled()
  })

  it('syncs the DB-resolved connection for a new notification (ignores payload ownership)', async () => {
    const { status } = await call(push('me@team.com', '600')) // 600 > 100
    expect(status).toBe(204)
    expect(D.sync).toHaveBeenCalledTimes(1)
    const conn = D.sync.mock.calls[0][0]
    expect(conn.id).toBe('conn-db')            // from DB lookup, not payload
    expect(conn.crm_user_id).toBe('agent-db')  // NOT 'attacker'
  })
})
