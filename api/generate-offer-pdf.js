// TargetOS V2 — Fill Offer For Sale PDF using named form fields
// Uses the Acrobat-prepared PDF with 37 named fields — zero coordinate guessing
'use strict'

const { PDFDocument, StandardFonts } = require('pdf-lib')
const fs   = require('fs')
const path = require('path')
const { requireAnyAgent } = require('./_lib/phone')
const { computeOfferFinancials } = require('./_lib/offerCalc')
const {
  getOffersServiceClient, verifyOfferOwnership,
  createOfferRevision, storeGeneratedPdf, logOfferEvent,
} = require('./_lib/offersDb')

const TEMPLATE = path.join(__dirname, 'Offer_For_Sale_Form.pdf')

// Additional Terms prints across 3 lines on the template. Widths measured
// directly from the template's own field widget rects (sql/offers_v2
// audit), not guessed:
//   line 1 (after the "Additional Terms:" label): 444.24pt
//   line 2: 526.08pt
//   line 3: 526.08pt
const ADDITIONAL_TERMS_LINE_WIDTHS = [444.24, 526.08, 526.08]
const ADDITIONAL_TERMS_MAX_FONT = 9
const ADDITIONAL_TERMS_MIN_FONT = 7 // approved readable floor — do not go smaller

// Closing time frame field: single line, 67.68pt wide (measured
// directly: rect [184.32, 408.72, 252.0, 421.44]), immediately followed
// on the printed page by the STATIC word "DAYS" baked into the page
// content itself — not part of this field, cannot be moved. Only
// relevant for closing_mode='custom'; 'days'/'on_or_about'/
// 'on_or_before' always resolve to a plain number that fits trivially.
const CLOSING_DAYS_FIELD_WIDTH = 67.68

/**
 * Greedy word-wrap into the given per-line width budgets at a given font
 * size, using the real Helvetica metrics baked into pdf-lib (not a
 * character-count guess). Returns null if the text does not fit within
 * the available lines at this font size.
 */
function wrapToLines(font, text, fontSize, lineWidths) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const trial = current ? current + ' ' + word : word
    const budget = lineWidths[lines.length]
    if (budget === undefined) return null // ran out of lines
    if (font.widthOfTextAtSize(trial, fontSize) <= budget) {
      current = trial
    } else {
      if (!current) return null // a single word alone doesn't fit this line
      lines.push(current)
      current = word
      if (lines.length >= lineWidths.length) return null
      if (font.widthOfTextAtSize(current, fontSize) > lineWidths[lines.length]) return null
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Finds the largest font size within the approved range that makes the
 * text fit the template's 3 fixed lines. Never truncates — returns
 * { ok:false } when even the minimum approved size doesn't fit, so the
 * caller can refuse generation and ask for shorter wording instead.
 */
function fitAdditionalTerms(font, text) {
  if (!text) return { ok: true, lines: [], fontSize: ADDITIONAL_TERMS_MAX_FONT }
  for (let size = ADDITIONAL_TERMS_MAX_FONT; size >= ADDITIONAL_TERMS_MIN_FONT; size -= 0.5) {
    const lines = wrapToLines(font, text, size, ADDITIONAL_TERMS_LINE_WIDTHS)
    if (lines) return { ok: true, lines, fontSize: size }
  }
  return { ok: false }
}

/**
 * Resolves whatever the closing-terms UI collected into the single
 * plain value that goes into the printed field, immediately followed
 * on the page by the static word "DAYS". Never returns a raw date —
 * the page cannot fit one there (see migration D's comment).
 */
function resolveClosingDaysPrintValue(data) {
  const mode = data.closing_mode || 'days'
  if (mode === 'days') {
    return { ok: true, text: data.closing_days ? String(data.closing_days) : '' }
  }
  if (mode === 'on_or_about' || mode === 'on_or_before') {
    if (!data.closing_target_date || !data.offer_date) {
      return { ok: false, error: 'A target date is required for "' + mode.replace(/_/g, ' ') + '".' }
    }
    const days = Math.round((new Date(data.closing_target_date) - new Date(data.offer_date)) / 86400000)
    if (!isFinite(days) || days < 0) {
      return { ok: false, error: 'The closing target date must be on or after the offer date.' }
    }
    // Deliberately prints a plain number, not the date or the word
    // "about"/"before" — the field is 67.68pt wide, immediately
    // followed by the static printed word "DAYS", and cannot fit more
    // than a short number without overflowing or reading as broken
    // text glued onto "DAYS". The actual picked date is preserved in
    // offers.closing_target_date and shown in the CRM, not on the PDF.
    return { ok: true, text: String(days) }
  }
  if (mode === 'custom') {
    const text = (data.closing_custom_text || '').trim()
    if (!text) return { ok: true, text: '' }
    return { ok: true, text } // width-checked by the caller against CLOSING_DAYS_FIELD_WIDTH
  }
  return { ok: true, text: data.closing_days ? String(data.closing_days) : '' }
}

function fmtMoney(v) {
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g,''))
  if (isNaN(n)) return ''
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits:0 })
}

function fmtDeposit(v, type) {
  if (!v) return ''
  const n = parseFloat(String(v).replace(/[$,%]/g,''))
  if (isNaN(n)) return ''
  return type === 'percent' ? n + '%' : fmtMoney(n)
}

function datePart(s, p) {
  if (!s) return ''
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return [String(parseInt(m[2])), String(parseInt(m[3])), m[1].slice(2)][p]
}

/**
 * Pure PDF-building logic, separated from the HTTP/auth layer so it can
 * be exercised directly in tests without mocking Supabase auth. Returns
 * either { ok:true, bytes, filename } or { ok:false, status, error }.
 */
async function buildOfferPdf(data) {
  const bytes  = fs.readFileSync(TEMPLATE)
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form   = pdfDoc.getForm()
  const helv   = await pdfDoc.embedFont(StandardFonts.Helvetica)

  function set(name, val) {
    try { form.getTextField(name).setText(String(val || '')) } catch(e) {}
  }

  const buyers_agent = data.buyers_agent_name || ''

  // ── SERVER-SIDE FINANCIAL VALIDATION ────────────────────────────
  // Do not trust browser-calculated values alone. Recompute with the
  // same shared engine the form uses (api/_lib/offerCalc.js) and
  // refuse to generate a PDF carrying blocking errors (negative
  // values, deposit > price, cash-deal conflicts, etc).
  const financials = computeOfferFinancials(data)
  if (financials.blocking.length > 0) {
    return { ok: false, status: 422, error: 'Cannot generate PDF: ' + financials.blocking.join(' ') }
  }

  // ── ADDITIONAL TERMS — measured fit, never truncated ────────────
  const termsFit = fitAdditionalTerms(helv, data.additional_terms || '')
  if (!termsFit.ok) {
    return {
      ok: false, status: 422,
      error: 'Additional Terms is too long to fit the printed form without shrinking below a readable size. Shorten the wording and try again.',
    }
  }

  // ── CLOSING TIME FRAME — resolve mode to the one printable value ──
  const closingResolved = resolveClosingDaysPrintValue(data)
  if (!closingResolved.ok) {
    return { ok: false, status: 422, error: closingResolved.error }
  }
  if (data.closing_mode === 'custom' && closingResolved.text) {
    // Single-line fit check against the field's real 67.68pt width —
    // never truncated, same rule as Additional Terms.
    let fits = false
    for (let size = ADDITIONAL_TERMS_MAX_FONT; size >= ADDITIONAL_TERMS_MIN_FONT; size -= 0.5) {
      if (helv.widthOfTextAtSize(closingResolved.text, size) <= CLOSING_DAYS_FIELD_WIDTH) { fits = true; break }
    }
    if (!fits) {
      return {
        ok: false, status: 422,
        error: 'Custom closing wording is too long to fit the printed "Closing time frame" line. Shorten it, or switch to a specific date ("On or about"/"On or before").',
      }
    }
  }

  // ── DATE ─────────────────────────────────────────────────────
  set('date_month', datePart(data.offer_date, 0))
  set('date_day',   datePart(data.offer_date, 1))
  set('date_year',  datePart(data.offer_date, 2))

  // ── PROPERTY ─────────────────────────────────────────────────
  set('address', data.listing_addr || '')
  set('mls_id',  data.mls_number   || '')

  // ── BUYER / SELLER ────────────────────────────────────────────
  set('buyer',    data.buyer_name     || '')
  set('co_buyer', data.co_buyer_name  || '')
  set('seller',   data.seller_name    || '')
  set('co_seller',data.co_seller_name || '')

  // ── FINANCIALS ── (server-recomputed values, not raw client input) ──
  set('purchase_price', fmtMoney(financials.values.purchase_price))
  set('deposit',        fmtDeposit(financials.values.deposit, data.deposit_type))
  set('concession',     fmtMoney(data.sellers_concession))
  set('net_to_seller',  fmtMoney(financials.values.net_to_seller))
  set('mortgage_amt',   fmtMoney(financials.values.mortgage_amount))
  set('mortgage_pct',   financials.values.mortgage_pct ? String(financials.values.mortgage_pct) + '%' : '')
  set('balance',        fmtMoney(financials.values.balance_at_closing))
  set('closing_days',   closingResolved.text)

  // ── SUBJECT TO — six checkbox squares ───────────────────────────
  // IMPORTANT CORRECTION: fields literally named x/x_2/x_3/x_4/x_5/x_6
  // are NOT these checkboxes — verified by their rects (y-center 76-125
  // on a 792pt-tall page): they are the six "x_____" SIGNATURE LINE
  // prefixes at the very bottom of the form (Buyer x2 + Agent x1,
  // Seller x2 + Agent x1). Writing to them, as an earlier pass in this
  // same session mistakenly did, would print an X onto blank signature
  // lines — a real violation of "preserve the signature lines" that a
  // visual render caught and this comment exists to prevent repeating.
  //
  // The six "Subject to" checkboxes have NO AcroForm field at all in
  // this template (confirmed: the full 37-field list has no field over
  // them) — they are vector-drawn squares with no fillable target.
  // Per the spec's own preference ("fill or overlay at fixed
  // coordinates rather than recreating the document"), an X is drawn
  // directly onto the page at coordinates measured from the template's
  // own text layout (pdftotext -bbox against each label), not guessed:
  const SUBJECT_TO_BOXES = [
    { key: 'subject_attorney',            baselineY: 487.9 },
    { key: 'subject_clear_title',         baselineY: 472.95 },
    { key: 'subject_mortgage',            baselineY: 457.71 },
    { key: 'subject_cash',                baselineY: 443.03 },
    { key: 'subject_standard_inspection', baselineY: 427.90 },
    { key: 'subject_structural',          baselineY: 412.97 },
  ]
  const SUBJECT_TO_BOX_X = 358.5
  const SUBJECT_TO_BOX_FONT_SIZE = 8
  for (const box of SUBJECT_TO_BOXES) {
    if (data[box.key]) {
      pdfDoc.getPage(0).drawText('X', {
        x: SUBJECT_TO_BOX_X,
        y: box.baselineY,
        size: SUBJECT_TO_BOX_FONT_SIZE,
        font: helv,
      })
    }
  }

  // ── TERMS ─────────────────────────────────────────────────────
  // Drawn directly at the template's own 3 line-widget rects rather
  // than set through the AcroForm field: verified that terms1's three
  // Kids share one /V value, so setting the field text through the
  // normal API caused pdf-lib to render the FULL string on all three
  // lines (visible tripling in a rendered QA sample), not distribute
  // the wrapped lines across them. Coordinate-based drawing sidesteps
  // that and matches the spec's own preference for fixed-coordinate
  // overlay. Rects measured directly from the template (not guessed):
  //   line 1 (after the "Additional Terms:" label): [121.2, 380.88, 565.44, 393.6]
  //   line 2: [39.36, 366.24, 565.44, 377.52]
  //   line 3: [39.36, 351.12, 565.44, 363.84]
  const TERMS_LINE_RECTS = [
    { x: 121.2 + 3, y: 380.88 + 3 },
    { x: 39.36 + 3,  y: 366.24 + 3 },
    { x: 39.36 + 3,  y: 351.12 + 3 },
  ]
  termsFit.lines.forEach((line, i) => {
    if (!TERMS_LINE_RECTS[i]) return // fitAdditionalTerms already guarantees <= 3 lines
    pdfDoc.getPage(0).drawText(line, {
      x: TERMS_LINE_RECTS[i].x,
      y: TERMS_LINE_RECTS[i].y,
      size: termsFit.fontSize,
      font: helv,
    })
  })

  // ── BROKERAGE ─────────────────────────────────────────────────
  set('sellers_agent_broker_company',  data.seller_agent_company || '')
  set('buyers_agnet_commissionn_pct',  data.buyers_agent_commission || data.commission_pct || '')
  set('sellers_agent_commissionn_pct', data.sellers_agent_commission || '')
  set('Sellers_broker_name',           data.sellers_agent_name  || '')
  set('Buyers_broker_name',            buyers_agent)

  // ── ATTORNEYS ─────────────────────────────────────────────────
  set('purch_name',    data.purchaser_attorney_name    || '')
  set('purch_address', data.purchaser_attorney_address || '')
  set('purch_tel',     data.purchaser_attorney_tel     || '')
  set('purch_email',   data.purchaser_attorney_email   || '')
  set('sell_name',     data.seller_attorney_name    || '')
  set('sell_address',  data.seller_attorney_address || '')
  set('sell_tel',      data.seller_attorney_tel     || '')
  set('sell_email',    data.seller_attorney_email   || '')

  // Flatten so values show in all PDF viewers
  form.flatten()

  const pdfBytes = await pdfDoc.save()
  const addr = (data.listing_addr || 'offer').replace(/[^a-z0-9]/gi,'_').slice(0,40)
  return { ok: true, bytes: pdfBytes, filename: 'Offer_' + addr + '.pdf' }
}

module.exports = async function handler(req, res) {
  // HARDENED (July 2026): caller authentication with staged rollout,
  // same pattern as TWILIO_SIG_ENFORCE. Log-only until AUTH_ENFORCE
  // is set to 'true' in Vercel — watch logs for '[AUTH]' lines, flip
  // the env var when clean. Kill-switch: set it back to 'false'.
  const { requireUser } = require('./_lib/auth')
  const __user = await requireUser(req)
  if (!__user) {
    if (String(process.env.AUTH_ENFORCE || '').toLowerCase() === 'true') {
      console.warn('[AUTH] BLOCKED unauthenticated call to ' + req.url)
      res.statusCode = 401; res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({ error: 'unauthorized' }))
    }
    console.warn('[AUTH] unauthenticated call to ' + req.url + ' ALLOWED (log-only — set AUTH_ENFORCE=true in Vercel to block)')
  }
  if (req.method !== 'POST') return res.status(405).json({ error:'POST only' })

  const authCheck = await requireAnyAgent(req)
  if (!authCheck.ok) return res.status(authCheck.status).json({ error: authCheck.message })

  let data = {}
  try {
    const raw = await new Promise((ok,err) => {
      let d = ''
      req.on('data', c => d += c)
      req.on('end', () => ok(d))
      req.on('error', err)
    })
    data = JSON.parse(raw || '{}')
  } catch { data = {} }

  try {
    const result = await buildOfferPdf(data)
    if (!result.ok) return res.status(result.status).json({ error: result.error })

    // ── REVISION + STORAGE + AUDIT (best-effort, never blocks the PDF) ──
    // Only runs when this PDF belongs to an already-saved offer (data.id
    // present). A brand-new, never-saved offer has nothing to attach a
    // revision to, and generating a preview PDF must not silently create
    // an offer record as a side effect — that would be a second source
    // of truth the handoff explicitly forbids. If persistence fails for
    // any reason (missing credentials, RLS denial, storage error), the
    // agent still gets their PDF; the failure is logged, not swallowed.
    if (data.id && __user) {
      try {
        const sb = getOffersServiceClient()
        if (!sb) {
          console.warn('[offers-v2] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured — PDF generated but not persisted as a revision')
        } else {
          const ownership = await verifyOfferOwnership(sb, data.id, __user.id)
          if (!ownership.ok) {
            console.warn('[offers-v2] revision persistence skipped: ' + ownership.message)
          } else {
            const revision = await createOfferRevision(sb, {
              offerId: data.id,
              createdBy: ownership.agent.id,
              snapshot: data,
            })
            const storedPath = await storeGeneratedPdf(sb, {
              offerId: data.id,
              revisionNumber: revision.revision_number,
              bytes: result.bytes,
              filename: result.filename,
            })
            await sb.from('offer_revisions').update({ pdf_path: storedPath }).eq('id', revision.id)
            await logOfferEvent(sb, {
              agentId: ownership.agent.id, offerId: data.id, action: 'pdf_generated',
              metadata: { revision_number: revision.revision_number, filename: result.filename },
            })
          }
        }
      } catch (persistErr) {
        console.warn('[offers-v2] revision persistence failed (PDF still returned):', persistErr.message)
      }
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="' + result.filename + '"')
    res.setHeader('Content-Length', result.bytes.length)
    res.status(200).end(Buffer.from(result.bytes))
  } catch(e) {
    console.error('PDF error:', e.message)
    res.status(500).json({ error: e.message })
  }
}

// Exposed for testing only (src/__tests__/offerPdfFit.test.js,
// src/__tests__/offerPdfBuild.test.js) — Vercel only ever calls
// module.exports itself as the request handler; these extra properties
// are inert in production.
module.exports.wrapToLines = wrapToLines
module.exports.fitAdditionalTerms = fitAdditionalTerms
module.exports.ADDITIONAL_TERMS_LINE_WIDTHS = ADDITIONAL_TERMS_LINE_WIDTHS
module.exports.buildOfferPdf = buildOfferPdf
module.exports.resolveClosingDaysPrintValue = resolveClosingDaysPrintValue
module.exports.CLOSING_DAYS_FIELD_WIDTH = CLOSING_DAYS_FIELD_WIDTH
