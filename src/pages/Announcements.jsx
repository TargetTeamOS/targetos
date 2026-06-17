import React, { useState } from 'react'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'

export function Announcements() {
  const [items, setItems] = useState([
    {id:1,title:'Team Meeting — Monday 9AM Zoom',body:'Weekly team meeting. Come prepared with your weekly numbers and listing updates. Zoom: zoom.us/j/82511980702',author:'Avraham W.',time:'Jun 14',pinned:true},
    {id:2,title:'New Listings Active on MLS',body:'Multiple new listings now active. Check the Target Listings board for details and share with your buyers.',author:'Avraham W.',time:'Jun 12',pinned:false},
  ])
  const { confirm, ConfirmDialog } = useConfirm()
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)

  function post() {
    if(!title.trim()) return
    setItems(prev=>[{id:Date.now(),title,body,author:'Admin',time:'Just now',pinned},...prev])
    setTitle(''); setBody(''); setPinned(false); setShowAdd(false)
  }
  function del(id) { const item=items.find(x=>x.id===id); confirm({title:'Delete Announcement?',message:item?'"'+item.title+'" will be removed for all agents.':'This announcement will be deleted.',confirmLabel:'Delete',onConfirm:()=>setItems(prev=>prev.filter(x=>x.id!==id))}) }
  function togglePin(id) { setItems(prev=>prev.map(x=>x.id===id?{...x,pinned:!x.pinned}:x)) }

  const sorted = [...items].sort((a,b)=>b.pinned-a.pinned)

  return (
    <div>
      <ConfirmDialog/>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>Team-wide messages · All agents see these</span>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>Post Announcement</Btn>
      </div>

      {/* Zoom quick link */}
      <Card style={{padding:'13px 16px',marginBottom:'14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:'12px',fontWeight:700}}>Team Zoom Meeting</div>
          <div style={{color:'var(--muted)',fontSize:'11px'}}>Mondays 9AM · ID: 825 1198 0702</div>
        </div>
        <a href="https://zoom.us/j/82511980702" target="_blank" rel="noreferrer">
          <Btn size="sm">Join Zoom</Btn>
        </a>
      </Card>

      {sorted.map(a => (
        <div key={a.id} style={{background:'var(--panel)',border:'1.5px solid '+(a.pinned?'#D97706':'var(--border)'),borderRadius:'12px',padding:'16px',marginBottom:'11px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              {a.pinned && <div style={{background:'#D97706',borderRadius:'5px',padding:'2px 7px',fontSize:'9px',fontWeight:700,color:'#fff',letterSpacing:'.5px'}}>PINNED</div>}
              <div style={{fontSize:'14px',fontWeight:800}}>{a.title}</div>
            </div>
            <div style={{display:'flex',gap:'5px'}}>
              <button onClick={()=>togglePin(a.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:.6}} title={a.pinned?'Unpin':'Pin'}>📌</button>
              <button onClick={()=>del(a.id)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:.6}}>🗑</button>
            </div>
          </div>
          <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.7,marginBottom:'8px'}}>{a.body}</div>
          <div style={{fontSize:'10px',color:'var(--muted)'}}>{a.author} · {a.time}</div>
        </div>
      ))}

      {/* Auto reminders */}
      <Card>
        <CardHeader>Auto Reminders</CardHeader>
        {[['84 Tennyson — Closing Jun 28','14 days away, prepare closing gifts'],['47 Prairie Ave — 7 days listed','Review with agent'],['135 Route 306 — Closing Jul 10','CTC check-in needed'],['Sarah M. — Birthday Jun 18','Great time to reach out']].map((r,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'var(--red)',flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:'12px',fontWeight:600}}>{r[0]}</div>
              <div style={{fontSize:'10px',color:'var(--muted)'}}>{r[1]}</div>
            </div>
          </div>
        ))}
      </Card>

      {showAdd && (
        <Modal onClose={()=>setShowAdd(false)} maxWidth={480}>
          <ModalTitle onClose={()=>setShowAdd(false)}>New Announcement</ModalTitle>
          <Input label="Title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Team meeting, new listing..."/>
          <Input label="Message" value={body} onChange={e=>setBody(e.target.value)} rows={3} placeholder="Write your announcement..."/>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'16px',cursor:'pointer'}} onClick={()=>setPinned(p=>!p)}>
            <div style={{width:18,height:18,borderRadius:'5px',border:'2px solid '+(pinned?'var(--red)':'var(--border)'),background:pinned?'var(--red)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'11px'}}>{pinned&&'✓'}</div>
            <span style={{fontSize:'13px'}}>Pin to top</span>
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={post}>Post</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
