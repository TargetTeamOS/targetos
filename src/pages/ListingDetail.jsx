import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { Btn, Card } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const fmt$ = n => '$' + Number(n||0).toLocaleString()

const CTC_STAGES = ['Offer Accapted','Under Shtar','Under Contract','Inspection scheduled','Mortgage process','Appraisal ordered','Conditional Approval','Clear to close','Closing scheduled','Closed']
const INTEREST_LEVELS = ['Hot','Warm','Cold','Just Looking','No Interest']
const INTEREST_COLORS = { Hot:'#DC2626', Warm:'#D97706', Cold:'#0EA5E9', 'Just Looking':'#94A3B8', 'No Interest':'#CBD5E1' }

export function ListingDetail({ listingId, onBack }) {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [listing, setListing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [editing, setEditing] = useState({})
  const [showAddShowing, setShowAddShowing] = useState(false)
  const [showAddInterest, setShowAddInterest] = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)

  // Showing form
  const [showingForm, setShowingForm] = useState({ date:'', agent_name:'', buyer_count:1, interest:'Warm', notes:'' })
  // Interest form
  const [interestForm, setInterestForm] = useState({ type:'buyer', name:'', phone:'', email:'', agent_name:'', interest:'Warm', notes:'' })
  // Expense form
  const [expenseForm, setExpenseForm] = useState({ item:'', amount:'', date:'', vendor:'' })

  useEffect(() => { loadListing() }, [listingId])

  async function loadListing() {
    setLoading(true)
    const { data, error } = await supabase.from('listings').select('*').eq('id', listingId).single()
    if(data) {
      // Parse JSON fields
      data.showings = data.showings || []
      data.spend = data.spend || []
      data.interests = data.interests || []
      data.notes_log = data.notes_log || []
      setListing(data)
    }
    setLoading(false)
  }

  async function saveField(field, value) {
    const { error } = await supabase.from('listings').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', listingId)
    if(error) { toast('Save failed: '+error.message, '#DC2626'); return }
    setListing(l => ({ ...l, [field]: value }))
    setEditing(e => ({ ...e, [field]: false }))
    toast('✅ Saved!')
  }

  async function addShowing() {
    if(!showingForm.date) { toast('Date required', '#DC2626'); return }
    const newShowing = {
      id: 'sh'+Date.now(),
      date: showingForm.date,
      agent_name: showingForm.agent_name || 'Unknown Agent',
      buyer_count: parseInt(showingForm.buyer_count) || 1,
      interest: showingForm.interest,
      notes: showingForm.notes,
      logged_at: new Date().toISOString(),
      logged_by: agent?.name || 'Admin',
    }
    const updatedShowings = [...(listing.showings||[]), newShowing]
    await saveField('showings', updatedShowings)
    setShowingForm({ date:'', agent_name:'', buyer_count:1, interest:'Warm', notes:'' })
    setShowAddShowing(false)
    toast('✅ Showing added!')
  }

  async function updateShowingBuyerCount(showingId, delta) {
    const updatedShowings = listing.showings.map(s =>
      s.id === showingId ? { ...s, buyer_count: Math.max(1, (s.buyer_count||1) + delta) } : s
    )
    await saveField('showings', updatedShowings)
  }

  async function deleteShowing(showingId) {
    confirm({ title:'Delete Showing?', message:'Remove this showing record?', confirmLabel:'Delete', onConfirm: async () => {
      const updatedShowings = listing.showings.filter(s => s.id !== showingId)
      await saveField('showings', updatedShowings)
      toast('Showing deleted')
    }})
  }

  async function addInterest() {
    const newInterest = {
      id: 'int'+Date.now(),
      type: interestForm.type,
      name: interestForm.name || 'Unknown',
      phone: interestForm.phone,
      email: interestForm.email,
      agent_name: interestForm.agent_name,
      interest: interestForm.interest,
      notes: interestForm.notes,
      date: new Date().toISOString().split('T')[0],
    }
    const updatedInterests = [...(listing.interests||[]), newInterest]
    await saveField('interests', updatedInterests)
    setInterestForm({ type:'buyer', name:'', phone:'', email:'', agent_name:'', interest:'Warm', notes:'' })
    setShowAddInterest(false)
    toast('✅ Interest recorded!')
  }

  async function addExpense() {
    if(!expenseForm.item||!expenseForm.amount) { toast('Item and amount required','#DC2626'); return }
    const newExpense = {
      id: 'exp'+Date.now(),
      item: expenseForm.item,
      amount: parseFloat(expenseForm.amount),
      date: expenseForm.date || new Date().toISOString().split('T')[0],
      vendor: expenseForm.vendor,
    }
    const updatedSpend = [...(listing.spend||[]), newExpense]
    await saveField('spend', updatedSpend)
    setExpenseForm({ item:'', amount:'', date:'', vendor:'' })
    setShowAddExpense(false)
    toast('✅ Expense added!')
  }

  async function deleteExpense(id) {
    const updatedSpend = listing.spend.filter(s => s.id !== id)
    await saveField('spend', updatedSpend)
  }

  async function deleteInterest(id) {
    const updated = listing.interests.filter(i => i.id !== id)
    await saveField('interests', updated)
  }

  if(loading) return <div style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>Loading listing...</div>
  if(!listing) return <div style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>Listing not found</div>

  const totalSpend = (listing.spend||[]).reduce((s,e) => s+(e.amount||0), 0)
  const showings = listing.showings || []
  const interests = listing.interests || []
  const totalBuyers = showings.reduce((s,sh) => s+(sh.buyer_count||1), 0)
  const hotInterests = interests.filter(i => i.interest==='Hot')
  const generalInterests = interests.filter(i => i.type==='general')
  const viewedInterests = interests.filter(i => i.type==='buyer')
  const agentShowings = interests.filter(i => i.type==='agent')

  // Group agent showings by agent
  const agentGroups = {}
  showings.forEach(s => {
    const key = s.agent_name || 'Unknown'
    if(!agentGroups[key]) agentGroups[key] = []
    agentGroups[key].push(s)
  })

  const TABS = ['overview','showings','interest','expenses','notes']

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:'14px',minHeight:'calc(100vh - 120px)'}}>
      <ConfirmDialog/>

      {/* LEFT — Main content */}
      <div>
        {/* Back + header */}
        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px',flexWrap:'wrap'}}>
          <button onClick={onBack} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'7px 13px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>← Back</button>
          <div style={{flex:1}}>
            <div style={{fontSize:'18px',fontWeight:900}}>{listing.addr}</div>
            <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>{listing.city||''}{listing.city?', ':''}{listing.state||'NY'} {listing.zip||''} · MLS: {listing.mls||'—'}</div>
          </div>
          <div style={{display:'flex',gap:'7px',flexWrap:'wrap'}}>
            <StatusBadge status={listing.status}/>
          </div>
        </div>

        {/* Key stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px',marginBottom:'14px'}}>
          {[
            ['Price', fmt$(listing.price), '#CC2200'],
            ['Beds', listing.beds||'—', '#0EA5E9'],
            ['Baths', listing.baths||'—', '#0EA5E9'],
            ['Sqft', listing.sqft||'—', '#7C3AED'],
            ['DOM', (listing.days||0)+' days', listing.days>60?'#DC2626':listing.days>30?'#D97706':'#16A34A'],
          ].map(([k,v,c])=>(
            <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px',textAlign:'center'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>{k}</div>
              <div style={{fontSize:'18px',fontWeight:900,color:c}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:'2px',background:'var(--dim)',borderRadius:'10px',padding:'3px',marginBottom:'14px'}}>
          {TABS.map(tab=>(
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{flex:1,padding:'8px 4px',borderRadius:'8px',border:'none',cursor:'pointer',fontSize:'11px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',textTransform:'capitalize',background:activeTab===tab?'var(--panel)':'transparent',color:activeTab===tab?'var(--text)':'var(--muted)',transition:'all .15s'}}>
              {tab==='showings'?`Showings (${showings.length})`:tab==='interest'?`Interest (${interests.length})`:tab==='expenses'?`Expenses (${(listing.spend||[]).length})`:tab}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab==='overview' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
              {/* Editable fields */}
              {[
                ['Price','price','number'],['Type','type','text'],['Beds','beds','text'],['Baths','baths','text'],
                ['Sqft','sqft','text'],['Tax','tax','text'],['Lock Code','lock_code','text'],['MLS#','mls','text'],
                ['Seller Name','seller_name','text'],['City','city','text'],
              ].map(([label,field,type])=>(
                <div key={field} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'5px'}}>{label}</div>
                  {editing[field] ? (
                    <div style={{display:'flex',gap:'5px'}}>
                      <input type={type} defaultValue={listing[field]||''} id={`field-${field}`} autoFocus
                        style={{flex:1,background:'var(--inp)',border:'1.5px solid #CC2200',borderRadius:'6px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'6px 8px',outline:'none'}}
                        onKeyDown={e=>e.key==='Enter'&&saveField(field,e.target.value)}/>
                      <button onClick={()=>saveField(field, document.getElementById(`field-${field}`).value)} style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'5px 9px',cursor:'pointer'}}>✓</button>
                      <button onClick={()=>setEditing(e=>({...e,[field]:false}))} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--muted)',fontSize:'11px',padding:'5px 9px',cursor:'pointer'}}>✕</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={()=>setEditing(e=>({...e,[field]:true}))}>
                      <span style={{fontSize:'14px',fontWeight:700,color:field==='price'?'#CC2200':'var(--text)'}}>{field==='price'&&listing[field]?fmt$(listing[field]):listing[field]||'—'}</span>
                      <span style={{fontSize:'10px',color:'var(--muted)'}}>✏</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Status update */}
            <Card style={{padding:'14px',marginBottom:'14px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Update Status</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {['Active','Accepted offer','Under Contract','Off Market','Expired','Temporary off market','Sold'].map(s=>(
                  <button key={s} onClick={()=>saveField('status',s)}
                    style={{padding:'7px 13px',borderRadius:'20px',border:'1.5px solid '+(listing.status===s?'#CC2200':'var(--border)'),background:listing.status===s?'rgba(204,34,0,.1)':'transparent',color:listing.status===s?'#CC2200':'var(--muted)',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',transition:'all .12s'}}>
                    {s}
                  </button>
                ))}
              </div>
            </Card>

            {/* Notes */}
            <Card style={{padding:'14px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Notes</div>
              <textarea defaultValue={listing.notes||''} id="notes-field" rows={4}
                style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'10px 12px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.7}}/>
              <div style={{display:'flex',justifyContent:'flex-end',marginTop:'8px'}}>
                <Btn size="sm" onClick={()=>saveField('notes', document.getElementById('notes-field').value)}>Save Notes</Btn>
              </div>
            </Card>
          </div>
        )}

        {/* SHOWINGS TAB */}
        {activeTab==='showings' && (
          <div>
            {/* Summary */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
              {[
                ['Total Showings', showings.length, '#CC2200'],
                ['Total Buyers', totalBuyers, '#0EA5E9'],
                ['Agents', Object.keys(agentGroups).length, '#7C3AED'],
                ['Hot Leads', hotInterests.length, '#DC2626'],
              ].map(([k,v,c])=>(
                <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px',textAlign:'center'}}>
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>{k}</div>
                  <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Agent groups */}
            {Object.entries(agentGroups).map(([agentName, agentShowingList])=>(
              <div key={agentName} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',marginBottom:'10px',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',background:'var(--dim)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <span style={{fontSize:'13px',fontWeight:700}}>{agentName}</span>
                    <span style={{fontSize:'11px',color:'var(--muted)',marginLeft:'8px'}}>{agentShowingList.length} showing{agentShowingList.length>1?'s':''} · {agentShowingList.reduce((s,sh)=>s+(sh.buyer_count||1),0)} buyer{agentShowingList.reduce((s,sh)=>s+(sh.buyer_count||1),0)>1?'s':''}</span>
                  </div>
                </div>
                {agentShowingList.map(sh=>(
                  <div key={sh.id} style={{padding:'11px 16px',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'12px'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'12px',fontWeight:600}}>{sh.date}</div>
                      {sh.notes&&<div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{sh.notes}</div>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',background:(INTEREST_COLORS[sh.interest]||'#94A3B8')+'18',color:INTEREST_COLORS[sh.interest]||'#94A3B8'}}>{sh.interest}</span>
                      {/* Buyer count stepper */}
                      <div style={{display:'flex',alignItems:'center',gap:'5px',background:'var(--dim)',borderRadius:'8px',padding:'4px 8px'}}>
                        <button onClick={()=>updateShowingBuyerCount(sh.id,-1)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text)',fontSize:'14px',lineHeight:1,padding:'0 3px'}}>−</button>
                        <span style={{fontSize:'13px',fontWeight:700,minWidth:'20px',textAlign:'center'}}>{sh.buyer_count||1}</span>
                        <button onClick={()=>updateShowingBuyerCount(sh.id,1)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text)',fontSize:'14px',lineHeight:1,padding:'0 3px'}}>+</button>
                        <span style={{fontSize:'10px',color:'var(--muted)'}}>buyers</span>
                      </div>
                      <button onClick={()=>deleteShowing(sh.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px'}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {showings.length===0 && <div style={{padding:'32px',textAlign:'center',color:'var(--muted)',fontSize:'13px',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px'}}>No showings recorded yet</div>}

            {/* Add showing */}
            {showAddShowing ? (
              <Card style={{padding:'16px',marginTop:'10px'}}>
                <div style={{fontSize:'13px',fontWeight:700,marginBottom:'12px'}}>Add Showing</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  <FI label="Date" value={showingForm.date} onChange={v=>setShowingForm(f=>({...f,date:v}))} type="date"/>
                  <div>
                    <label style={lblStyle}>Showing Agent</label>
                    <select value={showingForm.agent_name} onChange={e=>setShowingForm(f=>({...f,agent_name:e.target.value}))} style={selStyle}>
                      <option value="">Select agent...</option>
                      {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                      <option value="Outside Agent">Outside Agent</option>
                    </select>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                  <FI label="# of Buyers" value={showingForm.buyer_count} onChange={v=>setShowingForm(f=>({...f,buyer_count:v}))} type="number"/>
                  <div>
                    <label style={lblStyle}>Interest Level</label>
                    <select value={showingForm.interest} onChange={e=>setShowingForm(f=>({...f,interest:e.target.value}))} style={selStyle}>
                      {INTEREST_LEVELS.map(i=><option key={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <FI label="Notes" value={showingForm.notes} onChange={v=>setShowingForm(f=>({...f,notes:v}))} ph="Any feedback from the showing..."/>
                <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
                  <Btn variant="ghost" onClick={()=>setShowAddShowing(false)} style={{flex:1}}>Cancel</Btn>
                  <Btn onClick={addShowing} style={{flex:2}}>Add Showing</Btn>
                </div>
              </Card>
            ) : (
              <button onClick={()=>setShowAddShowing(true)} style={{width:'100%',marginTop:'10px',background:'var(--panel)',border:'2px dashed var(--border)',borderRadius:'12px',padding:'14px',cursor:'pointer',color:'var(--muted)',fontSize:'13px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif',transition:'all .15s'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.color='#CC2200'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--muted)'}}>
                + Add Showing
              </button>
            )}
          </div>
        )}

        {/* INTEREST TAB */}
        {activeTab==='interest' && (
          <div>
            {/* 3 categories */}
            {[
              { label:'🔥 General Interest', type:'general', items:generalInterests, desc:'People who expressed interest without viewing' },
              { label:'👁 Viewed Property', type:'buyer', items:viewedInterests, desc:'Buyers who physically visited the property' },
              { label:'🤝 Agent Showings', type:'agent', items:agentShowings, desc:'Agent showed property to their clients' },
            ].map(cat=>(
              <div key={cat.type} style={{marginBottom:'14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:800}}>{cat.label} ({cat.items.length})</div>
                    <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'1px'}}>{cat.desc}</div>
                  </div>
                  <button onClick={()=>{setInterestForm(f=>({...f,type:cat.type}));setShowAddInterest(cat.type)}}
                    style={{background:'#CC2200',border:'none',borderRadius:'8px',color:'#fff',fontSize:'11px',fontWeight:700,padding:'6px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
                    + Add
                  </button>
                </div>
                {cat.items.length===0
                  ? <div style={{background:'var(--dim)',borderRadius:'10px',padding:'14px',textAlign:'center',fontSize:'12px',color:'var(--muted)'}}>None recorded yet</div>
                  : cat.items.map(i=>(
                    <div key={i.id} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'12px 14px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'12px'}}>
                      <div style={{width:36,height:36,borderRadius:'50%',background:(INTEREST_COLORS[i.interest]||'#94A3B8')+'18',border:'2px solid '+(INTEREST_COLORS[i.interest]||'#94A3B8'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:800,color:INTEREST_COLORS[i.interest]||'#94A3B8',flexShrink:0}}>
                        {i.name?.[0]||'?'}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:700}}>{i.name}</div>
                        <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>
                          {i.phone&&<span>{i.phone} · </span>}
                          {i.agent_name&&<span>Agent: {i.agent_name} · </span>}
                          <span style={{color:INTEREST_COLORS[i.interest]||'#94A3B8',fontWeight:600}}>{i.interest}</span>
                          {i.date&&<span style={{color:'var(--muted)'}}> · {i.date}</span>}
                        </div>
                        {i.notes&&<div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px',fontStyle:'italic'}}>{i.notes}</div>}
                      </div>
                      <div style={{display:'flex',gap:'5px',flexShrink:0}}>
                        {i.phone&&<a href={'tel:'+i.phone.replace(/\D/g,'')} style={{textDecoration:'none'}}><div style={{width:30,height:30,borderRadius:'50%',background:'rgba(16,185,129,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',cursor:'pointer'}}>📞</div></a>}
                        <button onClick={()=>deleteInterest(i.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px'}}>🗑</button>
                      </div>
                    </div>
                  ))
                }
              </div>
            ))}

            {/* Add interest modal */}
            {showAddInterest && (
              <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget)setShowAddInterest(false)}}>
                <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'440px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                    <div style={{fontSize:'15px',fontWeight:800}}>Record Interest</div>
                    <button onClick={()=>setShowAddInterest(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
                  </div>
                  <FI label="Name" value={interestForm.name} onChange={v=>setInterestForm(f=>({...f,name:v}))} ph="John Smith"/>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                    <FI label="Phone" value={interestForm.phone} onChange={v=>setInterestForm(f=>({...f,phone:v}))} ph="(845) 555-1234" type="tel"/>
                    <FI label="Email" value={interestForm.email} onChange={v=>setInterestForm(f=>({...f,email:v}))} ph="john@email.com"/>
                  </div>
                  {showAddInterest==='agent'&&<div style={{marginBottom:'10px'}}><label style={lblStyle}>Showing Agent</label><select value={interestForm.agent_name} onChange={e=>setInterestForm(f=>({...f,agent_name:e.target.value}))} style={selStyle}><option value="">Select...</option>{AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}<option value="Outside Agent">Outside Agent</option></select></div>}
                  <div style={{marginBottom:'10px'}}><label style={lblStyle}>Interest Level</label><select value={interestForm.interest} onChange={e=>setInterestForm(f=>({...f,interest:e.target.value}))} style={selStyle}>{INTEREST_LEVELS.map(i=><option key={i}>{i}</option>)}</select></div>
                  <FI label="Notes" value={interestForm.notes} onChange={v=>setInterestForm(f=>({...f,notes:v}))} ph="Any feedback..."/>
                  <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
                    <Btn variant="ghost" onClick={()=>setShowAddInterest(false)} style={{flex:1}}>Cancel</Btn>
                    <Btn onClick={addInterest} style={{flex:2}}>Save</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXPENSES TAB */}
        {activeTab==='expenses' && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'14px'}}>
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'14px',textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>Total Spent</div>
                <div style={{fontSize:'24px',fontWeight:900,color:'#CC2200'}}>{fmt$(totalSpend)}</div>
              </div>
              <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'10px',padding:'14px',textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:'4px'}}>Ad Budget</div>
                <div style={{fontSize:'24px',fontWeight:900,color:'#16A34A'}}>{fmt$(listing.budget||0)}</div>
              </div>
            </div>

            <Card>
              {(listing.spend||[]).length===0
                ? <div style={{padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No expenses recorded yet</div>
                : (listing.spend||[]).map(e=>(
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',fontWeight:700}}>{e.item}</div>
                      <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{e.vendor&&e.vendor+' · '}{e.date}</div>
                    </div>
                    <div style={{fontSize:'14px',fontWeight:800,color:'#CC2200'}}>{fmt$(e.amount)}</div>
                    <button onClick={()=>deleteExpense(e.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px'}}>🗑</button>
                  </div>
                ))
              }
            </Card>

            {showAddExpense ? (
              <Card style={{padding:'16px',marginTop:'10px'}}>
                <div style={{fontSize:'13px',fontWeight:700,marginBottom:'12px'}}>Add Expense</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
                  <FI label="Item" value={expenseForm.item} onChange={v=>setExpenseForm(f=>({...f,item:v}))} ph="Facebook Ad"/>
                  <FI label="Amount ($)" value={expenseForm.amount} onChange={v=>setExpenseForm(f=>({...f,amount:v}))} type="number" ph="500"/>
                  <FI label="Vendor" value={expenseForm.vendor} onChange={v=>setExpenseForm(f=>({...f,vendor:v}))} ph="Meta Ads"/>
                  <FI label="Date" value={expenseForm.date} onChange={v=>setExpenseForm(f=>({...f,date:v}))} type="date"/>
                </div>
                <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
                  <Btn variant="ghost" onClick={()=>setShowAddExpense(false)} style={{flex:1}}>Cancel</Btn>
                  <Btn onClick={addExpense} style={{flex:2}}>Add Expense</Btn>
                </div>
              </Card>
            ) : (
              <button onClick={()=>setShowAddExpense(true)} style={{width:'100%',marginTop:'10px',background:'var(--panel)',border:'2px dashed var(--border)',borderRadius:'12px',padding:'14px',cursor:'pointer',color:'var(--muted)',fontSize:'13px',fontWeight:600,fontFamily:'Inter,system-ui,sans-serif'}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.color='#CC2200'}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--muted)'}}>
                + Add Expense
              </button>
            )}
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab==='notes' && (
          <Card style={{padding:'16px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'var(--muted)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'.7px'}}>Listing Notes</div>
            <textarea defaultValue={listing.notes||''} id="notes-tab-field" rows={8}
              style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'12px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.8}}/>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'10px'}}>
              <Btn onClick={()=>saveField('notes', document.getElementById('notes-tab-field').value)}>Save Notes</Btn>
            </div>
          </Card>
        )}
      </div>

      {/* RIGHT SIDEBAR */}
      <div>
        {/* Seller Report button */}
        <button onClick={()=>generateSellerReport(listing, showings, interests)}
          style={{width:'100%',background:'linear-gradient(135deg,#1B2B4B,#0F1A2E)',border:'none',borderRadius:'12px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',marginBottom:'10px'}}>
          📊 Generate Seller Report
        </button>

        {/* Quick stats */}
        <Card style={{padding:'14px',marginBottom:'10px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Activity Summary</div>
          {[
            ['Total Showings', showings.length, '#CC2200'],
            ['Total Buyers Shown', totalBuyers, '#0EA5E9'],
            ['General Interests', generalInterests.length, '#7C3AED'],
            ['Hot Leads', hotInterests.length, '#DC2626'],
            ['Ad Spend', fmt$(totalSpend), '#D97706'],
            ['Days on Market', listing.days||0, listing.days>60?'#DC2626':listing.days>30?'#D97706':'#16A34A'],
          ].map(([k,v,c])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'12px',color:'var(--muted)'}}>{k}</span>
              <span style={{fontSize:'13px',fontWeight:800,color:c}}>{v}</span>
            </div>
          ))}
        </Card>

        {/* Agent */}
        <Card style={{padding:'14px',marginBottom:'10px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Listing Agent</div>
          <div style={{fontSize:'13px',fontWeight:700}}>{listing.agent_name||'—'}</div>
          <div style={{marginTop:'8px'}}>
            <label style={lblStyle}>Change Agent</label>
            <select value={listing.agent_name||''} onChange={e=>saveField('agent_name',e.target.value)} style={selStyle}>
              <option value="">Select...</option>
              {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </div>
        </Card>

        {/* Ad Budget */}
        <Card style={{padding:'14px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px'}}>Ad Budget</div>
          <div style={{display:'flex',gap:'7px'}}>
            <input type="number" defaultValue={listing.budget||2000} id="budget-field"
              style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none'}}/>
            <Btn size="sm" onClick={()=>saveField('budget', document.getElementById('budget-field').value)}>Save</Btn>
          </div>
          <div style={{marginTop:'8px',background:'var(--dim)',borderRadius:'99px',height:6,overflow:'hidden'}}>
            <div style={{background:'#CC2200',borderRadius:'99px',height:6,width:Math.min(100,totalSpend/(listing.budget||2000)*100)+'%'}}/>
          </div>
          <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'4px'}}>{fmt$(totalSpend)} of {fmt$(listing.budget||2000)} used</div>
        </Card>
      </div>
    </div>
  )
}

function generateSellerReport(listing, showings, interests) {
  const totalBuyers = showings.reduce((s,sh) => s+(sh.buyer_count||1), 0)
  const html = `
    <html><head><title>Seller Report — ${listing.addr}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#1E293B;}h1{color:#1B2B4B;}table{width:100%;border-collapse:collapse;margin:16px 0;}th{background:#1B2B4B;color:#fff;padding:10px;text-align:left;font-size:12px;}td{padding:10px;border-bottom:1px solid #E2E8F0;font-size:13px;}.stat{display:inline-block;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px 20px;margin:6px;text-align:center;}.stat-val{font-size:24px;font-weight:900;color:#CC2200;}.stat-label{font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;}</style>
    </head><body>
    <h1>Seller Report</h1>
    <h2>${listing.addr}</h2>
    <p>${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
    <hr/>
    <h3>Activity Summary</h3>
    <div>
      <div class="stat"><div class="stat-val">${showings.length}</div><div class="stat-label">Total Showings</div></div>
      <div class="stat"><div class="stat-val">${totalBuyers}</div><div class="stat-label">Buyers Shown</div></div>
      <div class="stat"><div class="stat-val">${interests.filter(i=>i.type==='general').length}</div><div class="stat-label">Inquiries</div></div>
      <div class="stat"><div class="stat-val">${listing.days||0}</div><div class="stat-label">Days on Market</div></div>
    </div>
    ${showings.length>0?`<h3>Showing History</h3><table><tr><th>Date</th><th>Agent</th><th>Buyers</th><th>Interest</th><th>Notes</th></tr>${showings.map(s=>`<tr><td>${s.date}</td><td>${s.agent_name}</td><td>${s.buyer_count||1}</td><td>${s.interest}</td><td>${s.notes||''}</td></tr>`).join('')}</table>`:''}
    <p style="margin-top:40px;color:#94A3B8;font-size:12px;">Prepared by Target Team · Keller Williams Valley Realty · 845.424.1014</p>
    </body></html>`
  const w = window.open('','_blank')
  w.document.write(html)
  w.document.close()
  setTimeout(()=>w.print(), 500)
}

function StatusBadge({ status }) {
  const colors = { Active:'#16A34A','Accepted offer':'#D97706','Under Contract':'#2563EB','Off Market':'#94A3B8',Expired:'#DC2626',Sold:'#7C3AED','Temporary off market':'#F59E0B' }
  const c = colors[status]||'#94A3B8'
  return <span style={{fontSize:'12px',fontWeight:700,padding:'5px 13px',borderRadius:'20px',background:c+'18',color:c,border:'1.5px solid '+c+'30'}}>{status||'Unknown'}</span>
}

function FI({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{marginBottom:'10px'}}>
      <label style={lblStyle}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={selStyle}/>
    </div>
  )
}

const lblStyle = { display:'block', fontSize:'9px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:'4px' }
const selStyle = { width:'100%', background:'var(--inp)', border:'1.5px solid var(--border)', borderRadius:'8px', color:'var(--text)', fontSize:'13px', fontFamily:'Inter,system-ui,sans-serif', padding:'9px 11px', outline:'none', boxSizing:'border-box' }
