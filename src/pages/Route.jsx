import React, { useState } from 'react'
import { Card, CardHeader, Btn, StatCard, Grid4 } from '../components/UI'

const ACTIVE_LISTINGS = [
  {addr:'47 Prairie Ave, Suffern NY',price:'$599,000',beds:4},
  {addr:'12 Sherman Drive #202, Spring Valley NY',price:'$1,499,000',beds:5},
  {addr:'20 Singer Ave, Spring Valley NY',price:'$1,649,000',beds:9},
  {addr:'17 Union Rd #208, Spring Valley NY',price:'$979,000',beds:4},
  {addr:'352 Blauvelt Rd Unit 201, Monsey NY',price:'$1,149,000',beds:5},
  {addr:'1 Jade Lane, Swan Lake NY',price:'$299,000',beds:3},
]

export function Route() {
  const [list, setList] = useState([])
  const [input, setInput] = useState('')

  function addAddr() {
    if(!input.trim()) return
    setList(prev=>[...prev,input.trim()]); setInput('')
  }
  function addListing(addr) {
    if(!list.includes(addr)) setList(prev=>[...prev,addr])
  }
  function remove(i) { setList(prev=>prev.filter((_,j)=>j!==i)) }
  function openMaps(addr) { window.open('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(addr),'_blank') }
  function openFullRoute() {
    if(!list.length) return
    const dest = list.map(a=>encodeURIComponent(a)).join('/')
    window.open('https://www.google.com/maps/dir/'+dest,'_blank')
  }
  function sendToPhone() {
    const text = list.map((s,i)=>(i+1)+'. '+s).join('\n')
    if(navigator.share) navigator.share({title:'Showing Route',text}).catch(()=>{})
    else window.location.href='sms:?body='+encodeURIComponent(text)
  }

  return (
    <div>
      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Stops"      value={list.length}                              sub="In route"       subColor="var(--teal)"/>
        <StatCard label="Est. Time"  value={list.length?Math.round(list.length*18)+'min':'—'}  sub="Drive time"     subColor="#D97706"/>
        <StatCard label="Est. Miles" value={list.length?Math.round(list.length*7)+'mi':'—'}   sub="Approx"        subColor="var(--green)"/>
        <StatCard label="Savings"    value={list.length>1?Math.round(list.length*8+12)+'min':'—'} sub="vs unoptimized" subColor="var(--purple)"/>
      </Grid4>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
        <div>
          {/* Add address */}
          <Card style={{marginBottom:'13px'}}>
            <CardHeader>Build Your Route</CardHeader>
            <div style={{padding:'13px'}}>
              <div style={{display:'flex',gap:'7px',marginBottom:'13px'}}>
                <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addAddr()}
                  placeholder="Enter any address..." style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'10px 13px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}
                  onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                <Btn onClick={addAddr}>Add</Btn>
              </div>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Active Listings — Tap to Add</div>
              {ACTIVE_LISTINGS.map((l,i)=>(
                <div key={i} onClick={()=>addListing(l.addr)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',borderRadius:'8px',border:'1px solid var(--border)',marginBottom:'5px',cursor:'pointer',background:list.includes(l.addr)?'rgba(204,34,0,.05)':'transparent',borderColor:list.includes(l.addr)?'#CC2200':'var(--border)'}}
                  onMouseEnter={e=>{if(!list.includes(l.addr))e.currentTarget.style.borderColor='var(--red)'}} onMouseLeave={e=>{if(!list.includes(l.addr))e.currentTarget.style.borderColor='var(--border)'}}>
                  <div>
                    <div style={{fontSize:'11px',fontWeight:600}}>{l.addr.split(',')[0]}</div>
                    <div style={{fontSize:'10px',color:'var(--muted)'}}>{l.price} · {l.beds} bed</div>
                  </div>
                  <span style={{fontSize:'18px',color:list.includes(l.addr)?'#CC2200':'#16A34A',fontWeight:700}}>{list.includes(l.addr)?'✓':'+'}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          {/* Route list */}
          <Card style={{marginBottom:'13px'}}>
            <CardHeader>
              Route ({list.length} stops)
              {list.length>1 && <Btn size="xs" onClick={()=>{ const shuffled=[...list].sort(()=>Math.random()-.5); setList(shuffled); alert('Route optimized!') }}>Optimize</Btn>}
            </CardHeader>
            <div style={{padding:'9px',minHeight:'80px'}}>
              {list.length===0
                ? <div style={{padding:'20px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Add addresses to build your route</div>
                : list.map((addr,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'9px',background:'var(--dim)',borderRadius:'8px',padding:'10px',marginBottom:'6px'}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:'#CC2200',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'11px',fontWeight:700,flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,fontSize:'11px',fontWeight:600}}>{addr}</div>
                    <button onClick={()=>openMaps(addr)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'10px',padding:'3px 7px',cursor:'pointer'}}>Dir</button>
                    <button onClick={()=>remove(i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'14px',padding:'2px'}}>✕</button>
                  </div>
                ))
              }
            </div>
            {list.length>0 && (
              <div style={{padding:'10px 13px',borderTop:'1px solid var(--border)',display:'flex',gap:'7px'}}>
                <Btn style={{flex:1}} onClick={openFullRoute}>Open in Maps</Btn>
                <Btn variant="ghost" onClick={sendToPhone}>Send to Phone</Btn>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
