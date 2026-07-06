// Target Team Logo — matches the official app icon
// "A" mark with navy/red/white, TARGET bold, —TEAM— with lines

import React from 'react'

// Just the "A" mark SVG
export function TargetTeamMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left leg of A — navy */}
      <polygon points="18,85 50,12 58,28 32,85" fill="#1B2B4B" />
      {/* Right leg of A — navy with white highlight */}
      <polygon points="50,12 82,85 68,85 50,38" fill="#1B2B4B" />
      {/* Right accent slash — red */}
      <polygon points="58,28 72,12 82,28 68,44" fill="#CC2200" />
      {/* Crossbar cutout — white */}
      <polygon points="36,62 64,62 60,72 40,72" fill="white" opacity="0.15" />
      {/* Inner white highlight on left leg */}
      <polygon points="26,80 50,22 54,30 34,80" fill="white" opacity="0.12" />
    </svg>
  )
}

// Full logo: mark + TARGET / TEAM text
export function TargetTeamLogo({ dark = false, size = 'md' }) {
  const heights = { sm: 28, md: 36, lg: 48 }
  const h = heights[size] || 36
  const textColor = dark ? '#1B2B4B' : '#fff'
  const subColor  = dark ? '#CC2200' : '#CC2200'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <TargetTeamMark size={h} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontFamily: "'Arial Black', 'Arial Bold', sans-serif",
          fontWeight: 900,
          fontSize: h * 0.42,
          letterSpacing: '0.08em',
          color: textColor,
          textTransform: 'uppercase',
        }}>TARGET</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
          <div style={{ flex: 1, height: 1, background: subColor, opacity: .7 }} />
          <span style={{
            fontFamily: "'Arial', sans-serif",
            fontWeight: 600,
            fontSize: h * 0.24,
            letterSpacing: '0.18em',
            color: subColor,
            textTransform: 'uppercase',
          }}>TEAM</span>
          <div style={{ flex: 1, height: 1, background: subColor, opacity: .7 }} />
        </div>
      </div>
    </div>
  )
}

// Square icon version (for favicon / app icon style)
export function TargetTeamIcon({ size = 40, dark = false }) {
  const bg = dark ? '#1B2B4B' : 'white'
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size * 0.22,
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
      boxShadow: dark ? 'none' : '0 2px 8px rgba(0,0,0,.15)',
    }}>
      <TargetTeamMark size={size * 0.72} />
    </div>
  )
}
