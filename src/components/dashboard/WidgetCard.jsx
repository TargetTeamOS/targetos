// WidgetCard — the shared frame every Command Center widget renders inside.
// It gives consistent card sizing (content-height, no forced equal heights),
// a header with an accent + title, a caption that always states the metric's
// source and date range, and self-contained loading / error / empty states so
// one widget failing can never blank out its neighbours.

import { relativeDate } from '../../lib/marketFormat'

const FF = 'Inter, system-ui, -apple-system, sans-serif'

export function WidgetCard({
  title, accent = '#0073EA', sourceLabel, dateRangeLabel, lastUpdated,
  loading = false, error = null, onRetry, empty = false, emptyText,
  onDrill, drillLabel = 'View records', headerRight, children,
}) {
  return (
    <section
      style={{
        breakInside: 'avoid', marginBottom: 16, background: '#fff',
        border: '1px solid #e9edf3', borderRadius: 12, padding: 16,
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)', fontFamily: FF,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: accent, flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        <span style={{ marginLeft: 'auto' }}>{headerRight}</span>
      </div>

      {(sourceLabel || dateRangeLabel) && (
        <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
          {[sourceLabel && `Source: ${sourceLabel}`, dateRangeLabel].filter(Boolean).join(' · ')}
          {lastUpdated ? ` · Updated ${relativeDate(lastUpdated)}` : ''}
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div data-testid="widget-loading" aria-hidden style={{ display: 'grid', gap: 8 }}>
            <div style={{ height: 22, width: '55%', background: '#eef2f7', borderRadius: 6 }} />
            <div style={{ height: 12, width: '80%', background: '#f1f5f9', borderRadius: 6 }} />
            <div style={{ height: 12, width: '40%', background: '#f1f5f9', borderRadius: 6 }} />
          </div>
        ) : error ? (
          <div data-testid="widget-error" role="status" style={{ fontSize: 13, color: '#475569' }}>
            <p style={{ margin: 0, color: '#b42318' }}>{typeof error === 'string' ? error : (error && error.message) || 'Couldn’t load this right now.'}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>The rest of your dashboard is unaffected.</p>
            {onRetry && (
              <button onClick={onRetry} style={btn}>Try again</button>
            )}
          </div>
        ) : empty ? (
          <div data-testid="widget-empty" role="status" style={{ fontSize: 13, color: '#64748b' }}>
            {emptyText || 'Nothing to show yet.'}
          </div>
        ) : (
          children
        )}
      </div>

      {onDrill && !loading && !error && (
        <div style={{ marginTop: 14, display: 'flex' }}>
          <button onClick={onDrill} style={{ marginLeft: 'auto', ...linkBtn }}>{drillLabel}</button>
        </div>
      )}
    </section>
  )
}

const btn = { marginTop: 10, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: FF, fontSize: 13 }
const linkBtn = { fontSize: 13, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FF, padding: 0 }

export default WidgetCard
