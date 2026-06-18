import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn, Input, Select, Grid2, Grid3 } from '../components/UI'
import { AGENTS } from '../lib/constants'
import { sendEmail } from '../lib/emailService'

// ── PRESET TEMPLATES ─────────────────────────────────────────
const TEMPLATES = [
  {
    id:'new_listing',
    name:'New Listing Alert',
    icon:'🏠',
    subject:'New Listing Just Hit the Market — {address}',
    blocks:[
      { type:'header', content:'New Listing Alert!', style:'red' },
      { type:'text',   content:'A beautiful new property is now available in your area. Don\'t miss out on this opportunity!' },
      { type:'listing_card', address:'{address}', price:'{price}', beds:'{beds}', baths:'{baths}', type:'{type}' },
      { type:'cta',    label:'View Listing', url:'{mls_link}', color:'red' },
      { type:'footer' },
    ]
  },
  {
    id:'market_update',
    name:'Market Update',
    icon:'📊',
    subject:'Rockland County Real Estate Market Update — {month}',
    blocks:[
      { type:'header', content:'Rockland County Market Update', style:'navy' },
      { type:'text',   content:'Here\'s what\'s happening in the Rockland County real estate market this month.' },
      { type:'stats',  items:[{ label:'Avg Sale Price', value:'$850,000' },{ label:'Days on Market', value:'32' },{ label:'Active Listings', value:'127' },{ label:'Sold This Month', value:'48' }] },
      { type:'text',   content:'The market continues to show strong demand. If you\'re thinking of buying or selling, now is a great time to connect with our team.' },
      { type:'cta',    label:'Schedule a Consultation', url:'https://app.targetreteam.com', color:'navy' },
      { type:'footer' },
    ]
  },
  {
    id:'open_house',
    name:'Open House Invitation',
    icon:'🏡',
    subject:'You\'re Invited — Open House at {address}',
    blocks:[
      { type:'header', content:'Open House Invitation', style:'gold' },
      { type:'text',   content:'We\'d love to have you join us for an exclusive open house viewing!' },
      { type:'event',  address:'{address}', date:'{date}', time:'{time}' },
      { type:'listing_card', address:'{address}', price:'{price}', beds:'{beds}', baths:'{baths}', type:'{type}' },
      { type:'cta',    label:'RSVP Now', url:'https://app.targetreteam.com', color:'gold' },
      { type:'footer' },
    ]
  },
  {
    id:'follow_up',
    name:'Personal Follow-Up',
    icon:'👤',
    subject:'Following Up — Target Team',
    blocks:[
      { type:'header', content:'Checking In', style:'teal' },
      { type:'text',   content:'Hi {first_name},\n\nI wanted to follow up and see how you\'re doing. Are you still looking for your perfect home?' },
      { type:'text',   content:'I have some new listings that match your criteria and would love to share them with you.' },
      { type:'cta',    label:'Let\'s Talk', url:'tel:8454241014', color:'teal' },
      { type:'footer' },
    ]
  },
  {
    id:'just_sold',
    name:'Just Sold Announcement',
    icon:'🏆',
    subject:'Just Sold in Your Neighborhood!',
    blocks:[
      { type:'header', content:'Just Sold! 🏆', style:'green' },
      { type:'text',   content:'Another successful sale by Target Team! We recently helped our clients close on a beautiful property in your area.' },
      { type:'listing_card', address:'{address}', price:'{price}', beds:'{beds}', baths:'{baths}', type:'{type}' },
      { type:'text',   content:'Thinking of selling? We\'d love to help you get top dollar for your home. Our team has the experience and connections to make it happen.' },
      { type:'cta',    label:'Get a Free Home Valuation', url:'https://app.targetreteam.com', color:'green' },
      { type:'footer' },
    ]
  },
  {
    id:'blank',
    name:'Blank / Custom',
    icon:'✏️',
    subject:'',
    blocks:[
      { type:'header', content:'', style:'red' },
      { type:'text',   content:'' },
      { type:'cta',    label:'Learn More', url:'https://app.targetreteam.com', color:'red' },
      { type:'footer' },
    ]
  },
]

// ── RECIPIENT LISTS ───────────────────────────────────────────
const RECIPIENT_GROUPS = [
  { id:'all_contacts',    label:'All Contacts',           icon:'👥', desc:'Everyone in your contacts' },
  { id:'hot_leads',       label:'Hot Leads',              icon:'🔥', desc:'Contacts with status: Hot' },
  { id:'active',          label:'Active Leads',           icon:'⚡', desc:'Contacts with status: Active' },
  { id:'buyers',          label:'Buyers',                 icon:'🛒', desc:'Contact type: Buyer' },
  { id:'sellers',         label:'Sellers',                icon:'🏠', desc:'Contact type: Seller' },
  { id:'past_clients',    label:'Past Clients',           icon:'⭐', desc:'Tag: Past Client' },
  { id:'nurturing',       label:'Nurturing',              icon:'🌱', desc:'Contacts with status: Nurturing' },
  { id:'agents_only',     label:'Team Agents Only',       icon:'👔', desc:'Internal team emails' },
  { id:'custom',          label:'Custom Selection',       icon:'✏️', desc:'Pick individual contacts' },
]

const STYLE_COLORS = { red:'#CC2200', navy:'#1B2B4B', gold:'#F5A623', teal:'#0EA5E9', green:'#16A34A' }

export function Email({ setPage }) {
  const { state, toast } = useApp()
  const [step, setStep] = useState(1) // 1=recipients, 2=template, 3=compose, 4=preview, 5=sent
  const [selectedGroups, setSelectedGroups] = useState([])
  const [customContacts, setCustomContacts] = useState([])
  const [allContacts, setAllContacts] = useState([])
  const [template, setTemplate] = useState(null)
  const [blocks, setBlocks] = useState([])
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const [sentResult, setSentResult] = useState(null)
  const [contactSearch, setContactSearch] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')

  useEffect(() => {
    supabase.from('contacts').select('id,first_name,last_name,email,status,role,assigned_agent').then(({data}) => {
      setAllContacts(data || [])
    })
  }, [])

  useEffect(() => {
    if(blocks.length > 0) setPreviewHtml(buildEmailHtml(blocks, subject))
  }, [blocks, subject])

  // ── RECIPIENT CALCULATION ────────────────────────────────
  function getRecipients() {
    let contacts = []
    if(selectedGroups.includes('all_contacts')) contacts = allContacts
    else if(selectedGroups.includes('agents_only')) return AGENTS.map(a => ({ email: agentEmail(a.name), name: a.name }))
    else if(selectedGroups.includes('custom')) contacts = customContacts
    else {
      selectedGroups.forEach(g => {
        if(g === 'hot_leads')    contacts.push(...allContacts.filter(c => c.status === 'Hot'))
        if(g === 'active')       contacts.push(...allContacts.filter(c => c.status === 'Active'))
        if(g === 'buyers')       contacts.push(...allContacts.filter(c => c.role === 'buyer'))
        if(g === 'sellers')      contacts.push(...allContacts.filter(c => c.role === 'seller'))
        if(g === 'past_clients') contacts.push(...allContacts.filter(c => c.tag === 'Past Client'))
        if(g === 'nurturing')    contacts.push(...allContacts.filter(c => c.status === 'Nurturing'))
      })
    }
    // deduplicate and filter only those with email
    const seen = new Set()
    return contacts.filter(c => c.email && !seen.has(c.email) && seen.add(c.email)).map(c => ({ email: c.email, name: c.first_name+' '+(c.last_name||''), contactId: c.id }))
  }

  function agentEmail(name) {
    const map = { 'Lazer Farkas':'lazer@targetreteam.com','Mendy Jankovits':'mendy@targetreteam.com','Isaac Leibowitz':'isaac6829490@gmail.com','Yanky Lichtenstein':'yanky@targetreteam.com','Gitty Fogel':'office@targetreteam.com','Joel Rottenstein':'joel@targetreteam.com','Eli Hoffman':'eli@targetreteam.com','Avraham Weinberger':'avraham@targetreteam.com' }
    return map[name] || ''
  }

  function selectTemplate(t) {
    setTemplate(t)
    setBlocks(JSON.parse(JSON.stringify(t.blocks))) // deep copy
    setSubject(t.subject)
    setStep(3)
  }

  async function sendCampaign() {
    const recipients = getRecipients()
    if(recipients.length === 0) { toast('No recipients with email addresses found', '#DC2626'); return }
    setSending(true)
    let sent = 0, failed = 0
    for(const r of recipients) {
      const personalizedHtml = buildEmailHtml(blocks, subject, { first_name: r.name.split(' ')[0], name: r.name })
      const personalizedSubject = subject.replace(/{first_name}/g, r.name.split(' ')[0]).replace(/{name}/g, r.name)
      const result = await sendEmail({ to: r.email, subject: personalizedSubject, html: personalizedHtml })
      if(result.success) sent++; else failed++
      await new Promise(res => setTimeout(res, 150)) // rate limit
    }
    setSending(false)
    setSentResult({ sent, failed, total: recipients.length })
    setStep(5)
    toast(`✅ Campaign sent! ${sent} delivered${failed > 0 ? ', '+failed+' failed' : ''}`)
  }

  const recipients = getRecipients()

  return (
    <div>
      {/* Designer button */}
      <div style={{background:'linear-gradient(135deg,rgba(27,43,75,.08),rgba(204,34,0,.05))',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px 18px',marginBottom:'16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:'13px',fontWeight:700,marginBottom:'2px'}}>✨ Visual Email Designer</div>
          <div style={{fontSize:'11px',color:'var(--muted)'}}>Design custom email templates with full drag-and-drop control over layout, colors, fonts and content</div>
        </div>
        <Btn size="sm" onClick={()=>setPage('designer')}>Open Designer →</Btn>
      </div>

      {/* Step indicator */}
      <div style={{display:'flex',gap:'0',marginBottom:'20px'}}>
        {['Recipients','Template','Compose','Preview','Done'].map((s,i)=>(
          <div key={s} style={{flex:1,textAlign:'center',cursor:i<step?'pointer':'default'}} onClick={()=>i<step&&setStep(i+1)}>
            <div style={{width:32,height:32,borderRadius:'50%',background:step>i+1?'#16A34A':step===i+1?'#CC2200':'var(--dim)',color:step>=i+1?'#fff':'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:700,margin:'0 auto 5px',transition:'all .2s'}}>
              {step>i+1?'✓':i+1}
            </div>
            <div style={{fontSize:'10px',fontWeight:600,color:step===i+1?'#CC2200':'var(--muted)'}}>{s}</div>
          </div>
        ))}
      </div>

      {/* ── STEP 1: RECIPIENTS ── */}
      {step===1 && (
        <div>
          <div style={{fontSize:'16px',fontWeight:800,marginBottom:'5px'}}>Who should receive this email?</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'16px'}}>Select one or more groups, or choose individual contacts</div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'10px',marginBottom:'16px'}}>
            {RECIPIENT_GROUPS.map(g=>{
              const sel = selectedGroups.includes(g.id)
              let count = 0
              if(g.id==='all_contacts') count = allContacts.length
              else if(g.id==='hot_leads') count = allContacts.filter(c=>c.status==='Hot').length
              else if(g.id==='active') count = allContacts.filter(c=>c.status==='Active').length
              else if(g.id==='buyers') count = allContacts.filter(c=>c.role==='buyer').length
              else if(g.id==='sellers') count = allContacts.filter(c=>c.role==='seller').length
              else if(g.id==='nurturing') count = allContacts.filter(c=>c.status==='Nurturing').length
              else if(g.id==='agents_only') count = 8
              else if(g.id==='past_clients') count = allContacts.filter(c=>c.tag==='Past Client').length

              return (
                <div key={g.id} onClick={()=>setSelectedGroups(prev=>prev.includes(g.id)?prev.filter(x=>x!==g.id):[...prev,g.id])}
                  style={{background:'var(--panel)',border:'2px solid '+(sel?'#CC2200':'var(--border)'),borderRadius:'12px',padding:'14px',cursor:'pointer',transition:'all .15s',position:'relative'}}>
                  {sel && <div style={{position:'absolute',top:8,right:8,width:20,height:20,borderRadius:'50%',background:'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',color:'#fff',fontWeight:800}}>✓</div>}
                  <div style={{fontSize:'24px',marginBottom:'6px'}}>{g.icon}</div>
                  <div style={{fontSize:'13px',fontWeight:700,marginBottom:'2px'}}>{g.label}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)',marginBottom:'4px'}}>{g.desc}</div>
                  {count > 0 && <div style={{fontSize:'10px',fontWeight:700,color:'#CC2200'}}>{count} recipients</div>}
                </div>
              )
            })}
          </div>

          {/* Custom contact search */}
          {selectedGroups.includes('custom') && (
            <Card style={{marginBottom:'14px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,marginBottom:'9px'}}>Select Individual Contacts</div>
              <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder="Search contacts..."
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none',boxSizing:'border-box',marginBottom:'10px'}}/>
              <div style={{maxHeight:'200px',overflowY:'auto'}}>
                {allContacts.filter(c=>c.email&&(contactSearch===''||(c.first_name+' '+c.last_name).toLowerCase().includes(contactSearch.toLowerCase()))).slice(0,30).map(c=>{
                  const sel2 = customContacts.some(x=>x.id===c.id)
                  return (
                    <div key={c.id} onClick={()=>setCustomContacts(prev=>sel2?prev.filter(x=>x.id!==c.id):[...prev,c])}
                      style={{display:'flex',alignItems:'center',gap:'9px',padding:'8px 6px',borderRadius:'7px',cursor:'pointer',background:sel2?'rgba(204,34,0,.06)':'transparent'}}>
                      <div style={{width:18,height:18,borderRadius:'4px',border:'2px solid '+(sel2?'#CC2200':'var(--border)'),background:sel2?'#CC2200':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',color:'#fff',flexShrink:0}}>{sel2&&'✓'}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'12px',fontWeight:600}}>{c.first_name} {c.last_name||''}</div>
                        <div style={{fontSize:'10px',color:'var(--muted)'}}>{c.email}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{marginTop:'8px',fontSize:'11px',color:'var(--muted)'}}>{customContacts.length} selected</div>
            </Card>
          )}

          {/* Summary */}
          {selectedGroups.length > 0 && (
            <div style={{background:'rgba(22,163,74,.08)',border:'1px solid rgba(22,163,74,.25)',borderRadius:'10px',padding:'12px 16px',marginBottom:'14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:'13px',fontWeight:700,color:'#16A34A'}}>
                ✅ {recipients.length} recipients selected with email addresses
              </div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{selectedGroups.map(g=>RECIPIENT_GROUPS.find(x=>x.id===g)?.label||g).join(' + ')}</div>
            </div>
          )}

          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <Btn onClick={()=>setStep(2)} disabled={selectedGroups.length===0||recipients.length===0}>
              Choose Template →
            </Btn>
          </div>
        </div>
      )}

      {/* ── STEP 2: TEMPLATE ── */}
      {step===2 && (
        <div>
          <div style={{fontSize:'16px',fontWeight:800,marginBottom:'5px'}}>Choose a template</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'16px'}}>Start from a pre-built template or create your own from scratch</div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'12px'}}>
            {TEMPLATES.map(t => (
              <div key={t.id} onClick={()=>selectTemplate(t)}
                style={{background:'var(--panel)',border:'2px solid var(--border)',borderRadius:'14px',overflow:'hidden',cursor:'pointer',transition:'all .15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.transform='translateY(-2px)'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='none'}}>
                {/* Mini preview */}
                <div style={{background:'linear-gradient(135deg,#1B2B4B,#0F1A2E)',height:70,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px'}}>
                  {t.icon}
                </div>
                <div style={{padding:'12px'}}>
                  <div style={{fontSize:'13px',fontWeight:800,marginBottom:'3px'}}>{t.name}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)',marginBottom:'8px'}}>{t.blocks.length} blocks · {t.blocks.map(b=>b.type).join(', ')}</div>
                  <Btn size="xs" style={{width:'100%'}}>Use This Template</Btn>
                </div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',justifyContent:'space-between',marginTop:'16px'}}>
            <Btn variant="ghost" onClick={()=>setStep(1)}>← Back</Btn>
          </div>
        </div>
      )}

      {/* ── STEP 3: COMPOSE ── */}
      {step===3 && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 420px',gap:'14px'}}>
          {/* Editor */}
          <div>
            <div style={{fontSize:'16px',fontWeight:800,marginBottom:'14px'}}>Compose your email</div>

            {/* Subject */}
            <div style={{marginBottom:'14px'}}>
              <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Subject Line</label>
              <input value={subject} onChange={e=>setSubject(e.target.value)}
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'14px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',padding:'11px 13px',outline:'none',boxSizing:'border-box'}}
                onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}
                placeholder="Subject line..."/>
            </div>

            {/* Blocks editor */}
            {blocks.map((block, i) => (
              <BlockEditor key={i} block={block} index={i}
                onChange={newBlock => setBlocks(prev => prev.map((b,j)=>j===i?newBlock:b))}
                onDelete={() => setBlocks(prev => prev.filter((_,j)=>j!==i))}
                onMoveUp={() => { if(i===0)return; const b=[...blocks]; [b[i-1],b[i]]=[b[i],b[i-1]]; setBlocks(b) }}
                onMoveDown={() => { if(i===blocks.length-1)return; const b=[...blocks]; [b[i],b[i+1]]=[b[i+1],b[i]]; setBlocks(b) }}
              />
            ))}

            {/* Add block */}
            <div style={{marginTop:'12px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Add Block</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {[['text','📝 Text'],['header','🎯 Header'],['cta','🔘 Button'],['listing_card','🏠 Listing Card'],['stats','📊 Stats'],['event','📅 Event'],['divider','─ Divider'],['image','🖼 Image']].map(([type,label])=>(
                  <button key={type} onClick={()=>setBlocks(prev=>[...prev,defaultBlock(type)])}
                    style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'11px',fontWeight:600,padding:'7px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',transition:'all .12s'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.background='rgba(204,34,0,.05)'}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--dim)'}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{display:'flex',gap:'8px',justifyContent:'space-between',marginTop:'20px'}}>
              <Btn variant="ghost" onClick={()=>setStep(2)}>← Back</Btn>
              <div style={{display:'flex',gap:'8px'}}>
                <Btn variant="ghost" onClick={()=>setStep(4)}>Preview →</Btn>
                <Btn onClick={()=>setStep(4)}>Preview & Send →</Btn>
              </div>
            </div>
          </div>

          {/* Live preview panel */}
          <div style={{position:'sticky',top:0,height:'calc(100vh - 140px)',overflowY:'auto'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px',display:'flex',justifyContent:'space-between'}}>
              <span>Live Preview</span>
              <span style={{color:'var(--muted)',fontWeight:400,fontSize:'10px'}}>{recipients.length} recipients</span>
            </div>
            <div style={{background:'#F1F5F9',borderRadius:'12px',overflow:'hidden',border:'1px solid var(--border)'}}>
              <div style={{background:'#E2E8F0',padding:'8px 12px',fontSize:'10px',color:'var(--muted)',fontFamily:'monospace'}}>
                To: {recipients.slice(0,2).map(r=>r.email).join(', ')}{recipients.length>2?` +${recipients.length-2} more`:''}
              </div>
              <div style={{background:'#E2E8F0',padding:'4px 12px',fontSize:'10px',color:'var(--muted)',fontFamily:'monospace',borderTop:'1px solid #CBD5E1'}}>
                Subject: {subject||'(no subject)'}
              </div>
              <iframe srcDoc={previewHtml} style={{width:'100%',height:'500px',border:'none',display:'block'}} title="Email Preview"/>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: PREVIEW + SEND ── */}
      {step===4 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
            <div>
              <div style={{fontSize:'16px',fontWeight:800,marginBottom:'3px'}}>Ready to send?</div>
              <div style={{fontSize:'12px',color:'var(--muted)'}}>Review everything before sending to {recipients.length} recipients</div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <Btn variant="ghost" onClick={()=>setStep(3)}>← Edit</Btn>
              <Btn onClick={sendCampaign} disabled={sending} style={{minWidth:'160px'}}>
                {sending ? `Sending… (${recipients.length})` : `📤 Send to ${recipients.length} Recipients`}
              </Btn>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
            {[
              ['Recipients', recipients.length, '#CC2200'],
              ['Blocks', blocks.length, '#0EA5E9'],
              ['Groups', selectedGroups.length, '#16A34A'],
            ].map(([k,v,c])=>(
              <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px',textAlign:'center'}}>
                <div style={{fontSize:'28px',fontWeight:900,color:c,marginBottom:'3px'}}>{v}</div>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>{k}</div>
              </div>
            ))}
          </div>

          {/* Recipient list preview */}
          <Card style={{marginBottom:'14px'}}>
            <CardHeader>Recipients ({recipients.length})</CardHeader>
            <div style={{maxHeight:'200px',overflowY:'auto'}}>
              {recipients.slice(0,20).map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'9px 16px',borderBottom:'1px solid var(--border)',fontSize:'12px'}}>
                  <span style={{fontWeight:600}}>{r.name}</span>
                  <span style={{color:'var(--muted)'}}>{r.email}</span>
                </div>
              ))}
              {recipients.length>20&&<div style={{padding:'10px 16px',color:'var(--muted)',fontSize:'11px',textAlign:'center'}}>...and {recipients.length-20} more</div>}
            </div>
          </Card>

          {/* Full email preview */}
          <Card>
            <CardHeader>
              Email Preview
              <span style={{fontSize:'11px',fontWeight:400,color:'var(--muted)'}}>Subject: {subject}</span>
            </CardHeader>
            <iframe srcDoc={previewHtml} style={{width:'100%',height:'600px',border:'none',display:'block'}} title="Final Preview"/>
          </Card>
        </div>
      )}

      {/* ── STEP 5: SENT ── */}
      {step===5 && sentResult && (
        <div style={{textAlign:'center',padding:'40px 20px'}}>
          <div style={{fontSize:'56px',marginBottom:'16px'}}>🎉</div>
          <div style={{fontSize:'24px',fontWeight:900,marginBottom:'8px'}}>Campaign Sent!</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',maxWidth:'400px',margin:'20px auto 24px'}}>
            {[['Delivered',sentResult.sent,'#16A34A'],['Failed',sentResult.failed,'#DC2626'],['Total',sentResult.total,'#CC2200']].map(([k,v,c])=>(
              <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px'}}>
                <div style={{fontSize:'28px',fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginTop:'2px'}}>{k}</div>
              </div>
            ))}
          </div>
          <Btn onClick={()=>{setStep(1);setSelectedGroups([]);setTemplate(null);setBlocks([]);setSubject('');setSentResult(null)}}>
            📧 Send Another Campaign
          </Btn>
        </div>
      )}
    </div>
  )
}

// ── BLOCK EDITOR ──────────────────────────────────────────────
function BlockEditor({ block, index, onChange, onDelete, onMoveUp, onMoveDown }) {
  const [open, setOpen] = useState(true)
  const set = (k,v) => onChange({...block,[k]:v})

  const BLOCK_LABELS = { text:'📝 Text', header:'🎯 Header', cta:'🔘 Button', listing_card:'🏠 Listing Card', stats:'📊 Stats', event:'📅 Event', divider:'─ Divider', image:'🖼 Image', footer:'📄 Footer' }

  return (
    <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',marginBottom:'8px',overflow:'hidden'}}>
      {/* Block header */}
      <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 12px',borderBottom:open?'1px solid var(--border)':'none',background:'var(--dim)',cursor:'pointer'}} onClick={()=>setOpen(o=>!o)}>
        <span style={{fontSize:'12px',color:'var(--muted)'}}>{open?'▾':'▸'}</span>
        <span style={{fontSize:'12px',fontWeight:700,flex:1}}>{BLOCK_LABELS[block.type]||block.type}</span>
        <div style={{display:'flex',gap:'4px'}} onClick={e=>e.stopPropagation()}>
          <BtnTiny onClick={onMoveUp}>↑</BtnTiny>
          <BtnTiny onClick={onMoveDown}>↓</BtnTiny>
          <BtnTiny onClick={onDelete} danger>✕</BtnTiny>
        </div>
      </div>

      {/* Block fields */}
      {open && (
        <div style={{padding:'12px'}}>
          {block.type==='text' && (
            <textarea value={block.content||''} onChange={e=>set('content',e.target.value)} rows={4} placeholder="Email body text... Use {first_name} for personalization"
              style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.7}}/>
          )}
          {block.type==='header' && (
            <>
              <EF label="Heading Text" value={block.content||''} onChange={v=>set('content',v)} ph="Your headline here"/>
              <div style={{marginTop:'8px'}}>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Style</label>
                <div style={{display:'flex',gap:'5px'}}>
                  {['red','navy','gold','teal','green'].map(s=>(
                    <div key={s} onClick={()=>set('style',s)} style={{width:28,height:28,borderRadius:'6px',background:STYLE_COLORS[s],cursor:'pointer',border:block.style===s?'3px solid var(--text)':'3px solid transparent'}}/>
                  ))}
                </div>
              </div>
            </>
          )}
          {block.type==='cta' && (
            <>
              <EF label="Button Label" value={block.label||''} onChange={v=>set('label',v)} ph="Click Here"/>
              <EF label="URL" value={block.url||''} onChange={v=>set('url',v)} ph="https://..."/>
              <div style={{marginTop:'8px'}}>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Color</label>
                <div style={{display:'flex',gap:'5px'}}>
                  {['red','navy','gold','teal','green'].map(s=>(
                    <div key={s} onClick={()=>set('color',s)} style={{width:28,height:28,borderRadius:'6px',background:STYLE_COLORS[s],cursor:'pointer',border:block.color===s?'3px solid var(--text)':'3px solid transparent'}}/>
                  ))}
                </div>
              </div>
            </>
          )}
          {block.type==='listing_card' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
              {[['address','Address','47 Prairie Ave, Suffern NY'],['price','Price','$599,000'],['beds','Beds','4'],['baths','Baths','2'],['type','Type','Single Family'],['mls_link','MLS Link','https://...']].map(([k,l,p])=>(
                <EF key={k} label={l} value={block[k]||''} onChange={v=>set(k,v)} ph={p}/>
              ))}
            </div>
          )}
          {block.type==='stats' && (
            <div>
              {(block.items||[{label:'',value:''},{label:'',value:''}]).map((item,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 24px',gap:'6px',marginBottom:'6px',alignItems:'center'}}>
                  <input value={item.label} onChange={e=>set('items',(block.items||[]).map((x,j)=>j===i?{...x,label:e.target.value}:x))} placeholder="Label" style={inpStyle}/>
                  <input value={item.value} onChange={e=>set('items',(block.items||[]).map((x,j)=>j===i?{...x,value:e.target.value}:x))} placeholder="Value" style={inpStyle}/>
                  <button onClick={()=>set('items',(block.items||[]).filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'14px'}}>✕</button>
                </div>
              ))}
              <button onClick={()=>set('items',[...(block.items||[]),{label:'',value:''}])} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'7px',color:'var(--text)',fontSize:'11px',padding:'5px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>+ Add Stat</button>
            </div>
          )}
          {block.type==='event' && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
              <EF label="Address" value={block.address||''} onChange={v=>set('address',v)} ph="47 Prairie Ave"/>
              <EF label="Date" value={block.date||''} onChange={v=>set('date',v)} ph="Sunday, June 22"/>
              <EF label="Time" value={block.time||''} onChange={v=>set('time',v)} ph="1:00 PM – 3:00 PM"/>
            </div>
          )}
          {block.type==='image' && (
            <EF label="Image URL" value={block.url||''} onChange={v=>set('url',v)} ph="https://...image.jpg"/>
          )}
          {(block.type==='divider'||block.type==='footer') && (
            <div style={{fontSize:'12px',color:'var(--muted)'}}>No configuration needed</div>
          )}
        </div>
      )}
    </div>
  )
}

const inpStyle = {background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'7px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 9px',outline:'none',width:'100%',boxSizing:'border-box'}

function EF({ label, value, onChange, ph, type='text' }) {
  return (
    <div style={{marginBottom:'8px'}}>
      <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inpStyle}/>
    </div>
  )
}

function BtnTiny({ onClick, danger, children }) {
  return (
    <button onClick={onClick} style={{background:danger?'rgba(220,38,38,.08)':'var(--dim)',border:'1px solid '+(danger?'rgba(220,38,38,.2)':'var(--border)'),borderRadius:'5px',color:danger?'#DC2626':'var(--muted)',fontSize:'11px',width:24,height:24,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
      {children}
    </button>
  )
}

function defaultBlock(type) {
  const defaults = {
    text:         { type:'text', content:'' },
    header:       { type:'header', content:'', style:'red' },
    cta:          { type:'cta', label:'Learn More', url:'https://app.targetreteam.com', color:'red' },
    listing_card: { type:'listing_card', address:'', price:'', beds:'', baths:'', type:'', mls_link:'' },
    stats:        { type:'stats', items:[{label:'',value:''},{label:'',value:''}] },
    event:        { type:'event', address:'', date:'', time:'' },
    divider:      { type:'divider' },
    image:        { type:'image', url:'' },
    footer:       { type:'footer' },
  }
  return defaults[type] || { type, content:'' }
}

// ── EMAIL HTML BUILDER ────────────────────────────────────────
function buildEmailHtml(blocks, subject='', vars={}) {
  function sub(str) {
    return (str||'').replace(/{first_name}/g, vars.first_name||'there').replace(/{name}/g, vars.name||'there')
  }

  const body = blocks.map(block => {
    if(block.type==='header') {
      const c = STYLE_COLORS[block.style]||'#CC2200'
      return `<div style="background:linear-gradient(135deg,${c},${c}CC);padding:28px 24px;text-align:center;border-radius:${blocks.indexOf(block)===0?'12px 12px':'0 0'} 0 0;"><div style="color:#fff;font-size:22px;font-weight:900;line-height:1.3;">${sub(block.content)}</div></div>`
    }
    if(block.type==='text') {
      return `<div style="padding:20px 24px;"><p style="font-size:14px;color:#334155;line-height:1.8;margin:0;">${sub(block.content).replace(/\n/g,'<br/>')}</p></div>`
    }
    if(block.type==='cta') {
      const c = STYLE_COLORS[block.color]||'#CC2200'
      return `<div style="padding:16px 24px;text-align:center;"><a href="${block.url}" style="display:inline-block;background:${c};color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 32px;border-radius:10px;font-family:Inter,sans-serif;">${block.label}</a></div>`
    }
    if(block.type==='listing_card') {
      return `<div style="margin:16px 24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
        <div style="background:#1B2B4B;padding:14px 18px;"><div style="color:#fff;font-size:16px;font-weight:800;">${block.address||'Property Address'}</div><div style="color:rgba(255,255,255,.5);font-size:12px;margin-top:2px;">${block.type||'Property'}</div></div>
        <div style="padding:14px 18px;"><div style="font-size:24px;font-weight:900;color:#CC2200;margin-bottom:10px;">${block.price||'Price TBD'}</div>
        <div style="display:flex;gap:16px;"><span style="font-size:12px;color:#64748B;">🛏 ${block.beds||'—'} Bed</span><span style="font-size:12px;color:#64748B;">🚿 ${block.baths||'—'} Bath</span></div></div>
        ${block.mls_link&&block.mls_link.startsWith('http')?`<div style="padding:10px 18px;border-top:1px solid #E2E8F0;"><a href="${block.mls_link}" style="color:#CC2200;font-size:12px;font-weight:700;text-decoration:none;">View Full Listing →</a></div>`:''}
      </div>`
    }
    if(block.type==='stats') {
      const items = (block.items||[]).filter(x=>x.label)
      return `<div style="padding:16px 24px;"><div style="display:grid;grid-template-columns:repeat(${Math.min(items.length,4)},1fr);gap:12px;">${items.map(item=>`<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px;text-align:center;"><div style="font-size:20px;font-weight:900;color:#CC2200;">${item.value}</div><div style="font-size:11px;color:#94A3B8;font-weight:600;margin-top:3px;">${item.label}</div></div>`).join('')}</div></div>`
    }
    if(block.type==='event') {
      return `<div style="margin:16px 24px;background:#EFF6FF;border:2px solid #BFDBFE;border-radius:12px;padding:18px;text-align:center;"><div style="font-size:28px;margin-bottom:10px;">📅</div><div style="font-size:16px;font-weight:800;color:#1E40AF;margin-bottom:6px;">${block.address}</div><div style="font-size:14px;color:#3B82F6;font-weight:600;">${block.date}</div><div style="font-size:13px;color:#60A5FA;margin-top:3px;">${block.time}</div></div>`
    }
    if(block.type==='image' && block.url) {
      return `<div style="padding:16px 24px;text-align:center;"><img src="${block.url}" style="max-width:100%;border-radius:10px;" alt=""/></div>`
    }
    if(block.type==='divider') {
      return `<div style="padding:0 24px;"><hr style="border:none;border-top:1px solid #E2E8F0;"/></div>`
    }
    if(block.type==='footer') {
      return `<div style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:18px 24px;text-align:center;border-radius:0 0 12px 12px;"><div style="font-size:12px;color:#94A3B8;line-height:1.8;">Target Team · Keller Williams Valley Realty<br/>845.424.1014 · <a href="https://targetreteam.com" style="color:#CC2200;">targetreteam.com</a><br/><a href="https://app.targetreteam.com" style="color:#94A3B8;font-size:11px;">Unsubscribe</a></div></div>`
    }
    return ''
  }).join('\n')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${subject}</title></head>
<body style="margin:0;padding:16px;background:#F1F5F9;font-family:Inter,-apple-system,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
${body}
</div></body></html>`
}
