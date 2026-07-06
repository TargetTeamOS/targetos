// TargetOS V2 — Market Data Widget
// Live mortgage rates (Freddie Mac via FRED) + real estate news
// Refreshes every 30 minutes automatically

import React, { useState, useEffect, useCallback } from 'react'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso)
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 60) return mins  + 'm ago'
  if (hours < 24) return hours + 'h ago'
  return days + 'd ago'
}

function RateCard({ label, rate, prev, change, asOf }) {
  const up   = change > 0
  const down = change < 0
  const color = up ? '#DC2626' : down ? '#10B981' : '#94A3B8'
  const arrow = up ? '↑' : down ? '↓' : '→'

  return (
    <div style={{ background:'var(--dim)', borderRadius:10, padding:'12px 14px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{label}</div>
      <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:26, fontWeight:900, color:'var(--text)', lineHeight:1 }}>
          {rate ? rate.toFixed(2) + '%' : '—'}
        </span>
        {change !== null && change !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, color, background:color+'15', padding:'2px 7px', borderRadius:99 }}>
            {arrow} {Math.abs(change).toFixed(2)}%
          </span>
        )}
      </div>
      {asOf && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>Week of {asOf}</div>}
    </div>
  )
}

function NewsItem({ article, idx }) {
  const source_colors = {
    'HousingWire':     '#3B82F6',
    'NAR':             '#10B981',
    'Calculated Risk': '#8B5CF6',
    'Inman':           '#F97316',
  }
  const color = source_colors[article.source] || '#94A3B8'

  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer"
      style={{ display:'block', textDecoration:'none', padding:'10px 14px',
        borderBottom:'1px solid var(--border)', transition:'background .1s',
        background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.01)' }}
      onMouseEnter={e => e.currentTarget.style.background='var(--dim)'}
      onMouseLeave={e => e.currentTarget.style.background=idx%2===0?'transparent':'rgba(0,0,0,.01)'}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', lineHeight:1.4, marginBottom:3 }}>
            {article.title}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:9, fontWeight:700, color, background:color+'18', padding:'1px 6px', borderRadius:99 }}>
              {article.source}
            </span>
            <span style={{ fontSize:10, color:'var(--muted)' }}>{timeAgo(article.pubDate)}</span>
          </div>
        </div>
        <span style={{ fontSize:12, color:'var(--muted)', flexShrink:0 }}>↗</span>
      </div>
    </a>
  )
}

export function MarketWidget() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [lastFetch,setLastFetch]= useState(null)
  const [tab,      setTab]      = useState('rates') // 'rates' | 'news'

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/market-data' + (silent ? '' : '?refresh=1'))
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load market data')
      setData(json)
      setLastFetch(new Date())
    } catch(e) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh every 30 minutes
    const interval = setInterval(() => load(true), 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', fontFamily:ff }}>
      {/* Header */}
      <div style={{ padding:'12px 14px 0', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text)' }}>📈 Market Pulse</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>
              {lastFetch ? 'Updated ' + timeAgo(lastFetch.toISOString()) : 'Loading...'}
            </div>
          </div>
          <button onClick={() => load()}
            style={{ background:'none', border:'1px solid var(--border)', borderRadius:7, padding:'4px 10px', fontSize:11, color:'var(--muted)', cursor:'pointer', fontFamily:ff }}>
            ↺ Refresh
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:0, marginBottom:'-1px' }}>
          {[['rates','📊 Rates'],['news','📰 News']].map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding:'6px 14px', border:'none', background:'none', cursor:'pointer',
                fontFamily:ff, fontSize:12, fontWeight:tab===id?700:400,
                color:tab===id?'var(--text)':'var(--muted)',
                borderBottom:tab===id?'2px solid #CC2200':'2px solid transparent',
                marginBottom:'-1px' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
          Loading market data...
        </div>
      )}

      {error && (
        <div style={{ padding:14, fontSize:11, color:'#DC2626', background:'rgba(220,38,38,.06)' }}>
          ⚠️ {error} — <button onClick={()=>load()} style={{ background:'none', border:'none', color:'#CC2200', cursor:'pointer', fontFamily:ff, fontSize:11, fontWeight:700, padding:0 }}>retry</button>
        </div>
      )}

      {!loading && data && (
        <>
          {/* RATES TAB */}
          {tab === 'rates' && (
            <div style={{ padding:14 }}>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <RateCard
                  label="30-Year Fixed"
                  rate={data.rates?.rate_30yr}
                  prev={data.rates?.rate_30yr_prev}
                  change={data.rates?.change}
                  asOf={data.rates?.as_of}
                />
                <RateCard
                  label="15-Year Fixed"
                  rate={data.rates?.rate_15yr}
                  asOf={data.rates?.as_of}
                />
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', textAlign:'right' }}>
                Source: {data.rates?.source}
              </div>
              {/* Rate trend note */}
              {data.rates?.change !== null && data.rates?.change !== undefined && (
                <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8,
                  background: data.rates.change > 0 ? 'rgba(220,38,38,.06)' : 'rgba(16,185,129,.06)',
                  border: '1px solid ' + (data.rates.change > 0 ? 'rgba(220,38,38,.2)' : 'rgba(16,185,129,.2)') }}>
                  <div style={{ fontSize:11, fontWeight:700, color: data.rates.change > 0 ? '#DC2626' : '#10B981' }}>
                    {data.rates.change > 0 ? '↑ Rates moved up' : '↓ Rates moved down'} {Math.abs(data.rates.change).toFixed(2)}% from last week
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                    {data.rates.change > 0
                      ? 'Higher rates may slow buyer activity. Consider reaching out to fence-sitters.'
                      : 'Lower rates = more buyer opportunities. Great time to engage your pipeline.'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* NEWS TAB */}
          {tab === 'news' && (
            <div>
              {data.news?.length > 0 ? (
                data.news.map((article, i) => (
                  <NewsItem key={i} article={article} idx={i} />
                ))
              ) : (
                <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                  No news articles loaded — check network connection
                </div>
              )}
              <div style={{ padding:'8px 14px', fontSize:10, color:'var(--muted)', borderTop:'1px solid var(--border)' }}>
                Sources: HousingWire · NAR · Calculated Risk · Inman
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
