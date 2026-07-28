import { describe, it, expect } from 'vitest'
import * as S from '../../api/_lib/emailSanitize.js'
import * as oauthGoogle from '../../api/oauth-google.js'
import * as gmailApi from '../../api/_lib/gmailApi.js'

describe('emailSanitize', () => {
  const s = S.sanitizeEmailHtml
  it('removes <script> tags and their contents', () => {
    const out = s('<p>hi</p><script>alert(1)</script>')
    expect(out).not.toMatch(/<script/i); expect(out).not.toContain('alert(1)')
    expect(out).toContain('hi')
  })
  it('strips onerror/onload event-handler attributes', () => {
    const out = s('<img src="x" onerror="steal()"><div onload="x()">y</div>')
    expect(out).not.toMatch(/onerror/i); expect(out).not.toMatch(/onload/i)
  })
  it('removes javascript: links but keeps safe href', () => {
    const bad = s('<a href="javascript:alert(1)">x</a>')
    expect(bad).not.toMatch(/javascript:/i)
    const good = s('<a href="https://example.com">ok</a>')
    expect(good).toContain('https://example.com')
  })
  it('drops iframe/object/embed content', () => {
    const out = s('<iframe src="evil"></iframe><object data="x"></object><embed src="y">keep')
    expect(out).not.toMatch(/<iframe/i); expect(out).not.toMatch(/<object/i); expect(out).not.toMatch(/<embed/i)
    expect(out).toContain('keep')
  })
  it('preserves normal formatting', () => {
    const out = s('<p><strong>Bold</strong> and <a href="https://x.com">link</a></p>')
    expect(out).toContain('<strong>'); expect(out).toContain('href="https://x.com"')
  })
})

describe('oauth-google scopes', () => {
  it('requests both gmail.send and gmail.readonly', () => {
    expect(oauthGoogle.SCOPE).toContain('https://www.googleapis.com/auth/gmail.send')
    expect(oauthGoogle.SCOPE).toContain('https://www.googleapis.com/auth/gmail.readonly')
    // and both survive into the encoded &scope= URL param
    const param = '&scope=' + encodeURIComponent(oauthGoogle.SCOPE)
    expect(decodeURIComponent(param)).toContain('gmail.readonly')
    expect(decodeURIComponent(param)).toContain('gmail.send')
  })
})

describe('gmailApi request shape', () => {
  it('watch uses labelFilterBehavior (not the deprecated labelFilterAction)', async () => {
    let captured = null
    const fetchImpl = async (url, opts) => { captured = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200, text: async () => '{}' } }
    await gmailApi.watch('tok', { topicName: 'projects/p/topics/t', fetchImpl })
    expect(captured.url).toContain('/watch')
    expect(captured.body).toHaveProperty('labelFilterBehavior', 'include')
    expect(captured.body).not.toHaveProperty('labelFilterAction')
    expect(captured.body.topicName).toBe('projects/p/topics/t')
  })
  it('history.list scopes to INBOX and passes the start cursor', async () => {
    let url = null
    const fetchImpl = async (u) => { url = u; return { ok: true, status: 200, text: async () => '{}' } }
    await gmailApi.historyList('tok', { startHistoryId: '123', fetchImpl })
    expect(url).toContain('labelId=INBOX'); expect(url).toContain('startHistoryId=123'); expect(url).toContain('historyTypes=messageAdded')
  })
})
