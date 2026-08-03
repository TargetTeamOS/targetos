'use strict'
// api/send-offer.js — sends the current generated offer PDF from the
// AUTHENTICATED AGENT'S OWN connected mailbox (Outlook via Microsoft
// Graph, or Gmail), never the shared system Resend mailbox
// (api/send-email.js) and never a caller-supplied sender.
//
// Deliberately a NEW, additive endpoint rather than extending
// api/connector-send.js: that file is shared general-purpose CRM email
// (Email tab, TC correspondence, etc.) and modifying it risks
// regressions in unrelated boards. This reuses its underlying OAuth
// helpers (api/_lib/connectors.js) directly rather than duplicating
// token-refresh logic.
//
// Body: { offer_id, revision_id, provider: 'outlook'|'gmail',
//         recipients: [{ role, name, email }], subject, message,
//         idempotency_key }

const { requireUser } = require('./_lib/auth')
const {
  getAgentAccount, freshAccountToken, agentIdFromAuthUser, sb: connectorsSb,
} = require('./_lib/connectors')
const {
  getOffersServiceClient, verifyOfferOwnership, logOfferEvent, isSendTestEnabled,
} = require('./_lib/offersDb')

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

/**
 * Pure decision: given an existing offer_sends row (or null) for this
 * idempotency key, should the handler skip straight to a cached
 * "alreadySent" response instead of attempting delivery again?
 * Exported for direct unit testing without mocking the whole request/
 * Supabase/provider chain.
 */
function shouldSkipAsAlreadySent(existingSend) {
  return !!existingSend
}

/**
 * Pure decision: is a real provider call permitted right now? Fails
 * closed — anything other than the literal string 'true' blocks it.
 */
function isExternalEffectsEnabled(env) {
  return String((env || process.env).EXTERNAL_EFFECTS_ENABLED || '').toLowerCase() === 'true'
}

module.exports = async function handler(req, res) {
  const __user = await requireUser(req)
  if (!__user) {
    // Sending is a real external effect and a money/identity-adjacent
    // action — unlike several older endpoints in this codebase, this
    // one is NOT staged behind AUTH_ENFORCE log-only mode. It fails
    // closed from the start.
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'unauthorized' }))
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const body = await parseBody(req)
  const offerId     = body.offer_id
  const revisionId  = body.revision_id
  const provider    = body.provider === 'gmail' ? 'gmail' : 'outlook'
  const recipients  = Array.isArray(body.recipients) ? body.recipients.filter(r => r && r.email) : []
  const subject     = String(body.subject || '').trim() || 'Offer for the Sale of Real Estate'
  const message     = String(body.message || '')
  const idempotencyKey = String(body.idempotency_key || '').trim()

  if (!offerId || !revisionId) return res.status(400).json({ error: 'offer_id and revision_id are required' })
  if (recipients.length === 0) return res.status(400).json({ error: 'At least one recipient is required' })
  if (!idempotencyKey) return res.status(400).json({ error: 'idempotency_key is required' })

  const sb = getOffersServiceClient()
  if (!sb) return res.status(500).json({ error: 'Server database is not configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing)' })

  // ── OWNERSHIP ────────────────────────────────────────────────────
  const ownership = await verifyOfferOwnership(sb, offerId, __user.id)
  if (!ownership.ok) return res.status(ownership.status).json({ error: ownership.message })

  try {
    // ── IDEMPOTENCY — check for an existing send with this key first ──
    // Prevents double-click and prevents a retried request (e.g. after
    // a client-side timeout) from sending the same offer twice, even if
    // the original request actually succeeded server-side.
    const { data: existingSend } = await sb.from('offer_sends')
      .select('*').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (shouldSkipAsAlreadySent(existingSend)) {
      return res.status(200).json({
        ok: true, alreadySent: true,
        status: existingSend.status, sentAt: existingSend.sent_at,
      })
    }

    // ── LOAD THE REVISION + ITS STORED PDF ──────────────────────────
    const { data: revision, error: revErr } = await sb.from('offer_revisions')
      .select('*').eq('id', revisionId).eq('offer_id', offerId).single()
    if (revErr || !revision) return res.status(404).json({ error: 'Revision not found for this offer' })
    if (!revision.pdf_path) return res.status(409).json({ error: 'This revision has no generated PDF yet — generate the PDF before sending' })

    const { data: pdfFile, error: dlErr } = await sb.storage.from('offer-docs').download(revision.pdf_path)
    if (dlErr || !pdfFile) return res.status(500).json({ error: 'Could not retrieve the generated PDF for this revision' })
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
    const pdfFilename = revision.pdf_path.split('/').pop()

    // ── CREATE THE 'QUEUED' SEND RECORD BEFORE ATTEMPTING DELIVERY ──
    // So a crash mid-send is recoverable/inspectable rather than lost,
    // and so the idempotency key is claimed before any external call.
    const { data: sendRow, error: insertErr } = await sb.from('offer_sends').insert({
      offer_id: offerId, revision_id: revisionId, sent_by: ownership.agent.id,
      provider, recipients, subject, message_snapshot: message,
      pdf_document_id: revision.pdf_document_id || null,
      status: 'Queued', idempotency_key: idempotencyKey,
    }).select().single()
    if (insertErr) {
      // Unique-constraint violation on idempotency_key means a
      // concurrent request already claimed it — treat as already-sent,
      // not as a new failure.
      if (String(insertErr.message || '').includes('duplicate') || insertErr.code === '23505') {
        const { data: raceWinner } = await sb.from('offer_sends')
          .select('*').eq('idempotency_key', idempotencyKey).maybeSingle()
        return res.status(200).json({ ok: true, alreadySent: true, status: raceWinner?.status })
      }
      throw insertErr
    }

    // ── EXTERNAL EFFECTS GATE (two independent layers) ──────────────
    // Real sends require BOTH: (1) the global EXTERNAL_EFFECTS_ENABLED
    // env var, and (2) the offers_v2_send_test feature flag explicitly
    // allowing THIS agent specifically (Admin-managed, same
    // feature_flags table as offers_v2_beta — not a new mechanism).
    // Requirement: "the rest of Offers V2 must remain testable while
    // send effects are disabled" — everything above this point
    // (idempotency claim, ownership check, PDF retrieval) still runs
    // for real regardless; only the actual provider call is skipped.
    const externalEffectsEnabled = isExternalEffectsEnabled()
    const sendTestEnabled = externalEffectsEnabled && await isSendTestEnabled(sb, ownership.agent.id)
    if (!sendTestEnabled) {
      await sb.from('offer_sends').update({
        status: 'Failed',
        error_message: !externalEffectsEnabled
          ? 'EXTERNAL_EFFECTS_ENABLED is not true — real send blocked in this environment'
          : 'offers_v2_send_test flag does not allow this agent yet — ask an admin to enable it for you in Admin -> Features',
      }).eq('id', sendRow.id)
      return res.status(200).json({
        ok: true, preview: true, sent: false,
        message: !externalEffectsEnabled
          ? 'External effects are disabled — this send was validated end-to-end but not actually delivered. Set EXTERNAL_EFFECTS_ENABLED=true to send for real.'
          : 'This send was validated end-to-end but not actually delivered — the offers_v2_send_test flag does not yet allow your account. An admin can enable it for specific testers in Admin -> Features.',
        sendId: sendRow.id,
      })
    }

    // ── RESOLVE THE AGENT'S OWN CONNECTED MAILBOX ───────────────────
    const acct = await getAgentAccount(ownership.agent.id, provider === 'gmail' ? 'google' : 'outlook')
    if (!acct || acct.status !== 'connected') {
      await sb.from('offer_sends').update({
        status: 'Failed', error_message: provider + ' is not connected for this agent',
      }).eq('id', sendRow.id)
      return res.status(400).json({ error: (provider === 'gmail' ? 'Gmail' : 'Outlook') + ' is not connected — connect your account in Settings first' })
    }
    const token = await freshAccountToken(provider === 'gmail' ? 'google' : 'outlook', acct)
    const fromAccount = acct.account_email || provider

    let providerOk = false
    let providerMessageId = null
    let providerError = null

    if (provider === 'outlook') {
      const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'Text', content: message },
            toRecipients: recipients.map(r => ({ emailAddress: { address: r.email, name: r.name || undefined } })),
            attachments: [{
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: pdfFilename,
              contentType: 'application/pdf',
              contentBytes: pdfBuffer.toString('base64'),
            }],
          },
          saveToSentItems: true,
        }),
      })
      // Microsoft Graph returns 202 Accepted with no body on success —
      // this IS "Microsoft confirms acceptance" per the spec; anything
      // else is a failure, not a maybe.
      providerOk = r.status === 202
      if (!providerOk) providerError = (await r.text()).slice(0, 500)
    } else {
      const mimeParts = [
        'To: ' + recipients.map(r => r.email).join(', '),
        'Subject: ' + subject,
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="offer_boundary"',
        '',
        '--offer_boundary',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        message,
        '',
        '--offer_boundary',
        'Content-Type: application/pdf; name="' + pdfFilename + '"',
        'Content-Disposition: attachment; filename="' + pdfFilename + '"',
        'Content-Transfer-Encoding: base64',
        '',
        pdfBuffer.toString('base64'),
        '--offer_boundary--',
      ]
      const raw = Buffer.from(mimeParts.join('\r\n')).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })
      providerOk = r.ok
      if (providerOk) {
        const j = await r.json().catch(() => ({}))
        providerMessageId = j.id || null
      } else {
        providerError = (await r.text()).slice(0, 500)
      }
    }

    if (!providerOk) {
      // Provider rejected it — the send row stays 'Failed', the offer's
      // status is untouched (never marked Sent before real acceptance),
      // and the draft is preserved so the agent can retry.
      await sb.from('offer_sends').update({ status: 'Failed', error_message: providerError }).eq('id', sendRow.id)
      return res.status(502).json({ error: 'Send failed: ' + providerError })
    }

    // ── SUCCESS — mark Sent exactly once, regardless of what happens next ──
    const sentAt = new Date().toISOString()
    await sb.from('offer_sends').update({
      status: 'Sent', sent_at: sentAt, provider_message_id: providerMessageId,
    }).eq('id', sendRow.id)
    await sb.from('offer_revisions').update({ send_status: 'Sent', sent_at: sentAt }).eq('id', revisionId)
    // Business rule from Commit 2: an offer only becomes 'Sent' once an
    // actual send succeeds — never automatically on save.
    await sb.from('offers').update({ status: 'Sent' }).eq('id', offerId).eq('status', 'Draft')

    // Everything below is best-effort logging AFTER the real send
    // already succeeded — a failure here must never be reported back to
    // the caller as a send failure (that would risk a client retry and
    // a real duplicate email), and must never re-attempt the send.
    try {
      await logOfferEvent(sb, {
        agentId: ownership.agent.id, offerId, action: 'offer_sent',
        metadata: { revision_id: revisionId, provider, recipients: recipients.map(r => r.email), from: fromAccount },
      })
    } catch (e) { console.warn('[send-offer] audit log failed after successful send:', e.message) }

    try {
      for (const r of recipients) {
        if (r.contact_id) {
          await connectorsSb().from('tasks').insert([{
            contact_id: r.contact_id,
            title: 'Offer sent: ' + subject,
            notes: 'Sent to ' + r.email + ' from ' + fromAccount + ' (revision ' + revision.revision_number + ')',
            priority: 'note', status: 'done',
          }])
        }
      }
    } catch (e) { console.warn('[send-offer] contact timeline log failed after successful send:', e.message) }

    return res.status(200).json({ ok: true, sent: true, sentAt, from: fromAccount, sendId: sendRow.id })
  } catch (e) {
    console.error('[send-offer]', e.message)
    return res.status(500).json({ error: e.message })
  }
}

// Exposed for testing only (src/__tests__/sendOffer.test.js).
module.exports.shouldSkipAsAlreadySent = shouldSkipAsAlreadySent
module.exports.isExternalEffectsEnabled = isExternalEffectsEnabled
