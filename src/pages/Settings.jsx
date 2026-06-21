import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { updateAgent } from '../lib/db/agents'
import { sendEmail } from '../lib/emailService'

export function Settings() {
  const { agent, signOut } = useAuth()
  const { state, dispatch, toast } = useApp()
  const [theme, setTheme]   = useState(state.theme || 'light')
  const [testing, setTesting] = useState({})
  const [results, setResults] = useState({})
  const [newPw, setNewPw]   = useState('')
  const [savingPw, setSavingPw] = useState(false)

  function setResult(key, ok, msg) {
    setResults(r=>({...r,[key]:{ok,msg}}))
    setTesting(t=>({...t,[key]:false}))
  }

  async function testDB() {
    setTesting(t=>({...t,db:true}))
    try {
      const { data, error } = await supabase.from('contacts').select('count').limit(1)
      if (error) throw error
      setResult('db', true, '✅ Supabase connected — database responding')
    } catch(e) { setResult('db', false, '❌ '+e.message) }
  }

  async function testEmail() {
    setTesting(t=>({...t,email:true}))
    const result = await sendEmail({
      to: agent?.email || 'yanky@targetreteam.com',
      subject: '✅ TargetOS V2 Email Test',
      html: `<div style="font-family:Arial;padding:24px;max-width:500px;margin:0 auto;"><h2 style="color:#1B2B4B;">✅ Email Working!</h2><p>TargetOS V2 email system confirmed at ${new Date().toLocaleString()}</p></div>`
    })
    setResult('email', result.success, result.success ? `✅ Email sent to ${agent?.email}!` : '❌ Failed: '+result.error)
  }

  async function updatePassword() {
    if(!newPw || newPw.length < 6) { toast('Minimum 6 characters','#DC2626'); return }
    setSavingPw(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      toast('✅ Password updated!'); setNewPw('')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSavingPw(false) }
  }

  function applyTheme(t) {
    setTheme(t); dispatch({ type:'SET_THEME', theme:t })
  }

  const TESTS = [
    { key:'db',    label:'Database Connection',  icon:'🗄', desc:'Tests Supabase is connected',          fn:testDB    },
    { key:'email', label:'Email Sending',         icon:'✉', desc:`Sends test to ${agent?.email||'you'}`, fn:testEmail },
  ]

  return (
    <div>
      <div style={{ fontSize:'20px',fontWeight:900,marginBottom:'16px' }}>⚙️ Settings</div>

      {/* System Health */}
      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'14px' }}>
        <div style={{ padding:'13px 16px',borderBottom:'1px solid var(--border)',fontSize:'13px',fontWeight:700 }}>🔌 System Health</div>
        <div style={{ padding:'4px 0' }}>
          {TESTS.map(test=>(
            <div key={test.key} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:'20px',flexShrink:0 }}>{test.icon}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px',fontWeight:700 }}>{test.label}</div>
                <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>{test.desc}</div>
                {results[test.key]&&<div style={{ marginTop:'5px',fontSize:'11px',fontWeight:600,color:results[test.key].ok?'#16A34A':'#DC2626',background:results[test.key].ok?'rgba(22,163,74,.07)':'#FEF2F2',borderRadius:'6px',padding:'5px 9px' }}>{results[test.key].msg}</div>}
              </div>
              <button onClick={test.fn} disabled={testing[test.key]}
                style={{ background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontWeight:600,padding:'7px 14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:testing[test.key]?.6:1 }}>
                {testing[test.key]?'Testing…':'Test'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'14px' }}>
        <div style={{ padding:'13px 16px',borderBottom:'1px solid var(--border)',fontSize:'13px',fontWeight:700 }}>🎨 Appearance</div>
        <div style={{ padding:'16px',display:'flex',gap:'8px' }}>
          {[['light','☀️ Light'],['dark','🌙 Dark'],['slate','💎 Slate']].map(([k,l])=>(
            <div key={k} onClick={()=>applyTheme(k)}
              style={{ flex:1,padding:'12px',borderRadius:'10px',border:`2px solid ${theme===k?'#CC2200':'var(--border)'}`,background:theme===k?'rgba(204,34,0,.06)':'transparent',cursor:'pointer',textAlign:'center',fontSize:'13px',fontWeight:700,color:theme===k?'#CC2200':'var(--muted)',transition:'all .15s' }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'14px' }}>
        <div style={{ padding:'13px 16px',borderBottom:'1px solid var(--border)',fontSize:'13px',fontWeight:700 }}>👤 Account</div>
        <div style={{ padding:'16px' }}>
          <div style={{ marginBottom:'12px' }}>
            <div style={{ fontSize:'13px',fontWeight:600,marginBottom:'2px' }}>{agent?.name}</div>
            <div style={{ fontSize:'12px',color:'var(--muted)' }}>{agent?.email} · <span style={{ fontWeight:600,textTransform:'capitalize' }}>{agent?.role}</span></div>
          </div>
          <div style={{ marginBottom:'12px' }}>
            <label style={lbl}>New Password</label>
            <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Minimum 6 characters"
              style={{ width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none',boxSizing:'border-box' }}/>
          </div>
          <div style={{ display:'flex',gap:'8px' }}>
            <button onClick={updatePassword} disabled={savingPw}
              style={{ background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 18px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:savingPw?.7:1 }}>
              {savingPw?'Saving…':'Update Password'}
            </button>
            <button onClick={signOut}
              style={{ background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'9px 18px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden' }}>
        <div style={{ padding:'13px 16px',borderBottom:'1px solid var(--border)',fontSize:'13px',fontWeight:700 }}>ℹ️ About TargetOS</div>
        <div style={{ padding:'16px' }}>
          {[['Version','2.0 — June 2026'],['Team','Target Team · KW Valley Realty'],['Database','Supabase (Postgres + Realtime + RLS)'],['Email','Resend'],['Domain','app.targetreteam.com']].map(([k,v])=>(
            <div key={k} style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12px' }}>
              <span style={{ color:'var(--muted)',fontWeight:600 }}>{k}</span>
              <span style={{ fontWeight:700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px' }
