import React, { useState } from 'react'
import { Card, Btn, Modal, ModalTitle, Input } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'

export function Notes() {
  const [notes, setNotes] = useState([{id:1,title:'Team Goals Q3',body:'Focus on closing all UC deals before end of July. Push for new listings in Monsey and Spring Valley.',time:'Jun 14, 2026'},{id:2,title:'Vendor Contacts',body:'Photography: Mike 845-555-0101\nSign company: ABC Signs 845-555-0202\nStager: Rachel 845-555-0303',time:'Jun 10, 2026'}])
  const { confirm, ConfirmDialog } = useConfirm()
  const [showAdd, setShowAdd] = useState(false)
  const [editIdx, setEditIdx] = useState(null)
  const [form, setForm] = useState({title:'',body:''})

  function save() {
    if(!form.title.trim()) return
    if(editIdx!==null) {
      setNotes(prev=>prev.map((n,i)=>i===editIdx?{...n,...form}:n))
      setEditIdx(null)
    } else {
      setNotes(prev=>[{id:Date.now(),title:form.title,body:form.body,time:new Date().toLocaleDateString()},...prev])
    }
    setForm({title:'',body:''}); setShowAdd(false)
  }

  return (
    <div>
      <ConfirmDialog/>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>Personal scratchpad — private to you</span>
        <Btn size="sm" onClick={()=>{setEditIdx(null);setForm({title:'',body:''});setShowAdd(true)}}>+ New Note</Btn>
      </div>
      {notes.length===0 ? (
        <div style={{textAlign:'center',padding:'48px',color:'var(--muted)'}}>
          No notes yet. <button onClick={()=>{setShowAdd(true)}} style={{color:'var(--red)',background:'none',border:'none',cursor:'pointer',fontSize:'13px'}}>Add first note</button>
        </div>
      ) : notes.map((n,i)=>(
        <div key={n.id} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'16px',marginBottom:'11px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
            <div style={{fontSize:'14px',fontWeight:800}}>{n.title}</div>
            <div style={{display:'flex',gap:'5px'}}>
              <button onClick={()=>{setForm({title:n.title,body:n.body});setEditIdx(i);setShowAdd(true)}} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:.6}}>✏️</button>
              <button onClick={()=>confirm({title:'Delete Note?',message:'"'+n.title+'" will be permanently deleted.',confirmLabel:'Delete Note',onConfirm:()=>setNotes(prev=>prev.filter((_,j)=>j!==i))})} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:.6}}>🗑</button>
            </div>
          </div>
          <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.7,whiteSpace:'pre-wrap',marginBottom:'8px'}}>{n.body}</div>
          <div style={{fontSize:'10px',color:'var(--muted)'}}>{n.time}</div>
        </div>
      ))}
      {showAdd && (
        <Modal onClose={()=>{setShowAdd(false);setEditIdx(null)}} maxWidth={480}>
          <ModalTitle onClose={()=>{setShowAdd(false);setEditIdx(null)}}>{editIdx!==null?'Edit Note':'New Note'}</ModalTitle>
          <Input label="Title" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Note title..."/>
          <Input label="Note" value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} rows={5} placeholder="Write your note..."/>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditIdx(null)}}>Cancel</Btn>
            <Btn onClick={save}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
