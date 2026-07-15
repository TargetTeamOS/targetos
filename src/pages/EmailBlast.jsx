// ═══════════════════════════════════════════════════════════════
// Email Blast — compose a campaign, choose the audience (all / by
// status / by tag), preview, and send through Resend via
// /api/send-campaign (which appends the compliant unsubscribe footer
// and skips anyone who opted out). Past campaigns + counts shown
// below. Replaces the Mailchimp workflow for new-listing blasts.
// No template literals in JSX (validator gotcha).
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authFetch } from '../lib/apiAuth'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { Btn, Modal, ModalActions } from '../components/UI'
import { CONTACT_STATUSES } from '../lib/constants'

const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }
const lb = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', margin: '10px 0 4px' }

export function EmailBlast() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [name, setName]       = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [audType, setAudType] = useState('all')
  const [audValue, setAudValue] = useState('')
  const [count, setCount]     = useState(null)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [history, setHistory] = useState([])
  const [tags, setTags]       = useState([])

  async function loadHistory() {
    const { data } = await supabase.from('email_campaigns')
      .select('*').order('created_at', { ascending: false }).limit(20)
    setHistory(data || [])
  }
  useEffect(() => { loadHistory() }, [])
  useEffect(() => {
    // gather distinct tags for the audience picker
    supabase.from('contacts').select('tags').not('tags', 'is', null).limit(2000).then(({ data }) => {
      const s = new Set()
      ;(data || []).forEach(r => (r.tags || []).forEach(t => s.add(t)))
      setTags([...s].sort())
    })
  }, [])

  // live recipient estimate (minus unsubscribes)
  async function estimate() {
    setCount('…')
    try {
      let q = supabase.from('contacts').select('email', { count: 'exact', head: false }).not('email', 'is', null)
      if (audType === 'status') q = q.eq('status', audValue)
      if (audType === 'tag')    q = q.contains('tags', [audValue])
      const { data } = await q.limit(5000)
      const { data: unsub } = await supabase.from('email_unsubscribes').select('email')
      const blocked = new Set((unsub || []).map(u => u.email.toLowerCase()))
      const uniq = new Set((data || []).map(c => (c.email || '').toLowerCase().trim()).filter(e => e && !blocked.has(e)))
      setCount(uniq.size)
    } catch { setCount(null) }
  }
  useEffect(() => { estimate() }, [audType, audValue])

  const canSend = name.trim() && subject.trim() && body.trim() && (audType === 'all' || audValue) && count > 0

  async function send() {
    setConfirm(false); setSending(true)
    try {
      const { data: camp } = await supabase.from('email_campaigns').insert({
        name: name.trim(), subject: subject.trim(), body_html: body,
        audience: { type: audType, value: audValue || null },
        status: 'sending', created_by: agent?.id || null, created_at: new Date().toISOString(),
      }).select('id').single()

      const r = await authFetch('/api/send-campaign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: camp?.id, subject: subject.trim(), bodyHtml: body, audience: { type: audType, value: audValue || null } }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'send failed')
      toast('📨 Blast sent — ' + data.sent + ' delivered' + (data.failed ? ', ' + data.failed + ' failed' : ''))
      setName(''); setSubject(''); setBody('')
      loadHistory()
    } catch (e) {
      const hint = /not configured/.test(e.message) ? ' — check RESEND_API_KEY & BLAST_FROM in Vercel' : ''
      toast('Blast failed: ' + e.message + hint, '#DC2626')
    } finally { setSending(false) }
  }

  const previewHtml = useMemo(() =>
    (body || '<p style="color:#94A3B8">Your message preview appears here…</p>')
      .replace(/\{\{first_name\}\}/g, 'Sarah'),
  [body])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <div>
        <span style={lb}>Campaign name (internal)</span>
        <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Listing — 123 Main St" />

        <span style={lb}>Subject line</span>
        <input style={inp} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Just Listed in Monsey — must see!" />

        <span style={lb}>Audience</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <select style={inp} value={audType} onChange={e => { setAudType(e.target.value); setAudValue('') }}>
            <option value="all">All contacts with email</option>
            <option value="status">By status</option>
            <option value="tag">By tag</option>
          </select>
          {audType === 'status' && (
            <select style={inp} value={audValue} onChange={e => setAudValue(e.target.value)}>
              <option value="">Choose status…</option>
              {CONTACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {audType === 'tag' && (
            <select style={inp} value={audValue} onChange={e => setAudValue(e.target.value)}>
              <option value="">Choose tag…</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          Recipients: <b style={{ color: 'var(--text)' }}>{count === null ? '—' : count}</b> (unsubscribes excluded automatically)
        </div>

        <span style={lb}>Message — HTML allowed · use {'{{first_name}}'} to personalize</span>
        <textarea style={{ ...inp, minHeight: 220, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                  value={body} onChange={e => setBody(e.target.value)}
                  placeholder={'<h2>Just Listed!</h2>\n<p>Hi {{first_name}}, we just listed a beautiful home…</p>'} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Btn onClick={() => setConfirm(true)} disabled={!canSend || sending} loading={sending}>
            Send to {count || 0} recipients
          </Btn>
        </div>

        <span style={lb}>Recent campaigns</span>
        <div style={{ display: 'grid', gap: 6 }}>
          {history.map(h => (
            <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{h.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{h.sent_at ? new Date(h.sent_at).toLocaleString() : h.status}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <span style={{ color: '#10B981', fontWeight: 700 }}>{h.sent_count || 0} sent</span>
                {h.fail_count ? <span style={{ color: '#DC2626', marginLeft: 6 }}>{h.fail_count} failed</span> : null}
              </div>
            </div>
          ))}
          {!history.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No campaigns sent yet.</div>}
        </div>
      </div>

      <div style={{ position: 'sticky', top: 12 }}>
        <span style={lb}>Live preview</span>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <div style={{ fontSize: 12, color: '#64748B' }}>From: Target Team</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{subject || '(no subject)'}</div>
          </div>
          <div style={{ padding: 16, maxHeight: 440, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          <div style={{ padding: '10px 14px', borderTop: '1px solid #E2E8F0', fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
            (compliant unsubscribe footer added automatically)
          </div>
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Send this blast?" width={440}>
        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
          You're about to email <b>{count}</b> recipient{count === 1 ? '' : 's'}.<br />
          Subject: <b>{subject}</b><br /><br />
          This sends immediately and can't be recalled. Unsubscribed contacts are excluded.
        </div>
        <ModalActions>
          <Btn variant="secondary" onClick={() => setConfirm(false)}>Cancel</Btn>
          <Btn onClick={send}>Send Now</Btn>
        </ModalActions>
      </Modal>
    </div>
  )
}
