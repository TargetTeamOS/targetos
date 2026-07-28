import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as mod from '../../api/system-mailer-status.js'
const handler = mod.default || mod
function makeRes() { return { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[String(k).toLowerCase()] = v }, end(s) { this.body = s || ''; return this } } }
async function call(method = 'GET') { const res = makeRes(); await handler({ method, headers: {} }, res); let j = null; try { j = JSON.parse(res.body || '{}') } catch {} return { status: res.statusCode, json: j } }
const D = {}
beforeEach(() => {
  D.requireUser = vi.fn(async () => ({ id: 'u1' }))
  D.getAgentForUser = vi.fn(async () => ({ id: 'a1', role: 'admin' }))
  D.systemMailer = { status: vi.fn(async () => ({ configured: true, mailbox: 'targetos@targetreteam.com', recent: { sent: 3, error: 0, pending: 0 } })) }
  handler.__setDepsForTests(D)
})

describe('system-mailer-status endpoint', () => {
  it('401 unauthenticated', async () => { D.requireUser = vi.fn(async () => null); handler.__setDepsForTests(D); expect((await call()).status).toBe(401) })
  it('403 for non-admins', async () => { D.getAgentForUser = vi.fn(async () => ({ id: 'a1', role: 'agent' })); handler.__setDepsForTests(D); expect((await call()).status).toBe(403) })
  it('admin gets status without secrets', async () => {
    const { status, json } = await call()
    expect(status).toBe(200); expect(json.configured).toBe(true); expect(json.mailbox).toBe('targetos@targetreteam.com')
    expect(JSON.stringify(json)).not.toMatch(/secret|client_id|tenant/i)
  })
})
