// DrillDown — the one reusable "show me the records behind this number"
// surface. Every dashboard widget opens this same component: a centered modal
// on desktop, a full-height bottom drawer on mobile. It renders the metric's
// explanation, date range, filters and source, then a list of clickable record
// rows that deep-link to the record's EXISTING TargetOS route (via rowRoute).
//
// Accessibility: role="dialog" + aria-modal, focus moves in on open and is
// restored on close, focus is trapped while open, Escape closes, and rows are
// keyboard-navigable (Up/Down to move, Enter to open). Honors reduced motion.

import { useEffect, useRef, useState, useCallback, useId } from 'react'
import { rowRoute } from '../../lib/dashboardRoutes'

const FF = 'Inter, system-ui, -apple-system, sans-serif'
const FOCUSABLE = 'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])'

function useIsMobile(override) {
  const [mobile, setMobile] = useState(() => {
    if (typeof override === 'boolean') return override
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(max-width: 640px)').matches
  })
  useEffect(() => {
    if (typeof override === 'boolean') { setMobile(override); return }
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setMobile(mq.matches)
    on(); mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [override])
  return mobile
}

export function DrillDown({
  open, onClose,
  title, explanation, dateRangeLabel, filters, sourceLabel, recordCount,
  loading = false, error = null, rows = null,
  onNavigate, onRetry, onLoadMore, hasMore = false,
  searchable = false, onSearch, searchValue = '',
  isMobile: isMobileProp,
}) {
  const isMobile = useIsMobile(isMobileProp)
  const dialogRef = useRef(null)
  const restoreRef = useRef(null)
  const rowRefs = useRef([])
  const [activeRow, setActiveRow] = useState(0)
  const titleId = useId()

  // Focus in on open; restore on close.
  useEffect(() => {
    if (!open) return
    restoreRef.current = typeof document !== 'undefined' ? document.activeElement : null
    const node = dialogRef.current
    const first = node?.querySelector(FOCUSABLE)
    ;(first || node)?.focus?.()
    return () => { restoreRef.current?.focus?.() }
  }, [open])

  // Escape to close + focus trap on Tab.
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
    if (e.key !== 'Tab') return
    const node = dialogRef.current
    if (!node) return
    const items = Array.from(node.querySelectorAll(FOCUSABLE))
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }, [onClose])

  const list = Array.isArray(rows) ? rows : []
  const onListKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    setActiveRow((i) => {
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, list.length - 1) : Math.max(i - 1, 0)
      rowRefs.current[next]?.focus()
      return next
    })
  }, [list.length])

  if (!open) return null

  const go = (row) => {
    const path = rowRoute(row)
    if (path && onNavigate) { onNavigate(path); onClose?.() }
  }

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
    display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
    zIndex: 1000, padding: isMobile ? 0 : 24, fontFamily: FF,
  }
  const panel = {
    background: '#fff', color: '#0f172a', width: isMobile ? '100%' : 'min(560px, 100%)',
    maxHeight: isMobile ? '92vh' : '80vh', height: isMobile ? '92vh' : 'auto',
    borderRadius: isMobile ? '16px 16px 0 0' : 12,
    boxShadow: '0 20px 60px rgba(2,6,23,0.28)', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', outline: 'none',
    transition: reduceMotion ? 'none' : 'transform .18s ease',
  }
  const chip = { fontSize: 12, color: '#475569', background: '#f1f5f9', borderRadius: 999, padding: '2px 10px' }

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }} data-testid="drill-overlay">
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        tabIndex={-1} onKeyDown={onKeyDown} style={panel} data-testid="drill-panel"
      >
        {isMobile && <div aria-hidden style={{ width: 40, height: 4, background: '#cbd5e1', borderRadius: 2, margin: '8px auto 0' }} />}
        <header style={{ padding: '16px 18px 12px', borderBottom: '1px solid #eef2f7' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title || 'Records'}</h2>
              {explanation && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#475569' }}>{explanation}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, lineHeight: 1, color: '#334155' }}>×</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {sourceLabel && <span style={chip}>Source: {sourceLabel}</span>}
            {dateRangeLabel && <span style={chip}>{dateRangeLabel}</span>}
            {typeof recordCount === 'number' && <span style={chip}>{recordCount} record{recordCount === 1 ? '' : 's'}</span>}
            {Array.isArray(filters) && filters.map((f, i) => <span key={i} style={chip}>{f.label ?? String(f)}</span>)}
          </div>
          {searchable && (
            <input
              value={searchValue} onChange={(e) => onSearch?.(e.target.value)}
              placeholder="Search records" aria-label="Search records"
              style={{ marginTop: 10, width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: FF }}
            />
          )}
        </header>

        <div style={{ padding: 8, overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div data-testid="drill-loading" style={{ padding: 24, color: '#64748b', fontSize: 14 }}>Loading records…</div>
          )}
          {!loading && error && (
            <div data-testid="drill-error" style={{ padding: 24, fontSize: 14 }}>
              <p style={{ margin: 0, color: '#b42318' }}>Couldn’t load these records.</p>
              {onRetry && <button onClick={onRetry} style={{ marginTop: 10, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: FF }}>Try again</button>}
            </div>
          )}
          {!loading && !error && list.length === 0 && (
            <div data-testid="drill-empty" style={{ padding: 24, color: '#64748b', fontSize: 14 }}>No records match this view yet.</div>
          )}
          {!loading && !error && list.length > 0 && (
            <ul role="list" onKeyDown={onListKeyDown} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {list.map((row, i) => {
                const path = rowRoute(row)
                return (
                  <li key={row.id ?? i}>
                    <button
                      ref={(el) => (rowRefs.current[i] = el)}
                      tabIndex={i === activeRow ? 0 : -1}
                      onFocus={() => setActiveRow(i)}
                      onClick={() => go(row)} disabled={!path}
                      data-testid="drill-row"
                      style={{
                        width: '100%', textAlign: 'left', border: 'none', borderRadius: 8,
                        background: 'transparent', padding: '10px 12px', cursor: path ? 'pointer' : 'default',
                        display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontFamily: FF,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                        {row.secondary && <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>{row.secondary}</span>}
                      </span>
                      {row.status && <span style={{ ...chip, flexShrink: 0 }}>{row.status}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {!loading && !error && hasMore && onLoadMore && (
            <button onClick={onLoadMore} style={{ margin: 8, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: FF }}>Load more</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default DrillDown
