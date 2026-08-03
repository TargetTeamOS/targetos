import { describe, it, expect } from 'vitest'
import { rateDirection, fmtRate, fmtChange, relativeDate, categoryLabel, sparklinePoints } from './marketFormat.js'
// Canonical ESM copy of the endpoint's pure helpers (api/market-strip.js keeps a
// byte-identical self-contained copy for the serverless runtime).
import * as market from './feedParse.js'

describe('rateDirection (meaning never depends on color alone)', () => {
  it('carries a word + glyph for each direction', () => {
    expect(rateDirection(0.05)).toMatchObject({ key: 'up', word: 'up', glyph: '▲' })
    expect(rateDirection(-0.05)).toMatchObject({ key: 'down', word: 'down', glyph: '▼' })
    expect(rateDirection(0)).toMatchObject({ key: 'flat', word: 'unchanged' })
    expect(rateDirection(null)).toMatchObject({ key: 'flat' })
  })
})

describe('rate formatting', () => {
  it('formats rates and changes, with em dash for missing', () => {
    expect(fmtRate(6.72)).toBe('6.72%')
    expect(fmtRate(null)).toBe('—')
    expect(fmtChange(0.05)).toBe('+0.05 pts')
    expect(fmtChange(-0.12)).toBe('0.12 pts')
    expect(fmtChange(null)).toBe('—')
  })
})

describe('relativeDate', () => {
  it('renders today / yesterday / N days', () => {
    const now = new Date('2026-08-02T12:00:00Z')
    expect(relativeDate('2026-08-02T09:00:00Z', new Date(now))).toBe('today')
    expect(relativeDate('2026-08-01T09:00:00Z', new Date(now))).toBe('yesterday')
    expect(relativeDate('2026-07-30T09:00:00Z', new Date(now))).toBe('3d ago')
  })
})

describe('categoryLabel', () => {
  it('maps known categories and defaults unknown', () => {
    expect(categoryLabel('real_estate')).toBe('Real estate')
    expect(categoryLabel('zoning')).toBe('Zoning')
    expect(categoryLabel('???')).toBe('Community')
  })
})

describe('sparklinePoints', () => {
  it('produces N points and is empty for <2 values', () => {
    expect(sparklinePoints([1, 2, 3]).split(' ').length).toBe(3)
    expect(sparklinePoints([1])).toBe('')
  })
})

describe('endpoint.sanitizeText / truncate (no full articles, no HTML)', () => {
  it('strips tags, decodes entities, collapses whitespace', () => {
    expect(market.sanitizeText('<b>Rates</b> &amp; fees')).toBe('Rates & fees')
    expect(market.sanitizeText('<![CDATA[Hello &#8217;26]]>')).toContain('Hello')
  })
  it('truncates long summaries with an ellipsis', () => {
    const long = 'word '.repeat(100)
    const t = market.truncate(long, 40)
    expect(t.length).toBeLessThanOrEqual(41)
    expect(t.endsWith('\u2026')).toBe(true)
  })
})

describe('endpoint.parseRssItems (safe article extraction)', () => {
  it('extracts headline/link/date, skips items without an http link', () => {
    const xml = `
      <rss><channel>
        <item><title><![CDATA[Big Rockland rezoning approved]]></title>
          <link>https://example.com/a</link><pubDate>Fri, 01 Aug 2026 10:00:00 GMT</pubDate>
          <description>&lt;p&gt;Full body text that should be truncated in the summary field only&lt;/p&gt;</description>
        </item>
        <item><title>No link here</title></item>
      </channel></rss>`
    const items = market.parseRssItems(xml, 'Rockland News', 'zoning')
    expect(items.length).toBe(1)
    expect(items[0]).toMatchObject({ source: 'Rockland News', category: 'zoning', link: 'https://example.com/a' })
    expect(items[0].title).toContain('rezoning')
    expect(items[0].summary).not.toContain('<')
  })
})

describe('endpoint.computeRateSummary', () => {
  it('derives current/prev/change/direction and ascending history', () => {
    const obs30 = [ // FRED order: newest first
      { date: '2026-07-31', value: '6.75' },
      { date: '2026-07-24', value: '6.70' },
      { date: '2026-07-17', value: '6.80' },
      { date: '2026-07-10', value: '.' }, // filtered out
    ]
    const r = market.computeRateSummary(obs30, [{ date: '2026-07-31', value: '5.95' }])
    expect(r.rate30).toBe(6.75)
    expect(r.rate30_prev).toBe(6.7)
    expect(r.change).toBe(0.05)
    expect(r.direction).toBe('up')
    expect(r.rate15).toBe(5.95)
    expect(r.history[0].date).toBe('2026-07-17') // oldest first
    expect(r.history[r.history.length - 1].date).toBe('2026-07-31')
  })
})
