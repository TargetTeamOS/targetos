import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useAgents } from '../lib/hooks'
import { getSigns, createSign, updateSign, deleteSign } from '../lib/db'
import { fmtDate } from '../lib/utils'

const TYPES = ['For Sale','Under Contract','Sold','Open House','Coming Soon']
const EMPTY = { addr:'', type:'For Sale', agent_id:'', installed:'', removed:'', notes:'' }

export function Signs() {
  const { agent } = useAuth()
  const { toast } = useApp()
  const { agents } = useAgents()
  const [signs, setSigns]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    getSigns().then(setSigns).catch(e=>toast(e.message,'#DC2626')).finally(()=>setLoading(false))
  }, [])

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function handleAdd() {
    if(!form.addr.trim()) { toast('Address required','#DC2626'); return }
    setSaving(true)
    try {
      const d = await createSign({ ...form, agent_id: form.agent_id||agent?.id })
      setSigns(p=>[d,...p]); setShowAdd(false); setForm(EMPTY); toast('✅ Sign added!')
    } catch(e) { toast('Error: '+e.message,'#DC2626') }
    finally { setSaving(false) }
  }

  async function markRemoved(id) {
    try {
      const d = await updateSign(id, { removed: new Date().toISOString().split('T')[0] })
      setSigns(p=>p.map(s=>s.id===id?d:s)); toast('Marked removed')
    } catch(e) { toast(e.message,'#DC2626') }
  }

  const active   = signs.filter(s=>!s.removed)
  const removed  = signs.filter(s=>s.removed)

  return (
    <div>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'8px' }}>
        <div>
          <div style={{ fontSize:'18px',fontWeight:900 }}>🪧 Signs</div>
          <div style={{ fontSize:'12px',color:'var(--muted)',marginTop:'2px' }}>{active.length} active · {removed.length} removed</div>
        </div>
        <button onClick={()=>setShowAdd(true)} style={btn}>+ Add Sign</button>
      </div>

      {loading && <div style={{ padding:'28px',textAlign:'center',color:'var(--muted)' }}>Loading...</div>}

      {active.length>0&&<div style={{ fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'8px' }}>Active ({active.length})</div>}
      {active.map(s=>(
        <div key={s.id} style={{ background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'13px 16px',marginBottom:'8px',display:'flex',alignItems:'center',gap:'12px' }}>
          <div style={{ width:38,height:38,borderRadius:'9px',background:'rgba(204,34,0,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0 }}>🪧</div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:'13px',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{s.addr}</div>
            <div style={{ fontSize:'11px',color:'var(--muted)',marginTop:'2px' }}>
              <span style={{ fontWeight:600,color:'#CC2200' }}>{s.type}</span>
              {s.installed&&<span> · Installed {fmtDate(s.installed)}</span>}
              {agents.find(a=>a.id===s.agent_id)&&<span> · {agents.find(a=>a.id===s.agent_id).name.split(' ')[0]}</span>}
            </div>
          </div>
          <div style={{ display:'flex',gap:'6px',flexShrink:0 }}>
            <button onClick={()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.addr)}`,'_blank')}
              style={{ fontSize:'11px',fontWeight:600,padding:'5px 10px',borderRadius:'7px',border:'1px solid var(--border)',background:'var(--dim)',color:'var(--text)',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
              🗺 Directions
            </button>
            <button onClick={()=>markRemoved(s.id)}
              style={{ fontSize:'11px',fontWeight:600,padding:'5px 10px',borderRadius:'7px',border:'1px solid var(--border)',background:'var(--dim)',color:'var(--muted)',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>
              Remove
            </button>
          </div>
        </div>
      ))}

      {!loading&&signs.length===0&&<div style={{ padding:'48px',textAlign:'center',color:'var(--muted)',background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'14px' }}><div style={{ fontSize:'28px',marginBottom:'10px' }}>🪧</div>No signs yet</div>}

      {showAdd&&(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px' }} onClick={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}>
          <div style={{ background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px' }}>
              <div style={{ fontSize:'16px',fontWeight:800 }}>Add Sign</div>
              <button onClick={()=>setShowAdd(false)} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'20px' }}>✕</button>
            </div>
            <F label="Address *" value={form.addr} onChange={v=>set('addr',v)} ph="47 Prairie Ave"/>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px' }}>
              <div><label style={lbl}>Type</label><select value={form.type} onChange={e=>set('type',e.target.value)} style={{ ...inp,display:'block' }}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={lbl}>Agent</label><select value={form.agent_id} onChange={e=>set('agent_id',e.target.value)} style={{ ...inp,display:'block' }}><option value="">Select...</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            </div>
            <F label="Install Date" value={form.installed} onChange={v=>set('installed',v)} type="date"/>
            <div style={{ display:'flex',gap:'8px',marginTop:'12px' }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{ flex:2,background:'#CC2200',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:saving?.7:1 }}>{saving?'Adding…':'Add Sign'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function F({ label, value, onChange, ph='', type='text' }) {
  return <div style={{ marginBottom:'10px' }}>{label&&<label style={lbl}>{label}</label>}<input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={ph} style={inp}/></div>
}
const inp = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'8px 10px',outline:'none',boxSizing:'border-box' }
const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const btn = { background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'12px',fontWeight:700,padding:'9px 15px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif' }
