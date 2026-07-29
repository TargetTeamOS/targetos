import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as connectorSend from '../../api/connector-send.js'
const handler = connectorSend.default || connectorSend

const D = {
  requireUser: vi.fn(), logEvent: vi.fn(async () => {}),
  getAgentAccount: vi.fn(), freshAccountToken: vi.fn(async () => 'ms-tok'),
  getAgentForUser: vi.fn(), contactAccess: vi.fn(),
  insertContactTimeline: vi.fn(async () => {}), persistOutboundGmail: vi.fn(async () => ({})),
}
function makeRes() { return { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[String(k).toLowerCase()] = v }, end(s) { this.body = s || ''; return this } } }
async function call(body) { const res = makeRes(); await handler({ method: 'POST', headers: {}, body }, res); let j = null; try { j = JSON.parse(res.body || '{}') } catch {} return { res, json: j, status: res.statusCode } }
const okBody = (o = {}) => ({ provider: 'outlook', to: 'client@example.com', subject: 'Hi', text: 'hello', ...o })

beforeEach(() => {
  for (const k of Object.keys(D)) if (D[k].mockReset) D[k].mockReset()
  D.logEvent.mockResolvedValue(); D.freshAccountToken.mockResolvedValue('ms-tok'); D.insertContactTimeline.mockResolvedValue()
  D.requireUser.mockResolvedValue({ id: 'user-1' })
  D.getAgentForUser.mockResolvedValue({ id: 'agent-1', role: 'agent' })
  D.getAgentAccount.mockResolvedValue({ status: 'connected', account_email: 'agent1@outlook.com' })
  D.contactAccess.mockResolvedValue({ exists: true, allowed: true })
  handler.__setDepsForTests(D)
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 202, ok: true, text: async () => '' })))
})

describe('connector-send via Outlook (Graph)', () => {
  it('sends via Graph sendMail with saveToSentItems and acks 200', async () => {
    const { status, json } = await call(okBody())
    expect(status).toBe(200); expect(json.from).toBe('agent1@outlook.com')
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain('graph.microsoft.com'); expect(url).toContain('/sendMail')
    expect(JSON.parse(opts.body).saveToSentItems).toBe(true)
    expect(opts.headers.Authorization).toBe('Bearer ms-tok')
  })
  it('resolves the account from the JWT agent, ignoring a supplied agent_id', async () => {
    await call(okBody({ agent_id: 'attacker' }))
    expect(D.getAgentAccount).toHaveBeenCalledWith('agent-1', 'outlook')
    expect(D.getAgentAccount).not.toHaveBeenCalledWith('attacker', expect.anything())
  })
  it('enforces From = connected address (mismatch → 403, no send)', async () => {
    const { status } = await call(okBody({ from: 'someone-else@outlook.com' }))
    expect(status).toBe(403); expect(fetch).not.toHaveBeenCalled()
  })
  it('no active Outlook connection → clear Connect message (400), no send', async () => {
    D.getAgentAccount.mockResolvedValue(null)
    const { status, json } = await call(okBody())
    expect(status).toBe(400); expect(json.error).toMatch(/Connect your Outlook/i)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('logs the contact timeline for an authorized contact_id', async () => {
    const { status } = await call(okBody({ contact_id: 'c-1' }))
    expect(status).toBe(200); expect(D.insertContactTimeline).toHaveBeenCalledTimes(1)
  })
  it('unauthorized contact_id → 403, no send, no timeline', async () => {
    D.contactAccess.mockResolvedValue({ exists: true, allowed: false })
    const { status } = await call(okBody({ contact_id: 'c-1' }))
    expect(status).toBe(403); expect(fetch).not.toHaveBeenCalled(); expect(D.insertContactTimeline).not.toHaveBeenCalled()
  })
  it('sanitizes Graph errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 400, ok: false, text: async () => 'Authorization: Bearer EwAToken.SECRET failed' })))
    const { status, json } = await call(okBody())
    expect(status).toBe(502); expect(json.error).not.toContain('EwAToken.SECRET')
  })
})

describe('connector-send Outlook post-202 accepted-send boundary', () => {
  const graphCalls = () => fetch.mock.calls.filter(c => String(c[0]).includes('graph.microsoft.com'))

  it('202 + success telemetry OK → 200 ok:true with from; Graph called once', async () => {
    const { status, json } = await call(okBody())
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, provider: 'outlook', from: 'agent1@outlook.com' })
    expect(graphCalls().length).toBe(1)
  })

  it('202 + post-accept success logEvent THROWS → still 200 ok:true; Graph once; no second Graph call; no raw DB error', async () => {
    // Throw ONLY for the post-202 success telemetry call (5th arg === true),
    // so this proves the accepted-send boundary, not a pre-send logging path.
    D.logEvent = vi.fn(async (provider, dir, action, meta, success) => {
      if (success === true) throw new Error('db down: secret internal detail 0xDEADBEEF')
    })
    handler.__setDepsForTests(D)
    const { status, json } = await call(okBody())
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, provider: 'outlook', from: 'agent1@outlook.com' })
    expect(graphCalls().length).toBe(1)                       // exactly one Graph send, no retry
    expect(JSON.stringify(json)).not.toContain('db down')     // no raw DB error leaked
    expect(JSON.stringify(json)).not.toContain('0xDEADBEEF')
  })

  it('non-202 Graph result → sanitized failure, success not reported, no accepted-send', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 400, ok: false, text: async () => 'Bearer EwA.TOKEN bad request' })))
    const { status, json } = await call(okBody())
    expect(status).toBe(502)
    expect(json.ok).not.toBe(true)
    expect(JSON.stringify(json)).not.toContain('EwA.TOKEN')
    // the success-telemetry (5th arg true) must NOT have been called
    expect(D.logEvent.mock.calls.some(c => c[4] === true)).toBe(false)
  })

  it('202 + post-accept contact-timeline failure → still 200; Graph called once', async () => {
    D.insertContactTimeline = vi.fn(async () => { throw new Error('timeline db down') })
    handler.__setDepsForTests(D)
    const { status, json } = await call(okBody({ contact_id: 'c-1' }))
    expect(status).toBe(200)
    expect(json).toMatchObject({ ok: true, provider: 'outlook', from: 'agent1@outlook.com' })
    expect(graphCalls().length).toBe(1)
    expect(JSON.stringify(json)).not.toContain('timeline db down')
  })
})
