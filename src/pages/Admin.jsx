import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAgents } from '../lib/hooks/useAgents'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { updateAgent } from '../lib/db/agents'

const ROLES = ['agent','secretary','admin']
const ROLE_COLORS = { admin:'#CC2200', agent:'#0EA5E9', secretary:'#7C3AED' }

export function Admin() {
  const { agent: me, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents, loading, reload } = useAgents()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName]   = useState('')
  const [inviting, setInviting]       = useState(false)

  if (!isAdmin) return (
    <div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}>
      <div style={{ fontSize:'28px',marginBottom:'12px' }}>🔐</div>
      <div style={{ fontSize:'14px',fontWeight:700 }}>Admin Only</div>
    </div>
  )

  async function inviteAgent() {
    if(!inviteEmail.trim()||!inviteName.trim()) { toast('Name and email required','#DC2626'); return }
    setInviting(true)
    try {
      // Create auth user via admin API
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail)
      if(error) throw error
      // Create agent record
      await supabase.from('agents').insert([{ name:inviteName, email:inviteEmail, role:'agent', auth_user_id:data?.user?.id }])
      toast(`✅ Invite sent to ${inviteEmail}!`)
      setInviteEmail(''); setInviteName('')
      reload()
    } catch(e) {
      // Fallback: create agent record only (admin links manually)
      try {
        await supabase.from('agents').insert([{ name:inviteName, email:inviteEmail, role:'agent' }])
        toast(`Agent record created. Create auth user in Supabase → Auth → Users manually`)
        setInviteEmail(''); setInviteName('')
        reload()
      } catch(e2) { toast('Error: '+e.message,'#DC2626') }
    } finally { setInviting(false) }
  }

  async function updateRole(id, role) {
    try { await updateAgent(id, { role }); reload(); toast(`Role updated → ${role}`) }
    catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  async function toggleActive(id, active) {
    try { await updateAgent(id, { active: !active }); reload(); toast(active?'Agent deactivated':'Agent activated') }
    catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  return (
    <div>
      <div style={{ fontSize:'20px',fontWeight:900,marginBottom:'16px' }}>👑 Admin Panel</div>

      {/* Invite */}
      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',padding:'18px',marginBottom:'14px' }}>
        <div style={{ fontSize:'13px',fontWeight:700,marginBottom:'12px' }}>Invite New Agent</div>
        <div style={{ display:'flex',gap:'8px',flexWrap:'wrap' }}>
          <input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Full name"
            style={inp}/>
          <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="email@targetreteam.com" type="email"
            style={inp}/>
          <button onClick={inviteAgent} disabled={inviting}
            style={{ background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 18px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:inviting?.7:1,whiteSpace:'nowrap' }}>
            {inviting?'Inviting…':'Send Invite'}
          </button>
        </div>
        <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'8px' }}>
          After inviting, go to <strong>Supabase → Authentication → Users</strong> to link the auth user ID to the agent record.
        </div>
      </div>

      {/* Agent list */}
      <div style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px',overflow:'hidden' }}>
        <div style={{ padding:'13px 16px',borderBottom:'1px solid var(--border)',fontSize:'13px',fontWeight:700 }}>
          Agents ({agents.length})
        </div>
        {loading ? <div style={{ padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'13px' }}>Loading...</div>
        : agents.map(a=>(
          <div key={a.id} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'13px 16px',borderBottom:'1px solid var(--border)',opacity:a.active?1:.5 }}>
            <div style={{ width:38,height:38,borderRadius:'50%',background:a.color||'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:800,color:'#fff',flexShrink:0 }}>
              {a.name?.[0]||'?'}
            </div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:'13px',fontWeight:700 }}>{a.name}</div>
              <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>
                {a.email}
                {!a.auth_user_id&&<span style={{ color:'#DC2626',fontWeight:600 }}> · ⚠️ No auth login</span>}
              </div>
            </div>
            <div style={{ display:'flex',gap:'6px',alignItems:'center',flexShrink:0 }}>
              <select value={a.role} onChange={e=>updateRole(a.id,e.target.value)} disabled={a.id===me?.id}
                style={{ background:(ROLE_COLORS[a.role]||'#94A3B8')+'15',border:`1.5px solid ${(ROLE_COLORS[a.role]||'#94A3B8')}40`,borderRadius:'7px',color:ROLE_COLORS[a.role]||'#94A3B8',fontSize:'11px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'5px 8px',outline:'none',cursor:a.id===me?.id?'not-allowed':'pointer' }}>
                {ROLES.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
              </select>
              <button onClick={()=>toggleActive(a.id,a.active)} disabled={a.id===me?.id}
                style={{ background:a.active?'rgba(22,163,74,.08)':'rgba(220,38,38,.08)',border:`1px solid ${a.active?'rgba(22,163,74,.3)':'rgba(220,38,38,.3)'}`,borderRadius:'7px',color:a.active?'#16A34A':'#DC2626',fontSize:'11px',fontWeight:700,padding:'5px 10px',cursor:a.id===me?.id?'not-allowed':'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
                {a.active?'Active':'Inactive'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const inp = { flex:1,minWidth:'160px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none' }
