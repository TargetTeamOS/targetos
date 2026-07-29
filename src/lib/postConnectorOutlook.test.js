import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase client so getSession returns a known JWT.
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-123' } } })) } } }))

import { postConnectorOutlook } from '../../src/lib/emailService.js'

beforeEach(() => { vi.restoreAllMocks() })

describe('postConnectorOutlook', () => {
  it('POSTs to /api/connector-send with provider=outlook and the agent JWT — never Resend', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ from: 'yanky@outlook.com' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await postConnectorOutlook({ to: 'client@x.com', subject: 'Hi', html: '<p>hi</p>' })
    expect(r.ok).toBe(true); expect(r.from).toBe('yanky@outlook.com')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/connector-send')
    expect(url).not.toContain('send-email')
    expect(opts.headers.Authorization).toBe('Bearer jwt-123')
    expect(JSON.parse(opts.body)).toMatchObject({ provider: 'outlook', to: 'client@x.com', subject: 'Hi' })
    // and it never hits the legacy Resend endpoint
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes('send-email'))).toBe(true)
  })

  it('maps a 400 "Connect your Outlook" response to needsConnect', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Connect your Outlook account in Settings first' }) })))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true)
  })

  it('returns a sanitized error for other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: 'Graph sendMail failed: bad' }) })))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBeFalsy(); expect(r.error).toMatch(/Graph sendMail failed/)
  })
})
