import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { AGENTS } from '../lib/constants'

export function Login() {
  const { dispatch } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    if(!email || !password) { setError('Enter email and password'); return }
    setLoading(true); setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if(err) {
      setError(err.message.includes('Invalid') ? 'Incorrect email or password.' : err.message)
      setLoading(false)
    } else {
      const agent = AGENTS.find(a => a.email === email) || AGENTS[3]
      dispatch({ type:'SET_USER',  payload: data.user })
      dispatch({ type:'SET_AGENT', payload: agent })
    }
  }

  return (
    <div style={{
      position:'fixed', inset:0,
      background:'linear-gradient(135deg, #1B2B4B 0%, #0F1A2E 60%, #CC2200 200%)',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      {/* Background pattern */}
      <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(circle at 20% 50%, rgba(204,34,0,.08) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(27,43,75,.4) 0%, transparent 50%)'}}/>

      <div style={{
        background:'rgba(255,255,255,.97)', backdropFilter:'blur(20px)',
        borderRadius:'24px', padding:'44px 40px', width:'100%', maxWidth:'400px',
        boxShadow:'0 32px 80px rgba(0,0,0,.35)', position:'relative', zIndex:1,
      }}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:'6px'}}>
          <img src="/logo.png" alt="Target Team Logo"
            style={{width:'72px', height:'72px', objectFit:'contain'}}/>
        </div>

        <div style={{fontSize:'28px', fontWeight:900, color:'#1B2B4B', textAlign:'center', letterSpacing:'-.5px'}}>
          Target<span style={{color:'#CC2200'}}>OS</span>
        </div>
        <div style={{fontSize:'11px', color:'#94A3B8', letterSpacing:'2px', textTransform:'uppercase', textAlign:'center', margin:'4px 0 28px'}}>
          Keller Williams Valley Realty
        </div>

        <form onSubmit={handleLogin}>
          <label style={{display:'block',fontSize:'11px',fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'6px'}}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="yanky@targetreteam.com" autoComplete="email"
            style={{width:'100%',background:'#F8F9FA',border:'1.5px solid #E1E5EA',borderRadius:'12px',color:'#1A202C',fontSize:'14px',fontFamily:'Inter,system-ui,sans-serif',padding:'14px 16px',outline:'none',marginBottom:'14px',boxSizing:'border-box'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='#E1E5EA'}/>

          <label style={{display:'block',fontSize:'11px',fontWeight:700,color:'#64748B',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'6px'}}>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="••••••••" autoComplete="current-password"
            style={{width:'100%',background:'#F8F9FA',border:'1.5px solid #E1E5EA',borderRadius:'12px',color:'#1A202C',fontSize:'14px',fontFamily:'Inter,system-ui,sans-serif',padding:'14px 16px',outline:'none',marginBottom:'18px',boxSizing:'border-box'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='#E1E5EA'}/>

          <button type="submit" disabled={loading} style={{
            width:'100%', background:'linear-gradient(135deg, #CC2200, #E8650A)',
            border:'none', borderRadius:'12px', color:'#fff',
            fontSize:'15px', fontWeight:800, fontFamily:'Inter,system-ui,sans-serif',
            padding:'15px', cursor:loading?'not-allowed':'pointer',
            opacity:loading?.7:1, letterSpacing:'.3px',
            boxShadow:'0 4px 16px rgba(204,34,0,.3)',
          }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        {error && (
          <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'10px',color:'#DC2626',fontSize:'13px',padding:'11px 14px',marginTop:'12px',textAlign:'center'}}>
            {error}
          </div>
        )}

        <div style={{textAlign:'center',marginTop:'20px',color:'#94A3B8',fontSize:'11px'}}>
          Target Team · 845.424.1014 · @thetargetteam
        </div>
      </div>
    </div>
  )
}
