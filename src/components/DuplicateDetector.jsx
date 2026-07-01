// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Duplicate Contact Detector
// Fuzzy-matches phone and email to find potential duplicates
// before saving a new contact. Shows a merge suggestion.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

export function DuplicateDetector({ phone, email, currentId = null, onMerge, onIgnore }) {
  const [dupes, setDupes] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const cleanPhone = (phone||'').replace(/\D/g,'').slice(-10)
    const cleanEmail = (email||'').trim().toLowerCase()
    if (!cleanPhone && !cleanEmail) { setDupes([]); return }

    const timer = setTimeout(async () => {
      try {
        const conditions = []
        if (cleanPhone.length >= 10) conditions.push('phone.ilike.%'+cleanPhone+'%')
        if (cleanEmail.includes('@'))  conditions.push('email.ilike.'+cleanEmail)
        if (!conditions.length) { setDupes([]); return }

        const { data } = await supabase.from('contacts')
          .select('id,first_name,last_name,phone,email,status,source')
          .or(conditions.join(','))
          .limit(5)

        const filtered = (data||[]).filter(c => c.id !== currentId)
        setDupes(filtered)
      } catch {}
    }, 600)
    return () => clearTimeout(timer)
  }, [phone, email, currentId])

  if (!dupes.length) return null

  return (
    <div style={{ padding:'10px 14px', background:'rgba(245,166,35,.08)', border:'1px solid rgba(245,166,35,.3)', borderRadius:10, marginBottom:12, fontFamily:ff }}>
      <div style={{ fontSize:12, fontWeight:800, color:'#D97706', marginBottom:8 }}>
        ⚠️ Possible duplicate{dupes.length>1?'s':''} found
      </div>
      {dupes.map(d => (
        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 10px', background:'var(--panel)', borderRadius:8, marginBottom:6, border:'1px solid var(--border)' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{[d.first_name,d.last_name].filter(Boolean).join(' ') || 'Unnamed'}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>{[d.phone,d.email].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={() => navigate('/contacts/'+d.id+'/detail')}
              style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:ff }}>
              View
            </button>
            {onMerge && (
              <button onClick={() => onMerge(d)}
                style={{ padding:'4px 10px', borderRadius:6, border:'none', background:'#F5A623', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
                Merge
              </button>
            )}
          </div>
        </div>
      ))}
      {onIgnore && (
        <button onClick={onIgnore} style={{ fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:ff, marginTop:4 }}>
          Ignore and create anyway →
        </button>
      )}
    </div>
  )
}
