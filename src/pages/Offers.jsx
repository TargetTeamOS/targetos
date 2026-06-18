import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const STATUSES = ['Pending','Accepted','Countered','Rejected','Expired']
const STATUS_COLORS = { Pending:'#D97706',Accepted:'#16A34A',Countered:'#0EA5E9',Rejected:'#DC2626',Expired:'#94A3B8' }
const FINANCING = ['Conventional','Cash','FHA','VA','USDA','Hard Money','Owner Finance']

const fmt$ = n => '$' + Number(n||0).toLocaleString()

export function Offers() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ listing_addr:'', buyer_name:'', agent_name:'', amount:'', down_payment:'', financing:'Conventional', status:'Pending', submitted_at:'', expiry:'', notes:'' })

  useEffect(() => { loadOffers() }, [])

  async function loadOffers() {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('offers').select('*').order('created_at',{ascending:false})
      if(error) throw error
      setOffers(data || [])
    } catch(e) {
      console.log('Offers table not ready:', e.message)
      setOffers([])
    }
    setLoading(false)
  }

  async function saveOffer() {
    if(!form.listing_addr.trim()||!form.amount) { toast('Address and amount are required','#DC2626'); return }
    const payload = {
      listing_addr: form.listing_addr.trim(),
      buyer_name: form.buyer_name,
      agent_name: form.agent_name || state.currentAgent?.name,
      amount: parseFloat(String(form.amount).replace(/[^0-9.]/g,'')),
      down_payment: parseFloat(String(form.down_payment).replace(/[^0-9.]/g,''))||0,
      financing: form.financing,
      status: form.status,
      submitted_at: form.submitted_at || new Date().toISOString().split('T')[0],
      expiry: form.expiry||null,
      notes: form.notes,
      created_by: state.user?.id,
    }
    if(editing) {
      const { error } = await supabase.from('offers').update(payload).eq('id',editing)
      if(error) { toast('Save failed: '+error.message,'#DC2626'); return }
      toast('Offer updated!')
    } else {
      const { error } = await supabase.from('offers').insert([payload])
      if(error) { toast('Save failed: '+error.message,'#DC2626'); return }
      toast('✅ Offer logged!')
    }
    setShowAdd(false); setEditing(null); resetForm(); loadOffers()
  }

  async function updateStatus(id, status) {
    await supabase.from('offers').update({ status }).eq('id',id)
    toast(`Offer ${status.toLowerCase()}`)
    loadOffers()
    if(status==='Accepted') toast('🎉 Offer accepted! Consider updating the listing status.')
  }

  async function deleteOffer(id) {
    const o = offers.find(x=>x.id===id)
    confirm({ title:'Delete Offer?', message:`Delete offer on "${o?.listing_addr}"?`, confirmLabel:'Delete', onConfirm:async()=>{
      await supabase.from('offers').delete().eq('id',id)
      toast('Offer deleted'); loadOffers()
    }})
  }

  function openEdit(offer) {
    setForm({ listing_addr:offer.listing_addr||'', buyer_name:offer.buyer_name||'', agent_name:offer.agent_name||'', amount:offer.amount||'', down_payment:offer.down_payment||'', financing:offer.financing||'Conventional', status:offer.status||'Pending', submitted_at:offer.submitted_at||'', expiry:offer.expiry||'', notes:offer.notes||'' })
    setEditing(offer.id); setShowAdd(true)
  }

  function resetForm() {
    setForm({ listing_addr:'', buyer_name:'', agent_name:state.currentAgent?.name||'', amount:'', down_payment:'', financing:'Conventional', status:'Pending', submitted_at:'', expiry:'', notes:'' })
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const pending = offers.filter(o=>o.status==='Pending')
  const accepted = offers.filter(o=>o.status==='Accepted')

  return (
    <div>
      <ConfirmDialog/>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[['Total Offers',offers.length,'#CC2200'],['Pending',pending.length,'#D97706'],['Accepted',accepted.length,'#16A34A'],['Total Volume',offers.reduce((s,o)=>s+(o.amount||0),0),'#7C3AED']].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'20px',fontWeight:900,color:c}}>{typeof v==='number'&&v>999?fmt$(v):v}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px'}}>
        <Btn size="sm" onClick={()=>{resetForm();setShowAdd(true)}}>+ Log Offer</Btn>
      </div>

      <Card>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr 120px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
          <div>Property</div><div>Buyer / Agent</div><div>Amount</div><div>Financing</div><div>Status</div><div>Actions</div>
        </div>
        {loading && <div style={{padding:'30px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Loading...</div>}
        {!loading && offers.length===0 && <div style={{padding:'30px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No offers yet — click "+ Log Offer" to add one</div>}
        {offers.map(o=>(
          <div key={o.id} style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr 120px',padding:'12px 16px',borderBottom:'1px solid var(--border)',alignItems:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700}}>{o.listing_addr}</div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>Submitted: {o.submitted_at||'—'}{o.expiry?' · Expires: '+o.expiry:''}</div>
            </div>
            <div>
              <div style={{fontSize:'12px',fontWeight:600}}>{o.buyer_name||'—'}</div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{o.agent_name||'—'}</div>
            </div>
            <div style={{fontSize:'13px',fontWeight:700,color:'#D97706'}}>{fmt$(o.amount)}</div>
            <div style={{fontSize:'11px',color:'var(--muted)'}}>{o.financing}</div>
            <div>
              <select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}
                style={{background:STATUS_COLORS[o.status]+'15',border:'1.5px solid '+STATUS_COLORS[o.status]+'40',borderRadius:'7px',color:STATUS_COLORS[o.status],fontSize:'11px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'5px 8px',outline:'none',cursor:'pointer'}}>
                {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:'5px'}}>
              <button onClick={()=>openEdit(o)} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'5px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>✏</button>
              <button onClick={()=>deleteOffer(o.id)} style={{background:'rgba(220,38,38,.06)',border:'1px solid rgba(220,38,38,.2)',borderRadius:'6px',color:'#DC2626',fontSize:'11px',padding:'5px 9px',cursor:'pointer'}}>🗑</button>
            </div>
          </div>
        ))}
      </Card>

      {/* Add/Edit modal */}
      {showAdd&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget){setShowAdd(false);setEditing(null)}}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>{editing?'Edit Offer':'Log Offer'}</div>
              <button onClick={()=>{setShowAdd(false);setEditing(null)}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px',lineHeight:1}}>✕</button>
            </div>
            <FI label="Property Address" value={form.listing_addr} onChange={v=>set('listing_addr',v)} ph="47 Prairie Ave, Suffern NY"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Buyer Name" value={form.buyer_name} onChange={v=>set('buyer_name',v)} ph="John Smith"/>
              <div style={{marginBottom:'12px'}}>
                <label style={lblStyle}>Agent</label>
                <select value={form.agent_name} onChange={e=>set('agent_name',e.target.value)} style={selStyle}>
                  {AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Offer Amount" value={form.amount} onChange={v=>set('amount',v)} ph="$599,000" type="number"/>
              <FI label="Down Payment" value={form.down_payment} onChange={v=>set('down_payment',v)} ph="$119,800" type="number"/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <div style={{marginBottom:'12px'}}>
                <label style={lblStyle}>Financing</label>
                <select value={form.financing} onChange={e=>set('financing',e.target.value)} style={selStyle}>
                  {FINANCING.map(f=><option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={{marginBottom:'12px'}}>
                <label style={lblStyle}>Status</label>
                <select value={form.status} onChange={e=>set('status',e.target.value)} style={selStyle}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Submitted Date" value={form.submitted_at} onChange={v=>set('submitted_at',v)} type="date"/>
              <FI label="Expiry Date" value={form.expiry} onChange={v=>set('expiry',v)} type="date"/>
            </div>
            <FI label="Notes" value={form.notes} onChange={v=>set('notes',v)} ph="Additional notes..." rows={2}/>
            <div style={{display:'flex',gap:'8px',marginTop:'4px'}}>
              <Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditing(null)}} style={{flex:1}}>Cancel</Btn>
              <Btn onClick={saveOffer} style={{flex:2}}>{editing?'Save Changes':'Log Offer'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text', rows }) {
  return (
    <div style={{marginBottom:'12px'}}>
      <label style={lblStyle}>{label}</label>
      {rows ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{...selStyle,resize:'vertical',lineHeight:1.6}}/> : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={selStyle}/>}
    </div>
  )
}
const lblStyle = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const selStyle = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
