import React, { useState } from 'react'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, StatCard, Grid4, Badge } from '../components/UI'
import { AGENTS, SOURCES } from '../lib/constants'

const fmt$ = n => '$' + Number(n).toLocaleString()

export function Offers() {
  const [offers, setOffers] = useState([
    {id:'o1',listing:'84 Tennyson Drive, Nanuet',agent:'Isaac L.',buyer:'Moshe & Rivka Klein',amount:949000,date:'2026-06-10',status:'Pending',contingencies:'Mortgage, Inspection',preApproval:true,offerSheet:false,side:'Buyer'},
    {id:'o2',listing:'135 Route 306 Unit 111, Monsey',agent:'Lazer F.',buyer:'David Cohen',amount:630000,date:'2026-06-08',status:'Accepted',contingencies:'Mortgage',preApproval:true,offerSheet:true,side:'Buyer'},
    {id:'o3',listing:'12 Sherman Drive #202, Spring Valley',agent:'Joel R.',buyer:'Yoel Greenfeld',amount:1480000,date:'2026-06-12',status:'Pending',contingencies:'None',preApproval:true,offerSheet:false,side:'Buyer'},
  ])
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filtered = offers.filter(o=>{
    if(search && !(o.listing+o.buyer+o.agent).toLowerCase().includes(search.toLowerCase())) return false
    if(filterStatus && o.status!==filterStatus) return false
    return true
  })

  function accept(id) {
    setOffers(prev=>prev.map(o=>o.id===id?{...o,status:'Accepted'}:o))
    alert('Offer accepted! Celebration notification sent to team.')
  }
  function reject(id) { setOffers(prev=>prev.map(o=>o.id===id?{...o,status:'Rejected'}:o)) }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Total Offers"  value={offers.length}                          sub="All offers"     subColor="var(--teal)"/>
        <StatCard label="Pending"       value={offers.filter(o=>o.status==='Pending').length}   sub="Awaiting decision" subColor="#D97706"/>
        <StatCard label="Accepted"      value={offers.filter(o=>o.status==='Accepted').length}  sub="This month"     subColor="var(--green)"/>
        <StatCard label="Total Volume"  value={fmt$(offers.reduce((s,o)=>s+o.amount,0))}        sub="All offers"     subColor="var(--purple)"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',gap:'8px',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:'8px'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search offers..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'200px',fontFamily:'Inter,system-ui,sans-serif'}}/>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            <option value="">All Status</option>
            {['Pending','Accepted','Countered','Rejected'].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Log Offer</Btn>
      </div>

      {filtered.map(o=>(
        <Card key={o.id} style={{marginBottom:'13px'}}>
          <div style={{padding:'16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:800}}>{o.listing}</div>
                <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'3px'}}>Agent: {o.agent} · Buyer: {o.buyer}</div>
              </div>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <div style={{fontSize:'22px',fontWeight:900,color:'var(--red)'}}>{fmt$(o.amount)}</div>
                <Badge label={o.status}/>
              </div>
            </div>

            <Grid3 gap={8} style={{marginBottom:'12px'}}>
              {[['Date',o.date],['Side',o.side],['Contingencies',o.contingencies||'None']].map(([k,v])=>(
                <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'9px'}}>
                  <div style={{color:'var(--muted)',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                  <div style={{fontSize:'12px',fontWeight:700}}>{v}</div>
                </div>
              ))}
            </Grid3>

            <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'12px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                <div style={{width:14,height:14,borderRadius:'3px',background:o.preApproval?'#16A34A':'var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',color:'#fff'}}>{o.preApproval&&'✓'}</div>
                <span style={{fontSize:'11px',color:o.preApproval?'#16A34A':'var(--muted)'}}>Pre-approval {o.preApproval?'attached':'missing'}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
                <div style={{width:14,height:14,borderRadius:'3px',background:o.offerSheet?'#16A34A':'var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',color:'#fff'}}>{o.offerSheet&&'✓'}</div>
                <span style={{fontSize:'11px',color:o.offerSheet?'#16A34A':'var(--muted)'}}>Offer sheet {o.offerSheet?'attached':'missing'}</span>
              </div>
            </div>

            {o.status==='Pending' && (
              <div style={{display:'flex',gap:'7px'}}>
                <Btn size="sm" variant="green" onClick={()=>accept(o.id)}>Accept Offer</Btn>
                <Btn size="sm" variant="ghost" onClick={()=>{}}>Counter</Btn>
                <Btn size="sm" variant="danger" onClick={()=>reject(o.id)}>Reject</Btn>
              </div>
            )}
          </div>
        </Card>
      ))}

      {showAdd && (
        <Modal onClose={()=>setShowAdd(false)} maxWidth={520}>
          <ModalTitle onClose={()=>setShowAdd(false)}>Log Offer</ModalTitle>
          <Input label="Property Address *" value="" onChange={()=>{}} placeholder="84 Tennyson Drive, Nanuet NY"/>
          <Grid2 gap={10}><Input label="Buyer Name *" value="" onChange={()=>{}} placeholder="John & Jane Smith"/><Input label="Offer Amount ($)" value="" onChange={()=>{}} type="number" placeholder="949000"/></Grid2>
          <Grid2 gap={10}><Select label="Agent" value="" onChange={()=>{}} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/><Input label="Date" value={new Date().toISOString().split('T')[0]} onChange={()=>{}} type="date"/></Grid2>
          <Grid2 gap={10}><Select label="Status" value="Pending" onChange={()=>{}} options={['Pending','Accepted','Countered','Rejected']}/><Select label="Side" value="Buyer" onChange={()=>{}} options={['Buyer','Listing','Dual']}/></Grid2>
          <Input label="Contingencies" value="" onChange={()=>{}} placeholder="Mortgage, inspection, sale of home..."/>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={()=>{setShowAdd(false);alert('Offer logged!')}}>Save Offer</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
