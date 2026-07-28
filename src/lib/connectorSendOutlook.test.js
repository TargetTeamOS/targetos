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
