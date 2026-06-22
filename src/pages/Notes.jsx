import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { getNotes, createNote, updateNote, deleteNote } from '../lib/db/notes'
import { getDaysAgo } from '../lib/utils/format'
import { useEffect } from 'react'

export function Notes() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [notes, setNotes]     = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [editing, setEditing] = useState(null)
  const [editText, setEditText] = useState('')

  useEffect(() => {
    getNotes({ agentId: agent?.id }).then(setNotes).catch(e=>toast(e.message,'#DC2626')).finally(()=>setLoading(false))
  }, [])

  async function addNote() {
    if(!text.trim()) return
    setSaving(true)
    try {
      const d = await createNote({ title: text.trim(), agent_id: agent?.id, status:'pinned' })
      setNotes(p=>[d,...p]); setText(''); toast('✅ Note saved!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function saveEdit(id) {
    try {
      const d = await updateNote(id, { title: editText })
      setNotes(p=>p.map(n=>n.id===id?d:n)); setEditing(null)
    } catch(e) { toast(e.message,'#DC2626') }
  }

  async function removeNote(id) {
    try { await deleteNote(id); setNotes(p=>p.filter(n=>n.id!==id)); toast('Note deleted') }
    catch(e) { toast(e.message,'#DC2626') }
  }

  return (
    <div>
      <div style={{ fontSize:'18px',fontWeight:900,marginBottom:'14px' }}>📌 Notes</div>
      <div style={{ display:'flex',gap:'8px',marginBottom:'16px' }}>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write a note... (press Shift+Enter for new line, Enter to save)"
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addNote()}}}
          rows={2}
          style={{ flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 12px',outline:'none',resize:'none' }}/>
        <button onClick={addNote} disabled={saving||!text.trim()}
          style={{ background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'10px 16px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:(saving||!text.trim())?.5:1,alignSelf:'flex-end' }}>
          Save
        </button>
      </div>

      {loading && <div style={{ padding:'24px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}
      {!loading&&notes.length===0&&<div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}><div style={{ fontSize:'28px',marginBottom:'10px' }}>📌</div>No notes yet</div>}

      <div style={{ columns:'2',columnGap:'10px' }}>
        {notes.map(n=>(
          <div key={n.id} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px',marginBottom:'10px',breakInside:'avoid' }}>
            {editing===n.id
              ? <div>
                  <textarea value={editText} onChange={e=>setEditText(e.target.value)} autoFocus rows={3}
                    style={{ width:'100%',background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',resize:'vertical',boxSizing:'border-box',marginBottom:'8px' }}/>
                  <div style={{ display:'flex',gap:'6px' }}>
                    <button onClick={()=>saveEdit(n.id)} style={{ flex:2,background:'#CC2200',border:'none',borderRadius:'8px',color:'#fff',fontSize:'11px',fontWeight:700,padding:'7px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Save</button>
                    <button onClick={()=>setEditing(null)} style={{ flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--muted)',fontSize:'11px',padding:'7px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
                  </div>
                </div>
              : <>
                  <div style={{ fontSize:'13px',lineHeight:1.7,whiteSpace:'pre-wrap',marginBottom:'10px' }}>{n.title}</div>
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                    <div style={{ fontSize:'10px',color:'var(--muted)' }}>{getDaysAgo(n.created_at)}</div>
                    <div style={{ display:'flex',gap:'6px' }}>
                      <button onClick={()=>{setEditing(n.id);setEditText(n.title)}} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'12px' }}>✏️</button>
                      <button onClick={()=>removeNote(n.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'12px' }}>🗑</button>
                    </div>
                  </div>
                </>
            }
          </div>
        ))}
      </div>
    </div>
  )
}
