// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Outgoing payload sanitizer (Oct 2026)
//
// Forms keep "no selection" as an empty string ("" from a blank input,
// a cleared date, "— Same as deal agent —", a hidden field...). Postgres
// rejects "" for uuid / numeric / integer / date / timestamp / time /
// boolean columns ("invalid input syntax for type uuid: \"\""), and the
// WHOLE save fails. This was patched form-by-form before and kept coming
// back (Tasks, TC tasks, Gifts...), so it is now handled ONCE, for every
// insert / update / upsert the app sends, in the Supabase client's fetch
// (see src/lib/supabase.js). No form needs its own fix.
//
// Two layers:
//  1. Schema-aware (precise): the table/column types come from the
//     database's own API description (PostgREST OpenAPI, fetched once and
//     cached). "" on any non-text column becomes null. Text columns keep "".
//  2. Fallback (always on): if the schema description isn't available and
//     the database still rejects an empty string (error 22P02 / 22007 /
//     22008 mentioning ""), the request is retried once with every "" set
//     to null. A failed insert/update changes nothing, so the retry is safe.
// ═══════════════════════════════════════════════════════════════

// Column formats that accept "" as a valid value. Everything else
// (uuid, numeric, integer, bigint, date, timestamp..., time, boolean,
// json/jsonb, arrays, enums) rejects it.
const TEXT_LIKE = /^(text|character|citext|name|"char"|char\b)/i

export function isTextFormat(format) {
  return TEXT_LIKE.test(String(format || ''))
}

// Build { table: { column: format } } from a PostgREST OpenAPI (Swagger 2)
// document. Unknown shapes yield an empty map, never a throw.
export function columnTypesFromOpenApi(spec) {
  const out = {}
  const defs = (spec && spec.definitions) || {}
  for (const table of Object.keys(defs)) {
    const props = (defs[table] && defs[table].properties) || {}
    const cols = {}
    for (const col of Object.keys(props)) {
      const p = props[col] || {}
      cols[col] = p.format || p.type || ''
    }
    out[table] = cols
  }
  return out
}

function mapRows(body, fn) {
  if (Array.isArray(body)) return body.map(r => (r && typeof r === 'object' && !Array.isArray(r)) ? fn(r) : r)
  if (body && typeof body === 'object') return fn(body)
  return body
}

// Layer 1: "" -> null on every column of `table` whose type isn't text-like.
// Columns we have no type for are left untouched (layer 2 covers them).
export function nullEmptyNonText(body, columnTypes) {
  if (!columnTypes) return body
  return mapRows(body, row => {
    let changed = false
    const out = { ...row }
    for (const k of Object.keys(out)) {
      if (out[k] === '' && Object.prototype.hasOwnProperty.call(columnTypes, k) && !isTextFormat(columnTypes[k])) {
        out[k] = null
        changed = true
      }
    }
    return changed ? out : row
  })
}

// Layer 2: every "" -> null (only used to retry a request the database
// already rejected because of an empty string).
export function nullAllEmpty(body) {
  return mapRows(body, row => {
    let changed = false
    const out = { ...row }
    for (const k of Object.keys(out)) {
      if (out[k] === '') { out[k] = null; changed = true }
    }
    return changed ? out : row
  })
}

export function hasEmptyString(body) {
  const rows = Array.isArray(body) ? body : [body]
  return rows.some(r => r && typeof r === 'object' && Object.values(r).some(v => v === ''))
}

// Postgres errors raised by an empty string in a typed column.
export function isEmptyStringTypeError(err) {
  if (!err) return false
  const code = String(err.code || '')
  const msg = String(err.message || '')
  return ['22P02', '22007', '22008'].includes(code) && msg.indexOf('""') !== -1
}

// "/rest/v1/tasks?select=*" -> "tasks"; RPC calls and non-REST URLs -> null.
export function restTableFromUrl(url) {
  const m = String(url || '').match(/\/rest\/v1\/([^/?#]+)/)
  if (!m || m[1] === 'rpc') return null
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

// ── fetch wrapper used by the Supabase client ─────────────────────
// createSanitizingFetch(baseUrl) returns a fetch(input, init) that
// cleans insert/update/upsert bodies sent to /rest/v1/<table>.
export function createSanitizingFetch(baseUrl) {
  let typesPromise = null // resolves to { table: {col: format} } or null

  function realFetch() {
    return (typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch.bind(globalThis) : null
  }

  function loadTypes(headers) {
    if (typesPromise) return typesPromise
    const f = realFetch()
    if (!f) return Promise.resolve(null)
    const h = {}
    try {
      const src = new Headers(headers || {})
      const apikey = src.get('apikey'); const auth = src.get('authorization')
      if (apikey) h.apikey = apikey
      if (auth) h.Authorization = auth
    } catch { /* no headers */ }
    h.Accept = 'application/openapi+json'
    typesPromise = f(String(baseUrl).replace(/\/+$/, '') + '/rest/v1/', { method: 'GET', headers: h })
      .then(r => (r.ok ? r.json() : null))
      .then(spec => {
        const types = spec ? columnTypesFromOpenApi(spec) : null
        return types && Object.keys(types).length ? types : null
      })
      .catch(() => null)
    return typesPromise
  }

  return async function sanitizingFetch(input, init) {
    const f = realFetch()
    const url = typeof input === 'string' ? input : (input && (input.href || input.url)) || ''
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    const table = restTableFromUrl(url)
    const bodyStr = init && typeof init.body === 'string' ? init.body : null

    // Only writes to a table with a JSON body are touched.
    if (!table || !bodyStr || !['POST', 'PATCH', 'PUT'].includes(method)) return f(input, init)

    let body
    try { body = JSON.parse(bodyStr) } catch { return f(input, init) }
    if (!hasEmptyString(body)) return f(input, init)

    // Layer 1 — precise, schema-aware.
    const types = await loadTypes(init.headers)
    const cleaned = types && types[table] ? nullEmptyNonText(body, types[table]) : body
    const res = await f(input, cleaned === body ? init : { ...init, body: JSON.stringify(cleaned) })
    if (res.ok || res.status !== 400 || !hasEmptyString(cleaned)) return res

    // Layer 2 — the database rejected an empty string we couldn't type.
    let err = null
    try { err = await res.clone().json() } catch { /* not JSON */ }
    if (!isEmptyStringTypeError(err)) return res
    console.warn('[payloadSanitize] retrying ' + method + ' ' + table + ' with empty strings as null (' + (err && err.message) + ')')
    return f(input, { ...init, body: JSON.stringify(nullAllEmpty(cleaned)) })
  }
}
