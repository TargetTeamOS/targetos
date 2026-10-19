'use strict'
// api/webhook-inbound.js — receives events FROM Zapier / API Nation
// (Brivity syncs travel through API Nation to here).
// Security: shared secret in the X-Webhook-Secret header, checked
// against integrations.secrets.webhook_secret using a constant-time
// comparison. Always enforced — this endpoint is NOT behind
// AUTH_ENFORCE because callers are machines.
//
// SECURITY (Oct 2026 audit): this used to also accept the secret via
// ?secret=... in the URL. Query strings routinely end up in proxy/
// server access logs, browser history, and Referer headers -- all
// places a header never goes -- so a URL-borne secret is far more
// likely to leak. The header-only inbound_url this project hands to
// Zapier/API Nation (see api/connectors.js) never relied on the query
// param anyway. Comparison also now uses crypto.timingSafeEqual on
// fixed-length buffers instead of plain !==, so a mismatch can't be
// timed to recover the secret byte-by-byte.
//
// Supported events (body.event):
//   contact.create — { first_name|name, last_name, email, phone, source, tags }
//   note.add       — { contact_email|contact_phone, text }
// Everything is logged to integration_events either way.

const crypto = require('crypto')
const { sb, getIntegration, logEvent } = require('./_lib/connectors')

function secretsMatch(expected, provided) {
  const a = Buffer.from(String(expected))
  const b = Buffer.from(String(provided))
  // timingSafeEqual throws on a length mismatch -- check first and
  // treat that as "not equal" without ever calling it on unequal input.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

function normPhone(p) {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d.startsWith('1')) return '+' + d
  return d ? '+' + d : ''
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'POST only' })) }

  try {
    const url = new URL(req.url, 'https://x')
    const source = url.searchParams.get('source') === 'apination' ? 'apination' : 'zapier'
    const integ = await getIntegration(source)
    if (!integ) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'run sql/connectors.sql first' })) }

    const expected = (integ.secrets || {}).webhook_secret || ''
    const provided = req.headers['x-webhook-secret'] || ''
    if (!expected || !provided || !secretsMatch(expected, provided)) {
      console.warn('[webhook-inbound] BLOCKED bad secret from ' + source)
      res.statusCode = 401; return res.end(JSON.stringify({ error: 'bad secret' }))
    }

    const body = await parseBody(req)
    const event = String(body.event || 'contact.create')
    const d = body.data || body

    if (event === 'contact.create') {
      const first = d.first_name || (d.name ? String(d.name).split(' ')[0] : '')
      const last  = d.last_name  || (d.name ? String(d.name).split(' ').slice(1).join(' ') : '')
      const email = String(d.email || '').trim().toLowerCase()
      const phone = normPhone(d.phone)
      if (!first && !email && !phone) {
        await logEvent(source, 'in', event, { error: 'empty payload', got: d }, false)
        res.statusCode = 400; return res.end(JSON.stringify({ error: 'need at least name, email, or phone' }))
      }

      // dedupe by email or phone
      let existing = null
      if (email) {
        const { data } = await sb().from('contacts').select('id').eq('email', email).maybeSingle()
        existing = data
      }
      if (!existing && phone) {
        const { data } = await sb().from('contacts').select('id').eq('phone', phone).maybeSingle()
        existing = data
      }
      if (existing) {
        await logEvent(source, 'in', event, { deduped: true, contact_id: existing.id }, true)
        res.statusCode = 200; return res.end(JSON.stringify({ ok: true, deduped: true, contact_id: existing.id }))
      }

      const row = {
        first_name: first || 'Unknown',
        last_name: last || '',
        email: email || null,
        phone: phone || null,
        source: d.source || (source === 'apination' ? 'Brivity/API Nation' : 'Zapier'),
      }
      const { data: created, error } = await sb().from('contacts').insert([row]).select('id').single()
      if (error) throw new Error('contact insert failed: ' + error.message)
      await logEvent(source, 'in', event, { contact_id: created.id, source: row.source }, true)
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true, contact_id: created.id }))
    }

    if (event === 'note.add') {
      const email = String(d.contact_email || '').trim().toLowerCase()
      const phone = normPhone(d.contact_phone)
      let contact = null
      if (email) {
        const { data } = await sb().from('contacts').select('id').eq('email', email).maybeSingle(); contact = data
      }
      if (!contact && phone) {
        const { data } = await sb().from('contacts').select('id').eq('phone', phone).maybeSingle(); contact = data
      }
      if (!contact) {
        await logEvent(source, 'in', event, { error: 'contact not found', got: d }, false)
        res.statusCode = 404; return res.end(JSON.stringify({ error: 'contact not found' }))
      }
      const { error } = await sb().from('tasks').insert([{
        contact_id: contact.id,
        title: 'Note from ' + (source === 'apination' ? 'Brivity/API Nation' : 'Zapier'),
        notes: String(d.text || '').slice(0, 5000),
        priority: 'note',
        status: 'pending',
      }])
      if (error) throw new Error('note insert failed: ' + error.message)
      await logEvent(source, 'in', event, { contact_id: contact.id }, true)
      res.statusCode = 200; return res.end(JSON.stringify({ ok: true, contact_id: contact.id }))
    }

    await logEvent(source, 'in', event, { error: 'unknown event', got: body }, false)
    res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown event: ' + event }))
  } catch (e) {
    console.error('[webhook-inbound] ' + e.message)
    res.statusCode = 500; res.end(JSON.stringify({ error: e.message }))
  }
}
