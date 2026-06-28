// TargetOS V2 — Record Activity Feed
// Monday.com-style timeline for every CRM record.
// Shows field changes, comments, system events with before/after diffs.
// Usage: <RecordActivityFeed table="contacts" recordId={id} agentId={agent.id} agentName={agent.name} />

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

// ── ACTION CONFIG ─────────────────────────────────────────────────
const ACTION = {
  created:        { icon:'✦', color:'#10B981', label:'Created'        },
  updated:        { icon:'✏', color:'#3B82F6', label:'Updated'        },
  deleted:        { icon:'🗑', color:'#DC2626', label:'Deleted'        },
  status_changed: { icon:'⇄', color:'#F5A623', label:'Status changed' },
  comment:        { icon:'💬', color:'#8B5CF6', label:'Comment'        },
  call_logged:    { icon:'📞', color:'#0EA5E9', label:'Call logged'    },
  note_added:     { icon:'📝', color:'#10B981', label:'Note added'     },
  file_added:     { icon:'📎', color:'#6366F1', label:'File added'     },
  task_created:   { icon:'✅', color:'#14B8A6', label:'Task created'   },
  default:        { icon:'•',  color:'#94A3B8', label:'Activity'       },
}

function getAction(a) {
  if (!a) return ACTION.default
  const key = a.toLowerCase().replace(/ /g,'_')
  return ACTION[key] || ACTION.default
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return mins + 'm ago'
  if (hours < 24) return hours + 'h ago'
  if (days === 1) return 'yesterday'
  if (days < 7)   return days + 'd ago'
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', timeZone:'America/New_York' })
}

function fullDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    timeZone:'America/New_York', month:'short', day:'numeric',
    year:'numeric', hour:'numeric', minute:'2-digit', hour12:true,
  })
}

// ── INDIVIDUAL ENTRY ──────────────────────────────────────────────
function Entry({ e, agents }) {
  const [expanded, setExpanded] = useState(false)
  const ac    = getAction(e.action)
  const agent = agents.find(function(a) { return a.id === e.agent_id }) || e.agents
  const meta  = e.metadata ? (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) : {}

  // Parse before/after from metadata
  const hasChange = meta.old_value !== undefined || meta.before !== undefined
  const fieldName  = meta.field_label || meta.field || meta.field_name || null
  const oldVal     = meta.old_value !== undefined ? meta.old_value : meta.before
  const newVal     = meta.new_value !== undefined ? meta.new_value : meta.after
  const description = meta.description || meta.detail || null
  const isComment   = e.action === 'comment'

  return (
    <div style={{ display:'flex', gap:12, marginBottom:16, position:'relative', zIndex:1 }}>
      {/* Avatar / icon */}
      <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:0 }}>
        <div style={{ width:34, height:34, borderRadius:'50%',
          background: agent ? (agent.color || ac.color) : ac.color,
          border: '2px solid ' + ac.color + '55',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize: agent ? 12 : 16, fontWeight:800, color:'#fff',
          flexShrink:0, position:'relative', zIndex:2 }}>
          {agent
            ? (agent.name || '').split(' ').map(function(n){return n[0]}).join('').slice(0,2).toUpperCase()
            : ac.icon}
        </div>
      </div>

      {/* Content bubble */}
      <div style={{ flex:1, minWidth:0 }}>
        {isComment ? (
          // Comment — full bubble style
          <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12,
            padding:'10px 14px', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>
                {agent ? agent.name : 'System'}
              </span>
              <span style={{ fontSize:10, color:'var(--muted)' }} title={fullDate(e.created_at)}>
                {timeAgo(e.created_at)}
              </span>
            </div>
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.55, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
              {description}
            </div>
          </div>
        ) : (
          // System / field change entry
          <div style={{ background:'var(--dim)', border:'1px solid var(--border)', borderRadius:10, padding:'9px 12px',
            cursor: hasChange ? 'pointer' : 'default' }}
            onClick={function() { if (hasChange) setExpanded(function(x){return !x}) }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                {/* Action pill */}
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px',
                  borderRadius:20, background:ac.color+'18', border:'1px solid '+ac.color+'33',
                  fontSize:10, fontWeight:700, color:ac.color, marginRight:6 }}>
                  {ac.icon} {ac.label}
                </span>
                {fieldName && (
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{fieldName}</span>
                )}
                {!fieldName && description && (
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{description}</span>
                )}
                {/* agent */}
                {agent && (
                  <span style={{ fontSize:11, color:'var(--muted)', marginLeft:6 }}>
                    by {agent.name}
                  </span>
                )}
                {/* Quick inline change preview */}
                {hasChange && !expanded && newVal !== undefined && newVal !== null && newVal !== '' && (
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                    → <span style={{ color:'#10B981', fontWeight:600 }}>{String(newVal).slice(0,60)}</span>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                <span style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap' }} title={fullDate(e.created_at)}>
                  {timeAgo(e.created_at)}
                </span>
                {hasChange && (
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
                )}
              </div>
            </div>

            {/* Expanded before/after */}
            {hasChange && expanded && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:10 }}>
                <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#DC2626', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>Before</div>
                  <div style={{ fontSize:12, fontFamily:'monospace', wordBreak:'break-all', color:'#7F1D1D' }}>
                    {oldVal !== undefined && oldVal !== null && oldVal !== '' ? String(oldVal) : '(empty)'}
                  </div>
                </div>
                <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#16A34A', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>After</div>
                  <div style={{ fontSize:12, fontFamily:'monospace', wordBreak:'break-all', color:'#14532D' }}>
                    {newVal !== undefined && newVal !== null && newVal !== '' ? String(newVal) : '(empty)'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────
export function RecordActivityFeed({ table, recordId, compact = false }) {
  const { agent } = useAuth()
  const [entries, setEntries]   = useState([])
  const [agents,  setAgents]    = useState([])
  const [loading, setLoading]   = useState(true)
  const [comment, setComment]   = useState('')
  const [posting, setPosting]   = useState(false)
  const [filter,  setFilter]    = useState('all')
  const textRef = useRef(null)

  const load = useCallback(async function() {
    if (!recordId) return
    setLoading(true)
    try {
      const [actRes, agRes] = await Promise.all([
        supabase.from('audit_log')
          .select('*, agents(id,name,color)')
          .eq('record_id', recordId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('agents').select('id,name,color').eq('active', true),
      ])
      setEntries(actRes.data || [])
      setAgents(agRes.data  || [])
    } catch(e) {
      console.warn('activity load:', e.message)
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(function() { load() }, [load])

  // Realtime — new entries pop in live
  useEffect(function() {
    if (!recordId) return
    const ch = supabase.channel('activity_' + recordId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'audit_log',
        filter: 'record_id=eq.' + recordId,
      }, function(payload) {
        setEntries(function(prev) { return [payload.new, ...prev] })
      })
      .subscribe()
    return function() { supabase.removeChannel(ch) }
  }, [recordId])

  async function postComment() {
    if (!comment.trim() || !agent) return
    setPosting(true)
    try {
      const entry = {
        agent_id:   agent.id,
        table_name: table,
        record_id:  recordId,
        action:     'comment',
        metadata:   JSON.stringify({ description: comment.trim() }),
        created_at: new Date().toISOString(),
      }
      await supabase.from('audit_log').insert(entry)
      setComment('')
      textRef.current && (textRef.current.style.height = 'auto')
    } catch(e) {
      console.warn('comment post failed:', e.message)
    } finally {
      setPosting(false)
    }
  }

  // Filter tabs
  const FILTERS = [
    { id:'all',      label:'All' },
    { id:'comment',  label:'Comments' },
    { id:'updated',  label:'Updates' },
    { id:'created',  label:'Created' },
  ]

  const filtered = entries.filter(function(e) {
    if (filter === 'all') return true
    if (filter === 'comment') return e.action === 'comment'
    if (filter === 'updated') return ['updated','status_changed'].includes((e.action||'').toLowerCase())
    if (filter === 'created') return (e.action||'').toLowerCase() === 'created'
    return true
  })

  const counts = {
    comment: entries.filter(function(e){return e.action==='comment'}).length,
    updated: entries.filter(function(e){return ['updated','status_changed'].includes((e.action||'').toLowerCase())}).length,
    created: entries.filter(function(e){return (e.action||'').toLowerCase()==='created'}).length,
  }

  if (compact) {
    return (
      <div style={{ fontFamily:ff }}>
        {loading ? (
          <div style={{ padding:'12px', color:'var(--muted)', fontSize:12, textAlign:'center' }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ padding:'16px', color:'var(--muted)', fontSize:12, textAlign:'center' }}>No activity yet</div>
        ) : (
          <div style={{ maxHeight:260, overflowY:'auto', display:'flex', flexDirection:'column', gap:8, padding:'4px 0' }}>
            {entries.slice(0,15).map(function(e, i) {
              const ac = getAction(e.action)
              const ag = agents.find(function(a){return a.id===e.agent_id}) || e.agents
              const meta = e.metadata ? (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) : {}
              return (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:ag?ag.color:ac.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {ag ? (ag.name||'').split(' ').map(function(n){return n[0]}).join('').slice(0,2) : ac.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:'var(--text)' }}>
                      <strong>{ag ? ag.name : 'System'}</strong>
                      {' '}<span style={{ color:'var(--muted)' }}>{ac.label.toLowerCase()}</span>
                      {meta.field_label && <span style={{ color:'var(--text)' }}> · {meta.field_label}</span>}
                      {meta.description && <span style={{ color:'var(--muted)' }}> — {String(meta.description).slice(0,50)}</span>}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{timeAgo(e.created_at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ fontFamily:ff }}>

      {/* Comment composer */}
      <div style={{ display:'flex', gap:10, marginBottom:20, alignItems:'flex-start' }}>
        {agent && (
          <div style={{ width:34, height:34, borderRadius:'50%', background:agent.color||'#CC2200',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800,
            color:'#fff', flexShrink:0, marginTop:2 }}>
            {(agent.name||'').split(' ').map(function(n){return n[0]}).join('').slice(0,2).toUpperCase()}
          </div>
        )}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
          <textarea
            ref={textRef}
            value={comment}
            onChange={function(e) {
              setComment(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
            onKeyDown={function(e) {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment()
            }}
            placeholder="Write an update or comment... (Ctrl+Enter to post)"
            rows={2}
            style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)',
              background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff,
              resize:'none', boxSizing:'border-box', lineHeight:1.5,
              outline:'none', transition:'border-color .15s', minHeight:44, overflow:'hidden' }}
            onFocus={function(e){e.target.style.borderColor='#CC2200'}}
            onBlur={function(e){e.target.style.borderColor='var(--border)'}}
          />
          {comment.trim() && (
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={function(){setComment('')}}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'transparent',
                  color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
                Cancel
              </button>
              <button onClick={postComment} disabled={posting}
                style={{ padding:'6px 16px', borderRadius:8, border:'none', background:'#CC2200',
                  color:'#fff', fontSize:12, fontWeight:700, cursor:posting?'default':'pointer', fontFamily:ff,
                  opacity:posting?.7:1 }}>
                {posting ? 'Posting...' : '💬 Post update'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {FILTERS.map(function(f) {
          const cnt = f.id === 'all' ? entries.length : counts[f.id] || 0
          const active = filter === f.id
          return (
            <button key={f.id} onClick={function(){setFilter(f.id)}}
              style={{ padding:'7px 14px', border:'none', background:'none', cursor:'pointer',
                borderBottom: active ? '2px solid #CC2200' : '2px solid transparent',
                marginBottom:'-1px', fontSize:12, fontWeight:active?700:500,
                color:active?'#CC2200':'var(--muted)', fontFamily:ff, whiteSpace:'nowrap',
                display:'flex', alignItems:'center', gap:5 }}>
              {f.label}
              <span style={{ padding:'1px 6px', borderRadius:10, background:active?'#CC220018':'var(--dim)',
                color:active?'#CC2200':'var(--muted)', fontSize:10, fontWeight:700 }}>
                {cnt}
              </span>
            </button>
          )
        })}
        <button onClick={load}
          style={{ marginLeft:'auto', padding:'6px 10px', border:'none', background:'none',
            cursor:'pointer', color:'var(--muted)', fontSize:13, fontFamily:ff }}
          title="Refresh">↻</button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)', fontSize:13 }}>
          Loading activity...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:4 }}>No activity yet</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Every change is tracked here automatically. Post an update above.</div>
        </div>
      ) : (
        <div style={{ position:'relative' }}>
          {/* Vertical timeline line */}
          <div style={{ position:'absolute', left:17, top:0, bottom:0, width:2,
            background:'var(--border)', zIndex:0 }} />
          {filtered.map(function(e, i) {
            return <Entry key={e.id || i} e={e} agents={agents} />
          })}
        </div>
      )}
    </div>
  )
}

// ── LEGACY EXPORT (keep old name working) ────────────────────────
export { RecordActivityFeed as RecordActivity }
