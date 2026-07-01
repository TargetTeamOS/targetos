// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Global Command Palette (Cmd+K)
// Searches all entities simultaneously: contacts, deals,
// listings, tasks, agents. Also handles quick actions and
// navigation shortcuts. Keyboard-first design.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ff  = 'Inter, system-ui, -apple-system, sans-serif'
const ICON = { contact:'👤', deal:'🏠', listing:'🏡', task:'✅', agent:'👔', action:'⚡' }

// Quick actions (always shown when no query)
const QUICK_ACTIONS = [
  { type:'action', label:'+ New Contact',       sub:'Add a contact',         shortcut:'C', path:'/contacts?new=1',    icon:'👤' },
  { type:'action', label:'+ New Deal',          sub:'Add a deal',            shortcut:'D', path:'/production?new=1',  icon:'🏠' },
  { type:'action', label:'+ New Task',          sub:'Add a task',            shortcut:'T', path:'/tasks?new=1',       icon:'✅' },
  { type:'action', label:'+ New Listing',       sub:'Add a listing',         shortcut:'L', path:'/listings?new=1',    icon:'🏡' },
  { type:'action', label:'Go to Dashboard',     sub:'',                      shortcut:'',  path:'/',                  icon:'📊' },
  { type:'action', label:'Go to Contacts',      sub:'',                      shortcut:'',  path:'/contacts',          icon:'👥' },
  { type:'action', label:'Go to Production',    sub:'',                      shortcut:'',  path:'/production',        icon:'📋' },
  { type:'action', label:'Go to Calendar',      sub:'',                      shortcut:'',  path:'/calendar',          icon:'📅' },
  { type:'action', label:'Go to Call Flow',     sub:'',                      shortcut:'',  path:'/calls',             icon:'📞' },
  { type:'action', label:'Go to Settings',      sub:'',                      shortcut:'',  path:'/settings',          icon:'⚙️' },
]

const RECENT_KEY = 'tos_cmd_recent'

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function pushRecent(item) {
  try {
    const list = getRecent().filter(r => r.id !== item.id).slice(0, 7)
    localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...list]))
  } catch {}
}

export function CommandPalette({ open, onClose }) {
  const { agent, isAdmin, canManage } = useAuth()
  const navigate = useNavigate()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [cursor,  setCursor]  = useState(0)
  const [recent,  setRecent]  = useState([])
  const inputRef  = useRef(null)
  const listRef   = useRef(null)
  const debounce  = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]); setCursor(0)
      setRecent(getRecent())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(query.trim()), 200)
    return () => clearTimeout(debounce.current)
  }, [query])

  async function search(q) {
    const like = '%' + q + '%'
    const agentFilter = (isAdmin || canManage) ? {} : { agent_id: agent?.id }

    try {
      const [contacts, deals, listings, tasks] = await Promise.all([
        supabase.from('contacts').select('id,first_name,last_name,phone,email,status,agent_id')
          .or('first_name.ilike.' + like + ',last_name.ilike.' + like + ',phone.ilike.' + like + ',email.ilike.' + like)
          .limit(5).then(r => (r.data||[]).map(c => ({
            type:'contact', id:'c_'+c.id, raw:c.id,
            label: [c.first_name,c.last_name].filter(Boolean).join(' ') || c.phone,
            sub: [c.phone,c.email,c.status].filter(Boolean).join(' · '),
            path: '/contacts/'+c.id+'/detail', icon:'👤',
          }))),
        supabase.from('deals').select('id,addr,stage,gci,agent_id,client_name')
          .ilike('addr', like).limit(5).then(r => (r.data||[]).map(d => ({
            type:'deal', id:'d_'+d.id, raw:d.id,
            label: d.addr || 'Deal',
            sub: [d.stage, d.client_name, d.gci ? ('$'+(Number(d.gci)/1000).toFixed(0)+'K GCI') : null].filter(Boolean).join(' · '),
            path: '/production', icon:'🏠',
          }))),
        supabase.from('listings').select('id,addr,city,status,list_price,agent_id')
          .or('addr.ilike.' + like + ',city.ilike.' + like)
          .limit(5).then(r => (r.data||[]).map(l => ({
            type:'listing', id:'l_'+l.id, raw:l.id,
            label: [l.addr, l.city].filter(Boolean).join(', '),
            sub: [l.status, l.list_price ? ('$'+Number(l.list_price).toLocaleString()) : null].filter(Boolean).join(' · '),
            path: '/listings/'+l.id, icon:'🏡',
          }))),
        supabase.from('tasks').select('id,title,status,priority,due_date')
          .ilike('title', like).limit(5).then(r => (r.data||[]).map(t => ({
            type:'task', id:'t_'+t.id, raw:t.id,
            label: t.title,
            sub: [t.status, t.priority, t.due_date].filter(Boolean).join(' · '),
            path: '/tasks/'+t.id, icon:'✅',
          }))),
      ])

      // Merge and rank — exact matches first
      const all = [...contacts, ...deals, ...listings, ...tasks]
      all.sort((a,b) => {
        const al = a.label.toLowerCase(), bl = b.label.toLowerCase(), ql = q.toLowerCase()
        const as = al.startsWith(ql) ? 0 : al.includes(ql) ? 1 : 2
        const bs = bl.startsWith(ql) ? 0 : bl.includes(ql) ? 1 : 2
        return as - bs
      })

      // Also match actions
      const matchedActions = QUICK_ACTIONS.filter(a => a.label.toLowerCase().includes(q.toLowerCase()))

      setResults([...all, ...matchedActions])
      setCursor(0)
    } catch(e) {
      console.warn('[CommandPalette]', e.message)
    } finally {
      setLoading(false)
    }
  }

  function go(item) {
    pushRecent(item)
    setRecent(getRecent())
    navigate(item.path)
    onClose()
  }

  useEffect(() => {
    function handleKey(e) {
      if (!open) return
      if (e.key === 'Escape') { onClose(); return }
      const items = displayItems
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c+1, items.length-1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c-1, 0)) }
      if (e.key === 'Enter')     { e.preventDefault(); if (items[cursor]) go(items[cursor]) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, cursor, results, query])

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.children[cursor]
    if (el) el.scrollIntoView({ block:'nearest' })
  }, [cursor])

  const displayItems = query.trim() ? results : (recent.length > 0 ? recent : QUICK_ACTIONS)
  const sectionLabel = query.trim()
    ? (loading ? 'Searching...' : results.length + ' result' + (results.length!==1?'s':''))
    : (recent.length > 0 ? 'Recent' : 'Quick Actions')

  // Group results by type when searching
  const grouped = useMemo(() => {
    if (!query.trim()) return null
    const groups = {}
    results.forEach(r => { if (!groups[r.type]) groups[r.type] = []; groups[r.type].push(r) })
    return groups
  }, [results, query])

  if (!open) return null

  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'15vh', fontFamily:ff }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:640, background:'var(--panel)', borderRadius:16, boxShadow:'0 24px 80px rgba(0,0,0,.4)', border:'1px solid var(--border)', overflow:'hidden' }}>

        {/* Search input */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize:18, color:'var(--muted)', flexShrink:0 }}>🔍</span>
          <input ref={inputRef}
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search contacts, deals, listings, tasks..."
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:16, color:'var(--text)', fontFamily:ff }}
          />
          {loading && <div style={{ width:16, height:16, border:'2px solid var(--border)', borderTop:'2px solid var(--brand)', borderRadius:'50%', animation:'spin .6s linear infinite', flexShrink:0 }} />}
          <kbd style={{ padding:'3px 8px', background:'var(--dim)', border:'1px solid var(--border)', borderRadius:5, fontSize:11, color:'var(--muted)', fontFamily:'monospace', flexShrink:0 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight:'60vh', overflowY:'auto' }}>
          {displayItems.length === 0 && !loading && query.trim() && (
            <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
              No results for "{query}"
            </div>
          )}

          {displayItems.length > 0 && (
            <>
              <div style={{ padding:'8px 20px 4px', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>
                {sectionLabel}
              </div>
              {displayItems.map((item, i) => {
                const isActive = cursor === i
                return (
                  <button key={item.id || item.label} onClick={() => go(item)}
                    onMouseEnter={() => setCursor(i)}
                    style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'10px 20px', background:isActive?'var(--dim)':'transparent', border:'none', cursor:'pointer', textAlign:'left', fontFamily:ff, transition:'background .08s' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'var(--dim)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                      {item.icon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</div>
                      {item.sub && <div style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:1 }}>{item.sub}</div>}
                    </div>
                    {item.shortcut && (
                      <kbd style={{ padding:'2px 7px', background:'var(--dim)', border:'1px solid var(--border)', borderRadius:4, fontSize:10, color:'var(--muted)', fontFamily:'monospace', flexShrink:0 }}>
                        {item.shortcut}
                      </kbd>
                    )}
                    {item.type !== 'action' && (
                      <div style={{ fontSize:10, color:'var(--muted)', flexShrink:0, padding:'2px 6px', borderRadius:99, background:'var(--dim)', border:'1px solid var(--border)', textTransform:'capitalize' }}>
                        {item.type}
                      </div>
                    )}
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'8px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:16, fontSize:10, color:'var(--muted)' }}>
          <span><kbd style={{ fontFamily:'monospace' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily:'monospace' }}>↵</kbd> select</span>
          <span><kbd style={{ fontFamily:'monospace' }}>esc</kbd> close</span>
          <div style={{ flex:1 }} />
          <span style={{ opacity:.5 }}>TargetOS Search</span>
        </div>
      </div>
    </div>
  )
}

// Hook to open command palette globally with Cmd+K / Ctrl+K
export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function h(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return [open, setOpen]
}
