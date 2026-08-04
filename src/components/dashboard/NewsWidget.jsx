// NewsWidget — headlines from the admin-configured sources (Rockland County
// first, national feeds as fallback). Content is sanitized server-side; we show
// only headline, source, date, category and a short summary, each linking out to
// the original article. Admins get a "Manage sources" control. A failed load is
// isolated to this card.

import { useState } from 'react'
import { useMetric } from '../../lib/useDashboardData'
import { useAuth } from '../../context/AuthContext'
import { WidgetCard } from './WidgetCard'
import { relativeDate, categoryLabel } from '../../lib/marketFormat'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

async function newsFetcher({ signal }) {
  const res = await fetch('/api/market-strip', { signal })
  if (!res.ok) throw new Error('news request failed')
  const json = await res.json()
  return { news: Array.isArray(json.news) ? json.news : [] }
}

function Article({ a }) {
  return (
    <li style={{ padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
      <a href={a.link} target="_blank" rel="noopener noreferrer"
         style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', textDecoration: 'none' }}>
        {a.title}
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>{a.source}</span>
        <span style={{ fontSize: 12, color: '#cbd5e1' }}>·</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{relativeDate(a.pubDate)}</span>
        <span style={{ fontSize: 10.5, color: '#475569', background: '#f1f5f9', borderRadius: 999, padding: '1px 8px' }}>{categoryLabel(a.category)}</span>
      </div>
      {a.summary && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>{a.summary}</p>}
    </li>
  )
}

export function NewsWidget() {
  const { agent } = useAuth()
  const isAdmin = agent?.role === 'admin'
  const { data, loading, error, refresh } = useMetric('market.news', newsFetcher, { ttlMs: 20 * 60 * 1000 })
  const [showAll, setShowAll] = useState(false)

  const news = data?.news || []
  const shown = news.slice(0, 3)

  return (
    <>
      <WidgetCard
        title="Local & market news" accent="#A25DDC"
        sourceLabel="Configured feeds" loading={loading} error={error} onRetry={refresh}
        empty={!news.length}
        emptyText={isAdmin ? 'No sources are enabled yet. Add a Rockland County feed URL to get started.' : 'No headlines right now.'}
        isAdmin={isAdmin}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((a, i) => <Article key={a.link || i} a={a} />)}
        </ul>
        {news.length > 3 && (
          <button onClick={() => setShowAll(true)} style={{ marginTop: 8, fontSize: 13, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: 0 }}>
            Expand · view all {news.length}
          </button>
        )}
      </WidgetCard>

      {showAll && (
        <div role="dialog" aria-modal="true" aria-label="All news" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAll(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '6vh 16px' }}>
          <div style={{ width: 'min(680px, 100%)', maxHeight: '84vh', overflowY: 'auto', background: '#fff', borderRadius: 12, fontFamily: FF, boxShadow: '0 20px 60px rgba(15,23,42,0.3)' }}>
            <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #eef2f7', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 15 }}>Local &amp; market news</strong>
              <button onClick={() => setShowAll(false)} aria-label="Collapse" style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: '#334155' }}>×</button>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 16px 16px' }}>
              {news.map((a, i) => <Article key={a.link || i} a={a} />)}
            </ul>
          </div>
        </div>
      )}

    </>
  )
}

export default NewsWidget
