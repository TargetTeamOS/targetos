// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — UI Component Library
// All shared UI primitives used across every page.
// No external component library — fully custom.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react'

// Inject global animation for avatar hover card (once)
if (typeof document !== 'undefined' && !document.getElementById('__tt_avatar_css__')) {
  const s = document.createElement('style')
  s.id = '__tt_avatar_css__'
  s.textContent = '@keyframes fadeInUp{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}'
  document.head.appendChild(s)
}
import { initials } from '../lib/utils'

const s = (styles) => styles
const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── SPINNER ──────────────────────────────────────────────────────
export function Spinner({ size = 20, color = 'var(--brand)' }) {
  return (
    <div style={{ width: size, height: size, border: "2px solid " + (color) + "22", borderTop: "2px solid " + (color), borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
  )
}

// ── LOADING SCREEN ───────────────────────────────────────────────
export function Loading({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', gap: '10px', fontFamily: ff, color: 'var(--muted)', fontSize: '13px' }}>
      <Spinner size={18} color="var(--muted)" />
      {text}
    </div>
  )
}

// ── EMPTY STATE ──────────────────────────────────────────────────
export function Empty({ icon = '📭', title = 'Nothing here yet', sub = null, action = null }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', fontFamily: ff }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>{title}</div>
      {sub && <div style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '300px', margin: '0 auto 16px' }}>{sub}</div>}
      {action}
    </div>
  )
}

// ── AVATAR ───────────────────────────────────────────────────────
export function Avatar({ agent, size = 32, style: extraStyle = {}, showHover = true }) {
  const [hovered, setHovered] = useState(false)
  const [pos,     setPos]     = useState({ x: 0, y: 0 })
  const ref = useRef(null)

  if (!agent) return null

  const name   = agent.name || agent.first_name || '?'
  const color  = agent.color || '#CC2200'
  const ini    = initials(name)
  const photo  = agent.photo_url || null
  const fs     = size * 0.36

  function onMouseEnter(e) {
    if (!showHover) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Position hover card below + right of avatar, keep on screen
    const x = Math.min(rect.left + size / 2, window.innerWidth - 220)
    const y = rect.bottom + 8
    setPos({ x, y })
    setHovered(true)
  }

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={onMouseEnter}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: photo ? 'transparent' : color,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: fs, fontWeight: 700, fontFamily: ff, flexShrink: 0,
          overflow: 'hidden', cursor: showHover ? 'default' : 'inherit',
          border: photo ? '2px solid ' + color : 'none',
          position: 'relative', ...extraStyle,
        }}>
        {photo
          ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={e => { e.target.style.display = 'none' }} />
          : ini
        }
      </div>

      {/* Hover card — rendered in a portal via fixed position */}
      {showHover && hovered && (
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999,
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.22)',
            padding: 0, minWidth: 210, maxWidth: 240,
            fontFamily: ff, pointerEvents: 'auto',
            animation: 'fadeInUp .12s ease',
          }}>
          {/* Top color strip */}
          <div style={{ height: 6, borderRadius: '14px 14px 0 0', background: color }} />
          <div style={{ padding: '12px 14px' }}>
            {/* Photo + name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: photo ? 'transparent' : color, border: '2px solid ' + color, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {photo
                  ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{ini}</span>
                }
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{name}</div>
                {agent.role && <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{agent.role}</div>}
              </div>
            </div>
            {/* Contact info */}
            {agent.email && (
              <a href={'mailto:' + agent.email} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderTop: '1px solid var(--border)', textDecoration: 'none' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>✉️</span>
                <span style={{ fontSize: 11, color: '#3B82F6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.email}</span>
              </a>
            )}
            {agent.phone && (
              <a href={'tel:' + (agent.phone||'').replace(/\D/g,'')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderTop: '1px solid var(--border)', textDecoration: 'none' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>📞</span>
                <span style={{ fontSize: 11, color: 'var(--text)' }}>{agent.phone}</span>
              </a>
            )}
            {agent.license && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>🪪</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>License: {agent.license}</span>
              </div>
            )}
            {agent.languages && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>🌐</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{agent.languages}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── PILL / STATUS BADGE ──────────────────────────────────────────
export function Pill({ label, color = '#94A3B8', size = 'sm' }) {
  if (!label) return null
  const pad = size === 'sm' ? '3px 8px' : '5px 12px'
  const fs  = size === 'sm' ? '11px' : '12px'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: pad, borderRadius: '99px', background: color + '22', color: color, fontSize: fs, fontWeight: 600, fontFamily: ff, whiteSpace: 'nowrap', border: "1px solid " + (color) + "44" }}>
      {label}
    </span>
  )
}

// ── STAT CARD ────────────────────────────────────────────────────
export function StatCard({ label, value, sub = null, icon = null, accent = 'var(--brand)', trend = null }) {
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', position: 'relative', overflow: 'hidden', fontFamily: ff }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent, borderRadius: '12px 12px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>{label}</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
          {sub && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
          {trend !== null && (
            <div style={{ fontSize: '11px', marginTop: '6px', color: trend >= 0 ? '#10B981' : '#DC2626', fontWeight: 600 }}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last month
            </div>
          )}
        </div>
        {icon && <div style={{ fontSize: '24px', opacity: 0.7 }}>{icon}</div>}
      </div>
    </div>
  )
}

// ── PROGRESS BAR ─────────────────────────────────────────────────
export function ProgressBar({ value, max, color = 'var(--brand)', height = 8, showPct = true, label = null }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ fontFamily: ff }}>
      {(label || showPct) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          {label && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{label}</span>}
          {showPct && <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{pct}%</span>}
        </div>
      )}
      <div style={{ height, borderRadius: 99, background: 'var(--dim)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: (pct) + "%", background: color, borderRadius: 99, transition: 'width .4s ease' }} />
      </div>
    </div>
  )
}

// ── MODAL ────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 540, noPad = false }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [open, onClose])

  if (!open) return null
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(2px)', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeUp .15s ease' }}>
        {title && (
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--muted)', padding: '4px 8px', borderRadius: '6px' }}>✕</button>
          </div>
        )}
        <div style={noPad ? {} : { padding: '20px 24px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── FORM FIELD ───────────────────────────────────────────────────
export function Field({ label, children, required = false, hint = null }) {
  return (
    <div style={{ marginBottom: '14px', fontFamily: ff }}>
      {label && (
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {label}{required && <span style={{ color: 'var(--brand)', marginLeft: '3px' }}>*</span>}
        </label>
      )}
      {children}
      {hint && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{hint}</div>}
    </div>
  )
}

// ── INPUT ────────────────────────────────────────────────────────
export function Input({ value, onChange, placeholder, type = 'text', disabled = false, style: extra = {}, onKeyDown = null }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={onKeyDown}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none', boxSizing: 'border-box', opacity: disabled ? 0.6 : 1, ...extra }}
    />
  )
}

// ── SELECT ───────────────────────────────────────────────────────
export function Select({ value, onChange, options, placeholder = 'Select...', disabled = false, style: extra = {} }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--inp)', color: value ? 'var(--text)' : 'var(--muted)', fontSize: '13px', fontFamily: ff, outline: 'none', appearance: 'none', boxSizing: 'border-box', opacity: disabled ? 0.6 : 1, cursor: 'pointer', ...extra }}>
      <option value="">{placeholder}</option>
      {options.map(opt => {
        const val   = typeof opt === 'string' ? opt : (opt.value ?? opt.id)
        const label = typeof opt === 'string' ? opt : (opt.label ?? opt.name ?? opt.value)
        return <option key={val} value={val}>{label}</option>
      })}
    </select>
  )
}

// ── TEXTAREA ─────────────────────────────────────────────────────
export function Textarea({ value, onChange, placeholder, rows = 3, disabled = false }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none', resize: 'vertical', boxSizing: 'border-box', opacity: disabled ? 0.6 : 1 }}
    />
  )
}

// ── BUTTON ───────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, loading = false, style: extra = {}, type = 'button' }) {
  const colors = {
    primary:   { bg: 'var(--brand)', text: '#fff', hover: '#AA1C00' },
    secondary: { bg: 'var(--dim)', text: 'var(--text)', hover: 'var(--border)' },
    danger:    { bg: '#DC2626', text: '#fff', hover: '#B91C1C' },
    success:   { bg: '#10B981', text: '#fff', hover: '#059669' },
    ghost:     { bg: 'transparent', text: 'var(--muted)', hover: 'var(--dim)' },
    outline:   { bg: 'transparent', text: 'var(--brand)', hover: 'var(--brand)' + '11' },
  }
  const c    = colors[variant] || colors.primary
  const pads = { sm: '6px 12px', md: '9px 16px', lg: '12px 22px' }
  const fss  = { sm: '12px', md: '13px', lg: '14px' }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: pads[size] || pads.md, background: c.bg, color: c.text, border: variant === 'outline' ? "1px solid var(--brand)" : 'none', borderRadius: 'var(--radius-sm)', fontSize: fss[size] || fss.md, fontWeight: 600, fontFamily: ff, cursor: disabled || loading ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'background .15s', whiteSpace: 'nowrap', ...extra }}>
      {loading ? <Spinner size={14} color={c.text} /> : null}
      {children}
    </button>
  )
}

// ── PAGE HEADER ──────────────────────────────────────────────────
export function PageHeader({ title, sub = null, actions = null, back = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap', fontFamily: ff }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {back && (
          <button onClick={back} style={{ background: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', fontFamily: ff }}>
            ← Back
          </button>
        )}
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h1>
          {sub && <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '2px 0 0' }}>{sub}</p>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

// ── SECTION TITLE ────────────────────────────────────────────────
export function SectionTitle({ children, action = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', marginTop: '24px', fontFamily: ff }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{children}</div>
      {action}
    </div>
  )
}

// ── TOGGLE ───────────────────────────────────────────────────────
export function Toggle({ value, onChange, label = null }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: ff, fontSize: '13px', color: 'var(--text)' }}>
      <div onClick={() => onChange?.(!value)}
        style={{ width: '36px', height: '20px', borderRadius: '99px', background: value ? 'var(--brand)' : 'var(--border)', position: 'relative', transition: 'background .2s', flexShrink: 0, cursor: 'pointer' }}>
        <div style={{ position: 'absolute', top: '2px', left: value ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
      </div>
      {label}
    </label>
  )
}

// ── MODAL ACTIONS ────────────────────────────────────────────────
export function ModalActions({ children }) {
  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

// ── GRID ─────────────────────────────────────────────────────────
export function Grid({ cols = 2, gap = 14, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: "repeat(" + (cols) + ", 1fr)", gap }}>
      {children}
    </div>
  )
}

// ── DIVIDER ──────────────────────────────────────────────────────
export function Divider({ style: extra = {} }) {
  return <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0', ...extra }} />
}

// ── SEARCH INPUT ─────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search...', style: extra = {} }) {
  return (
    <div style={{ position: 'relative', ...extra }}>
      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff, outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  )
}

// ── TABLE ────────────────────────────────────────────────────────
export function Table({ headers, rows, onRowClick = null, emptyText = 'No data' }) {
  if (!rows?.length) return <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: '13px', fontFamily: ff }}>{emptyText}</div>
  return (
    <div style={{ overflowX: 'auto', fontFamily: ff }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={() => onRowClick?.(row._raw || row)}
              style={{ borderBottom: '1px solid var(--border)', cursor: onRowClick ? 'pointer' : 'default', transition: 'background .12s' }}
              onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = 'var(--hov)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '' }}>
              {row.cells?.map((cell, ci) => (
                <td key={ci} style={{ padding: '11px 12px', color: 'var(--text)', verticalAlign: 'middle' }}>{cell}</td>
              )) ?? Object.values(row).filter(k => k !== '_raw').map((cell, ci) => (
                <td key={ci} style={{ padding: '11px 12px', color: 'var(--text)', verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── CONFIRM DIALOG ───────────────────────────────────────────────
export function Confirm({ open, onConfirm, onCancel, message = 'Are you sure?', danger = true }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff }}>
      <div style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', padding: '28px', maxWidth: '380px', width: '90%', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ fontSize: '15px', color: 'var(--text)', marginBottom: '20px', lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Confirm</Btn>
        </div>
      </div>
    </div>
  )
}

// ── CARD ─────────────────────────────────────────────────────────
export function Card({ children, onClick = null, style: extra = {}, pad = '16px' }) {
  return (
    <div onClick={onClick}
      style={{ background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: pad, cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .15s', ...extra }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = 'var(--shadow-md)' }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.boxShadow = '' }}>
      {children}
    </div>
  )
}

// ── TABS ─────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '20px', gap: '0', fontFamily: ff }}>
      {tabs.map(tab => {
        const id    = typeof tab === 'string' ? tab : tab.id
        const label = typeof tab === 'string' ? tab : tab.label
        const isActive = active === id
        return (
          <button key={id} onClick={() => onChange?.(id)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent', marginBottom: '-2px', fontSize: '13px', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--brand)' : 'var(--muted)', cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap', transition: 'color .15s' }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── INLINE EDIT FIELD ────────────────────────────────────────────
export function InlineEdit({ value, onSave, type = 'text', options = null, placeholder = 'Click to edit' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function save() {
    setEditing(false)
    if (val !== value) onSave?.(val)
  }

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)}
        style={{ cursor: 'pointer', color: value ? 'var(--text)' : 'var(--muted)', fontSize: '13px', fontFamily: ff, borderBottom: '1px dashed var(--border)', paddingBottom: '1px' }}>
        {value || placeholder}
      </span>
    )
  }

  if (options) {
    return (
      <select ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onBlur={save}
        style={{ fontSize: '13px', fontFamily: ff, border: '1px solid var(--brand)', borderRadius: '4px', padding: '3px 6px', background: 'var(--inp)', color: 'var(--text)' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)}
      onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(value) } }}
      style={{ fontSize: '13px', fontFamily: ff, border: '1px solid var(--brand)', borderRadius: '4px', padding: '3px 8px', background: 'var(--inp)', color: 'var(--text)', width: '150px' }}
    />
  )
}
