import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as store from '../../api/_lib/emailStore.js'
import * as emailCrypto from '../../api/_lib/emailCrypto.js'

// ── tiny fake Supabase query builder driven by a per-test resolver ──
let resolver = () => ({ data: null, error: null })
let captures = []
function makeFakeSb() {
  function build(ctx) {
    const api = {
      select(cols) { ctx.op = ctx.op || 'select'; ctx.cols = cols; return api },
      insert(rows) { ctx.op = 'insert'; ctx.rows = rows; return api },
      upsert(rows, opts) { ctx.op = 'upsert'; ctx.rows = rows; ctx.opts = opts; return api },
      update(patch) { ctx.op = 'update'; ctx.patch = patch; return api },
      eq(k, v) { (ctx.filters = ctx.filters || []).push(['eq', k, v]); return api },
      ilike(k, v) { (ctx.filters = ctx.filters || []).push(['ilike', k, v]); return api },
      or(s) { (ctx.filters = ctx.filters || []).push(['or', s]); return api },
      not(k, o, v) { (ctx.filters = ctx.filters || []).push(['not', k, o, v]); return api },
      order() { return api },
      limit(n) { ctx.limit = n; return api },
      maybeSingle() { ctx.single = true; return api },
      then(res, rej) { captures.push(ctx); Promise.resolve(resolver(ctx)).then(res, rej) },
    }
    return api
  }
  return { from(table) { return build({ table }) } }
}

const KEY = Buffer.alloc(32, 7).toString('base64')
beforeEach(() => {
  vi.stubEnv('EMAIL_TOKEN_ENCRYPTION_KEY', KEY)
  vi.stubEnv('EMAIL_TOKEN_KEY_VERSION', '1')
  captures = []
  resolver = () => ({ data: null, error: null })
  store.__setIO({
    sb: () => makeFakeSb(),
    getAgentAccount: vi.fn(),
    getIntegration: vi.fn(async () => ({ secrets: { client_id: 'cid', client_secret: 'csecret' } })),
    fetchImpl: null,
  })
})
afterEach(() => { vi.unstubAllEnvs() })

describe('emailStore bridge', () => {
  it('does not double-encrypt: decrypted account tokens are encrypted exactly once', async () => {
    store.io.getAgentAccount = vi.fn(async () => ({ id: 'acct-1', agent_id: 'agent-1', provider: 'google',
      account_email: 'me@team.com', status: 'connected', secrets: { access_token: 'AT-plain', refresh_token: 'RT-plain' } }))
    resolver = (ctx) => {
      if (ctx.table === 'email_connections' && ctx.op === 'upsert') return { data: { ...ctx.rows, id: 'conn-1' }, error: null }
      if (ctx.table === 'email_connections' && ctx.op === 'select') return { data: [{ id: 'conn-1', status: 'active', is_primary: false }], error: null }
      return { data: null, error: null }
    }
    const conn = await store.ensureGoogleConnection('agent-1')
    expect(conn.id).toBe('conn-1')
    // single-encrypted → decrypts straight back to the plaintext (not an envelope)
    expect(emailCrypto.decrypt(conn.encrypted_access_token)).toBe('AT-plain')
    expect(emailCrypto.decrypt(conn.encrypted_refresh_token)).toBe('RT-plain')
  })

  it('returns a connection that can immediately be used by freshAccessToken', async () => {
    const conn = {
      id: 'conn-1', crm_user_id: 'agent-1', email_address: 'me@team.com',
      encrypted_access_token: emailCrypto.encrypt('OLD'), encrypted_refresh_token: emailCrypto.encrypt('RT'),
      access_token_expires_at: null,
    }
    store.io.fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'NEW', expires_in: 3600 }) }))
    resolver = () => ({ data: null, error: null }) // update ok
    const tok = await store.freshAccessToken(conn)
    expect(tok).toBe('NEW')
  })

  it('throws (does not ignore) a primary-selection database error', async () => {
    store.io.getAgentAccount = vi.fn(async () => ({ id: 'a', agent_id: 'g', provider: 'google', account_email: 'm@x', status: 'connected', secrets: { access_token: 'AT' } }))
    resolver = (ctx) => {
      if (ctx.op === 'upsert') return { data: { ...ctx.rows, id: 'c1' }, error: null }
      if (ctx.op === 'select') return { data: null, error: { message: 'db down' } } // primary select fails
      return { data: null, error: null }
    }
    await expect(store.ensureGoogleConnection('g')).rejects.toThrow(/primary selection query failed/)
  })

  it('fails closed on ambiguous mailbox ownership', async () => {
    resolver = () => ({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    await expect(store.getConnectionByEmail('me@team.com')).rejects.toThrow(/ambiguous/)
  })
  it('throws (not "not found") on a lookup DB error', async () => {
    resolver = () => ({ data: null, error: { message: 'boom' } })
    await expect(store.getConnectionByEmail('me@team.com')).rejects.toThrow(/lookup failed/)
  })
})

describe('emailStore token refresh', () => {
  const base = () => ({ id: 'c1', encrypted_refresh_token: emailCrypto.encrypt('RT'), access_token_expires_at: null })
  it('times out (aborted fetch) and does not return a token', async () => {
    store.io.fetchImpl = vi.fn(async () => { throw new Error('AbortError') })
    await expect(store.freshAccessToken(base())).rejects.toThrow(/token refresh request failed/)
  })
  it('rejects a response with no access_token', async () => {
    store.io.fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    await expect(store.freshAccessToken(base())).rejects.toThrow(/no access_token/)
  })
  it('persists a rotated refresh token (encrypted)', async () => {
    store.io.fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'A', refresh_token: 'R2', expires_in: 3600 }) }))
    let patch = null
    resolver = (ctx) => { if (ctx.op === 'update') { patch = ctx.patch; } return { data: null, error: null } }
    const tok = await store.freshAccessToken(base())
    expect(tok).toBe('A')
    expect(patch.encrypted_refresh_token).toBeTruthy()
    expect(emailCrypto.decrypt(patch.encrypted_refresh_token)).toBe('R2')
  })
  it('does not return a token when the persistence update fails', async () => {
    store.io.fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: 'A', expires_in: 3600 }) }))
    resolver = (ctx) => { if (ctx.op === 'update') return { data: null, error: { message: 'write failed' } }; return { data: null, error: null } }
    await expect(store.freshAccessToken(base())).rejects.toThrow(/persisting refreshed token failed/)
  })
})

describe('emailStore tracked-thread safety', () => {
  it('fails rather than silently truncating stale-cursor recovery', async () => {
    resolver = () => ({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null })
    await expect(store.listTrackedThreads('c1', 2)).rejects.toThrow(/limit exceeded/)
    const q = captures.find(c => c.table === 'email_threads')
    expect(q.limit).toBe(3)
  })

  it('recovers from a concurrent unique-key thread creation race', async () => {
    let inserts = 0
    resolver = (ctx) => {
      if (ctx.table === 'email_threads' && ctx.op === 'insert') {
        inserts++
        return { data: null, error: { code: '23505', message: 'duplicate' } }
      }
      if (ctx.table === 'email_threads' && ctx.op === 'select') {
        return { data: { id: 'existing-thread', provider_thread_id: 'pt-1' }, error: null }
      }
      return { data: null, error: null }
    }
    const t = await store.createThread({
      connection: { id: 'c1', crm_user_id: 'a1' },
      parsed: { provider_thread_id: 'pt-1', subject: 'x', sent_at: null },
      contactId: null,
    })
    expect(inserts).toBe(1)
    expect(t.id).toBe('existing-thread')
  })
})

describe('emailStore sync lock', () => {
  it('claimSync returns a token when unlocked and null when already locked', async () => {
    // first claim: conditional update returns a row; second: no row (locked)
    let claimCall = 0
    resolver = (ctx) => {
      if (ctx.table === 'email_sync_state' && ctx.op === 'upsert') return { data: null, error: null }
      if (ctx.table === 'email_sync_state' && ctx.op === 'update') { claimCall++; return { data: claimCall === 1 ? [{ connection_id: 'c1' }] : [], error: null } }
      return { data: null, error: null }
    }
    const t1 = await store.claimSync('c1')
    const t2 = await store.claimSync('c1')
    expect(typeof t1).toBe('string'); expect(t1.length).toBeGreaterThan(10)
    expect(t2).toBe(null)
  })
  it('releaseSync only releases rows matching its own lock token', async () => {
    resolver = () => ({ data: null, error: null })
    await store.releaseSync('c1', 'my-token', { watch_status: 'active' })
    const rel = captures.find(c => c.table === 'email_sync_state' && c.op === 'update')
    expect(rel.filters).toEqual(expect.arrayContaining([['eq', 'sync_lock_token', 'my-token']]))
    // it clears only the lock, and does not force watch_status unless asked
    expect(rel.patch.sync_lock_token).toBe(null)
  })
})
