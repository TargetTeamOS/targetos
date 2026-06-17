import React, { useState } from 'react'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, StatCard, Grid4 } from '../components/UI'
import { AGENTS } from '../lib/constants'

export function Calls() {
  const [callLog, setCallLog] = useState([
    {name:'Sarah Mitchell',phone:'845-201-4892',direction:'Outbound',outcome:'Scheduled showing at 84 Tennyson Drive',dur:'4:32',time:'Today 9:15 AM'},
    {name:'Elena Vasquez',phone:'845-338-2901',direction:'Inbound',outcome:'Interested in listings under $700K in Suffern',dur:'11:08',time:'Today 10:22 AM'},
    {name:'James Thornton',phone:'845-441-7823',direction:'Outbound',outcome:'Price negotiation — countered at $935K',dur:'2:17',time:'Jun 15 3:44 PM'},
  ])
  const [showLog, setShowLog] = useState(false)
  const [form, setForm] = useState({name:'',direction:'Outbound',dur:'',outcome:''})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function saveCall() {
    if(!form.name) return
    setCallLog(prev=>[{...form,time:'Just now',phone:''},...prev])
    setForm({name:'',direction:'Outbound',dur:'',outcome:''}); setShowLog(false)
  }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Calls Today"   value="23"   sub="+5 vs yesterday" subColor="var(--teal)"/>
        <StatCard label="Inbound"       value="9"    sub="Today"           subColor="var(--green)"/>
        <StatCard label="Outbound"      value="14"   sub="Today"           subColor="var(--purple)"/>
        <StatCard label="Avg Duration"  value="6:43" sub="Today"           subColor="#D97706"/>
      </Grid4>

      {/* Twilio notice */}
      <Card style={{padding:'14px 16px',marginBottom:'14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:'12px',fontWeight:700}}>Phone System — Twilio</div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Sign up to activate real calling, SMS, IVR, and extensions 101–108. Org SID: OR5bbc32b44d399d1e980ecb4b972c5985</div>
        </div>
        <a href="https://twilio.com" target="_blank" rel="noreferrer"><Btn size="sm">Set Up Twilio</Btn></a>
      </Card>

      {/* Agent extensions */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
        {AGENTS.slice(0,4).map(a=>(
          <Card key={a.id} style={{padding:'12px',textAlign:'center'}}>
            <div style={{width:32,height:32,borderRadius:'8px',background:a.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:800,color:'#fff',margin:'0 auto 6px'}}>{a.ini}</div>
            <div style={{fontSize:'11px',fontWeight:700}}>{a.name.split(' ')[0]}</div>
            <div style={{background:'#1B2B4B',borderRadius:'20px',color:'#F5A623',fontSize:'10px',fontWeight:700,padding:'3px 0',margin:'5px 0'}}>Ext {a.ext}</div>
            <div style={{fontSize:'9px',color:'#10B981'}}>Available</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          Call Log
          <Btn size="xs" onClick={()=>setShowLog(true)}>+ Log Call</Btn>
        </CardHeader>
        {callLog.map((c,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 16px',borderBottom:'1px solid var(--border)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{width:34,height:34,borderRadius:'9px',background:c.direction==='Outbound'?'#0EA5E9':'#10B981',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:'#fff',flexShrink:0}}>
              {c.name.split(' ').map(n=>n[0]).join('').slice(0,2)}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:'12px',fontWeight:700}}>{c.name}</div>
              <div style={{fontSize:'10px',color:'var(--muted)'}}>{c.time} · {c.direction}</div>
            </div>
            <div style={{flex:1,fontSize:'11px',color:'var(--muted)'}}>{c.outcome}</div>
            {c.dur && <div style={{fontSize:'11px',fontWeight:600}}>{c.dur}</div>}
          </div>
        ))}
      </Card>

      {showLog && (
        <Modal onClose={()=>setShowLog(false)} maxWidth={420}>
          <ModalTitle onClose={()=>setShowLog(false)}>Log Call</ModalTitle>
          <Input label="Contact Name *" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="John Smith"/>
          <Grid2 gap={10}><Select label="Direction" value={form.direction} onChange={e=>set('direction',e.target.value)} options={['Outbound','Inbound']}/><Input label="Duration" value={form.dur} onChange={e=>set('dur',e.target.value)} placeholder="4:32"/></Grid2>
          <Input label="Outcome / Notes" value={form.outcome} onChange={e=>set('outcome',e.target.value)} placeholder="Scheduled showing, left voicemail..."/>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" onClick={()=>setShowLog(false)}>Cancel</Btn>
            <Btn onClick={saveCall}>Save Call</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
