import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks/useAgents'
import { useTasks } from '../lib/hooks/useTasks'
import { getBriefingPrefs, upsertBriefingPrefs } from '../lib/db/briefingprefs'
import { buildDailyEmail, AGENT_EMAILS } from '../lib/dailyBriefing'
import { sendDailyBriefing } from '../lib/emailService'

const AGENT_COLORS = {
  'Lazer Farkas':'#CC2200','Mendy Jankovits':'#0EA5E9','Isaac Leibowitz':'#F5A623',
  'Yanky Lichtenstein':'#10B981','Gitty Fogel':'#7C3AED','Joel Rottenstein':'#E8650A',
  'Eli Hoffman':'#14B8A6','Avraham Weinberger':'#8B5CF6'
}

export function DailyBriefing() {
  const { agent, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const { tasks } = useTasks()
  const [prefs, setPrefs]     = useState({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState('')
  const [lastSent, setLastSent] = useState({})
  const saveTimer = useRef(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const loadedPrefs = {}
      for (const a of agents) {
        try {
          const p = await getBriefingPrefs(a.id)
          loadedPrefs[a.id] = p || { agent_id: a.id, enabled: true, sections: {} }
        } catch(e) {
          loadedPrefs[a.id] = { agent_id: a.id, enabled: true, sections: {} }
        }
      }
      setPrefs(loadedPrefs)
      setLoading(false)
    }
    if (agents.length > 0) load()
  }, [agents])

  async function toggleEnabled(agentId, enabled) {
    const updated = { ...prefs, [agentId]: { ...prefs[agentId], enabled } }
    setPrefs(updated)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await upsertBriefingPrefs({ ...(prefs[agentId]||{}), agent_id: agentId, enabled })
        toast('✅ Saved!', undefined, 1200)
      } catch(e) { toast('Save failed: '+e.message,'#DC2626') }
    }, 800)
  }

  async function sendTest(agentData) {
    const emailAddr = AGENT_EMAILS[agentData.name]
    if(!emailAddr) { toast('No email for '+agentData.name,'#DC2626'); return }
    setSending(agentData.id)
    const today = new Date().toISOString().split('T')[0]
    const agentTasks = tasks.filter(t=>t.agent_id===agentData.id&&t.status==='pending'&&t.due_date===today)
    const html = buildDailyEmail({ agentName:agentData.name, agentColor:agentData.color||'#CC2200', tasks:agentTasks, overdueTasks:[], appointments:[], showQuote:true })
    const result = await sendDailyBriefing({ agentName:agentData.name, email:emailAddr, html })
    setSending('')
    if(result.success) { setLastSent(p=>({...p,[agentData.id]:new Date().toLocaleTimeString()})); toast(`✅ Sent to ${emailAddr}!`) }
    else toast('Failed: '+(result.error||'Unknown error'),'#DC2626')
  }

  async function sendAll() {
    setSending('all')
    let sent=0
    for(const a of agents) {
      const p = prefs[a.id]
      if(!p?.enabled) continue
      await sendTest(a)
      sent++
      await new Promise(r=>setTimeout(r,300))
    }
    setSending('')
    toast(`✅ Sent ${sent} briefings!`)
  }

  const enabledCount = agents.filter(a=>prefs[a.id]?.enabled!==false).length

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>📧 Daily Briefing</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>{enabledCount} of {agents.length} agents receiving · 7AM ET daily</div>
        </div>
        {isAdmin&&<button onClick={sendAll} disabled={!!sending} style={btnStyle}>{sending==='all'?'Sending…':'📤 Send All Now'}</button>}
      </div>

      {loading && <div style={{ padding:'24px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden' }}>
        {agents.map(a=>{
          const agentPrefs = prefs[a.id]
          const enabled    = agentPrefs?.enabled !== false
          return (
            <div key={a.id} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:38,height:38,borderRadius:'10px',background:a.color||'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:800,color:'#fff',flexShrink:0 }}>
                {a.name?.[0]||'?'}
              </div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:'13px',fontWeight:700 }}>{a.name}</div>
                <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>
                  {AGENT_EMAILS[a.name]||a.email}
                  {lastSent[a.id]&&<span style={{ color:'#16A34A',fontWeight:600 }}> · ✓ Sent {lastSent[a.id]}</span>}
                </div>
              </div>
              <div style={{ display:'flex',gap:'8px',alignItems:'center',flexShrink:0 }}>
                {isAdmin&&<button onClick={()=>sendTest(a)} disabled={!!sending} style={{ fontSize:'11px',fontWeight:600,padding:'6px 12px',borderRadius:'8px',border:'1px solid var(--border)',background:'var(--dim)',color:'var(--text)',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:!!sending?.6:1 }}>
                  {sending===a.id?'Sending…':'Send Test'}
                </button>}
                {/* Toggle */}
                <div onClick={()=>toggleEnabled(a.id,!enabled)}
                  style={{ width:42,height:22,borderRadius:'99px',background:enabled?'#10B981':'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0 }}>
                  <div style={{ width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:enabled?22:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}/>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
