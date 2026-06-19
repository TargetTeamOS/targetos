import { useApp } from '../context/AppContext'
import React, { useState } from 'react'
import { Card, CardHeader, Btn } from '../components/UI'

const LISTINGS_SHORT = [
  {addr:'47 Prairie Ave, Suffern NY',price:599000,type:'Single Family',beds:4,baths:'2',sqft:'1,568'},
  {addr:'12 Sherman Drive #202, Spring Valley NY',price:1499000,type:'Condo',beds:5,baths:'4',sqft:'4,744'},
  {addr:'84 Tennyson Drive, Nanuet NY',price:949000,type:'Single Family',beds:5,baths:'3',sqft:'3,330'},
  {addr:'17 Union Rd #208, Spring Valley NY',price:979000,type:'Condo',beds:4,baths:'2.5',sqft:'2,359'},
]
const fmt$ = n => '$' + Number(n).toLocaleString()
const TYPES = [['coming','Coming Soon','#1B2B4B'],['contract','Under Contract','#7C3AED'],['sold_listing','Listing Sold','#CC2200'],['sold_buyer','Buyer Closed','#E8650A']]

export function Cards() {
  const { toast } = useApp()
  const [cardType, setCardType] = useState('coming')
  const [listingIdx, setListingIdx] = useState(0)
  const listing = LISTINGS_SHORT[listingIdx]
  const headerBg = TYPES.find(t=>t[0]===cardType)?.[2]||'#1B2B4B'
  const headerText = TYPES.find(t=>t[0]===cardType)?.[1]||'Coming Soon'

  function download() {
    toast('Right-click the card preview and choose "Save image as" to download, or press Ctrl+P to print/save as PDF')
  }
  function share() {
    const msg = `Target Team — ${headerText}\n${listing.addr}\n${fmt$(listing.price)}\n845.424.1014\n@thetargetteam`
    if(navigator.share) navigator.share({title:'Target Team',text:msg}).catch(()=>{})
    else { navigator.clipboard?.writeText(msg).then(()=>toast('✅ Copied to clipboard!')).catch(()=>toast('Copy this manually: '+msg.substring(0,60),'#DC2626')) }
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}}>
      <div>
        <Card style={{marginBottom:'13px'}}>
          <CardHeader>Card Settings</CardHeader>
          <div style={{padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Card Type</div>
            <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'14px'}}>
              {TYPES.map(([k,l,c])=>(
                <div key={k} onClick={()=>setCardType(k)} style={{flex:'1 1 calc(50% - 6px)',background:cardType===k?c+'18':'var(--dim)',border:'1.5px solid '+(cardType===k?c:'var(--border)'),borderRadius:'8px',padding:'8px',cursor:'pointer',textAlign:'center',fontSize:'11px',fontWeight:cardType===k?700:400,color:'var(--text)',transition:'all .15s'}}>{l}</div>
              ))}
            </div>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'7px'}}>Listing</div>
            <select value={listingIdx} onChange={e=>setListingIdx(parseInt(e.target.value))} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px',outline:'none',marginBottom:'14px'}}>
              {LISTINGS_SHORT.map((l,i)=><option key={i} value={i}>{l.addr} — {fmt$(l.price)}</option>)}
            </select>
            <div style={{display:'flex',gap:'7px'}}>
              <Btn style={{flex:1}} onClick={download}>Download PNG</Btn>
              <Btn variant="ghost" onClick={share}>Share</Btn>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader>Card History</CardHeader>
          {[['Coming Soon — 47 Prairie Ave','Jun 7'],['Under Contract — 135 Route 306','Jun 5'],['Listing Sold — 47 Prairie Ave','May 29']].map((c,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{flex:1,fontSize:'12px',fontWeight:600}}>{c[0]}</div>
              <div style={{color:'var(--muted)',fontSize:'11px'}}>{c[1]}</div>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <CardHeader>Preview</CardHeader>
        <div style={{padding:'16px'}}>
          <div id="CARD_PREVIEW" style={{background:'#fff',borderRadius:'10px',overflow:'hidden',maxWidth:'360px',fontFamily:'Arial,sans-serif',boxShadow:'0 4px 16px rgba(0,0,0,.1)'}}>
            <div style={{background:headerBg,padding:'12px 16px'}}>
              <div style={{color:'#fff',fontSize:'16px',fontWeight:900,letterSpacing:'.5px'}}>{headerText.toUpperCase()}</div>
            </div>
            <div style={{padding:'10px 16px 6px',display:'flex',justifyContent:'flex-end'}}>
              <div style={{textAlign:'right'}}>
                <div style={{color:'#1B2B4B',fontSize:'18px',fontWeight:900,letterSpacing:'-1px',lineHeight:1}}>TAR<span style={{color:'#CC2200'}}>G</span>ET</div>
                <div style={{color:'#1B2B4B',fontSize:'11px',fontWeight:700,letterSpacing:'3px'}}>TEAM</div>
                <div style={{color:'#94A3B8',fontSize:'7px'}}>Of Keller Williams Valley Realty</div>
              </div>
            </div>
            <div style={{background:'#F4F5F7',height:'110px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#64748B',letterSpacing:'.5px'}}>PROPERTY PHOTO</div>
            <div style={{padding:'9px 16px'}}>
              <div style={{color:'#1B2B4B',fontSize:'12px',fontWeight:800}}>{listing.addr}</div>
              <div style={{color:'#64748B',fontSize:'10px'}}>{listing.type} · {listing.beds} Beds · {listing.baths} Baths · {listing.sqft} Sqft</div>
              {(cardType==='coming'||cardType==='contract') && <div style={{color:'#CC2200',fontSize:'13px',fontWeight:800,marginTop:'3px'}}>{fmt$(listing.price)}</div>}
            </div>
            <div style={{background:'#1B2B4B',padding:'8px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{color:'#fff',fontSize:'10px',fontWeight:700}}>845.424.1014</div>
              <div style={{color:'#F5A623',fontSize:'8px'}}>f/ig @thetargetteam</div>
            </div>
            <div style={{background:'#CC2200',padding:'4px 16px',textAlign:'center'}}>
              <div style={{color:'#fff',fontSize:'8px',fontWeight:700,letterSpacing:'1.5px'}}>EVERYTHING REAL ESTATE</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
