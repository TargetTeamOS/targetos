// ═══════════════════════════════════════════════════════════════
// TCWorkQueueDrawer (July 2026)
// Right-side actionable work queue opened by a TC dashboard tile.
// Shows the tasks/deals behind a tile in a compact editable table:
// mark done, edit due date / responsible / priority / note inline,
// and Open File to expand the matching TC card.
// Uses ONLY existing tc_tasks / tc_deals / agents data. No new tables.
// ═══════════════════════════════════════════════════════════════
import React, { useState } from 'react'

const ff = 'Inter,system-ui,sans-serif'
const PRIORITY_COLOR = { urgent:'#DC2626', high:'#D97706', normal:'#2563EB', low:'#6B7280' }
const PRIORITIES = ['urgent','high','normal','low']

export default function TCWorkQueueDrawer({
  open, onClose, title, rows, agents = [], phases = [],
  onUpdateTask, onCompleteTask, onOpenFile, approxNote,
}) {
  const [agentF, setAgentF]    = useState('all')
  const [prioF, setPrioF]      = useState('all')
  const [stageF, setStageF]    = useState('all')

  const phaseLabel = id => (phases.find(p => p.id === id)?.label) || id || '—'
  const agentName  = id => (agents.find(a => a.id === id)?.name) || null

  const filtered = (rows || []).filter(r => {
    if (agentF !== 'all' && r.deal?.agent_id !== agentF) return false
    if (prioF !== 'all' && (r.task?.priority || 'normal') !== prioF) return false
    if (stageF !== 'all' && r.deal?.tc_phase !== stageF) return false
    return true
  })

  const th = { padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:800, color:'var(--muted)',
    textTransform:'uppercase', letterSpacing:'.04em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', position:'sticky', top:0, background:'var(--panel)' }
  const td = { padding:'6px 10px', fontSize:12.5, color:'var(--text)', borderBottom:'1px solid var(--border)', verticalAlign:'middle' }
  const miniInput = { padding:'3px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:12, fontFamily:ff }

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:5000,
        opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition:'opacity .2s' }} />
      {/* drawer */}
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'min(920px, 96vw)', background:'var(--panel)',
        zIndex:5001, boxShadow:'-8px 0 30px rgba(0,0,0,.2)', transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform .25s ease', display:'flex', flexDirection:'column', fontFamily:ff }}>

        {/* header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--text)' }}>{title}</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} {filtered.length === 1 ? 'item' : 'items'}{approxNote ? ' · ' + approxNote : ''}</div>
          </div>
          <button onClick={onClose} style={{ border:'none', background:'var(--dim)', color:'var(--text)', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        {/* filters */}
        <div style={{ padding:'10px 18px', borderBottom:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select value={agentF} onChange={e=>setAgentF(e.target.value)} style={miniInput}>
            <option value="all">All agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={prioF} onChange={e=>setPrioF(e.target.value)} style={miniInput}>
            <option value="all">All priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
          </select>
          <select value={stageF} onChange={e=>setStageF(e.target.value)} style={miniInput}>
            <option value="all">All stages</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {(agentF!=='all'||prioF!=='all'||stageF!=='all') && (
            <button onClick={()=>{setAgentF('all');setPrioF('all');setStageF('all')}} style={{ ...miniInput, cursor:'pointer', color:'var(--brand)' }}>Reset</button>
          )}
        </div>

        {/* table */}
        <div style={{ flex:1, overflow:'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Nothing here — all caught up 🎉</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width:34 }}></th>
                  <th style={th}>Property</th>
                  <th style={th}>Action needed</th>
                  <th style={th}>Stage</th>
                  <th style={th}>Responsible</th>
                  <th style={th}>Due</th>
                  <th style={th}>Priority</th>
                  <th style={{ ...th, textAlign:'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const task = r.task, deal = r.deal
                  const isTask = !!task
                  const overdueRow = isTask && task.due_date && task.due_date < new Date().toISOString().slice(0,10) && task.status !== 'done'
                  return (
                    <tr key={r.key} style={{ background: overdueRow ? 'rgba(220,38,38,.03)' : 'transparent' }}>
                      {/* done checkbox */}
                      <td style={td}>
                        {isTask && (
                          <input type="checkbox" checked={task.status === 'done'} title="Mark done"
                            onChange={()=>onCompleteTask?.(task)} style={{ width:16, height:16, cursor:'pointer', accentColor:'#0B7A45' }} />
                        )}
                      </td>
                      {/* property */}
                      <td style={{ ...td, fontWeight:700, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{deal?.addr || '—'}</td>
                      {/* action / task title (editable note tooltip) */}
                      <td style={{ ...td, maxWidth:220 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{isTask ? task.title : (r.actionLabel || '—')}</div>
                        {isTask && (
                          <input defaultValue={task.notes || ''} placeholder="+ note / next step"
                            onBlur={e => { if (e.target.value !== (task.notes || '')) onUpdateTask?.(task.id, { notes: e.target.value }) }}
                            style={{ ...miniInput, width:'100%', marginTop:3, fontSize:11, padding:'2px 6px' }} />
                        )}
                      </td>
                      {/* stage */}
                      <td style={{ ...td, whiteSpace:'nowrap', color:'var(--muted)' }}>{phaseLabel(deal?.tc_phase)}</td>
                      {/* responsible (editable) */}
                      <td style={td}>
                        {isTask ? (
                          <select value={task.agent_id || ''} onChange={e=>onUpdateTask?.(task.id, { agent_id: e.target.value || null })} style={{ ...miniInput, maxWidth:120 }}>
                            <option value="">Office</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>)}
                          </select>
                        ) : (agentName(deal?.agent_id) || '—')}
                      </td>
                      {/* due (editable) */}
                      <td style={td}>
                        {isTask ? (
                          <input type="date" value={task.due_date || ''} onChange={e=>onUpdateTask?.(task.id, { due_date: e.target.value || null })}
                            style={{ ...miniInput, color: overdueRow ? '#DC2626' : 'var(--text)', fontWeight: overdueRow ? 700 : 400 }} />
                        ) : (deal?.close_date ? 'Close ' + deal.close_date : '—')}
                      </td>
                      {/* priority (editable) */}
                      <td style={td}>
                        {isTask ? (
                          <select value={task.priority || 'normal'} onChange={e=>onUpdateTask?.(task.id, { priority: e.target.value })}
                            style={{ ...miniInput, color: PRIORITY_COLOR[task.priority] || 'var(--text)', fontWeight:700 }}>
                            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                          </select>
                        ) : '—'}
                      </td>
                      {/* open file */}
                      <td style={{ ...td, textAlign:'right', whiteSpace:'nowrap' }}>
                        <button onClick={()=>{ onOpenFile?.(deal?.id); onClose?.() }}
                          style={{ border:'1px solid var(--border)', background:'transparent', color:'var(--brand)', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:ff }}>Open →</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
