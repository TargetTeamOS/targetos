import React, { useState } from 'react'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, StatCard, Grid4 } from '../components/UI'

const INIT_AUTOS = [
  {id:'a1',name:'Deal Under Contract',trigger:'Status changes to Under Contract',action:'Generate UC card + start CTC checklist + notify team',active:true,lastFired:'Jun 10'},
  {id:'a2',name:'Closing in 7 days',trigger:'7 days before expected close date',action:'Send reminder to agent + secretary via email + app notification',active:true,lastFired:'Jun 21'},
  {id:'a3',name:'No contact in 5 days',trigger:'No activity logged for 5 days on a contact',action:'Create follow-up task for assigned agent',active:true,lastFired:'Jun 13'},
  {id:'a4',name:'New listing added',trigger:'New listing created in system',action:'Email all matching buyers based on their listing alert criteria',active:true,lastFired:'Jun 9'},
  {id:'a5',name:'Ad spend 80%+ of budget',trigger:'Ad spend reaches 80% of listing budget',action:'Notify admin + flag listing in red',active:true,lastFired:'Jun 12'},
  {id:'a6',name:'Deal closed',trigger:'CTC stage changes to Closed',action:'Generate Sold card + confetti celebration + update leaderboard',active:true,lastFired:'Jun 10'},
  {id:'a7',name:'Missed inbound call',trigger:'Inbound call not answered (Twilio)',action:'Auto-SMS: Sorry we missed your call, we will call back shortly',active:false,lastFired:''},
  {id:'a8',name:'Birthday reminder',trigger:'3 days before contact birthday',action:'Send reminder notification to assigned agent',active:true,lastFired:''},
  {id:'a9',name:'Offer accepted',trigger:'Offer status changes to Accepted',action:'Send team celebration + notify secretary + start listing prep',active:true,lastFired:'Jun 12'},
]

const TRIGGERS = ['status_change','date_before','date_after','no_activity','new_record','missed_call','inbound_sms','spend_threshold','birthday','goal_reached']
const ACTIONS  = ['Send email to agent','Send SMS to agent','Create task','Generate marketing card','Notify admin','Update board','Send team notification','Trigger celebration','Start checklist']

export function Automations() {
  const [autos, setAutos] = useState(INIT_AUTOS)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({name:'',trigger:'',action:'',active:true})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function toggle(id) { setAutos(prev=>prev.map(a=>a.id===id?{...a,active:!a.active}:a)) }
  function del(id) { if(window.confirm('Delete this automation?')) setAutos(prev=>prev.filter(a=>a.id!==id)) }
  function openEdit(a) { setEditItem(a); setForm({name:a.name,trigger:a.trigger,action:a.action,active:a.active}); setShowAdd(true) }
  function save() {
    if(!form.name) return
    if(editItem) setAutos(prev=>prev.map(a=>a.id===editItem.id?{...a,...form}:a))
    else setAutos(prev=>[...prev,{id:'a'+Date.now(),lastFired:'',...form}])
    setShowAdd(false); setEditItem(null); setForm({name:'',trigger:'',action:'',active:true})
  }

  const active = autos.filter(a=>a.active).length

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Total"    value={autos.length} sub="Automations"  subColor="var(--teal)"/>
        <StatCard label="Active"   value={active}       sub="Running"      subColor="var(--green)"/>
        <StatCard label="Paused"   value={autos.length-active} sub="Inactive" subColor="#D97706"/>
        <StatCard label="Fired"    value={autos.filter(a=>a.lastFired).length} sub="Have run" subColor="var(--purple)"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>All automations · Admin view</span>
        <Btn size="sm" onClick={()=>{setEditItem(null);setForm({name:'',trigger:'',action:'',active:true});setShowAdd(true)}}>+ Create Automation</Btn>
      </div>

      <Card>
        <CardHeader>All Automations ({autos.length})</CardHeader>
        {autos.map(a=>(
          <div key={a.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',borderBottom:'1px solid var(--border)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            {/* Toggle */}
            <div onClick={()=>toggle(a.id)} style={{width:42,height:24,borderRadius:'99px',background:a.active?'#10B981':'var(--border)',position:'relative',cursor:'pointer',flexShrink:0,transition:'background .2s'}}>
              <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:a.active?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:'13px',fontWeight:700,marginBottom:'3px'}}>{a.name}</div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'2px'}}><span style={{color:'var(--teal)',fontWeight:600}}>When:</span> {a.trigger}</div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}><span style={{color:'var(--orange)',fontWeight:600}}>Then:</span> {a.action}</div>
              {a.lastFired && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'3px'}}>Last fired: {a.lastFired}</div>}
            </div>
            <div style={{display:'flex',gap:'6px'}}>
              <button onClick={()=>openEdit(a)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'7px',color:'var(--text)',fontSize:'11px',padding:'5px 10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Edit</button>
              <button onClick={()=>del(a.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px',padding:'3px'}}>🗑</button>
            </div>
          </div>
        ))}
      </Card>

      {showAdd && (
        <Modal onClose={()=>{setShowAdd(false);setEditItem(null)}} maxWidth={480}>
          <ModalTitle onClose={()=>{setShowAdd(false);setEditItem(null)}}>{editItem?'Edit Automation':'New Automation'}</ModalTitle>
          <Input label="Name *" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Auto follow-up after showing..."/>
          <Input label="Trigger (When...)" value={form.trigger} onChange={e=>set('trigger',e.target.value)} placeholder="Status changes to Under Contract..."/>
          <Input label="Action (Then...)" value={form.action} onChange={e=>set('action',e.target.value)} rows={2} placeholder="Generate UC card + notify team..."/>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'16px',cursor:'pointer'}} onClick={()=>set('active',!form.active)}>
            <div style={{width:40,height:22,borderRadius:'99px',background:form.active?'#10B981':'var(--border)',position:'relative',transition:'background .2s'}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:form.active?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
            </div>
            <span style={{fontSize:'13px'}}>{form.active?'Active':'Inactive'}</span>
          </div>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditItem(null)}}>Cancel</Btn>
            <Btn onClick={save}>{editItem?'Save Changes':'Create'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
