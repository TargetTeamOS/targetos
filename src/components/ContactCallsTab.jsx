import React, { useState, useEffect } from 'react'
// TargetOS V2 — ContactCallsTab
// Shows all calls for a contact + allows logging manual call notes

import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { ClickToCall } from './ClickToCall'
import { Btn } from './UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const OUTCOMES = ['Answered', 'Voicemail', 'No Answer', 'Busy', 'Left Message', 'Callback Requested']

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  if (diff < 60000)   return 'just now'
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago'
  if (diff < 86400000)return Math.floor(diff/3600000) + 'h ago'
  const days = Math.floor(diff/86400000)
  if (days < 7)       return days + 'd ago'
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function fmtDuration(seconds) {
  if (!seconds || seconds < 1) return null
  if (seconds < 60) return seconds + 's'
  return Math.floor(seconds/60) + 'm ' + (seconds%60) + 's'
}

const OUTCOME_COLOR = {
  'Answered':           '#10B981',
  'Left Message':       '#3B82F6',
  'Voicemail':          '#8B5CF6',
  'Callback Requested': '#F5A623',
  'No Answer':          '#94A3B8',
  'Busy':               '#DC2626',
}

export function ContactCallsTab({ contact }) {
  const { agent }  = useAuth()
  const { toast }  = useApp()
  const [calls,    setCalls]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showLog,  setShowLog]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form,     setForm]     = useState({
    outcome:   'Answered',
    duration:  '',
    notes:     '',
    called_at: new Date().toISOString().slice(0,16),
  })

  useEffect(() => { loadCalls() }, [contact.id])

  async function loadCalls() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('calls')
        .select('*, agents(id,name,color)')
        .eq('contact_id', contact.id)
        .order('called_at', { ascending: false })
      setCalls(data || [])
    } catch(e) {
      console.warn('loadCalls:', e.message)
    } finally {
      setLoading(false)
    }
  }

  async function logManualCall() {
    if (!form.notes.trim() && !form.outcome) { toast('Add a note or outcome', '#DC2626'); return }
    setSaving(true)
    try {
      const clean = (contact.phone || '').replace(/\D/g, '')
      const e164  = clean ? (clean.startsWith('1') ? '+'+clean : '+1'+clean) : null

      await supabase.from('calls').insert({
        contact_id:   contact.id,
        contact_name: (contact.first_name || '') + ' ' + (contact.last_name || ''),
        to_number:    e164,
        from_number:  '+18453271778',
        direction:    'Outbound',
        outcome:      form.outcome,
        duration:     form.duration ? parseInt(form.duration, 10) : null,
        notes:        form.notes.trim() || null,
        called_at:    form.called_at ? new Date(form.called_at).toISOString() : new Date().toISOString(),
        agent_id:     agent?.id,
        status:       'completed',
      })

      toast('Call logged')
      setShowLog(false)
      setForm({ outcome:'Answered', duration:'', notes:'', called_at: new Date().toISOString().slice(0,16) })
      loadCalls()
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    } finally {
      setSaving(false)
    }
  }

  const contactName = (contact.first_name || '') + ' ' + (contact.last_name || '')

  return (
    <div style={{ fontFamily:ff, padding:'4px 0' }}>

      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:12, color:'var(--muted)', fontWeight:600 }}>
          {calls.length} call{calls.length !== 1 ? 's' : ''} with {contact.first_name}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {contact.phone && (
            <ClickToCall
              phone={contact.phone}
              contactName={contactName}
              contactId={contact.id}
              size="sm"
            />
          )}
          <button onClick={() => setShowLog(s => !s)}
            style={{ padding:'5px 11px', borderRadius:7, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            + Log call
          </button>
        </div>
      </div>

      {/* Manual call log form */}
      {showLog && (
        <div style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:'14px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Log a call</div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase' }}>Outcome</div>
              <select value={form.outcome} onChange={e => setForm(f => ({...f, outcome:e.target.value}))}
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }}>
                {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase' }}>Duration (seconds)</div>
              <input type="number" value={form.duration} onChange={e => setForm(f => ({...f, duration:e.target.value}))}
                placeholder="e.g. 120"
                style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }}/>
            </div>
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase' }}>Date &amp; Time</div>
            <input type="datetime-local" value={form.called_at} onChange={e => setForm(f => ({...f, called_at:e.target.value}))}
              style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }}/>
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase' }}>Call Notes</div>
            <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))}
              placeholder="What did you discuss? Any follow-up needed?"
              rows={3}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }}/>
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => setShowLog(false)}
              style={{ padding:'6px 12px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              Cancel
            </button>
            <Btn onClick={logManualCall} loading={saving}>Save Call</Btn>
          </div>
        </div>
      )}

      {/* Calls list */}
      {loading && (
        <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:12 }}>Loading...</div>
      )}

      {!loading && calls.length === 0 && (
        <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)' }}>
          <div style={{ fontSize:28, marginBottom:6 }}>📞</div>
          <div style={{ fontSize:13, fontWeight:600 }}>No calls yet</div>
          <div style={{ fontSize:11, marginTop:3 }}>Call {contact.first_name} using the button above, or log a call manually.</div>
        </div>
      )}

      {!loading && calls.map(call => {
        const outColor = OUTCOME_COLOR[call.outcome] || '#94A3B8'
        const dur      = fmtDuration(call.duration)
        const agentName = call.agents?.name?.split(' ')[0] || 'Agent'
        return (
          <div key={call.id} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            {/* Icon */}
            <div style={{ width:32, height:32, borderRadius:'50%', background:outColor+'18', border:'1px solid '+outColor+'44', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:13 }}>
              {call.direction === 'Inbound' ? '↙' : '↗'}
            </div>
            {/* Body */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>
                  {call.direction || 'Outbound'} call
                </span>
                {call.outcome && (
                  <span style={{ fontSize:10, fontWeight:700, color:outColor, background:outColor+'18', padding:'1px 7px', borderRadius:10 }}>
                    {call.outcome}
                  </span>
                )}
                {dur && (
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{dur}</span>
                )}
              </div>
              {call.notes && (
                <div style={{ fontSize:11, color:'var(--text)', marginTop:3, lineHeight:1.5, background:'var(--dim)', padding:'5px 8px', borderRadius:6, marginTop:5 }}>
                  {call.notes}
                </div>
              )}
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                {agentName} · {fmtDate(call.called_at)}
                {call.to_number && <span style={{ marginLeft:5 }}> · {call.to_number}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
