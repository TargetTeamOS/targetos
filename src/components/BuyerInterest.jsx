// TargetOS V2 — Buyer Interest & Showings
// Tracks which properties a buyer has seen, their feedback,
// and which properties they're interested in.
// Used in ContactDetail right panel.

import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { fmt$ } from '../lib/utils'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const FEEDBACK_OPTIONS = ['Loved it', 'Liked it', 'Neutral', 'Disliked it', 'Too small', 'Too expensive', 'Wrong location', 'Needs too much work']
const INTEREST_LEVELS  = [
  { value: 5, label: '🔥 Must have',    color: '#DC2626' },
  { value: 4, label: '❤️ Really like',  color: '#F97316' },
  { value: 3, label: '👍 Interested',   color: '#F5A623' },
  { value: 2, label: '🤔 Maybe',        color: '#94A3B8' },
  { value: 1, label: '👎 Not for me',   color: '#6B7280' },
]

export function BuyerInterest({ contactId, agentId }) {
  const { toast } = useApp()
  const [showings,   setShowings]   = useState([])
  const [saved,      setSaved]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [addingShow, setAddingShow] = useState(false)
  const [form,       setForm]       = useState({ address:'', price:'', mls_number:'', showing_date: new Date().toISOString().slice(0,10), showing_time:'', feedback:'', interest_level:3, notes:'' })
  const [saving,     setSaving]     = useState(false)

  useEffect(() => { if (contactId) load() }, [contactId])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('contact_showings')
        .select('*')
        .eq('contact_id', contactId)
        .order('showing_date', { ascending: false })
      setShowings(data || [])
    } catch(e) {
      // Table may not exist yet
      setShowings([])
    } finally { setLoading(false) }
  }

  async function addShowing() {
    if (!form.address.trim()) { toast('Address required', '#DC2626'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('contact_showings').insert({
        contact_id:     contactId,
        agent_id:       agentId,
        address:        form.address,
        price:          form.price ? parseFloat(form.price.replace(/[$,]/g,'')) : null,
        mls_number:     form.mls_number || null,
        showing_date:   form.showing_date,
        showing_time:   form.showing_time || null,
        feedback:       form.feedback || null,
        interest_level: form.interest_level,
        notes:          form.notes || null,
        created_at:     new Date().toISOString(),
      })
      if (error) throw error

      // Log to activity timeline
      await supabase.from('audit_log').insert({
        agent_id: agentId, table_name: 'contacts', record_id: contactId,
        action: 'showing', field_name: 'showing',
        new_value: form.address,
        metadata: {
          type: 'showing',
          description: 'Showing: ' + form.address + (form.feedback ? ' — ' + form.feedback : ''),
          interest_level: form.interest_level,
        },
        created_at: new Date().toISOString(),
      })

      toast('✅ Showing logged')
      setForm({ address:'', price:'', mls_number:'', showing_date: new Date().toISOString().slice(0,10), showing_time:'', feedback:'', interest_level:3, notes:'' })
      setAddingShow(false)
      load()
    } catch(e) {
      if (e.message?.includes('contact_showings')) {
        toast('Run SQL migration first — see below', '#F97316')
      } else {
        toast('Error: ' + e.message, '#DC2626')
      }
    } finally { setSaving(false) }
  }

  async function updateFeedback(id, field, value) {
    await supabase.from('contact_showings').update({ [field]: value }).eq('id', id)
    setShowings(p => p.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const inp = (value, onChange, placeholder, type='text') => (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ padding:'6px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, width:'100%', boxSizing:'border-box' }} />
  )

  const interestDef = (level) => INTEREST_LEVELS.find(i => i.value === level) || INTEREST_LEVELS[2]

  return (
    <div style={{ fontFamily:ff }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>
          🏡 Showings & Interest ({showings.length})
        </span>
        <button onClick={()=>setAddingShow(p=>!p)}
          style={{ fontSize:11, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', fontFamily:ff, fontWeight:700 }}>
          {addingShow ? 'Cancel' : '+ Log Showing'}
        </button>
      </div>

      {/* Add showing form */}
      {addingShow && (
        <div style={{ background:'var(--dim)', borderRadius:10, padding:12, marginBottom:12, border:'1px solid var(--border)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div style={{ gridColumn:'span 2' }}>{inp(form.address, v=>setForm(p=>({...p,address:v})), 'Property address *')}</div>
            {inp(form.price, v=>setForm(p=>({...p,price:v})), 'List price', 'text')}
            {inp(form.mls_number, v=>setForm(p=>({...p,mls_number:v})), 'MLS # (optional)')}
            {inp(form.showing_date, v=>setForm(p=>({...p,showing_date:v})), 'Showing date', 'date')}
            {inp(form.showing_time, v=>setForm(p=>({...p,showing_time:v})), 'Time (optional)', 'time')}
          </div>

          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:5 }}>Buyer Interest Level</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {INTEREST_LEVELS.map(il => (
                <button key={il.value} onClick={()=>setForm(p=>({...p,interest_level:il.value}))}
                  style={{ padding:'4px 8px', borderRadius:6, border:'1px solid '+(form.interest_level===il.value?il.color:'var(--border)'), background:form.interest_level===il.value?il.color+'18':'transparent', color:form.interest_level===il.value?il.color:'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
                  {il.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:5 }}>Buyer Feedback</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {FEEDBACK_OPTIONS.map(f => (
                <button key={f} onClick={()=>setForm(p=>({...p,feedback:f}))}
                  style={{ padding:'3px 8px', borderRadius:6, border:'1px solid '+(form.feedback===f?'var(--brand)':'var(--border)'), background:form.feedback===f?'rgba(204,34,0,.08)':'transparent', color:form.feedback===f?'var(--brand)':'var(--muted)', fontSize:11, cursor:'pointer', fontFamily:ff }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Additional notes..." rows={2}
            style={{ width:'100%', padding:'6px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, resize:'vertical', boxSizing:'border-box', marginBottom:8 }} />

          <button onClick={addShowing} disabled={saving}
            style={{ width:'100%', padding:'8px', borderRadius:8, border:'none', background:'var(--brand)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff, opacity:saving?.7:1 }}>
            {saving ? 'Saving...' : '✅ Log Showing'}
          </button>
        </div>
      )}

      {/* Showings list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'12px 0', color:'var(--muted)', fontSize:12 }}>Loading...</div>
      ) : showings.length === 0 ? (
        <div style={{ textAlign:'center', padding:'16px 0', color:'var(--muted)', fontSize:12 }}>
          <div style={{ fontSize:24, marginBottom:6 }}>🏡</div>
          No showings logged yet
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {showings.map(s => {
            const il = interestDef(s.interest_level)
            return (
              <div key={s.id} style={{ background:'var(--panel)', borderRadius:10, border:'1px solid var(--border)', padding:10 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:2 }}>{s.address}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      {s.showing_date}{s.showing_time?' · '+s.showing_time:''}{s.price?' · '+fmt$(s.price):''}
                      {s.mls_number?' · MLS#'+s.mls_number:''}
                    </div>
                  </div>
                  <div style={{ background:il.color+'18', color:il.color, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, flexShrink:0, whiteSpace:'nowrap' }}>
                    {il.label}
                  </div>
                </div>
                {s.feedback && (
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>
                    💬 {s.feedback}
                  </div>
                )}
                {s.notes && (
                  <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.4 }}>{s.notes}</div>
                )}
                {/* Quick update interest */}
                <div style={{ display:'flex', gap:3, marginTop:6, flexWrap:'wrap' }}>
                  {INTEREST_LEVELS.map(il2 => (
                    <button key={il2.value} onClick={()=>updateFeedback(s.id,'interest_level',il2.value)}
                      style={{ padding:'2px 6px', borderRadius:4, border:'1px solid '+(s.interest_level===il2.value?il2.color:'var(--border)'), background:s.interest_level===il2.value?il2.color+'18':'transparent', color:s.interest_level===il2.value?il2.color:'var(--muted)', fontSize:9, cursor:'pointer', fontFamily:ff }}>
                      {il2.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SQL migration note */}
      <div style={{ marginTop:12, padding:'8px 10px', background:'rgba(59,130,246,.06)', borderRadius:8, border:'1px solid rgba(59,130,246,.2)', fontSize:10, color:'var(--muted)' }}>
        <strong>SQL needed:</strong> Run in Supabase to enable showings:
        <code style={{ display:'block', marginTop:4, fontSize:9, background:'var(--dim)', padding:'4px 6px', borderRadius:4 }}>
          create table if not exists contact_showings (id uuid primary key default gen_random_uuid(), contact_id uuid references contacts(id), agent_id uuid references agents(id), address text not null, price numeric, mls_number text, showing_date date, showing_time text, interest_level int default 3, feedback text, notes text, created_at timestamptz default now());
        </code>
      </div>
    </div>
  )
}
