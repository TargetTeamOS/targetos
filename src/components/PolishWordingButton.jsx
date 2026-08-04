import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * "Polish Wording" — reuses the EXISTING api/ai-assistant.js proxy
 * (OpenAI/Anthropic, already authenticated) rather than building a
 * second AI pathway. Deliberately narrow: rewords for clarity/
 * professionalism only. The system prompt explicitly forbids
 * inventing legal terms, changing prices/dates, adding or removing
 * contingencies, or interpreting law — and even so, the result is
 * NEVER applied automatically. The agent always sees the original and
 * suggested text side by side and must click Accept; Reject/Undo
 * discards it with no trace. Fails safely (a clear message, not a
 * crash) if no AI provider key is configured.
 */
export function PolishWordingButton({ text, fieldLabel, isNotes, onAccept }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [error, setError] = useState(null)

  async function polish() {
    const trimmed = (text || '').trim()
    if (!trimmed) return
    setOpen(true); setLoading(true); setError(null); setSuggestion(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: 'Bearer ' + session.access_token } : {}),
        },
        body: JSON.stringify({
          max_tokens: 400,
          system: isNotes
            ? 'You improve the spelling, grammar, and clarity of an internal real-estate CRM note. This text is NEVER printed on any legal document. Keep the same meaning and facts exactly. Do not add information. Reply with ONLY the improved text, nothing else — no preamble, no quotes.'
            : 'You improve the spelling, grammar, clarity, and professional tone of "Additional Terms" wording for a real estate purchase offer, and make it as concise as possible so it fits a fixed printed line. You must NOT invent legal terms, remove or add contingencies, change any price, change any date, change any obligation, or interpret law. If the input already contains a specific obligation, preserve it exactly — only the wording style may change. Reply with ONLY the improved text, nothing else — no preamble, no quotes.',
          messages: [{ role: 'user', content: trimmed }],
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'AI request failed')
      // Both providers in api/ai-assistant.js return an Anthropic-shaped
      // { content: [{ type:'text', text }] } array — verified against
      // the actual handler, not guessed.
      const improved = (body.content?.find(b => b.type === 'text')?.text || '').trim()
      if (!improved) throw new Error('The AI did not return any text')
      setSuggestion(improved)
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <>
      <button type="button" onClick={polish} disabled={!text?.trim()}
        style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, border:'1px solid var(--border)',
          background:'transparent', color: text?.trim() ? 'var(--brand, #CC2200)' : 'var(--muted)', cursor: text?.trim() ? 'pointer' : 'not-allowed', marginLeft:6 }}>
        ✨ Polish Wording
      </button>

      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setOpen(false)}>
          <div style={{ background:'var(--panel)', borderRadius:12, padding:16, maxWidth:520, width:'92%', maxHeight:'80vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:10 }}>Polish Wording — {fieldLabel}</div>

            {loading && <div style={{ fontSize:12, color:'var(--muted)' }}>Asking the AI to improve the wording...</div>}
            {error && (
              <div style={{ fontSize:12, color:'#DC2626', padding:'8px 10px', background:'rgba(220,38,38,.08)', borderRadius:8 }}>
                {error.includes('No AI API key') ? 'AI polishing is not configured yet (needs OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel).' : error}
              </div>
            )}

            {suggestion && !loading && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:4 }}>Original</div>
                <div style={{ fontSize:12.5, padding:'8px 10px', background:'var(--dim)', borderRadius:8, marginBottom:10, whiteSpace:'pre-wrap' }}>{text}</div>
                <div style={{ fontSize:10, fontWeight:700, color:'#10B981', textTransform:'uppercase', marginBottom:4 }}>Suggested</div>
                <div style={{ fontSize:12.5, padding:'8px 10px', background:'rgba(16,185,129,.08)', borderRadius:8, marginBottom:12, whiteSpace:'pre-wrap' }}>{suggestion}</div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button type="button" onClick={() => setOpen(false)}
                    style={{ padding:'6px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', cursor:'pointer', fontSize:12 }}>
                    Reject
                  </button>
                  <button type="button" onClick={() => { onAccept(suggestion); setOpen(false) }}
                    style={{ padding:'6px 12px', borderRadius:6, border:'none', background:'var(--brand, #CC2200)', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    Accept
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
