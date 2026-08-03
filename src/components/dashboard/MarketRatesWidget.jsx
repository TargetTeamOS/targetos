// MarketRatesWidget — national weekly mortgage-rate averages (Freddie Mac PMMS
// via FRED), fetched server-side (the FRED key never reaches the browser). Shows
// the 30-yr rate, previous, weekly change + direction (glyph + word, never color
// alone), 15-yr rate, a sparkline with a text equivalent, source attribution and
// the required disclaimer. A missing/failed rate feed renders an "unavailable"
// state and never breaks the dashboard. Clicking opens the rate history.

import { useState } from 'react'
import { useMetric } from '../../lib/useDashboardData'
import { WidgetCard } from './WidgetCard'
import { DrillDown } from './DrillDown'
import { rateDirection, fmtRate, fmtChange, relativeDate, sparklinePoints } from '../../lib/marketFormat'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const DISCLAIMER = 'National weekly mortgage-rate averages. These are not individual borrower quotes.'

async function ratesFetcher({ signal }) {
  const res = await fetch('/api/market-strip', { signal })
  if (!res.ok) throw new Error('rates request failed')
  const json = await res.json()
  return { rates: json.rates || {}, fetchedAt: json.fetched_at }
}

export function MarketRatesWidget() {
  const { data, loading, error, refresh } = useMetric('market.rates', ratesFetcher, { ttlMs: 20 * 60 * 1000 })
  const [open, setOpen] = useState(false)
  const rates = data?.rates || {}
  const unavailable = !loading && !error && (rates.error || rates.rate30 == null)
  const dir = rateDirection(rates.change)
  const history = Array.isArray(rates.history) ? rates.history : []

  const historyRows = history.slice().reverse().map((h) => ({
    id: h.date, type: 'rate', label: new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    secondary: fmtRate(h.value),
  }))
  const rangeLabel = history.length
    ? new Date(history[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' – ' +
      new Date(history[history.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''

  // Precomputed (no template literals in the JSX render path).
  const changeLabel = 'Weekly change: ' + dir.word + ' ' + fmtChange(rates.change)
  const trendLabel = '30-year rate trend over the last ' + history.length + ' weeks, ending at ' + fmtRate(rates.rate30)
  const srText = history.map((h) => h.date + ': ' + fmtRate(h.value)).join('; ')

  return (
    <>
      <WidgetCard
        title="Mortgage rates" accent="#0073EA"
        sourceLabel="Freddie Mac PMMS via FRED" dateRangeLabel="Weekly"
        lastUpdated={data?.fetchedAt} loading={loading} error={error}
        onRetry={refresh}
        empty={unavailable} emptyText="Rate data is unavailable right now — check back after the next weekly update."
        onDrill={unavailable ? undefined : () => setOpen(true)} drillLabel="Rate history & source"
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{fmtRate(rates.rate30)}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>30-yr fixed</div>
          </div>
          <div style={{ paddingBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: dir.key === 'up' ? '#b42318' : dir.key === 'down' ? '#037f4c' : '#64748b' }}
                  aria-label={changeLabel}>
              {dir.glyph} {dir.word} {fmtChange(rates.change)}
            </span>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              prev {fmtRate(rates.rate30_prev)} · 15-yr {fmtRate(rates.rate15)}
            </div>
          </div>
          {history.length >= 2 && (
            <svg width="120" height="32" viewBox="0 0 120 32" role="img"
                 aria-label={trendLabel}
                 style={{ marginLeft: 'auto' }}>
              <polyline fill="none" stroke="#0073EA" strokeWidth="1.75"
                        points={sparklinePoints(history.map((h) => h.value))} />
            </svg>
          )}
        </div>
        {/* text equivalent for the sparkline (screen-reader + no-color) */}
        <p style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {srText}
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{DISCLAIMER}</p>
      </WidgetCard>

      <DrillDown
        open={open} onClose={() => setOpen(false)}
        title="30-year fixed — weekly history"
        explanation={DISCLAIMER}
        sourceLabel="Freddie Mac PMMS via FRED" dateRangeLabel={rangeLabel}
        recordCount={historyRows.length} rows={historyRows}
      />
    </>
  )
}

export default MarketRatesWidget
