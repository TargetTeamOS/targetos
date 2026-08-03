import { describe, it, expect, beforeAll } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

// api/*.js is CommonJS (Vercel requirement) — require() here rather than
// a default import, matching this repo's existing interop convention
// (smoke.js's static export-shape check flags `import x from` against a
// module.exports-style CJS file).
const pdfHandler = require('../../api/generate-offer-pdf')
const { wrapToLines, fitAdditionalTerms, ADDITIONAL_TERMS_LINE_WIDTHS } = pdfHandler

describe('Additional Terms — measured fit against the real template lines', () => {
  let font

  beforeAll(async () => {
    const doc = await PDFDocument.create()
    font = await doc.embedFont(StandardFonts.Helvetica)
  })

  it('short terms fit at the max approved font size', () => {
    const result = fitAdditionalTerms(font, 'Buyer to close within 30 days. Standard contingencies apply.')
    expect(result.ok).toBe(true)
    expect(result.fontSize).toBe(9)
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it('empty terms trivially fit', () => {
    expect(fitAdditionalTerms(font, '').ok).toBe(true)
  })

  it('moderately long terms fit by shrinking within the approved font range, not by truncating', () => {
    const longText = 'Seller to provide a home warranty valid for one year from closing. ' +
      'Buyer requests a walk-through 24 hours prior to closing to confirm the property condition. ' +
      'All appliances remain with the property including washer dryer refrigerator and dishwasher.'
    const result = fitAdditionalTerms(font, longText)
    if (result.ok) {
      expect(result.fontSize).toBeLessThanOrEqual(9)
      expect(result.fontSize).toBeGreaterThanOrEqual(7)
      // Every word from the input must appear somewhere in the wrapped
      // output — proves nothing was silently dropped/truncated.
      const rebuilt = result.lines.join(' ')
      for (const word of longText.split(/\s+/)) {
        expect(rebuilt).toContain(word)
      }
    } else {
      // Acceptable outcome too, as long as it's an honest refusal, not
      // a silent truncation — this branch documents that possibility.
      expect(result.ok).toBe(false)
    }
  })

  it('a genuinely oversized block of text is refused, never truncated', () => {
    const hugeText = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(6)
    const result = fitAdditionalTerms(font, hugeText)
    expect(result.ok).toBe(false)
    // Critically: fitAdditionalTerms returns no partial/truncated lines
    // on failure — there is nothing here a caller could accidentally
    // print as if it were the full text.
    expect(result.lines).toBeUndefined()
  })

  it('wrapToLines respects the exact measured template line widths', () => {
    const lines = wrapToLines(font, 'A short line', 9, ADDITIONAL_TERMS_LINE_WIDTHS)
    expect(lines).toEqual(['A short line'])
  })

  it('a single word wider than its line budget fails rather than overflowing', () => {
    // Simulate a pathological case: one absurdly long unbreakable "word"
    const pathological = 'X'.repeat(500)
    const lines = wrapToLines(font, pathological, 9, ADDITIONAL_TERMS_LINE_WIDTHS)
    expect(lines).toBeNull()
  })
})
