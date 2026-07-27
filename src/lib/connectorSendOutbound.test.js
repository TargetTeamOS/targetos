import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as connectorSend from '../../api/connector-send.js'
const handler = connectorSend.default || connectorSend

const D = {
  requireUser: vi.fn(), logEvent: vi.fn(async () => {}),
  getAgentAccount: vi.fn(), freshAccountToken: vi.fn(async () => 'tok'),
  getAgentForUser: vi.fn(), contactAccess: vi.fn(),
  insertContactTimeline: vi.fn(async () => {}), persistOutboundGmail: vi.fn(async () => ({ ok: true })),
}
function makeRes() {
  return { statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v }, end(s) { this.body = s || ''; return this } }
}
async function call(body) {
  const res = makeRes(); await handler({ method: 'POST', headers: {}, body }, res)
  let json = null; try { json = JSON.parse(res.body || '{}') } catch {}
  return { res, json, status: res.statusCode }
}

beforeEach(() => {
  for (const k of Object.keys(D)) if (D[k].mockReset) D[k].mockReset()
  D.logEvent.mockResolvedValue(); D.freshAccountToken.mockResolvedValue('tok')
  D.insertContactTimeline.mockResolvedValue(); D.persistOutboundGmail.mockResolvedValue({ ok: true })
  D.requireUser.mockResolvedValue({ id: 'user-1' })
  D.getAgentForUser.mockResolvedValue({ id: 'agent-1', role: 'agent' })
  D.getAgentAccount.mockResolvedValue({ status: 'connected', account_email: 'me@team.com' })
  D.contactAccess.mockResolvedValue({ exists: true, allowed: true })
  handler.__setDepsForTests(D)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'gmMsg', threadId: 'gmThr' }), text: async () => '' })))
})
afterEach(() => { vi.unstubAllEnvs && vi.unstubAllEnvs() })

describe('connector-send outbound persistence (Phase 3)', () => {
  it('persists the sent Gmail message with owner from the JWT agent when a key is configured', async () => {
    vi.stubEnv('EMAIL_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 1).toString('base64'))
    vi.stubEnv('EMAIL_TOKEN_KEY_VERSION', '1')
    // body supplies a bogus agent_id which MUST be ignored
    const { status } = await call({ provider: 'gmail', to: 'client@example.com', subject: 'Hi', text: 'x', agent_id: 'attacker' })
    expect(status).toBe(200)
    expect(D.persistOutboundGmail).toHaveBeenCalledTimes(1)
    const [agentId, opts] = D.persistOutboundGmail.mock.calls[0]
    expect(agentId).toBe('agent-1')                 // from JWT, not 'attacker'
    expect(opts).toMatchObject({ providerMessageId: 'gmMsg', providerThreadId: 'gmThr', to: 'client@example.com' })
  })

  it('does NOT persist when no encryption key is configured (legacy behavior)', async () => {
    vi.stubEnv('EMAIL_TOKEN_ENCRYPTION_KEY', '')
    const { status } = await call({ provider: 'gmail', to: 'client@example.com', subject: 'Hi', text: 'x' })
    expect(status).toBe(200)
    expect(D.persistOutboundGmail).not.toHaveBeenCalled()
  })
})
