import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { Card, CardHeader, Btn } from '../components/UI'
import { useConfirm } from '../components/ConfirmDialog'
import { AGENTS } from '../lib/constants'

const GMAPS_KEY = 'AIzaSyDPvAMfd7OoW5eCx1ILkDtCE8Fs4fwZIDw'
const SIGN_TYPES = ['For Sale','Under Contract','Sold','Coming Soon','Open House','Directional']
const SIGN_COLORS = {'For Sale':'#CC2200','Under Contract':'#2563EB','Sold':'#16A34A','Coming Soon':'#7C3AED','Open House':'#D97706','Directional':'#64748B'}

export function Signs() {
  const { state, toast } = useApp()
  const { confirm, ConfirmDialog } = useConfirm()
  const [signs, setSigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('')
  const [view, setView] = useState('list')
  const [form, setForm] = useState({ addr:'', type:'For Sale', agent_name:'', installed:new Date().toISOString().split('T')[0] })

  useEffect(() => {
    // Create signs table if needed, then load
    loadSigns()
  }, [])

  async function loadSigns() {
    setLoading(true)
    try {
      const { data } = await supabase.from('signs').select('*').order('installed', { ascending: false })
      setSigns(data || [])
    } catch(e) {
      // signs table might not exist yet
      setSigns([])
    }
    setLoading(false)
  }

  async function addSign() {
    if(!form.addr.trim()) { toast('Address required','#DC2626'); return }
    const { error } = await supabase.from('signs').insert([{
      addr: form.addr.trim(),
      type: form.type,
      agent_name: form.agent_name || state.currentAgent?.name,
      installed: form.installed || new Date().toISOString().split('T')[0],
    }])
    if(error) { toast('Failed: '+error.message,'#DC2626'); return }
    toast('✅ Sign added!')
    setForm({ addr:'', type:'For Sale', agent_name:'', installed:new Date().toISOString().split('T')[0] })
    setShowAdd(false)
    loadSigns()
  }

  async function deleteSign(id) {
    const s = signs.find(x=>x.id===id)
    confirm({ title:'Remove Sign?', message:`Remove sign at "${s?.addr}"?`, confirmLabel:'Remove', onConfirm: async () => {
      await supabase.from('signs').delete().eq('id', id)
      toast('Sign removed'); loadSigns()
    }})
  }

  async function updateType(id, type) {
    await supabase.from('signs').update({ type }).eq('id', id)
    setSigns(prev => prev.map(s => s.id===id ? {...s,type} : s))
  }

  const filtered = filter ? signs.filter(s=>s.type===filter) : signs
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  return (
    <div>
      <ConfirmDialog/>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
        {['For Sale','Under Contract','Sold','Open House'].map(type=>(
          <div key={type} style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'12px',padding:'13px'}}>
            <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'5px'}}>{type}</div>
            <div style={{fontSize:'24px',fontWeight:900,color:SIGN_COLORS[type]}}>{signs.filter(s=>s.type===type).length}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
          <button onClick={()=>setFilter('')} style={{padding:'6px 12px',borderRadius:'20px',border:'1.5px solid '+(filter===''?'#CC2200':'var(--border)'),background:filter===''?'rgba(204,34,0,.1)':'transparent',color:filter===''?'#CC2200':'var(--muted)',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>All ({signs.length})</button>
          {SIGN_TYPES.map(t=>(
            <button key={t} onClick={()=>setFilter(t===filter?'':t)} style={{padding:'6px 12px',borderRadius:'20px',border:'1.5px solid '+(filter===t?(SIGN_COLORS[t]||'#CC2200'):'var(--border)'),background:filter===t?(SIGN_COLORS[t]||'#CC2200')+'15':'transparent',color:filter===t?(SIGN_COLORS[t]||'#CC2200'):'var(--muted)',fontSize:'11px',fontWeight:700,cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              {t} ({signs.filter(s=>s.type===t).length})
            </button>
          ))}
        </div>
        <Btn size="sm" onClick={()=>setShowAdd(true)}>+ Add Sign</Btn>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card style={{marginBottom:'12px',padding:'16px'}}>
          <div style={{fontSize:'13px',fontWeight:700,marginBottom:'12px'}}>Add Sign</div>
          <FI label="Property Address" value={form.addr} onChange={v=>set('addr',v)} ph="47 Prairie Ave, Suffern NY"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'10px'}}>
            <div><label style={lbl}>Type</label><select value={form.type} onChange={e=>set('type',e.target.value)} style={sel}>{SIGN_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label style={lbl}>Agent</label><select value={form.agent_name} onChange={e=>set('agent_name',e.target.value)} style={sel}><option value="">Select...</option>{AGENTS.map(a=><option key={a.id} value={a.name}>{a.name}</option>)}</select></div>
            <FI label="Install Date" value={form.installed} onChange={v=>set('installed',v)} type="date"/>
          </div>
          <div style={{display:'flex',gap:'7px',justifyContent:'flex-end'}}>
            <Btn variant="ghost" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn size="sm" onClick={addSign}>Add Sign</Btn>
          </div>
        </Card>
      )}

      {/* Signs list */}
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 100px',padding:'9px 16px',borderBottom:'1px solid var(--border)',color:'var(--muted)',fontSize:'10px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px'}}>
          <div>Address</div><div>Type</div><div>Agent</div><div>Installed</div><div>Actions</div>
        </div>
        {loading && <div style={{padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'12px'}}>Loading...</div>}
        {!loading && filtered.length === 0 && <div style={{padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>No signs recorded yet</div>}
        {filtered.map(sign=>(
          <div key={sign.id} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 100px',padding:'12px 16px',borderBottom:'1px solid var(--border)',alignItems:'center'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{fontSize:'13px',fontWeight:700}}>{sign.addr}</div>
            <div>
              <select value={sign.type} onChange={e=>updateType(sign.id,e.target.value)}
                style={{background:(SIGN_COLORS[sign.type]||'#CC2200')+'15',border:'1.5px solid '+(SIGN_COLORS[sign.type]||'#CC2200')+'40',borderRadius:'7px',color:SIGN_COLORS[sign.type]||'#CC2200',fontSize:'10px',fontWeight:700,fontFamily:'Inter,system-ui,sans-serif',padding:'4px 7px',outline:'none',cursor:'pointer'}}>
                {SIGN_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{fontSize:'12px',color:'var(--muted)'}}>{sign.agent_name?.split(' ').slice(-1)[0]||'—'}</div>
            <div style={{fontSize:'11px',color:'var(--muted)'}}>{sign.installed}</div>
            <div style={{display:'flex',gap:'5px'}}>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sign.addr)}&travelmode=driving`} target="_blank" rel="noreferrer">
                <button style={{background:'rgba(14,165,233,.1)',border:'1px solid rgba(14,165,233,.25)',borderRadius:'6px',color:'#0EA5E9',fontSize:'11px',fontWeight:700,padding:'5px 8px',cursor:'pointer'}}>🗺</button>
              </a>
              <button onClick={()=>deleteSign(sign.id)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',color:'#DC2626',fontSize:'13px',padding:'4px 7px',cursor:'pointer'}}>🗑</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

function FI({ label, value, onChange, ph='', type='text' }) {
  return (
    <div style={{marginBottom:'10px'}}>
      <label style={lbl}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} style={sel}/>
    </div>
  )
}
const lbl = { display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px' }
const sel = { width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 11px',outline:'none',boxSizing:'border-box' }
