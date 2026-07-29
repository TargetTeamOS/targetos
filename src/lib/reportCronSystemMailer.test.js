import { describe, it, expect } from 'vitest'
import * as rc from '../../api/report-cron.js'
const delivered = rc.reportRecipientDelivered

describe('report-cron delivery decision', () => {
  it('ok and duplicate count as delivered; in_progress and error do not', () => {
    expect(delivered({ ok: true })).toBe(true)
    expect(delivered({ skipped: 'duplicate' })).toBe(true)
    expect(delivered({ ok: false, skipped: 'in_progress' })).toBe(false)
    expect(delivered({ ok: false })).toBe(false)
    expect(delivered(null)).toBe(false)
  })

  it('an in_progress recipient makes the whole report NOT sent (last_sent_at not updated)', () => {
    const results = [{ ok: true }, { ok: false, skipped: 'in_progress' }]
    const allOk = results.every(delivered) // report-cron only updates last_sent_at when allOk
    expect(allOk).toBe(false)
  })

  it('all delivered/duplicate → report marked sent (last_sent_at updated)', () => {
    expect([{ ok: true }, { skipped: 'duplicate' }].every(delivered)).toBe(true)
  })
})
