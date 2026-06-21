import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) { setError('Email and password required'); return }
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
    } catch(err) {
      setError(err.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0F1A2E', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,system-ui,sans-serif', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'380px' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <div style={{ fontSize:'32px', fontWeight:900, color:'#fff', marginBottom:'6px' }}>
            Target<span style={{ color:'#F5A623' }}>OS</span>
          </div>
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,.4)' }}>Target Team · KW Valley Realty</div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:'16px', padding:'28px' }}>
          <div style={{ marginBottom:'16px' }}>
            <label style={{ display:'block', fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'6px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@targetreteam.com"
              autoComplete="email"
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1.5px solid rgba(255,255,255,.12)', borderRadius:'10px', color:'#fff', fontSize:'14px', fontFamily:'Inter,system-ui,sans-serif', padding:'12px 14px', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor = '#CC2200'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
            />
          </div>

          <div style={{ marginBottom:'20px' }}>
            <label style={{ display:'block', fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'6px' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1.5px solid rgba(255,255,255,.12)', borderRadius:'10px', color:'#fff', fontSize:'14px', fontFamily:'Inter,system-ui,sans-serif', padding:'12px 14px', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor = '#CC2200'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
            />
          </div>

          {error && (
            <div style={{ background:'rgba(220,38,38,.12)', border:'1px solid rgba(220,38,38,.3)', borderRadius:'8px', padding:'10px 13px', marginBottom:'16px', fontSize:'12px', color:'#FCA5A5' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width:'100%', background:'linear-gradient(135deg,#CC2200,#E8650A)', border:'none', borderRadius:'10px', color:'#fff', fontSize:'14px', fontWeight:700, padding:'13px', cursor:loading?'not-allowed':'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:loading?.7:1, transition:'opacity .2s' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:'20px', fontSize:'11px', color:'rgba(255,255,255,.2)' }}>
          TargetOS v2 · Secure agent login
        </div>
      </div>
    </div>
  )
}
