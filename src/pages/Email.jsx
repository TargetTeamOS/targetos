// TargetOS V2 — Email Page
// Full email system: compose, sent history, templates manager
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { sendContactEmail } from '../lib/emailService'
import { db } from '../lib/db'
import { fmtDateTime } from '../lib/utils'
import { PageHeader, Btn } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const S  = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }

const BUILTIN_TEMPLATES = [
  { id:'b1', name:'Follow-up Check-in',    subject:'Checking in — how can I help?',      body:'Hi {{first_name}},\n\nI wanted to check in and see how things are going with your home search.\n\nI\'m here to help every step of the way. Feel free to reach out anytime!\n\nBest,\n{{agent_name}}' },
  { id:'b2', name:'New Listing Alert',      subject:'New listing that might interest you!',body:'Hi {{first_name}},\n\nI came across a property that I think would be a great fit for you.\n\nWould you like to schedule a showing this week?\n\nBest,\n{{agent_name}}' },
  { id:'b3', name:'Price Reduction',        subject:'Price reduction on a property you liked',body:'Hi {{first_name}},\n\nGreat news! A property that fits your criteria just had a price reduction.\n\nThis is a great opportunity — properties move quickly when priced correctly!\n\nBest,\n{{agent_name}}' },
  { id:'b4', name:'Open House Invite',      subject:"You're invited to our open house!",  body:'Hi {{first_name}},\n\nI\'d like to personally invite you to an open house this weekend.\n\nWould love to see you there!\n\nBest,\n{{agent_name}}' },
  { id:'b5', name:'Market Update',          subject:'Market update for your area',         body:'Hi {{first_name}},\n\nI wanted to share some recent market insights that might be helpful as you continue your search.\n\nLet me know if you have any questions!\n\nBest,\n{{agent_name}}' },
  { id:'b6', name:'Thank You',              subject:'Thank you for working with me!',      body:'Hi {{first_name}},\n\nThank you so much for trusting me with such an important decision.\n\nIf you know anyone looking to buy or sell, I\'d appreciate the referral!\n\nBest,\n{{agent_name}}' },
  { id:'b7', name:'Contract Update',        subject:'Update on your transaction',          body:'Hi {{first_name}},\n\nI wanted to give you a quick update on your transaction. Everything is on track!\n\nI\'ll keep you updated every step of the way.\n\nBest,\n{{agent_name}}' },
  { id:'b8', name:'Anniversary Check-in',   subject:'Happy Home Anniversary! 🏡',         body:'Hi {{first_name}},\n\nI can\'t believe it\'s already been a year since you closed on your home! I hope you\'re settling in beautifully.\n\nIf you ever need anything or want to know what your home is worth today, don\'t hesitate to reach out!\n\nWarmly,\n{{agent_name}}' },
]

function fill(text, contact, agent) {
  if (!text) return ''
  return text
    .replace(/\{\{first_name\}\}/g, contact?.first_name || 'there')
    .replace(/\{\{last_name\}\}/g,  contact?.last_name  || '')
    .replace(/\{\{agent_name\}\}/g, agent?.name || 'Target Team')
}

export function Email() {
  const navigate   = useNavigate()
  const { agent, isAdmin } = useAuth()
  const { toast }  = useApp()

  const [tab,       setTab]       = useState('compose')  // compose | sent | templates
  const [contacts,  setContacts]  = useState([])
  const [selContact,setSelContact]= useState(null)
  const [contactQ,  setContactQ]  = useState('')
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')
  const [sending,   setSending]   = useState(false)
  const [sent,      setSent]      = useState([])
  const [loadingSent,setLoadingSent]=useState(false)
  const [templates, setTemplates] = useState([])
  const [loadingTpls,setLoadingTpls]=useState(false)
  const [editTpl,   setEditTpl]   = useState(null)
  const [tplForm,   setTplForm]   = useState({ name:'', subject:'', body:'' })
  const [savingTpl, setSavingTpl] = useState(false)
  const [showTplPicker, setShowTplPicker] = useState(false)

  useEffect(() => {
    if (tab === 'sent') loadSent()
    if (tab === 'templates') loadTemplates()
  }, [tab])

  useEffect(() => {
    // Search contacts as user types
    const t = setTimeout(() => {
      if (contactQ.length < 2) { setContacts([]); return }
      supabase.from('contacts')
        .select('id,first_name,last_name,email,phone')
        .or(`first_name.ilike.%${contactQ}%,last_name.ilike.%${contactQ}%,email.ilike.%${contactQ}%`)
        .limit(8)
        .then(r => setContacts(r.data || []))
    }, 300)
    return () => clearTimeout(t)
  }, [contactQ])

  async function loadSent() {
    setLoadingSent(true)
    try {
      const { data } = await supabase
        .from('audit_log')
        .select('*, agents(id,name)')
        .eq('field_name', 'email')
        .eq('action', 'note')
        .order('created_at', { ascending: false })
        .limit(50)
      setSent(data || [])
    } catch {} finally { setLoadingSent(false) }
  }

  async function loadTemplates() {
    setLoadingTpls(true)
    try {
      const { data } = await supabase.from('email_templates').select('*').order('created_at', { ascending: false })
      setTemplates(data || [])
    } catch {} finally { setLoadingTpls(false) }
  }

  function applyTemplate(tpl) {
    setSubject(fill(tpl.subject, selContact, agent))
    setBody(fill(tpl.body || tpl.content, selContact, agent))
    setShowTplPicker(false)
  }

  async function sendEmail() {
    if (!selContact?.email) { toast('Select a contact with an email address', '#DC2626'); return }
    if (!subject.trim())    { toast('Subject required', '#DC2626'); return }
    if (!body.trim())       { toast('Message required', '#DC2626'); return }
    setSending(true)
    try {
      const result = await sendContactEmail({
        contactEmail: selContact.email,
        contactName:  [selContact.first_name, selContact.last_name].filter(Boolean).join(' '),
        subject, body,
        agentName:  agent?.name  || 'Target Team',
        agentEmail: agent?.email || 'office@targetreteam.com',
      })
      if (!result.success) throw new Error(result.error || 'Send failed')

      // Log to audit_log so it appears in contact timeline
      await supabase.from('audit_log').insert({
        agent_id: agent?.id, table_name: 'contacts',
        record_id: selContact.id, action: 'note', field_name: 'email',
        new_value: body.slice(0, 200),
        metadata: { type:'email', description:'Email: '+subject, subject, body, to: selContact.email },
        created_at: new Date().toISOString(),
      })

      toast('✅ Email sent to ' + selContact.email)
      setSubject(''); setBody('')
    } catch(e) { toast('❌ ' + e.message, '#DC2626') }
    finally { setSending(false) }
  }

  async function saveTemplate() {
    if (!tplForm.name.trim() || !tplForm.subject.trim()) { toast('Name and subject required', '#DC2626'); return }
    setSavingTpl(true)
    try {
      if (editTpl?.id) {
        const { error } = await supabase.from('email_templates').update({ ...tplForm, updated_at: new Date().toISOString() }).eq('id', editTpl.id)
        if (error) throw error
        toast('✅ Template updated')
      } else {
        const { error } = await supabase.from('email_templates').insert({ ...tplForm, agent_id: agent?.id, created_at: new Date().toISOString() })
        if (error) throw error
        toast('✅ Template saved')
      }
      setEditTpl(null)
      setTplForm({ name:'', subject:'', body:'' })
      loadTemplates()
    } catch(e) { toast('❌ ' + e.message, '#DC2626') }
    finally { setSavingTpl(false) }
  }

  async function deleteTemplate(id) {
    if (!window.confirm('Delete this template?')) return
    await supabase.from('email_templates').delete().eq('id', id)
    loadTemplates()
    toast('Template deleted')
  }

  const TABS = ['compose','sent','templates']

  return (
    <div style={{ fontFamily:ff }}>
      <PageHeader
        title="Email"
        sub="Send emails to contacts, view sent history, manage templates"
      />

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {[{id:'compose',label:'✉️ Compose'},{id:'sent',label:'📤 Sent History'},{id:'templates',label:'📋 Templates'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:'8px 16px', borderRadius:'8px 8px 0 0', border:'1px solid var(--border)', borderBottom:tab===t.id?'1px solid var(--panel)':'1px solid var(--border)', background:tab===t.id?'var(--panel)':'transparent', color:tab===t.id?'var(--brand)':'var(--muted)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff, marginBottom:tab===t.id?-1:0 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── COMPOSE ── */}
      {tab === 'compose' && (
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, alignItems:'start' }}>
          {/* Contact selector */}
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Send To</div>
            <input value={contactQ} onChange={e=>{ setContactQ(e.target.value); if(!e.target.value) setSelContact(null) }}
              placeholder="Search contacts..."
              style={{ ...S, marginBottom:8 }} />
            {contacts.length > 0 && (
              <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                {contacts.map(c => (
                  <div key={c.id} onClick={()=>{ setSelContact(c); setContactQ([c.first_name,c.last_name].filter(Boolean).join(' ')); setContacts([]) }}
                    style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:12 }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ fontWeight:600, color:'var(--text)' }}>{c.first_name} {c.last_name}</div>
                    <div style={{ color:'var(--muted)', fontSize:11 }}>{c.email || '⚠️ No email'}</div>
                  </div>
                ))}
              </div>
            )}
            {selContact && (
              <div style={{ background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.25)', borderRadius:8, padding:'10px 12px', marginTop:8 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{selContact.first_name} {selContact.last_name}</div>
                <div style={{ fontSize:11, color: selContact.email?'#10B981':'#DC2626', marginTop:2 }}>{selContact.email || '⚠️ No email — cannot send'}</div>
              </div>
            )}

            {/* Template picker */}
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Quick Templates</div>
              {[...BUILTIN_TEMPLATES, ...templates].map(tpl => (
                <button key={tpl.id} onClick={()=>applyTemplate(tpl)}
                  style={{ display:'block', width:'100%', textAlign:'left', padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:11, cursor:'pointer', fontFamily:ff, marginBottom:4 }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  {tpl.name || tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Compose form */}
          <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16 }}>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject..." style={{ ...S, marginBottom:10, fontSize:15, fontWeight:600 }} />
            <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your message..." rows={16}
              style={{ ...S, resize:'vertical', lineHeight:1.7, marginBottom:12 }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{body.length} characters</span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{ setSubject(''); setBody('') }}
                  style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:13, cursor:'pointer', fontFamily:ff }}>
                  Clear
                </button>
                <button onClick={sendEmail} disabled={sending||!selContact?.email}
                  style={{ padding:'8px 24px', borderRadius:8, border:'none', background:selContact?.email?'var(--brand)':'var(--dim)', color:'#fff', fontSize:13, fontWeight:700, cursor:selContact?.email?'pointer':'not-allowed', fontFamily:ff, opacity:sending?.7:1 }}>
                  {sending ? '⏳ Sending...' : '📤 Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SENT HISTORY ── */}
      {tab === 'sent' && (
        <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
          {loadingSent ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>Loading...</div>
          ) : sent.length === 0 ? (
            <div style={{ padding:48, textAlign:'center', color:'var(--muted)', fontSize:13 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📤</div>No emails sent yet
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'2px solid var(--border)' }}>
                  {['To','Subject','Agent','Sent'].map(h=>(
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sent.map(row => (
                  <tr key={row.id} style={{ borderBottom:'1px solid var(--border)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'10px 14px', color:'var(--text)' }}>{row.metadata?.to || '—'}</td>
                    <td style={{ padding:'10px 14px', color:'var(--text)', fontWeight:600 }}>{row.metadata?.subject || row.new_value?.slice(0,50)}</td>
                    <td style={{ padding:'10px 14px', color:'var(--muted)' }}>{row.agents?.name || '—'}</td>
                    <td style={{ padding:'10px 14px', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TEMPLATES ── */}
      {tab === 'templates' && (
        <div>
          {/* Edit/Create form */}
          {(editTpl !== null) && (
            <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', padding:16, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--text)', marginBottom:12 }}>{editTpl?.id?'Edit':'New'} Template</div>
              <input value={tplForm.name} onChange={e=>setTplForm(p=>({...p,name:e.target.value}))} placeholder="Template name..." style={{ ...S, marginBottom:8 }} />
              <input value={tplForm.subject} onChange={e=>setTplForm(p=>({...p,subject:e.target.value}))} placeholder="Email subject... (use {{first_name}} for personalization)" style={{ ...S, marginBottom:8 }} />
              <textarea value={tplForm.body} onChange={e=>setTplForm(p=>({...p,body:e.target.value}))} placeholder="Email body... (use {{first_name}}, {{agent_name}} etc.)" rows={8}
                style={{ ...S, resize:'vertical', marginBottom:12 }} />
              <div style={{ background:'var(--dim)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'var(--muted)', marginBottom:12 }}>
                <strong>Variables:</strong> {'{{first_name}}'} {'{{last_name}}'} {'{{agent_name}}'} {'{{month}}'} {'{{year}}'}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{ setEditTpl(null); setTplForm({name:'',subject:'',body:''}) }}
                  style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:13, cursor:'pointer', fontFamily:ff }}>
                  Cancel
                </button>
                <button onClick={saveTemplate} disabled={savingTpl}
                  style={{ padding:'8px 20px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                  {savingTpl ? 'Saving...' : '✅ Save Template'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
              Built-in Templates ({BUILTIN_TEMPLATES.length}) + Your Templates ({templates.length})
            </div>
            <Btn onClick={()=>{ setEditTpl({}); setTplForm({name:'',subject:'',body:''}) }}>+ New Template</Btn>
          </div>

          {/* Built-in */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Built-in (read-only)</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
              {BUILTIN_TEMPLATES.map(tpl=>(
                <div key={tpl.id} style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', padding:'10px 14px' }}>
                  <div style={{ fontWeight:700, color:'var(--text)', fontSize:13, marginBottom:4 }}>{tpl.name || tpl.label}</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>{tpl.subject}</div>
                  <button onClick={()=>{ setTab('compose'); setTimeout(()=>applyTemplate(tpl),100) }}
                    style={{ fontSize:11, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontFamily:ff, fontWeight:700 }}>
                    Use this template →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Custom templates */}
          {templates.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Your Templates</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                {templates.map(tpl=>(
                  <div key={tpl.id} style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', padding:'10px 14px' }}>
                    <div style={{ fontWeight:700, color:'var(--text)', fontSize:13, marginBottom:4 }}>{tpl.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>{tpl.subject}</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={()=>{ setTab('compose'); setTimeout(()=>applyTemplate(tpl),100) }}
                        style={{ fontSize:11, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontFamily:ff, fontWeight:700 }}>
                        Use →
                      </button>
                      <button onClick={()=>{ setEditTpl(tpl); setTplForm({name:tpl.name,subject:tpl.subject,body:tpl.body||tpl.content}) }}
                        style={{ fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontFamily:ff }}>
                        Edit
                      </button>
                      <button onClick={()=>deleteTemplate(tpl.id)}
                        style={{ fontSize:11, color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontFamily:ff }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
