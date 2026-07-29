import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Supabase client so we control the session per test.
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))
import { supabase } from './supabase'
import { postConnectorOutlook, buildContactEmailHtml } from './emailService.js'
import { composeSendOutlook } from './contactEmailSend.js'

const jwtSession = { data: { session: { access_token: 'jwt-123' } } }
beforeEach(() => {
  vi.restoreAllMocks()
  supabase.auth.getSession.mockResolvedValue(jwtSession)
})

describe('postConnectorOutlook — auth + endpoint (Section A)', () => {
  it('POSTs to /api/connector-send with provider=outlook and Bearer jwt-123; never send-email', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ from: 'yanky@outlook.com' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await postConnectorOutlook({ to: 'client@x.com', subject: 'Hi', html: '<p>hi</p>' })
    expect(r.ok).toBe(true); expect(r.from).toBe('yanky@outlook.com')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/connector-send')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.headers.Authorization).toBe('Bearer jwt-123')      // always present
    expect(JSON.parse(opts.body)).toMatchObject({ provider: 'outlook', to: 'client@x.com', subject: 'Hi', html: '<p>hi</p>' })
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes('send-email'))).toBe(true)
  })

  it('missing session token → auth_required and ZERO fetch calls', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r).toMatchObject({ ok: false, code: 'auth_required' })
    expect(r.error).toMatch(/session has expired/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getSession throwing is treated as no token (auth_required, zero fetch)', async () => {
    supabase.auth.getSession.mockRejectedValue(new Error('boom'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.code).toBe('auth_required'); expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401 and 403 → auth_required message', async () => {
    for (const status of [401, 403]) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => ({ error: 'raw server detail' }) })))
      const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
      expect(r.code).toBe('auth_required'); expect(r.error).toMatch(/session has expired/i)
      expect(JSON.stringify(r)).not.toContain('raw server detail')
    }
  })

  it('400 Outlook-not-connected → needsConnect:true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Connect your Outlook account in Settings first' }) })))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true)
  })

  it('429 → rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.code).toBe('rate_limited'); expect(r.error).toMatch(/temporarily limiting/i)
  })

  it('5xx → temporarily-unavailable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.code).toBe('unavailable'); expect(r.error).toMatch(/temporarily unavailable/i)
  })

  it('network failure → sanitized message, no raw exception text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET secret stack trace') }))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.ok).toBe(false); expect(r.error).toMatch(/temporarily unavailable/i)
    expect(JSON.stringify(r)).not.toContain('ECONNRESET')
  })

  it('other rejected request (422) → generic recipient message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422, json: async () => ({ error: 'weird' }) })))
    const r = await postConnectorOutlook({ to: 'c@x.com', subject: 's', html: 'h' })
    expect(r.code).toBe('rejected'); expect(r.error).toMatch(/review the recipient/i)
    expect(JSON.stringify(r)).not.toContain('weird')
  })
})

describe('composer path integration (composeSendOutlook → real postConnectorOutlook)', () => {
  it('the exact composer send path hits /api/connector-send with JWT + provider=outlook and logs once', async () => {
    supabase.auth.getSession.mockResolvedValue(jwtSession)
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ from: 'yanky@outlook.com' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const logActivity = vi.fn(async () => {})
    const r = await composeSendOutlook({
      to: 'client@x.com', subject: 'Hi', body: 'hello', agentName: 'Yanky',
      outlook: { connected: true, from: 'yanky@outlook.com' },
      deps: { buildHtml: buildContactEmailHtml, send: postConnectorOutlook, logActivity },
    })
    expect(r.ok).toBe(true); expect(r.from).toBe('yanky@outlook.com')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/connector-send')
    expect(opts.headers.Authorization).toBe('Bearer jwt-123')
    expect(JSON.parse(opts.body).provider).toBe('outlook')
    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every(c => !String(c[0]).includes('send-email'))).toBe(true)
  })
})
