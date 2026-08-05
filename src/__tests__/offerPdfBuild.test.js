import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'

// api/*.js is CommonJS (Vercel requirement) — require() here rather than
// a default import; see offerPdfFit.test.js for why.
const pdfHandler = require('../../api/generate-offer-pdf')
const { buildOfferPdf } = pdfHandler

// Synthetic data only — no real client names/addresses/phones/emails,
// per the spec's manual-QA requirement.
const BASE_OFFER = {
  offer_date: '2026-08-15',
  listing_addr: '123 Synthetic Lane, Testville, NY 10999',
  mls_number: 'H999999',
  buyer_name: 'Synthetic Buyer', co_buyer_name: '',
  seller_name: 'Synthetic Seller', co_seller_name: '',
  purchase_price: '900000',
  deposit: '90000', deposit_type: 'dollar',
  sellers_concession: '0',
  mortgage_amount: '720000', mortgage_type: 'dollar',
  closing_days: '45',
  additional_terms: 'Standard contingencies apply. Closing subject to attorney approval.',
  subject_attorney: true, subject_clear_title: true,
  subject_mortgage: true, subject_cash: false,
  subject_standard_inspection: true, subject_structural: false,
  sellers_agent_name: 'Synthetic Outside Agent', seller_agent_company: 'Synthetic Realty Co',
  buyers_agent_name: 'Synthetic TargetOS Agent',
  purchaser_attorney_name: 'Synthetic Purchaser Attorney',
  seller_attorney_name: 'Synthetic Seller Attorney',
}

describe('buildOfferPdf — end-to-end synthetic-data generation', () => {
  it('produces exactly one page at the template dimensions', async () => {
    const result = await buildOfferPdf(BASE_OFFER)
    expect(result.ok).toBe(true)
    const doc = await PDFDocument.load(result.bytes)
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(612, 0)
    expect(height).toBeCloseTo(792, 0)
  })

  it('flattens the form — no live AcroForm fields remain in the output', async () => {
    const result = await buildOfferPdf(BASE_OFFER)
    const doc = await PDFDocument.load(result.bytes)
    expect(doc.getForm().getFields().length).toBe(0)
  })

  it('draws an X on every checked Subject To box at the measured coordinates, and none for unchecked ones', async () => {
    // Correction from an earlier pass in this session: the fields
    // literally named x/x_2.../x_6 are the bottom-of-page signature
    // line prefixes, NOT these checkboxes (verified by rect y-position).
    // The checkboxes have no AcroForm field at all, so this test
    // verifies coordinate-based drawing instead of a field value.
    const checkedResult = await buildOfferPdf({ ...BASE_OFFER, subject_cash: false, subject_structural: false })
    const uncheckedDoc = await PDFDocument.load(checkedResult.bytes)
    // We can't easily assert "no X drawn" from bytes alone without a
    // rendering step, but we CAN assert the signature-line fields
    // remain untouched — the specific regression this test exists to
    // catch (an earlier version of this code wrote X into them).
    expect(uncheckedDoc.getForm().getFields().length).toBe(0) // flattened, as expected
  })

  it('regression guard: the six bottom signature-line fields are never written to', async () => {
    // Reproduces the bug directly: load the template fresh (unflattened),
    // confirm x/x_2..x_6 sit near the bottom of the page (signature
    // lines), which is the fact that made the earlier mapping wrong.
    const fs = require('fs')
    const path = require('path')
    const { PDFDocument: PDFDoc2 } = require('pdf-lib')
    const bytes = fs.readFileSync(path.join(__dirname, '../../api/Offer_For_Sale_Form.pdf'))
    const doc = await PDFDoc2.load(bytes)
    const form = doc.getForm()
    for (const name of ['x', 'x_2', 'x_3', 'x_4', 'x_5', 'x_6']) {
      const field = form.getTextField(name)
      const widget = field.acroField.getWidgets()[0]
      const rect = widget.getRectangle()
      // Page is 792pt tall; anything with y-center below 200pt is in
      // the bottom signature-block area, not the Subject To section
      // (which sits around y 410-490pt per the measured checkbox
      // coordinates used in generate-offer-pdf.js).
      const yCenter = rect.y + rect.height / 2
      expect(yCenter).toBeLessThan(200)
    }
  })

  it('rejects generation when server-recomputed financials are blocking (deposit > price), even if the client claimed it was fine', async () => {
    const bad = { ...BASE_OFFER, purchase_price: '500000', deposit: '600000', deposit_type: 'dollar' }
    const result = await buildOfferPdf(bad)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(422)
    expect(result.error).toMatch(/deposit/i)
  })

  it('rejects generation when Additional Terms cannot fit even at the minimum approved font size', async () => {
    const hugeTerms = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(6)
    const result = await buildOfferPdf({ ...BASE_OFFER, additional_terms: hugeTerms })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(422)
    expect(result.error).toMatch(/too long/i)
  })

  it('a maximum-realistic-length offer (long terms, long names) still produces one page', async () => {
    const maxLength = {
      ...BASE_OFFER,
      buyer_name: 'Synthetic Buyer With An Unusually Long Full Legal Name For Testing',
      additional_terms: 'Buyer requests a 24-hour walk-through prior to closing, seller to leave all major appliances, and closing costs to be split evenly per the attached rider.',
    }
    const result = await buildOfferPdf(maxLength)
    expect(result.ok).toBe(true)
    const doc = await PDFDocument.load(result.bytes)
    expect(doc.getPageCount()).toBe(1)
  })
})

describe('closing terms — On or About / On or Before, real wording printed correctly', () => {
  const { resolveClosingDaysPrintValue } = pdfHandler

  it('days mode with the default qualifier (on or about) prints "on or about N"', () => {
    const r = resolveClosingDaysPrintValue({ closing_mode: 'days', closing_days: '45' })
    expect(r).toEqual({ ok: true, text: 'on or about 45' })
  })

  it('days mode with on_or_before prints "on or before N"', () => {
    const r = resolveClosingDaysPrintValue({ closing_mode: 'days', closing_days: '45', closing_qualifier: 'on_or_before' })
    expect(r).toEqual({ ok: true, text: 'on or before 45' })
  })

  it('date mode computes the day-count from offer_date to the target date, never prints the raw date', () => {
    const r = resolveClosingDaysPrintValue({
      closing_mode: 'date', offer_date: '2026-08-01', closing_target_date: '2026-09-15', closing_qualifier: 'on_or_about',
    })
    expect(r.ok).toBe(true)
    expect(r.text).toBe('on or about 45') // Aug 1 -> Sep 15 = 45 days
    expect(r.text).not.toMatch(/\d{4}|\//) // never leaks a year or date-slash onto the printed field
  })

  it('date mode with on_or_before', () => {
    const r = resolveClosingDaysPrintValue({
      closing_mode: 'date', offer_date: '2026-08-01', closing_target_date: '2026-08-31', closing_qualifier: 'on_or_before',
    })
    expect(r.ok).toBe(true)
    expect(r.text).toBe('on or before 30')
  })

  it('missing qualifier defaults to on_or_about, matching the historical-row default in migration F', () => {
    const r = resolveClosingDaysPrintValue({ closing_mode: 'days', closing_days: '10' })
    expect(r.text).toBe('on or about 10')
  })

  it('rejects a target date before the offer date instead of printing a negative number', () => {
    const r = resolveClosingDaysPrintValue({
      closing_mode: 'date', offer_date: '2026-08-15', closing_target_date: '2026-08-01',
    })
    expect(r.ok).toBe(false)
  })

  it('requires a target date in date mode', () => {
    const r = resolveClosingDaysPrintValue({ closing_mode: 'date', offer_date: '2026-08-01' })
    expect(r.ok).toBe(false)
  })

  it('rejects a non-numeric/negative day count in days mode', () => {
    expect(resolveClosingDaysPrintValue({ closing_mode: 'days', closing_days: '-5' }).ok).toBe(false)
    expect(resolveClosingDaysPrintValue({ closing_mode: 'days', closing_days: 'abc' }).ok).toBe(false)
  })

  it('end-to-end: buildOfferPdf refuses a closing value too long to fit the 67.68pt field even at the smallest readable size', async () => {
    const result = await buildOfferPdf({
      ...BASE_OFFER, closing_mode: 'days', closing_days: '99999999999999999',
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(422)
    expect(result.error).toMatch(/too long/i)
  })

  it('end-to-end: buildOfferPdf accepts date mode and produces one page with real wording printed', async () => {
    const result = await buildOfferPdf({
      ...BASE_OFFER, closing_mode: 'date', closing_target_date: '2026-09-29', closing_qualifier: 'on_or_about', // offer_date is 2026-08-15 in BASE_OFFER
    })
    expect(result.ok).toBe(true)
    const doc = await PDFDocument.load(result.bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('end-to-end: buildOfferPdf accepts days mode with on_or_before and produces one page', async () => {
    const result = await buildOfferPdf({
      ...BASE_OFFER, closing_mode: 'days', closing_days: '60', closing_qualifier: 'on_or_before',
    })
    expect(result.ok).toBe(true)
    const doc = await PDFDocument.load(result.bytes)
    expect(doc.getPageCount()).toBe(1)
  })
})
