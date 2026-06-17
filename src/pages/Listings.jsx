import React, { useState } from 'react'
import { AGENTS } from '../lib/constants'
import { logChange, logFieldChanges } from '../lib/activityLog'
import { RecordActivityFeed } from '../components/RecordActivityFeed'
import { Card, CardHeader, Badge, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, Grid4, StatCard } from '../components/UI'

const fmt$ = n => '$' + Number(n).toLocaleString()
const tSpent = l => (l.spend||[]).reduce((s,x) => s+x.a, 0)
const ADSPEND = ['Mix Ad','Luxury Ad','Full Page Ad','Photography','Drone Footage','Video Tour','Floor Plans','Twilight Images','Brochure','Artistic Full-Page Ad','Brochure Printing','Shul Posters','Other']
const ADSPEND_PRICES = {'Photography':350,'Luxury Ad':100,'Full Page Ad':365,'Drone Footage':75,'Video Tour':200,'Floor Plans':65,'Twilight Images':350,'Brochure':300,'Artistic Full-Page Ad':1350,'Brochure Printing':250,'Mix Ad':40,'Shul Posters':175}
const PTYPES = ['Condo','Single Family','Multi Family','New Construction','Land','Commercial','2 Family','3 Family','High Ranch','Ranch','Co-Op','Duplex','Side by Side','Summer Home']

const INIT_LISTINGS = [
  {id:'l1',addr:'47 Prairie Ave',city:'Suffern',state:'NY',zip:'10901',price:599000,type:'Single Family',beds:4,baths:'2',sqft:'1,568',tax:'$13,377/yr',status:'Active',agents:['Avraham Weinberger'],days:152,lock:'',mls:'https://www.targetreteam.com/homes-for-sale/NY/suffern/10901/47-prairie-ave/bid-38-953280',budget:2000,sellerName:'',spend:[{c:'Photography',a:350,d:'Jan 15'},{c:'Mix Ad',a:40,d:'Jan 20'},{c:'Shul Posters',a:175,d:'Feb 1'}],showings:[]},
  {id:'l2',addr:'17 Union Rd #208',city:'Spring Valley',state:'NY',zip:'10977',price:979000,type:'Condo',beds:4,baths:'2.5',sqft:'2,359',tax:'New Home',status:'Active',agents:['Eli Hoffman'],days:116,lock:'',mls:'',budget:2000,sellerName:'',spend:[{c:'Photography',a:350,d:'Feb 20'}],showings:[]},
  {id:'l3',addr:'40 Singer Ave #201',city:'Spring Valley',state:'NY',zip:'10977',price:1539000,type:'Condo',beds:8,baths:'6.5',sqft:'4,954',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:197,lock:'',mls:'',budget:4000,sellerName:'Singer Dev.',spend:[{c:'Photography',a:350,d:'Aug 31'},{c:'Luxury Ad',a:100,d:'Sep 10'}],showings:[]},
  {id:'l4',addr:'40 Singer Ave #214',city:'Spring Valley',state:'NY',zip:'10977',price:1599000,type:'Condo',beds:8,baths:'6.5',sqft:'4,746',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:197,lock:'1014',mls:'https://www.targetreteam.com/homes-for-sale/NY/spring-valley/10977/40-singer-ave-unit-214/bid-38-936672',budget:4000,sellerName:'Singer Dev.',spend:[{c:'Artistic Full-Page Ad',a:1350,d:'Apr 30'},{c:'Photography',a:350,d:'Apr 30'},{c:'Drone Footage',a:75,d:'Apr 30'},{c:'Floor Plans',a:65,d:'Apr 30'}],showings:[]},
  {id:'l5',addr:'20 Singer Ave',city:'Spring Valley',state:'NY',zip:'10977',price:1649000,type:'New Construction',beds:9,baths:'5.5',sqft:'4,357',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:59,lock:'',mls:'',budget:4000,sellerName:'Singer Dev.',spend:[{c:'Photography',a:350,d:'Apr 17'},{c:'Luxury Ad',a:100,d:'May 1'}],showings:[]},
  {id:'l6',addr:'352 Blauvelt Rd Unit 201',city:'Monsey',state:'NY',zip:'10952',price:1149000,type:'New Construction',beds:5,baths:'4',sqft:'2,800',tax:'New Home',status:'Active',agents:['Isaac Leibowitz','Mendy Jankovits'],days:237,lock:'123',mls:'',budget:3000,sellerName:'',spend:[{c:'Photography',a:350,d:'Oct 22'}],showings:[]},
  {id:'l7',addr:'352 Blauvelt Rd Unit 203',city:'Monsey',state:'NY',zip:'10952',price:1149000,type:'New Construction',beds:5,baths:'4',sqft:'2,800',tax:'New Home',status:'Active',agents:['Isaac Leibowitz','Mendy Jankovits'],days:237,lock:'543',mls:'',budget:3000,sellerName:'',spend:[],showings:[]},
  {id:'l8',addr:'12 Sherman Drive #202',city:'Spring Valley',state:'NY',zip:'10977',price:1499000,type:'Condo',beds:5,baths:'4',sqft:'4,744',tax:'New Home',status:'Active',agents:['Joel Rottenstein'],days:127,lock:'1014',mls:'https://www.targetreteam.com/homes-for-sale/NY/spring-valley/10977/12-sherman-dr-unit-202/bid-38-961011',budget:5000,sellerName:'Developer LLC',spend:[{c:'Photography',a:350,d:'Feb 9'},{c:'Artistic Full-Page Ad',a:1350,d:'Feb 15'},{c:'Drone Footage',a:75,d:'Feb 9'},{c:'Floor Plans',a:65,d:'Feb 9'},{c:'Brochure',a:300,d:'Feb 20'},{c:'Mix Ad',a:40,d:'Mar 3'}],showings:[]},
  {id:'l9',addr:'11 Lincoln St #201',city:'Spring Valley',state:'NY',zip:'10977',price:1575000,type:'Condo',beds:8,baths:'6',sqft:'4,632',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:46,lock:'',mls:'',budget:4000,sellerName:'',spend:[{c:'Photography',a:350,d:'Apr 30'},{c:'Luxury Ad',a:100,d:'May 5'}],showings:[]},
  {id:'l10',addr:'5 Mirror Lake Rd #201',city:'Spring Valley',state:'NY',zip:'10977',price:1599000,type:'Condo',beds:9,baths:'7',sqft:'4,777',tax:'New Home',status:'Active',agents:['Joel Rottenstein'],days:52,lock:'1014',mls:'',budget:4000,sellerName:'',spend:[],showings:[]},
  {id:'l11',addr:'1 Jade Lane',city:'Swan Lake',state:'NY',zip:'',price:299000,type:'Single Family',beds:3,baths:'2',sqft:'1,268',tax:'$6,132/yr',status:'Active',agents:['Joel Rottenstein'],days:63,lock:'',mls:'',budget:1500,sellerName:'',spend:[],showings:[]},
  {id:'l12',addr:'17 Union Rd #210',city:'Spring Valley',state:'NY',zip:'10977',price:979000,type:'Condo',beds:4,baths:'2.5',sqft:'',tax:'New Home',status:'Active',agents:['Eli Hoffman'],days:63,lock:'',mls:'',budget:2000,sellerName:'',spend:[],showings:[]},
  {id:'l13',addr:'135 Route 306 Unit 111',city:'Monsey',state:'NY',zip:'10952',price:639000,type:'Condo',beds:3,baths:'2',sqft:'1,215',tax:'$6,726/yr',status:'Accepted Offer',agents:['Lazer Farkas'],days:47,lock:'',mls:'',budget:2000,sellerName:'',spend:[{c:'Photography',a:350,d:'Apr 29'},{c:'Mix Ad',a:40,d:'May 5'}],showings:[]},
  {id:'l14',addr:'15 Warren Ct Unit #212',city:'Monsey',state:'NY',zip:'10952',price:1175000,type:'Condo',beds:5,baths:'4',sqft:'2,492',tax:'New Home',status:'Accepted Offer',agents:['Mendy Jankovits'],days:159,lock:'4152',mls:'',budget:3000,sellerName:'',spend:[],showings:[]},
  {id:'l15',addr:'8 First Street Unit 111',city:'Spring Valley',state:'NY',zip:'10977',price:749000,type:'Condo',beds:3,baths:'2',sqft:'1,205',tax:'New Home',status:'Accepted Offer',agents:['Mendy Jankovits'],days:49,lock:'',mls:'',budget:2000,sellerName:'',spend:[],showings:[]},
  {id:'l16',addr:'5 Pratt Street',city:'Haverstraw',state:'NY',zip:'10927',price:349000,type:'Single Family',beds:3,baths:'1',sqft:'1,020',tax:'$9,935/yr',status:'Accepted Offer',agents:['Avraham Weinberger'],days:152,lock:'',mls:'',budget:1500,sellerName:'',spend:[],showings:[]},
]

export function Listings() {
  const [view, setView] = useState('column')
  const [listings, setListings] = useState(INIT_LISTINGS)
  const [selected, setSelected] = useState(null)
  const [editListing, setEditListing] = useState(null)

  function updateListing(id, changes) {
    setListings(prev => prev.map(l => l.id===id ? {...l,...changes} : l))
    if(selected?.id === id) setSelected(prev => ({...prev,...changes}))
  }

  const active = listings.filter(l=>['Active','Accepted Offer'].includes(l.status))
  const uc     = listings.filter(l=>l.status==='Under Contract')
  const sold   = listings.filter(l=>l.status==='Sold')
  const totalVol = listings.reduce((s,l)=>s+l.price,0)

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
        <span style={{color:'var(--muted)',fontSize:'12px'}}>{listings.length} listings · OneKey MLS</span>
        <div style={{display:'flex',gap:'8px'}}>
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['column','Columns'],['list','List'],['grid','Grid']].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:'5px 12px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'12px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:view===v?'var(--panel)':'transparent',color:view===v?'var(--text)':'var(--muted)',boxShadow:view===v?'0 1px 3px rgba(0,0,0,.08)':'none'}}>{l}</button>
            ))}
          </div>
          <Btn size="sm" onClick={()=>setEditListing({id:'new',addr:'',city:'',state:'NY',zip:'',price:'',type:'Condo',beds:'',baths:'',sqft:'',tax:'',status:'Active',agents:[],days:0,lock:'',mls:'',budget:2000,sellerName:'',spend:[],showings:[]})}>+ New Listing</Btn>
        </div>
      </div>

      <Grid4 style={{marginBottom:'14px'}}>
        <StatCard label="Active & AO" value={active.length}    sub="On market"    subColor="var(--green)"/>
        <StatCard label="Under Contract" value={uc.length}     sub="In escrow"    subColor="var(--teal)"/>
        <StatCard label="Total Volume" value={fmt$(totalVol)}  sub="All listings" subColor="#D97706"/>
        <StatCard label="Sold YTD"     value={sold.length}     sub="Closed"       subColor="var(--red)"/>
      </Grid4>

      {view==='column' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'14px'}}>
          <ListingColumn title="Active & Accepted Offer" color="#16A34A" listings={active} onSelect={setSelected}/>
          <ListingColumn title="Under Contract" color="#2563EB" listings={uc} onSelect={setSelected}/>
          <ListingColumn title="Sold" color="#CC2200" listings={sold} onSelect={setSelected}/>
        </div>
      )}
      {view==='list' && (
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 80px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
            <div>Address</div><div>Type</div><div>Price</div><div>Beds/Baths</div><div>Agent</div><div>Status</div><div>Edit</div>
          </div>
          {listings.map(l=><ListingTableRow key={l.id} listing={l} onSelect={setSelected} onEdit={setEditListing}/>)}
        </Card>
      )}
      {view==='grid' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(265px,1fr))',gap:'14px'}}>
          {listings.map(l=><ListingCard key={l.id} listing={l} onSelect={setSelected}/>)}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <ListingDetail
          listing={selected}
          onClose={()=>setSelected(null)}
          onEdit={()=>{setEditListing({...selected});setSelected(null)}}
          onChange={updated=>updateListing(updated.id, updated)}
        />
      )}

      {/* Edit modal */}
      {editListing && (
        <ListingEditModal
          listing={editListing}
          onClose={()=>setEditListing(null)}
          onSave={updated=>{
            if(updated.id==='new'){
              const newL = {...updated, id:'l'+Date.now(), days:0, spend:[], showings:[]}
              setListings(prev=>[newL,...prev])
              logChange({ recordType:'listing', recordId:newL.id, recordName:newL.addr+', '+newL.city, action:'Created', agentName:'Admin' })
            } else {
              const original = listings.find(l=>l.id===updated.id)
              logFieldChanges({ recordType:'listing', recordId:updated.id, recordName:updated.addr+', '+updated.city, before:original, after:updated, agentName:'Admin' })
              updateListing(updated.id, updated)
            }
            setEditListing(null)
          }}
        />
      )}
    </div>
  )
}

// ─── LISTING EDIT MODAL ────────────────────────────────────────────
function ListingEditModal({ listing, onClose, onSave }) {
  const [form, setForm] = useState({...listing})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const isNew = listing.id === 'new'

  return (
    <Modal onClose={onClose} maxWidth={600}>
      <ModalTitle onClose={onClose}>{isNew ? 'New Listing' : 'Edit — ' + form.addr}</ModalTitle>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Property Details</div>
      <Input label="Address *" value={form.addr} onChange={e=>set('addr',e.target.value)} placeholder="47 Prairie Ave"/>
      <Grid3 gap={10}>
        <Input label="City"  value={form.city}  onChange={e=>set('city', e.target.value)} placeholder="Suffern"/>
        <Input label="State" value={form.state} onChange={e=>set('state',e.target.value)} placeholder="NY"/>
        <Input label="ZIP"   value={form.zip}   onChange={e=>set('zip',  e.target.value)} placeholder="10901"/>
      </Grid3>
      <Grid2 gap={10}>
        <Input label="List Price ($)" value={form.price} onChange={e=>set('price',parseFloat(e.target.value)||0)} type="number" placeholder="599000"/>
        <Select label="Property Type" value={form.type} onChange={e=>set('type',e.target.value)} options={PTYPES}/>
      </Grid2>
      <Grid3 gap={10}>
        <Input label="Bedrooms" value={form.beds}  onChange={e=>set('beds', e.target.value)} placeholder="4"/>
        <Input label="Bathrooms" value={form.baths} onChange={e=>set('baths',e.target.value)} placeholder="2"/>
        <Input label="Sqft"      value={form.sqft}  onChange={e=>set('sqft', e.target.value)} placeholder="1,568"/>
      </Grid3>
      <Grid2 gap={10}>
        <Input label="Tax / Year" value={form.tax} onChange={e=>set('tax',e.target.value)} placeholder="$13,377/yr or New Home"/>
        <Input label="Lockbox Code" value={form.lock||''} onChange={e=>set('lock',e.target.value)} placeholder="1234"/>
      </Grid2>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'10px 0 8px'}}>Listing Info</div>
      <Grid2 gap={10}>
        <Select label="Status" value={form.status} onChange={e=>set('status',e.target.value)} options={['Active','Accepted Offer','Under Contract','Sold']}/>
        <Select label="Agent" value={form.agents?.[0]||''} onChange={e=>set('agents',[e.target.value])} options={[{value:'',label:'Select agent...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="MLS Link" value={form.mls||''} onChange={e=>set('mls',e.target.value)} placeholder="https://..."/>
        <Input label="Seller Name" value={form.sellerName||''} onChange={e=>set('sellerName',e.target.value)} placeholder="John Smith"/>
      </Grid2>
      <Grid2 gap={10}>
        <Input label="Ad Budget ($)" value={form.budget} onChange={e=>set('budget',parseFloat(e.target.value)||0)} type="number" placeholder="2000"/>
        <Input label="Days Listed"   value={form.days}   onChange={e=>set('days',  parseInt(e.target.value)||0)}   type="number" placeholder="0"/>
      </Grid2>

      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'12px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>onSave(form)}>{isNew?'Create Listing':'Save Changes'}</Btn>
      </div>
    </Modal>
  )
}

function ListingColumn({ title, color, listings, onSelect }) {
  const total = listings.reduce((s,l)=>s+l.price,0)
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:color}}/>
          <span style={{fontSize:'13px',fontWeight:700}}>{title}</span>
          <span style={{background:color+'18',color,fontSize:'11px',fontWeight:700,padding:'2px 9px',borderRadius:'20px'}}>{listings.length}</span>
        </div>
        <span style={{fontSize:'11px',color:'var(--muted)'}}>{fmt$(total)}</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
        {listings.length===0
          ? <div style={{background:'var(--panel)',border:'1px dashed var(--border)',borderRadius:'12px',padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>No listings</div>
          : listings.map(l=><ListingCard key={l.id} listing={l} onSelect={onSelect} compact/>)
        }
      </div>
    </div>
  )
}

function ListingCard({ listing:l, onSelect, compact }) {
  const spent = tSpent(l)
  const pct = Math.min(spent/l.budget*100,100)
  const sc = {Active:{bg:'#F0FDF4',c:'#16A34A'},'Accepted Offer':{bg:'#FFFBEB',c:'#D97706'},'Under Contract':{bg:'#EFF6FF',c:'#2563EB'},Sold:{bg:'#FEF2F2',c:'#CC2200'}}[l.status]||{bg:'var(--dim)',c:'var(--muted)'}
  return (
    <div onClick={()=>onSelect(l)} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}
      onMouseEnter={e=>e.currentTarget.style.borderColor='#CC2200'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      <div style={{background:'var(--navy)',height:compact?50:70,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',position:'relative'}}>
        <span style={{fontSize:'10px',fontWeight:700,color:'rgba(255,255,255,.4)',letterSpacing:'1px'}}>{l.type.toUpperCase()}</span>
        <span style={{fontSize:'10px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',background:sc.bg,color:sc.c}}>{l.status}</span>
        <span style={{position:'absolute',bottom:5,left:10,fontSize:'9px',color:'rgba(255,255,255,.4)'}}>{l.days}d</span>
      </div>
      <div style={{padding:'12px'}}>
        <div style={{fontSize:'13px',fontWeight:800,marginBottom:'2px'}}>{l.addr}</div>
        <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'7px'}}>{l.city}, {l.state}</div>
        <div style={{fontSize:'22px',fontWeight:900,marginBottom:'8px'}}>{fmt$(l.price)}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'4px',marginBottom:'7px'}}>
          {[['Bed',l.beds],['Bath',l.baths],['Sqft',l.sqft||'—'],['Tax',l.tax?.split('/')[0]||'New']].map(x=>(
            <div key={x[0]} style={{background:'var(--dim)',borderRadius:'6px',padding:'5px 3px',textAlign:'center'}}>
              <div style={{fontSize:'8px',color:'var(--muted)',fontWeight:700}}>{x[0]}</div>
              <div style={{fontSize:'10px',fontWeight:700}}>{x[1]}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <span style={{fontSize:'10px',color:'var(--muted)'}}>{l.agents[0]?.split(' ').slice(-1)[0]}</span>
          <span style={{fontSize:'10px',color:pct>90?'#DC2626':pct>70?'#D97706':'#16A34A'}}>${spent}/${l.budget}</span>
        </div>
      </div>
    </div>
  )
}

function ListingTableRow({ listing:l, onSelect, onEdit }) {
  const sc = {Active:{bg:'#F0FDF4',c:'#16A34A'},'Accepted Offer':{bg:'#FFFBEB',c:'#D97706'},'Under Contract':{bg:'#EFF6FF',c:'#2563EB'},Sold:{bg:'#FEF2F2',c:'#CC2200'}}[l.status]||{bg:'var(--dim)',c:'var(--muted)'}
  return (
    <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 80px',padding:'11px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}
      onClick={()=>onSelect(l)}>
      <div><div style={{fontSize:'13px',fontWeight:700}}>{l.addr}, {l.city}</div><div style={{fontSize:'10px',color:'var(--muted)'}}>{l.days}d{l.lock?' · Lock: '+l.lock:''}</div></div>
      <div style={{fontSize:'12px',color:'var(--muted)'}}>{l.type}</div>
      <div style={{fontSize:'13px',fontWeight:700}}>{fmt$(l.price)}</div>
      <div style={{fontSize:'12px',color:'var(--muted)'}}>{l.beds}bd · {l.baths}ba</div>
      <div style={{fontSize:'11px',color:'var(--muted)'}}>{l.agents[0]?.split(' ').slice(-1)[0]||'—'}</div>
      <div><span style={{fontSize:'11px',fontWeight:600,padding:'3px 9px',borderRadius:'20px',background:sc.bg,color:sc.c}}>{l.status}</span></div>
      <div style={{display:'flex',gap:'5px'}} onClick={e=>e.stopPropagation()}>
        <button onClick={()=>onEdit(l)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'4px 8px',cursor:'pointer'}}>✏️</button>
      </div>
    </div>
  )
}

function ListingDetail({ listing:l, onClose, onEdit, onChange }) {
  const [tab, setTab] = useState('details')
  const [listing, setListing] = useState({...l})
  const spent = tSpent(listing)
  const remaining = listing.budget - spent
  const pct = Math.min(spent/listing.budget*100,100)
  const [newSpend, setNewSpend] = useState({c:ADSPEND[0],a:'',d:new Date().toISOString().split('T')[0]})
  const [newShowing, setNewShowing] = useState({buyer:'',date:'',agent:'',interest:'Hot',feedback:''})

  function addSpend(){
    if(!newSpend.a) return
    const updated={...listing,spend:[...listing.spend,{c:newSpend.c,a:parseFloat(newSpend.a),d:newSpend.d}]}
    setListing(updated); onChange(updated)
    setNewSpend({c:ADSPEND[0],a:'',d:new Date().toISOString().split('T')[0]})
  }
  function addShowing(){
    if(!newShowing.buyer) return
    const updated={...listing,showings:[...(listing.showings||[]),{...newShowing}]}
    setListing(updated); onChange(updated)
    setNewShowing({buyer:'',date:'',agent:'',interest:'Hot',feedback:''})
  }
  function changeStatus(s){const updated={...listing,status:s};setListing(updated);onChange(updated)}

  return (
    <Modal onClose={onClose} maxWidth={660}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',paddingBottom:'14px',borderBottom:'1px solid var(--border)'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>{listing.addr}</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{listing.city}, {listing.state} {listing.zip} · {listing.type}</div>
          <div style={{fontSize:'26px',fontWeight:900,color:'#CC2200',marginTop:'4px'}}>{fmt$(listing.price)}</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <select value={listing.status} onChange={e=>changeStatus(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'7px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            {['Active','Accepted Offer','Under Contract','Sold'].map(s=><option key={s}>{s}</option>)}
          </select>
          {/* EDIT BUTTON */}
          <Btn size="sm" variant="ghost" onClick={onEdit}>✏️ Edit</Btn>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'var(--muted)'}}>✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:'16px'}}>
        {[['details','Details'],['spend','Ad Spend'],['showings','Showings'],['activity','Activity Log']].map(([k,v])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 14px',background:'transparent',border:'none',fontFamily:'Inter,system-ui,sans-serif',fontSize:'12px',fontWeight:600,cursor:'pointer',color:tab===k?'#CC2200':'var(--muted)',borderBottom:tab===k?'2px solid #CC2200':'2px solid transparent'}}>
            {v}
          </button>
        ))}
      </div>

      <div style={{maxHeight:'430px',overflowY:'auto'}}>
        {tab==='details' && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              {[['Beds',listing.beds],['Baths',listing.baths],['Sqft',listing.sqft||'—'],['Tax/Year',listing.tax||'New Home'],['Lockbox',listing.lock||'N/A'],['Days Listed',listing.days],['Seller',listing.sellerName||'—'],['Agent(s)',listing.agents.join(', ')],['ZIP',listing.zip||'—']].map(([k,v])=>(
                <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px'}}>
                  <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                  <div style={{fontSize:'13px',fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:'7px',flexWrap:'wrap'}}>
              {listing.mls && <a href={listing.mls} target="_blank" rel="noreferrer"><Btn size="sm" variant="ghost">View on MLS ↗</Btn></a>}
              <Btn size="sm" variant="ghost" onClick={()=>{ const msg=`${listing.addr}, ${listing.city} ${listing.state}\n${listing.type} · ${listing.beds}bd · ${listing.baths}ba\n${fmt$(listing.price)}\nCall: 845.424.1014`; navigator.clipboard?.writeText(msg).then(()=>alert('Listing details copied!')).catch(()=>{ if(navigator.share) navigator.share({title:'Target Team Listing',text:msg})})}}>Share Listing</Btn>
              <Btn size="sm" onClick={()=>setTab('spend')}>+ Add Spend</Btn>
            </div>
          </>
        )}

        {tab==='spend' && (
          <>
            <div style={{display:'flex',gap:'14px',marginBottom:'12px'}}>
              {[['Spent','$'+spent,pct>90?'#DC2626':'var(--text)'],['Budget','$'+listing.budget,'var(--text)'],['Remaining','$'+remaining,remaining<0?'#DC2626':'#16A34A']].map(([k,v,c])=>(
                <div key={k} style={{flex:1,background:'var(--dim)',borderRadius:'9px',padding:'12px'}}>
                  <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',marginBottom:'4px'}}>{k}</div>
                  <div style={{fontSize:'20px',fontWeight:900,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:'var(--dim)',borderRadius:'99px',height:7,marginBottom:'14px',overflow:'hidden'}}>
              <div style={{background:pct>90?'#DC2626':pct>70?'#D97706':'#16A34A',borderRadius:'99px',height:7,width:pct+'%',transition:'width .5s'}}/>
            </div>
            <div style={{display:'flex',gap:'7px',marginBottom:'12px',flexWrap:'wrap'}}>
              <select value={newSpend.c} onChange={e=>{setNewSpend(s=>({...s,c:e.target.value,a:ADSPEND_PRICES[e.target.value]||s.a}))}} style={{flex:2,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif',minWidth:'120px'}}>
                {ADSPEND.map(a=><option key={a}>{a}</option>)}
              </select>
              <input type="number" placeholder="Amount $" value={newSpend.a} onChange={e=>setNewSpend(s=>({...s,a:e.target.value}))} style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif',minWidth:'80px'}}/>
              <Btn onClick={addSpend}>Add</Btn>
            </div>
            {listing.spend.map((s,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'13px'}}>
                <span>{s.c}</span><span style={{color:'var(--muted)'}}>{s.d}</span><span style={{fontWeight:700}}>${s.a}</span>
              </div>
            ))}
          </>
        )}

        {tab==='activity' && (
          <div style={{padding:'8px 0'}}>
            <RecordActivityFeed recordType="listing" recordId={listing.id}/>
          </div>
        )}

        {tab==='showings' && (
          <>
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'13px',marginBottom:'13px'}}>
              <div style={{fontSize:'12px',fontWeight:700,marginBottom:'9px'}}>Log Showing</div>
              <Grid2 gap={8}>
                <input placeholder="Buyer name" value={newShowing.buyer} onChange={e=>setNewShowing(s=>({...s,buyer:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
                <input type="date" value={newShowing.date} onChange={e=>setNewShowing(s=>({...s,date:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none'}}/>
              </Grid2>
              <Grid2 gap={8} style={{marginTop:'8px'}}>
                <select value={newShowing.interest} onChange={e=>setNewShowing(s=>({...s,interest:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none'}}>
                  {['Hot','Warm','Cold'].map(x=><option key={x}>{x}</option>)}
                </select>
                <input placeholder="Feedback" value={newShowing.feedback} onChange={e=>setNewShowing(s=>({...s,feedback:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
              </Grid2>
              <Btn style={{marginTop:'9px'}} onClick={addShowing}>Log Showing</Btn>
            </div>
            {(listing.showings||[]).length===0
              ? <div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'20px'}}>No showings logged yet</div>
              : (listing.showings||[]).map((s,i)=>(
                <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'11px',marginBottom:'8px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px'}}>
                    <span style={{fontSize:'13px',fontWeight:700}}>{s.buyer}</span>
                    <Badge label={s.interest}/>
                  </div>
                  <div style={{fontSize:'11px',color:'var(--muted)'}}>{s.date}</div>
                  {s.feedback&&<div style={{fontSize:'12px',marginTop:'4px'}}>{s.feedback}</div>}
                </div>
              ))
            }
          </>
        )}
      </div>
    </Modal>
  )
}
