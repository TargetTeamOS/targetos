import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks'
import { useTasks } from '../lib/hooks'
import { sendEmail, buildDailyBriefingEmail } from '../lib/email'
import { fmtDate, today, isOverdue, isDueToday } from '../lib/utils'
import { PageHeader, Btn, Toggle, Loading, Avatar, Pill } from '../components/UI'

export function DailyBriefing() {
  const { agent, isAdmin } = useAuth()
  const { toast }          = useApp()
  const { agents }         = useAgents()
  const { tasks }          = useTasks()

  const [sending,    setSending]    = useState(false)
  const [sendAll,    setSendAll]    = useState(false)
  const [preview,    setPreview]    = useState(null)
  const [sentLog,    setSentLog]    = useState([])

  const todayStr = today()

  // Get tasks due today or overdue for an agent
  function agentTasks(agentId) {
    return tasks.filter(t =>
      t.agent_id === agentId &&
      t.status === 'pending' &&
      (isOverdue(t.due_date) || isDueToday(t.due_date))
    )
  }

  async function sendBriefing(targetAgent) {
    setSending(true)
    try {
      const agentTasks_ = agentTasks(targetAgent.id)
      const overdueCount = agentTasks_.filter(t => isOverdue(t.due_date)).length
      const html = buildDailyBriefingEmail({
        agentName:    targetAgent.name,
        agentColor:   targetAgent.color,
        tasks:        agentTasks_,
        overdueCount,
      })
      const result = await sendEmail({
        to:      targetAgent.email,
        subject: `📋 TargetOS Daily Briefing — ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}`,
        html,
      })
      if (result.success) {
        toast(`✅ Briefing sent to ${targetAgent.name}`)
        setSentLog(l => [...l, { name: targetAgent.name, at: new Date().toLocaleTimeString() }])
      } else {
        toast('Send failed: ' + result.error, '#DC2626')
      }
    } catch(e) {
      toast('Error: ' + e.message, '#DC2626')
    } finally {
      setSending(false)
    }
  }

  async function sendToAll() {
    setSending(true)
    for (const a of agents.filter(a => a.active)) {
      await sendBriefing(a)
    }
    setSending(false)
  }

  function showPreview(targetAgent) {
    const agentTasks_ = agentTasks(targetAgent.id)
    const overdueCount = agentTasks_.filter(t => isOverdue(t.due_date)).length
    const html = buildDailyBriefingEmail({ agentName: targetAgent.name, agentColor: targetAgent.color, tasks: agentTasks_, overdueCount })
    setPreview({ name: targetAgent.name, html })
  }

  return (
    <div>
      <PageHeader
        title="Daily Briefing"
        icon="📧"
        subtitle="Send personalized task summaries to each agent"
        actions={
          isAdmin && (
            <Btn onClick={sendToAll} disabled={sending} icon="📤">
              {sending ? 'Sending...' : 'Send to All Agents'}
            </Btn>
          )
        }
      />

      {/* Sent log */}
      {sentLog.length > 0 && (
        <div style={{ background:'rgba(22,163,74,.06)', border:'1px solid rgba(22,163,74,.2)', borderRadius:'10px', padding:'12px 16px', marginBottom:'14px' }}>
          <div style={{ fontSize:'12px', fontWeight:700, color:'#16A34A', marginBottom:'6px' }}>✅ Sent this session</div>
          {sentLog.map((s,i) => (
            <div key={i} style={{ fontSize:'12px', color:'var(--muted)' }}>{s.name} at {s.at}</div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}
          onClick={()=>setPreview(null)}>
          <div style={{ background:'var(--panel)', borderRadius:'16px', width:'100%', maxWidth:'680px', maxHeight:'85vh', overflow:'hidden', display:'flex', flexDirection:'column' }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:'14px', fontWeight:700 }}>Preview — {preview.name}</div>
              <button onClick={()=>setPreview(null)} style={{ background:'var(--dim)', border:'none', borderRadius:'50%', width:'28px', height:'28px', cursor:'pointer', fontSize:'14px' }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'0' }}>
              <iframe srcDoc={preview.html} style={{ width:'100%', height:'500px', border:'none' }} title="Email Preview"/>
            </div>
          </div>
        </div>
      )}

      {/* Agent list */}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        {agents.filter(a => a.active).map(a => {
          const at = agentTasks(a.id)
          const overdue = at.filter(t => isOverdue(t.due_date)).length
          return (
            <div key={a.id} style={{ background:'var(--panel)', border:'1px solid var(--border)', borderRadius:'12px', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
              <Avatar name={a.name} color={a.color} size={40}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:700 }}>{a.name}</div>
                <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'2px' }}>{a.email}</div>
                <div style={{ display:'flex', gap:'6px', marginTop:'5px', flexWrap:'wrap' }}>
                  <Pill label={`${at.length} task${at.length!==1?'s':''} due`} color="#0EA5E9" size="sm"/>
                  {overdue > 0 && <Pill label={`${overdue} overdue`} color="#DC2626" size="sm"/>}
                </div>
              </div>
              <div style={{ display:'flex', gap:'7px' }}>
                <Btn variant="secondary" size="sm" onClick={()=>showPreview(a)}>👁 Preview</Btn>
                <Btn size="sm" onClick={()=>sendBriefing(a)} disabled={sending}>📧 Send</Btn>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop:'16px', padding:'14px', background:'var(--dim)', borderRadius:'10px', fontSize:'12px', color:'var(--muted)', lineHeight:1.8 }}>
        <strong style={{ color:'var(--text)' }}>How it works:</strong><br/>
        Each agent receives a personalized email showing their tasks due today and overdue tasks.
        The email links directly to TargetOS so they can mark tasks complete.
        Best practice: send every morning at 8am.
      </div>
    </div>
  )
}
