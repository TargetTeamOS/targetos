import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as connectorSend from '../../api/connector-send.js'
const handler = connectorSend.default || connectorSend

// Deps are injected via the handler's test seam (loader-independent).
const D = {
  requireUser: vi.fn(),
  logEvent: vi.fn(async () => {}),
  getAgentAccount: vi.fn(),
  freshAccountToken: vi.fn(async () => 'access-tok'),
  getAgentForUser: vi.fn(),
  contactAccess: vi.fn(),
  insertContactTimeline: vi.fn(async () => {}),
}

function makeRes() {
  return {
    statusCode: 0, headers: {}, body: '', ended: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v },
    end(s) { this.body = s || ''; this.ended = true; return this },
  }
}
async function call({ method = 'POST', headers = {}, body = {} } = {}) {
  const res = makeRes()
  await handler({ method, headers, body }, res)
  let json = null
  try { json = JSON.parse(res.body || '{}') } catch { /* non-json */ }
  return { res, json, status: res.statusCode }
}
const okBody = (over = {}) => ({ provider: 'gmail', to: 'client@example.com', subject: 'Hi', text: 'hello', ...over })

beforeEach(() => {
  vi.stubEnv('EXTERNAL_EFFECTS_ENABLED', 'true')
  for (const k of Object.keys(D)) D[k].mockReset()
  D.logEvent.mockResolvedValue(); D.freshAccountToken.mockResolvedValue('access-tok'); D.insertContactTimeline.mockResolvedValue()
  D.requireUser.mockResolvedValue({ id: 'user-1' })
  D.getAgentForUser.mockResolvedValue({ id: 'agent-1', role: 'agent' })
  D.getAgentAccount.mockResolvedValue({ status: 'connected', account_email: 'me@team.com' })
  D.contactAccess.mockResolvedValue({ exists: true, allowed: true })
  handler.__setDepsForTests(D)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' })))
})

describe('connector-send route security', () => {
  it('1. unauthenticated → 401', async () => {
    D.requireUser.mockResolvedValue(null)
    const { status, json } = await call({ body: okBody() })
    expect(status).toBe(401); expect(json.error).toMatch(/unauthorized/)
  })

  it('2. unsupported / missing provider → 400', async () => {
    expect((await call({ body: okBody({ provider: 'imap' }) })).status).toBe(400)
    expect((await call({ body: okBody({ provider: undefined }) })).status).toBe(400)
  })

  it('3. caller-supplied agent_id is ignored (uses JWT agent)', async () => {
    await call({ body: okBody({ agent_id: 'someone-else' }) })
    expect(D.getAgentAccount).toHaveBeenCalledWith('agent-1', 'google')
    expect(D.getAgentAccount).not.toHaveBeenCalledWith('someone-else', expect.anything())
  })

  it('4. only the authenticated user’s account is selected', async () => {
    await call({ body: okBody() })
    expect(D.getAgentForUser).toHaveBeenCalledWith('user-1')
    expect(D.getAgentAccount).toHaveBeenCalledWith('agent-1', 'google')
  })

  it('5. mismatched From → 403, no send', async () => {
    const { status } = await call({ body: okBody({ from: 'evil@attacker.com' }) })
    expect(status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('6. missing connected account → safe 400, no send', async () => {
    D.getAgentAccount.mockResolvedValue(null)
    const { status } = await call({ body: okBody() })
    expect(status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('7. org/system account is never used as fallback', async () => {
    D.getAgentAccount.mockResolvedValue({ status: 'error', account_email: '' })
    const { status } = await call({ body: okBody() })
    expect(status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('8. CRLF in To or Subject is rejected, no send', async () => {
    expect((await call({ body: okBody({ to: 'client@example.com\r\nBcc: evil@x.com' }) })).status).toBe(400)
    expect((await call({ body: okBody({ subject: 'Hi\nBcc: evil@x.com' }) })).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('9. unauthorized contact_id → 403, no task, no send', async () => {
    D.contactAccess.mockResolvedValue({ exists: true, allowed: false })
    const { status } = await call({ body: okBody({ contact_id: 'c-9' }) })
    expect(status).toBe(403)
    expect(D.insertContactTimeline).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('10. authorized contact_id creates the timeline entry', async () => {
    D.contactAccess.mockResolvedValue({ exists: true, allowed: true })
    const { status } = await call({ body: okBody({ contact_id: 'c-10' }) })
    expect(status).toBe(200)
    expect(D.insertContactTimeline).toHaveBeenCalledTimes(1)
    expect(D.insertContactTimeline).toHaveBeenCalledWith(expect.objectContaining({ contactId: 'c-10' }))
  })

  it('11. provider/token errors are sanitized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 400,
      text: async () => 'Authorization: Bearer ya29.SUPERSECRETTOKENVALUE1234567890 failed',
    })))
    const { status, json } = await call({ body: okBody() })
    expect(status).toBe(502)
    expect(json.error).not.toContain('ya29.SUPERSECRETTOKENVALUE1234567890')
    expect(json.error).toMatch(/redacted/)
  })

  it('12. disallowed browser origin gets no CORS authorization', async () => {
    const { res } = await call({ headers: { origin: 'https://evil.example' }, body: okBody() })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('13. allowed APP_ORIGINS origin is authorized', async () => {
    const { res } = await call({ headers: { origin: 'https://app.targetreteam.com' }, body: okBody() })
    expect(res.headers['access-control-allow-origin']).toBe('https://app.targetreteam.com')
  })

  it('happy path sends and returns 200', async () => {
    const { status, json } = await call({ body: okBody() })
    expect(status).toBe(200); expect(json.ok).toBe(true); expect(json.from).toBe('me@team.com')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
