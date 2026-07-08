// TargetOS V2 — Admin Page
// Full user management: add, edit, deactivate, reactivate, reset password
// Admin only.

import React, { useState } from 'react'
import { useAuth }  from '../context/AuthContext'
import { useApp }   from '../context/AppContext'
import { useAgents } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { db }       from '../lib/db'
import {
  PageHeader, Field, Input, Select, Btn, Avatar, Modal, ModalActions,
  SectionTitle, Pill, Tabs, Toggle, Confirm, Loading
} from '../components/UI'

// Shared helper — every admin-users call needs the current session's
// access token now that the endpoint actually checks auth (July 2026).
async function callAdminUsers(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch('/api/admin-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
    },
    body: JSON.stringify(payload),
  })
}

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const ROLES  = ['admin','secretary','agent']
const COLORS = ['#CC2200','#0EA5E9','#10B981','#F5A623','#8B5CF6','#EC4899','#14B8A6','#E8650A','#6366F1','#84CC16']
const BLANK  = { name:'', email:'', phone:'', color:'#CC2200', role:'agent', active:true }

export function Admin() {
  const { agent: me, isAdmin } = useAuth()
  const { toast, setCustom, resetCustom, state, setTheme } = useApp()
  const { agents, loading, refetch } = useAgents()

  const [tab,       setTab]       = useState('team')
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)
  const [showAdd,   setShowAdd]   = useState(false)
  const [addForm,   setAddForm]   = useState({ name:'', email:'', phone:'', role:'agent', color:'#CC2200', password:'', sendInvite:true })
  const [adding,    setAdding]    = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmDelType, setConfirmDelType] = useState('deactivate') // 'deactivate' | 'delete'
  const [resetPwd,   setResetPwd]   = useState(null)
  const [newPwd,     setNewPwd]     = useState('')
  const [resetting,  setResetting]  = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const custom = state?.custom || {}
  const [permOverrides, setPermOverrides] = React.useState({})
  const [permLoaded, setPermLoaded] = React.useState(false)
  const [savingPerms, setSavingPerms] = React.useState(false)

  React.useEffect(() => {
    if (tab === 'permissions' && !permLoaded) {
      loadPermissionOverrides().then(ov => { setPermOverrides(ov || {}); setPermLoaded(true) })
    }
  }, [tab, permLoaded])

  async function handleSavePerms() {
    setSavingPerms(true)
    try {
      await savePermissionOverrides(permOverrides)
      toast('✅ Permissions saved')
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSavingPerms(false) }
  }

  function setPerm(key, role, value) {
    setPermOverrides(prev => ({
      ...prev,
      [key]: { ...(prev[key] || DEFAULT_PERMISSIONS[key] || {}), [role]: value }
    }))
  }

  if (!isAdmin) return (
    <div style={{fontFamily:ff}}>
      <PageHeader title="Admin" />
      <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:40,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:12}}>🔒</div>
        <div style={{fontWeight:700,fontSize:16,color:'var(--text)'}}>Admin Access Only</div>
      </div>
    </div>
  )

  function set(k,v)    { setForm(f => ({...f,[k]:v})) }
  function setA(k,v)   { setAddForm(f => ({...f,[k]:v})) }
  function openAgent(a){ setSelected(a); setForm({...BLANK,...a}) }
  function closePanel(){ setSelected(null) }

  // ── Save edits to existing agent ──────────────────────────────
  async function saveAgent() {
    if (!form.name.trim() || !form.email.trim()) { toast('Name and email required','#DC2626'); return }
    setSaving(true)
    try {
      // Use API endpoint which uses service key (bypasses RLS)
      const res = await callAdminUsers({
        action:  'update_agent',
        agentId: selected.id,
        updates: {
          name:                form.name.trim(),
          email:               form.email.trim().toLowerCase(),
          phone:               form.phone || null,
          role:                form.role,
          color:               form.color,
          can_hear_recordings: !!form.can_hear_recordings,
          auth_user_id:        selected.auth_user_id || null,
        },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Save failed (' + res.status + ')')

      await refetch()
      toast('✅ ' + form.name + ' saved')
      closePanel()
    } catch(e) {
      // Fallback: try direct update (works if RLS allows it)
      try {
        const { error } = await supabase.from('agents').update({
          name:  form.name.trim(),
          email: form.email.trim(),
          phone: form.phone || null,
          role:  form.role,
          color: form.color,
          updated_at: new Date().toISOString(),
        }).eq('id', selected.id)
        if (error) throw error
        await refetch()
        toast('✅ ' + form.name + ' saved')
        closePanel()
      } catch(e2) {
        toast('❌ Save failed: ' + e2.message + ' — Check SUPABASE_SERVICE_KEY in Vercel env vars', '#DC2626')
      }
    }
    finally { setSaving(false) }
  }

  // ── Add new user ───────────────────────────────────────────────
  async function addUser() {
    if (!addForm.name.trim() || !addForm.email.trim()) { toast('Name and email required', '#DC2626'); return }
    setAdding(true)
    try {
      const res = await callAdminUsers({
        action:   addForm.sendInvite ? 'invite' : 'create',
        name:     addForm.name.trim(),
        email:    addForm.email.trim().toLowerCase(),
        phone:    addForm.phone || null,
        role:     addForm.role,
        color:    addForm.color,
        password: addForm.password || 'TargetOS2024!',
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        // If service key not set, fall back to agent-only creation
        if (data.error?.includes('SUPABASE_SERVICE_KEY')) {
          await createAgentOnly()
          return
        }
        throw new Error(data.error || 'Server error ' + res.status)
      }

      await refetch()
      const msg = data.message || (data.existed
        ? '✅ ' + addForm.name + ' linked to existing account'
        : addForm.sendInvite
          ? '📧 Invite sent to ' + addForm.email
          : '✅ ' + addForm.name + ' created')
      toast(msg)
      setShowAdd(false)
      setAddForm({ name:'', email:'', phone:'', role:'agent', color:'#CC2200', password:'', sendInvite:true })
    } catch(e) {
      // Fallback: create agent record without auth
      if (e.message?.toLowerCase().includes('fetch') || e.message?.toLowerCase().includes('network')) {
        await createAgentOnly()
      } else {
        toast('❌ ' + e.message, '#DC2626')
      }
    } finally { setAdding(false) }
  }

  async function createAgentOnly() {
    const { error } = await supabase.from('agents').insert({
      name:  addForm.name.trim(),
      email: addForm.email.trim().toLowerCase(),
      phone: addForm.phone || null,
      role:  addForm.role,
      color: addForm.color,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (error) { toast('❌ ' + error.message, '#DC2626'); return }
    await refetch()
    toast('✅ ' + addForm.name + ' added. To set up their login, add SUPABASE_SERVICE_KEY to Vercel.')
    setShowAdd(false)
    setAddForm({ name:'', email:'', phone:'', role:'agent', color:'#CC2200', password:'', sendInvite:true })
  }

  // ── Deactivate user ───────────────────────────────────────────
  async function deactivateUser(a) {
    try {
      // Always update agents table first — this is the source of truth
      const { error } = await supabase.from('agents')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', a.id)
      if (error) throw error

      // Also ban from Supabase Auth if they have a login (non-fatal)
      if (a.auth_user_id) {
        callAdminUsers({ action: 'deactivate', userId: a.auth_user_id }).catch(() => {})
      }

      await refetch()
      toast('✅ ' + a.name + ' deactivated')
    } catch(e) { toast('❌ ' + e.message, '#DC2626') }
    finally { setConfirmDel(null) }
  }

  // ── Reactivate user ───────────────────────────────────────────
  async function reactivateUser(a) {
    try {
      const { error } = await supabase.from('agents')
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq('id', a.id)
      if (error) throw error

      if (a.auth_user_id) {
        callAdminUsers({ action: 'reactivate', userId: a.auth_user_id }).catch(() => {})
      }

      await refetch()
      toast('✅ ' + a.name + ' reactivated')
    } catch(e) { toast('❌ ' + e.message, '#DC2626') }
  }

  // ── Permanently delete user ───────────────────────────────────
  async function permanentlyDeleteUser(a) {
    try {
      // Delete agent record first
      const { error } = await supabase.from('agents').delete().eq('id', a.id)
      if (error) throw error

      // Delete from Supabase Auth too (non-fatal)
      if (a.auth_user_id) {
        callAdminUsers({ action: 'delete', userId: a.auth_user_id }).catch(() => {})
      }

      await refetch()
      toast('✅ ' + a.name + ' permanently deleted')
    } catch(e) { toast('❌ ' + e.message, '#DC2626') }
    finally { setConfirmDel(null) }
  }

  // ── Reset password ────────────────────────────────────────────
  async function resetPassword() {
    if (!newPwd || newPwd.length < 8) { toast('Password must be at least 8 characters','#DC2626'); return }
    if (!resetPwd?.auth_user_id) { toast('This user has no auth account yet','#DC2626'); return }
    setResetting(true)
    try {
      const res = await callAdminUsers({ action:'reset_password', userId: resetPwd.auth_user_id, password: newPwd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('Password reset for '+resetPwd.name)
      setResetPwd(null)
      setNewPwd('')
    } catch(e) { toast('Failed: '+e.message,'#DC2626') }
    finally { setResetting(false) }
  }

  const activeAgents   = agents.filter(a => a.active)
  const inactiveAgents = agents.filter(a => !a.active)
  const byRole = {
    admin:     activeAgents.filter(a => a.role==='admin'),
    secretary: activeAgents.filter(a => a.role==='secretary'),
    agent:     activeAgents.filter(a => a.role==='agent'),
  }

  const roleColor = r => r==='admin'?'#CC2200':r==='secretary'?'#8B5CF6':'#10B981'

  return (
    <div style={{fontFamily:ff}}>
      <PageHeader title="Admin" sub="Team management and system settings" />

      <Tabs tabs={[
        { id:'team',        label:'Team' },
        { id:'permissions', label:'Permissions' },
        { id:'customize',   label:'Customize' },
        { id:'rules',       label:'Data Rules' },
        { id:'system',      label:'System' },
      ]} active={tab} onChange={setTab} />

      {/* ── TEAM TAB ── */}
      {tab==='team' && (
        <div>
          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
            {[
              { label:'Active Users',    value:activeAgents.length,        color:'#10B981' },
              { label:'Agents',          value:byRole.agent.length,        color:'#CC2200' },
              { label:'Admins',          value:byRole.admin.length,        color:'#F5A623' },
              { label:'With Login',      value:agents.filter(a=>a.auth_user_id).length, color:'#3B82F6' },
            ].map(s => (
              <div key={s.label} style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:'14px 16px',borderLeft:'3px solid '+s.color}}>
                <div style={{fontSize:24,fontWeight:900,color:s.color}}>{s.value}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Add user button */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Team Members</div>
              <div style={{fontSize:11,color:'var(--muted)',marginTop:1}}>Unlimited users — add as many agents, secretaries, and admins as needed</div>
            </div>
            <Btn onClick={() => setShowAdd(true)}>+ Add User</Btn>
          </div>

          {loading && <Loading />}

          {/* Active users */}
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
            {activeAgents.map(a => (
              <div key={a.id}
                style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:'12px 16px',display:'flex',alignItems:'center',gap:12,transition:'box-shadow .12s',cursor:'pointer'}}
                onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-md)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
                {/* Avatar */}
                <div onClick={() => openAgent(a)} style={{display:'flex',alignItems:'center',gap:12,flex:1}}>
                  <Avatar agent={a} size={40} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:'var(--text)'}}>{a.name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{a.email}{a.phone ? ' · '+a.phone : ''}</div>
                  </div>
                  <Pill label={a.role} color={roleColor(a.role)} />
                  <div style={{fontSize:11,color:a.auth_user_id?'#10B981':'#F5A623',fontWeight:600,minWidth:70,textAlign:'right'}}>
                    {a.auth_user_id ? '✓ Has login' : '⚠ No login'}
                  </div>
                </div>
                {/* Actions */}
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={() => { setResetPwd(a); setNewPwd('') }}
                    style={{padding:'4px 9px',borderRadius:6,border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:ff}}>
                    Reset pwd
                  </button>
                  <button onClick={() => openAgent(a)}
                    style={{padding:'4px 9px',borderRadius:6,border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',fontSize:11,cursor:'pointer',fontFamily:ff}}>
                    Edit
                  </button>
                  {a.id !== me?.id && (
                    <button onClick={() => setConfirmDel(a)}
                      style={{padding:'4px 9px',borderRadius:6,border:'1px solid #DC262444',background:'#FEF2F2',color:'#DC2626',fontSize:11,cursor:'pointer',fontFamily:ff}}>
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Inactive users toggle */}
          {inactiveAgents.length > 0 && (
            <div>
              <button onClick={() => setShowInactive(s=>!s)}
                style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--muted)',fontFamily:ff,display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
                {showInactive ? '▾' : '▸'} Inactive users ({inactiveAgents.length})
              </button>
              {showInactive && inactiveAgents.map(a => (
                <div key={a.id} style={{background:'var(--dim)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:'10px 16px',display:'flex',alignItems:'center',gap:12,marginBottom:6,opacity:.7}}>
                  <Avatar agent={a} size={34} />
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--muted)'}}>{a.name}</div>
                    <div style={{fontSize:11,color:'var(--muted)'}}>{a.email}</div>
                  </div>
                  <Pill label="Inactive" color="#94A3B8" />
                  <button onClick={() => reactivateUser(a)}
                    style={{padding:'4px 10px',borderRadius:6,border:'1px solid #10B98144',background:'#10B98111',color:'#10B981',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:ff}}>
                    Reactivate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CUSTOMIZE TAB ── */}
      {tab==='customize' && (
        <div>
          {/* Brand Colors */}
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:14}}>Brand Colors</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:14}}>
              {[
                {key:'brandColor',  label:'Primary Brand Color',    hint:'Main action color, buttons, links'},
                {key:'brandColor2', label:'Secondary Brand Color',  hint:'Hover states, gradients'},
                {key:'sidebarColor',label:'Sidebar Background',     hint:'Left navigation panel'},
                {key:'accentColor', label:'Accent / Gold Color',    hint:'Highlights, badges, gold accents'},
              ].map(item => (
                <div key={item.key}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{item.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)',marginBottom:6}}>{item.hint}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <input type="color" value={custom[item.key]||'#CC2200'}
                      onChange={e => setCustom({[item.key]: e.target.value})}
                      style={{width:40,height:36,borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',padding:2,background:'var(--inp)'}}/>
                    <input value={custom[item.key]||''} onChange={e => setCustom({[item.key]: e.target.value})}
                      placeholder="#CC2200"
                      style={{flex:1,padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:12,fontFamily:ff}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:14}}>Theme</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {[
                {id:'light', label:'Light',  bg:'#F0F2F5', panel:'#fff',    text:'#0F172A'},
                {id:'dark',  label:'Dark',   bg:'#0F1A2E', panel:'#1A2744', text:'#F1F5F9'},
                {id:'slate', label:'Slate',  bg:'#1E1E2E', panel:'#2A2A3C', text:'#CDD6F4'},
              ].map(t => (
                <div key={t.id} onClick={() => setTheme(t.id)}
                  style={{cursor:'pointer',borderRadius:10,border:'2px solid '+(state.theme===t.id ? 'var(--brand)' : 'var(--border)'),overflow:'hidden',width:110,flexShrink:0}}>
                  <div style={{background:t.bg,padding:'10px 10px 6px',display:'flex',gap:3,marginBottom:4}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:'#DC2626'}}/>
                    <div style={{width:8,height:8,borderRadius:'50%',background:'#F5A623'}}/>
                    <div style={{width:8,height:8,borderRadius:'50%',background:'#10B981'}}/>
                  </div>
                  <div style={{background:t.bg,padding:'0 10px 10px',display:'flex',gap:6}}>
                    <div style={{width:20,background:t.panel,borderRadius:4,height:30}}/>
                    <div style={{flex:1}}>
                      <div style={{height:4,background:t.text,borderRadius:2,marginBottom:3,opacity:.7}}/>
                      <div style={{height:3,background:t.text,borderRadius:2,width:'70%',opacity:.4}}/>
                    </div>
                  </div>
                  <div style={{background:t.panel,padding:'6px 10px',fontSize:11,fontWeight:700,color:t.text,textAlign:'center',borderTop:'1px solid rgba(128,128,128,.15)'}}>
                    {t.label}{state.theme===t.id ? ' ✓' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:14}}>Typography</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Font Family</div>
                <select value={custom.fontFamily||'Inter'} onChange={e => setCustom({fontFamily: e.target.value})}
                  style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff}}>
                  {['Inter','Roboto','Poppins','DM Sans','Nunito','System'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Base Font Size</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="range" min={11} max={16} value={parseInt(custom.fontSize)||13}
                    onChange={e => setCustom({fontSize: e.target.value})}
                    style={{flex:1,accentColor:'var(--brand)'}}/>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text)',minWidth:30,textAlign:'right'}}>{custom.fontSize||13}px</div>
                </div>
              </div>
            </div>
          </div>

          {/* Layout */}
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:14}}>Layout</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Border Radius</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="range" min={0} max={20} value={parseInt(custom.borderRadius)||12}
                    onChange={e => setCustom({borderRadius: e.target.value})}
                    style={{flex:1,accentColor:'var(--brand)'}}/>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text)',minWidth:30,textAlign:'right'}}>{custom.borderRadius||12}px</div>
                </div>
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  {[0,6,12,18].map(r => (
                    <div key={r} onClick={() => setCustom({borderRadius: String(r)})}
                      style={{width:32,height:24,border:'2px solid '+(parseInt(custom.borderRadius)===r?'var(--brand)':'var(--border)'),borderRadius:r+'px',cursor:'pointer',background:'var(--dim)'}}/>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Sidebar Width</div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="range" min={180} max={280} step={10} value={parseInt(custom.sidebarWidth)||220}
                    onChange={e => setCustom({sidebarWidth: e.target.value})}
                    style={{flex:1,accentColor:'var(--brand)'}}/>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text)',minWidth:36,textAlign:'right'}}>{custom.sidebarWidth||220}px</div>
                </div>
              </div>
            </div>
            <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10}}>
              <input type="checkbox" checked={!!custom.compactMode} onChange={e => setCustom({compactMode: e.target.checked})}
                style={{width:16,height:16,accentColor:'var(--brand)',cursor:'pointer'}}/>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Compact Mode</div>
                <div style={{fontSize:11,color:'var(--muted)'}}>Reduce padding and spacing throughout the app</div>
              </div>
            </div>
          </div>

          {/* Organization */}
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:14}}>Organization Branding</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Team Name</div>
                <input value={custom.orgName||''} onChange={e => setCustom({orgName: e.target.value})}
                  placeholder="Target Team"
                  style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,boxSizing:'border-box'}}/>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Subtitle / Brokerage</div>
                <input value={custom.orgSubtitle||''} onChange={e => setCustom({orgSubtitle: e.target.value})}
                  placeholder="KW Valley Realty"
                  style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,boxSizing:'border-box'}}/>
              </div>
            </div>
            <div style={{marginTop:12}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Logo URL (optional)</div>
              <input value={custom.logoUrl||''} onChange={e => setCustom({logoUrl: e.target.value})}
                placeholder="https://yourdomain.com/logo.png"
                style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--inp)',color:'var(--text)',fontSize:13,fontFamily:ff,boxSizing:'border-box'}}/>
              {custom.logoUrl && (
                <img src={custom.logoUrl} alt="Logo preview"
                  style={{marginTop:8,height:40,borderRadius:6,border:'1px solid var(--border)'}}
                  onError={e => { e.target.style.display='none' }}/>
              )}
            </div>
          </div>

          {/* Live Preview */}
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:12}}>Live Preview</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <div style={{padding:'8px 16px',borderRadius:'var(--radius)',background:'var(--brand)',color:'#fff',fontSize:13,fontWeight:700}}>Primary Button</div>
              <div style={{padding:'8px 16px',borderRadius:'var(--radius)',background:'var(--dim)',color:'var(--text)',fontSize:13,fontWeight:600,border:'1px solid var(--border)'}}>Secondary</div>
              <div style={{padding:'3px 10px',borderRadius:99,background:'var(--brand)18',color:'var(--brand)',fontSize:11,fontWeight:700}}>Pill Badge</div>
              <div style={{padding:'3px 10px',borderRadius:99,background:'var(--gold)18',color:'var(--gold)',fontSize:11,fontWeight:700}}>Gold Badge</div>
              <div style={{width:36,height:36,borderRadius:'var(--radius-sm)',background:'var(--sidebar)',border:'1px solid var(--border)'}}/>
            </div>
          </div>

          {/* Reset */}
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button onClick={() => { if(window.confirm('Reset all customization to defaults?')) resetCustom() }}
              style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:ff}}>
              Reset to Defaults
            </button>
          </div>
        </div>
      )}

      {/* ── DATA RULES TAB ── */}
      {tab==='permissions' && (
        <div>
          <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:20,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:800,color:'var(--text)',marginBottom:8}}>Permission Matrix</div>
            <div style={{fontSize:12,color:'var(--muted)',marginBottom:16,lineHeight:1.6}}>
              Control exactly what each role can do. Changes take effect immediately after saving.
              Admin permissions cannot be reduced.
            </div>
            {/* Header */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 80px 100px 80px',gap:8,padding:'8px 12px',background:'var(--dim)',borderRadius:8,marginBottom:8,fontSize:10,fontWeight:800,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em'}}>
              <div>Permission</div>
              <div style={{textAlign:'center'}}>Admin</div>
              <div style={{textAlign:'center'}}>Secretary</div>
              <div style={{textAlign:'center'}}>Agent</div>
            </div>
            {PERMISSION_GROUPS.map(group => (
              <div key={group.id} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.06em',padding:'8px 0 4px',borderBottom:'1px solid var(--border)',marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
                  <span>{group.icon}</span>{group.label}
                </div>
                {group.keys.map(key => {
                  const def = DEFAULT_PERMISSIONS[key] || {}
                  const ov  = permOverrides[key] || {}
                  const cur = { admin: ov.admin??def.admin, secretary: ov.secretary??def.secretary, agent: ov.agent??def.agent }
                  return (
                    <div key={key} style={{display:'grid',gridTemplateColumns:'1fr 80px 100px 80px',gap:8,padding:'7px 12px',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
                      <div style={{fontSize:12,color:'var(--text)'}}>{PERMISSION_LABELS[key]||key}</div>
                      {['admin','secretary','agent'].map(role => {
                        const locked = role === 'admin' // admin always has all perms
                        const val = cur[role]
                        return (
                          <div key={role} style={{textAlign:'center'}}>
                            <label style={{cursor:locked?'not-allowed':'pointer',opacity:locked?.5:1}}>
                              <input type="checkbox" checked={locked?true:!!val} disabled={locked}
                                onChange={e => !locked && setPerm(key, role, e.target.checked)}
                                style={{width:16,height:16,accentColor:'var(--brand)',cursor:locked?'not-allowed':'pointer'}} />
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
            <div style={{marginTop:16,display:'flex',gap:10,alignItems:'center'}}>
              <Btn onClick={handleSavePerms} loading={savingPerms}>Save Permissions</Btn>
              <button onClick={() => { setPermOverrides({}); toast('Reset to defaults') }}
                style={{padding:'8px 16px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--muted)',fontSize:12,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                Reset to Defaults
              </button>
            </div>
          </div>
          {/* SQL note */}
          <div style={{padding:'10px 14px',background:'rgba(245,166,35,.08)',border:'1px solid rgba(245,166,35,.3)',borderRadius:8,fontSize:11,color:'#D97706'}}>
            💡 <strong>SQL required:</strong> Run in Supabase SQL Editor to enable permission saving:
            <code style={{display:'block',marginTop:6,fontFamily:'monospace',background:'rgba(0,0,0,.06)',padding:'4px 8px',borderRadius:4}}>
              create table if not exists system_settings (id uuid primary key default gen_random_uuid(), key text unique not null, value jsonb, updated_at timestamptz default now());
            </code>
          </div>
        </div>
      )}

      {tab==='rules' && (
        <div style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:24}}>
          <SectionTitle>Data Rules</SectionTitle>
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            {[
              { label:'Agents can see each other\'s contacts',  desc:'Currently: Admins and secretaries only.' },
              { label:'Agents can delete contacts',             desc:'Currently: No — only admins can delete records.' },
              { label:'Agents can export data',                 desc:'Currently: Disabled — export requires admin approval.' },
              { label:'Show GCI to all agents',                 desc:'Currently: All agents can see team GCI on dashboard.' },
              { label:'Auto-log all activity',                  desc:'Currently: Enabled — every create/update/delete is logged.' },
            ].map((rule,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0',borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{rule.label}</div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{rule.desc}</div>
                </div>
                <Pill label="Configured" color="#10B981" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SYSTEM TAB ── */}
      {tab==='system' && (
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {[
            { label:'Database',       status:'✅ Connected',       detail:'Supabase Postgres — sgrnyvdsyahmypibjarx', color:'#10B981' },
            { label:'Authentication', status:'✅ Active',          detail:'Supabase Auth — per-agent login with RLS', color:'#10B981' },
            { label:'Phone System',   status:'✅ Twilio Active',   detail:'+1 (845) 327-1778 — inbound/outbound calls', color:'#10B981' },
            { label:'Hosting',        status:'✅ Live',            detail:'Vercel — app.targetreteam.com', color:'#10B981' },
            { label:'Google Maps',    status:'✅ Active',          detail:'Address autocomplete + route planning', color:'#10B981' },
            { label:'AI Assistant',   status:'✅ Active',          detail:'Claude Sonnet — CRM assistant (bottom right)', color:'#10B981' },
            { label:'File Storage',   status:'⚠️ Setup Required', detail:'Create "targetos-files" bucket in Supabase Storage', color:'#F97316' },
            { label:'Error Tracking', status:'⚠️ Setup Required', detail:'Add VITE_SENTRY_DSN to Vercel env vars', color:'#F97316' },
          ].map(item => (
            <div key={item.label} style={{background:'var(--panel)',borderRadius:'var(--radius)',border:'1px solid var(--border)',padding:'14px 18px',display:'flex',alignItems:'center',gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{item.label}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>{item.detail}</div>
              </div>
              <Pill label={item.status} color={item.color} />
            </div>
          ))}
        </div>
      )}

      {/* ── ADD USER MODAL ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New User" width={480}>
        <div style={{padding:'0 0 12px', display:'flex', gap:10, marginBottom:4}}>
          <button onClick={() => setA('sendInvite', true)}
            style={{flex:1,padding:'8px',borderRadius:8,border:'1px solid '+(addForm.sendInvite?'#CC2200':'var(--border)'),background:addForm.sendInvite?'rgba(204,34,0,.07)':'var(--dim)',color:addForm.sendInvite?'#CC2200':'var(--muted)',fontWeight:700,cursor:'pointer',fontSize:12,fontFamily:ff}}>
            📧 Send Email Invite
          </button>
          <button onClick={() => setA('sendInvite', false)}
            style={{flex:1,padding:'8px',borderRadius:8,border:'1px solid '+(!addForm.sendInvite?'#CC2200':'var(--border)'),background:!addForm.sendInvite?'rgba(204,34,0,.07)':'var(--dim)',color:!addForm.sendInvite?'#CC2200':'var(--muted)',fontWeight:700,cursor:'pointer',fontSize:12,fontFamily:ff}}>
            🔑 Set Password Manually
          </button>
        </div>
        <Field label="Full Name"><Input value={addForm.name} onChange={v=>setA('name',v)} placeholder="Mendy Jankovits" /></Field>
        <Field label="Email" hint="They will log in with this email">
          <Input value={addForm.email} onChange={v=>setA('email',v)} type="email" placeholder="agent@targetreteam.com" />
        </Field>
        <Field label="Phone (optional)"><Input value={addForm.phone} onChange={v=>setA('phone',v)} type="tel" placeholder="(845) 555-1234" /></Field>
        <Field label="Role"><Select value={addForm.role} onChange={v=>setA('role',v)} options={ROLES} /></Field>
        {!addForm.sendInvite && (
          <Field label="Temporary Password" hint="User should change this on first login">
            <Input value={addForm.password} onChange={v=>setA('password',v)} type="password" placeholder="Min 8 characters" />
          </Field>
        )}
        <Field label="Avatar Color">
          <div style={{display:'flex',gap:6,flexWrap:'wrap',paddingTop:4}}>
            {COLORS.map(c => (
              <div key={c} onClick={() => setA('color',c)}
                style={{width:26,height:26,borderRadius:'50%',background:c,cursor:'pointer',border:addForm.color===c?'3px solid var(--text)':'2px solid transparent'}} />
            ))}
          </div>
        </Field>
        {addForm.sendInvite && (
          <div style={{padding:'8px 12px',background:'#EFF6FF',borderRadius:8,border:'1px solid #BFDBFE',fontSize:11,color:'#1E40AF',marginBottom:4}}>
            An email invite will be sent to {addForm.email||'the user'}. They click the link to set their password and log in.
          </div>
        )}
        <ModalActions>
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addUser} loading={adding}>{addForm.sendInvite ? 'Send Invite' : 'Create User'}</Btn>
        </ModalActions>
      </Modal>

      {/* ── EDIT AGENT MODAL ── */}
      <Modal open={!!selected} onClose={closePanel} title={'Edit — '+(selected?.name||'')} width={460}>
        <Field label="Full Name"><Input value={form.name} onChange={v=>set('name',v)} placeholder="Full name" /></Field>
        <Field label="Email" hint="Must match their Supabase login email">
          <Input value={form.email} onChange={v=>set('email',v)} type="email" placeholder="agent@targetreteam.com" />
        </Field>
        <Field label="Phone"><Input value={form.phone??''} onChange={v=>set('phone',v)} placeholder="(845) 555-1234" type="tel" /></Field>
        <Field label="Role"><Select value={form.role} onChange={v=>set('role',v)} options={ROLES} /></Field>
        <Field label="Call Recordings" hint="Can this agent hear call recordings for any contact? (Per-contact access can also be granted from a contact's page.)">
          <Toggle value={!!form.can_hear_recordings} onChange={v=>set('can_hear_recordings', v)} label={form.can_hear_recordings ? 'Can hear all recordings' : 'No recording access'} />
        </Field>
        <Field label="Avatar Color">
          <div style={{display:'flex',gap:8,flexWrap:'wrap',paddingTop:4}}>
            {COLORS.map(c => (
              <div key={c} onClick={() => set('color',c)}
                style={{width:26,height:26,borderRadius:'50%',background:c,cursor:'pointer',border:form.color===c?'3px solid var(--text)':'2px solid transparent'}} />
            ))}
          </div>
        </Field>
        <div style={{background:'var(--dim)',borderRadius:8,padding:'10px 12px',fontSize:12,color:'var(--muted)',marginBottom:4}}>
          Login: <strong style={{color:selected?.auth_user_id?'#10B981':'#F97316'}}>
            {selected?.auth_user_id ? '✓ Linked to Supabase Auth' : '⚠ No login yet'}
          </strong>
        </div>
        <ModalActions>
          {selected?.id !== me?.id && (
            <div style={{marginRight:'auto', display:'flex', gap:6}}>
              {selected?.active && (
                <button onClick={() => { closePanel(); setConfirmDelType('deactivate'); setConfirmDel(selected) }}
                  style={{padding:'6px 12px',borderRadius:7,border:'1px solid #F97316',background:'rgba(249,115,22,.08)',color:'#F97316',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:ff}}>
                  Deactivate
                </button>
              )}
              <button onClick={() => { closePanel(); setConfirmDelType('delete'); setConfirmDel(selected) }}
                style={{padding:'6px 12px',borderRadius:7,border:'1px solid #DC2626',background:'rgba(220,38,38,.08)',color:'#DC2626',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:ff}}>
                🗑 Delete
              </button>
            </div>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveAgent} loading={saving}>Save Changes</Btn>
        </ModalActions>
      </Modal>

      {/* ── RESET PASSWORD MODAL ── */}
      <Modal open={!!resetPwd} onClose={() => setResetPwd(null)} title={'Reset Password — '+(resetPwd?.name||'')} width={400}>
        {!resetPwd?.auth_user_id ? (
          <div style={{padding:'12px',background:'#FFF7ED',borderRadius:8,border:'1px solid #FED7AA',fontSize:12,color:'#92400E',marginBottom:12}}>
            This user has no Supabase Auth account yet. Add them via Supabase Dashboard → Authentication → Users, then link the auth_user_id to their agent record.
          </div>
        ) : (
          <>
            <Field label="New Password" hint="Min 8 characters">
              <Input value={newPwd} onChange={setNewPwd} type="password" placeholder="New password" />
            </Field>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>
              The user can log in with this password immediately. They should change it after logging in.
            </div>
          </>
        )}
        <ModalActions>
          <Btn variant="secondary" onClick={() => setResetPwd(null)}>Cancel</Btn>
          {resetPwd?.auth_user_id && <Btn onClick={resetPassword} loading={resetting}>Reset Password</Btn>}
        </ModalActions>
      </Modal>

      {/* ── CONFIRM DEACTIVATE / DELETE ── */}
      <Confirm
        open={!!confirmDel}
        message={confirmDelType === 'delete'
          ? 'PERMANENTLY DELETE ' + confirmDel?.name + '? This cannot be undone. All their data will remain but their account will be removed.'
          : 'Deactivate ' + confirmDel?.name + '? They will not be able to log in until reactivated.'}
        onConfirm={() => confirmDelType === 'delete' ? permanentlyDeleteUser(confirmDel) : deactivateUser(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
