import { describe, it, expect, vi } from 'vitest'
import {
  isTextFormat, columnTypesFromOpenApi, nullEmptyNonText, nullAllEmpty,
  isEmptyStringTypeError, restTableFromUrl, createSanitizingFetch,
} from './payloadSanitize.js'

const SPEC = {
  definitions: {
    tasks: { properties: {
      id: { format: 'uuid' }, title: { format: 'text' }, agent_id: { format: 'uuid' },
      contact_id: { format: 'uuid' }, due_date: { format: 'date' }, notes: { format: 'text' },
    } },
    gifts: { properties: {
      client_name: { format: 'text' }, cost: { format: 'numeric' }, agent_id: { format: 'uuid' },
      sent_at: { format: 'timestamp with time zone' }, status: { format: 'character varying' },
    } },
    calendar_events: { properties: {
      title: { format: 'text' }, start_date: { format: 'date' }, end_date: { format: 'date' },
      start_time: { format: 'time without time zone' }, all_day: { format: 'boolean' },
    } },
  },
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('payloadSanitize helpers', () => {
  it('treats only text-like formats as text', () => {
    for (const f of ['text', 'character varying', 'character varying(20)', 'citext']) expect(isTextFormat(f)).toBe(true)
    for (const f of ['uuid', 'numeric', 'integer', 'date', 'timestamp with time zone', 'time without time zone', 'boolean', 'jsonb', 'uuid[]', 'public.stage_enum']) expect(isTextFormat(f)).toBe(false)
  })

  it('nulls "" only on non-text columns, keeps "" on text columns', () => {
    const types = columnTypesFromOpenApi(SPEC)
    const out = nullEmptyNonText({ title: 'Call back', notes: '', agent_id: 'a1', contact_id: '', due_date: '' }, types.tasks)
    expect(out).toEqual({ title: 'Call back', notes: '', agent_id: 'a1', contact_id: null, due_date: null })
  })

  it('handles bulk inserts (arrays)', () => {
    const types = columnTypesFromOpenApi(SPEC)
    const out = nullEmptyNonText([{ cost: '', client_name: '' }, { cost: '50', client_name: 'A' }], types.gifts)
    expect(out).toEqual([{ cost: null, client_name: '' }, { cost: '50', client_name: 'A' }])
  })

  it('nullAllEmpty converts every empty string', () => {
    expect(nullAllEmpty({ a: '', b: 'x', c: 0, d: null })).toEqual({ a: null, b: 'x', c: 0, d: null })
  })

  it('recognises the Postgres empty-string type errors', () => {
    expect(isEmptyStringTypeError({ code: '22P02', message: 'invalid input syntax for type uuid: ""' })).toBe(true)
    expect(isEmptyStringTypeError({ code: '22P02', message: 'invalid input syntax for type numeric: ""' })).toBe(true)
    expect(isEmptyStringTypeError({ code: '22007', message: 'invalid input syntax for type date: ""' })).toBe(true)
    expect(isEmptyStringTypeError({ code: '22P02', message: 'invalid input syntax for type uuid: "abc"' })).toBe(false)
    expect(isEmptyStringTypeError({ code: '23505', message: 'duplicate key' })).toBe(false)
  })

  it('extracts the table from REST URLs and ignores RPC', () => {
    expect(restTableFromUrl('https://x.supabase.co/rest/v1/tasks?select=*')).toBe('tasks')
    expect(restTableFromUrl('https://x.supabase.co/rest/v1/rpc/app_my_day')).toBe(null)
    expect(restTableFromUrl('https://x.supabase.co/auth/v1/token')).toBe(null)
  })
})

describe('createSanitizingFetch (the shared save path)', () => {
  function setup(specAvailable, dbHandler) {
    const calls = []
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).endsWith('/rest/v1/')) return specAvailable ? jsonResponse(200, SPEC) : jsonResponse(401, { message: 'no' })
      calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null })
      return dbHandler(String(url), init)
    })
    return { f: createSanitizingFetch('https://x.supabase.co'), calls }
  }
  // A fake Postgres: rejects "" on the non-text columns of SPEC.
  function strictDb(url, init) {
    const table = restTableFromUrl(url)
    const types = columnTypesFromOpenApi(SPEC)[table] || {}
    const rows = [].concat(JSON.parse(init.body))
    for (const r of rows) for (const k of Object.keys(r)) {
      if (r[k] === '' && types[k] && !isTextFormat(types[k])) {
        return jsonResponse(400, { code: '22P02', message: 'invalid input syntax for type ' + types[k] + ': ""' })
      }
    }
    return jsonResponse(201, rows)
  }
  const hdrs = { apikey: 'k', Authorization: 'Bearer t', 'Content-Type': 'application/json' }

  it('Tasks repro: hidden empty uuid no longer fails, text "" kept (schema available)', async () => {
    const { f, calls } = setup(true, strictDb)
    const res = await f('https://x.supabase.co/rest/v1/tasks?select=*', { method: 'POST', headers: hdrs, body: JSON.stringify({ title: 'T', agent_id: 'a1', contact_id: '', due_date: '', notes: '' }) })
    expect(res.status).toBe(201)
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toEqual({ title: 'T', agent_id: 'a1', contact_id: null, due_date: null, notes: '' })
  })

  it('Gifts repro: hidden empty numeric no longer fails', async () => {
    const { f } = setup(true, strictDb)
    const res = await f('https://x.supabase.co/rest/v1/gifts', { method: 'POST', headers: hdrs, body: JSON.stringify({ client_name: 'C', cost: '', agent_id: 'a1', status: 'Pending' }) })
    expect(res.status).toBe(201)
  })

  it('Calendar / Signs repro: blank end date on update (PATCH)', async () => {
    const { f, calls } = setup(true, strictDb)
    const res = await f('https://x.supabase.co/rest/v1/calendar_events?id=eq.1', { method: 'PATCH', headers: hdrs, body: JSON.stringify({ title: 'E', start_date: '2026-10-14', end_date: '', start_time: '' }) })
    expect(res.status).toBe(201)
    expect(calls[0].body.end_date).toBe(null)
  })

  it('falls back to a single retry with "" -> null when the schema is unavailable', async () => {
    const { f, calls } = setup(false, strictDb)
    const res = await f('https://x.supabase.co/rest/v1/tasks', { method: 'POST', headers: hdrs, body: JSON.stringify({ title: 'T', assigned_to: '', agent_id: '' }) })
    expect(res.status).toBe(201)
    expect(calls).toHaveLength(2)
    expect(calls[1].body).toEqual({ title: 'T', assigned_to: null, agent_id: null })
  })

  it('does not retry other errors, and leaves reads and RPCs alone', async () => {
    const { f, calls } = setup(false, () => jsonResponse(400, { code: '23505', message: 'duplicate key' }))
    const res = await f('https://x.supabase.co/rest/v1/tasks', { method: 'POST', headers: hdrs, body: JSON.stringify({ title: '' }) })
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(1)
    await f('https://x.supabase.co/rest/v1/rpc/app_my_day', { method: 'POST', headers: hdrs, body: JSON.stringify({ x: '' }) })
    expect(calls[1].body).toEqual({ x: '' })
  })
})
