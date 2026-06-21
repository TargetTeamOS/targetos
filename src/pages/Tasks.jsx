import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTasks } from '../lib/hooks/useTasks'
import { useApp } from '../context/AppContext'
import { fmtDate } from '../lib/utils/format'

const PRIORITIES = ['urgent','high','normal','low']
const PRIORITY_COLORS = { urgent:'#DC2626', high:'#D97706', normal:'#0EA5E9', low:'#94A3B8' }
const EMPTY_FORM = { title:'', priority:'normal', due_date:'', notes:'' }

export function Tasks({ highlightId }) {
  const { agent } = useAuth()
  const { toast } = useApp()
  const [filter, setFilter]   = useState('pending')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)

  const { tasks, loading, add, update, remove } = useTasks({
    agentId: agent?.id,
    status: filter === 'all' ? undefined : filter,
  })

  const today    = new Date().toISOString().split('T')[0]
  const overdue  = tasks.filter(t => t.status==='pending' && t.due_date && t.due_date < today)
  const todayT   = tasks.filter(t => t.status==='pending' && t.due_date === today)
  const upcoming = tasks.filter(t => t.status==='pending' && (!t.due_date || t.due_date > today))

  async function handleAdd() {
    if (!form.title.trim()) { toast('Title required', '#DC2626'); return }
    setSaving(true)
    try {
      await add({ ...form, agent_id: agent?.id, created_by: agent?.id, status:'pending' })
      toast('✅ Task added!')
      setForm(EMPTY_FORM)
      setShowAdd(false)
    } catch(e) { toast('Error: '+e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  async function toggleDone(task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done'
    try {
      await update(task.id, { status: newStatus, completed_at: newStatus==='done' ? new Date().toISOString() : null })
    } catch(e) { toast('Error: '+e.message, '#DC2626') }
  }

  async function handleDelete(id) {
    try { await remove(id); toast('Task deleted') }
    catch(e) { toast('Error: '+e.message, '#DC2626') }
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px', flexWrap:'wrap', gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px', fontWeight:900 }}>✓ Tasks</div>
          <div style={{ fontSize:'12px', color:'var(--muted)', marginTop:'2px' }}>
            {overdue.length > 0 && <span style={{ color:'#DC2626', fontWeight:700 }}>{overdue.length} overdue · </span>}
            {todayT.length} due today · {upcoming.length} upcoming
          </div>
        </div>
        <div style={{ display:'flex', gap:'7px' }}>
          <div style={{ display:'flex', background:'var(--dim)', borderRadius:'8px', padding:'3px', gap:'2px' }}>
            {[['pending','Open'],['done','Done'],['all','All']].map(([k,l])=>(
              <button key={k} onClick={()=>setFilter(k)}
                style={{ padding:'6px 12px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'11px', fontWeight:600, fontFamily:'Inter,system-ui,sans-serif',
                  background:filter===k?'var(--panel)':'transparent', color:filter===k?'var(--text)':'var(--muted)' }}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={()=>setShowAdd(s=>!s)}
            style={{ background:'#CC2200', border:'none', borderRadius:'8px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'8px 14px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
            + Add Task
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px', padding:'16px', marginBottom:'14px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'8px', marginBottom:'8px' }}>
            <input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Task title..." autoFocus
              onKeyDown={e=>e.key==='Enter'&&handleAdd()}
              style={{ background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'13px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 12px', outline:'none' }}/>
            <select value={form.priority} onChange={e=>set('priority',e.target.value)}
              style={{ background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 10px', outline:'none' }}>
              {PRIORITIES.map(p=><option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
            </select>
            <input type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)}
              style={{ background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'12px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 10px', outline:'none' }}/>
          </div>
          <div style={{ display:'flex', gap:'7px', justifyContent:'flex-end' }}>
            <button onClick={()=>setShowAdd(false)}
              style={{ background:'var(--dim)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--muted)', fontSize:'12px', padding:'8px 14px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif' }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={saving}
              style={{ background:'#CC2200', border:'none', borderRadius:'8px', color:'#fff', fontSize:'12px', fontWeight:700, padding:'8px 16px', cursor:'pointer', fontFamily:'Inter,system-ui,sans-serif', opacity:saving?.7:1 }}>
              {saving?'Adding…':'Add Task'}
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{ padding:'28px', textAlign:'center', color:'var(--muted)', fontSize:'13px' }}>Loading tasks...</div>}

      {/* Overdue */}
      {overdue.length > 0 && (
        <Section title={`⚠️ Overdue (${overdue.length})`} color="#DC2626">
          {overdue.map(t => <TaskRow key={t.id} task={t} today={today} onToggle={toggleDone} onDelete={handleDelete}/>)}
        </Section>
      )}

      {/* Today */}
      {todayT.length > 0 && (
        <Section title={`📅 Due Today (${todayT.length})`} color="#D97706">
          {todayT.map(t => <TaskRow key={t.id} task={t} today={today} onToggle={toggleDone} onDelete={handleDelete} highlight={t.id===highlightId}/>)}
        </Section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Section title={`📋 Upcoming (${upcoming.length})`} color="#0EA5E9">
          {upcoming.map(t => <TaskRow key={t.id} task={t} today={today} onToggle={toggleDone} onDelete={handleDelete}/>)}
        </Section>
      )}

      {/* Done */}
      {filter!=='pending' && tasks.filter(t=>t.status==='done').length > 0 && (
        <Section title="✅ Completed" color="#16A34A">
          {tasks.filter(t=>t.status==='done').map(t => <TaskRow key={t.id} task={t} today={today} onToggle={toggleDone} onDelete={handleDelete}/>)}
        </Section>
      )}

      {!loading && tasks.length === 0 && (
        <div style={{ padding:'48px', textAlign:'center', color:'var(--muted)', fontSize:'13px', background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'14px' }}>
          <div style={{ fontSize:'32px', marginBottom:'12px' }}>🎯</div>
          <div style={{ fontWeight:700, marginBottom:'4px' }}>No tasks yet</div>
          <div>Click "+ Add Task" to get started</div>
        </div>
      )}
    </div>
  )
}

function Section({ title, color, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom:'10px', border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden' }}>
      <div onClick={()=>setOpen(o=>!o)} style={{ padding:'10px 14px', background:'var(--dim)', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', borderLeft:`3px solid ${color}` }}>
        <span style={{ fontSize:'12px', fontWeight:700, color }}>{title}</span>
        <span style={{ color:'var(--muted)', fontSize:'12px' }}>{open?'▾':'▸'}</span>
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

function TaskRow({ task, today, onToggle, onDelete, highlight }) {
  const isOverdue = task.status==='pending' && task.due_date && task.due_date < today
  const isDone    = task.status === 'done'
  const pColor    = PRIORITY_COLORS[task.priority] || '#94A3B8'
  return (
    <div id={`task-${task.id}`} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'11px 14px', borderBottom:'1px solid var(--border)', background:highlight?'rgba(204,34,0,.03)':isDone?'rgba(0,0,0,.01)':'transparent' }}>
      {/* Checkbox */}
      <div onClick={()=>onToggle(task)}
        style={{ width:20, height:20, borderRadius:'6px', border:`2px solid ${isDone?'#16A34A':pColor}`, background:isDone?'#16A34A':'transparent',
          display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, transition:'all .15s' }}>
        {isDone && <span style={{ color:'#fff', fontSize:'12px', lineHeight:1 }}>✓</span>}
      </div>
      {/* Priority dot */}
      <div style={{ width:7, height:7, borderRadius:'2px', background:pColor, flexShrink:0 }}/>
      {/* Title */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'13px', fontWeight:500, color:isDone?'var(--muted)':'var(--text)', textDecoration:isDone?'line-through':'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {task.title}
        </div>
        {task.due_date && (
          <div style={{ fontSize:'10px', color:isOverdue?'#DC2626':'var(--muted)', fontWeight:isOverdue?700:400, marginTop:'2px' }}>
            {isOverdue ? '⚠️ Overdue · ' : ''}{fmtDate(task.due_date)}
          </div>
        )}
      </div>
      {/* Delete */}
      <button onClick={()=>onDelete(task.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:'13px', opacity:.4, padding:'2px 4px' }}
        onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>
        ✕
      </button>
    </div>
  )
}
