import { describe, it, expect, vi } from 'vitest'
import * as authModule from '../../api/_lib/auth.js'
import * as externalModule from '../../api/_lib/externalEffects.js'
import * as smsModule from '../../api/send-sms.js'
import * as outboundModule from '../../api/twilio-outbound.js'
import * as mailerModule from '../../api/_lib/systemMailer.js'
import * as webhookModule from '../../api/automation-webhook.js'

const auth = authModule.default || authModule
const external = externalModule.default || externalModule
const sms = smsModule.default || smsModule
const outbound = outboundModule.default || outboundModule
const mailer = mailerModule.default || mailerModule
const webhook = webhookModule.default || webhookModule

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

  it('blocks the system mailer before database or provider I/O', async () => {
    const fetchImpl = vi.fn()
    const database = vi.fn()
    mailer.__setIO({ fetchImpl, sb: database })
    await expect(mailer.sendSystemEmail({
      to: 'synthetic@example.test', subject: 'test', text: 'test', idempotencyKey: 'test-guard',
    }, {
      env: {},
      config: { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'm@example.test' },
      fetchImpl,
    })).rejects.toMatchObject({ code: 'EXTERNAL_EFFECTS_DISABLED', status: 503 })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(database).not.toHaveBeenCalled()
  })

  it('rejects private or non-HTTPS automation webhook destinations', () => {
    expect(webhook.publicHttpsUrl('http://example.test/hook')).toBeNull()
    expect(webhook.publicHttpsUrl('https://127.0.0.1/hook')).toBeNull()
    expect(webhook.publicHttpsUrl('https://192.168.1.4/hook')).toBeNull()
    expect(webhook.publicHttpsUrl('https://hooks.example.test/targetos')).toBe('https://hooks.example.test/targetos')
  })
})
