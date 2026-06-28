// ═══════════════════════════════════════════════════════════════
// TargetOS V2 — Tasks Page
// Every task has its own URL. Full CRUD with priorities.
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useTasks, useAgents } from '../lib/hooks'
import { fmtDate, today, isOverdue, isDueToday, isDueSoon } from '../lib/utils'
import { TASK_PRIORITIES, TASK_STATUSES } from '../lib/constants'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import {
  PageHeader, Btn, Modal, Field, Input, Select, Textarea, Pill,
  SearchInput, Avatar, ModalActions, Loading, Empty, Tabs,
  SectionTitle, Confirm, Divider, Card
} from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const TASK_EXPORT_COLS = [
  { key:'title',    label:'Title',    example:'Follow up with client' },
  { key:'status',   label:'Status',   example:'pending' },
  { key:'priority', label:'Priority', example:'normal' },
  { key:'due_date', label:'Due Date', example:'2026-01-15', type:'date' },
  { key:'notes',    label:'Notes',    example:'' },
]

const BLANK = {
  title: '', priority: 'normal', status: 'pending', due_date: '',
  notes: '', agent_id: '', deal_id: '', contact_id: ''
}

export function Tasks() {
  const navigate = useNavigate()
  const { id: urlId } = useParams()
  const { agent, isAdmin, canManage } = useAuth()
  const { toast } = useApp()

  const filters = isAdmin || canManage ? {} : { agent_id: agent?.id }
  const { tasks, loading, add, update, complete, remove } = useTasks(filters)
  const { agents } = useAgents()

  const [search,      setSearch]      = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkDel,     setBulkDel]     = useState(false)
  const [statusF, setStatusF] = useState('pending')
  const [priorF,  setPriorF]  = useState('')
  const [agentF,  setAgentF]  = useState('')
  const [selected,setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(BLANK)
  const [saving,  setSaving]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (urlId && tasks.length > 0 && urlId !== 'new') {
      const t = tasks.find(x => x.id === urlId)
      if (t) openTask(t)
    }
    if (urlId === 'new') { setSelected(null); setForm({ ...BLANK, agent_id: agent?.id }); setShowAdd(true) }
  }, [urlId, tasks.length])

  function openTask(t) {
    navigate('/tasks/' + t.id, { replace: true })
    setSelected(t)
    setForm({ ...BLANK, ...t })
    setShowAdd(false)
  }

  function openAdd() {
    setSelected(null)
    setForm({ ...BLANK, agent_id: agent?.id, due_date: today() })
    setShowAdd(true)
    navigate('/tasks/new', { replace: true })
  }

  function closePanel() {
    setSelected(null)
    setShowAdd(false)
    navigate('/tasks', { replace: true })
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function saveTask() {
    if (!form.title.trim()) { toast('Task title is required', '#DC2626'); return }
    setSaving(true)
    try {
      if (selected) {
        const updated = await update(selected.id, form)
        setSelected(updated)
        toast('✅ Task saved')
      } else {
        await add({ ...form, agent_id: form.agent_id || agent?.id, created_by: agent?.id })
        toast('✅ Task added')
        closePanel()
      }
    } catch(e) {
      toast('Save failed: ' + e.message, '#DC2626')
    } finally { setSaving(false) }
  }

  async function markDone(task, e) {
    e.stopPropagation()
    try {
      await complete(task.id)
      toast('✅ Task completed')
      if (selected?.id === task.id) closePanel()
    } catch(e) {
      toast('Failed: ' + e.message, '#DC2626')
    }
  }

  async function deleteTask() {
    try {
      await remove(selected.id)
      toast('Task deleted')
      closePanel()
    } catch(e) {
      toast('Delete failed: ' + e.message, '#DC2626')
    } finally { setConfirmDelete(false) }
  }

  const filtered = tasks.filter(t => {
    if (statusF && t.status !== statusF) return false
    if (priorF  && t.priority !== priorF) return false
    if (agentF  && t.agent_id !== agentF) return false
    if (search  && !t.title?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const priorityColor = (p) => TASK_PRIORITIES.find(x => x.value === p)?.color || '#94A3B8'
  const statusColor   = (s) => TASK_STATUSES.find(x => x.value === s)?.color || '#94A3B8'

  // Group by priority
  const urgent = filtered.filter(t => t.priority === 'urgent' && t.status !== 'done')
  const high   = filtered.filter(t => t.priority === 'high'   && t.status !== 'done')
  const normal = filtered.filter(t => t.priority === 'normal' && t.status !== 'done')
  const low    = filtered.filter(t => t.priority === 'low'    && t.status !== 'done')
  const done   = filtered.filter(t => t.status === 'done')

  function TaskCard({ task }) {
    const overdue  = task.due_date && isOverdue(task.due_date) && task.status !== 'done'
    const dueToday = task.due_date && isDueToday(task.due_date)

    return (
      <div onClick={() => openTask(task)}
        style={{ background: 'var(--panel)', borderRadius: '10px', border: selected?.id === task.id ? '2px solid var(--brand)' : "1px solid " + (overdue ? '#FECACA' : 'var(--border)'), padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '10px', transition: 'box-shadow .12s', marginBottom: '6px' }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
        {/* Check button */}
        <button onClick={(e) => markDone(task, e)}
          style={{ width: 20, height: 20, borderRadius: '50%', border: "2px solid " + (priorityColor(task.priority)), background: task.status === 'done' ? priorityColor(task.priority) : 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#fff' }}>
          {task.status === 'done' ? '✓' : ''}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: task.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: task.status === 'done' ? 'line-through' : 'none', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </div>
          {task.due_date && (
            <div style={{ fontSize: '11px', color: overdue ? '#DC2626' : dueToday ? '#F97316' : 'var(--muted)', fontWeight: overdue || dueToday ? 600 : 400 }}>
              {overdue ? '⚠️ Overdue — ' : dueToday ? '📅 Today — ' : '📅 '}
              {fmtDate(task.due_date)}
            </div>
          )}
          {task.notes && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.notes}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
          <Pill label={task.priority} color={priorityColor(task.priority)} />
          {task.agents && <Avatar agent={task.agents} size={20} />}
        </div>
      </div>
    )
  }

  function Group({ title, tasks, color }) {
    if (!tasks.length) return null
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{title} ({tasks.length})</span>
        </div>
        {tasks.map(t => <TaskCard key={t.id} task={t} />)}
      </div>
    )
  }

  async function bulkDelete() {
    if (!selectedIds.length) return
    if (!window.confirm('Delete ' + selectedIds.length + ' task' + (selectedIds.length !== 1 ? 's' : '') + '?')) return
    setBulkDel(true)
    try {
      await supabase.from('tasks').delete().in('id', selectedIds)
      setSelectedIds([])
      toast('✅ Deleted ' + selectedIds.length + ' task' + (selectedIds.length !== 1 ? 's' : ''))
    } catch(e) { toast('Delete failed: ' + e.message, '#DC2626') }
    finally { setBulkDel(false) }
  }

  async function bulkComplete() {
    if (!selectedIds.length) return
    try {
      await supabase.from('tasks').update({ status: 'done', updated_at: new Date().toISOString() }).in('id', selectedIds)
      setSelectedIds([])
      toast("✅ Marked " + (selectedIds.length) + " tasks as done")
    } catch(e) { toast('Failed: ' + e.message, '#DC2626') }
  }

  return (
    <div style={{ fontFamily: ff }}>
      <PageHeader
        title="Tasks"
        sub={filtered.filter(t => t.status !== 'done').length + ' open · ' + done.length + ' done'}
        actions={<Btn onClick={openAdd}>+ Add Task</Btn>}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tasks..." style={{ flex: 1, minWidth: '200px' }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Statuses</option>
          {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={priorF} onChange={e => setPriorF(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
          <option value="">All Priorities</option>
          {TASK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {(isAdmin || canManage) && (
          <select value={agentF} onChange={e => setAgentF(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--inp)', color: 'var(--text)', fontSize: '13px', fontFamily: ff }}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* Selection bar */}
      {selectedIds.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:'#1B2B4B', borderRadius:'10px', marginBottom:'10px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', fontWeight:700, color:'#fff' }}>{selectedIds.length} task{selectedIds.length !== 1 ? 's' : ''} selected</span>
          <div style={{ flex:1 }} />
          <button onClick={bulkComplete}
            style={{ padding:'5px 12px', borderRadius:'6px', border:'1px solid rgba(16,185,129,.5)', background:'rgba(16,185,129,.2)', color:'#6EE7B7', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            ✅ Mark done
          </button>
          <button onClick={bulkDelete} disabled={bulkDel}
            style={{ padding:'5px 12px', borderRadius:'6px', border:'1px solid rgba(220,38,38,.5)', background:'rgba(220,38,38,.2)', color:'#FCA5A5', fontSize:'12px', fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            {bulkDel ? '⏳' : '🗑️'} Delete {selectedIds.length}
          </button>
          <button onClick={() => setSelectedIds([])}
            style={{ padding:'5px 10px', borderRadius:'6px', border:'1px solid rgba(255,255,255,.2)', background:'transparent', color:'rgba(255,255,255,.7)', fontSize:'12px', cursor:'pointer', fontFamily:ff }}>
            ✕ Clear
          </button>
        </div>
      )}

      {loading && <Loading />}
      {!loading && filtered.length === 0 && (
        <Empty icon="✅" title="No tasks" sub="Add your first task or create one via voice capture." action={<Btn onClick={openAdd}>+ Add Task</Btn>} />
      )}

      {!loading && filtered.length > 0 && (
        <div>
          <Group title="Urgent" tasks={urgent} color="#DC2626" />
          <Group title="High"   tasks={high}   color="#F97316" />
          <Group title="Normal" tasks={normal}  color="#3B82F6" />
          <Group title="Low"    tasks={low}     color="#94A3B8" />
          {done.length > 0 && statusF !== 'pending' && (
            <Group title="Completed" tasks={done} color="#10B981" />
          )}
        </div>
      )}

      {/* Task Detail Modal */}
      <Modal open={!!(selected || showAdd)} onClose={closePanel} title={selected ? 'Edit Task' : 'New Task'} width={500}>
        <Field label="Task Title" required>
          <Input value={form.title} onChange={v => set('title', v)} placeholder="What needs to be done?" />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Priority">
            <Select value={form.priority} onChange={v => set('priority', v)} options={TASK_PRIORITIES} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={v => set('status', v)} options={TASK_STATUSES} />
          </Field>
          <Field label="Due Date">
            <Input value={form.due_date} onChange={v => set('due_date', v)} type="date" />
          </Field>
          {(isAdmin || canManage) && (
            <Field label="Assigned To">
              <Select value={form.agent_id || ''} onChange={v => set('agent_id', v)} options={agents.map(a => ({ value: a.id, label: a.name }))} placeholder="Assign to agent" />
            </Field>
          )}
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={v => set('notes', v)} placeholder="Task details..." rows={3} />
        </Field>

        <ModalActions>
          {selected && (
            <Btn variant="ghost" style={{ marginRight: 'auto', color: '#DC2626' }} onClick={() => setConfirmDelete(true)}>Delete</Btn>
          )}
          {selected && selected.status !== 'done' && (
            <Btn variant="success" onClick={(e) => { markDone(selected, e); closePanel() }}>Mark Done</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveTask} loading={saving}>{selected ? 'Save' : 'Add Task'}</Btn>
        </ModalActions>
      </Modal>

      <Confirm
        open={confirmDelete}
        message="Delete this task? This cannot be undone."
        onConfirm={deleteTask}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
