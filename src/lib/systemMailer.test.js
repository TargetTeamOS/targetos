import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as sm from '../../api/_lib/systemMailer.js'

const CONFIG = { tenantId: 'tid', clientId: 'cid', clientSecret: 'csecret', mailbox: 'targetos@targetreteam.com' }
const noSleep = () => Promise.resolve()

let db, finalizeFailTimes, rpcOverride
function fakeSb() {
  return {
    rpc(name, args) {
      if (rpcOverride !== undefined) return Promise.resolve(rpcOverride)
      if (name !== 'claim_system_email') return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
      const k = args.p_key, tok = args.p_token, now = Date.now(), ttl = (args.p_ttl_seconds || 300) * 1000
      const row = db.get(k)
      if (!row) { db.set(k, { status: 'pending', claim_token: tok, claim_until: now + ttl, attempts: 0 }); return Promise.resolve({ data: 'claimed', error: null }) }
      if (row.status === 'sent') return Promise.resolve({ data: 'duplicate', error: null })
      if (row.claim_until && row.claim_until > now) return Promise.resolve({ data: 'in_progress', error: null })
      row.claim_token = tok; row.claim_until = now + ttl; row.status = 'pending'
      return Promise.resolve({ data: 'claimed', error: null })
    },
    from() {
      const b = {
        _flt: {}, _op: null, _patch: null,
        update(p) { this._op = 'update'; this._patch = p; return this },
        select() { this._op = this._op || 'select'; return this },
        eq(k, v) { this._flt[k] = v; return this },
        limit() { return this },
        then(res) {
          if (this._op === 'update') {
            const isFinalize = this._patch && this._patch.status !== undefined // finalize sets status; metadata does not
            if (isFinalize && finalizeFailTimes > 0) { finalizeFailTimes--; return res({ data: null, error: { message: 'write failed' } }) }
            const k = this._flt.idempotency_key, tok = this._flt.claim_token, row = db.get(k)
            if (row && row.claim_token === tok) { Object.assign(row, this._patch); return res({ data: [{ idempotency_key: k }], error: null }) }
            return res({ data: [], error: null }) // stale/lost claim → 0 rows
          }
          return res({ data: Array.from(db.values()).map(r => ({ status: r.status })), error: null })
        },
      }
      return b
    },
  }
}
function graphOnly(fn) {
  return vi.fn(async (url, opts) => {
    if (String(url).includes('/oauth2/v2.0/token')) return { ok: true, json: async () => ({ access_token: 'app-tok', expires_in: 3600 }) }
    return fn(url, opts)
  })
}
function graphSends(fetchImpl) { return fetchImpl.mock.calls.filter(c => String(c[0]).includes('/sendMail')).length }

beforeEach(() => {
  process.env.EXTERNAL_EFFECTS_ENABLED = 'true'
  db = new Map(); finalizeFailTimes = 0; rpcOverride = undefined
  sm.resetTokenCache(); sm.__setIO({ sb: fakeSb })
})

describe('systemMailer atomic idempotency', () => {
  it('fails closed when configuration is incomplete', async () => {
    await expect(sm.sendSystemEmail({ to: 'a@b.com', subject: 'x' }, { config: { tenantId: 't' } })).rejects.toThrow(/not configured/)
  })

  it('sends via Graph /users/{mailbox}/sendMail with saveToSentItems and APP auth', async () => {
    let sendUrl = null, sendBody = null, tokenBody = null
    const fetchImpl = vi.fn(async (url, opts) => {
      if (String(url).includes('/oauth2/v2.0/token')) { tokenBody = opts.body; return { ok: true, json: async () => ({ access_token: 'app-tok', expires_in: 3600 }) } }
      sendUrl = url; sendBody = JSON.parse(opts.body); return { status: 202, text: async () => '' }
    })
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'Hi', html: '<p>hi</p>', idempotencyKey: 'k1' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true)
    expect(sendUrl).toContain('/users/targetos%40targetreteam.com/sendMail')
    expect(sendBody.saveToSentItems).toBe(true)
    expect(tokenBody).toContain('grant_type=client_credentials')
    expect(tokenBody).not.toContain('refresh_token')
    expect(db.get('k1').status).toBe('sent')
    expect(db.get('k1').to_address).toBe('c@x.com')      // metadata recorded before send
    expect(db.get('k1').subject).toBe('Hi')
  })

  it('an UNEXPECTED RPC response fails closed with ZERO Graph calls', async () => {
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    for (const bad of [{ data: 'weird', error: null }, { data: null, error: null }, { data: undefined, error: null }]) {
      rpcOverride = bad
      await expect(sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'k' }, { config: CONFIG, fetchImpl, sleep: noSleep }))
        .rejects.toThrow(/system claim failed/)
    }
    expect(graphSends(fetchImpl)).toBe(0)
  })

  it('two concurrent calls with the same key → exactly ONE Graph send', async () => {
    const fetchImpl = graphOnly(async () => { await new Promise(r => setTimeout(r, 5)); return { status: 202, text: async () => '' } })
    const [a, b] = await Promise.all([
      sm.sendSystemEmail({ to: 'c@x.com', subject: 'Hi', idempotencyKey: 'race' }, { config: CONFIG, fetchImpl, sleep: noSleep }),
      sm.sendSystemEmail({ to: 'c@x.com', subject: 'Hi', idempotencyKey: 'race' }, { config: CONFIG, fetchImpl, sleep: noSleep }),
    ])
    expect(graphSends(fetchImpl)).toBe(1)
    expect([a, b].map(x => x.ok ? 'sent' : x.skipped).sort()).toEqual(['in_progress', 'sent'])
  })

  it('post-202: first finalize fails, second succeeds → success with exactly ONE Graph send', async () => {
    finalizeFailTimes = 1
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'fin-retry' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true); expect(r.warning).toBeUndefined()
    expect(graphSends(fetchImpl)).toBe(1)
    expect(db.get('fin-retry').status).toBe('sent')
  })

  it('post-202: all finalize attempts fail → accepted+warning, still ONE Graph send', async () => {
    finalizeFailTimes = 99
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'fin-fail' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r).toMatchObject({ ok: true, accepted: true })
    expect(r.warning).toMatch(/finalize/i)
    expect(graphSends(fetchImpl)).toBe(1)
  })

  it('an already-sent key is skipped (no send)', async () => {
    db.set('done', { status: 'sent', claim_token: null, claim_until: null })
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'done' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.skipped).toBe('duplicate'); expect(graphSends(fetchImpl)).toBe(0)
  })

  it('an active claim is skipped (in_progress, no send)', async () => {
    db.set('busy', { status: 'pending', claim_token: 'other', claim_until: Date.now() + 60000 })
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'busy' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(false); expect(r.skipped).toBe('in_progress'); expect(graphSends(fetchImpl)).toBe(0)
  })

  it('an expired claim can be recovered and sent', async () => {
    db.set('stale', { status: 'pending', claim_token: 'old', claim_until: Date.now() - 60000 })
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'stale' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true); expect(graphSends(fetchImpl)).toBe(1); expect(db.get('stale').status).toBe('sent')
  })

  it('a stale worker cannot finalize another worker’s claim', async () => {
    db.set('lease', { status: 'pending', claim_token: 'tokA', claim_until: Date.now() + 60000 })
    expect(await sm.finalize('lease', 'tokB', { status: 'sent', attempts: 1, code: null })).toBe(false)
    expect(db.get('lease').status).toBe('pending')
    expect(await sm.finalize('lease', 'tokA', { status: 'sent', attempts: 1, code: null })).toBe(true)
    expect(db.get('lease').status).toBe('sent')
  })

  it('fails BEFORE sending if the pre-send metadata write loses the claim', async () => {
    // claim succeeds with our token, but the row is then overwritten so our
    // metadata update matches 0 rows → must not call Graph.
    const fetchImpl = graphOnly(async () => ({ status: 202, text: async () => '' }))
    const realSb = fakeSb()
    sm.__setIO({ sb: () => ({
      rpc: (...a) => { const p = realSb.rpc(...a); db.get('m1') && (db.get('m1').claim_token = 'someone-else'); return p },
      from: (...a) => realSb.from(...a),
    }) })
    const r = await sm.sendSystemEmail({ to: 'c@x.com', subject: 'x', idempotencyKey: 'm1' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(false); expect(graphSends(fetchImpl)).toBe(0)
  })

  it('retries a pre-accept 5xx then succeeds (bounded)', async () => {
    let n = 0
    const fetchImpl = graphOnly(async () => { n++; return n === 1 ? { status: 503, text: async () => '' } : { status: 202, text: async () => '' } })
    const r = await sm.sendSystemEmail({ to: 'a@b.com', subject: 'x', idempotencyKey: 'retry1' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true); expect(r.attempts).toBe(2)
  })

  it('records a sanitized error after exhausting retries (pre-accept failure)', async () => {
    const fetchImpl = graphOnly(async () => ({ status: 500, text: async () => 'secret Bearer EwABIG.TOKEN' }))
    const r = await sm.sendSystemEmail({ to: 'a@b.com', subject: 'x', idempotencyKey: 'err1' }, { config: CONFIG, fetchImpl, sleep: noSleep, maxAttempts: 2 })
    expect(r.ok).toBe(false); expect(r.code).toBe('graph_500')
    expect(JSON.stringify(r)).not.toContain('EwABIG.TOKEN')
    expect(db.get('err1').status).toBe('error')
  })

  it('status() reports configuration + counts and exposes no secrets', async () => {
    db.set('a', { status: 'sent' }); db.set('b', { status: 'error' })
    const prev = process.env.MICROSOFT_SYSTEM_CLIENT_SECRET
    process.env.MICROSOFT_SYSTEM_TENANT_ID = 'tid'; process.env.MICROSOFT_SYSTEM_CLIENT_ID = 'cid'
    process.env.MICROSOFT_SYSTEM_CLIENT_SECRET = 'csecret'; process.env.MICROSOFT_SYSTEM_MAILBOX = 'targetos@targetreteam.com'
    const s = await sm.status()
    process.env.MICROSOFT_SYSTEM_CLIENT_SECRET = prev
    expect(s.configured).toBe(true); expect(s.mailbox).toBe('targetos@targetreteam.com')
    expect(JSON.stringify(s)).not.toContain('csecret')
  })
})
