import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAnnouncements } from '../lib/hooks'
import { useApp } from '../context/AppContext'
import { getDaysAgo, initials } from '../lib/utils'
import { useAgents } from '../lib/hooks'

const TYPES = ['info','success','warning','celebration']
const TYPE_ICONS = { info:'📢', success:'✅', warning:'⚠️', celebration:'🎉' }
const TYPE_COLORS = { info:'#0EA5E9', success:'#16A34A', warning:'#D97706', celebration:'#CC2200' }

export function Announcements() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const { announcements, loading, add, update, remove } = useAnnouncements()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ title:'', body:'', type:'info', pinned:false })
  const [saving, setSaving]   = useState(false)

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handlePost() {
    if(!form.title.trim()) { toast('Title required','#DC2626'); return }
    setSaving(true)
    try {
      await add({ ...form, agent_id: agent?.id })
      toast('✅ Announced!'); setShowAdd(false); setForm({ title:'', body:'', type:'info', pinned:false })
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  const pinned  = announcements.filter(a=>a.pinned)
  const regular = announcements.filter(a=>!a.pinned)

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div style={{ fontSize:'18px',fontWeight:900 }}>📣 Team Announcements</div>
        <button onClick={()=>setShowAdd(s=>!s)} style={btnStyle}>{showAdd?'Cancel':'+ Post Announcement'}</button>
      </div>

      {/* Post form */}
      {showAdd && (
        <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px',marginBottom:'14px' }}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr auto',gap:'8px',marginBottom:'8px' }}>
            <input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Announcement title..."
              style={inp}/>
            <select value={form.type} onChange={e=>set('type',e.target.value)}
              style={{ background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none' }}>
              {TYPES.map(t=><option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <textarea value={form.body} onChange={e=>set('body',e.target.value)} placeholder="Details (optional)..." rows={2}
            style={{ ...inp,resize:'vertical',lineHeight:1.6,marginBottom:'8px' }}/>
          <div style={{ display:'flex',gap:'8px',justifyContent:'flex-end' }}>
            <label style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'12px',color:'var(--muted)',cursor:'pointer' }}>
              <input type="checkbox" checked={form.pinned} onChange={e=>set('pinned',e.target.checked)}/>
              Pin to top
            </label>
            <button onClick={handlePost} disabled={saving} style={{ ...btnStyle,opacity:saving?.7:1 }}>{saving?'Posting…':'Post'}</button>
          </div>
        </div>
      )}

      {loading && <div style={{ padding:'24px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      {/* Pinned */}
      {pinned.map(a=>AnnouncementCard(a, agent, agents, update, remove, toast))}
      {/* Regular */}
      {regular.map(a=>AnnouncementCard(a, agent, agents, update, remove, toast))}

      {!loading&&announcements.length===0&&<div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}><div style={{ fontSize:'28px',marginBottom:'10px' }}>📣</div>No announcements yet</div>}
    </div>
  )
}

function AnnouncementCard(a, me, agents, update, remove, toast) {
  const color = TYPE_COLORS[a.type]||'#0EA5E9'
  const agentName = agents.find(x=>x.id===a.agent_id)?.name || 'Team'
  const agentColor = agents.find(x=>x.id===a.agent_id)?.color || '#94A3B8'
  return (
    <div key={a.id} style={{ background:'var(--panel)',border:`1px solid var(--border)`,borderLeft:`4px solid ${color}`,borderRadius:'12px',padding:'14px 16px',marginBottom:'8px' }}>
      {a.pinned&&<div style={{ fontSize:'10px',fontWeight:700,color:'#D97706',marginBottom:'5px' }}>📌 PINNED</div>}
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'8px' }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex',alignItems:'center',gap:'7px',marginBottom:'4px' }}>
            <span style={{ fontSize:'15px' }}>{TYPE_ICONS[a.type]||'📢'}</span>
            <span style={{ fontSize:'14px',fontWeight:800 }}>{a.title}</span>
          </div>
          {a.body&&<div style={{ fontSize:'13px',color:'var(--muted)',lineHeight:1.7,marginBottom:'8px' }}>{a.body}</div>}
          <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
            <div style={{ width:20,height:20,borderRadius:'50%',background:agentColor,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',fontWeight:800,color:'#fff' }}>{agentName?.[0]||'?'}</div>
            <span style={{ fontSize:'11px',color:'var(--muted)' }}>{agentName} · {getDaysAgo(a.created_at)}</span>
          </div>
        </div>
        {me?.id===a.agent_id&&(
          <div style={{ display:'flex',gap:'5px',flexShrink:0 }}>
            <button onClick={async()=>{try{await update(a.id,{pinned:!a.pinned});toast(a.pinned?'Unpinned':'Pinned')}catch(e){toast(e.message,'#DC2626')}}}
              style={{ background:'none',border:'1px solid var(--border)',borderRadius:'7px',color:'var(--muted)',fontSize:'11px',padding:'4px 8px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
              {a.pinned?'Unpin':'Pin'}
            </button>
            <button onClick={async()=>{if(!confirm('Delete?'))return;try{await remove(a.id);toast('Deleted')}catch(e){toast(e.message,'#DC2626')}}}
              style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px' }}>🗑</button>
          </div>
        )}
      </div>
    </div>
  )
}

const inp      = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
