import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function Login() {
  const { signIn } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e?.preventDefault()
    if (!email || !password) { setError('Enter your email and password'); return }
    setLoading(true); setError('')
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch(err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Wrong email or password. Try again.'
        : err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2B4B 50%, #0F1A2E 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Background texture */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle at 20% 50%, rgba(204,34,0,.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(245,166,35,.06) 0%, transparent 50%)', pointerEvents:'none' }}/>

      <div style={{ width:'100%', maxWidth:'380px', position:'relative' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'40px' }}>
          <div style={{ fontSize:'42px', fontWeight:900, color:'#fff', letterSpacing:'-1px' }}>
            Target<span style={{ color:'#F5A623' }}>OS</span>
          </div>
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,.45)', marginTop:'6px', letterSpacing:'2px', textTransform:'uppercase' }}>
            Target Team · KW Valley Realty
          </div>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:'20px', padding:'32px', backdropFilter:'blur(12px)' }}>
          <div style={{ fontSize:'20px', fontWeight:800, color:'#fff', marginBottom:'6px' }}>Sign in</div>
          <div style={{ fontSize:'13px', color:'rgba(255,255,255,.45)', marginBottom:'24px' }}>Use your team email and password</div>

          {error && (
            <div style={{ background:'rgba(220,38,38,.12)', border:'1px solid rgba(220,38,38,.3)', borderRadius:'10px', padding:'11px 14px', marginBottom:'18px', fontSize:'13px', color:'#FCA5A5' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:'6px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="you@targetreteam.com"
              autoComplete="email"
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1.5px solid rgba(255,255,255,.12)', borderRadius:'10px', color:'#fff', fontSize:'14px', fontFamily:'Inter,system-ui,sans-serif', padding:'12px 14px', outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e => e.target.style.borderColor = '#CC2200'}
              onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
            />
          </div>

          <div style={{ marginBottom:'22px' }}>
            <label style={{ display:'block', fontSize:'11px', fontWeight:600, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.8px', marginBottom:'6px' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1.5px solid rgba(255,255,255,.12)', borderRadius:'10px', color:'#fff', fontSize:'14px', fontFamily:'Inter,system-ui,sans-serif', padding:'12px 14px', outline:'none', boxSizing:'border-box', transition:'border-color .15s' }}
              onFocus={e => e.target.style.borderColor = '#CC2200'}
              onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,.12)'}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width:'100%', background:'linear-gradient(135deg,#CC2200,#E8650A)', border:'none', borderRadius:'12px', color:'#fff', fontSize:'15px', fontWeight:800, padding:'14px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:loading?.7:1, transition:'opacity .15s, transform .1s', letterSpacing:'.3px' }}
            onMouseDown={e => e.currentTarget.style.transform='scale(.98)'}
            onMouseUp={e   => e.currentTarget.style.transform='scale(1)'}
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </div>

        <div style={{ textAlign:'center', marginTop:'24px', fontSize:'12px', color:'rgba(255,255,255,.2)' }}>
          © 2026 Target Team · KW Valley Realty · v2.0
        </div>
      </div>
    </div>
  )
}
