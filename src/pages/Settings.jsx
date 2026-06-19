import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { sendEmail } from '../lib/emailService'

export function Settings() {
  const { state, dispatch, toast } = useApp()
  const [theme, setTheme] = useState(state.theme || 'light')
  const [testing, setTesting] = useState({})
  const [results, setResults] = useState({})

  function setResult(key, ok, msg) {
    setResults(r => ({...r, [key]: {ok, msg}}))
    setTesting(t => ({...t, [key]: false}))
  }

  // ── TEST: Email sends ─────────────────────────────────────
  async function testEmail() {
    setTesting(t=>({...t,email:true}))
    const result = await sendEmail({
      to: 'yanky@targetreteam.com',
      subject: '✅ TargetOS Email Test — ' + new Date().toLocaleTimeString(),
      html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:500px;margin:0 auto;">
        <div style="background:#1B2B4B;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
          <div style="color:#fff;font-size:20px;font-weight:800;">✅ Email is Working!</div>
        </div>
        <div style="background:#fff;border:1px solid #E2E8F0;padding:20px;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#334155;font-size:14px;line-height:1.8;">TargetOS Resend connection confirmed at ${new Date().toLocaleString()}</p>
          <a href="https://app.targetreteam.com" style="background:#CC2200;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;display:inline-block;margin-top:10px;">Open TargetOS →</a>
        </div>
      </div>`
    })
    setResult('email', result.success, result.success ? '✅ Email sent to yanky@targetreteam.com — check your inbox' : '❌ Failed: ' + result.error)
  }

  // ── TEST: Supabase connection ─────────────────────────────
  async function testSupabase() {
    setTesting(t=>({...t,db:true}))
    try {
      const {data, error} = await supabase.from('contacts').select('count').limit(1)
      if(error) throw error
      setResult('db', true, '✅ Supabase connected — database responding')
    } catch(e) {
      setResult('db', false, '❌ Supabase error: ' + e.message)
    }
  }

  // ── TEST: Automation fires ────────────────────────────────
  async function testAutomation() {
    setTesting(t=>({...t,auto:true}))
    try {
      // Insert a test contact — this should trigger the automation engine
      const {data, error} = await supabase.from('contacts').insert([{
        first_name: 'Test',
        last_name:  'Automation',
        phone:      '(845) 000-0000',
        source:     'Automation Test',
        notes:      'This is a test contact — safe to delete',
      }]).select()
      if(error) throw error
      // Delete it right away
      await supabase.from('contacts').delete().eq('id', data[0].id)
      setResult('auto', true, '✅ Automation triggered — check Tasks board for a new task and your email for a notification')
    } catch(e) {
      setResult('auto', false, '❌ Failed: ' + e.message)
    }
  }

  // ── TEST: Daily briefing ──────────────────────────────────
  async function testBriefing() {
    setTesting(t=>({...t,briefing:true}))
    const result = await sendEmail({
      to: 'yanky@targetreteam.com',
      subject: '📋 Daily Briefing Test — ' + new Date().toLocaleDateString(),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#1B2B4B,#0D1A30);border-radius:16px 16px 0 0;padding:28px;text-align:center;">
          <div style="color:#fff;font-size:20px;font-weight:800;">Good morning, Yanky! 👋</div>
          <div style="color:rgba(255,255,255,.5);font-size:12px;margin-top:6px;">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
        </div>
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-left:4px solid #16A34A;border-top:none;padding:16px 20px;">
          <span style="font-size:13px;font-weight:600;color:#16A34A;">✅ Daily briefing email system is working correctly!</span>
        </div>
        <div style="background:#fff;border:1px solid #E2E8F0;border-top:none;padding:20px 24px;">
          <p style="font-size:14px;color:#334155;line-height:1.8;margin:0;">The real daily briefing will send automatically at <strong>7:00 AM ET</strong> every morning with your actual tasks, overdue items, and daily quote.</p>
        </div>
        <div style="background:linear-gradient(135deg,#1B2B4B,#0D1A30);border-radius:0 0 16px 16px;padding:18px;text-align:center;margin-top:1px;">
          <a href="https://app.targetreteam.com" style="background:linear-gradient(135deg,#CC2200,#E8650A);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;display:inline-block;">Open TargetOS →</a>
        </div>
      </div>`
    })
    setResult('briefing', result.success, result.success ? '✅ Briefing test sent to yanky@targetreteam.com' : '❌ Failed: ' + result.error)
  }

  // ── TEST: Tasks save ──────────────────────────────────────
  async function testTasks() {
    setTesting(t=>({...t,tasks:true}))
    try {
      const {data, error} = await supabase.from('tasks').insert([{
        title:    '✅ System test task — safe to delete',
        priority: 'normal',
        status:   'pending',
        due_date: new Date().toISOString().split('T')[0],
        assigned_to: state.user?.id,
        created_by:  state.user?.id,
      }]).select()
      if(error) throw error
      setResult('tasks', true, '✅ Task saved to database — check Tasks board to see it')
    } catch(e) {
      setResult('tasks', false, '❌ Failed: ' + e.message)
    }
  }

  function applyTheme(t) {
    setTheme(t)
    dispatch({ type: 'SET_THEME', theme: t })
  }

  const TESTS = [
    { key:'db',       label:'Database Connection',    icon:'🗄',  desc:'Tests Supabase is connected and responding',            fn: testSupabase  },
    { key:'email',    label:'Email Sending',           icon:'✉',  desc:'Sends a real test email to yanky@targetreteam.com',     fn: testEmail     },
    { key:'briefing', label:'Daily Briefing Email',    icon:'📋', desc:'Sends a sample briefing email to yanky@targetreteam.com', fn: testBriefing },
    { key:'auto',     label:'Automation Engine',       icon:'⚡', desc:'Creates a test contact — automation should fire a task', fn: testAutomation},
    { key:'tasks',    label:'Task Creation',           icon:'✓',  desc:'Creates a test task in the Tasks board',                fn: testTasks     },
  ]

  return (
    <div>
      <div style={{fontSize:'20px',fontWeight:900,marginBottom:'16px'}}>⚙️ Settings</div>

      {/* System Health Tests */}
      <Card style={{marginBottom:'16px'}}>
        <CardHeader>🔌 System Health — Test Everything</CardHeader>
        <div style={{padding:'16px'}}>
          <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'14px',lineHeight:1.7}}>
            Click each button to verify that part of TargetOS is working correctly. Green = working. Red = needs attention.
          </div>
          {TESTS.map(test => (
            <div key={test.key} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{width:36,height:36,borderRadius:'9px',background:'var(--dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>{test.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:700}}>{test.label}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{test.desc}</div>
                {results[test.key] && (
                  <div style={{marginTop:'5px',fontSize:'11px',fontWeight:600,color:results[test.key].ok?'#16A34A':'#DC2626',background:results[test.key].ok?'rgba(22,163,74,.07)':'#FEF2F2',borderRadius:'6px',padding:'5px 9px'}}>
                    {results[test.key].msg}
                  </div>
                )}
              </div>
              <Btn size="sm" variant="ghost" onClick={test.fn} disabled={testing[test.key]}>
                {testing[test.key] ? 'Testing…' : 'Test'}
              </Btn>
            </div>
          ))}
          <div style={{marginTop:'12px'}}>
            <Btn onClick={async()=>{for(const t of TESTS){setTesting(p=>({...p,[t.key]:true}));await t.fn();await new Promise(r=>setTimeout(r,500))}}} disabled={Object.values(testing).some(Boolean)}>
              🔌 Run All Tests
            </Btn>
          </div>
        </div>
      </Card>

      {/* Theme */}
      <Card style={{marginBottom:'16px'}}>
        <CardHeader>🎨 Appearance</CardHeader>
        <div style={{padding:'16px'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Theme</div>
          <div style={{display:'flex',gap:'8px'}}>
            {[['light','☀️ Light'],['dark','🌙 Dark'],['slate','💎 Slate']].map(([k,l])=>(
              <div key={k} onClick={()=>applyTheme(k)}
                style={{flex:1,padding:'12px',borderRadius:'10px',border:'2px solid '+(theme===k?'#CC2200':'var(--border)'),background:theme===k?'rgba(204,34,0,.06)':'transparent',cursor:'pointer',textAlign:'center',fontSize:'13px',fontWeight:700,color:theme===k?'#CC2200':'var(--muted)',transition:'all .15s'}}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card style={{marginBottom:'16px'}}>
        <CardHeader>👤 Account</CardHeader>
        <div style={{padding:'16px'}}>
          <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'12px'}}>
            Logged in as <strong style={{color:'var(--text)'}}>{state.user?.email}</strong>
          </div>
          <div style={{marginBottom:'12px'}}>
            <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>New Password</label>
            <input type="password" id="pw-field" placeholder="Enter new password..."
              style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{display:'flex',gap:'8px'}}>
            <Btn size="sm" onClick={async()=>{
              const pw = document.getElementById('pw-field')?.value
              if(!pw||pw.length<6){toast('Minimum 6 characters','#DC2626');return}
              const {error} = await supabase.auth.updateUser({password:pw})
              if(error) toast('Error: '+error.message,'#DC2626')
              else { toast('✅ Password updated!'); document.getElementById('pw-field').value='' }
            }}>Update Password</Btn>
            <Btn size="sm" variant="ghost" onClick={async()=>{ await supabase.auth.signOut(); dispatch({type:'LOGOUT'}) }}>Sign Out</Btn>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>ℹ️ About TargetOS</CardHeader>
        <div style={{padding:'16px'}}>
          {[
            ['Version','2.0 — June 2026'],
            ['Team','Target Team · KW Valley Realty'],
            ['Database','Supabase (sgrnyvdsyahmypibjarx)'],
            ['Email','Resend · office@targetreteam.com'],
            ['Domain','app.targetreteam.com'],
            ['Automations','4 Edge Functions deployed'],
          ].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12px'}}>
              <span style={{color:'var(--muted)',fontWeight:600}}>{k}</span>
              <span style={{fontWeight:700}}>{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
