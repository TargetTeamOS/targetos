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
      dispatch({ type:'SET_USER', payload: data.user })
      dispatch({ type:'SET_AGENT', payload: agent })
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'#1B2B4B',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:'20px',padding:'40px 36px',width:'100%',maxWidth:'380px',boxShadow:'0 24px 64px rgba(0,0,0,.25)'}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:'4px'}}>
          <svg width="42" height="50" viewBox="0 0 60 70">
            <rect x="8" y="0" width="14" height="70" rx="3" fill="#1B2B4B"/>
            <rect x="38" y="0" width="5" height="70" rx="2" fill="#CC2200"/>
            <rect x="8" y="60" width="35" height="4" rx="2" fill="#CC2200"/>
          </svg>
        </div>
        <div style={{fontSize:'26px',fontWeight:900,color:'#1B2B4B',textAlign:'center'}}>
          Target<span style={{color:'#CC2200'}}>OS</span>
        </div>
        <div style={{fontSize:'10px',color:'#94A3B8',letterSpacing:'2px',textTransform:'uppercase',textAlign:'center',margin:'3px 0 26px'}}>
          Keller Williams Valley Realty
        </div>

        <form onSubmit={handleLogin}>
          <label style={{display:'block',fontSize:'10px',fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="yanky@targetreteam.com" autoComplete="email"
            style={{width:'100%',background:'#F8F9FA',border:'1.5px solid #E1E5EA',borderRadius:'10px',color:'#1A202C',fontSize:'14px',fontFamily:'Inter,system-ui,sans-serif',padding:'13px 14px',outline:'none',marginBottom:'11px'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='#E1E5EA'}/>

          <label style={{display:'block',fontSize:'10px',fontWeight:600,color:'#64748B',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
            placeholder="Password" autoComplete="current-password"
            style={{width:'100%',background:'#F8F9FA',border:'1.5px solid #E1E5EA',borderRadius:'10px',color:'#1A202C',fontSize:'14px',fontFamily:'Inter,system-ui,sans-serif',padding:'13px 14px',outline:'none',marginBottom:'11px'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='#E1E5EA'}/>

          <button type="submit" disabled={loading}
            style={{width:'100%',background:'linear-gradient(135deg,#CC2200,#E8650A)',border:'none',borderRadius:'10px',color:'#fff',fontSize:'14px',fontWeight:800,fontFamily:'Inter,system-ui,sans-serif',padding:'14px',cursor:loading?'not-allowed':'pointer',opacity:loading?.6:1}}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {error && (
          <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'8px',color:'#DC2626',fontSize:'12px',padding:'9px 13px',marginTop:'9px'}}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
