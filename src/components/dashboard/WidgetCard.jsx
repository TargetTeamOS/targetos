// WidgetCard — the shared frame every Command Center widget renders inside.
// Consistent card system (content-height, never forced equal heights), a clean
// header with title + optional source/filter, last-updated, refresh, and an
// admin-only three-dot menu, plus self-contained loading / empty / error states
// (concise message for everyone; technical detail tucked behind an admin-only
// expander) so one widget failing never blanks its neighbours.

import { useState } from 'react'
import { relativeDate } from '../../lib/marketFormat'
import { FONT, TYPE, CARD, INK } from '../../lib/dashboardTheme'

export function WidgetCard({
  title, accent = '#0073EA', sourceLabel, dateRangeLabel, lastUpdated,
  loading = false, error = null, errorDetail = null, isAdmin = false,
  onRetry, onRefresh, empty = false, emptyText, emptyAction,
  onDrill, drillLabel = 'View records', headerRight, menu, onCardClick, children,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTech, setShowTech] = useState(false)
  const items = (menu || []).filter(Boolean)
  const clickable = typeof onCardClick === 'function'

  const cardStyle = {
    background: CARD.bg, border: CARD.border, borderRadius: CARD.radius, padding: CARD.pad,
    boxShadow: CARD.shadow, fontFamily: FONT, minWidth: 0, height: '100%', boxSizing: 'border-box',
    transition: 'box-shadow .12s ease, border-color .12s ease',
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: accent, flexShrink: 0 }} />
      <h3 style={{ margin: 0, fontSize: TYPE.cardTitle, fontWeight: 700, color: INK.title, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        {headerRight}
        {onRefresh && (
          <button onClick={(e) => { e.stopPropagation(); onRefresh() }} aria-label="Refresh" title="Refresh"
            style={iconBtn}>⟳</button>
        )}
        {isAdmin && items.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }} aria-label="Widget actions" aria-haspopup="menu" style={iconBtn}>⋯</button>
            {menuOpen && (
              <>
                <div onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div role="menu" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 41, background: '#fff', border: '1px solid #e6eaf0', borderRadius: 10, boxShadow: '0 12px 30px rgba(16,24,40,0.16)', minWidth: 150, padding: 4 }}>
                  {items.map((m, i) => (
                    <button key={i} role="menuitem" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); m.onClick && m.onClick() }} disabled={m.disabled}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'transparent', cursor: m.disabled ? 'not-allowed' : 'pointer', fontFamily: FONT, fontSize: 13, color: m.danger ? '#b42318' : (m.disabled ? '#cbd5e1' : INK.body), borderRadius: 7 }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const caption = (sourceLabel || dateRangeLabel || lastUpdated) ? (
    <p style={{ margin: '5px 0 0', fontSize: TYPE.meta, color: INK.faint }}>
      {[sourceLabel && 'Source: ' + sourceLabel, dateRangeLabel].filter(Boolean).join(' · ')}
      {lastUpdated ? (sourceLabel || dateRangeLabel ? ' · ' : '') + 'Updated ' + relativeDate(lastUpdated) : ''}
    </p>
  ) : null

  const inner = (
    <>
      {header}
      {caption}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div data-testid="widget-loading" aria-hidden style={{ display: 'grid', gap: 8 }}>
            <div style={{ height: 24, width: '55%', background: '#eef2f7', borderRadius: 6 }} />
            <div style={{ height: 12, width: '80%', background: '#f1f5f9', borderRadius: 6 }} />
            <div style={{ height: 12, width: '40%', background: '#f1f5f9', borderRadius: 6 }} />
          </div>
        ) : error ? (
          <div data-testid="widget-error" role="status" style={{ fontSize: TYPE.body, color: INK.body }}>
            <p style={{ margin: 0, color: '#b42318' }}>{typeof error === 'string' ? error : 'This card couldn’t load right now.'}</p>
            <p style={{ margin: '4px 0 0', fontSize: TYPE.meta, color: INK.faint }}>Other cards are unaffected.</p>
            {onRetry && <button onClick={(e) => { e.stopPropagation(); onRetry() }} style={btn}>Retry</button>}
            {isAdmin && (errorDetail || (error && error.message)) && (
              <div style={{ marginTop: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); setShowTech((v) => !v) }} style={{ ...linkBtn, fontSize: 12 }}>{showTech ? 'Hide technical details' : 'Technical details'}</button>
                {showTech && <pre style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 6, padding: 8 }}>{errorDetail || (error && error.message)}</pre>}
              </div>
            )}
          </div>
        ) : empty ? (
          <div data-testid="widget-empty" role="status" style={{ fontSize: TYPE.body, color: INK.muted }}>
            <div>{emptyText || 'Nothing to show yet.'}</div>
            {emptyAction && <button onClick={(e) => { e.stopPropagation(); emptyAction.onClick && emptyAction.onClick() }} style={btn}>{emptyAction.label}</button>}
          </div>
        ) : (
          children
        )}
      </div>
      {onDrill && !loading && !error && (
        <div style={{ marginTop: 14, display: 'flex' }}>
          <button onClick={(e) => { e.stopPropagation(); onDrill() }} style={{ marginLeft: 'auto', ...linkBtn }}>{drillLabel}</button>
        </div>
      )}
    </>
  )

  if (clickable) {
    return (
      <section
        role="button" tabIndex={0}
        onClick={onCardClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick() } }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(16,24,40,0.10)'; e.currentTarget.style.borderColor = '#d5deeb' }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = CARD.shadow; e.currentTarget.style.borderColor = '#e6eaf0' }}
        style={{ ...cardStyle, cursor: 'pointer', outlineOffset: 2 }}
      >
        {inner}
      </section>
    )
  }
  return <section style={cardStyle}>{inner}</section>
}

const iconBtn = { border: '1px solid #eef2f7', background: '#fff', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: '#64748b', fontSize: 15, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }
const btn = { marginTop: 10, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: FONT, fontSize: 13 }
const linkBtn = { fontSize: 13, color: '#0073EA', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, padding: 0 }

export default WidgetCard
