// ═══════════════════════════════════════════════════════════════
// TCDealChat — running update log per TC deal. Type @ to mention an
// agent; mentioned agents get a notification (bell + email per their
// prefs) linking back to the TC Board. Everything stays on the deal
// forever — one place for "what's going on with this listing".
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { notifyAgent } from '../lib/notify'
import { Btn } from './UI'

export function TCDealChat({ dealId, dealAddr, agents = [], me, toast }) {
  const [rows, setRows]   = useState([])
  const [text, setText]   = useState('')
  const [sending, setSending] = useState(false)
  const [mentionQ, setMentionQ] = useState(null)   // text after the active '@', or null
  const boxRef = useRef(null)

  async function load() {
    const { data } = await supabase.from('tc_comments')
      .select('*').eq('tc_deal_id', dealId).order('created_at').limit(200)
    setRows(data || [])
  }
  useEffect(() => { if (dealId) load() }, [dealId])
  useEffect(() => { boxRef.current?.scrollTo(0, 999999) }, [rows.length])

  const agentName = id => agents.find(a => a.id === id)?.name || 'Unknown'

  function onType(v) {
    setText(v)
    const m = v.match(/@([A-Za-z]*)$/)
    setMentionQ(m ? m[1].toLowerCase() : null)
  }
  function pickMention(a) {
    setText(t => t.replace(/@([A-Za-z]*)$/, '@' + a.name.split(' ')[0] + ' '))
    setMentionQ(null)
  }

  // Resolve @FirstName tokens to agent ids (first match wins)
  function resolveMentions(body) {
    const ids = []
    for (const a of agents) {
      const first = (a.name || '').split(' ')[0]
      if (first && new RegExp('@' + first + '\\b', 'i').test(body)) ids.push(a.id)
    }
    return [...new Set(ids)]
  }

  async function send() {
    const body = text.trim()
    if (!body) return
    setSending(true)
    try {
      const mentions = resolveMentions(body)
      const { error } = await supabase.from('tc_comments')
        .insert({ tc_deal_id: dealId, agent_id: me?.id || null, body, mentions })
      if (error) throw error
      setText('')
      load()
      for (const id of mentions) {
        if (id === me?.id) continue
        notifyAgent(id, 'task_assigned', {
          title: '💬 ' + (me?.name || 'Someone') + ' mentioned you — ' + (dealAddr || 'TC deal'),
          body: body.slice(0, 140),
          link: '/tc', type: 'info',
        }).catch(() => {})
      }
      if (mentions.length) toast?.('Sent — ' + mentions.length + ' agent' + (mentions.length > 1 ? 's' : '') + ' notified')
    } catch (e) {
      toast?.('Could not post: ' + e.message, '#DC2626')
    } finally { setSending(false) }
  }

  const matches = mentionQ !== null
    ? agents.filter(a => (a.name || '').toLowerCase().startsWith(mentionQ)).slice(0, 5)
    : []

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: '14px 0 8px' }}>💬 Deal updates & chat</div>
      <div ref={boxRef} style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 6,
                                 border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
        {rows.map(r => (
          <div key={r.id} style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: 'var(--brand)' }}>{agentName(r.agent_id)}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
              {new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
            <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {r.body.split(/(@[A-Za-z]+)/g).map((part, i) =>
                part.startsWith('@')
                  ? <span key={i} style={{ color: 'var(--brand)', fontWeight: 700 }}>{part}</span>
                  : part)}
            </div>
          </div>
        ))}
        {!rows.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No updates yet — everything posted here stays with the deal.</div>}
      </div>
      <div style={{ position: 'relative' }}>
        {matches.length > 0 && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 20,
                        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
            {matches.map(a => (
              <div key={a.id} onClick={() => pickMention(a)}
                   style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>@{a.name}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea value={text} onChange={e => onType(e.target.value)} rows={2}
                    placeholder="Post an update… type @ to tag an agent"
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                             fontSize: 13, background: 'var(--bg)', color: 'var(--text)', resize: 'vertical' }} />
          <Btn onClick={send} loading={sending}>Post</Btn>
        </div>
      </div>
    </div>
  )
}
