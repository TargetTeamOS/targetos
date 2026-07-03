// TargetOS V2 — Email Compose Component
// Used inline in ContactDetail center panel and standalone Email page.
// Features: subject, body, template selector, send + log to timeline.
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { sendContactEmail } from '../lib/emailService'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// Built-in draft templates for real estate
const BUILTIN_TEMPLATES = [
  {
    id: 'followup_check',
    label: '👋 Follow-up Check-in',
    subject: 'Checking in — how can I help?',
    body: `Hi {{first_name}},

I wanted to reach out and see how things are going with your home search. Have you had a chance to think more about what you're looking for?

I'm here to help every step of the way. Feel free to reach out anytime — I'm just a call or text away.

Looking forward to hearing from you!`,
  },
  {
    id: 'new_listing',
    label: '🏡 New Listing Found',
    subject: 'New listing that might interest you!',
    body: `Hi {{first_name}},

I came across a property that I think would be a great fit for you. Based on what you've told me about your needs, this one checks a lot of the boxes.

I'd love to schedule a showing at your convenience. Would you be available this week or weekend?

Let me know what works best for you!`,
  },
  {
    id: 'price_drop',
    label: '💰 Price Reduction Alert',
    subject: 'Price reduction on a property you might like',
    body: `Hi {{first_name}},

Great news! A property that fits your criteria just had a price reduction. This could be an excellent opportunity to get into your dream home at a better price point.

Would you like to schedule a showing before other buyers find out? Properties priced correctly move quickly!`,
  },
  {
    id: 'open_house',
    label: '🚪 Open House Invite',
    subject: "You're invited to our exclusive open house!",
    body: `Hi {{first_name}},

I'd like to personally invite you to an open house I'm hosting. This is a wonderful opportunity to see the property without any pressure.

Please let me know if you'll be attending so I can make sure to be there to welcome you personally.

Hope to see you there!`,
  },
  {
    id: 'market_update',
    label: '📊 Market Update',
    subject: 'Real Estate Market Update — {{month}} {{year}}',
    body: `Hi {{first_name}},

I wanted to share some recent market insights for our area that might be helpful as you continue your home search.

The market has been moving quickly, and staying informed gives you a competitive edge. If you have any questions or would like to discuss how these trends affect your search, I'm always available to chat.`,
  },
  {
    id: 'thank_you',
    label: '🙏 Thank You',
    subject: 'Thank you for working with me!',
    body: `Hi {{first_name}},

Thank you so much for trusting me with such an important decision. It has been a pleasure working with you throughout this process.

Please don't hesitate to reach out if you need anything at all — even after closing, I'm here for you. And if you know anyone looking to buy or sell, I'd truly appreciate the referral.

Wishing you all the best in your new home!`,
  },
  {
    id: 'contract_update',
    label: '📋 Contract Update',
    subject: 'Update on your transaction',
    body: `Hi {{first_name}},

I wanted to give you a quick update on where things stand with your transaction. Everything is progressing well and we're on track.

I'll keep you updated every step of the way. Please don't hesitate to reach out if you have any questions.`,
  },
]

function fillTemplate(text, contact) {
  if (!contact || !text) return text
  const month = new Date().toLocaleString('en-US', { month: 'long' })
  const year  = new Date().getFullYear()
  return text
    .replace(/\{\{first_name\}\}/g, contact.first_name || 'there')
    .replace(/\{\{last_name\}\}/g,  contact.last_name  || '')
    .replace(/\{\{full_name\}\}/g,  [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'there')
    .replace(/\{\{month\}\}/g,      month)
    .replace(/\{\{year\}\}/g,       year)
    .replace(/\{\{email\}\}/g,      contact.email || '')
    .replace(/\{\{phone\}\}/g,      contact.phone || '')
}

export function EmailCompose({ contact, contactId, onSent, onCancel }) {
  const { agent }  = useAuth()
  const { toast }  = useApp()
  const [subject,  setSubject]  = useState('')
  const [body,     setBody]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [templates,setTemplates]= useState(BUILTIN_TEMPLATES)
  const [showTpls, setShowTpls] = useState(false)
  const [dbTpls,   setDbTpls]   = useState([])

  useEffect(() => {
    // Load custom templates from DB
    supabase.from('email_templates').select('id,name,subject,body').order('created_at').then(r => {
      if (r.data?.length) {
        setDbTpls(r.data)
      }
    }).catch(() => {})
  }, [])

  function applyTemplate(tpl) {
    setSubject(fillTemplate(tpl.subject, contact))
    setBody(fillTemplate(tpl.body || tpl.content, contact))
    setShowTpls(false)
  }

  async function send() {
    if (!contact?.email) { toast('Contact has no email address', '#DC2626'); return }
    if (!subject.trim())  { toast('Subject is required', '#DC2626'); return }
    if (!body.trim())     { toast('Message body is required', '#DC2626'); return }
    setSending(true)
    try {
      // Send the email
      const result = await sendContactEmail({
        contactEmail: contact.email,
        contactName:  [contact.first_name, contact.last_name].filter(Boolean).join(' '),
        subject,
        body,
        agentName:  agent?.name || 'Target Team',
        agentEmail: agent?.email || 'office@targetreteam.com',
      })

      if (!result.success) throw new Error(result.error || 'Send failed')

      // Log to timeline
      await supabase.from('audit_log').insert({
        agent_id:   agent?.id,
        table_name: 'contacts',
        record_id:  contactId,
        action:     'note',
        field_name: 'email',
        new_value:  body.slice(0, 200),
        metadata: {
          type:    'email',
          description: 'Email sent: ' + subject,
          subject,
          body,
          to:      contact.email,
          sent_id: result.id,
        },
        created_at: new Date().toISOString(),
      })

      toast('✅ Email sent to ' + contact.email)
      setSubject('')
      setBody('')
      onSent?.()
    } catch(e) {
      toast('❌ Failed to send: ' + e.message, '#DC2626')
    } finally {
      setSending(false)
    }
  }

  const inp = { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }

  const allTemplates = [
    ...BUILTIN_TEMPLATES,
    ...dbTpls.map(t => ({ id:'db_'+t.id, label:'📄 '+t.name, subject:t.subject, body:t.body||t.content }))
  ]

  return (
    <div style={{ background:'var(--panel)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'10px 14px', background:'var(--dim)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14 }}>📧</span>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>
            To: {contact?.email ? <span style={{ color:'#3B82F6' }}>{contact.email}</span> : <span style={{ color:'#DC2626' }}>No email on file</span>}
          </span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => setShowTpls(p=>!p)}
            style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:showTpls?'var(--brand)':' transparent', color:showTpls?'#fff':'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            {showTpls ? 'Hide Templates' : '📋 Templates'}
          </button>
          {onCancel && (
            <button onClick={onCancel} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Templates dropdown */}
      {showTpls && (
        <div style={{ borderBottom:'1px solid var(--border)', padding:10, background:'var(--dim)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Choose a template</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
            {allTemplates.map(tpl => (
              <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)', background:'var(--panel)', color:'var(--text)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff, textAlign:'left' }}>
                {tpl.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compose area */}
      <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject..."
          style={inp}
        />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your message here, or choose a template above..."
          rows={8}
          style={{ ...inp, resize:'vertical', lineHeight:1.6 }}
        />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:10, color:'var(--muted)' }}>
            {body.length} chars · From: {agent?.email || 'office@targetreteam.com'}
          </span>
          <button
            onClick={send}
            disabled={sending || !contact?.email}
            style={{ padding:'8px 20px', borderRadius:8, border:'none', background:contact?.email?'var(--brand)':'var(--dim)', color:'#fff', fontSize:13, fontWeight:700, cursor:contact?.email?'pointer':'not-allowed', fontFamily:ff, opacity:sending?.7:1 }}>
            {sending ? '⏳ Sending...' : '📤 Send Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
