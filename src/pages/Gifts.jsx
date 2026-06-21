import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGifts } from '../lib/hooks/useGifts'
import { useAgents } from '../lib/hooks/useAgents'
import { useApp } from '../context/AppContext'
import { fmtDate, fmt$ } from '../lib/utils/format'

const GIFT_TYPES = ['Under Contract','Closing']
const STATUSES   = ['Pending','Shipped out','Delivered','Couldn\'t Deliver','Too Late','Please deliver','Don\'t send','Check Note']
const LABELS     = ['Home Owner','Investor','Seller']
const STATUS_COLORS = { Pending:'#D97706','Shipped out':'#0EA5E9',Delivered:'#16A34A','Couldn\'t Deliver':'#DC2626','Too Late':'#EF4444','Please deliver':'#94A3B8','Don\'t send':'#333','Check Note':'#579bfc' }

const EMPTY = { type:'Under Contract', client_name:'', address:'', unit:'', phone:'', status:'Pending', label:'Home Owner', contract_date:'', sending_date:'', closing_gift_status:'', tracking_number:'', amount:'', vendor:'', notes:'' }

export function Gifts() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const { gifts, loading, add, update, remove } = useGifts()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [filterType, setFT]   = useState('')

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleSave() {
    if(!form.client_name.trim()) { toast('Client name required','#DC2626'); return }
    setSaving(true)
    try {
      await add({ ...form, agent_id: agent?.id, amount: parseFloat(form.amount)||null })
      toast('✅ Gift added!'); setShowAdd(false); setForm(EMPTY)
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    try { await update(id, { status }); toast(`→ ${status}`) }
    catch(e) { toast('Error: '+e.message,'#DC2626') }
  }

  const filtered = filterType ? gifts.filter(g=>g.type===filterType) : gifts
  const pending   = gifts.filter(g=>g.status==='Pending').length
  const delivered = gifts.filter(g=>g.status==='Delivered').length

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>🎁 Gifts</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>{pending} pending · {delivered} delivered</div>
        </div>
        <div style={{ display:'flex',gap:'7px' }}>
          {GIFT_TYPES.map(t=>(
            <button key={t} onClick={()=>setFT(f=>f===t?'':t)}
              style={{ fontSize:'11px',fontWeight:700,padding:'6px 13px',borderRadius:'20px',border:`1.5px solid ${filterType===t?'#CC2200':'var(--border)'}`,background:filterType===t?'rgba(204,34,0,.1)':'transparent',color:filterType===t?'#CC2200':'var(--muted)',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
              {t} ({gifts.filter(g=>g.type===t).length})
            </button>
          ))}
          <button onClick={()=>setShowAdd(true)} style={btnStyle}>+ Add Gift</button>
        </div>
      </div>

      {loading && <Loader/>}
      {!loading && filtered.length===0 && <Empty icon="🎁" text="No gifts yet"/>}

      {filtered.map(g=>(
        <div key={g.id} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'14px 16px',marginBottom:'8px',display:'flex',alignItems:'center',gap:'12px' }}>
          <div style={{ width:38,height:38,borderRadius:'9px',background:g.type==='Closing'?'rgba(22,163,74,.1)':'rgba(245,158,11,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0 }}>
            {g.type==='Closing'?'🏠':'📝'}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:'13px',fontWeight:700 }}>{g.client_name}</div>
            <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>
              {g.address&&<span>{g.address} · </span>}{g.vendor&&<span>{g.vendor} · </span>}
              {g.amount&&<span>{fmt$(g.amount)} · </span>}
              <span style={{ color:STATUS_COLORS[g.status]||'#94A3B8',fontWeight:600 }}>{g.status}</span>
            </div>
          </div>
          <div style={{ display:'flex',gap:'6px',alignItems:'center',flexShrink:0 }}>
            <select value={g.status} onChange={e=>updateStatus(g.id,e.target.value)}
              style={{ background:(STATUS_COLORS[g.status]||'#94A3B8')+'15',border:`1.5px solid ${(STATUS_COLORS[g.status]||'#94A3B8')}40`,borderRadius:'7px',color:STATUS_COLORS[g.status]||'#94A3B8',fontSize:'11px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'5px 8px',outline:'none',cursor:'pointer' }}>
              {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={async()=>{if(!confirm('Delete?'))return;try{await remove(g.id);toast('Deleted')}catch(e){toast(e.message,'#DC2626')}}}
              style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px' }}>🗑</button>
          </div>
        </div>
      ))}

      {showAdd && (
        <Modal title="Add Gift" onClose={()=>setShowAdd(false)}>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
            <F label="Type" value={form.type} onChange={v=>set('type',v)} options={GIFT_TYPES}/>
            <F label="Status" value={form.status} onChange={v=>set('status',v)} options={STATUSES}/>
          </div>
          <F label="Client Name *" value={form.client_name} onChange={v=>set('client_name',v)} ph="John Smith"/>
          <F label="Property Address" value={form.address} onChange={v=>set('address',v)} ph="47 Prairie Ave"/>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
            <F label="Phone" value={form.phone} onChange={v=>set('phone',v)} ph="(845) 555-1234"/>
            <F label="Amount $" value={form.amount} onChange={v=>set('amount',v)} type="number" ph="150"/>
          </div>
          <F label="Vendor / Description" value={form.vendor} onChange={v=>set('vendor',v)} ph="Kosher gift basket"/>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
            <F label="Contract Date" value={form.contract_date} onChange={v=>set('contract_date',v)} type="date"/>
            <F label="Sending Date" value={form.sending_date} onChange={v=>set('sending_date',v)} type="date"/>
          </div>
          <F label="Tracking #" value={form.tracking_number} onChange={v=>set('tracking_number',v)} ph="1Z999AA10123456784"/>
          <ModalActions onCancel={()=>setShowAdd(false)} onSave={handleSave} saving={saving} label="Add Gift"/>
        </Modal>
      )}
    </div>
  )
}

function F({ label, value, onChange, ph='', type='text', options }) {
  return (
    <div style={{ marginBottom:'10px' }}>
      <label style={lbl}>{label}</label>
      {options
        ? <select value={value||''} onChange={e=>onChange(e.target.value)} style={inp}>{options.map(o=><option key={o}>{o}</option>)}</select>
        : <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/>
      }
    </div>
  )
}
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'440px',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px' }}>
          <div style={{ fontSize:'16px',fontWeight:800 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function ModalActions({ onCancel, onSave, saving, label }) {
  return (
    <div style={{ display:'flex',gap:'8px',marginTop:'12px' }}>
      <button onClick={onCancel} style={{ flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ flex:2,...btnObj,opacity:saving?.7:1 }}>{saving?'Saving…':label}</button>
    </div>
  )
}
function Loader() { return <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'13px' }}>Loading...</div> }
function Empty({ icon, text }) { return <div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}><div style={{ fontSize:'32px',marginBottom:'10px' }}>{icon}</div>{text}</div> }

const inp     = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const lbl     = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
const btnObj   = { background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
