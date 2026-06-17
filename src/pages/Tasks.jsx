import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, StatCard, Grid4 } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'

export function Tasks() {
  const { state, toast, log } = useApp()
  const [tasks, setTasks] = useState([])
  const { confirm, ConfirmDialog } = useConfirm()
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('open')

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    const { data } = await supabase.from('tasks').select('*').order('created_at',{ascending:false})
    setTasks(data||[]); setLoading(false)
  }

  async function toggle(task) {
    const ns = task.status==='done' ? 'pending' : 'done'
    await supabase.from('tasks').update({status:ns}).eq('id',task.id)
    setTasks(prev => prev.map(t => t.id===task.id ? {...t,status:ns} : t))
    toast(ns==='done' ? 'Task completed!' : 'Task reopened')
    log({cat:'task',action:ns==='done'?'Completed':'Reopened',subject:task.title})
  }

  async function del(id) {
    const t = tasks.find(x=>x.id===id)
    confirm({
      title: 'Delete Task?',
      message: t ? '"'+t.title+'" will be permanently deleted.' : 'This task will be permanently deleted.',
      confirmLabel: 'Delete Task',
      onConfirm: async () => {
        await supabase.from('tasks').delete().eq('id',id)
        setTasks(prev => prev.filter(t => t.id!==id))
        toast('Task deleted')
      }
    })
  }

  const open   = tasks.filter(t => t.status !== 'done')
  const done   = tasks.filter(t => t.status === 'done')
  const urgent = tasks.filter(t => t.status !== 'done' && t.priority === 'urgent')
  const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date())

  const shown = filter==='open' ? open : filter==='done' ? done : filter==='urgent' ? urgent : overdue

  const pColors = {urgent:'#DC2626',high:'#D97706',normal:'var(--muted)',low:'#94A3B8'}

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Open"    value={open.length}    sub="Tasks to do"     subColor="var(--red)"/>
        <StatCard label="Urgent"  value={urgent.length}  sub="Needs attention" subColor="#DC2626"/>
        <StatCard label="Overdue" value={overdue.length} sub="Past due date"   subColor="#DC2626"/>
        <StatCard label="Done"    value={done.length}    sub="Completed"       subColor="var(--green)"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
        <div style={{display:'flex',gap:'4px',background:'var(--dim)',borderRadius:'8px',padding:'3px'}}>
          {[['open','Open'],['urgent','Urgent'],['overdue','Overdue'],['done','Done']].map(([k,l]) => (
            <button key={k} onClick={()=>setFilter(k)}
              style={{padding:'6px 14px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:filter===k?'var(--panel)':'transparent',color:filter===k?'var(--text)':'var(--muted)',boxShadow:filter===k?'0 1px 3px rgba(0,0,0,.08)':'none'}}>
              {l}
            </button>
          ))}
        </div>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ New Task</Btn>
      </div>

      <ConfirmDialog/>
      <Card>
        <CardHeader>{filter.charAt(0).toUpperCase()+filter.slice(1)} Tasks ({shown.length})</CardHeader>
        {loading ? (
          <div style={{padding:'20px',textAlign:'center',color:'var(--muted)'}}>Loading...</div>
        ) : shown.length === 0 ? (
          <div style={{padding:'36px',textAlign:'center',color:filter==='open'?'var(--green)':'var(--muted)',fontSize:'13px',fontWeight:600}}>
            {filter==='open' ? 'All tasks complete! 🎉' : 'No tasks here.'}
          </div>
        ) : shown.map(t => (
          <div key={t.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            {/* Checkbox */}
            <div onClick={()=>toggle(t)} style={{width:20,height:20,borderRadius:'6px',border:'2px solid '+(t.status==='done'?'#16A34A':'var(--border)'),background:t.status==='done'?'#16A34A':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,transition:'all .15s'}}>
              {t.status==='done' && <span style={{color:'#fff',fontSize:'11px',fontWeight:700}}>✓</span>}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:'13px',fontWeight:600,textDecoration:t.status==='done'?'line-through':'none',opacity:t.status==='done'?.5:1}}>{t.title}</div>
              <div style={{display:'flex',gap:'10px',marginTop:'3px'}}>
                {t.due_date && (
                  <span style={{fontSize:'10px',color:new Date(t.due_date)<new Date()&&t.status!=='done'?'#DC2626':'var(--muted)'}}>
                    Due {new Date(t.due_date).toLocaleDateString()}
                    {new Date(t.due_date)<new Date()&&t.status!=='done'?' · OVERDUE':''}
                  </span>
                )}
                <span style={{fontSize:'10px',color:pColors[t.priority]||'var(--muted)',fontWeight:600,textTransform:'capitalize'}}>{t.priority||'normal'}</span>
              </div>
              {t.description && <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'3px'}}>{t.description}</div>}
            </div>
            <button onClick={()=>del(t.id)} style={{background:'none',border:'none',fontSize:'14px',cursor:'pointer',color:'var(--muted)',padding:'4px',borderRadius:'6px',opacity:.6}}
              onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.6'}>🗑</button>
          </div>
        ))}
      </Card>

      {showAdd && <AddTaskModal onClose={()=>setShowAdd(false)} onSaved={t=>{setTasks(prev=>[t,...prev]);setShowAdd(false);toast('Task saved')}}/>}
    </div>
  )
}

function AddTaskModal({ onClose, onSaved }) {
  const { state } = useApp()
  const [form, setForm] = useState({title:'',description:'',due_date:'',priority:'normal'})
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    if(!form.title.trim()) return
    setSaving(true)
    const { data } = await supabase.from('tasks').insert([{...form, assigned_to:state.user?.id, created_by:state.user?.id, status:'pending'}]).select()
    setSaving(false)
    if(data?.[0]) onSaved(data[0])
  }

  return (
    <Modal onClose={onClose} maxWidth={420}>
      <ModalTitle onClose={onClose}>New Task</ModalTitle>
      <Input label="Title *" value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Call mortgage broker, schedule inspection..."/>
      <Input label="Description" value={form.description} onChange={e=>set('description',e.target.value)} rows={2} placeholder="Details..."/>
      <Grid2 gap={10}>
        <Input label="Due Date" value={form.due_date} onChange={e=>set('due_date',e.target.value)} type="date"/>
        <Select label="Priority" value={form.priority} onChange={e=>set('priority',e.target.value)} options={['normal','high','urgent','low']}/>
      </Grid2>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving?'Saving...':'Save Task'}</Btn>
      </div>
    </Modal>
  )
}
