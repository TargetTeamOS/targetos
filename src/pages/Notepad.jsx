// ═══════════════════════════════════════════════════════════════
// Notepad — agents jot text notes or record voice notes. Voice notes
// save BOTH the audio recording (playable) and the transcript, so if
// the transcript is off, the agent can listen to the original. Notes
// can be pinned. Personal to each agent.
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadFile } from '../lib/storage'
import { SignedAudio } from '../components/SignedAudio'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAudioNote } from '../lib/useAudioNote'
import { Btn, PageHeader } from '../components/UI'

const card = { background:'var(--panel)', border:'1px solid var(--border)', borderRadius:12, padding:14, marginBottom:10 }
const inp = { width:'100%', padding:'9px 11px', borderRadius:8, border:'1px solid var(--border)', fontSize:14, background:'var(--bg)', color:'var(--text)', boxSizing:'border-box', fontFamily:'inherit' }

export function Notepad() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [notes, setNotes] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')
  const [saving, setSaving] = useState(false)
  const { recording, transcript, audioBlob, error, start, stop, reset } = useAudioNote()

  async function load() {
    if (!agent?.id) return
    const { data } = await supabase.from('notes').select('*').eq('agent_id', agent.id).order('pinned', { ascending:false }).order('created_at', { ascending:false })
    setNotes(data || [])
  }
  useEffect(() => { load() }, [agent?.id])

  // when a recording finishes, drop the transcript into the body for editing
  useEffect(() => { if (transcript && !recording) setBody(b => b ? b : transcript) }, [recording])

  async function save() {
    if (!agent?.id) { toast('Not logged in', '#DC2626'); return }
    if (!body.trim() && !audioBlob) { toast('Write or record something first', '#F59E0B'); return }
    setSaving(true)
    try {
      let audio_url = null, audio_path = null
      if (audioBlob) {
        const file = new File([audioBlob], 'note-' + Date.now() + '.webm', { type:'audio/webm' })
        const up = await uploadFile(file, 'notes', agent.id)
        audio_url = up.url; audio_path = up.path
      }
      const { error: err } = await supabase.from('notes').insert({
        agent_id: agent.id, title: title.trim() || null,
        body: body.trim() || transcript || null,
        transcript: transcript || null,
        audio_url, audio_path,
      })
      if (err) throw err
      toast('📝 Note saved')
      setTitle(''); setBody(''); reset(); load()
    } catch (e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function togglePin(n) {
    await supabase.from('notes').update({ pinned: !n.pinned }).eq('id', n.id); load()
  }
  async function del(n) {
    await supabase.from('notes').delete().eq('id', n.id); load()
  }

  return (
    <div style={{ maxWidth:720, margin:'0 auto' }}>
      <PageHeader title="Notepad" subtitle="Quick notes — type or record. Voice notes keep the audio + transcript." />

      <div style={card}>
        <input style={{ ...inp, fontWeight:700, marginBottom:8 }} placeholder="Title (optional)" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea style={{ ...inp, minHeight:110, resize:'vertical' }} placeholder="Write a note…  or tap Record to speak it." value={body} onChange={e=>setBody(e.target.value)} />

        {error && <div style={{ color:'#DC2626', fontSize:12, marginTop:6 }}>{error}</div>}
        {recording && <div style={{ color:'#DC2626', fontSize:13, marginTop:8, fontWeight:700 }}>● Recording… {transcript && <span style={{ color:'var(--muted)', fontWeight:400 }}>“{transcript}”</span>}</div>}
        {audioBlob && !recording && (
          <div style={{ marginTop:8 }}>
            <audio controls src={URL.createObjectURL(audioBlob)} style={{ width:'100%' }} />
          </div>
        )}

        <div style={{ display:'flex', gap:8, marginTop:10, justifyContent:'flex-end' }}>
          {!recording
            ? <Btn variant="secondary" onClick={start}>🎤 Record</Btn>
            : <Btn variant="secondary" onClick={stop}>■ Stop</Btn>}
          <Btn onClick={save} loading={saving}>Save note</Btn>
        </div>
      </div>

      {notes.map(n => (
        <div key={n.id} style={card}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ flex:1 }}>
              {n.title && <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{n.title}</div>}
              <div style={{ fontSize:11, color:'var(--muted)' }}>{new Date(n.created_at).toLocaleString()}</div>
            </div>
            <button onClick={()=>togglePin(n)} title="Pin" style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:15, opacity:n.pinned?1:0.4 }}>📌</button>
            <button onClick={()=>del(n)} title="Delete" style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'var(--muted)' }}>🗑</button>
          </div>
          {n.body && <div style={{ fontSize:14, color:'var(--text)', whiteSpace:'pre-wrap', marginTop:6 }}>{n.body}</div>}
          {(n.audio_path || n.audio_url) && (
            <div style={{ marginTop:8 }}>
              <SignedAudio path={n.audio_path} fallbackUrl={n.audio_url} />
              {n.transcript && n.transcript !== n.body && (
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:4, fontStyle:'italic' }}>Transcript: {n.transcript}</div>
              )}
            </div>
          )}
        </div>
      ))}
      {!notes.length && <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:20 }}>No notes yet.</div>}
    </div>
  )
}
