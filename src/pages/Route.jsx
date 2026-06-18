import React, { useState, useEffect, useRef } from 'react'
import { Card, CardHeader, Btn, Input } from '../components/UI'
import { AGENTS } from '../lib/constants'

const GMAPS_KEY = 'AIzaSyDPvAMfd7OoW5eCx1ILkDtCE8Fs4fwZIDw'

const SAVED_ROUTES = [
  { id:'r1', name:'Monday Showings', stops:['47 Prairie Ave, Suffern NY','352 Blauvelt Rd, Monsey NY','12 Sherman Dr, Spring Valley NY'] },
  { id:'r2', name:'Singer Ave Portfolio', stops:['40 Singer Ave #201, Spring Valley NY','40 Singer Ave #214, Spring Valley NY','20 Singer Ave, Spring Valley NY'] },
]

export function Route() {
  const [stops, setStops] = useState(['',''])
  const [agent, setAgent] = useState('')
  const [mapUrl, setMapUrl] = useState(null)
  const [embedUrl, setEmbedUrl] = useState(null)
  const [optimized, setOptimized] = useState(false)
  const [savedRoutes, setSavedRoutes] = useState(SAVED_ROUTES)
  const [routeName, setRouteName] = useState('')

  function addStop() { setStops(s => [...s, '']) }
  function removeStop(i) { if(stops.length > 2) setStops(s => s.filter((_,j)=>j!==i)) }
  function setStop(i, v) { setStops(s => s.map((x,j)=>j===i?v:x)) }

  function buildRoute() {
    const valid = stops.filter(s=>s.trim())
    if(valid.length < 2) return

    // Build Google Maps directions URL
    const origin      = encodeURIComponent(valid[0])
    const destination = encodeURIComponent(valid[valid.length-1])
    const waypoints   = valid.slice(1,-1).map(s=>encodeURIComponent(s)).join('|')

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints?'&waypoints='+waypoints:''}&travelmode=driving`

    // Embed URL for iframe preview
    const embedBase = `https://www.google.com/maps/embed/v1/directions?key=${GMAPS_KEY}&origin=${origin}&destination=${destination}${waypoints?'&waypoints='+waypoints:''}&mode=driving`

    setMapUrl(directionsUrl)
    setEmbedUrl(embedBase)
    setOptimized(true)
  }

  function saveRoute() {
    const valid = stops.filter(s=>s.trim())
    if(!routeName.trim() || valid.length < 2) return
    setSavedRoutes(prev => [...prev, { id:'r'+Date.now(), name:routeName.trim(), stops:valid }])
    setRouteName('')
  }

  function loadRoute(route) {
    setStops([...route.stops, ''])
    setMapUrl(null); setEmbedUrl(null); setOptimized(false)
  }

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>

        {/* Route Builder */}
        <Card>
          <CardHeader>🗺 Showing Route Builder</CardHeader>
          <div style={{padding:'16px'}}>
            <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'12px',lineHeight:1.6}}>
              Enter stops in order. We'll build an optimized route with Google Maps.
            </div>

            {stops.map((stop, i) => (
              <div key={i} style={{display:'flex',gap:'7px',alignItems:'center',marginBottom:'8px'}}>
                <div style={{width:24,height:24,borderRadius:'50%',background:i===0?'#16A34A':i===stops.length-1?'#CC2200':'#0EA5E9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {i===0?'S':i===stops.length-1?'E':i}
                </div>
                <input value={stop} onChange={e=>setStop(i,e.target.value)}
                  placeholder={i===0?'Starting address...':i===stops.length-1?'Final destination...':'Stop '+i+' address...'}
                  style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none'}}
                  onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                {stops.length > 2 && (
                  <button onClick={()=>removeStop(i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'16px',padding:'4px'}}>✕</button>
                )}
              </div>
            ))}

            <div style={{display:'flex',gap:'7px',marginTop:'10px',flexWrap:'wrap'}}>
              <Btn size="sm" variant="ghost" onClick={addStop}>+ Add Stop</Btn>
              <select value={agent} onChange={e=>setAgent(e.target.value)}
                style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 10px',outline:'none'}}>
                <option value="">All agents</option>
                {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>

            {/* Save route name */}
            <div style={{display:'flex',gap:'7px',marginTop:'10px'}}>
              <input value={routeName} onChange={e=>setRouteName(e.target.value)}
                placeholder="Route name (to save)..."
                style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 12px',outline:'none'}}/>
              <Btn size="sm" variant="ghost" onClick={saveRoute} disabled={!routeName.trim()}>Save</Btn>
            </div>

            <div style={{display:'flex',gap:'7px',marginTop:'12px'}}>
              <Btn style={{flex:1}} onClick={buildRoute}>🗺 Build Route</Btn>
              {mapUrl && (
                <a href={mapUrl} target="_blank" rel="noreferrer">
                  <Btn variant="ghost">Open in Maps ↗</Btn>
                </a>
              )}
            </div>

            {optimized && mapUrl && (
              <div style={{background:'rgba(22,163,74,.08)',border:'1px solid rgba(22,163,74,.25)',borderRadius:'9px',padding:'10px 12px',marginTop:'10px',fontSize:'12px',color:'#16A34A',fontWeight:600,display:'flex',gap:'8px'}}>
                <span>✅</span>
                <span>Route ready — {stops.filter(s=>s.trim()).length} stops · Click "Open in Maps" for navigation</span>
              </div>
            )}
          </div>
        </Card>

        {/* Saved Routes */}
        <Card>
          <CardHeader>📋 Saved Routes</CardHeader>
          <div style={{padding:'16px'}}>
            {savedRoutes.length === 0 ? (
              <div style={{textAlign:'center',color:'var(--muted)',fontSize:'12px',padding:'24px'}}>No saved routes yet</div>
            ) : savedRoutes.map(route => (
              <div key={route.id} style={{background:'var(--dim)',borderRadius:'10px',padding:'12px',marginBottom:'9px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'7px'}}>
                  <div style={{fontSize:'13px',fontWeight:700}}>{route.name}</div>
                  <div style={{display:'flex',gap:'5px'}}>
                    <Btn size="xs" onClick={()=>loadRoute(route)}>Load</Btn>
                    <Btn size="xs" variant="ghost" onClick={()=>{
                      const valid = route.stops.filter(s=>s.trim())
                      const origin = encodeURIComponent(valid[0])
                      const dest = encodeURIComponent(valid[valid.length-1])
                      const wp = valid.slice(1,-1).map(s=>encodeURIComponent(s)).join('|')
                      window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wp?'&waypoints='+wp:''}&travelmode=driving`,'_blank')
                    }}>Navigate ↗</Btn>
                  </div>
                </div>
                {route.stops.map((stop,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'4px',fontSize:'11px',color:'var(--muted)'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',background:i===0?'#16A34A':i===route.stops.length-1?'#CC2200':'#0EA5E9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:700,color:'#fff',flexShrink:0}}>
                      {i===0?'S':i===route.stops.length-1?'E':i}
                    </div>
                    {stop}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Map Preview */}
      {embedUrl && (
        <Card>
          <CardHeader>
            🗺 Route Preview
            <a href={mapUrl} target="_blank" rel="noreferrer">
              <Btn size="sm">Open Full Map ↗</Btn>
            </a>
          </CardHeader>
          <div style={{borderRadius:'0 0 12px 12px',overflow:'hidden'}}>
            <iframe
              src={embedUrl}
              width="100%"
              height="480"
              style={{border:'none',display:'block'}}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Route Map"
            />
          </div>
        </Card>
      )}
    </div>
  )
}
