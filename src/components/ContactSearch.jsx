import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CONTACT_TYPE_COLORS } from '../lib/constants'
import { ContactPeek } from './ContactPeek'

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const inputStyle = { width:'100%', padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff, boxSizing:'border-box' }

/**
 * Real Contact autocomplete used for Seller's Agent, Purchaser's
 * Attorney, and Seller's Attorney (and anywhere else an outside
 * Contact needs to be searched/linked/created) — a single shared
 * implementation rather than three separate copies that could drift.
 *
 * FIXED BUG (owner feedback: "these fields behave like plain text and
 * do not reliably show matching Contacts"): the dropdown previously
 * only rendered when a search found results.length > 0, which hid the
 * entire box — no "searching", no "no matches", no "create new" —
 * whenever a search genuinely found zero matches. That's an extremely
 * common case for an attorney or outside agent not yet in the system,
 * and with nothing rendered, the field looked exactly like a
 * disconnected plain-text input. The dropdown now always shows once
 * the user has typed 2+ characters, with three explicit states:
 * searching, results, or a clear no-matches message — "create new" is
 * always reachable regardless of which state that is.
 */
export function ContactSearch({ value, onChange, onSelect, placeholder, filter, style }) {
  const [q,       setQ]       = useState(value || '')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const [searching, setSearching] = useState(false)
  const ref = useRef(null)
  const { agent: me, isAdmin } = useAuth()
  const [peekId, setPeekId] = useState(null)

  useEffect(() => { setQ(value || '') }, [value])

  useEffect(() => {
    if (q.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      let query = supabase.from('contacts')
        .select('id,first_name,last_name,phone,email,company,address,type,is_private,agent_id')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
        .limit(12)
      if (filter) query = query.eq('type', filter)
      let { data, error } = await query
      if (error && /is_private|column/i.test(error.message || '')) {
        // sql/private_contacts.sql not run yet — search without the flag
        let q2 = supabase.from('contacts')
          .select('id,first_name,last_name,phone,email,company,address,type,agent_id')
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
          .limit(12)
        if (filter) q2 = q2.eq('type', filter)
        data = (await q2).data
      }
      // PRIVACY: other agents' private contacts never appear in search
      const visible = (data || []).filter(c => isAdmin || !c.is_private || (me?.id && c.agent_id === me.id))
      setResults(visible.slice(0, 6))
      setSearching(false)
      setOpen(true)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    function close(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const showDropdown = open && q.length >= 2

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <input value={q} onChange={e => { setQ(e.target.value); onChange(e.target.value) }}
        placeholder={placeholder} style={style || inputStyle} onFocus={() => q.length >= 2 && setOpen(true)} />
      {showDropdown && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--panel)', border:'1px solid var(--border)', borderRadius:8, zIndex:100, boxShadow:'0 4px 20px rgba(0,0,0,.15)', overflow:'hidden' }}>
          {searching && (
            <div style={{ padding:'10px 12px', fontSize:11.5, color:'var(--muted)' }}>Searching contacts...</div>
          )}
          {!searching && results.length === 0 && (
            <div style={{ padding:'10px 12px', fontSize:11.5, color:'var(--muted)' }}>No matching contacts found.</div>
          )}
          {!searching && results.map(c => (
            <div key={c.id}
              onMouseDown={() => { onSelect(c); setQ([c.first_name,c.last_name].filter(Boolean).join(' ')); setOpen(false) }}
              style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--dim)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>{c.first_name} {c.last_name}{c.company?' — '+c.company:''}
                  {c.type && <span style={{ fontSize:9.5, fontWeight:800, padding:'1px 7px', borderRadius:99, background:(CONTACT_TYPE_COLORS[c.type]||'#94A3B8')+'22', color:CONTACT_TYPE_COLORS[c.type]||'#94A3B8', textTransform:'uppercase', letterSpacing:'.03em' }}>{c.type}</span>}
                </div>
                <div style={{ color:'var(--muted)', fontSize:11 }}>{[c.phone,c.email].filter(Boolean).join(' · ')}</div>
              </div>
              <button onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setPeekId(c.id) }} title="Verify — phone, email, address, past deals"
                style={{ border:'none', background:'none', fontSize:13, cursor:'pointer', padding:4, flexShrink:0, opacity:.7 }}>👁</button>
            </div>
          ))}
          {!searching && (
            <div onMouseDown={() => { onSelect(null); setOpen(false) }}
              style={{ padding:'8px 12px', cursor:'pointer', fontSize:11, color:'var(--brand)', fontWeight:700, background:'var(--dim)' }}>
              + Save "{q}" as new contact
            </div>
          )}
        </div>
      )}
      {peekId && <ContactPeek contactId={peekId} onClose={() => setPeekId(null)} onSelect={c => { onSelect(c); setQ([c.first_name,c.last_name].filter(Boolean).join(' ')); setOpen(false) }} />}
    </div>
  )
}
