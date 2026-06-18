import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn, Input, Grid2 } from '../components/UI'

const THEMES = [['light','#F4F5F7','Light','#1A202C'],['dark','#0F1520','Dark','#E8EDF3'],['slate','#1A2332','Slate','#E2E8F0']]
const INTEGRATIONS = [
  ['Twilio','Phone system — calls, SMS, IVR, extensions 101–108','Not connected','https://twilio.com','#CC2200'],
  ['Resend (Email) ✅','Email blast sending','Not connected','https://resend.com','#CC2200'],
  ['Google Maps','Live maps — key AIzaSyDPvAMfd7OoW5eCx1ILkDtCE8Fs4fwZIDw','Key saved ✓','#','#16A34A'],
  ['OneKey MLS','Live listing data — Rockland County NY','Pending approval','#','var(--border)'],
  ['WhatsApp Business','Meta business verification required','Pending','#','var(--border)'],
  ['Google Calendar','Sync appointments both ways','Connect','https://calendar.google.com','#1B2B4B'],
  ['Gmail / Outlook','Connect email to log conversations','Connect','#','#1B2B4B'],
  ['DocuSign','Send documents for e-signature','Connect','https://docusign.com','#1B2B4B'],
]

export function Settings() {
  const { state } = useApp()
  const [tab, setTab] = useState('profile')
  const [currentTheme, setCurrentTheme] = useState('light')

  function setTheme(t) {
    setCurrentTheme(t)
    document.body.className = t
  }

  return (
    <div style={{maxWidth:'660px'}}>
      {/* Tab bar */}
      <div style={{display:'flex',gap:'2px',background:'var(--dim)',borderRadius:'12px',padding:'4px',marginBottom:'18px'}}>
        {[['profile','My Profile'],['theme','Theme & Colors'],['integrations','Integrations']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'9px 12px',borderRadius:'9px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:tab===k?'var(--panel)':'transparent',color:tab===k?'var(--text)':'var(--muted)',boxShadow:tab===k?'0 1px 3px rgba(0,0,0,.08)':'none'}}>
            {l}
          </button>
        ))}
      </div>

      {tab==='profile' && (
        <>
          <Card style={{marginBottom:'13px'}}>
            <CardHeader>My Profile</CardHeader>
            <div style={{padding:'18px'}}>
              <Grid2 gap={10}><Input label="First Name" value="Yanky"/><Input label="Last Name" value="Lichtenstein"/></Grid2>
              <Input label="Email" value={state.user?.email||'yanky@targetreteam.com'} type="email"/>
              <Grid2 gap={10}><Input label="Phone" value="845-424-1014" type="tel"/><Input label="Extension" value="104"/></Grid2>
              <Btn onClick={()=>alert('Profile saved!')}>Save Profile</Btn>
            </div>
          </Card>
          <Card>
            <CardHeader>Change Password</CardHeader>
            <div style={{padding:'18px'}}>
              <Input label="Current Password" type="password"/>
              <Input label="New Password" type="password"/>
              <Input label="Confirm New Password" type="password"/>
              <Btn onClick={()=>alert('Password updated!')}>Update Password</Btn>
            </div>
          </Card>
        </>
      )}

      {tab==='theme' && (
        <Card>
          <CardHeader>Color Mode</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{display:'flex',gap:'10px',marginBottom:'20px'}}>
              {THEMES.map(([k,bg,label,tc])=>(
                <div key={k} onClick={()=>setTheme(k)} style={{flex:1,background:bg,border:'2.5px solid '+(currentTheme===k?'var(--red)':'transparent'),borderRadius:'12px',padding:'16px',cursor:'pointer',textAlign:'center',transition:'border-color .15s'}}>
                  <div style={{color:tc,fontSize:'13px',fontWeight:700}}>{label}</div>
                  <div style={{color:tc,fontSize:'11px',opacity:.5,marginTop:'3px'}}>{k==='light'?'Default':k==='dark'?'Night mode':'Cool blue'}</div>
                </div>
              ))}
            </div>
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,marginBottom:'8px'}}>Custom brand colors coming soon</div>
              <div style={{fontSize:'11px',color:'var(--muted)',lineHeight:1.6}}>Full color customization — primary accent, sidebar, backgrounds, card colors — available in the next update.</div>
            </div>
          </div>
        </Card>
      )}

      {tab==='integrations' && (
        <Card>
          <CardHeader>Integrations</CardHeader>
          {INTEGRATIONS.map(([name,desc,status,url,color])=>(
            <div key={name} style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:'12px',fontWeight:700}}>{name}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{desc}</div>
              </div>
              <a href={url} target="_blank" rel="noreferrer" style={{textDecoration:'none'}}>
                <button style={{background:status.includes('✓')?'rgba(22,163,74,.1)':status==='Not connected'?'var(--red)':status==='Connect'?'var(--navy)':'var(--dim)',color:status.includes('✓')?'#16A34A':status==='Not connected'||status==='Connect'?'#fff':'var(--muted)',border:'none',borderRadius:'8px',fontSize:'10px',fontWeight:700,padding:'6px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',whiteSpace:'nowrap'}}>
                  {status}
                </button>
              </a>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
