import { describe, it, expect, vi } from 'vitest'
import * as authModule from '../../api/_lib/auth.js'
const auth = authModule.default || authModule

describe('fail-closed API authentication', () => {
  it('returns 401 when authentication is absent regardless of AUTH_ENFORCE', async () => {
    const result = await auth.authenticate({}, {}, { requireUser: vi.fn(async () => null) })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it('returns 403 when no linked active agent exists', async () => {
    const result = await auth.authenticate({}, {}, {
      requireUser: vi.fn(async () => ({ id: 'u1' })),
      getAgentForUser: vi.fn(async () => null),
    })
    expect(result).toMatchObject({ ok: false, status: 403 })
  })

  it('returns 503 when required server Supabase configuration is missing', async () => {
    const result = await auth.authenticate({ headers: {} }, {}, { env: {} })
    expect(result).toMatchObject({
      ok: false,
      status: 503,
      error: expect.stringMatching(/SUPABASE_URL/),
    })
  })

  it('rejects unauthorized roles', async () => {
    const result = await auth.authenticate({}, { roles: ['admin'] }, {
      requireUser: vi.fn(async () => ({ id: 'u1' })),
      getAgentForUser: vi.fn(async () => ({ id: 'a1', role: 'agent' })),
    })
    expect(result).toMatchObject({ ok: false, status: 403 })
  })
})
