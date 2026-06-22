import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAgents } from '../lib/hooks'
import { getAuditLog } from '../lib/db'
import { getDaysAgo } from '../lib/utils'

const ACTION_COLORS = { INSERT:'#16A34A', UPDATE:'#0EA5E9', DELETE:'#DC2626', LOGIN:'#7C3AED', AUTOMATION_FIRED:'#D97706' }
const ACTION_ICONS  = { INSERT:'➕', UPDATE:'✏️', DELETE:'🗑', LOGIN:'🔐', AUTOMATION_FIRED:'⚡' }

export function ActivityLog() {
  const { agent, isAdmin } = useAuth()
  const { agents } = useAgents()
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [filterTable, setFT]    = useState('')
  const [filterAgent, setFA]    = useState('')

  useEffect(() => {
    if (!isAdmin) return // Only admins can see full audit log per RLS
    getAuditLog({ tableName: filterTable||undefined, agentId: filterAgent||undefined, limit:100 })
      .then(setLogs).catch(console.error).finally(()=>setLoading(false))
  }, [filterTable, filterAgent, isAdmin])

  const TABLES = [...new Set(logs.map(l=>l.table_name).filter(Boolean))]

  if (!isAdmin) return (
    <div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}>
      <div style={{ fontSize:'28px',marginBottom:'12px' }}>🔐</div>
      <div style={{ fontSize:'14px',fontWeight:700 }}>Admin Only</div>
      <div style={{ fontSize:'12px',marginTop:'6px' }}>The audit log is only visible to administrators</div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>📋 Audit Log</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>Every change, who made it, when</div>
        </div>
        <div style={{ display:'flex',gap:'7px' }}>
          <select value={filterTable} onChange={e=>setFT(e.target.value)}
            style={{ background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none' }}>
            <option value="">All Tables</option>
            {TABLES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterAgent} onChange={e=>setFA(e.target.value)}
            style={{ background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none' }}>
            <option value="">All Agents</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden' }}>
        {loading && <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'13px' }}>Loading...</div>}
        {!loading && logs.length===0 && <div style={{ padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'13px' }}>No activity yet</div>}
        {logs.map((log,i)=>{
          const agentName = log.agents?.name || agents.find(a=>a.id===log.agent_id)?.name || 'System'
          const agentColor = log.agents?.color || agents.find(a=>a.id===log.agent_id)?.color || '#94A3B8'
          const actionColor = ACTION_COLORS[log.action] || '#94A3B8'
          return (
            <div key={log.id} style={{ display:'flex',alignItems:'flex-start',gap:'12px',padding:'12px 16px',borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:32,height:32,borderRadius:'50%',background:agentColor+'18',border:`2px solid ${agentColor}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:800,color:agentColor,flexShrink:0 }}>
                {agentName?.[0]||'?'}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap' }}>
                  <span style={{ fontSize:'12px',fontWeight:700 }}>{agentName}</span>
                  <span style={{ fontSize:'11px',fontWeight:700,padding:'1px 7px',borderRadius:'20px',background:actionColor+'18',color:actionColor }}>{ACTION_ICONS[log.action]||'•'} {log.action}</span>
                  <span style={{ fontSize:'11px',color:'var(--muted)' }}>{log.table_name}</span>
                </div>
                {(log.field_name||log.old_value||log.new_value)&&(
                  <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'3px' }}>
                    {log.field_name&&<span style={{ fontWeight:600 }}>{log.field_name}: </span>}
                    {log.old_value&&<span style={{ color:'#DC2626',textDecoration:'line-through',marginRight:'4px' }}>{log.old_value?.slice(0,50)}</span>}
                    {log.new_value&&<span style={{ color:'#16A34A' }}>→ {log.new_value?.slice(0,50)}</span>}
                  </div>
                )}
              </div>
              <div style={{ fontSize:'10px',color:'var(--muted)',flexShrink:0,whiteSpace:'nowrap' }}>
                {getDaysAgo(log.created_at)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
