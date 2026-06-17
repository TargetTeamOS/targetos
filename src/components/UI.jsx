import React from 'react'

// ─── BUTTON ───────────────────────────────────
export function Btn({ children, onClick, variant='primary', size='md', style, disabled, className='' }) {
  const base = {
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'6px',
    border:'none', borderRadius:'8px', cursor:disabled?'not-allowed':'pointer',
    fontFamily:'Inter,system-ui,sans-serif', fontWeight:700, whiteSpace:'nowrap',
    transition:'opacity .15s', opacity: disabled ? .5 : 1,
  }
  const variants = {
    primary:   { background:'var(--red)',   color:'#fff' },
    secondary: { background:'var(--navy)',  color:'#fff' },
    ghost:     { background:'transparent', color:'var(--text)', border:'1.5px solid var(--border)' },
    danger:    { background:'#DC2626',      color:'#fff' },
    green:     { background:'#16A34A',      color:'#fff' },
    purple:    { background:'var(--purple)',color:'#fff' },
  }
  const sizes = {
    xs: { fontSize:'10px', padding:'4px 9px' },
    sm: { fontSize:'11px', padding:'6px 12px' },
    md: { fontSize:'12px', padding:'8px 14px' },
    lg: { fontSize:'13px', padding:'10px 18px' },
  }
  return (
    <button disabled={disabled} onClick={onClick} className={className}
      style={{...base, ...variants[variant], ...sizes[size], ...style}}
      onMouseEnter={e => { if(!disabled) e.currentTarget.style.opacity='.85' }}
      onMouseLeave={e => { e.currentTarget.style.opacity='1' }}>
      {children}
    </button>
  )
}

// ─── INPUT ────────────────────────────────────
export function Input({ label, id, type='text', value, onChange, placeholder, style, rows }) {
  const inputStyle = {
    width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)',
    borderRadius:'8px', color:'var(--text)', fontSize:'13px',
    fontFamily:'Inter,system-ui,sans-serif', padding:'10px 13px', outline:'none',
  }
  return (
    <div style={{marginBottom:'12px'}}>
      {label && <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{label}</label>}
      {rows
        ? <textarea id={id} value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{...inputStyle,...style,resize:'vertical'}}/>
        : <input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} style={{...inputStyle,...style}}
            onFocus={e => e.target.style.borderColor='var(--red)'}
            onBlur={e => e.target.style.borderColor='var(--border)'}/>
      }
    </div>
  )
}

// ─── SELECT ───────────────────────────────────
export function Select({ label, value, onChange, options, style }) {
  return (
    <div style={{marginBottom:'12px'}}>
      {label && <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{label}</label>}
      <select value={value} onChange={onChange}
        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none',...style}}>
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
    </div>
  )
}

// ─── CARD ─────────────────────────────────────
export function Card({ children, style, onClick, hover=false }) {
  return (
    <div onClick={onClick}
      style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',boxShadow:'0 1px 3px rgba(0,0,0,.04)',cursor:onClick?'pointer':undefined,...style}}
      onMouseEnter={e => { if(hover||onClick) e.currentTarget.style.borderColor='var(--red)' }}
      onMouseLeave={e => { if(hover||onClick) e.currentTarget.style.borderColor='var(--border)' }}>
      {children}
    </div>
  )
}

// ─── CARD HEADER ──────────────────────────────
export function CardHeader({ children, style }) {
  return <div style={{padding:'13px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'13px',fontWeight:700,color:'var(--text)',...style}}>{children}</div>
}

// ─── BADGE ────────────────────────────────────
const BADGE_PRESETS = {
  Hot:               { bg:'#FEF2F2', color:'#DC2626' },
  Active:            { bg:'#F0FDF4', color:'#16A34A' },
  New:               { bg:'#EFF6FF', color:'#2563EB' },
  Nurturing:         { bg:'#FFFBEB', color:'#D97706' },
  Cold:              { bg:'#F8FAFC', color:'#64748B' },
  'Offer Accepted':  { bg:'#FFFBEB', color:'#D97706' },
  'Under Contract':  { bg:'#EFF6FF', color:'#2563EB' },
  'Under Shtar':     { bg:'rgba(187,51,84,.12)', color:'#bb3354' },
  Closed:            { bg:'#F0FDF4', color:'#16A34A' },
  'Deal Fell Through': { bg:'#FEF2F2', color:'#DC2626' },
  'Clear to Close':  { bg:'#F0FDF4', color:'#16A34A' },
  'Mortgage Process':{ bg:'rgba(124,58,237,.1)', color:'#7C3AED' },
}

export function Badge({ label, style }) {
  const preset = BADGE_PRESETS[label] || { bg:'var(--dim)', color:'var(--muted)' }
  return (
    <span style={{fontSize:'10px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',whiteSpace:'nowrap',background:preset.bg,color:preset.color,...style}}>
      {label}
    </span>
  )
}

// ─── AVATAR ───────────────────────────────────
export function Avatar({ name, color, size=34, style }) {
  const initials = name ? name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase() : '?'
  return (
    <div style={{width:size,height:size,borderRadius:'9px',background:color||'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:Math.round(size*.35)+'px',fontWeight:800,color:'#fff',flexShrink:0,...style}}>
      {initials}
    </div>
  )
}

// ─── STAT CARD ────────────────────────────────
export function StatCard({ label, value, sub, subColor='var(--muted)' }) {
  return (
    <Card style={{padding:'16px'}}>
      <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:'6px'}}>{label}</div>
      <div style={{fontSize: String(value).length > 8 ? '16px' : '24px', fontWeight:900, color:'var(--text)', marginBottom:'4px'}}>{value}</div>
      <div style={{fontSize:'11px',color:subColor}}>{sub}</div>
    </Card>
  )
}

// ─── PROGRESS BAR ─────────────────────────────
export function ProgressBar({ pct, color, height=8, style }) {
  return (
    <div style={{background:'var(--dim)',borderRadius:'99px',height,overflow:'hidden',...style}}>
      <div style={{height:'100%',borderRadius:'99px',background:color||'linear-gradient(90deg,var(--red),var(--orange))',width:`${Math.min(pct,100)}%`,transition:'width .8s ease'}}/>
    </div>
  )
}

// ─── SKELETON ─────────────────────────────────
export function Skeleton({ w='100%', h=20, r=8, style }) {
  return <div className="skeleton" style={{width:w,height:h,borderRadius:r,...style}}/>
}

export function SkeletonTable({ rows=6 }) {
  return (
    <div style={{padding:'8px'}}>
      {Array.from({length:rows}).map((_,i) => (
        <div key={i} style={{display:'flex',gap:'12px',padding:'12px 8px',borderBottom:'1px solid var(--border)'}}>
          <Skeleton w={32} h={32} r={8} style={{flexShrink:0}}/>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:'6px'}}>
            <Skeleton h={14} w="60%"/>
            <Skeleton h={10} w="40%"/>
          </div>
          <Skeleton w={60} h={22} r={20}/>
        </div>
      ))}
    </div>
  )
}

export function SkeletonCards({ count=6 }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'14px'}}>
      {Array.from({length:count}).map((_,i) => (
        <div key={i} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden'}}>
          <Skeleton h={80} r={0}/>
          <div style={{padding:'13px',display:'flex',flexDirection:'column',gap:'8px'}}>
            <Skeleton h={14} w="80%"/>
            <Skeleton h={10} w="50%"/>
            <Skeleton h={28} w="60%"/>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TOAST ────────────────────────────────────
export function Toast({ toast }) {
  if(!toast) return null
  return (
    <div style={{
      position:'fixed',bottom:'22px',left:'50%',transform:'translateX(-50%)',
      background:toast.color||'var(--navy)',color:'#fff',borderRadius:'11px',
      padding:'10px 18px',fontSize:'12px',fontWeight:600,zIndex:9999,
      boxShadow:'0 8px 24px rgba(0,0,0,.2)',whiteSpace:'nowrap',
      animation:'slideUp .25s ease',
    }}>
      {toast.msg}
    </div>
  )
}

// ─── MODAL ────────────────────────────────────
export function Modal({ children, onClose, maxWidth=520 }) {
  return (
    <div onClick={e => { if(e.target===e.currentTarget) onClose() }}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(4px)'}}>
      <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'18px',padding:'26px',width:'100%',maxWidth,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}>
        {children}
      </div>
    </div>
  )
}

export function ModalTitle({ children, onClose }) {
  return (
    <div style={{fontSize:'15px',fontWeight:800,marginBottom:'18px',display:'flex',justifyContent:'space-between',alignItems:'center',color:'var(--text)'}}>
      {children}
      <button onClick={onClose} style={{background:'transparent',border:'none',fontSize:'18px',cursor:'pointer',color:'var(--muted)',padding:'4px',borderRadius:'6px',lineHeight:1}}>✕</button>
    </div>
  )
}

// ─── GRID HELPERS ─────────────────────────────
export function Grid2({ children, gap=14 }) {
  return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap}}>{children}</div>
}
export function Grid3({ children, gap=10 }) {
  return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap}}>{children}</div>
}
export function Grid4({ children, gap=12 }) {
  return <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap}}>{children}</div>
}
export function GridAuto({ children, min=260, gap=14 }) {
  return <div style={{display:'grid',gridTemplateColumns:`repeat(auto-fill,minmax(${min}px,1fr))`,gap}}>{children}</div>
}
