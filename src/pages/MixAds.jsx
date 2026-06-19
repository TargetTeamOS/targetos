import { useApp } from '../context/AppContext'
import React, { useState } from 'react'
import { Card, CardHeader, Btn } from '../components/UI'

const LISTINGS = ['47 Prairie Ave, Suffern','12 Sherman Drive #202, Spring Valley','20 Singer Ave, Spring Valley','352 Blauvelt Rd Unit 201, Monsey','17 Union Rd #208, Spring Valley','84 Tennyson Drive, Nanuet']
const PRICES = [599000,1499000,1649000,1149000,979000,949000]

export function MixAds() {
  const { toast } = useApp()
  const [style, setStyle] = useState('white')
  const [selected, setSelected] = useState([])

  function toggle(i) {
    setSelected(prev => prev.includes(i) ? prev.filter(x=>x!==i) : [...prev,i])
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
      <div>
        <Card style={{marginBottom:'13px'}}>
          <CardHeader>Mix Ad Settings</CardHeader>
          <div style={{padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Ad Style</div>
            <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
              <div onClick={()=>setStyle('white')} style={{flex:1,background:style==='white'?'#fff':'var(--dim)',border:'2px solid '+(style==='white'?'#CC2200':'var(--border)'),borderRadius:'10px',padding:'12px',cursor:'pointer',textAlign:'center'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'#1B2B4B'}}>White Style</div>
                <div style={{fontSize:'10px',color:'#64748B'}}>Up to 9 listings</div>
              </div>
              <div onClick={()=>setStyle('navy')} style={{flex:1,background:style==='navy'?'#1B2B4B':'var(--dim)',border:'2px solid '+(style==='navy'?'#CC2200':'var(--border)'),borderRadius:'10px',padding:'12px',cursor:'pointer',textAlign:'center'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:style==='navy'?'#fff':'var(--text)'}}>Luxury Navy</div>
                <div style={{fontSize:'10px',color:style==='navy'?'rgba(255,255,255,.5)':'#64748B'}}>Up to 4 listings</div>
              </div>
            </div>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>
              Select Listings ({selected.length} selected)
            </div>
            {LISTINGS.map((l,i)=>(
              <div key={i} onClick={()=>toggle(i)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',borderRadius:'8px',border:'1px solid '+(selected.includes(i)?'#CC2200':'var(--border)'),marginBottom:'5px',cursor:'pointer',background:selected.includes(i)?'rgba(204,34,0,.04)':'transparent'}}>
                <div>
                  <div style={{fontSize:'11px',fontWeight:600}}>{l.split(',')[0]}</div>
                  <div style={{fontSize:'10px',color:'var(--muted)'}}>${PRICES[i].toLocaleString()}</div>
                </div>
                <span style={{fontSize:'16px',color:selected.includes(i)?'#CC2200':'#16A34A',fontWeight:700}}>{selected.includes(i)?'✓':'+'}</span>
              </div>
            ))}
            <Btn style={{width:'100%',marginTop:'12px'}} onClick={()=>selected.length ? toast('✅ Mix Ad generated for '+selected.length+' listing'+( selected.length>1?'s':'')+'! Right-click the preview to save as image.') : toast('Select at least one listing first','#DC2626')}>
              Generate Mix Ad
            </Btn>
          </div>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader>Mix Ad Preview</CardHeader>
        <div style={{padding:'14px'}}>
          <div style={{background:style==='white'?'#fff':'#1B2B4B',borderRadius:'10px',padding:'16px',fontFamily:'Arial,sans-serif',border:'1px solid '+(style==='white'?'#E1E5EA':'transparent')}}>
            <div style={{textAlign:'center',marginBottom:'14px'}}>
              <div style={{fontSize:'18px',fontWeight:900,color:style==='white'?'#1B2B4B':'#fff',letterSpacing:'-1px'}}>
                TARGET<span style={{color:'#CC2200'}}>TEAM</span>
              </div>
              <div style={{fontSize:'9px',color:style==='white'?'#64748B':'rgba(255,255,255,.5)',letterSpacing:'2px',textTransform:'uppercase'}}>Of Keller Williams Valley Realty</div>
              <div style={{borderTop:'2px solid #CC2200',margin:'8px 0'}}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:style==='white'?'1fr 1fr 1fr':'1fr 1fr',gap:'8px'}}>
              {(selected.length>0?selected:Array.from({length:style==='white'?6:4},(_,i)=>i)).slice(0,style==='white'?9:4).map((i,idx)=>(
                <div key={idx} style={{border:'1px solid '+(style==='white'?'#E1E5EA':'rgba(255,255,255,.1)'),borderRadius:'6px',overflow:'hidden'}}>
                  <div style={{background:style==='white'?'#F4F5F7':'rgba(255,255,255,.1)',height:'50px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'9px',color:style==='white'?'#64748B':'rgba(255,255,255,.4)'}}>PHOTO</div>
                  <div style={{padding:'6px'}}>
                    <div style={{fontSize:'9px',fontWeight:700,color:style==='white'?'#1B2B4B':'#fff'}}>{LISTINGS[i]?.split(',')[0]||'Listing '+(idx+1)}</div>
                    <div style={{fontSize:'10px',fontWeight:800,color:'#CC2200'}}>${(PRICES[i]||999000).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',marginTop:'12px',borderTop:'1px solid '+(style==='white'?'#E1E5EA':'rgba(255,255,255,.1)'),paddingTop:'10px'}}>
              <div style={{fontSize:'10px',color:style==='white'?'#1B2B4B':'#fff',fontWeight:700}}>845.424.1014 · @thetargetteam</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
