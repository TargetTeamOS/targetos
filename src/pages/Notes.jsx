import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'

export function Notes() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [pinned, setPinned] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)

  useEffect(() => { loadNotes() }, [])

  async function loadNotes() {
    setLoading(true)
    const { data } = await supabase.from('tasks')
      .select('*')
      .eq('priority', 'note')
      .order('created_at', { ascending: false })
    setNotes(data || [])
    setLoading(false)
  }

  async function saveNote() {
    if(!text.trim()) { toast('Note is empty','#DC2626'); return }
    if(editing) {
      await supabase.from('tasks').update({ title: text.trim(), updated_at: new Date().toISOString() }).eq('id', editing)
      toast('Note updated!')
      setEditing(null)
    } else {
      await supabase.from('tasks').insert([{
        title: text.trim(),
        priority: 'note',
        status: pinned ? 'pinned' : 'pending',
        assigned_to: state.user?.id,
        created_by: state.user?.id,
      }])
      toast('✅ Note saved!')
    }
    setText(''); setPinned(false); loadNotes()
  }

  async function deleteNote(id) {
    const n = notes.find(x=>x.id===id)
    confirm({ title:'Delete Note?', message:`Delete this note?`, confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('tasks').delete().eq('id', id)
      toast('Note deleted'); loadNotes()
    }})
  }

  async function togglePin(id, status) {
    const newStatus = status === 'pinned' ? 'pending' : 'pinned'
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id)
    setNotes(prev => prev.map(n => n.id===id ? {...n,status:newStatus} : n))
  }

  const filtered = notes.filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()))
  const pinnedNotes = filtered.filter(n => n.status==='pinned')
  const regularNotes = filtered.filter(n => n.status!=='pinned')

  return (
    <div>
      <ConfirmDialog/>
      <div style={{fontSize:'20px',fontWeight:900,marginBottom:'14px'}}>📓 Notes</div>

      {/* New note input */}
      <Card style={{padding:'16px',marginBottom:'14px'}}>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write a note... (Shift+Enter for new line)" rows={4}
          style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'14px',fontFamily:'Inter,system-ui,sans-serif',padding:'12px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.7}}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();saveNote()}}}
          onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'10px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)} id="pin-note"/>
            <label htmlFor="pin-note" style={{fontSize:'12px',color:'var(--muted)',cursor:'pointer'}}>📌 Pin this note</label>
          </div>
          <Btn size="sm" onClick={saveNote} disabled={!text.trim()}>{editing?'Update':'Save Note'}</Btn>
        </div>
      </Card>

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notes..."
        style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none',boxSizing:'border-box',marginBottom:'14px'}}/>

      {loading && <div style={{padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Loading...</div>}

      {/* Pinned notes */}
      {pinnedNotes.length > 0 && (
        <div style={{marginBottom:'14px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'8px'}}>📌 Pinned</div>
          {pinnedNotes.map(n => <NoteCard key={n.id} note={n} onEdit={n=>{setText(n.title);setEditing(n.id)}} onDelete={deleteNote} onPin={togglePin}/>)}
        </div>
      )}

      {/* Regular notes */}
      {regularNotes.length === 0 && !loading && pinnedNotes.length === 0
        ? <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'13px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px'}}>No notes yet — write one above</div>
        : regularNotes.map(n => <NoteCard key={n.id} note={n} onEdit={n=>{setText(n.title);setEditing(n.id)}} onDelete={deleteNote} onPin={togglePin}/>)
      }
    </div>
  )
}

function NoteCard({ note, onEdit, onDelete, onPin }) {
  const ago = getAgo(note.created_at)
  return (
    <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px 16px',marginBottom:'8px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'10px'}}>
        <div style={{flex:1,fontSize:'13px',lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{note.title}</div>
        <div style={{display:'flex',gap:'5px',flexShrink:0}}>
          <button onClick={()=>onPin(note.id,note.status)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:note.status==='pinned'?.9:.3}} title={note.status==='pinned'?'Unpin':'Pin'}>📌</button>
          <button onClick={()=>onEdit(note)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'13px'}}>✏</button>
          <button onClick={()=>onDelete(note.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px'}}>🗑</button>
        </div>
      </div>
      <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'6px'}}>{ago}</div>
    </div>
  )
}

function getAgo(ts) {
  if(!ts) return ''
  const d = Math.floor((Date.now()-new Date(ts).getTime())/86400000)
  if(d === 0) return 'Today'
  if(d === 1) return 'Yesterday'
  return d+'d ago'
}
