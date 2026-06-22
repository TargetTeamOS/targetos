/* ═══════════════════════════════════════════════════════════════
   TargetOS V2 — Shared UI Components
   Used across every page. Write once, use everywhere.
   ═══════════════════════════════════════════════════════════════ */
import React from 'react'

// ── STAT CARD ─────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = '#CC2200', icon }) {
  return (
    <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px', padding:'13px 15px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
        <div style={{ fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px' }}>{label}</div>
        {icon && <span style={{ fontSize:'14px' }}>{icon}</span>}
      </div>
      <div style={{ fontSize:'20px', fontWeight:900, color, marginBottom:'2px' }}>{value}</div>
      {sub && <div style={{ fontSize:'10px', color:'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── PROGRESS BAR ──────────────────────────────────────────────────
export function ProgressBar({ value, max, color = '#CC2200', height = 8, label, showPct = true }) {
  const pct = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100)
  const done = pct >= 100
  return (
    <div>
      {(label || showPct) && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' }}>
          {label && <span style={{ fontSize:'11px', color:'var(--muted)' }}>{label}</span>}
          {showPct && <span style={{ fontSize:'11px', fontWeight:700, color: done ? '#16A34A' : color }}>{pct}%</span>}
        </div>
      )}
      <div style={{ background:'var(--dim)', borderRadius:'99px', height, overflow:'hidden' }}>
        <div style={{
          background: done ? '#16A34A' : `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius:'99px', height, width: pct + '%',
          transition: 'width .4s ease'
        }}/>
      </div>
    </div>
  )
}

// ── STATUS PILL ───────────────────────────────────────────────────
export function Pill({ label, color = '#94A3B8', size = 'sm' }) {
  const sizes = { sm: { fontSize:'10px', padding:'2px 9px' }, md: { fontSize:'11px', padding:'3px 11px' }, lg: { fontSize:'12px', padding:'4px 14px' } }
  const s = sizes[size] || sizes.sm
  return (
    <span style={{ display:'inline-flex', alignItems:'center', background:color+'18', color, border:`1px solid ${color}30`, borderRadius:'99px', fontWeight:700, fontFamily:'Inter,system-ui,sans-serif', ...s }}>
      {label}
    </span>
  )
}

// ── MODAL ─────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, width = '480px', subtitle }) {
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'16px', backdropFilter:'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background:'var(--panel)', borderRadius:'18px', padding:'0', width:'100%', maxWidth:width, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)', animation:'slideUp .2s ease' }}>
        <div style={{ padding:'20px 22px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'var(--panel)', zIndex:1, borderRadius:'18px 18px 0 0' }}>
          <div>
            <div style={{ fontSize:'15px', fontWeight:800 }}>{title}</div>
            {subtitle && <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background:'var(--dim)', border:'1px solid var(--border)', borderRadius:'50%', width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--muted)', fontSize:'14px', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:'20px 22px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── FORM FIELD ────────────────────────────────────────────────────
export function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom:'12px' }}>
      {label && (
        <label style={{ display:'block', fontSize:'10px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'5px' }}>
          {label}{required && <span style={{ color:'#CC2200', marginLeft:'2px' }}>*</span>}
        </label>
      )}
      {children}
      {hint && <div style={{ fontSize:'10px', color:'var(--muted)', marginTop:'4px' }}>{hint}</div>}
    </div>
  )
}

// ── INPUT ─────────────────────────────────────────────────────────
export function Input({ label, required, hint, ...props }) {
  return (
    <Field label={label} required={required} hint={hint}>
      <input style={{ width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'13px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 11px', outline:'none', boxSizing:'border-box' }} {...props}/>
    </Field>
  )
}

// ── SELECT ────────────────────────────────────────────────────────
export function Select({ label, required, hint, children, ...props }) {
  return (
    <Field label={label} required={required} hint={hint}>
      <select style={{ width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'13px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 11px', outline:'none', cursor:'pointer' }} {...props}>
        {children}
      </select>
    </Field>
  )
}

// ── TEXTAREA ──────────────────────────────────────────────────────
export function Textarea({ label, required, hint, rows = 3, ...props }) {
  return (
    <Field label={label} required={required} hint={hint}>
      <textarea rows={rows} style={{ width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'13px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 11px', outline:'none', boxSizing:'border-box', resize:'vertical', lineHeight:'1.6' }} {...props}/>
    </Field>
  )
}

// ── MODAL ACTIONS ─────────────────────────────────────────────────
export function ModalActions({ onCancel, onSave, saving, saveLabel = 'Save', danger, onDanger, dangerLabel = 'Delete' }) {
  return (
    <div style={{ display:'flex', gap:'8px', paddingTop:'14px', borderTop:'1px solid var(--border)', marginTop:'14px' }}>
      {onDanger && (
        <button onClick={onDanger}
          style={{ background:'rgba(220,38,38,.08)', border:'1px solid rgba(220,38,38,.2)', borderRadius:'10px', color:'#DC2626', fontSize:'12px', fontWeight:700, padding:'10px 16px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
          {dangerLabel}
        </button>
      )}
      <div style={{ flex:1 }}/>
      <button onClick={onCancel}
        style={{ background:'var(--dim)', border:'1px solid var(--border)', borderRadius:'10px', color:'var(--text)', fontSize:'13px', fontWeight:600, padding:'10px 20px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
        Cancel
      </button>
      <button onClick={onSave} disabled={saving}
        style={{ background:'linear-gradient(135deg,#CC2200,#E8650A)', border:'none', borderRadius:'10px', color:'#fff', fontSize:'13px', fontWeight:700, padding:'10px 24px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:saving?.7:1 }}>
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  )
}

// ── PAGE HEADER ───────────────────────────────────────────────────
export function PageHeader({ title, subtitle, icon, actions }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'18px', flexWrap:'wrap', gap:'10px' }}>
      <div>
        <div style={{ fontSize:'20px', fontWeight:900, display:'flex', alignItems:'center', gap:'8px' }}>
          {icon && <span>{icon}</span>}
          {title}
        </div>
        {subtitle && <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'3px' }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>{actions}</div>}
    </div>
  )
}

// ── PRIMARY BUTTON ────────────────────────────────────────────────
export function Btn({ children, onClick, disabled, variant = 'primary', size = 'md', icon, style: extraStyle }) {
  const variants = {
    primary:   { background:'linear-gradient(135deg,#CC2200,#E8650A)', color:'#fff', border:'none' },
    secondary: { background:'var(--dim)', color:'var(--text)', border:'1px solid var(--border)' },
    ghost:     { background:'transparent', color:'var(--muted)', border:'1px solid var(--border)' },
    danger:    { background:'rgba(220,38,38,.1)', color:'#DC2626', border:'1px solid rgba(220,38,38,.2)' },
    success:   { background:'rgba(22,163,74,.1)', color:'#16A34A', border:'1px solid rgba(22,163,74,.2)' },
  }
  const sizes = {
    sm: { fontSize:'11px', fontWeight:700, padding:'6px 12px', borderRadius:'8px' },
    md: { fontSize:'12px', fontWeight:700, padding:'9px 16px', borderRadius:'9px' },
    lg: { fontSize:'14px', fontWeight:700, padding:'12px 22px', borderRadius:'11px' },
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ fontFamily:'Inter,system-ui,sans-serif', cursor:disabled?'not-allowed':'pointer', display:'inline-flex', alignItems:'center', gap:'6px', transition:'opacity .15s', opacity:disabled?.6:1, whiteSpace:'nowrap', ...variants[variant], ...sizes[size], ...extraStyle }}>
      {icon && <span style={{ fontSize:'13px' }}>{icon}</span>}
      {children}
    </button>
  )
}

// ── AVATAR ────────────────────────────────────────────────────────
export function Avatar({ name, color, size = 32, style: extra }) {
  const initials = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?'
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:color || '#CC2200', display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size * 0.38) + 'px', fontWeight:800, color:'#fff', flexShrink:0, ...extra }}>
      {initials}
    </div>
  )
}

// ── EMPTY STATE ───────────────────────────────────────────────────
export function Empty({ icon = '📋', title, subtitle, action }) {
  return (
    <div style={{ padding:'48px 24px', textAlign:'center', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px' }}>
      <div style={{ fontSize:'36px', marginBottom:'12px' }}>{icon}</div>
      {title    && <div style={{ fontSize:'14px', fontWeight:700, color:'var(--text)',  marginBottom:'6px' }}>{title}</div>}
      {subtitle && <div style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'16px' }}>{subtitle}</div>}
      {action}
    </div>
  )
}

// ── LOADING SPINNER ───────────────────────────────────────────────
export function Spinner({ size = 20, color = '#CC2200' }) {
  return (
    <div style={{ width:size, height:size, border:`2px solid ${color}30`, borderTop:`2px solid ${color}`, borderRadius:'50%', animation:'spin .7s linear infinite', display:'inline-block' }}/>
  )
}

// ── LOADING STATE ──────────────────────────────────────────────────
export function Loading({ text = 'Loading...' }) {
  return (
    <div style={{ padding:'32px', textAlign:'center', color:'var(--muted)', fontSize:'13px', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }}>
      <Spinner size={16}/>
      {text}
    </div>
  )
}

// ── SECTION TITLE ─────────────────────────────────────────────────
export function SectionTitle({ children, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 14px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ fontSize:'12px', fontWeight:700 }}>{children}</div>
      {action}
    </div>
  )
}

// ── TOGGLE SWITCH ─────────────────────────────────────────────────
export function Toggle({ value, onChange, label, color = '#10B981' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
      <div onClick={() => onChange(!value)}
        style={{ width:42, height:22, borderRadius:'99px', background:value ? color : 'var(--border)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
        <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:2, left:value?22:2, transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.2)' }}/>
      </div>
      {label && <span style={{ fontSize:'12px', color:'var(--text)', cursor:'pointer' }} onClick={() => onChange(!value)}>{label}</span>}
    </div>
  )
}

// ── GRID ──────────────────────────────────────────────────────────
export function Grid({ cols = 2, gap = 10, children }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols}, 1fr)`, gap }}>
      {children}
    </div>
  )
}

// ── DIVIDER ───────────────────────────────────────────────────────
export function Divider({ label }) {
  if (!label) return <div style={{ height:1, background:'var(--border)', margin:'14px 0' }}/>
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'10px', margin:'14px 0' }}>
      <div style={{ flex:1, height:1, background:'var(--border)' }}/>
      <span style={{ fontSize:'10px', fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px' }}>{label}</span>
      <div style={{ flex:1, height:1, background:'var(--border)' }}/>
    </div>
  )
}
