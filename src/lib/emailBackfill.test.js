import { describe, it, expect } from 'vitest'
import * as bf from '../../api/_lib/emailBackfill.js'

const { mapProvider, mapStatus, buildConnectionRow, pickPrimaryIndex } = bf

// Fake encrypt that marks its input (stands in for AES-256-GCM).
const enc = (v) => 'ENC(' + v + ')'

describe('email backfill mapping', () => {
  it('maps legacy provider labels (outlook → microsoft)', () => {
    expect(mapProvider('outlook')).toBe('microsoft')
    expect(mapProvider('google')).toBe('google')
    expect(mapProvider('imap')).toBe(null)
  })

  it('maps legacy status', () => {
    expect(mapStatus('connected')).toBe('active')
    expect(mapStatus('error')).toBe('error')
    expect(mapStatus('disconnected')).toBe('disconnected')
    expect(mapStatus('pending')).toBe('disconnected')
  })

  it('builds a connection row with ENCRYPTED tokens only', () => {
    const row = buildConnectionRow({
      id: 'acct-1', agent_id: 'agent-1', provider: 'outlook', account_email: 'u@team.com',
      status: 'connected',
      secrets: { access_token: 'AT', refresh_token: 'RT', expires_at: '2026-01-01T00:00:00Z' },
    }, enc)
    expect(row.provider).toBe('microsoft')
    expect(row.crm_user_id).toBe('agent-1')
    expect(row.email_address).toBe('u@team.com')
    expect(row.status).toBe('active')
    expect(row.source_integration_account_id).toBe('acct-1')
    expect(row.encrypted_access_token).toBe('ENC(AT)')
    expect(row.encrypted_refresh_token).toBe('ENC(RT)')
    // no plaintext token fields leak onto the row
    expect(JSON.stringify(row)).not.toContain('"AT"')
    expect(JSON.stringify(row)).not.toContain('"RT"')
  })

  it('leaves missing tokens null (does not encrypt empty)', () => {
    const row = buildConnectionRow(
      { id: 'a2', agent_id: 'g2', provider: 'google', account_email: 'x@y.com', status: 'error', secrets: {} },
      enc,
    )
    expect(row.encrypted_access_token).toBe(null)
    expect(row.encrypted_refresh_token).toBe(null)
    expect(row.status).toBe('error')
  })

  it('skips unknown providers', () => {
    const row = buildConnectionRow({ id: 'a3', agent_id: 'g3', provider: 'imap', secrets: {} }, enc)
    expect(row).toBe(null)
  })

  it('fails closed if encryption throws (never stores plaintext)', () => {
    const boom = () => { throw new Error('email token encryption is misconfigured') }
    expect(() => buildConnectionRow(
      { id: 'a4', agent_id: 'g4', provider: 'google', status: 'connected', secrets: { access_token: 'AT' } },
      boom,
    )).toThrow(/misconfigured/)
  })

  it('pickPrimaryIndex prefers the first active connection', () => {
    expect(pickPrimaryIndex([{ status: 'error' }, { status: 'active' }, { status: 'active' }])).toBe(1)
    expect(pickPrimaryIndex([{ status: 'error' }, { status: 'disconnected' }])).toBe(0)
    expect(pickPrimaryIndex([])).toBe(-1)
  })
})
