import { describe, it, expect, vi } from 'vitest'
import { composeSendOutlook } from '../../src/lib/contactEmailSend.js'

const baseDeps = () => ({
  buildHtml: vi.fn(({ body }) => '<p>' + body + '</p>'),
  send: vi.fn(async () => ({ ok: true, from: 'yanky@outlook.com' })),
  logActivity: vi.fn(async () => {}),
})
const args = (over = {}) => ({ to: 'client@x.com', subject: 'Hi', body: 'hello', agentName: 'Yanky', outlook: { connected: true, from: 'yanky@outlook.com' }, ...over })

describe('composeSendOutlook (Contact Detail composer)', () => {
  it('sends via the injected Outlook send fn and logs the activity exactly once on success', async () => {
    const deps = baseDeps()
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(true); expect(r.from).toBe('yanky@outlook.com')
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'client@x.com', subject: 'Hi' }))
    expect(deps.logActivity).toHaveBeenCalledTimes(1) // exactly once
  })

  it('does NOT send or log when Outlook status is still loading (null)', async () => {
    const deps = baseDeps()
    const r = await composeSendOutlook({ ...args({ outlook: null }), deps })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true)
    expect(deps.send).not.toHaveBeenCalled(); expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('does NOT send or log when Outlook is disconnected', async () => {
    const deps = baseDeps()
    const r = await composeSendOutlook({ ...args({ outlook: { connected: false, from: null } }), deps })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true)
    expect(deps.send).not.toHaveBeenCalled(); expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('records NO activity when the send fails (no successful email activity on failure)', async () => {
    const deps = baseDeps()
    deps.send = vi.fn(async () => ({ ok: false, error: 'Graph sendMail failed' }))
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(false); expect(r.error).toMatch(/Graph sendMail failed/)
    expect(deps.logActivity).not.toHaveBeenCalled()
  })

  it('surfaces a needsConnect send failure without logging', async () => {
    const deps = baseDeps()
    deps.send = vi.fn(async () => ({ ok: false, needsConnect: true, error: 'Connect your Outlook account…' }))
    const r = await composeSendOutlook({ ...args(), deps })
    expect(r.ok).toBe(false); expect(r.needsConnect).toBe(true); expect(deps.logActivity).not.toHaveBeenCalled()
  })
})
