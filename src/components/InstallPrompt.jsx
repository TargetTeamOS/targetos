// ═══════════════════════════════════════════════════════════════
// INSTALL PROMPT (July 2026)
// "📲 Install TargetOS" banner on mobile browsers. Android/Chrome:
// triggers the real install prompt (beforeinstallprompt). iOS Safari
// has no API — shows the Share → Add to Home Screen steps instead.
// Hidden when already installed (standalone) and for 30 days after
// dismissal.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'

const DISMISS_KEY = 'tos_install_dismissed'
const ff = 'Inter,system-ui,sans-serif'

export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [showIosSteps, setShowIosSteps] = useState(false)

  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    if (isStandalone) return
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (dismissed && Date.now() - Number(dismissed) < 30 * 24 * 3600 * 1000) return
    } catch {}
    const onPrompt = e => { e.preventDefault(); setDeferred(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    // iOS never fires the event — show the banner there regardless
    if (isIOS) setShow(true)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    setShow(false); setShowIosSteps(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
  }
  async function install() {
    if (deferred) {
      deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') setShow(false)
      setDeferred(null)
    } else if (isIOS) setShowIosSteps(true)
  }

  if (!show || isStandalone) return null
  return (
    <>
      <div style={{ position: 'fixed', bottom: 74, left: 10, right: 10, zIndex: 2000,
        background: '#1B2B4B', borderRadius: 14, padding: '12px 14px', display: 'flex',
        alignItems: 'center', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,.35)', fontFamily: ff }}>
        <img src="/icons/icon-96.png" alt="" style={{ width: 40, height: 40, borderRadius: 9 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>Install TargetOS</div>
          <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>Full screen, app icon, one tap from your home screen</div>
        </div>
        <button onClick={install}
          style={{ padding: '9px 14px', borderRadius: 9, border: 'none', background: '#CC2200', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: ff, flexShrink: 0 }}>
          📲 Install
        </button>
        <button onClick={dismiss}
          style={{ border: 'none', background: 'none', color: 'rgba(255,255,255,.6)', fontSize: 16, cursor: 'pointer', padding: 4, flexShrink: 0 }}>✕</button>
      </div>

      {showIosSteps && (
        <div onClick={dismiss} style={{ position: 'fixed', inset: 0, zIndex: 2001, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel, #fff)', borderRadius: '16px 16px 0 0', padding: '20px 18px 30px', width: '100%', fontFamily: ff }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text, #111)', marginBottom: 12 }}>📲 Add TargetOS to your iPhone</div>
            {[
              ['1', 'Tap the Share button', 'The square with the arrow, at the bottom of Safari'],
              ['2', 'Scroll and tap "Add to Home Screen"', ''],
              ['3', 'Tap "Add"', 'TargetOS appears like a real app'],
            ].map(([n, t, d]) => (
              <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#CC2200', color: '#fff', fontSize: 13, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #111)' }}>{t}</div>
                  {d && <div style={{ fontSize: 11.5, color: 'var(--muted, #666)' }}>{d}</div>}
                </div>
              </div>
            ))}
            <button onClick={dismiss} style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border, #ddd)', background: 'transparent', color: 'var(--text, #111)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: ff }}>Got it</button>
          </div>
        </div>
      )}
    </>
  )
}
