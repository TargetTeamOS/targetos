import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useContacts } from '../lib/hooks'
import { useAgents } from '../lib/hooks'
import { sendEmail } from '../lib/email'
import { PageHeader, Btn, Field, Input, Textarea, Select, Empty, Loading, Avatar } from '../components/UI'
import { CONTACT_STATUSES } from '../lib/constants'

export function Email() {
  const { agent, isAdmin } = useAuth()
  const { toast }          = useApp()
  const { contacts }       = useContacts()
  const { agents }         = useAgents()

  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')
  const [filterSt,  setFilterSt]  = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState([])
  const [selected,  setSelected]  = useState([])
  const [tab,       setTab]       = useState('contacts') // contacts | agents | custom

  const [customEmail, setCustomEmail] = useState('')

  const filteredContacts = contacts.filter(c =>
    c.email && (!filterSt || c.status === filterSt)
  )

  function toggleContact(id) {
    setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])
  }

  function selectAll() {
    if (selected.length === filteredContacts.length) setSelected([])
    else setSelected(filteredContacts.map(c=>c.id))
  }

  async function sendBlast() {
    if (!subject.trim()) { toast('Subject required','#DC2626'); return }
    if (!body.trim())    { toast('Message required','#DC2626'); return }

    let recipients = []
    if (tab === 'contacts') {
      recipients = contacts.filter(c => selected.includes(c.id) && c.email)
        .map(c => ({ name: `${c.first_name} ${c.last_name||''}`.trim(), email: c.email }))
    } else if (tab === 'agents') {
      recipients = agents.filter(a => selected.includes(a.id) && a.email)
        .map(a => ({ name: a.name, email: a.email }))
    } else if (tab === 'custom' && customEmail) {
      recipients = [{ name: 'Recipient', email: customEmail }]
    }

    if (recipients.length === 0) { toast('No recipients selected','#DC2626'); return }

    setSending(true)
    let successCount = 0
    for (const r of recipients) {
      const html = `
        <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1B2B4B;padding:20px 24px;border-radius:12px 12px 0 0;">
            <div style="font-size:20px;font-weight:900;color:#fff;">Target<span style="color:#F5A623">OS</span></div>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
            <div style="font-size:13px;color:#0F172A;line-height:1.8;white-space:pre-wrap;">${body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;">
            <div style="font-size:11px;color:#94A3B8;">Sent via TargetOS · Target Team · KW Valley Realty</div>
          </div>
        </div>`
      const result = await sendEmail({ to: r.email, subject, html })
      if (result.success) { successCount++; setSent(s=>[...s, r.email]) }
    }
    toast(`✅ Sent to ${successCount} of ${recipients.length} recipients`)
    setSending(false)
  }

  return (
    <div>
      <PageHeader title="Email Blast" icon="✉️" subtitle="Send emails to contacts, agents, or custom recipients"
        actions={<Btn onClick={sendBlast} disabled={sending} icon="📤">{sending?'Sending...':'Send Email'}</Btn>}/>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>

        {/* Left — Compose */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', padding:'16px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, marginBottom:'12px' }}>📝 Compose</div>
          <Field label="Subject" required>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Email subject..."/>
          </Field>
          <Field label="Message" required>
            <textarea value={body} onChange={e=>setBody(e.target.value)} rows={10} placeholder="Write your message here...
You can use plain text — it will be formatted nicely in the email." style={{ width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'13px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 11px', outline:'none', boxSizing:'border-box', resize:'vertical', lineHeight:'1.6' }}/>
          </Field>
          {sent.length > 0 && (
            <div style={{ background:'rgba(22,163,74,.06)', border:'1px solid rgba(22,163,74,.2)', borderRadius:'9px', padding:'10px 12px', fontSize:'11px', color:'#16A34A' }}>
              ✅ Sent to: {sent.slice(0,5).join(', ')}{sent.length>5?` +${sent.length-5} more`:''}
            </div>
          )}
        </div>

        {/* Right — Recipients */}
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'13px', overflow:'hidden' }}>
          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--dim)' }}>
            {[['contacts','👥 Contacts'],['agents','🏢 Team'],['custom','✏️ Custom']].map(([k,l])=>(
              <button key={k} onClick={()=>{setTab(k);setSelected([])}}
                style={{ padding:'9px 14px', border:'none', background:'transparent', cursor:'pointer', fontSize:'11px', fontWeight:700, fontFamily:'Inter,system-ui,sans-serif', color:tab===k?'#CC2200':'var(--muted)', borderBottom:`2px solid ${tab===k?'#CC2200':'transparent'}` }}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'contacts' && (
            <div>
              <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:'8px', alignItems:'center' }}>
                <select value={filterSt} onChange={e=>setFilterSt(e.target.value)} style={{ flex:1, fontSize:'12px', padding:'6px 8px', borderRadius:'7px', border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontFamily:'Inter,system-ui,sans-serif' }}>
                  <option value="">All statuses</option>
                  {CONTACT_STATUSES.map(s=><option key={s.id}>{s.id}</option>)}
                </select>
                <button onClick={selectAll} style={{ fontSize:'11px', fontWeight:600, color:'#CC2200', background:'none', border:'none', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', whiteSpace:'nowrap' }}>
                  {selected.length===filteredContacts.length?'None':'All'} ({filteredContacts.length})
                </button>
              </div>
              <div style={{ maxHeight:'380px', overflowY:'auto' }}>
                {filteredContacts.length === 0
                  ? <div style={{ padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>No contacts with email addresses</div>
                  : filteredContacts.map(c=>(
                    <div key={c.id} onClick={()=>toggleContact(c.id)}
                      style={{ padding:'8px 12px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', borderBottom:'1px solid var(--border)', background:selected.includes(c.id)?'rgba(204,34,0,.04)':'transparent' }}>
                      <input type="checkbox" checked={selected.includes(c.id)} onChange={()=>toggleContact(c.id)} onClick={e=>e.stopPropagation()}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.first_name} {c.last_name}</div>
                        <div style={{ fontSize:'10px', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.email}</div>
                      </div>
                    </div>
                  ))
                }
              </div>
              <div style={{ padding:'8px 12px', borderTop:'1px solid var(--border)', fontSize:'11px', color:'var(--muted)' }}>
                {selected.length} selected · {filteredContacts.filter(c=>c.email).length} with email
              </div>
            </div>
          )}

          {tab === 'agents' && (
            <div style={{ maxHeight:'440px', overflowY:'auto' }}>
              {agents.map(a=>(
                <div key={a.id} onClick={()=>toggleContact(a.id)}
                  style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:'9px', cursor:'pointer', borderBottom:'1px solid var(--border)', background:selected.includes(a.id)?'rgba(204,34,0,.04)':'transparent' }}>
                  <input type="checkbox" checked={selected.includes(a.id)} onChange={()=>toggleContact(a.id)} onClick={e=>e.stopPropagation()}/>
                  <Avatar name={a.name} color={a.color} size={28}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'12px', fontWeight:600 }}>{a.name}</div>
                    <div style={{ fontSize:'10px', color:'var(--muted)' }}>{a.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'custom' && (
            <div style={{ padding:'16px' }}>
              <Field label="Email Address" required>
                <input type="email" value={customEmail} onChange={e=>setCustomEmail(e.target.value)} placeholder="recipient@example.com"/>
              </Field>
              <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'8px' }}>Enter any email address to send directly to that person.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
