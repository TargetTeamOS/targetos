import { describe, it, expect, vi } from 'vitest'
import * as authModule from '../../api/_lib/auth.js'
import * as externalModule from '../../api/_lib/externalEffects.js'
import * as smsModule from '../../api/send-sms.js'
import * as outboundModule from '../../api/twilio-outbound.js'
import * as connectorModule from '../../api/connector-send.js'
import * as webhookModule from '../../api/automation-webhook.js'

const auth = authModule.default || authModule
const external = externalModule.default || externalModule
const sms = smsModule.default || smsModule
const outbound = outboundModule.default || outboundModule
const connector = connectorModule.default || connectorModule
const webhook = webhookModule.default || webhookModule

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    end(value) { this.body = value ? JSON.parse(value) : null; return this },
  }
}

function oneRowTable(row, error = null) {
  const state = { eq: [] }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column, value) => { state.eq.push([column, value]); return builder }),
    maybeSingle: vi.fn(async () => ({ data: row, error })),
  }
  return { client: { from: vi.fn(() => builder) }, builder, state }
}

describe('Phase 1 ownership and external-effects foundation', () => {
  it('uses one canonical role vocabulary for admin, secretary, and agent aliases', () => {
    expect(auth.canonicalRole('OWNER')).toBe('admin')
    expect(auth.canonicalRole('transaction_coordinator')).toBe('secretary')
    expect(auth.canonicalRole('team_leader')).toBe('agent')
    expect(auth.roleAllowed('administrator', ['admin'])).toBe(true)
    expect(auth.roleAllowed('transaction coordinator', ['secretary'])).toBe(true)
  })

  it('blocks an agent from another agent contact', async () => {
    const table = oneRowTable({ id: 'contact-b', agent_id: 'agent-b' })
    const result = await sms.authorizeContactAccess(table.client, 'contact-b', {
      agentId: 'agent-a', role: 'agent',
    }, { agentId: 'agent-b' })
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('requires a documented explicit admin override for a cross-agent contact', async () => {
    const table = oneRowTable({ id: 'contact-b', agent_id: 'agent-b' })
    const denied = await sms.authorizeContactAccess(table.client, 'contact-b', {
      agentId: 'admin-a', role: 'admin',
    }, {})
    expect(denied).toMatchObject({ ok: false, status: 403 })
    const allowed = await sms.authorizeContactAccess(table.client, 'contact-b', {
      agentId: 'admin-a', role: 'administrator',
    }, { admin_override: true, admin_reason: 'Approved support request' })
    expect(allowed).toMatchObject({ ok: true, adminOverride: true })
  })

  it('selects only the authenticated agent phone', async () => {
    const table = oneRowTable({ id: 'agent-a', phone: '(845) 555-0100', name: 'Agent A' })
    const result = await outbound.resolveOwnedAgentPhone(table.client, 'agent-a')
    expect(table.state.eq).toEqual([['id', 'agent-a']])
    expect(result).toMatchObject({ id: 'agent-a', phone: '+18455550100' })
  })

  it('keeps external effects disabled unless explicitly enabled', () => {
    expect(external.externalEffectsEnabled({})).toBe(false)
    expect(external.externalEffectsEnabled({ EXTERNAL_EFFECTS_ENABLED: 'false' })).toBe(false)
    expect(() => external.assertExternalEffectsEnabled({})).toThrow(/disabled/i)
    expect(external.externalEffectsEnabled({ EXTERNAL_EFFECTS_ENABLED: 'true' })).toBe(true)
  })

  it('blocks connector email before token refresh or provider I/O', async () => {
    const refresh = vi.fn()
    connector.__setDepsForTests({
      authenticate: vi.fn(async () => ({ ok: true, user: { id: 'user-a' }, agent: { id: 'agent-a', role: 'agent' } })),
      getAgentAccount: vi.fn(async () => ({ status: 'connected', account_email: 'synthetic@example.test' })),
      freshAccountToken: refresh,
      contactAccess: vi.fn(),
      insertContactTimeline: vi.fn(),
      logEvent: vi.fn(),
    })
    const prior = process.env.EXTERNAL_EFFECTS_ENABLED
    delete process.env.EXTERNAL_EFFECTS_ENABLED
    const res = responseRecorder()
    await connector({
      method: 'POST', headers: {},
      body: { provider: 'gmail', to: 'recipient@example.test', subject: 'Synthetic test' },
    }, res)
    if (prior == null) delete process.env.EXTERNAL_EFFECTS_ENABLED
    else process.env.EXTERNAL_EFFECTS_ENABLED = prior
    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ code: 'EXTERNAL_EFFECTS_DISABLED' })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('rejects a cross-agent connector contact before reading a mailbox', async () => {
    const getAccount = vi.fn()
    connector.__setDepsForTests({
      authenticate: vi.fn(async () => ({ ok: true, user: { id: 'user-a' }, agent: { id: 'agent-a', role: 'agent' } })),
      contactAccess: vi.fn(async () => ({ exists: true, allowed: false })),
      getAgentAccount: getAccount,
    })
    const res = responseRecorder()
    await connector({
      method: 'POST', headers: {},
      body: { provider: 'outlook', to: 'recipient@example.test', subject: 'Synthetic test', contact_id: 'contact-b', agent_id: 'agent-b' },
    }, res)
    expect(res.statusCode).toBe(403)
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('rejects private or non-HTTPS automation webhook destinations', () => {
    expect(webhook.publicHttpsUrl('http://example.test/hook')).toBeNull()
    expect(webhook.publicHttpsUrl('https://127.0.0.1/hook')).toBeNull()
    expect(webhook.publicHttpsUrl('https://192.168.1.4/hook')).toBeNull()
    expect(webhook.publicHttpsUrl('https://hooks.example.test/targetos')).toBe('https://hooks.example.test/targetos')
  })
})
