import React, { useState } from 'react'
import { Card, CardHeader, Btn, Modal, ModalTitle, Input, Select, Grid2, StatCard, Grid4 } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const SIGNS_DATA = [
  {id:'s1',addr:'47 Prairie Ave, Suffern',placed:'Jan 15',status:'Up',agent:'Avraham Weinberger',notes:'Front lawn',writer:'FOR SALE',listPrice:'$599,000',x:70,y:175},
  {id:'s2',addr:'12 Sherman Drive #202, Spring Valley',placed:'Feb 9',status:'Up',agent:'Joel Rottenstein',notes:'Near entrance',writer:'FOR SALE',listPrice:'$1,499,000',x:195,y:152},
  {id:'s3',addr:'20 Singer Ave, Spring Valley',placed:'Apr 17',status:'Up',agent:'Mendy Jankovits',notes:'Front of building',writer:'NEW CONSTRUCTION',listPrice:'$1,649,000',x:220,y:200},
  {id:'s4',addr:'17 Union Rd #208, Spring Valley',placed:'Feb 20',status:'Needs Check',agent:'Eli Hoffman',notes:'Check after construction',writer:'FOR SALE',listPrice:'$979,000',x:165,y:215},
  {id:'s5',addr:'352 Blauvelt Rd, Monsey',placed:'Oct 22',status:'Up',agent:'Isaac Leibowitz',notes:'Corner of development',writer:'NEW CONSTRUCTION',listPrice:'$1,149,000',x:110,y:150},
]

export function Signs() {
  const [signs, setSigns] = useState(SIGNS_DATA)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({addr:'',agent:'',writer:'FOR SALE',listPrice:'',notes:''})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function addSign() {
    if(!form.addr) return
    setSigns(prev=>[...prev,{id:'s'+Date.now(),addr:form.addr,placed:new Date().toLocaleDateString(),status:'Up',agent:form.agent,notes:form.notes,writer:form.writer,listPrice:form.listPrice,x:150+Math.random()*100,y:150+Math.random()*80}])
    setShowAdd(false); setForm({addr:'',agent:'',writer:'FOR SALE',listPrice:'',notes:''})
  }
  function remove(id) { setSigns(prev=>prev.filter(s=>s.id!==id)) }
  function toggleStatus(id) { setSigns(prev=>prev.map(s=>s.id===id?{...s,status:s.status==='Up'?'Needs Check':'Up'}:s)) }

  const up = signs.filter(s=>s.status==='Up').length
  const needs = signs.filter(s=>s.status==='Needs Check').length

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Total Signs"  value={signs.length} sub="Rockland County" subColor="var(--teal)"/>
        <StatCard label="Up"           value={up}           sub="Active"          subColor="var(--green)"/>
        <StatCard label="Needs Check"  value={needs}        sub="Attention needed" subColor="#DC2626"/>
        <StatCard label="Agents"       value={[...new Set(signs.map(s=>s.agent))].length} sub="With signs" subColor="#D97706"/>
      </Grid4>

      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>{signs.length} signs · Rockland County</span>
        <div style={{display:'flex',gap:'7px'}}>
          <Btn size="sm" variant="ghost" onClick={()=>{ const route=signs.map((s,i)=>(i+1)+'. '+s.addr).join('\n'); if(navigator.share)navigator.share({title:'Sign Inspection Route',text:route}).catch(()=>{}); else alert('Route:\n'+route) }}>Inspection Route</Btn>
          <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Add Sign</Btn>
        </div>
      </div>

      <Grid2>
        {/* Map */}
        <Card style={{marginBottom:'13px'}}>
          <CardHeader>Sign Map — Rockland County NY</CardHeader>
          <div style={{position:'relative',height:'280px',background:'var(--dim)',overflow:'hidden'}}>
            <svg width="100%" height="100%" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet">
              <path d="M0,120 Q100,105 200,115 Q280,120 400,100" stroke="var(--muted)" strokeWidth="2" fill="none" opacity=".4"/>
              <path d="M90,0 Q95,140 100,280" stroke="var(--muted)" strokeWidth="1.5" fill="none" opacity=".3"/>
              <path d="M200,0 Q205,140 210,280" stroke="var(--muted)" strokeWidth="1.5" fill="none" opacity=".3"/>
              <text x="30" y="40" fill="var(--muted)" fontSize="11" fontFamily="Inter,Arial">Suffern</text>
              <text x="150" y="80" fill="var(--muted)" fontSize="11" fontFamily="Inter,Arial">Spring Valley</text>
              <text x="270" y="55" fill="var(--muted)" fontSize="11" fontFamily="Inter,Arial">Nanuet</text>
              <text x="90" y="175" fill="var(--muted)" fontSize="11" fontFamily="Inter,Arial">Monsey</text>
              {signs.map((s,i)=>(
                <g key={s.id} style={{cursor:'pointer'}} onClick={()=>alert(s.addr+'\n'+s.writer+' · '+s.listPrice+'\n'+s.agent+'\nStatus: '+s.status)}>
                  <circle cx={s.x} cy={s.y} r="12" fill={s.status==='Up'?'#16A34A':'#D97706'} opacity=".9"/>
                  <text x={s.x} y={s.y+4} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" style={{pointerEvents:'none'}}>{i+1}</text>
                </g>
              ))}
            </svg>
            <div style={{position:'absolute',bottom:'8px',left:'8px',background:'var(--panel)',borderRadius:'8px',padding:'8px 11px',border:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'10px',color:'#16A34A',marginBottom:'3px'}}><div style={{width:9,height:9,borderRadius:'50%',background:'#16A34A'}}/> Up ({up})</div>
              <div style={{display:'flex',alignItems:'center',gap:'5px',fontSize:'10px',color:'#D97706'}}><div style={{width:9,height:9,borderRadius:'50%',background:'#D97706'}}/> Needs Check ({needs})</div>
            </div>
          </div>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>All Signs ({signs.length})</CardHeader>
          {signs.map((s,i)=>(
            <div key={s.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 16px',borderBottom:'1px solid var(--border)'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{width:32,height:32,borderRadius:'8px',background:s.status==='Up'?'#F0FDF4':'#FFFBEB',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:s.status==='Up'?'#16A34A':'#D97706',flexShrink:0}}>{i+1}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:'12px',fontWeight:700}}>{s.addr.split(',')[0]}</div>
                <div style={{fontSize:'10px',color:'var(--muted)'}}>{s.writer} · {s.listPrice} · {s.agent.split(' ')[0]}</div>
                <div style={{fontSize:'10px',color:'var(--muted)'}}>Placed {s.placed}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'5px',alignItems:'flex-end'}}>
                <span onClick={()=>toggleStatus(s.id)} style={{fontSize:'10px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',cursor:'pointer',background:s.status==='Up'?'#F0FDF4':'#FFFBEB',color:s.status==='Up'?'#16A34A':'#D97706'}}>{s.status}</span>
                <div style={{display:'flex',gap:'4px'}}>
                  <button onClick={()=>window.open('https://www.google.com/maps/search/'+encodeURIComponent(s.addr),'_blank')} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'10px',padding:'3px 7px',cursor:'pointer'}}>Dir</button>
                  <button onClick={()=>remove(s.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'14px',padding:'2px'}}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </Grid2>

      {showAdd && (
        <Modal onClose={()=>setShowAdd(false)} maxWidth={420}>
          <ModalTitle onClose={()=>setShowAdd(false)}>Add Sign</ModalTitle>
          <Input label="Property Address *" value={form.addr} onChange={e=>set('addr',e.target.value)} placeholder="47 Prairie Ave, Suffern"/>
          <Grid2 gap={10}>
            <Select label="Agent" value={form.agent} onChange={e=>set('agent',e.target.value)} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
            <Select label="Sign Writer" value={form.writer} onChange={e=>set('writer',e.target.value)} options={['FOR SALE','NEW CONSTRUCTION','UNDER CONTRACT','SOLD']}/>
          </Grid2>
          <Grid2 gap={10}>
            <Input label="List Price" value={form.listPrice} onChange={e=>set('listPrice',e.target.value)} placeholder="$599,000"/>
            <Input label="Notes" value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Front lawn, corner..."/>
          </Grid2>
          <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'8px'}}>
            <Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn onClick={addSign}>Add Sign</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
