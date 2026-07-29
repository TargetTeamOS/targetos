'use strict'
// api/_lib/gmailParse.js — PURE helpers to normalize a Gmail API message
// resource into the shape stored in email_messages. No I/O, no secrets.

function headerMap(payload) {
  const out = {}
  const hs = (payload && payload.headers) || []
  for (const h of hs) if (h && h.name) out[h.name.toLowerCase()] = h.value
  return out
}

function b64urlDecode(data) {
  if (!data) return ''
  try {
    const b64 = String(data).replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(b64, 'base64').toString('utf8')
  } catch (e) { return '' }
}

// Walk the MIME tree collecting the first text/plain and text/html bodies,
// and whether any part is an attachment (filename or attachmentId).
function collectBodies(payload, acc) {
  acc = acc || { text: '', html: '', hasAttachments: false }
  if (!payload) return acc
  const mime = payload.mimeType || ''
  const filename = payload.filename || ''
  const bodyData = payload.body && payload.body.data
  const attachmentId = payload.body && payload.body.attachmentId
  const isAttachment = !!(filename || attachmentId)
  if (isAttachment && (attachmentId || (payload.body && payload.body.size))) acc.hasAttachments = true
  // Never treat an attached text/html or text/plain file as the message body.
  if (!isAttachment && mime === 'text/plain' && bodyData && !acc.text) acc.text = b64urlDecode(bodyData)
  else if (!isAttachment && mime === 'text/html' && bodyData && !acc.html) acc.html = b64urlDecode(bodyData)
  for (const p of (payload.parts || [])) collectBodies(p, acc)
  return acc
}

// Split an address header into individual addresses (best-effort).
function splitAddresses(v) {
  if (!v) return []
  return String(v).split(',').map(s => extractEmail(s)).filter(Boolean)
}

// Pull the bare email out of a "Name <a@b.com>" style value.
function extractEmail(v) {
  if (!v) return ''
  const m = /<([^>]+)>/.exec(v)
  const raw = (m ? m[1] : v).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : ''
}

// Normalize a Gmail message resource. direction defaults to 'inbound'.
function parseGmailMessage(gmsg, direction) {
  if (!gmsg) return null
  const h = headerMap(gmsg.payload)
  const bodies = collectBodies(gmsg.payload)
  let sentAt = null
  if (h['date']) { const d = new Date(h['date']); if (!isNaN(d.getTime())) sentAt = d.toISOString() }
  if (!sentAt && gmsg.internalDate) { const d = new Date(Number(gmsg.internalDate)); if (!isNaN(d.getTime())) sentAt = d.toISOString() }
  return {
    provider: 'google',
    provider_message_id: gmsg.id || null,
    provider_thread_id: gmsg.threadId || null,
    internet_message_id: h['message-id'] || h['message-id'.toUpperCase()] || null,
    in_reply_to: h['in-reply-to'] || null,
    references: h['references'] || null,
    from_address: extractEmail(h['from']) || null,
    to_addresses: splitAddresses(h['to']),
    cc_addresses: splitAddresses(h['cc']),
    subject: h['subject'] || null,
    body_text: bodies.text || null,
    body_html: bodies.html || null,
    has_attachments: !!bodies.hasAttachments,
    direction: direction === 'outbound' ? 'outbound' : 'inbound',
    sent_at: sentAt,
    received_at: direction === 'outbound' ? null : sentAt,
    // Limited, non-sensitive provider metadata only (never the raw payload).
    provider_payload_metadata: {
      label_ids: gmsg.labelIds || null,
      size_estimate: gmsg.sizeEstimate || null,
      history_id: gmsg.historyId || null,
    },
  }
}

module.exports = { headerMap, b64urlDecode, collectBodies, splitAddresses, extractEmail, parseGmailMessage }
