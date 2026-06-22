import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks/useAgents'
import { getOffers, createOffer, updateOffer, deleteOffer } from '../lib/db/offers'
import { fmt$, fmtDate } from '../lib/utils/format'
import { useEffect } from 'react'

const STATUSES = ['Sent','AO','Stuck','Fell through']
const SIDES = ['Buyer','Listing']
const STATUS_COLORS = { Sent:'#D97706', AO:'#16A34A', Stuck:'#DC2626', 'Fell through':'#94A3B8' }
const EMPTY = { listing_addr:'', buyer_name:'', production:'', gci:'', side:'Buyer', status:'Sent', submitted_at:'', expiry:'', agent_id:'', notes:'' }

export function Offers() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const [offers, setOffers]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState('')

  useEffect(() => {
    getOffers().then(setOffers).catch(e=>toast(e.message,'#DC2626')).finally(()=>setLoading(false))
  }, [])

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleAdd() {
    if(!form.listing_addr.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      const d = await createOffer({ ...form, agent_id: form.agent_id||agent?.id, production: parseFloat(form.production)||0, gci: parseFloat(form.gci)||0 })
      setOffers(p=>[d,...p]); setShowAdd(false); setForm(EMPTY); toast('✅ Offer added!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function updateStatus(id, status) {
    try {
      const d = await updateOffer(id, { status })
      setOffers(p=>p.map(o=>o.id===id?d:o)); toast(`→ ${status}`)
    } catch(e) { toast(e.message,'#DC2626') }
  }

  const filtered = filter ? offers.filter(o=>o.status===filter) : offers
  const byAgent = {}
  agents.forEach(a=>{ byAgent[a.id] = [...(byAgent[a.id]||[]), ...filtered.filter(o=>o.agent_id===a.id)] })

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>📝 Offers</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>{offers.length} total · {offers.filter(o=>o.status==='AO').length} accepted</div>
        </div>
        <div style={{ display:'flex',gap:'6px',flexWrap:'wrap' }}>
          {['','Sent','AO','Stuck','Fell through'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)}
              style={{ fontSize:'11px',fontWeight:700,padding:'6px 12px',borderRadius:'20px',border:`1.5px solid ${filter===s?'#CC2200':'var(--border)'}`,background:filter===s?'rgba(204,34,0,.1)':'transparent',color:filter===s?'#CC2200':'var(--muted)',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
              {s||'All'} {s&&`(${offers.filter(o=>o.status===s).length})`}
            </button>
          ))}
          <button onClick={()=>setShowAdd(true)} style={btnStyle}>+ Add Offer</button>
        </div>
      </div>

      {loading && <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      {/* Group by agent */}
      {agents.filter(a=>byAgent[a.id]?.length>0).map(a=>(
        <div key={a.id} style={{ marginBottom:'16px' }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px' }}>
            <div style={{ width:24,height:24,borderRadius:'50%',background:a.color,flexShrink:0 }}/>
            <div style={{ fontSize:'13px',fontWeight:700 }}>{a.name}</div>
            <div style={{ fontSize:'11px',color:'var(--muted)' }}>({byAgent[a.id].length} offers)</div>
          </div>
          {byAgent[a.id].map(o=>(
            <div key={o.id} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderLeft:`4px solid ${STATUS_COLORS[o.status]||'#CC2200'}`,borderRadius:'12px',padding:'13px 16px',marginBottom:'7px',display:'flex',alignItems:'center',gap:'12px' }}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:'13px',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{o.listing_addr}</div>
                <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>
                  {o.buyer_name&&<span>{o.buyer_name} · </span>}
                  {o.production&&<span>{fmt$(o.production)} · </span>}
                  {o.submitted_at&&<span>Submitted {fmtDate(o.submitted_at)}</span>}
                </div>
              </div>
              <div style={{ display:'flex',gap:'6px',alignItems:'center',flexShrink:0 }}>
                <select value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}
                  style={{ background:(STATUS_COLORS[o.status]||'#94A3B8')+'15',border:`1.5px solid ${(STATUS_COLORS[o.status]||'#94A3B8')}40`,borderRadius:'7px',color:STATUS_COLORS[o.status]||'#94A3B8',fontSize:'11px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'5px 8px',outline:'none',cursor:'pointer' }}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
                <button onClick={async()=>{if(!confirm('Delete?'))return;try{await deleteOffer(o.id);setOffers(p=>p.filter(x=>x.id!==o.id));toast('Deleted')}catch(e2){toast(e2.message,'#DC2626')}}}
                  style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:'13px' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {!loading&&filtered.length===0&&<div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}><div style={{ fontSize:'28px',marginBottom:'10px' }}>📝</div>No offers yet</div>}

      {showAdd&&(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>Add Offer</div>
              <button onClick={()=>setShowAdd(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
            </div>
            <F label="Listing Address *" value={form.listing_addr} onChange={v=>set('listing_addr',v)} ph="47 Prairie Ave"/>
            <F label="Buyer Name" value={form.buyer_name} onChange={v=>set('buyer_name',v)} ph="John Smith"/>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px' }}>
              <div><label style={lbl}>Agent</label><select value={form.agent_id} onChange={e=>set('agent_id',e.target.value)} style={{ ...inp,display:'block' }}><option value="">Select...</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div><label style={lbl}>Side</label><select value={form.side} onChange={e=>set('side',e.target.value)} style={{ ...inp,display:'block' }}>{SIDES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>Status</label><select value={form.status} onChange={e=>set('status',e.target.value)} style={{ ...inp,display:'block' }}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <F label="Production $" value={form.production} onChange={v=>set('production',v)} type="number" ph="599000"/>
              <F label="GCI $"        value={form.gci}        onChange={v=>set('gci',v)}        type="number" ph="17970"/>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <F label="Submitted" value={form.submitted_at} onChange={v=>set('submitted_at',v)} type="date"/>
              <F label="Expiry"    value={form.expiry}       onChange={v=>set('expiry',v)}       type="date"/>
            </div>
            <div style={{ display:'flex',gap:'8px',marginTop:'12px' }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{ flex:2,background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:saving?.7:1 }}>{saving?'Adding…':'Add Offer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{ marginBottom:'10px' }}>
      {label&&<label style={lbl}>{label}</label>}
      <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/>
    </div>
  )
}

const inp      = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const lbl      = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const btnStyle = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
