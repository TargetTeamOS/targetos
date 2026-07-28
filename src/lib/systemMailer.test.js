import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as sm from '../../api/_lib/systemMailer.js'

const CONFIG = { tenantId: 'tid', clientId: 'cid', clientSecret: 'csecret', mailbox: 'targetos@targetreteam.com' }
const noSleep = () => Promise.resolve()

// Fake system_email_log store.
let logRows
function fakeSb() {
  return { from() {
    return {
      select() { return this }, eq(k, v) { this._key = v; return this }, limit() { return this },
      maybeSingle() { return Promise.resolve({ data: logRows.get(this._key) || null, error: null }) },
      upsert(row) { logRows.set(row.idempotency_key, Object.assign(logRows.get(row.idempotency_key) || {}, row)); return Promise.resolve({ error: null }) },
      then(res) { res({ data: Array.from(logRows.values()), error: null }) }, // for status().select().limit()
    }
  } }
}
// fetch that answers the token endpoint and Graph sendMail
function makeFetch(graph) {
  return vi.fn(async (url) => {
    if (String(url).includes('/oauth2/v2.0/token')) {
      return { ok: true, json: async () => ({ access_token: 'app-tok', expires_in: 3600 }) }
    }
    return graph()
  })
}

beforeEach(() => { logRows = new Map(); sm.resetTokenCache() })

describe('systemMailer', () => {
  it('fails closed when configuration is incomplete', async () => {
    await expect(sm.sendSystemEmail({ to: 'a@b.com', subject: 'x' }, { config: { tenantId: 't' } }))
      .rejects.toThrow(/not configured/)
  })

  it('sends via Graph /users/{mailbox}/sendMail with saveToSentItems and app auth', async () => {
    let sendUrl = null, sendBody = null, tokenBody = null
    const fetchImpl = vi.fn(async (url, opts) => {
      if (String(url).includes('/oauth2/v2.0/token')) { tokenBody = opts.body; return { ok: true, json: async () => ({ access_token: 'app-tok', expires_in: 3600 }) } }
      sendUrl = url; sendBody = JSON.parse(opts.body); return { status: 202, text: async () => '' }
    })
    sm.__setIO({ sb: fakeSb })
    const r = await sm.sendSystemEmail({ to: 'client@x.com', subject: 'Hi', html: '<p>hi</p>', idempotencyKey: 'k1' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true)
    expect(sendUrl).toContain('/users/targetos%40targetreteam.com/sendMail')
    expect(sendBody.saveToSentItems).toBe(true)
    expect(sendBody.message.toRecipients[0].emailAddress.address).toBe('client@x.com')
    // app (client-credentials) auth — NEVER an agent refresh token
    expect(tokenBody).toContain('grant_type=client_credentials')
    expect(tokenBody).toContain(encodeURIComponent('https://graph.microsoft.com/.default'))
    expect(tokenBody).not.toContain('refresh_token')
    expect(logRows.get('k1').status).toBe('sent')
  })

  it('is idempotent: a key already marked sent is skipped (no send)', async () => {
    logRows.set('dup', { idempotency_key: 'dup', status: 'sent' })
    const fetchImpl = makeFetch(() => ({ status: 202, text: async () => '' }))
    sm.__setIO({ sb: fakeSb })
    const r = await sm.sendSystemEmail({ to: 'a@b.com', subject: 'x', idempotencyKey: 'dup' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.skipped).toBe('duplicate')
    // only nothing (no graph send) — fetch may be called 0 times
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries a 5xx then succeeds (bounded)', async () => {
    let n = 0
    const fetchImpl = makeFetch(() => { n++; return n === 1 ? { status: 503, text: async () => '' } : { status: 202, text: async () => '' } })
    sm.__setIO({ sb: fakeSb })
    const r = await sm.sendSystemEmail({ to: 'a@b.com', subject: 'x', idempotencyKey: 'r1' }, { config: CONFIG, fetchImpl, sleep: noSleep })
    expect(r.ok).toBe(true); expect(r.attempts).toBe(2)
  })

  it('records a sanitized error after exhausting retries', async () => {
    const fetchImpl = makeFetch(() => ({ status: 500, text: async () => 'secret Bearer EwABIG.TOKEN' }))
    sm.__setIO({ sb: fakeSb })
    const r = await sm.sendSystemEmail({ to: 'a@b.com', subject: 'x', idempotencyKey: 'e1' }, { config: CONFIG, fetchImpl, sleep: noSleep, maxAttempts: 2 })
    expect(r.ok).toBe(false); expect(r.code).toBe('graph_500')
    expect(JSON.stringify(r)).not.toContain('EwABIG.TOKEN')
    expect(logRows.get('e1').status).toBe('error')
    expect(logRows.get('e1').last_error_code).toBe('graph_500')
  })

  it('status() reports configuration + counts and never exposes secrets', async () => {
    logRows.set('a', { status: 'sent' }); logRows.set('b', { status: 'error' })
    sm.__setIO({ sb: fakeSb })
    const prev = { ...process.env }
    process.env.MICROSOFT_SYSTEM_TENANT_ID = 'tid'; process.env.MICROSOFT_SYSTEM_CLIENT_ID = 'cid'
    process.env.MICROSOFT_SYSTEM_CLIENT_SECRET = 'csecret'; process.env.MICROSOFT_SYSTEM_MAILBOX = 'targetos@targetreteam.com'
    const s = await sm.status()
    process.env.MICROSOFT_SYSTEM_CLIENT_SECRET = prev.MICROSOFT_SYSTEM_CLIENT_SECRET
    expect(s.configured).toBe(true); expect(s.mailbox).toBe('targetos@targetreteam.com')
    expect(JSON.stringify(s)).not.toContain('csecret')
    expect(JSON.stringify(s)).not.toContain('cid')
  })
})
