import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOffersV2Beta } from '../lib/offersV2Flag'
import { OffersLegacy } from './OffersLegacy'
import { OffersV2 } from './OffersV2'

/**
 * Selects the old or new Offers implementation at the same /offers and
 * /offers/:id routes, based on the offers_v2_beta feature flag —
 * reuses the existing feature_flags table/Admin UI (sql/feature_flags.sql),
 * not a second flag system. See src/lib/offersV2Flag.js for why this
 * flag's evaluation deliberately does NOT reuse the general
 * flagAllows()/useFeature() fail-open-and-admin-bypass semantics: an
 * unfinished, security-relevant experience needs to default OFF and
 * needs the owner to be able to test without exposing it to every
 * admin account, not just every agent.
 *
 * Users the flag allows see a small banner (V2's board header is
 * otherwise nearly identical to the legacy one, so without it there
 * is no visible sign V2 is active) that lets them switch to the
 * classic board for the rest of this browser session (?v=classic or
 * ?v=v2 also works). Users the flag does not allow see nothing new.
 */
const VIEW_KEY = 'targetos.offersView'
const ff = 'Inter,system-ui,sans-serif'

function readSessionView(search) {
  try {
    const q = new URLSearchParams(search || '').get('v')
    if (q === 'classic' || q === 'v2') return q
    return window.sessionStorage.getItem(VIEW_KEY) === 'classic' ? 'classic' : 'v2'
  } catch {
    return 'v2'
  }
}

function toggleBtnStyle(active) {
  return {
    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: ff,
    background: active ? 'var(--panel)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
  }
}

export function Offers() {
  const { agent } = useAuth()
  const location = useLocation()
  const v2Enabled = useOffersV2Beta(agent)
  const [view, setView] = useState(() => readSessionView(location.search))

  if (!v2Enabled) return <OffersLegacy />

  function choose(next) {
    setView(next)
    try { window.sessionStorage.setItem(VIEW_KEY, next) } catch { /* storage unavailable: state-only */ }
  }

  const showV2 = view !== 'classic'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--dim)', fontFamily: ff }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
          {showV2 ? 'You are using Offers V2 (Beta)' : 'You are using the classic Offers board'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)', flex: 1, minWidth: 160 }}>
          Beta access is on for your account. Switching applies to this browser session only.
        </span>
        <div style={{ display: 'flex', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 2 }}>
          <button type="button" onClick={() => choose('v2')} style={toggleBtnStyle(showV2)}>Offers V2 (Beta)</button>
          <button type="button" onClick={() => choose('classic')} style={toggleBtnStyle(!showV2)}>Classic</button>
        </div>
      </div>
      {showV2 ? <OffersV2 /> : <OffersLegacy />}
    </div>
  )
}
