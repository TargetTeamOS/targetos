import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import * as securityModule from '../../api/_lib/requestSecurity.js'
import * as unsubModule from '../../api/unsubscribe.js'
import * as phoneModule from '../../api/_lib/phone.js'
const security = securityModule.default || securityModule
const unsubscribe = unsubModule.default || unsubModule
const phone = phoneModule.default || phoneModule

describe('fail-closed request secrets', () => {
  it('denies a missing or incorrect cron secret', () => {
    expect(security.verifyBearerSecret({ headers: {} }, 'CRON_SECRET', {}).status).toBe(503)
    expect(security.verifyBearerSecret({ headers: { authorization: 'Bearer wrong-value-that-is-long-enough' } }, 'CRON_SECRET', {
      CRON_SECRET: 'correct-secret-that-is-long-enough',
    }).status).toBe(401)
  })

  it('accepts webhook secrets only from the intended header', () => {
    const env = { WEBHOOK_SECRET: 'correct-webhook-secret-long-value' }
    expect(security.verifyHeaderSecret({ headers: {} }, 'WEBHOOK_SECRET', 'x-webhook-secret', env).ok).toBe(false)
    expect(security.verifyHeaderSecret({ headers: { 'x-webhook-secret': env.WEBHOOK_SECRET } }, 'WEBHOOK_SECRET', 'x-webhook-secret', env).ok).toBe(true)
  })

  it('does not allow Twilio verification when its auth token is missing', () => {
    const old = process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_AUTH_TOKEN
    expect(phone.validateTwilioSignature({ headers: {}, url: '/api/twilio-inbound' }, {})).toBe(false)
    if (old) process.env.TWILIO_AUTH_TOKEN = old
  })

  it('signs, validates, and expires unsubscribe tokens', () => {
    const env = { UNSUB_SECRET: 'unsubscribe-secret-that-is-long-enough' }
    const now = 1_700_000_000_000
    const token = unsubscribe.unsubToken('person@example.com', { env, now })
    expect(unsubscribe.verifyUnsubToken('person@example.com', token, { env, now: now + 1000 }).ok).toBe(true)
    expect(unsubscribe.verifyUnsubToken('other@example.com', token, { env, now: now + 1000 }).ok).toBe(false)
    expect(unsubscribe.verifyUnsubToken('person@example.com', token, { env, now: now + 100 * 24 * 3600 * 1000 }).ok).toBe(false)
  })

  it('does not generate shared fallback passwords or reference undeclared RESEND_KEY branches', () => {
    const adminUsers = fs.readFileSync('api/admin-users.js', 'utf8')
    const adminPage = fs.readFileSync('src/pages/Admin.jsx', 'utf8')
    const reportCron = fs.readFileSync('api/report-cron.js', 'utf8')
    const briefingCron = fs.readFileSync('api/daily-briefing-cron.js', 'utf8')
    expect(adminUsers).not.toMatch(/TargetOS2024|Welcome2TargetOS/)
    expect(adminPage).not.toMatch(/TargetOS2024|Welcome2TargetOS/)
    expect(reportCron).not.toContain('RESEND_KEY')
    expect(briefingCron).not.toContain('RESEND_KEY')
  })
})
