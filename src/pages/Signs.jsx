import React, { useState } from 'react'
import { Card, CardHeader, Btn, Input, Select } from '../components/UI'
import { AGENTS } from '../lib/constants'

const GMAPS_KEY = 'AIzaSyDPvAMfd7OoW5eCx1ILkDtCE8Fs4fwZIDw'

const SIGN_TYPES = ['For Sale','Under Contract','Sold','Coming Soon','Open House','Directional']
const SIGN_COLORS = {'For Sale':'#CC2200','Under Contract':'#2563EB','Sold':'#16A34A','Coming Soon':'#7C3AED','Open House':'#D97706','Directional':'#64748B'}

const INIT_SIGNS = [
  { id:'s1', addr:'47 Prairie Ave, Suffern NY 10901',         type:'For Sale',        agent:'Avraham Weinberger', installed:'2026-01-15', lat:41.1148, lng:-74.1496 },
  { id:'s2', addr:'12 Sherman Drive #202, Spring Valley NY',  type:'For Sale',        agent:'Joel Rottenstein',   installed:'2026-02-09', lat:41.1134, lng:-74.0442 },
  { id:'s3', addr:'135 Route 306, Monsey NY 10952',           type:'Under Contract',  agent:'Lazer Farkas',       installed:'2026-04-29', lat:41.1265, lng:-74.0699 },
  { id:'s4', addr:'40 Singer Ave, Spring Valley NY',          type:'For Sale',        agent:'Mendy Jankovits',    installed:'2026-08-31', lat:41.1100, lng:-74.0500 },
  { id:'s5', addr:'5 Pratt Street, Haverstraw NY',            type:'Under Contract',  agent:'Avraham Weinberger', installed:'2026-01-15', lat:41.2001, lng:-73.9657 },
]

export function Signs() {
  const [signs, setSigns] = useState(INIT_SIGNS)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ addr:'', type:'For Sale', agent:'', installed: new Date().toISOString().split('T')[0] })
  const [filterAgent, setFilterAgent] = useState('')
  const [filterType, setFilterType] = useState('')
  const [mapView, setMapView] = useState('list') // list | map

  const filtered = signs.filter(s => {
    if(filterAgent && s.agent !== filterAgent) return false
    if(filterType && s.type !== filterType) return false
    return true
  })

  // Build Google Maps embed with all sign markers
  const mapEmbedUrl = (() => {
    if(filtered.length === 0) return null
    // Use the first sign as center
    const center = filtered[0]
    const markers = filtered.map(s => `markers=color:${encodeURIComponent(SIGN_COLORS[s.type]||'red')}%7Clabel:${s.type[0]}%7C${s.lat},${s.lng}`).join('&')
    return `https://www.google.com/maps/embed/v1/view?key=${GMAPS_KEY}&center=${center.lat},${center.lng}&zoom=11`
  })()

  // Search URL for directions to a sign
  function getDirectionsUrl(sign) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sign.addr)}&travelmode=driving`
  }

  function addSign() {
    if(!form.addr.trim()) return
    setSigns(prev => [...prev, { id:'s'+Date.now(), ...form, lat:41.12, lng:-74.05 }])
    setForm({ addr:'', type:'For Sale', agent:'', installed:new Date().toISOString().split('T')[0] })
    setShowAdd(false)
  }

  return (
    <div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
        {SIGN_TYPES.slice(0,4).map(type => (
          <div key={type} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'13px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{type}</div>
            <div style={{fontSize:'24px',fontWeight:900,color:SIGN_COLORS[type]||'#CC2200'}}>{signs.filter(s=>s.type===type).length}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)}
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none'}}>
            <option value="">All Agents</option>
            {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)}
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none'}}>
            <option value="">All Types</option>
            {SIGN_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
          <span style={{color:'var(--muted)',fontSize:'12px',alignSelf:'center'}}>{filtered.length} signs</span>
        </div>
        <div style={{display:'flex',gap:'7px'}}>
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['list','List'],['map','Map']].map(([k,l])=>(
              <button key={k} onClick={()=>setMapView(k)} style={{padding:'5px 12px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:mapView===k?'var(--panel)':'transparent',color:mapView===k?'var(--text)':'var(--muted)'}}>{l}</button>
            ))}
          </div>
          <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Add Sign</Btn>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card style={{marginBottom:'14px',padding:'16px'}}>
          <div style={{fontSize:'13px',fontWeight:700,marginBottom:'12px'}}>Add Sign</div>
          <Input label="Property Address" value={form.addr} onChange={e=>setForm(f=>({...f,addr:e.target.value}))} placeholder="47 Prairie Ave, Suffern NY 10901"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'12px'}}>
            <Select label="Sign Type" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} options={SIGN_TYPES}/>
            <Select label="Agent" value={form.agent} onChange={e=>setForm(f=>({...f,agent:e.target.value}))} options={[{value:'',label:'Select...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
            <Input label="Install Date" value={form.installed} onChange={e=>setForm(f=>({...f,installed:e.target.value}))} type="date"/>
          </div>
          <div style={{display:'flex',gap:'7px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn size="sm" onClick={addSign}>Add Sign</Btn>
          </div>
        </Card>
      )}

      {/* Map View */}
      {mapView==='map' && (
        <Card style={{marginBottom:'14px'}}>
          <CardHeader>
            🗺 Sign Locations — Rockland County
            <a href={`https://www.google.com/maps/search/?api=1&query=real+estate+signs+rockland+county+ny`} target="_blank" rel="noreferrer">
              <Btn size="sm" variant="ghost">Open in Google Maps ↗</Btn>
            </a>
          </CardHeader>
          {/* Signs list with navigation links */}
          <div style={{padding:'14px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'10px',borderBottom:'1px solid var(--border)'}}>
            {filtered.map(sign=>(
              <div key={sign.id} style={{background:'var(--dim)',borderRadius:'10px',padding:'11px',border:'2px solid '+(SIGN_COLORS[sign.type]||'#CC2200')+'30'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'5px'}}>
                  <span style={{fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px',background:(SIGN_COLORS[sign.type]||'#CC2200')+'18',color:SIGN_COLORS[sign.type]||'#CC2200'}}>{sign.type}</span>
                  <a href={getDirectionsUrl(sign)} target="_blank" rel="noreferrer">
                    <span style={{fontSize:'10px',color:'#0EA5E9',cursor:'pointer',fontWeight:600}}>Directions ↗</span>
                  </a>
                </div>
                <div style={{fontSize:'12px',fontWeight:700,marginBottom:'2px'}}>{sign.addr}</div>
                <div style={{fontSize:'10px',color:'var(--muted)'}}>{sign.agent?.split(' ').slice(-1)[0]} · {sign.installed}</div>
              </div>
            ))}
          </div>
          {/* Embedded map showing the area */}
          <div style={{borderRadius:'0 0 12px 12px',overflow:'hidden'}}>
            <iframe
              src={`https://www.google.com/maps/embed/v1/search?key=${GMAPS_KEY}&q=real+estate+listings+in+Rockland+County+NY&zoom=11`}
              width="100%" height="400" style={{border:'none',display:'block'}}
              allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              title="Sign Tracker Map"
            />
          </div>
        </Card>
      )}

      {/* List View */}
      {mapView==='list' && (
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 100px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
            <div>Address</div><div>Type</div><div>Agent</div><div>Installed</div><div>Actions</div>
          </div>
          {filtered.map(sign=>(
            <div key={sign.id} style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 100px',padding:'12px 16px',borderBottom:'1px solid var(--border)',alignItems:'center'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div>
                <div style={{fontSize:'13px',fontWeight:700}}>{sign.addr}</div>
              </div>
              <div><span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:(SIGN_COLORS[sign.type]||'#CC2200')+'18',color:SIGN_COLORS[sign.type]||'#CC2200'}}>{sign.type}</span></div>
              <div style={{fontSize:'12px',color:'var(--muted)'}}>{sign.agent?.split(' ').slice(-1)[0]||'—'}</div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{sign.installed}</div>
              <div style={{display:'flex',gap:'5px'}}>
                <a href={getDirectionsUrl(sign)} target="_blank" rel="noreferrer">
                  <button style={{background:'rgba(14,165,233,.1)',border:'1px solid rgba(14,165,233,.25)',borderRadius:'6px',color:'#0EA5E9',fontSize:'10px',fontWeight:700,padding:'5px 8px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>🗺</button>
                </a>
                <button onClick={()=>setSigns(prev=>prev.filter(s=>s.id!==sign.id))} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--muted)',fontSize:'13px',padding:'4px 7px',cursor:'pointer'}}>🗑</button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
