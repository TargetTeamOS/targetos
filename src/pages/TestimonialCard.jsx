// TargetOS V2 — Testimonial Card
// Simple form-driven shareable graphic for a client testimonial/review.
import React, { useState } from 'react'
import { Btn } from '../components/UI'
import html2canvas from 'html2canvas'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const NAVY = '#1B2B4B'
const RED  = '#CC2200'

export function TestimonialCard() {
  const [quote, setQuote] = useState('')
  const [clientName, setClientName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [stars, setStars] = useState(5)
  const [exporting, setExporting] = useState(false)

  async function exportJPEG() {
    const el = document.getElementById('testimonial-card')
    if (!el) return
    setExporting(true)
    try {
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: '#fff', useCORS: true })
      const url = canvas.toDataURL('image/jpeg', 0.95)
      const a = document.createElement('a')
      a.href = url
      a.download = 'testimonial-' + (clientName || 'client').toLowerCase().replace(/\s+/g,'-') + '.jpg'
      a.click()
    } finally { setExporting(false) }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, maxWidth: 700 }}>
        <div style={{ gridColumn: 'span 2' }}>
          <textarea value={quote} onChange={e => setQuote(e.target.value)} placeholder="Paste the client's review/quote here..."
            rows={4}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff, resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff }} />
        <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="Agent name (optional)"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff }} />
        <div style={{ gridColumn: 'span 2', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 6 }}>Stars:</span>
          {[1,2,3,4,5].map(n => (
            <span key={n} onClick={() => setStars(n)} style={{ cursor: 'pointer', fontSize: 20, color: n <= stars ? '#FCD34D' : '#e2e8f0' }}>★</span>
          ))}
        </div>
      </div>

      <Btn onClick={exportJPEG} disabled={!quote.trim() || exporting} style={{ marginBottom: 20 }}>
        {exporting ? 'Exporting…' : '⬇ Download HD JPEG'}
      </Btn>

      <div id="testimonial-card" style={{ width: 500, background: '#fff', padding: 44, fontFamily: ff, margin: '0 auto', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 40, color: RED, fontWeight: 900, lineHeight: 1, marginBottom: 12 }}>"</div>
        <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
          {[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 18, color: n <= stars ? '#FCD34D' : '#e2e8f0' }}>★</span>)}
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: NAVY, lineHeight: 1.5, marginBottom: 24, fontStyle: 'italic' }}>
          {quote.trim() || 'The client\'s testimonial will appear here...'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>— {clientName.trim() || 'Client Name'}</div>
        {agentName.trim() && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Agent: <strong style={{ color: NAVY }}>{agentName.trim()}</strong></div>
            <div style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>T<span style={{ color: RED }}>A</span>RGET TEAM</div>
          </div>
        )}
      </div>
    </div>
  )
}
