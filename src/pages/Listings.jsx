import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import { AGENTS } from '../lib/constants'
import { Card, CardHeader, Badge, Btn, Modal, ModalTitle, Input, Select, Grid2, Grid3, Grid4, StatCard } from '../components/UI'
import { BulkUpload } from '../components/BulkUpload'
import { logChange, logFieldChanges } from '../lib/activityLog'
import { RecordActivityFeed } from '../components/RecordActivityFeed'

const fmt$ = n => '$' + Number(n).toLocaleString()
const tSpent = l => (l.spend||[]).reduce((s,x)=>s+x.a,0)

const PTYPES = ['Condo','Single Family','Multi Family','New Construction','Land','Commercial','2 Family','3 Family','4 Family','High Ranch','Ranch','Co-Op','Duplex','Side by Side','Summer Home']
const ADSPEND = ['Mix Ad','Luxury Ad','Full Page Ad','Photography','Drone Footage','Video Tour','Floor Plans','Twilight Images','Brochure','Artistic Full-Page Ad','Brochure Printing','Shul Posters','Other']
const ADSPEND_PRICES = {'Photography':350,'Luxury Ad':100,'Mix Ad':40,'Artistic Full-Page Ad':1350,'Drone Footage':75,'Floor Plans':65,'Brochure':300}
const STATUSES = ['Active','Accepted Offer','Under Contract','Sold','Expired','Withdrawn','Coming Soon']
const STATUS_COLOR = {'Active':'#16A34A','Accepted Offer':'#D97706','Under Contract':'#2563EB','Sold':'#CC2200','Expired':'#94A3B8','Withdrawn':'#94A3B8','Coming Soon':'#7C3AED'}

const INIT_LISTINGS = [
  {id:'l1',addr:'47 Prairie Ave',city:'Suffern',state:'NY',zip:'10901',price:599000,type:'Single Family',beds:4,baths:'2',sqft:'1,568',tax:'$13,377/yr',status:'Active',agents:['Avraham Weinberger'],days:152,lock:'',mls:'https://www.targetreteam.com/homes-for-sale/NY/suffern/10901/47-prairie-ave/bid-38-953280',budget:2000,sellerName:'',spend:[{c:'Photography',a:350,d:'Jan 15'},{c:'Mix Ad',a:40,d:'Jan 20'},{c:'Shul Posters',a:175,d:'Feb 1'}],showings:[],notes:''},
  {id:'l2',addr:'17 Union Rd #208',city:'Spring Valley',state:'NY',zip:'10977',price:979000,type:'Condo',beds:4,baths:'2.5',sqft:'2,359',tax:'New Home',status:'Active',agents:['Eli Hoffman'],days:116,lock:'',mls:'',budget:2000,sellerName:'',spend:[{c:'Photography',a:350,d:'Feb 20'}],showings:[],notes:''},
  {id:'l3',addr:'40 Singer Ave #201',city:'Spring Valley',state:'NY',zip:'10977',price:1539000,type:'Condo',beds:8,baths:'6.5',sqft:'4,954',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:197,lock:'',mls:'',budget:4000,sellerName:'Singer Dev.',spend:[{c:'Photography',a:350,d:'Aug 31'},{c:'Luxury Ad',a:100,d:'Sep 10'}],showings:[],notes:'Singer Development building'},
  {id:'l4',addr:'40 Singer Ave #214',city:'Spring Valley',state:'NY',zip:'10977',price:1599000,type:'Condo',beds:8,baths:'6.5',sqft:'4,746',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:197,lock:'1014',mls:'https://www.targetreteam.com/homes-for-sale/NY/spring-valley/10977/40-singer-ave-unit-214/bid-38-936672',budget:4000,sellerName:'Singer Dev.',spend:[{c:'Artistic Full-Page Ad',a:1350,d:'Apr 30'},{c:'Photography',a:350,d:'Apr 30'},{c:'Drone Footage',a:75,d:'Apr 30'},{c:'Floor Plans',a:65,d:'Apr 30'}],showings:[],notes:''},
  {id:'l5',addr:'20 Singer Ave',city:'Spring Valley',state:'NY',zip:'10977',price:1649000,type:'New Construction',beds:9,baths:'5.5',sqft:'4,357',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:59,lock:'',mls:'',budget:4000,sellerName:'Singer Dev.',spend:[{c:'Photography',a:350,d:'Apr 17'},{c:'Luxury Ad',a:100,d:'May 1'}],showings:[],notes:''},
  {id:'l6',addr:'352 Blauvelt Rd Unit 201',city:'Monsey',state:'NY',zip:'10952',price:1149000,type:'New Construction',beds:5,baths:'4',sqft:'2,800',tax:'New Home',status:'Active',agents:['Isaac Leibowitz','Mendy Jankovits'],days:237,lock:'123',mls:'',budget:3000,sellerName:'',spend:[{c:'Photography',a:350,d:'Oct 22'}],showings:[],notes:''},
  {id:'l7',addr:'352 Blauvelt Rd Unit 203',city:'Monsey',state:'NY',zip:'10952',price:1149000,type:'New Construction',beds:5,baths:'4',sqft:'2,800',tax:'New Home',status:'Active',agents:['Isaac Leibowitz','Mendy Jankovits'],days:237,lock:'543',mls:'',budget:3000,sellerName:'',spend:[],showings:[],notes:''},
  {id:'l8',addr:'12 Sherman Drive #202',city:'Spring Valley',state:'NY',zip:'10977',price:1499000,type:'Condo',beds:5,baths:'4',sqft:'4,744',tax:'New Home',status:'Active',agents:['Joel Rottenstein'],days:127,lock:'1014',mls:'https://www.targetreteam.com/homes-for-sale/NY/spring-valley/10977/12-sherman-dr-unit-202/bid-38-961011',budget:5000,sellerName:'Developer LLC',spend:[{c:'Photography',a:350,d:'Feb 9'},{c:'Artistic Full-Page Ad',a:1350,d:'Feb 15'},{c:'Drone Footage',a:75,d:'Feb 9'},{c:'Floor Plans',a:65,d:'Feb 9'},{c:'Brochure',a:300,d:'Feb 20'},{c:'Mix Ad',a:40,d:'Mar 3'}],showings:[],notes:''},
  {id:'l9',addr:'11 Lincoln St #201',city:'Spring Valley',state:'NY',zip:'10977',price:1575000,type:'Condo',beds:8,baths:'6',sqft:'4,632',tax:'New Home',status:'Active',agents:['Mendy Jankovits'],days:46,lock:'',mls:'',budget:4000,sellerName:'',spend:[{c:'Photography',a:350,d:'Apr 30'},{c:'Luxury Ad',a:100,d:'May 5'}],showings:[],notes:''},
  {id:'l10',addr:'5 Mirror Lake Rd #201',city:'Spring Valley',state:'NY',zip:'10977',price:1599000,type:'Condo',beds:9,baths:'7',sqft:'4,777',tax:'New Home',status:'Active',agents:['Joel Rottenstein'],days:52,lock:'1014',mls:'',budget:4000,sellerName:'',spend:[],showings:[],notes:''},
  {id:'l11',addr:'1 Jade Lane',city:'Swan Lake',state:'NY',zip:'',price:299000,type:'Single Family',beds:3,baths:'2',sqft:'1,268',tax:'$6,132/yr',status:'Active',agents:['Joel Rottenstein'],days:63,lock:'',mls:'',budget:1500,sellerName:'',spend:[],showings:[],notes:''},
  {id:'l12',addr:'17 Union Rd #210',city:'Spring Valley',state:'NY',zip:'10977',price:979000,type:'Condo',beds:4,baths:'2.5',sqft:'',tax:'New Home',status:'Active',agents:['Eli Hoffman'],days:63,lock:'',mls:'',budget:2000,sellerName:'',spend:[],showings:[],notes:''},
  {id:'l13',addr:'135 Route 306 Unit 111',city:'Monsey',state:'NY',zip:'10952',price:639000,type:'Condo',beds:3,baths:'2',sqft:'1,215',tax:'$6,726/yr',status:'Accepted Offer',agents:['Lazer Farkas'],days:47,lock:'',mls:'',budget:2000,sellerName:'',spend:[{c:'Photography',a:350,d:'Apr 29'},{c:'Mix Ad',a:40,d:'May 5'}],showings:[],notes:''},
  {id:'l14',addr:'15 Warren Ct Unit #212',city:'Monsey',state:'NY',zip:'10952',price:1175000,type:'Condo',beds:5,baths:'4',sqft:'2,492',tax:'New Home',status:'Accepted Offer',agents:['Mendy Jankovits'],days:159,lock:'4152',mls:'',budget:3000,sellerName:'',spend:[],showings:[],notes:''},
  {id:'l15',addr:'8 First Street Unit 111',city:'Spring Valley',state:'NY',zip:'10977',price:749000,type:'Condo',beds:3,baths:'2',sqft:'1,205',tax:'New Home',status:'Accepted Offer',agents:['Mendy Jankovits'],days:49,lock:'',mls:'',budget:2000,sellerName:'',spend:[],showings:[],notes:''},
  {id:'l16',addr:'5 Pratt Street',city:'Haverstraw',state:'NY',zip:'10927',price:349000,type:'Single Family',beds:3,baths:'1',sqft:'1,020',tax:'$9,935/yr',status:'Accepted Offer',agents:['Avraham Weinberger'],days:152,lock:'',mls:'',budget:1500,sellerName:'',spend:[],showings:[],notes:''},
]

export function Listings() {
  const { state } = useApp()
  const [listings, setListings] = useState(INIT_LISTINGS)
  const [view, setView] = useState('board') // board | list | grid
  const [filterAgent, setFilterAgent] = useState('')
  const [filterStatus, setFilterStatus] = useState('active') // active | all | sold
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [editListing, setEditListing] = useState(null)
  const [showBulk, setShowBulk] = useState(false)

  function updateListing(id, changes) {
    setListings(prev => prev.map(l => l.id===id ? {...l,...changes} : l))
    if(selected?.id===id) setSelected(prev => ({...prev,...changes}))
  }

  const currentAgent = state.currentAgent
  const isAdmin = currentAgent?.role === 'admin' || currentAgent?.role === 'secretary'

  // Filter logic
  const filtered = listings.filter(l => {
    if(filterAgent && !l.agents.includes(filterAgent)) return false
    if(search && !(l.addr+' '+l.city).toLowerCase().includes(search.toLowerCase())) return false
    if(filterStatus === 'active') return ['Active','Accepted Offer','Coming Soon'].includes(l.status)
    if(filterStatus === 'contract') return ['Under Contract'].includes(l.status)
    if(filterStatus === 'sold') return ['Sold','Expired','Withdrawn'].includes(l.status)
    return true // 'all'
  })

  // Stats
  const active = listings.filter(l=>l.status==='Active').length
  const ao = listings.filter(l=>l.status==='Accepted Offer').length
  const uc = listings.filter(l=>l.status==='Under Contract').length
  const sold = listings.filter(l=>l.status==='Sold').length
  const totalVol = listings.reduce((s,l)=>s+l.price,0)
  const totalSpend = listings.reduce((s,l)=>s+tSpent(l),0)

  // Show listing detail if selected
  if(selectedListing) return (
    <ListingDetail
      listingId={selectedListing}
      onBack={()=>setSelectedListing(null)}
    />
  )

  return (
    <div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[
          ['Active',active,'#16A34A'],
          ['Accepted Offer',ao,'#D97706'],
          ['Under Contract',uc,'#2563EB'],
          ['Sold',sold,'#CC2200'],
          ['Total Volume',fmt$(totalVol),'var(--purple)'],
          ['Ad Spend',fmt$(totalSpend),'#E8650A'],
        ].map(([label,val,color])=>(
          <div key={label} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'13px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{label}</div>
            <div style={{fontSize:'20px',fontWeight:900,color}}>{val}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search listings..."
            style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px 12px',outline:'none',width:'180px',fontFamily:'Inter,system-ui,sans-serif'}}
            onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>

          {/* Status filter tabs */}
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['active','Active'],['contract','In Contract'],['sold','Sold/Past'],['all','All']].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterStatus(k)}
                style={{padding:'5px 11px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:filterStatus===k?'var(--panel)':'transparent',color:filterStatus===k?'var(--text)':'var(--muted)',boxShadow:filterStatus===k?'0 1px 3px rgba(0,0,0,.08)':'none'}}>
                {l}
              </button>
            ))}
          </div>

          {isAdmin && (
            <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)}
              style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'7px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
              <option value="">All Agents</option>
              {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          )}

          <span style={{color:'var(--muted)',fontSize:'12px'}}>{filtered.length} listings</span>
        </div>

        <div style={{display:'flex',gap:'7px'}}>
          {/* View toggle */}
          <div style={{display:'flex',background:'var(--dim)',borderRadius:'8px',padding:'3px',gap:'2px'}}>
            {[['board','Board'],['list','List'],['grid','Grid']].map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)}
                style={{padding:'5px 11px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',background:view===k?'var(--panel)':'transparent',color:view===k?'var(--text)':'var(--muted)'}}>
                {l}
              </button>
            ))}
          </div>
          <Btn variant="ghost" size="sm" onClick={()=>exportListings(filtered)}>Export CSV</Btn>
          <Btn variant="ghost" size="sm" onClick={()=>setShowBulk(true)}>⬆ Import</Btn>
          <Btn size="sm" onClick={()=>setEditListing({id:'new',addr:'',city:'',state:'NY',zip:'',price:'',type:'Condo',beds:'',baths:'',sqft:'',tax:'',status:'Active',agents:[],days:0,lock:'',mls:'',budget:2000,sellerName:'',spend:[],showings:[],notes:''})}>+ New Listing</Btn>
        </div>
      </div>

      {/* Board View — grouped by status */}
      {view==='board' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:'14px'}}>
          {STATUSES.filter(s => {
            if(filterStatus==='active') return ['Active','Accepted Offer','Coming Soon'].includes(s)
            if(filterStatus==='contract') return ['Under Contract'].includes(s)
            if(filterStatus==='sold') return ['Sold','Expired','Withdrawn'].includes(s)
            return true
          }).map(status => {
            const col = filtered.filter(l=>l.status===status)
            if(col.length===0 && filterStatus!=='all') return null
            return (
              <div key={status}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'9px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
                    <div style={{width:9,height:9,borderRadius:'50%',background:STATUS_COLOR[status]||'#94A3B8'}}/>
                    <span style={{fontSize:'12px',fontWeight:700}}>{status}</span>
                    <span style={{background:(STATUS_COLOR[status]||'#94A3B8')+'18',color:STATUS_COLOR[status]||'#94A3B8',fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px'}}>{col.length}</span>
                  </div>
                  <span style={{fontSize:'10px',color:'var(--muted)'}}>{fmt$(col.reduce((s,l)=>s+l.price,0))}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {col.length===0
                    ? <div style={{background:'var(--panel)',border:'1px dashed var(--border)',borderRadius:'10px',padding:'16px',textAlign:'center',color:'var(--muted)',fontSize:'11px'}}>No listings</div>
                    : col.map(l=><ListingCard key={l.id} listing={l} onSelect={setSelected}/>)
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List View */}
      {view==='list' && (
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 70px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
            <div>Address</div><div>Type</div><div>Price</div><div>Beds/Ba</div><div>Agent</div><div>Days</div><div>Status</div><div></div>
          </div>
          {filtered.map(l=>(
            <div key={l.id} onClick={()=>setSelected(l)}
              style={{display:'grid',gridTemplateColumns:'2.5fr 1fr 1fr 1fr 1fr 1fr 1fr 70px',padding:'11px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',cursor:'pointer'}}
              onClick={()=>setSelectedListing(l.id)} onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} style={{...rowStyle, cursor:'pointer'}}>
              <div>
                <div style={{fontSize:'13px',fontWeight:700}}>{l.addr}</div>
                <div style={{fontSize:'10px',color:'var(--muted)'}}>{l.city}, {l.state}{l.lock?' · 🔒'+l.lock:''}</div>
              </div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{l.type}</div>
              <div style={{fontSize:'13px',fontWeight:700}}>{fmt$(l.price)}</div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{l.beds||'—'}bd · {l.baths||'—'}ba</div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{l.agents[0]?.split(' ').slice(-1)[0]||'—'}</div>
              <div style={{fontSize:'11px',color:l.days>90?'#DC2626':l.days>60?'#D97706':'var(--muted)',fontWeight:l.days>90?700:400}}>{l.days}d</div>
              <div><span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:(STATUS_COLOR[l.status]||'#94A3B8')+'18',color:STATUS_COLOR[l.status]||'#94A3B8'}}>{l.status}</span></div>
              <div style={{display:'flex',gap:'4px'}} onClick={e=>e.stopPropagation()}>
                <button onClick={()=>setEditListing({...l})} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'10px',padding:'4px 7px',cursor:'pointer'}}>✏</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Grid View */}
      {view==='grid' && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(265px,1fr))',gap:'14px'}}>
          {filtered.map(l=><ListingCard key={l.id} listing={l} onSelect={setSelected}/>)}
        </div>
      )}

      {/* Detail */}
      {selected && <ListingDetail listing={selected} onClose={()=>setSelected(null)} onEdit={()=>{setEditListing({...selected});setSelected(null)}} onChange={u=>updateListing(u.id,u)}/>}

      {/* Edit */}
      {editListing && <ListingEditModal listing={editListing} onClose={()=>setEditListing(null)} onSave={updated=>{
        if(updated.id==='new'){
          const n={...updated,id:'l'+Date.now(),price:parseFloat(updated.price)||0,days:0,spend:[],showings:[],notes:updated.notes||''}
          setListings(prev=>[n,...prev])
          logChange({recordType:'listing',recordId:n.id,recordName:n.addr+', '+n.city,action:'Created',agentName:currentAgent?.name||'Admin'})
        } else {
          const orig = listings.find(l=>l.id===updated.id)
          logFieldChanges({recordType:'listing',recordId:updated.id,recordName:updated.addr+', '+updated.city,before:orig,after:updated,agentName:currentAgent?.name||'Admin'})
          updateListing(updated.id, updated)
        }
        setEditListing(null)
      }}/>}

      {/* Bulk */}
      {showBulk && <BulkUpload board="listings" onClose={()=>setShowBulk(false)} onImport={async rows=>{
        const nl=rows.map(r=>({...r,id:'l'+Date.now()+Math.random().toString(36).slice(2,5),price:parseFloat((r.price||'0').replace(/[^0-9.]/g,''))||0,days:0,budget:2000,spend:[],showings:[],notes:'',agents:r.agents?[r.agents]:[],state:r.state||'NY'}))
        setListings(prev=>[...nl,...prev]); return {imported:nl.length,errors:0,updated:0,errorDetails:[]}
      }}/>}
    </div>
  )
}

function ListingCard({ listing:l, onSelect }) {
  const spent = tSpent(l)
  const pct = Math.min(spent/(l.budget||1)*100,100)
  const color = STATUS_COLOR[l.status]||'#94A3B8'
  const ag = l.agents.map(n=>n.split(' ').slice(-1)[0]).join(', ')
  return (
    <div onClick={()=>onSelect(l)} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',overflow:'hidden',cursor:'pointer',boxShadow:'0 1px 3px rgba(0,0,0,.04)',transition:'border-color .12s'}}
      onMouseEnter={e=>e.currentTarget.style.borderColor='#CC2200'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      <div style={{height:6,background:color}}/>
      <div style={{padding:'13px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
          <div style={{fontSize:'13px',fontWeight:800,flex:1,marginRight:'8px'}}>{l.addr}</div>
          <span style={{fontSize:'9px',fontWeight:700,padding:'2px 7px',borderRadius:'20px',background:color+'18',color,flexShrink:0}}>{l.status}</span>
        </div>
        <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'8px'}}>{l.city}, {l.state} · {l.type}</div>
        <div style={{fontSize:'22px',fontWeight:900,marginBottom:'9px'}}>{fmt$(l.price)}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'4px',marginBottom:'9px'}}>
          {[['Bed',l.beds||'—'],['Bath',l.baths||'—'],['Sqft',l.sqft||'—'],['Days',l.days]].map(([k,v])=>(
            <div key={k} style={{background:'var(--dim)',borderRadius:'6px',padding:'5px',textAlign:'center'}}>
              <div style={{fontSize:'8px',color:'var(--muted)',fontWeight:700}}>{k}</div>
              <div style={{fontSize:'10px',fontWeight:700}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
          <span style={{fontSize:'10px',color:'var(--muted)'}}>{ag}</span>
          {l.lock && <span style={{fontSize:'10px',color:'var(--muted)'}}>🔒 {l.lock}</span>}
        </div>
        {/* Ad spend bar */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px'}}>
            <span style={{fontSize:'9px',color:'var(--muted)'}}>Ad spend</span>
            <span style={{fontSize:'9px',color:pct>90?'#DC2626':pct>70?'#D97706':'var(--muted)'}}>${spent}/${l.budget}</span>
          </div>
          <div style={{background:'var(--dim)',borderRadius:'99px',height:4,overflow:'hidden'}}>
            <div style={{background:pct>90?'#DC2626':pct>70?'#D97706':'#16A34A',borderRadius:'99px',height:4,width:pct+'%',transition:'width .5s'}}/>
          </div>
        </div>
      </div>
    </div>
  )
}

function ListingDetail({ listing:l, onClose, onEdit, onChange }) {
  const [tab, setTab] = useState('details')
  const [listing, setListing] = useState({...l})
  const [localActivity, setLocalActivity] = useState([{action:'Created',field_name:'Listing',agent_name:'System',new_value:l.addr+', '+l.city,created_at:new Date(Date.now()-l.days*86400000).toISOString()}])
  const [newSpend, setNewSpend] = useState({c:ADSPEND[0],a:'',d:new Date().toISOString().split('T')[0]})
  const [newShowing, setNewShowing] = useState({buyer:'',date:'',agent:'',interest:'Hot',feedback:''})
  const [newNote, setNewNote] = useState('')

  const spent = tSpent(listing)
  const remaining = listing.budget - spent
  const pct = Math.min(spent/(listing.budget||1)*100,100)

  function addLocal(action,field,oldVal,newVal){
    setLocalActivity(prev=>[{action,field_name:field,old_value:oldVal?String(oldVal):null,new_value:newVal?String(newVal):null,agent_name:'Admin',created_at:new Date().toISOString()},...prev])
  }
  function changeStatus(s){const old=listing.status;const u={...listing,status:s};setListing(u);onChange(u);addLocal('Status Changed','Status',old,s);logChange({recordType:'listing',recordId:listing.id,recordName:listing.addr,action:'Status Changed',field:'status',oldValue:old,newValue:s,agentName:'Admin'})}
  function addSpend(){if(!newSpend.a)return;const u={...listing,spend:[...listing.spend,{c:newSpend.c,a:parseFloat(newSpend.a),d:newSpend.d}]};setListing(u);onChange(u);addLocal('Spend Added',newSpend.c,null,'$'+newSpend.a);logChange({recordType:'listing',recordId:listing.id,recordName:listing.addr,action:'Spend Added',field:'spend',oldValue:null,newValue:newSpend.c+' $'+newSpend.a,agentName:'Admin'});setNewSpend(n=>({...n,a:''}))}
  function addShowing(){if(!newShowing.buyer)return;const u={...listing,showings:[...(listing.showings||[]),{...newShowing}]};setListing(u);onChange(u);addLocal('Showing Logged','Showing',null,newShowing.buyer+' — '+newShowing.interest);logChange({recordType:'listing',recordId:listing.id,recordName:listing.addr,action:'Showing Logged',field:'showing',oldValue:null,newValue:newShowing.buyer,agentName:'Admin'});setNewShowing({buyer:'',date:'',agent:'',interest:'Hot',feedback:''})}
  function addNote(){if(!newNote.trim())return;addLocal('Note Added','Note',null,newNote.trim());logChange({recordType:'listing',recordId:listing.id,recordName:listing.addr,action:'Note Added',agentName:'Admin',extra:newNote.trim()});setNewNote('')}

  const TABS = [['details','📋 Details'],['spend','💰 Ad Spend'],['showings','👁 Showings'],['notes','📝 Notes'],['activity','📊 Activity Log']]

  return (
    <Modal onClose={onClose} maxWidth={700}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',paddingBottom:'14px',borderBottom:'1px solid var(--border)'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:900}}>{listing.addr}</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{listing.city}, {listing.state} {listing.zip} · {listing.type}</div>
          <div style={{fontSize:'28px',fontWeight:900,color:'#CC2200',marginTop:'4px'}}>{fmt$(listing.price)}</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <select value={listing.status} onChange={e=>changeStatus(e.target.value)} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:STATUS_COLOR[listing.status]||'var(--text)',fontSize:'12px',fontWeight:700,padding:'7px 10px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
          <Btn size="sm" variant="ghost" onClick={onEdit}>✏️ Edit</Btn>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',color:'var(--muted)'}}>✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:'16px',overflowX:'auto'}}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 14px',background:'transparent',border:'none',fontFamily:'Inter,system-ui,sans-serif',fontSize:'12px',fontWeight:600,cursor:'pointer',color:tab===k?'#CC2200':'var(--muted)',borderBottom:tab===k?'2px solid #CC2200':'2px solid transparent',whiteSpace:'nowrap'}}>{l}</button>
        ))}
      </div>

      <div style={{maxHeight:'440px',overflowY:'auto'}}>
        {tab==='details' && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              {[['Beds',listing.beds||'—'],['Baths',listing.baths||'—'],['Sqft',listing.sqft||'—'],['Tax',listing.tax||'New Home'],['Lockbox',listing.lock||'N/A'],['Days Listed',listing.days],['Seller',listing.sellerName||'—'],['Agent(s)',listing.agents.join(', ')||'—'],['ZIP',listing.zip||'—']].map(([k,v])=>(
                <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'10px'}}>
                  <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'2px'}}>{k}</div>
                  <div style={{fontSize:'13px',fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:'7px',flexWrap:'wrap'}}>
              {listing.mls && <a href={listing.mls} target="_blank" rel="noreferrer"><Btn size="sm" variant="ghost">View on MLS ↗</Btn></a>}
              <Btn size="sm" variant="ghost" onClick={()=>{const msg=`${listing.addr}, ${listing.city} ${listing.state}\n${listing.type} · ${listing.beds||'—'}bd · ${listing.baths||'—'}ba\n${fmt$(listing.price)}\nCall: 845.424.1014`;navigator.clipboard?.writeText(msg).then(()=>alert('Copied!')).catch(()=>{})}}>Share</Btn>
            </div>
          </>
        )}

        {tab==='spend' && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'12px'}}>
              {[['Spent','$'+spent,pct>90?'#DC2626':'var(--text)'],['Budget','$'+listing.budget,'var(--text)'],['Remaining','$'+remaining,remaining<0?'#DC2626':'#16A34A']].map(([k,v,c])=>(
                <div key={k} style={{background:'var(--dim)',borderRadius:'9px',padding:'12px',textAlign:'center'}}>
                  <div style={{color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',marginBottom:'3px'}}>{k}</div>
                  <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:'var(--dim)',borderRadius:'99px',height:8,marginBottom:'14px',overflow:'hidden'}}>
              <div style={{background:pct>90?'#DC2626':pct>70?'#D97706':'#16A34A',borderRadius:'99px',height:8,width:pct+'%',transition:'width .5s'}}/>
            </div>
            <div style={{display:'flex',gap:'7px',marginBottom:'13px',flexWrap:'wrap'}}>
              <select value={newSpend.c} onChange={e=>setNewSpend(s=>({...s,c:e.target.value,a:ADSPEND_PRICES[e.target.value]||s.a}))} style={{flex:2,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif',minWidth:'120px'}}>
                {ADSPEND.map(a=><option key={a}>{a}</option>)}
              </select>
              <input type="number" placeholder="$" value={newSpend.a} onChange={e=>setNewSpend(s=>({...s,a:e.target.value}))} style={{width:'80px',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
              <input type="date" value={newSpend.d} onChange={e=>setNewSpend(s=>({...s,d:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none'}}/>
              <Btn onClick={addSpend}>Add</Btn>
            </div>
            {listing.spend.length===0 ? <div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'16px'}}>No spend logged yet</div>
            : listing.spend.map((s,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)',fontSize:'13px'}}>
                <span style={{fontWeight:600}}>{s.c}</span>
                <span style={{color:'var(--muted)',fontSize:'11px'}}>{s.d}</span>
                <span style={{fontWeight:800}}>${s.a}</span>
              </div>
            ))}
          </>
        )}

        {tab==='showings' && (
          <>
            <div style={{background:'var(--dim)',borderRadius:'10px',padding:'14px',marginBottom:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,marginBottom:'10px'}}>Log Showing</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <input placeholder="Buyer name *" value={newShowing.buyer} onChange={e=>setNewShowing(s=>({...s,buyer:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
                <input type="date" value={newShowing.date} onChange={e=>setNewShowing(s=>({...s,date:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none'}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <select value={newShowing.agent} onChange={e=>setNewShowing(s=>({...s,agent:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none'}}>
                  <option value="">Agent who showed</option>
                  {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                <select value={newShowing.interest} onChange={e=>setNewShowing(s=>({...s,interest:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none'}}>
                  {['Hot','Warm','Cold','No Interest'].map(x=><option key={x}>{x}</option>)}
                </select>
                <input placeholder="Feedback..." value={newShowing.feedback} onChange={e=>setNewShowing(s=>({...s,feedback:e.target.value}))} style={{background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',padding:'8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
              </div>
              <Btn onClick={addShowing}>Log Showing</Btn>
            </div>
            {/* Showing stats */}
            {listing.showings.length>0 && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'8px',marginBottom:'12px'}}>
                {[['Total',listing.showings.length],['Hot',listing.showings.filter(s=>s.interest==='Hot').length],['Warm',listing.showings.filter(s=>s.interest==='Warm').length],['Cold',listing.showings.filter(s=>['Cold','No Interest'].includes(s.interest)).length]].map(([k,v])=>(
                  <div key={k} style={{background:'var(--dim)',borderRadius:'8px',padding:'9px',textAlign:'center'}}>
                    <div style={{fontSize:'10px',color:'var(--muted)',fontWeight:700,marginBottom:'2px'}}>{k}</div>
                    <div style={{fontSize:'18px',fontWeight:900}}>{v}</div>
                  </div>
                ))}
              </div>
            )}
            {listing.showings.length===0
              ? <div style={{color:'var(--muted)',fontSize:'12px',textAlign:'center',padding:'20px'}}>No showings logged yet</div>
              : listing.showings.map((s,i)=>(
                <div key={i} style={{background:'var(--dim)',borderRadius:'9px',padding:'11px',marginBottom:'8px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:'3px'}}>
                    <span style={{fontSize:'13px',fontWeight:700}}>{s.buyer}</span>
                    <span style={{fontSize:'11px',fontWeight:600,padding:'2px 8px',borderRadius:'20px',background:s.interest==='Hot'?'#FEF2F2':s.interest==='Warm'?'#FFFBEB':'var(--dim)',color:s.interest==='Hot'?'#DC2626':s.interest==='Warm'?'#D97706':'var(--muted)'}}>{s.interest}</span>
                  </div>
                  <div style={{fontSize:'11px',color:'var(--muted)'}}>{s.date}{s.agent?' · Shown by '+s.agent:''}</div>
                  {s.feedback&&<div style={{fontSize:'12px',marginTop:'5px',color:'var(--text)'}}>{s.feedback}</div>}
                </div>
              ))
            }
          </>
        )}

        {tab==='notes' && (
          <>
            <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
              <input value={newNote} onChange={e=>setNewNote(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addNote()}
                placeholder="Add a note about this listing..."
                style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 13px',outline:'none'}}
                onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <Btn onClick={addNote}>Save</Btn>
            </div>
            {listing.notes && <div style={{background:'var(--dim)',borderRadius:'9px',padding:'12px',fontSize:'13px',lineHeight:1.7}}>{listing.notes}</div>}
          </>
        )}

        {tab==='activity' && (
          <RecordActivityFeed recordType="listing" recordId={listing.id} localEntries={localActivity}/>
        )}
      </div>
    </Modal>
  )
}

function ListingEditModal({ listing, onClose, onSave }) {
  const [form, setForm] = useState({...listing, price: listing.price||'', budget: listing.budget||2000})
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const isNew = listing.id === 'new'
  return (
    <Modal onClose={onClose} maxWidth={600}>
      <ModalTitle onClose={onClose}>{isNew?'New Listing':'Edit — '+form.addr}</ModalTitle>
      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Property Details</div>
      <Input label="Address *" value={form.addr} onChange={e=>set('addr',e.target.value)} placeholder="47 Prairie Ave"/>
      <Grid3 gap={10}><Input label="City" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="Suffern"/><Input label="State" value={form.state} onChange={e=>set('state',e.target.value)} placeholder="NY"/><Input label="ZIP" value={form.zip} onChange={e=>set('zip',e.target.value)} placeholder="10901"/></Grid3>
      <Grid2 gap={10}>
        <Input label="List Price ($)" value={form.price} onChange={e=>set('price',e.target.value)} type="number" placeholder="599000"/>
        <Select label="Property Type" value={form.type} onChange={e=>set('type',e.target.value)} options={PTYPES}/>
      </Grid2>
      <Grid3 gap={10}>
        <Input label="Bedrooms" value={form.beds} onChange={e=>set('beds',e.target.value)} placeholder="4"/>
        <Input label="Bathrooms" value={form.baths} onChange={e=>set('baths',e.target.value)} placeholder="2"/>
        <Input label="Sqft" value={form.sqft} onChange={e=>set('sqft',e.target.value)} placeholder="1,568"/>
      </Grid3>
      <Grid2 gap={10}><Input label="Tax/Year" value={form.tax} onChange={e=>set('tax',e.target.value)} placeholder="$13,377/yr"/><Input label="Lockbox Code" value={form.lock||''} onChange={e=>set('lock',e.target.value)} placeholder="1234"/></Grid2>
      <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',margin:'10px 0 8px'}}>Listing Info</div>
      <Grid2 gap={10}>
        <Select label="Status" value={form.status} onChange={e=>set('status',e.target.value)} options={STATUSES}/>
        <Select label="Agent" value={form.agents?.[0]||''} onChange={e=>set('agents',[e.target.value])} options={[{value:'',label:'Select agent...'},...AGENTS.map(a=>({value:a.name,label:a.name}))]}/>
      </Grid2>
      <Grid2 gap={10}><Input label="Seller Name" value={form.sellerName||''} onChange={e=>set('sellerName',e.target.value)} placeholder="John Smith"/><Input label="Ad Budget ($)" value={form.budget} onChange={e=>set('budget',parseFloat(e.target.value)||0)} type="number"/></Grid2>
      <Grid2 gap={10}><Input label="MLS Link" value={form.mls||''} onChange={e=>set('mls',e.target.value)} placeholder="https://..."/><Input label="Days Listed" value={form.days} onChange={e=>set('days',parseInt(e.target.value)||0)} type="number"/></Grid2>
      <Input label="Notes" value={form.notes||''} onChange={e=>set('notes',e.target.value)} rows={2} placeholder="Notes about this listing..."/>
      <div style={{display:'flex',gap:'8px',justifyContent:'flex-end',marginTop:'12px'}}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={()=>onSave(form)}>{isNew?'Create Listing':'Save Changes'}</Btn>
      </div>
    </Modal>
  )
}

function exportListings(listings) {
  const h = 'Address,City,State,Price,Type,Beds,Baths,Sqft,Tax,Status,Agent,Days,Lockbox,MLS\n'
  const r = listings.map(l=>`"${l.addr}","${l.city}","${l.state}","${l.price}","${l.type}","${l.beds}","${l.baths}","${l.sqft}","${l.tax}","${l.status}","${l.agents.join('/')}","${l.days}","${l.lock}","${l.mls}"`)
  const b = new Blob([h+r.join('\n')],{type:'text/csv'})
  const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='listings.csv'; a.click()
}
