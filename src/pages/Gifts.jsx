import React, { useState } from 'react'
import { Card, CardHeader, Btn, Grid2, StatCard, Grid4 } from '../components/UI'

export function Gifts() {
  const [ucGifts, setUcGifts] = useState([
    {id:'ug1',deal:'135 Route 306, Monsey',client:'Moshe & Rivka Stern',agent:'Lazer F.',gift:'Wine & chocolates gift basket',company:'GiftCo',shipped:false,tracking:''},
    {id:'ug2',deal:'10 Sneden Ct, Spring Valley',client:'',agent:'Lazer F.',gift:'Custom cutting board',company:'GiftCo',shipped:true,tracking:'1Z999AA10123456784'},
  ])
  const [clGifts, setClGifts] = useState([
    {id:'cg1',deal:'112 Washington Ave, Suffern',client:'',agent:'Avraham W.',gift:'$200 Home Depot gift card + personalized house frame',company:'GiftPro',emailSent:false},
    {id:'cg2',deal:'84 Tennyson Drive, Nanuet',client:'David & Rachel Cohen',agent:'Isaac L.',gift:'Personalized cutting board + $100 restaurant gift card',company:'GiftPro',emailSent:false},
  ])

  function markShipped(id) {
    setUcGifts(prev=>prev.map(g=>g.id===id?{...g,shipped:true,tracking:'1Z'+Date.now().toString().slice(-8)}:g))
  }
  function sendEmail(id) {
    const g = clGifts.find(x=>x.id===id)
    if(g) window.location.href='mailto:?subject=Closing+Gift+Order+—+'+encodeURIComponent(g.deal)+'&body='+encodeURIComponent('Please prepare:\n\nDeal: '+g.deal+'\nGift: '+g.gift+'\nAgent: '+g.agent+'\n\nThank you,\nTarget Team')
    setClGifts(prev=>prev.map(g=>g.id===id?{...g,emailSent:true}:g))
  }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="UC Gifts"     value={ucGifts.length}                          sub="On contract"   subColor="var(--purple)"/>
        <StatCard label="Shipped"      value={ucGifts.filter(g=>g.shipped).length}     sub="Sent"          subColor="var(--green)"/>
        <StatCard label="Closing Gifts" value={clGifts.length}                         sub="On close"      subColor="#D97706"/>
        <StatCard label="Emails Sent"  value={clGifts.filter(g=>g.emailSent).length}   sub="To gift company" subColor="var(--teal)"/>
      </Grid4>

      <Grid2>
        <Card>
          <CardHeader>Under Contract Gifts <span style={{color:'var(--muted)',fontSize:'11px',fontWeight:400}}>Triggered on UC</span></CardHeader>
          {ucGifts.map(g=>(
            <div key={g.id} style={{padding:'13px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'12px',fontWeight:800,marginBottom:'3px'}}>{g.deal}</div>
              {g.client && <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'3px'}}>Client: {g.client}</div>}
              <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'8px'}}>Agent: {g.agent} · Gift: <strong style={{color:'var(--text)'}}>{g.gift}</strong></div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'10px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',background:g.shipped?'#F0FDF4':'#FFFBEB',color:g.shipped?'#16A34A':'#D97706'}}>{g.shipped?'Shipped':'Pending'}</span>
                {g.shipped
                  ? <a href={'https://www.google.com/search?q='+encodeURIComponent(g.tracking)} target="_blank" rel="noreferrer" style={{fontSize:'10px',color:'var(--teal)'}}>Track: {g.tracking}</a>
                  : <Btn size="xs" onClick={()=>markShipped(g.id)}>Mark Shipped</Btn>
                }
              </div>
            </div>
          ))}
          <div style={{padding:'10px 14px'}}>
            <Btn style={{width:'100%',fontSize:'11px'}} onClick={()=>alert('Add UC gift form coming soon!')}>+ Add UC Gift</Btn>
          </div>
        </Card>

        <Card>
          <CardHeader>Closing Gifts <span style={{color:'var(--muted)',fontSize:'11px',fontWeight:400}}>Triggered on Close</span></CardHeader>
          {clGifts.map(g=>(
            <div key={g.id} style={{padding:'13px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'12px',fontWeight:800,marginBottom:'3px'}}>{g.deal}</div>
              {g.client && <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'3px'}}>Client: {g.client}</div>}
              <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'8px'}}>Agent: {g.agent} · Gift: <strong style={{color:'var(--text)'}}>{g.gift}</strong></div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'10px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',background:g.emailSent?'#F0FDF4':'var(--dim)',color:g.emailSent?'#16A34A':'var(--muted)'}}>{g.emailSent?'Email Sent':'Not Sent'}</span>
                <Btn size="xs" variant={g.emailSent?'ghost':'primary'} onClick={()=>sendEmail(g.id)}>Email {g.company}</Btn>
              </div>
            </div>
          ))}
          <div style={{padding:'10px 14px'}}>
            <Btn style={{width:'100%',fontSize:'11px'}} onClick={()=>alert('Add closing gift form coming soon!')}>+ Add Closing Gift</Btn>
          </div>
        </Card>
      </Grid2>
    </div>
  )
}
