'use strict'
// ── Offers v2 — server-side data helpers ────────────────────────────
// SECURITY NOTE (found during this project, not introduced by it):
// api/_lib/phone.js's getSupabase() falls back to a HARD-CODED Supabase
// project URL and a hard-coded anon/publishable key when env vars are
// missing (verified: 13 occurrences of the literal project ref and key
// across api/ and src/, 31 API handlers importing _lib/phone). This is
// exactly the "hard-coded Supabase project fallback" / "browser key on
// the server" pattern the System Core Handoff requires failing closed
// on, and it's already the explicit subject of an open, unmerged PR
// (#5, "config: fail closed Supabase project selection") elsewhere in
// this repo. Per the handoff's own rule ("do not change unrelated
// boards/infrastructure while fixing another one"), this file does NOT
// touch _lib/phone.js — that fix belongs to PR #5. Instead, all new
// server-side Offers v2 code gets its own explicit, fail-closed client
// so this project does not perpetuate the pattern while it's pending
// a proper fix.

function getOffersServiceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    // Fail closed: no client, no fallback, no hard-coded project.
    return null
  }
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Verifies the authenticated agent may act on this offer. Service-role
 * clients bypass RLS, so this check is mandatory here, not optional —
 * per the handoff: "every service-role API must apply explicit business
 * authorization and ownership checks."
 *
 * @returns {Promise<{ok:boolean, status?:number, message?:string, offer?:object}>}
 */
async function verifyOfferOwnership(sb, offerId, authUserId) {
  if (!offerId || !authUserId) return { ok: false, status: 400, message: 'Missing offer or user' }

  const { data: agentRow, error: agentErr } = await sb
    .from('agents').select('id, role, active')
    .eq('auth_user_id', authUserId).single()
  if (agentErr || !agentRow || agentRow.active === false) {
    return { ok: false, status: 403, message: 'No active agent profile linked to this login' }
  }

  const { data: offer, error: offerErr } = await sb
    .from('offers').select('id, agent_id, buyers_agent_id')
    .eq('id', offerId).single()
  if (offerErr || !offer) {
    return { ok: false, status: 404, message: 'Offer not found' }
  }

  const isAdmin = agentRow.role === 'admin'
  const isOwner = offer.agent_id === agentRow.id || offer.buyers_agent_id === agentRow.id
  if (!isAdmin && !isOwner) {
    return { ok: false, status: 403, message: 'Not authorized for this offer' }
  }

  return { ok: true, offer, agent: agentRow }
}

/**
 * Inserts the next offer_revisions row for an offer and advances
 * offers.current_revision_id to point at it. Not wrapped in a real DB
 * transaction (no RPC/stored procedure exists yet for this — noted as
 * a follow-up rather than silently assumed safe under concurrent
 * edits); see docs/offers-v2-audit.md concurrency notes.
 */
async function createOfferRevision(sb, { offerId, createdBy, snapshot, pdfDocumentId, pdfPath }) {
  const { data: last } = await sb
    .from('offer_revisions').select('revision_number')
    .eq('offer_id', offerId).order('revision_number', { ascending: false }).limit(1)
  const nextNumber = (last && last[0] && last[0].revision_number || 0) + 1

  const { data: revision, error } = await sb.from('offer_revisions').insert({
    offer_id: offerId,
    revision_number: nextNumber,
    created_by: createdBy,
    field_snapshot: snapshot,
    purchase_price: snapshot.purchase_price || null,
    deposit_amount: snapshot.deposit || null,
    mortgage_amount: snapshot.mortgage_amount || null,
    balance_at_closing: snapshot.balance_at_closing || null,
    net_to_seller: snapshot.net_to_seller || null,
    additional_terms: snapshot.additional_terms || null,
    contingencies: {
      subject_attorney: !!snapshot.subject_attorney,
      subject_clear_title: !!snapshot.subject_clear_title,
      subject_mortgage: !!snapshot.subject_mortgage,
      subject_cash: !!snapshot.subject_cash,
      subject_standard_inspection: !!snapshot.subject_standard_inspection,
      subject_structural: !!snapshot.subject_structural,
    },
    pdf_document_id: pdfDocumentId || null,
    pdf_path: pdfPath || null,
    send_status: 'Draft',
  }).select().single()
  if (error) throw error

  await sb.from('offers').update({ current_revision_id: revision.id }).eq('id', offerId)
  return revision
}

/**
 * Uploads the generated PDF to private Storage under a path scoped to
 * the offer and revision, distinct from the supporting-documents path
 * (offer-docs/offers/*, pof/*) already used by the Documents tab.
 */
async function storeGeneratedPdf(sb, { offerId, revisionNumber, bytes, filename }) {
  const path = 'offers/' + offerId + '/revisions/' + revisionNumber + '/' + filename
  const { error } = await sb.storage.from('offer-docs').upload(path, Buffer.from(bytes), {
    contentType: 'application/pdf',
    upsert: false, // never overwrite a previously generated revision's PDF
  })
  if (error) throw error
  return path
}

/**
 * Audit log entry — reuses the EXACT same table/shape as src/lib/db.js's
 * log()/logDiff() helpers (table `audit_log`, not a guessed name), so
 * this doesn't repeat the handoff's documented historical mismatch
 * where writes and reads used different activity tables and a listing
 * activity view appeared empty as a result. Verified against db.js
 * directly before writing this, not assumed.
 */
async function logOfferEvent(sb, { agentId, offerId, action, metadata }) {
  try {
    await sb.from('audit_log').insert({
      agent_id: agentId || null,
      table_name: 'offers',
      record_id: String(offerId),
      action,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    // Audit failures must not block the primary operation (PDF already
    // generated/stored by this point) but must not be silent either.
    console.warn('[offers-v2] audit log failed:', e.message)
  }
}

module.exports = {
  getOffersServiceClient,
  verifyOfferOwnership,
  createOfferRevision,
  storeGeneratedPdf,
  logOfferEvent,
}
