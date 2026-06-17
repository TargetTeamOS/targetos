import React, { useState } from 'react'
import { Card, CardHeader, Btn, Grid2 } from '../components/UI'

export function Email() {
  const [subject, setSubject] = useState('New Listing Alert — Suffern NY 10901')
  const [template, setTemplate] = useState(0)

  const templates = ['New Listing Alert','Open House Invite','Just Sold','Market Report','Coming Soon','Custom']
  const campaigns = [
    {title:'New Listing — 84 Tennyson Dr',stats:'142 sent · 68% open',date:'Jun 12'},
    {title:'Open House — 12 Sherman Dr',stats:'98 sent · 71% open',date:'Jun 8'},
    {title:'Just Sold — 47 Prairie Ave',stats:'205 sent · 62% open',date:'Jun 1'},
  ]

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
        <div>
          <Card style={{marginBottom:'13px'}}>
            <CardHeader>New Campaign</CardHeader>
            <div style={{padding:'16px'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Template</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginBottom:'14px'}}>
                {templates.map((t,i)=>(
                  <div key={i} onClick={()=>setTemplate(i)} style={{background:template===i?'rgba(204,34,0,.08)':'var(--dim)',border:'1.5px solid '+(template===i?'#CC2200':'var(--border)'),borderRadius:'8px',padding:'9px',cursor:'pointer',textAlign:'center',fontSize:'11px',fontWeight:template===i?700:400,color:'var(--text)',transition:'all .15s'}}>{t}</div>
                ))}
              </div>

              <div style={{marginBottom:'12px'}}>
                <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Subject Line</label>
                <input value={subject} onChange={e=>setSubject(e.target.value)} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}} onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              </div>

              <div style={{marginBottom:'12px'}}>
                <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Recipients</label>
                <select style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}>
                  <option>All Buyers</option><option>All Sellers</option><option>All Contacts</option><option>Hot Leads Only</option>
                </select>
              </div>

              <div style={{display:'flex',gap:'7px'}}>
                <Btn style={{flex:1}} onClick={()=>alert('To send real emails, connect Resend in Settings → Integrations')}>Send Campaign</Btn>
                <Btn variant="ghost" onClick={()=>alert('Draft saved!')}>Save Draft</Btn>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>Recent Campaigns</CardHeader>
            {campaigns.map((c,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'12px',fontWeight:700}}>{c.title}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{c.stats}</div>
                </div>
                <div style={{fontSize:'11px',color:'var(--muted)'}}>{c.date}</div>
                <Btn size="xs" variant="ghost" onClick={()=>alert('Campaign duplicated!')}>Reuse</Btn>
              </div>
            ))}
          </Card>
        </div>

        <Card>
          <CardHeader>Email Preview</CardHeader>
          <div style={{padding:'14px'}}>
            <div style={{background:'#fff',borderRadius:'9px',overflow:'hidden',fontFamily:'Arial,sans-serif',border:'1px solid #E1E5EA'}}>
              <div style={{background:'#1B2B4B',padding:'12px 16px',display:'flex',alignItems:'center',gap:'8px'}}>
                <svg width="16" height="20" viewBox="0 0 60 70"><rect x="8" y="0" width="14" height="70" rx="3" fill="#fff"/><rect x="38" y="0" width="5" height="70" rx="2" fill="#CC2200"/><rect x="8" y="60" width="35" height="4" rx="2" fill="#CC2200"/></svg>
                <span style={{color:'#fff',fontWeight:700,fontSize:'13px'}}>Target Team — KW Valley Realty</span>
              </div>
              <div style={{padding:'16px'}}>
                <div style={{background:'#F4F5F7',borderRadius:'8px',height:'80px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',color:'#64748B',marginBottom:'12px'}}>Property Photo</div>
                <div style={{color:'#1B2B4B',fontSize:'14px',fontWeight:800,marginBottom:'5px'}}>New Listing — Suffern NY</div>
                <div style={{color:'#444',fontSize:'11px',lineHeight:'1.7',marginBottom:'11px'}}>47 Prairie Ave · 4 bed · 2 bath · 1,568 sqft<br/>Listed at <strong>$599,000</strong></div>
                <div style={{background:'#CC2200',borderRadius:'7px',padding:'9px',color:'#fff',fontSize:'11px',fontWeight:700,textAlign:'center',marginBottom:'12px'}}>View Listing</div>
                <div style={{color:'#94A3B8',fontSize:'9px',textAlign:'center'}}>Target Team · KW Valley Realty · 845.424.1014 · Unsubscribe</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
