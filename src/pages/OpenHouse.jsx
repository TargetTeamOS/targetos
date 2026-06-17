import React, { useState } from 'react'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, StatCard, Grid4 } from '../components/UI'
import { AGENTS } from '../lib/constants'

export function OpenHouse() {
  const [upcoming, setUpcoming] = useState([
    {id:1,listing:'12 Sherman Drive #202, Spring Valley',date:'Sun Jun 22',start:'1:00 PM',end:'3:00 PM',agent:'Joel Rottenstein',visitors:0},
    {id:2,listing:'84 Tennyson Drive, Nanuet',date:'Sun Jun 22',start:'2:00 PM',end:'4:00 PM',agent:'Isaac Leibowitz',visitors:0},
  ])
  const [visitors, setVisitors] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const [form, setForm] = useState({firstName:'',lastName:'',phone:'',email:'',listing:upcoming[0]?.listing||'',interest:'Hot'})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function signIn() {
    if(!form.firstName) return
    const v = {...form, time: new Date().toLocaleTimeString(), id: Date.now()}
    setVisitors(prev => [v,...prev])
    setForm(f=>({...f,firstName:'',lastName:'',phone:'',email:''}))
    setShowSignIn(false)
    alert(`${form.firstName} signed in! Auto follow-up scheduled for tomorrow.`)
  }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Upcoming"  value={upcoming.length}  sub="Open houses"    subColor="var(--teal)"/>
        <StatCard label="Today"     value={visitors.length}  sub="Visitors signed in" subColor="var(--green)"/>
        <StatCard label="This Week" value={upcoming.length}  sub="Scheduled"      subColor="#D97706"/>
        <StatCard label="Follow-ups" value={visitors.length} sub="Queued"         subColor="var(--purple)"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>Manage open houses & capture leads automatically</span>
        <div style={{display:'flex',gap:'7px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>setShowSignIn(true)}>Sign In Visitor</Btn>
          <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Schedule</Btn>
        </div>
      </div>

      <Grid2>
        <div>
          <Card style={{marginBottom:'13px'}}>
            <CardHeader>Upcoming Open Houses</CardHeader>
            {upcoming.map(oh=>(
              <div key={oh.id} style={{padding:'13px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700}}>{oh.listing.split(',')[0]}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{oh.date} · {oh.start}–{oh.end} · {oh.agent.split(' ')[0]}</div>
                </div>
                <div style={{display:'flex',gap:'7px'}}>
                  <Btn size="xs" variant="ghost" onClick={()=>alert('QR code displayed — visitors scan to sign in')}>QR Code</Btn>
                  <Btn size="xs" onClick={()=>setShowSignIn(true)}>Sign In</Btn>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <Card>
          <CardHeader>
            Visitors Today ({visitors.length})
            {visitors.length>0 && <Btn size="xs" onClick={()=>alert('Auto follow-up sent to all '+visitors.length+' visitors!')}>Send Follow-up All</Btn>}
          </CardHeader>
          {visitors.length===0
            ? <div style={{padding:'36px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>No visitors yet today</div>
            : visitors.map(v=>(
              <div key={v.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:34,height:34,borderRadius:'9px',background:'#0EA5E9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:'#fff',flexShrink:0}}>
                  {v.firstName[0]}{v.lastName?v.lastName[0]:''}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'12px',fontWeight:600}}>{v.firstName} {v.lastName}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>{v.phone||v.email||'—'} · {v.time}</div>
                </div>
                <span style={{fontSize:'10px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',background:v.interest==='Hot'?'#FEF2F2':v.interest==='Warm'?'#FFFBEB':'var(--dim)',color:v.interest==='Hot'?'#DC2626':v.interest==='Warm'?'#D97706':'#64748B'}}>{v.interest}</span>
              </div>
            ))
          }
        </Card>
      </Grid2>

      {showAdd && (
        <Modal onClose={()=>setShowAdd(false)} maxWidth={440}>
          <ModalTitle onClose={()=>setShowAdd(false)}>Schedule Open House</ModalTitle>
          <Select label="Listing" value={form.listing} onChange={e=>set('listing',e.target.value)} options={['47 Prairie Ave, Suffern','12 Sherman Drive #202, Spring Valley','84 Tennyson Drive, Nanuet','17 Union Rd #208, Spring Valley']}/>
          <Grid2 gap={10}><Input label="Date" type="date" value={form.date||''} onChange={e=>set('date',e.target.value)}/><Input label="Start Time" type="time" value="13:00" onChange={()=>{}}/></Grid2>
          <Grid2 gap={10}><Input label="End Time" type="time" value="15:00" onChange={()=>{}}/><Select label="Agent" value={form.agent||''} onChange={e=>set('agent',e.target.value)} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/></Grid2>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={()=>{setShowAdd(false);alert('Open house scheduled! QR code generated.')}}>Schedule</Btn>
          </div>
        </Modal>
      )}

      {showSignIn && (
        <Modal onClose={()=>setShowSignIn(false)} maxWidth={440}>
          <ModalTitle onClose={()=>setShowSignIn(false)}>Sign In Visitor</ModalTitle>
          <Grid2 gap={10}><Input label="First Name *" value={form.firstName} onChange={e=>set('firstName',e.target.value)} placeholder="John"/><Input label="Last Name" value={form.lastName} onChange={e=>set('lastName',e.target.value)} placeholder="Smith"/></Grid2>
          <Grid2 gap={10}><Input label="Phone" value={form.phone} onChange={e=>set('phone',e.target.value)} type="tel" placeholder="845-555-1234"/><Input label="Email" value={form.email} onChange={e=>set('email',e.target.value)} type="email" placeholder="john@email.com"/></Grid2>
          <Grid2 gap={10}>
            <Select label="Which Listing?" value={form.listing} onChange={e=>set('listing',e.target.value)} options={upcoming.map(o=>({value:o.listing,label:o.listing.split(',')[0]}))}/>
            <Select label="Interest Level" value={form.interest} onChange={e=>set('interest',e.target.value)} options={['Hot','Warm','Cold']}/>
          </Grid2>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" onClick={()=>setShowSignIn(false)}>Cancel</Btn>
            <Btn onClick={signIn}>Sign In & Auto Follow-Up</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
