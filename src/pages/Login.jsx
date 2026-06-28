// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Login Page
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function Login() {
  const { signIn } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch(err) {
      setError(err.message || 'Login failed. Check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F1A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ff, padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '16px', background: '#CC2200', fontSize: '28px', fontWeight: 900, color: '#fff', marginBottom: '16px' }}>T</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#fff', letterSpacing: '-.02em' }}>
            Target<span style={{ color: '#F5A623' }}>OS</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '13px', marginTop: '4px' }}>
            KW Valley Realty — Target Team
          </div>
        </div>

        {/* Card */}
        <div style={{ background: '#1A2744', borderRadius: '16px', padding: '32px', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '24px' }}>Sign in</div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@targetreteam.com"
                style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: '14px', fontFamily: ff, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ width: '100%', padding: '11px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: '14px', fontFamily: ff, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {error && (
              <div style={{ background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#FCA5A5', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px', background: loading ? '#AA1C00' : '#CC2200', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background .15s' }}>
              {loading ? '⏳ Signing in...' : 'Sign in →'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px', color: 'rgba(255,255,255,.25)', fontSize: '11px' }}>
          Contact your admin to get access
        </div>
      </div>
    </div>
  )
}
