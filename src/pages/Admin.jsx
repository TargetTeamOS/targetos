import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, StatCard, Grid4, Avatar } from '../components/UI'
import { AGENTS } from '../lib/constants'
import { useConfirm } from '../components/ConfirmDialog'

// ── ALL MODULES WITH LOCK CONTROL ─────────────────────────────
const ALL_MODULES = [
  { id:'dash',         label:'Dashboard',        section:'Main'     },
  { id:'contacts',     label:'Contacts',          section:'Main'     },
  { id:'pipeline',     label:'Pipeline',          section:'Main'     },
  { id:'listings',     label:'Target Listings',   section:'Main'     },
  { id:'transactions', label:'Transactions',      section:'Main'     },
  { id:'production',   label:'Production',        section:'Main'     },
  { id:'tasks',        label:'Tasks',             section:'Tools'    },
  { id:'calls',        label:'Phone & Calls',     section:'Tools'    },
  { id:'email',        label:'Email Blast',       section:'Tools'    },
  { id:'cards',        label:'Card Generator',    section:'Tools'    },
  { id:'mixads',       label:'Mix Ads',           section:'Tools'    },
  { id:'leadgen',      label:'Lead Gen',          section:'Tools'    },
  { id:'openhouse',    label:'Open House',        section:'Tools'    },
  { id:'offers',       label:'Offers',            section:'Tools'    },
  { id:'route',        label:'Showing Route',     section:'Maps'     },
  { id:'signs',        label:'Sign Tracker',      section:'Maps'     },
  { id:'mortgage',     label:'Mortgage Calc',     section:'Maps'     },
  { id:'calendar',     label:'Calendar',          section:'Maps'     },
  { id:'news',         label:'Market News',       section:'Maps'     },
  { id:'notes',        label:'Quick Notes',       section:'Maps'     },
  { id:'listprep',     label:'Listing Prep',      section:'Internal' },
  { id:'gifts',        label:'Gift Boards',       section:'Internal' },
  { id:'announce',     label:'Announcements',     section:'Internal' },
  { id:'actlog',       label:'Activity Log',      section:'Admin'    },
  { id:'automations',  label:'Automations',       section:'Admin'    },
  { id:'admin',        label:'Admin Panel',       section:'Admin'    },
  { id:'settings',     label:'Settings',          section:'Admin'    },
]

const SECTIONS = ['Main','Tools','Maps','Internal','Admin']

// Default permissions per role
const DEFAULT_PERMS = {
  admin:     ALL_MODULES.map(m => m.id),
  secretary: ALL_MODULES.filter(m => !['admin'].includes(m.id)).map(m => m.id),
  agent:     ALL_MODULES.filter(m => !['actlog','admin','automations','transactions'].includes(m.id)).map(m => m.id),
}

export function Admin() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [tab, setTab] = useState('users')
  const [agents, setAgents] = useState(AGENTS.map(a => ({
    ...a,
    photo: null,
    permissions: DEFAULT_PERMS[a.role] || DEFAULT_PERMS.agent,
  })))
  const [showAddUser, setShowAddUser] = useState(false)
  const [editAgent, setEditAgent] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState(null) // for permissions view
  const [showPerms, setShowPerms] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(null)

  function savePermissions(agentId, perms) {
    setAgents(prev => prev.map(a => a.id === agentId ? {...a, permissions: perms} : a))
    toast('Permissions saved!')
  }

  function togglePerm(agentId, moduleId) {
    setAgents(prev => prev.map(a => {
      if(a.id !== agentId) return a
      const has = a.permissions.includes(moduleId)
      return {...a, permissions: has ? a.permissions.filter(p => p !== moduleId) : [...a.permissions, moduleId]}
    }))
  }

  function setRoleDefaults(agentId, role) {
    setAgents(prev => prev.map(a => a.id === agentId ? {...a, role, permissions: DEFAULT_PERMS[role]||DEFAULT_PERMS.agent} : a))
    toast('Role and permissions updated!')
  }

  async function sendPasswordReset(email) {
    try {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://app.targetreteam.com' })
      toast('Password reset email sent to ' + email)
    } catch(e) {
      toast('Error: ' + e.message, '#DC2626')
    }
  }

  async function inviteUser(form) {
    try {
      // Create user via Supabase Admin API (requires service role key in production)
      // For now we send a magic link / password reset
      await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: 'https://app.targetreteam.com' })
      toast('Invitation sent to ' + form.email)
      setShowAddUser(false)
    } catch(e) {
      toast('Error: ' + e.message, '#DC2626')
    }
  }

  const activeAgent = agents.find(a => a.id === selectedAgent)

  return (
    <div>
      <ConfirmDialog/>

      {/* Tab bar */}
      <div style={{display:'flex',gap:'2px',background:'var(--dim)',borderRadius:'12px',padding:'4px',marginBottom:'18px'}}>
        {[['users','👥 User Management'],['permissions','🔒 Permissions'],['commission','💰 Commission'],['automations','⚡ Automations']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{flex:1,padding:'9px 12px',borderRadius:'9px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:tab===k?'var(--panel)':'transparent',color:tab===k?'var(--text)':'var(--muted)',boxShadow:tab===k?'0 1px 3px rgba(0,0,0,.08)':'none'}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── USER MANAGEMENT ─────────────────────────────────────── */}
      {tab==='users' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
            <span style={{color:'var(--muted)',fontSize:'12px'}}>{agents.length} users · Manage access, roles, passwords</span>
            <Btn size="sm" onClick={()=>setShowAddUser(true)}>+ Add User</Btn>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:'12px'}}>
            {agents.map(a => (
              <Card key={a.id} style={{padding:'0',overflow:'hidden'}}>
                {/* Color header */}
                <div style={{height:'6px',background:a.color}}/>
                <div style={{padding:'16px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'14px'}}>
                    {/* Photo */}
                    <div style={{position:'relative',flexShrink:0}}>
                      {a.photo
                        ? <img src={a.photo} alt={a.name} style={{width:48,height:48,borderRadius:'12px',objectFit:'cover'}}/>
                        : <div style={{width:48,height:48,borderRadius:'12px',background:a.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:900,color:'#fff'}}>{a.ini}</div>
                      }
                      <label style={{position:'absolute',bottom:-4,right:-4,width:18,height:18,borderRadius:'50%',background:'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'10px',color:'#fff',boxShadow:'0 2px 4px rgba(0,0,0,.2)'}}>
                        +
                        <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{
                          const file=e.target.files[0]; if(!file)return
                          const r=new FileReader(); r.onload=ev=>setAgents(prev=>prev.map(ag=>ag.id===a.id?{...ag,photo:ev.target.result}:ag)); r.readAsDataURL(file)
                        }}/>
                      </label>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'14px',fontWeight:800}}>{a.name}</div>
                      <div style={{fontSize:'11px',color:'var(--muted)'}}>{a.email}</div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px'}}>
                        <span style={{fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px',background:a.role==='admin'?'rgba(204,34,0,.1)':a.role==='secretary'?'rgba(124,58,237,.1)':'rgba(14,165,233,.1)',color:a.role==='admin'?'#CC2200':a.role==='secretary'?'#7C3AED':'#0EA5E9',textTransform:'capitalize'}}>{a.role}</span>
                        <span style={{fontSize:'10px',color:'var(--muted)'}}>Ext {a.ext}</span>
                        <span style={{fontSize:'10px',color:'#16A34A'}}>● Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px',marginBottom:'12px'}}>
                    {[['Modules',a.permissions.length+'/'+ALL_MODULES.length],['Role',a.role],['Color',a.color]].map(([k,v])=>(
                      <div key={k} style={{background:'var(--dim)',borderRadius:'8px',padding:'7px',textAlign:'center'}}>
                        <div style={{fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px'}}>{k}</div>
                        <div style={{fontSize:'11px',fontWeight:700,marginTop:'2px'}}>{k==='Color'?<span style={{display:'inline-block',width:14,height:14,borderRadius:'4px',background:v,verticalAlign:'middle'}}/>:v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    <Btn size="xs" variant="ghost" onClick={()=>{setSelectedAgent(a.id);setTab('permissions')}}>🔒 Permissions</Btn>
                    <Btn size="xs" variant="ghost" onClick={()=>setShowPasswordModal(a)}>🔑 Password</Btn>
                    <Btn size="xs" variant="ghost" onClick={()=>setEditAgent(a)}>✏️ Edit</Btn>
                    <Btn size="xs" variant="danger" onClick={()=>confirm({title:'Remove '+a.name+'?',message:'This will revoke their access to TargetOS.',confirmLabel:'Remove User',onConfirm:()=>{setAgents(prev=>prev.filter(x=>x.id!==a.id));toast(a.name+' removed')}})}>Remove</Btn>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── PERMISSIONS ──────────────────────────────────────────── */}
      {tab==='permissions' && (
        <div>
          {/* Agent selector */}
          <div style={{display:'flex',gap:'8px',marginBottom:'18px',overflowX:'auto',paddingBottom:'4px'}}>
            {agents.map(a=>(
              <div key={a.id} onClick={()=>setSelectedAgent(a.id)}
                style={{display:'flex',alignItems:'center',gap:'8px',padding:'9px 14px',borderRadius:'10px',border:'1.5px solid '+(selectedAgent===a.id?a.color:'var(--border)'),background:selectedAgent===a.id?a.color+'12':'var(--panel)',cursor:'pointer',flexShrink:0,transition:'all .15s'}}>
                <div style={{width:28,height:28,borderRadius:'7px',background:a.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:800,color:'#fff'}}>{a.ini}</div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700}}>{a.name.split(' ')[0]}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)',textTransform:'capitalize'}}>{a.role}</div>
                </div>
              </div>
            ))}
          </div>

          {activeAgent ? (
            <div>
              {/* Header */}
              <Card style={{padding:'16px',marginBottom:'14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'10px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                    <div style={{width:44,height:44,borderRadius:'11px',background:activeAgent.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',fontWeight:900,color:'#fff'}}>{activeAgent.ini}</div>
                    <div>
                      <div style={{fontSize:'16px',fontWeight:800}}>{activeAgent.name}</div>
                      <div style={{fontSize:'12px',color:'var(--muted)'}}>{activeAgent.permissions.length} of {ALL_MODULES.length} modules enabled</div>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                    <div style={{display:'flex',gap:'4px'}}>
                      {['admin','secretary','agent'].map(role=>(
                        <Btn key={role} size="xs" variant={activeAgent.role===role?'primary':'ghost'} onClick={()=>setRoleDefaults(activeAgent.id,role)}>
                          {role.charAt(0).toUpperCase()+role.slice(1)} defaults
                        </Btn>
                      ))}
                    </div>
                    <Btn size="sm" onClick={()=>{savePermissions(activeAgent.id,activeAgent.permissions)}}>Save Permissions</Btn>
                  </div>
                </div>
              </Card>

              {/* Module grid by section */}
              {SECTIONS.map(section => {
                const modules = ALL_MODULES.filter(m => m.section === section)
                return (
                  <Card key={section} style={{marginBottom:'12px'}}>
                    <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontSize:'13px',fontWeight:700}}>{section}</div>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button onClick={()=>{
                          const ids = modules.map(m=>m.id)
                          const newPerms = [...new Set([...activeAgent.permissions,...ids])]
                          setAgents(prev=>prev.map(a=>a.id===activeAgent.id?{...a,permissions:newPerms}:a))
                        }} style={{background:'rgba(22,163,74,.1)',border:'none',borderRadius:'6px',color:'#16A34A',fontSize:'10px',fontWeight:700,padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Enable All</button>
                        <button onClick={()=>{
                          const ids = modules.map(m=>m.id)
                          const newPerms = activeAgent.permissions.filter(p=>!ids.includes(p))
                          setAgents(prev=>prev.map(a=>a.id===activeAgent.id?{...a,permissions:newPerms}:a))
                        }} style={{background:'rgba(220,38,38,.08)',border:'none',borderRadius:'6px',color:'#DC2626',fontSize:'10px',fontWeight:700,padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Disable All</button>
                      </div>
                    </div>
                    <div style={{padding:'12px 16px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'8px'}}>
                      {modules.map(m => {
                        const enabled = activeAgent.permissions.includes(m.id)
                        return (
                          <div key={m.id} onClick={()=>togglePerm(activeAgent.id,m.id)}
                            style={{display:'flex',alignItems:'center',gap:'9px',padding:'9px 11px',borderRadius:'9px',border:'1.5px solid '+(enabled?activeAgent.color+'44':'var(--border)'),background:enabled?activeAgent.color+'08':'transparent',cursor:'pointer',transition:'all .15s'}}>
                            {/* Toggle */}
                            <div style={{width:34,height:19,borderRadius:'99px',background:enabled?activeAgent.color:'var(--border)',position:'relative',flexShrink:0,transition:'background .2s'}}>
                              <div style={{width:15,height:15,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:enabled?17:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                            </div>
                            <span style={{fontSize:'12px',fontWeight:enabled?600:400,color:enabled?'var(--text)':'var(--muted)'}}>{m.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div style={{textAlign:'center',padding:'48px',color:'var(--muted)'}}>
              <div style={{fontSize:'32px',marginBottom:'12px'}}>👆</div>
              <div style={{fontSize:'14px',fontWeight:700}}>Select an agent above to manage their permissions</div>
            </div>
          )}
        </div>
      )}

      {/* ── COMMISSION ───────────────────────────────────────────── */}
      {tab==='commission' && (
        <Card>
          <CardHeader>Commission Tracker</CardHeader>
          {[
            {addr:'135 Route 306, Monsey',agent:'Lazer F.',gci:25520,commRcvd:false,agentPaid:false},
            {addr:'10 Sneden Ct, Spring Valley',agent:'Lazer F.',gci:33960,commRcvd:false,agentPaid:false},
            {addr:'105 Grove St #202, Monsey',agent:'Eli H.',gci:30400,commRcvd:true,agentPaid:false},
            {addr:'112 Washington Ave, Suffern',agent:'Avraham W.',gci:24000,commRcvd:true,agentPaid:true},
          ].map((tx,i)=>(
            <div key={i} style={{padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'13px',fontWeight:700,marginBottom:'8px'}}>{tx.addr} <span style={{color:'var(--muted)',fontWeight:400,fontSize:'12px'}}>· {tx.agent}</span></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
                <div style={{background:'var(--dim)',borderRadius:'8px',padding:'10px',textAlign:'center'}}>
                  <div style={{fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'3px'}}>GCI</div>
                  <div style={{fontSize:'14px',fontWeight:800,color:'#D97706'}}>${tx.gci.toLocaleString()}</div>
                </div>
                {[['Commission Received',tx.commRcvd],['Agent Paid',tx.agentPaid]].map(([label,val])=>(
                  <div key={label} style={{background:val?'rgba(22,163,74,.08)':'var(--dim)',border:val?'1px solid #86EFAC':'1px solid transparent',borderRadius:'8px',padding:'10px',cursor:'pointer'}}>
                    <div style={{fontSize:'9px',color:'var(--muted)',fontWeight:700,textTransform:'uppercase',marginBottom:'3px'}}>{label}</div>
                    <div style={{fontSize:'13px',fontWeight:700,color:val?'#16A34A':'#DC2626'}}>{val?'✓ Yes':'Pending'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* ── AUTOMATIONS ──────────────────────────────────────────── */}
      {tab==='automations' && (
        <div style={{textAlign:'center',padding:'48px',color:'var(--muted)'}}>
          <div style={{fontSize:'32px',marginBottom:'12px'}}>⚡</div>
          <div style={{fontSize:'14px',fontWeight:700,marginBottom:'6px'}}>Automations moved</div>
          <div style={{fontSize:'12px',marginBottom:'16px'}}>Manage automations from the dedicated Automations module in the sidebar</div>
          <Btn onClick={()=>{}}>Open Automations</Btn>
        </div>
      )}

      {/* ── ADD USER MODAL ───────────────────────────────────────── */}
      {showAddUser && <AddUserModal onClose={()=>setShowAddUser(false)} onSave={inviteUser} agents={agents}/>}

      {/* ── EDIT AGENT MODAL ─────────────────────────────────────── */}
      {editAgent && <EditAgentModal agent={editAgent} onClose={()=>setEditAgent(null)} onSave={updated=>{setAgents(prev=>prev.map(a=>a.id===updated.id?{...a,...updated}:a));setEditAgent(null);toast('Agent updated!')}}/>}

      {/* ── PASSWORD MODAL ───────────────────────────────────────── */}
      {showPasswordModal && (
        <Modal onClose={()=>setShowPasswordModal(null)} maxWidth={420}>
          <ModalTitle onClose={()=>setShowPasswordModal(null)}>Password — {showPasswordModal.name}</ModalTitle>
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'14px',marginBottom:'14px',fontSize:'12px',color:'var(--muted)',lineHeight:1.7}}>
            <strong style={{color:'var(--text)'}}>Send Password Reset Email</strong><br/>
            A reset link will be sent to <strong style={{color:'var(--text)'}}>{showPasswordModal.email}</strong>.<br/>
            They click the link and set their own new password.
          </div>
          <Btn style={{width:'100%',marginBottom:'10px'}} onClick={()=>{sendPasswordReset(showPasswordModal.email);setShowPasswordModal(null)}}>
            📧 Send Password Reset Email
          </Btn>
          <div style={{textAlign:'center',color:'var(--muted)',fontSize:'11px',margin:'8px 0'}}>— or —</div>
          <div style={{fontSize:'12px',fontWeight:700,marginBottom:'8px'}}>Set Temporary Password</div>
          <Input label="New Temporary Password" type="password" placeholder="Min 8 characters"/>
          <div style={{background:'#FFFBEB',border:'1px solid #FCD34D',borderRadius:'8px',padding:'10px',fontSize:'11px',color:'#92400E',marginBottom:'14px'}}>
            ⚠️ User must change this on first login
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" onClick={()=>setShowPasswordModal(null)}>Cancel</Btn>
            <Btn onClick={()=>{toast('Password updated for '+showPasswordModal.name);setShowPasswordModal(null)}}>Set Password</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── ADD USER MODAL ─────────────────────────────────────────────
function AddUserModal({ onClose, onSave, agents }) {
  const [form, setForm] = useState({ name:'', email:'', role:'agent', ext:'', color:'#0EA5E9' })
  const [step, setStep] = useState(1) // 1=details, 2=permissions
  const [perms, setPerms] = useState(DEFAULT_PERMS.agent)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <Modal onClose={onClose} maxWidth={540}>
      <ModalTitle onClose={onClose}>Add New User — Step {step} of 2</ModalTitle>

      {/* Step indicator */}
      <div style={{display:'flex',gap:'4px',marginBottom:'20px'}}>
        {[1,2].map(s=>(
          <div key={s} style={{flex:1,height:4,borderRadius:'99px',background:step>=s?'#CC2200':'var(--dim)',transition:'background .2s'}}/>
        ))}
      </div>

      {step===1 && (
        <>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>User Details</div>
          <Input label="Full Name *" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="John Smith"/>
          <Input label="Email Address *" value={form.email} onChange={e=>set('email',e.target.value)} type="email" placeholder="john@targetreteam.com"/>
          <Grid2 gap={10}>
            <Select label="Role" value={form.role} onChange={e=>{set('role',e.target.value);setPerms(DEFAULT_PERMS[e.target.value]||DEFAULT_PERMS.agent)}} options={[{value:'agent',label:'Agent'},{value:'secretary',label:'Secretary'},{value:'admin',label:'Admin'}]}/>
            <Input label="Extension" value={form.ext} onChange={e=>set('ext',e.target.value)} placeholder="109"/>
          </Grid2>
          <div style={{marginBottom:'14px'}}>
            <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Profile Color</label>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {['#CC2200','#0EA5E9','#10B981','#F5A623','#7C3AED','#E8650A','#14B8A6','#8B5CF6','#EC4899','#1B2B4B'].map(c=>(
                <div key={c} onClick={()=>set('color',c)} style={{width:32,height:32,borderRadius:'8px',background:c,cursor:'pointer',border:form.color===c?'3px solid var(--text)':'3px solid transparent',transition:'border .1s'}}/>
              ))}
            </div>
          </div>
          <div style={{background:'var(--dim)',borderRadius:'10px',padding:'12px',marginBottom:'14px',fontSize:'12px',color:'var(--muted)',lineHeight:1.7}}>
            📧 An invitation email will be sent to the user.<br/>
            They click the link to set their password and log in.
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={()=>{if(!form.name||!form.email){toast('Name and email required','#DC2626');return}setStep(2)}}>Next: Set Permissions →</Btn>
          </div>
        </>
      )}

      {step===2 && (
        <>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Permissions for {form.name}</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'14px'}}>Choose which modules this user can access. Based on <strong style={{color:'var(--text)',textTransform:'capitalize'}}>{form.role}</strong> defaults — toggle any module on or off.</div>

          {/* Quick presets */}
          <div style={{display:'flex',gap:'7px',marginBottom:'14px'}}>
            {['admin','secretary','agent'].map(r=>(
              <Btn key={r} size="xs" variant="ghost" onClick={()=>setPerms(DEFAULT_PERMS[r])}>
                {r.charAt(0).toUpperCase()+r.slice(1)} defaults
              </Btn>
            ))}
          </div>

          <div style={{maxHeight:'320px',overflowY:'auto'}}>
            {SECTIONS.map(section=>{
              const modules = ALL_MODULES.filter(m=>m.section===section)
              return (
                <div key={section} style={{marginBottom:'12px'}}>
                  <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'6px'}}>{section}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px'}}>
                    {modules.map(m=>{
                      const enabled = perms.includes(m.id)
                      return (
                        <div key={m.id} onClick={()=>setPerms(p=>enabled?p.filter(x=>x!==m.id):[...p,m.id])}
                          style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',borderRadius:'8px',border:'1.5px solid '+(enabled?'#CC2200':'var(--border)'),background:enabled?'rgba(204,34,0,.05)':'transparent',cursor:'pointer'}}>
                          <div style={{width:30,height:17,borderRadius:'99px',background:enabled?'#CC2200':'var(--border)',position:'relative',flexShrink:0,transition:'background .2s'}}>
                            <div style={{width:13,height:13,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:enabled?15:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                          </div>
                          <span style={{fontSize:'11px',fontWeight:enabled?600:400}}>{m.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{display:'flex',gap:'8px',justifyContent:'space-between',marginTop:'14px'}}>
            <Btn variant="ghost" onClick={()=>setStep(1)}>← Back</Btn>
            <Btn onClick={()=>onSave({...form,permissions:perms})}>Send Invitation ✉</Btn>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── EDIT AGENT MODAL ───────────────────────────────────────────
function EditAgentModal({ agent, onClose, onSave }) {
  const [form, setForm] = useState({name:agent.name,email:agent.email,ext:agent.ext,role:agent.role,color:agent.color})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  return (
    <Modal onClose={onClose} maxWidth={420}>
      <ModalTitle onClose={onClose}>Edit — {agent.name}</ModalTitle>
      <Input label="Full Name" value={form.name} onChange={e=>set('name',e.target.value)}/>
      <Input label="Email" value={form.email} onChange={e=>set('email',e.target.value)} type="email"/>
      <Grid2 gap={10}>
        <Select label="Role" value={form.role} onChange={e=>set('role',e.target.value)} options={[{value:'agent',label:'Agent'},{value:'secretary',label:'Secretary'},{value:'admin',label:'Admin'}]}/>
        <Input label="Extension" value={form.ext} onChange={e=>set('ext',e.target.value)}/>
      </Grid2>
      <div style={{marginBottom:'14px'}}>
        <label style={{display:'block',fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>Color</label>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          {['#CC2200','#0EA5E9','#10B981','#F5A623','#7C3AED','#E8650A','#14B8A6','#8B5CF6','#EC4899','#1B2B4B'].map(c=>(
            <div key={c} onClick={()=>set('color',c)} style={{width:32,height:32,borderRadius:'8px',background:c,cursor:'pointer',border:form.color===c?'3px solid var(--text)':'3px solid transparent'}}/>
          ))}
        </div>
      </div>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>onSave({id:agent.id,...form})}>Save Changes</Btn>
      </div>
    </Modal>
  )
}
