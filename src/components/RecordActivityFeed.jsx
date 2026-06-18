import React, { useState, useEffect, useCallback } from 'react'
import { getRecordActivity } from '../lib/activityLog'
import { timeAgo, formatActivity } from '../lib/time'

const ACTION_STYLES = {
  'Created':        { bg:'#F0FDF4', color:'#16A34A', icon:'✦'  },
  'Updated':        { bg:'#EFF6FF', color:'#2563EB', icon:'✏'  },
  'Deleted':        { bg:'#FEF2F2', color:'#DC2626', icon:'🗑'  },
  'Status Changed': { bg:'#FFFBEB', color:'#D97706', icon:'⇄'  },
  'Note Added':     { bg:'#F0FDF4', color:'#16A34A', icon:'📝'  },
  'Call Logged':    { bg:'#EFF6FF', color:'#0EA5E9', icon:'📞'  },
  'Text Logged':    { bg:'#F5F3FF', color:'#7C3AED', icon:'💬'  },
  'Email Logged':   { bg:'#FFF7ED', color:'#E8650A', icon:'✉'  },
  'Document Added': { bg:'#EFF6FF', color:'#2563EB', icon:'📄'  },
  'default':        { bg:'var(--dim)', color:'var(--muted)', icon:'•' },
}

// timeAgo and formatActivity imported from lib/time

export function RecordActivityFeed({ recordType, recordId, localEntries=[], compact=false }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getRecordActivity(recordType, recordId)
    setEntries(data)
    setLoading(false)
  }, [recordType, recordId])

  useEffect(() => { load() }, [load])

  // Merge local entries (in-memory) with DB entries
  const allEntries = [
    ...localEntries.map(e => ({...e, _local: true})),
    ...entries,
  ].sort((a,b) => new Date(b.created_at||b.time||0) - new Date(a.created_at||a.time||0))

  const filters = ['All','Updated','Note Added','Call Logged','Text Logged','Email Logged','Created']
  const filtered = filter === 'All' ? allEntries : allEntries.filter(e => e.action === filter)

  if(compact) return (
    <div style={{maxHeight:'300px',overflowY:'auto'}}>
      {loading && <div style={{padding:'12px',color:'var(--muted)',fontSize:'12px'}}>Loading activity...</div>}
      {filtered.slice(0,20).map((e,i) => <CompactEntry key={i} entry={e}/>)}
      {filtered.length === 0 && !loading && <div style={{padding:'12px',color:'var(--muted)',fontSize:'12px',textAlign:'center'}}>No activity yet</div>}
    </div>
  )

  return (
    <div>
      {/* Filter tabs */}
      <div style={{display:'flex',gap:'4px',overflowX:'auto',marginBottom:'14px',paddingBottom:'4px'}}>
        {filters.map(f => (
          <button key={f} onClick={()=>setFilter(f)}
            style={{padding:'6px 13px',borderRadius:'20px',border:'1.5px solid '+(filter===f?'#CC2200':'var(--border)'),background:filter===f?'rgba(204,34,0,.08)':'transparent',color:filter===f?'#CC2200':'var(--muted)',fontSize:'11px',fontWeight:filter===f?700:400,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',whiteSpace:'nowrap',flexShrink:0}}>
            {f}
            {f!=='All' && <span style={{marginLeft:'5px',fontSize:'10px',opacity:.7}}>{allEntries.filter(e=>e.action===f).length}</span>}
          </button>
        ))}
        <button onClick={load} style={{padding:'6px 10px',borderRadius:'20px',border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',flexShrink:0,marginLeft:'auto'}} title="Refresh">↻</button>
      </div>

      {/* Entries */}
      {loading ? (
        <div style={{textAlign:'center',padding:'24px',color:'var(--muted)'}}>Loading activity log...</div>
      ) : filtered.length === 0 ? (
        <div style={{textAlign:'center',padding:'36px',color:'var(--muted)'}}>
          <div style={{fontSize:'28px',marginBottom:'10px'}}>📋</div>
          <div style={{fontSize:'13px',fontWeight:600,marginBottom:'4px'}}>No activity yet</div>
          <div style={{fontSize:'12px'}}>Every change will be tracked here automatically</div>
        </div>
      ) : (
        <div style={{position:'relative'}}>
          {/* Timeline line */}
          <div style={{position:'absolute',left:'18px',top:0,bottom:0,width:'2px',background:'var(--border)',zIndex:0}}/>
          {filtered.map((e,i) => <FullEntry key={i} entry={e}/>)}
        </div>
      )}
    </div>
  )
}

function FullEntry({ entry: e }) {
  const [expanded, setExpanded] = useState(false)
  const style = ACTION_STYLES[e.action] || ACTION_STYLES.default
  const hasChange = (e.old_value && e.new_value) || (e.before_val && e.after_val)

  return (
    <div style={{display:'flex',gap:'12px',marginBottom:'16px',position:'relative',zIndex:1}}>
      {/* Icon */}
      <div style={{width:36,height:36,borderRadius:'50%',background:style.bg,border:'2px solid '+style.color+'44',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',flexShrink:0,position:'relative',zIndex:2}}>
        {style.icon}
      </div>

      {/* Content */}
      <div style={{flex:1,background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'12px 14px',cursor:hasChange?'pointer':'default'}}
        onClick={()=>hasChange&&setExpanded(e=>!e)}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'4px'}}>
          <div>
            <span style={{fontSize:'13px',fontWeight:700}}>{e.agent_name || e.agent || 'System'}</span>
            <span style={{fontSize:'12px',color:'var(--muted)',marginLeft:'6px'}}>{e.action}</span>
            {e.field_name && <span style={{fontSize:'12px',color:'var(--text)',marginLeft:'4px',fontWeight:600}}>· {e.field_name}</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'10px',color:'var(--muted)',whiteSpace:'nowrap'}}>{timeAgo(e.created_at||e.time)}</span>
            {hasChange && <span style={{fontSize:'10px',color:'#CC2200'}}>{expanded?'▲':'▼'}</span>}
          </div>
        </div>

        {/* Detail line */}
        {(e.detail || e.field_name) && (
          <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:hasChange&&!expanded?0:4}}>
            {e.detail || (e.field_name && e.new_value ? 'Changed to: '+e.new_value : '')}
          </div>
        )}

        {/* Before/After expanded */}
        {hasChange && expanded && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'10px'}}>
            <div style={{background:'rgba(220,38,38,.06)',border:'1px solid rgba(220,38,38,.15)',borderRadius:'8px',padding:'10px'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'#DC2626',marginBottom:'5px',textTransform:'uppercase',letterSpacing:'.5px'}}>Before</div>
              <div style={{fontSize:'12px',fontFamily:'monospace',wordBreak:'break-word'}}>{e.old_value || e.before_val || '(empty)'}</div>
            </div>
            <div style={{background:'rgba(22,163,74,.06)',border:'1px solid rgba(22,163,74,.15)',borderRadius:'8px',padding:'10px'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'#16A34A',marginBottom:'5px',textTransform:'uppercase',letterSpacing:'.5px'}}>After</div>
              <div style={{fontSize:'12px',fontFamily:'monospace',wordBreak:'break-word'}}>{e.new_value || e.after_val || '(empty)'}</div>
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'6px'}}>
          {formatActivity(e.created_at||e.time)}
        </div>
      </div>
    </div>
  )
}

function CompactEntry({ entry: e }) {
  const style = ACTION_STYLES[e.action] || ACTION_STYLES.default
  return (
    <div style={{display:'flex',gap:'9px',padding:'8px 0',borderBottom:'1px solid var(--border)',alignItems:'flex-start'}}>
      <div style={{width:24,height:24,borderRadius:'50%',background:style.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',flexShrink:0}}>
        {style.icon}
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:'12px'}}><strong>{e.agent_name||'System'}</strong> {e.action}{e.field_name?' · '+e.field_name:''}</div>
        {(e.new_value||e.detail) && <div style={{fontSize:'11px',color:'var(--muted)'}}>{e.new_value||e.detail}</div>}
        <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}>{timeAgo(e.created_at||e.time)}</div>
      </div>
    </div>
  )
}
