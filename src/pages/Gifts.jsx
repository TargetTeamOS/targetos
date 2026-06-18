import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const GIFT_TYPES = ['Under Contract','Closing']
const STATUSES = ['Pending','Ordered','Delivered']
const STATUS_COLORS = { Pending:'#D97706', Ordered:'#0EA5E9', Delivered:'#16A34A' }
const fmt$ = n => '$' + Number(n||0).toLocaleString()

export function Gifts() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [gifts, setGifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ type:'Closing', client_name:'', address:'', agent_name:'', amount:'', vendor:'', status:'Pending', ordered_date:'', delivered_date:'', notes:'' })

  useEffect(() => { loadGifts() }, [])

  async function loadGifts() {
    setLoading(true)
    const { data } = await supabase.from('gifts').select('*').order('created_at', { ascending: false })
    setGifts(data || [])
    setLoading(false)
  }

  async function saveGift() {
    if(!form.client_name.trim()) { toast('Client name required', '#DC2626'); return }
    const payload = {
      type: form.type,
      client_name: form.client_name.trim(),
      address: form.address,
      agent_name: form.agent_name || state.currentAgent?.name,
      amount: parseFloat(String(form.amount).replace(/[^0-9.]/g,'')) || null,
      vendor: form.vendor,
      status: form.status,
      ordered_date: form.ordered_date || null,
      delivered_date: form.delivered_date || null,
      notes: form.notes,
    }
    if(editing) {
      await supabase.from('gifts').update(payload).eq('id', editing)
      toast('Gift updated!')
    } else {
      await supabase.from('gifts').insert([payload])
      toast('✅ Gift added!')
    }
    setShowAdd(false); setEditing(null); resetForm(); loadGifts()
  }

  async function updateStatus(id, status) {
    const update = { status }
    if(status === 'Ordered') update.ordered_date = new Date().toISOString().split('T')[0]
    if(status === 'Delivered') update.delivered_date = new Date().toISOString().split('T')[0]
    await supabase.from('gifts').update(update).eq('id', id)
    toast(`Gift marked as ${status}`)
    loadGifts()
  }

  async function deleteGift(id) {
    const g = gifts.find(x=>x.id===id)
    confirm({ title:'Delete Gift?', message:`Delete gift for "${g?.client_name}"?`, confirmLabel:'Delete', onConfirm: async () => {
      await supabase.from('gifts').delete().eq('id', id)
      toast('Deleted'); loadGifts()
    }})
  }

  function openEdit(g) {
    setForm({ type:g.type||'Closing', client_name:g.client_name||'', address:g.address||'', agent_name:g.agent_name||'', amount:g.amount||'', vendor:g.vendor||'', status:g.status||'Pending', ordered_date:g.ordered_date||'', delivered_date:g.delivered_date||'', notes:g.notes||'' })
    setEditing(g.id); setShowAdd(true)
  }

  function resetForm() {
    setForm({ type:'Closing', client_name:'', address:'', agent_name:state.currentAgent?.name||'', amount:'', vendor:'', status:'Pending', ordered_date:'', delivered_date:'', notes:'' })
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const pending = gifts.filter(g=>g.status==='Pending')
  const ordered = gifts.filter(g=>g.status==='Ordered')

  return (
    <div>
      <ConfirmDialog/>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'16px'}}>
        {[['Total Gifts',gifts.length,'#CC2200'],['Pending',pending.length,'#D97706'],['Ordered',ordered.length,'#0EA5E9'],['Delivered',gifts.filter(g=>g.status==='Delivered').length,'#16A34A']].map(([k,v,c])=>(
          <div key={k} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'5px'}}>{k}</div>
            <div style={{fontSize:'22px',fontWeight:900,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px',gap:'8px'}}>
        <Btn size="sm" variant="ghost" onClick={()=>{resetForm();set('type','Under Contract');setShowAdd(true)}}>+ UC Gift</Btn>
        <Btn size="sm" onClick={()=>{resetForm();set('type','Closing');setShowAdd(true)}}>+ Closing Gift</Btn>
      </div>

      <Card>
        {loading && <div style={{padding:'30px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>Loading...</div>}
        {!loading && gifts.length===0 && <div style={{padding:'40px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No gifts tracked yet</div>}
        {gifts.map(g => (
          <div key={g.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 16px',borderBottom:'1px solid var(--border)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{width:36,height:36,borderRadius:'9px',background:g.type==='Closing'?'rgba(22,163,74,.1)':'rgba(245,158,11,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>
              {g.type==='Closing'?'🏠':'📝'}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'2px',flexWrap:'wrap'}}>
                <span style={{fontSize:'13px',fontWeight:700}}>{g.client_name}</span>
                <span style={{fontSize:'10px',fontWeight:700,padding:'2px 7px',borderRadius:'20px',background:g.type==='Closing'?'rgba(22,163,74,.1)':'rgba(245,158,11,.1)',color:g.type==='Closing'?'#16A34A':'#D97706'}}>{g.type}</span>
              </div>
              <div style={{fontSize:'11px',color:'var(--muted)'}}>{g.address||'No address'} · {g.agent_name||'—'}{g.vendor?' · '+g.vendor:''}{g.amount?' · '+fmt$(g.amount):''}</div>
            </div>
            <div style={{display:'flex',gap:'6px',alignItems:'center',flexShrink:0}}>
              <select value={g.status} onChange={e=>updateStatus(g.id,e.target.value)}
                style={{background:STATUS_COLORS[g.status]+'15',border:'1.5px solid '+STATUS_COLORS[g.status]+'40',borderRadius:'7px',color:STATUS_COLORS[g.status],fontSize:'11px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'5px 8px',outline:'none',cursor:'pointer'}}>
                {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={()=>openEdit(g)} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'5px 9px',cursor:'pointer'}}>✏</button>
              <button onClick={()=>deleteGift(g.id)} style={{background:'rgba(220,38,38,.06)',border:'1px solid rgba(220,38,38,.2)',borderRadius:'6px',color:'#DC2626',fontSize:'11px',padding:'5px 9px',cursor:'pointer'}}>🗑</button>
            </div>
          </div>
        ))}
      </Card>

      {showAdd && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget){setShowAdd(false);setEditing(null)}}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'440px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
              <div style={{fontSize:'16px',fontWeight:800}}>{editing?'Edit Gift':'Add Gift'}</div>
              <button onClick={()=>{setShowAdd(false);setEditing(null)}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Gift Type" value={form.type} onChange={v=>set('type',v)} options={GIFT_TYPES}/>
              <FI label="Status" value={form.status} onChange={v=>set('status',v)} options={STATUSES}/>
            </div>
            <FI label="Client Name" value={form.client_name} onChange={v=>set('client_name',v)} ph="John & Sarah Smith"/>
            <FI label="Property Address" value={form.address} onChange={v=>set('address',v)} ph="47 Prairie Ave, Suffern NY"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Agent" value={form.agent_name} onChange={v=>set('agent_name',v)} options={['', ...AGENTS.map(a=>a.name)]}/>
              <FI label="Amount ($)" value={form.amount} onChange={v=>set('amount',v)} ph="150" type="number"/>
            </div>
            <FI label="Vendor / Gift Description" value={form.vendor} onChange={v=>set('vendor',v)} ph="Kosher gift basket — Pomegranate"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <FI label="Ordered Date" value={form.ordered_date} onChange={v=>set('ordered_date',v)} type="date"/>
              <FI label="Delivered Date" value={form.delivered_date} onChange={v=>set('delivered_date',v)} type="date"/>
            </div>
            <FI label="Notes" value={form.notes} onChange={v=>set('notes',v)} ph="Any notes..." rows={2}/>
            <div style={{display:'flex',gap:'8px',marginTop:'4px'}}>
              <Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditing(null)}} style={{flex:1}}>Cancel</Btn>
              <Btn onClick={saveGift} style={{flex:2}}>{editing?'Save':'Add Gift'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text', rows, options }) {
  const style = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
  return (
    <div style={{marginBottom:'12px'}}>
      <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
      {options ? <select value={value} onChange={e=>onChange(e.target.value)} style={style}>{options.map(o=><option key={o} value={o}>{o||'Select...'}</option>)}</select>
      : rows ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={rows} style={{...style,resize:'vertical',lineHeight:1.6}}/>
      : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={style}/>}
    </div>
  )
}
