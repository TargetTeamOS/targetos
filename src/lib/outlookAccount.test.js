import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as mod from '../../api/outlook-account.js'
const handler = mod.default || mod

function makeRes() {
  return { statusCode: 0, headers: {}, body: '',
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v }, end(s) { this.body = s || ''; return this } }
}
async function call({ method = 'POST', headers = {}, body = {} } = {}) {
  const res = makeRes(); await handler({ method, headers, body }, res)
  let json = null; try { json = JSON.parse(res.body || '{}') } catch {}
  return { res, json, status: res.statusCode }
}
const D = {}
beforeEach(() => {
  D.requireUser = vi.fn(async () => ({ id: 'user-1' }))
  D.getAgentForUser = vi.fn(async () => ({ id: 'agent-1', role: 'agent' }))
  D.getAgentAccount = vi.fn(async () => ({ status: 'connected', account_email: 'agent1@outlook.com' }))
  D.sb = vi.fn(() => ({ from: () => ({ delete: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }) }) }))
  handler.__setDepsForTests(D)
})

describe('outlook-account endpoint', () => {
  it('401 when unauthenticated', async () => {
    D.requireUser = vi.fn(async () => null); handler.__setDepsForTests(D)
    expect((await call({ body: { action: 'status' } })).status).toBe(401)
  })

  it('status returns the caller’s own connected From (agent from JWT)', async () => {
    const { status, json } = await call({ method: 'GET' })
    expect(status).toBe(200); expect(json).toEqual({ connected: true, from: 'agent1@outlook.com' })
    expect(D.getAgentAccount).toHaveBeenCalledWith('agent-1', 'outlook')
  })

  it('status reports not-connected when there is no active account', async () => {
    D.getAgentAccount = vi.fn(async () => null); handler.__setDepsForTests(D)
    const { json } = await call({ method: 'GET' })
    expect(json).toEqual({ connected: false, from: null })
  })

  it('disconnect removes only the caller’s own outlook account; ignores body agent_id', async () => {
    const eqCalls = []
    D.sb = vi.fn(() => ({ from: () => ({ delete: () => ({ eq: (k, v) => { eqCalls.push([k, v]); return { eq: (k2, v2) => { eqCalls.push([k2, v2]); return { error: null } } } } }) }) }))
    handler.__setDepsForTests(D)
    const { status, json } = await call({ body: { action: 'disconnect', agent_id: 'attacker' } })
    expect(status).toBe(200); expect(json.ok).toBe(true)
    expect(eqCalls).toEqual(expect.arrayContaining([['agent_id', 'agent-1'], ['provider', 'outlook']]))
    expect(eqCalls).not.toEqual(expect.arrayContaining([['agent_id', 'attacker']]))
  })
})
