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

const ff = 'Inter, system-ui, -apple-system, sans-serif'
const ROLES  = ['admin','secretary','agent']
const COLORS = ['#CC2200','#0EA5E9','#10B981','#F5A623','#8B5CF6','#EC4899','#14B8A6','#E8650A','#6366F1','#84CC16']
const BLANK  = { name:'', email:'', phone:'', color:'#CC2200', role:'agent', active:true }

export function Admin() {
  const { agent: me, isAdmin } = useAuth()
  const { toast } = useApp()
  const { agents, loading, refetch } = useAgents()

  const [tab,       setTab]       = useState('team')
  const [selected,  setSelected]  = useState(null)
  const [form,      setForm]      = useState(BLANK)
  const [saving,    setSaving]    = useState(false)
  const [showAdd,   setShowAdd]   = useState(false)
  const [addForm,   setAddForm]   = useState({ name:'', email:'', phone:'', role:'agent', color:'#CC2200', password:'', sendInvite:true })
  const [adding,    setAdding]    = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [resetPwd,   setResetPwd]   = useState(null)
  const [newPwd,     setNewPwd]     = useState('')
  const [resetting,  setResetting]  = useState(false)
  const [showInactive, setShowInactive] = useState(false)

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
      await db.agents.update(selected.id, form, me.id)
      await refetch()
      toast('Saved')
      closePanel()
    } catch(e) { toast('Save failed: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  // ── Add new user ───────────────────────────────────────────────
  async function addUser() {
    if (!addForm.name.trim() || !addForm.email.trim()) { toast('Name and email required','#DC2626'); return }
    setAdding(true)
    try {
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          action:   addForm.sendInvite ? 'invite' : 'create',
          name:     addForm.name,
          email:    addForm.email,
          phone:    addForm.phone,
          role:     addForm.role,
          color:    addForm.color,
          password: addForm.password || 'TargetOS2024!',
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // If invite: create agent record manually since the user isn't fully created yet
      if (addForm.sendInvite) {
        await supabase.from('agents').insert({
          name:  addForm.name,
          email: addForm.email,
          phone: addForm.phone || null,
          role:  addForm.role,
          color: addForm.color,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }

      await refetch()
      toast(addForm.sendInvite ? '📧 Invite sent to '+addForm.email : '✅ User created — '+addForm.name)
      setShowAdd(false)
      setAddForm({ name:'', email:'', phone:'', role:'agent', color:'#CC2200', password:'', sendInvite:true })
    } catch(e) {
      // If API not configured, just create the agent record (no auth)
      if (e.message.includes('not configured') || e.message.includes('fetch')) {
        await supabase.from('agents').insert({
          name:  addForm.name,
          email: addForm.email,
          phone: addForm.phone || null,
          role:  addForm.role,
          color: addForm.color,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        await refetch()
        toast('✅ '+addForm.name+' added (ask them to set up login via Supabase Auth)')
        setShowAdd(false)
        setAddForm({ name:'', email:'', phone:'', role:'agent', color:'#CC2200', password:'', sendInvite:true })
      } else {
        toast('Failed: '+e.message, '#DC2626')
      }
    }
    finally { setAdding(false) }
  }

  // ── Deactivate user ───────────────────────────────────────────
  async function deactivateUser(a) {
    try {
      if (a.auth_user_id) {
        await fetch('/api/admin-users', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'deactivate', userId: a.auth_user_id })
        })
      }
      await supabase.from('agents').update({ active:false, updated_at:new Date().toISOString() }).eq('id', a.id)
      await refetch()
      toast(a.name+' deactivated')
    } catch(e) { toast('Failed: '+e.message,'#DC2626') }
    finally { setConfirmDel(null) }
  }

  // ── Reactivate user ───────────────────────────────────────────
  async function reactivateUser(a) {
    try {
      if (a.auth_user_id) {
        await fetch('/api/admin-users', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'reactivate', userId: a.auth_user_id })
        })
      }
      await supabase.from('agents').update({ active:true, updated_at:new Date().toISOString() }).eq('id', a.id)
      await refetch()
      toast(a.name+' reactivated')
    } catch(e) { toast('Failed: '+e.message,'#DC2626') }
  }

  // ── Reset password ────────────────────────────────────────────
  async function resetPassword() {
    if (!newPwd || newPwd.length < 8) { toast('Password must be at least 8 characters','#DC2626'); return }
    if (!resetPwd?.auth_user_id) { toast('This user has no auth account yet','#DC2626'); return }
    setResetting(true)
    try {
      const res = await fetch('/api/admin-users', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'reset_password', userId: resetPwd.auth_user_id, password: newPwd })
      })
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
        { id:'team',   label:'👥 Team' },
        { id:'rules',  label:'⚙️ Data Rules' },
        { id:'system', label:'🔌 System' },
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
            <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Team Members</div>
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

      {/* ── DATA RULES TAB ── */}
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
          {selected?.id !== me?.id && selected?.active && (
            <Btn variant="ghost" style={{marginRight:'auto',color:'#DC2626'}} onClick={() => { closePanel(); setConfirmDel(selected) }}>Deactivate</Btn>
          )}
          <Btn variant="secondary" onClick={closePanel}>Cancel</Btn>
          <Btn onClick={saveAgent} loading={saving}>Save</Btn>
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

      {/* ── CONFIRM DEACTIVATE ── */}
      <Confirm
        open={!!confirmDel}
        message={'Deactivate '+confirmDel?.name+'? They will not be able to log in until reactivated.'}
        onConfirm={() => deactivateUser(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
