import { describe, it, expect } from 'vitest'
import * as P from '../../api/_lib/gmailParse.js'

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const sampleMsg = {
  id: 'msg-1', threadId: 'thr-1', labelIds: ['INBOX'], sizeEstimate: 2048, internalDate: '1737936000000',
  payload: {
    mimeType: 'multipart/mixed',
    headers: [
      { name: 'From', value: 'Jane Client <jane@buyer.com>' },
      { name: 'To', value: 'Me <me@team.com>, other@x.com' },
      { name: 'Subject', value: 'Re: Offer on 123 Main — café ☕' },
      { name: 'Message-ID', value: '<abc123@mail.gmail.com>' },
      { name: 'In-Reply-To', value: '<orig@team.com>' },
      { name: 'References', value: '<orig@team.com>' },
      { name: 'Date', value: 'Mon, 27 Jul 2026 10:00:00 +0000' },
    ],
    parts: [
      { mimeType: 'text/plain', body: { data: b64url('Hello there') } },
      { mimeType: 'text/html', body: { data: b64url('<p>Hello there</p>') } },
      { mimeType: 'application/pdf', filename: 'offer.pdf', body: { attachmentId: 'att1', size: 1000 } },
    ],
  },
}

describe('gmailParse', () => {
  it('extracts a clean bare email from a display-name header', () => {
    expect(P.extractEmail('Jane Client <jane@buyer.com>')).toBe('jane@buyer.com')
    expect(P.extractEmail('plain@x.com')).toBe('plain@x.com')
    expect(P.extractEmail('not-an-email')).toBe('')
  })

  it('parses headers, bodies, addresses and attachment presence', () => {
    const m = P.parseGmailMessage(sampleMsg, 'inbound')
    expect(m.provider).toBe('google')
    expect(m.provider_message_id).toBe('msg-1')
    expect(m.provider_thread_id).toBe('thr-1')
    expect(m.internet_message_id).toBe('<abc123@mail.gmail.com>')
    expect(m.in_reply_to).toBe('<orig@team.com>')
    expect(m.references).toBe('<orig@team.com>')
    expect(m.from_address).toBe('jane@buyer.com')
    expect(m.to_addresses).toContain('me@team.com')
    expect(m.to_addresses).toContain('other@x.com')
    expect(m.subject).toContain('café')          // Unicode preserved
    expect(m.body_text).toBe('Hello there')
    expect(m.body_html).toBe('<p>Hello there</p>')
    expect(m.has_attachments).toBe(true)
    expect(m.direction).toBe('inbound')
    expect(typeof m.sent_at).toBe('string')
    // Only limited, non-sensitive metadata — never the raw payload.
    expect(m.provider_payload_metadata).toHaveProperty('label_ids')
    expect(JSON.stringify(m.provider_payload_metadata)).not.toContain('Hello there')
  })

  it('handles a message with no attachments', () => {
    const m = P.parseGmailMessage({ id: 'x', threadId: 't', payload: { mimeType: 'text/plain', body: { data: b64url('hi') }, headers: [] } }, 'inbound')
    expect(m.has_attachments).toBe(false)
    expect(m.body_text).toBe('hi')
  })

  it('does not treat an attached text file as the email body', () => {
    const m = P.parseGmailMessage({ id: 'x', threadId: 't', payload: {
      mimeType: 'multipart/mixed', headers: [], parts: [
        { mimeType: 'text/plain', filename: 'notes.txt', body: { data: b64url('attachment text'), size: 15 } },
      ],
    } }, 'inbound')
    expect(m.has_attachments).toBe(true)
    expect(m.body_text).toBe(null)
  })
})
