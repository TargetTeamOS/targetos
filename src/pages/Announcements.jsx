import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, Btn, Input } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'

const TYPE_COLORS = { info:'#0EA5E9', success:'#16A34A', alert:'#DC2626', celebration:'#7C3AED', auto:'#E8650A' }
const TYPE_ICONS  = { info:'📢', success:'🎉', alert:'⚠️', celebration:'🏆', auto:'⚡' }

export function Announcements() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ title:'', body:'', type:'info', pinned:false })

  useEffect(() => { loadAnnouncements() }, [])

  async function loadAnnouncements() {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  async function addAnnouncement() {
    if(!form.title.trim()) { toast('Title required','#DC2626'); return }
    const { data, error } = await supabase.from('announcements').insert([{
      title:      form.title.trim(),
      body:       form.body.trim(),
      type:       form.type,
      pinned:     form.pinned,
      agent_name: state.currentAgent?.name || 'Admin',
      agent_id:   state.user?.id,
    }]).select()
    if(error) { toast('Failed: '+error.message,'#DC2626'); return }
    toast('✅ Announcement posted!')
    setItems(prev => [data[0], ...prev])
    setShowAdd(false)
    setForm({ title:'', body:'', type:'info', pinned:false })
  }

  async function togglePin(id, pinned) {
    await supabase.from('announcements').update({ pinned: !pinned }).eq('id', id)
    setItems(prev => prev.map(i => i.id===id ? {...i, pinned:!pinned} : i))
  }

  async function deleteItem(id) {
    const item = items.find(i=>i.id===id)
    confirm({ title:'Delete Announcement?', message:`Delete "${item?.title}"?`, confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('announcements').delete().eq('id', id)
      setItems(prev => prev.filter(i => i.id!==id))
      toast('Deleted')
    }})
  }

  const pinned   = items.filter(i => i.pinned)
  const unpinned = items.filter(i => !i.pinned)

  return (
    <div>
      <ConfirmDialog/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>📣 Team Announcements</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{items.length} announcements · {pinned.length} pinned</div>
        </div>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Post Announcement</Btn>
      </div>

      {loading && <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Loading...</div>}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div style={{marginBottom:'16px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'8px'}}>📌 Pinned</div>
          {pinned.map(item => <AnnouncementCard key={item.id} item={item} onPin={togglePin} onDelete={deleteItem}/>)}
        </div>
      )}

      {/* All */}
      <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'8px'}}>Recent</div>
      {unpinned.length === 0 && !loading && <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'13px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px'}}>No announcements yet — post one above</div>}
      {unpinned.map(item => <AnnouncementCard key={item.id} item={item} onPin={togglePin} onDelete={deleteItem}/>)}

      {/* Add modal */}
      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'480px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>Post Announcement</div>
              <button onClick={()=>setShowAdd(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
            </div>
            <div style={{marginBottom:'10px'}}>
              <label style={lbl}>Title</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Announcement title..." style={inp}/>
            </div>
            <div style={{marginBottom:'10px'}}>
              <label style={lbl}>Body (optional)</label>
              <textarea value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="More details..." rows={3} style={{...inp,resize:'vertical',lineHeight:1.6}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
              <div>
                <label style={lbl}>Type</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={inp}>
                  {['info','success','alert','celebration'].map(t=><option key={t} value={t}>{TYPE_ICONS[t]} {t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px',paddingTop:'20px'}}>
                <input type="checkbox" checked={form.pinned} onChange={e=>setForm(f=>({...f,pinned:e.target.checked}))} id="pin"/>
                <label htmlFor="pin" style={{fontSize:'12px',color:'var(--muted)',cursor:'pointer'}}>Pin to top</label>
              </div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <Btn variant="ghost" onClick={()=>setShowAdd(false)} style={{flex:1}}>Cancel</Btn>
              <Btn onClick={addAnnouncement} style={{flex:2}}>Post Announcement</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({ item, onPin, onDelete }) {
  const color = TYPE_COLORS[item.type] || '#0EA5E9'
  const icon  = TYPE_ICONS[item.type]  || '📢'
  const ago = getAgo(item.created_at)
  return (
    <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderLeft:'4px solid '+color,borderRadius:'12px',padding:'14px 16px',marginBottom:'8px',display:'flex',gap:'12px',alignItems:'flex-start'}}>
      <div style={{width:36,height:36,borderRadius:'9px',background:color+'15',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'8px',flexWrap:'wrap'}}>
          <div style={{fontSize:'14px',fontWeight:700}}>{item.pinned?'📌 ':''}{item.title}</div>
          <div style={{fontSize:'11px',color:'var(--muted)',flexShrink:0}}>{ago}</div>
        </div>
        {item.body && <div style={{fontSize:'13px',color:'var(--muted)',marginTop:'4px',lineHeight:1.6}}>{item.body}</div>}
        <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'6px'}}>By {item.agent_name||'Team'}</div>
      </div>
      <div style={{display:'flex',gap:'5px',flexShrink:0}}>
        <button onClick={()=>onPin(item.id,item.pinned)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:item.pinned?.9:.4}} title={item.pinned?'Unpin':'Pin'}>📌</button>
        <button onClick={()=>onDelete(item.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px'}}>🗑</button>
      </div>
    </div>
  )
}

function getAgo(ts) {
  if(!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff/60000)
  if(m < 1) return 'Just now'
  if(m < 60) return m+'m ago'
  const h = Math.floor(m/60)
  if(h < 24) return h+'h ago'
  return Math.floor(h/24)+'d ago'
}

const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const inp = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
