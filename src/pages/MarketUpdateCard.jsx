// TargetOS V2 — Market Update Card
// Shareable stat card pulling real numbers from the deals table --
// unlike the listing-centric Social Cards, this has no single
// "listing" to select, so it's its own simple component rather than
// forced into that infrastructure.
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtFull$ } from '../lib/utils'
import { Btn, Loading } from '../components/UI'
import html2canvas from 'html2canvas'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const NAVY = '#1B2B4B'
const RED  = '#CC2200'

function monthLabel(d) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }

export function MarketUpdateCard() {
  const [loading, setLoading] = useState(true)
  const [deals, setDeals] = useState([])
  const [exporting, setExporting] = useState(false)
  const [area, setArea] = useState('')

  useEffect(() => {
    supabase.from('deals').select('addr, stage, gci, production, close_date')
      .eq('stage', 'Closed')
      .order('close_date', { ascending: false })
      .limit(500)
      .then(({ data }) => { setDeals(data || []); setLoading(false) })
  }, [])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const thisMonth = deals.filter(d => d.close_date && d.close_date >= monthStart)
    .filter(d => !area.trim() || (d.addr || '').toLowerCase().includes(area.trim().toLowerCase()))

  const totalVolume = thisMonth.reduce((s, d) => s + (parseFloat(d.production) || 0), 0)
  const avgPrice = thisMonth.length ? totalVolume / thisMonth.length : 0
  const count = thisMonth.length

  async function exportJPEG() {
    const el = document.getElementById('market-update-card')
    if (!el) return
    setExporting(true)
    try {
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: NAVY, useCORS: true })
      const url = canvas.toDataURL('image/jpeg', 0.95)
      const a = document.createElement('a')
      a.href = url
      a.download = 'market-update-' + now.toISOString().slice(0,10) + '.jpg'
      a.click()
    } finally { setExporting(false) }
  }

  if (loading) return <Loading />

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={area} onChange={e => setArea(e.target.value)} placeholder="Filter by area (optional, e.g. Monsey)"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: 13, fontFamily: ff, width: 280 }} />
        <Btn onClick={exportJPEG} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ Download HD JPEG'}</Btn>
      </div>

      <div id="market-update-card" style={{ width: 500, background: NAVY, padding: 40, fontFamily: ff, margin: '0 auto' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 6 }}>
          Market Update{area.trim() ? ' — ' + area.trim() : ''}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 28 }}>{monthLabel(now)}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 44, fontWeight: 900, color: '#4ADE80' }}>{count}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Homes Sold</div>
          </div>
          <div>
            <div style={{ fontSize: 44, fontWeight: 900, color: '#FCD34D' }}>{fmtFull$(avgPrice)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Average Sale Price</div>
          </div>
          <div>
            <div style={{ fontSize: 44, fontWeight: 900, color: '#F87171' }}>{fmtFull$(totalVolume)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Total Volume</div>
          </div>
        </div>

        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
            T<span style={{ color: RED }}>A</span>RGET TEAM
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>845.424.1014</div>
        </div>
      </div>

      {count === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          No closed deals this month{area.trim() ? ' matching "' + area.trim() + '"' : ''} yet — numbers will update as deals close.
        </div>
      )}
    </div>
  )
}
