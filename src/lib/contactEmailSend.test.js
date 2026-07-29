import { describe, it, expect, vi } from 'vitest'
import { composeSendOutlook, makeAuditLogActivity, applyComposeResult } from './contactEmailSend.js'
import { buildContactEmailHtml } from './emailService.js'

const baseDeps = () => ({
  buildHtml: vi.fn(({ body }) => '<p>' + body + '</p>'),
  send: vi.fn(async () => ({ ok: true, from: 'yanky@outlook.com' })),
  logActivity: vi.fn(async () => {}),
})
const args = (over = {}) => ({ to: 'client@x.com', subject: 'Hi', body: 'hello', agentName: 'Yanky', outlook: { connected: true, from: 'yanky@outlook.com' }, ...over })

describe('composeSendOutlook (Section B send-once + logging semantics)', () => {
  it('loading Outlook status (null) → no send, no log', async () => {
    const deps = baseDeps()
    const r = await composeSendOutlook({ ...args({ outlook: null }), deps })
    expect(r.ok).toBe(false); expect(r.loading).toBe(true)
    expect(deps.send).not.toHaveBeenCalled(); expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('disconnected Outlook → no send, no log, needsConnect', async () => {
    const deps = baseDeps()
    const r = await composeSendOutlook({ ...args({ outlook: { connected: false, from: null } }), deps })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true)
    expect(deps.send).not.toHaveBeenCalled(); expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('success → send once, log exactly once, ok:true', async () => {
    const deps = baseDeps()
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r).toMatchObject({ ok: true, from: 'yanky@outlook.com' }); expect(r.warning).toBeUndefined()
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'client@x.com', subject: 'Hi' }))
    expect(deps.logActivity).toHaveBeenCalledTimes(1)
  })

  it('send failure → ok:false, NO log, send not retried', async () => {
    const deps = baseDeps(); deps.send = vi.fn(async () => ({ ok: false, error: 'Graph sendMail failed' }))
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(false); expect(r.error).toMatch(/Graph sendMail failed/)
    expect(deps.send).toHaveBeenCalledTimes(1); expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('needsConnect from the send dep is surfaced without logging', async () => {
    const deps = baseDeps(); deps.send = vi.fn(async () => ({ ok: false, needsConnect: true, error: 'Connect your Outlook account…' }))
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true); expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('send succeeds but logActivity THROWS → ok:true + warning; send once, log once', async () => {
    const deps = baseDeps(); deps.logActivity = vi.fn(async () => { throw new Error('activity_log_failed') })
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(true); expect(r.from).toBe('yanky@outlook.com')
    expect(r.warning).toMatch(/could not be recorded/i)
    expect(deps.send).toHaveBeenCalledTimes(1); expect(deps.logActivity).toHaveBeenCalledTimes(1)
  })

  it('send succeeds but logActivity RETURNS { error } → ok:true + warning; send once', async () => {
    const deps = baseDeps(); deps.logActivity = vi.fn(async () => ({ error: { message: 'db down' } }))
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(true); expect(r.warning).toMatch(/could not be recorded/i)
    expect(deps.send).toHaveBeenCalledTimes(1)
  })
})

describe('makeAuditLogActivity (Section C — checks returned error)', () => {
  function fakeSb(insertResult) {
    const insert = vi.fn(async () => insertResult)
    return { sb: { from: () => ({ insert }) }, insert }
  }
  it('throws activity_log_failed when Supabase returns { error } (no throw)', async () => {
    const { sb, insert } = fakeSb({ error: { message: 'permission denied' } })
    const log = makeAuditLogActivity(sb, { agentId: 'a1', contactId: 'c1' })
    await expect(log({ subject: 'S', body: 'B', to: 'c@x.com', from: 'y@o.com' })).rejects.toThrow('activity_log_failed')
    // preserved fields; no Resend send id; generic error only
    const row = insert.mock.calls[0][0]
    expect(row).toMatchObject({ agent_id: 'a1', table_name: 'contacts', record_id: 'c1', action: 'note', field_name: 'email' })
    expect(row.metadata).toMatchObject({ subject: 'S', body: 'B', to: 'c@x.com', from: 'y@o.com' })
    expect(JSON.stringify(row)).not.toMatch(/sent_id|resend/i)
    expect(JSON.stringify(row)).not.toContain('permission denied')
  })
  it('resolves when Supabase returns { error: null }', async () => {
    const { sb } = fakeSb({ error: null })
    const log = makeAuditLogActivity(sb, { agentId: 'a1', contactId: 'c1' })
    await expect(log({ subject: 'S', body: 'B', to: 'c@x.com', from: 'y@o.com' })).resolves.toBeUndefined()
  })
})

describe('applyComposeResult (Section D — composer UX contract)', () => {
  const mk = () => ({ toast: vi.fn(), clearDraft: vi.fn(), onSent: vi.fn() })
  it('success clears the draft and calls onSent once with a single ✅ toast', () => {
    const d = mk()
    applyComposeResult({ ok: true, from: 'y@o.com' }, 'c@x.com', d)
    expect(d.toast).toHaveBeenCalledTimes(1)
    expect(d.toast.mock.calls[0][0]).toMatch(/^✅ Email sent from y@o.com to c@x.com\./)
    expect(d.clearDraft).toHaveBeenCalledTimes(1); expect(d.onSent).toHaveBeenCalledTimes(1)
  })
  it('success WITH warning still clears + onSent once, single toast incl. warning', () => {
    const d = mk()
    applyComposeResult({ ok: true, from: 'y@o.com', warning: 'Email sent, but the contact activity could not be recorded.' }, 'c@x.com', d)
    expect(d.toast).toHaveBeenCalledTimes(1)
    expect(d.toast.mock.calls[0][0]).toMatch(/could not be recorded/)
    expect(d.toast.mock.calls[0][0]).not.toMatch(/Failed to send/)
    expect(d.clearDraft).toHaveBeenCalledTimes(1); expect(d.onSent).toHaveBeenCalledTimes(1)
  })
  it('pre-send failure keeps the draft and does NOT call onSent', () => {
    const d = mk()
    applyComposeResult({ ok: false, error: 'The Outlook email service is temporarily unavailable. Please try again.' }, 'c@x.com', d)
    expect(d.toast).toHaveBeenCalledTimes(1)
    expect(d.toast.mock.calls[0][0]).toMatch(/^❌ Failed to send/)
    expect(d.clearDraft).not.toHaveBeenCalled(); expect(d.onSent).not.toHaveBeenCalled()
  })
})

describe('buildContactEmailHtml (Section E — escaping)', () => {
  it('escapes HTML-sensitive body text so scripts are not executable', () => {
    const html = buildContactEmailHtml({ body: '<script>alert("x")</script> & <b>hi</b>', agentName: 'A & <b>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('alert(&quot;x&quot;)')
    expect(html).not.toContain('<b>hi</b>')       // typed markup neutralized
    expect(html).toContain('A &amp; &lt;b&gt;')   // agentName escaped
  })
  it('converts real newlines to <br/> after escaping', () => {
    const html = buildContactEmailHtml({ body: 'line1\nline2', agentName: 'A' })
    expect(html).toContain('line1<br/>line2')
  })
})
